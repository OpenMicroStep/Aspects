import * as sequelize from 'sequelize';
import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, AComponent} from '@openmicrostep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlBinding, SqlMaker} from './index';
import {SqlInsert, SqlValue, SqlPath, SqlMappedAttribute, SqlMappedObject} from './mapper';


function mapIfExists<I, O>(arr: I[] | undefined, map: (v: I, idx: number) => O) : O[] | undefined {
  return arr ? arr.map(map) : undefined;
}

export type SharedContext = {
  controlCenter: ControlCenter,
  maker: SqlMaker,
  mappers: { [s: string] : SqlMappedObject },
  queries: Map<ObjectSet, SqlQuery>,
  aliases: number
}
export function mapValue(mapper: SqlMappedObject, ctx: { mappers: { [s: string] : SqlMappedObject } }, value, isId: boolean) {
  if (isId) {
    value = mapper.get("_id").toDbKey(mapper.toDbKey(value));
  }
  else if (value instanceof VersionedObject) {
    let name = value.manager().aspect().name;
    let mapper = ctx.mappers[name];
    if (!mapper)
      throw new Error(`cannot find mapper for ${name}`);
    let idattr = mapper.get("_id");
    value = idattr.toDbKey(mapper.toDbKey(value.id()));
  }
  return value;
}
export class SqlQuery {
  mapper?: SqlMappedObject = undefined;
  tables = new Map<string, string>(); // [table, ref]"value"*[table, ref] -> table alias 
  path: { table: string, key: string };
  set: ObjectSet;
  subrequests = new Map<SqlQuery, string>(); // query -> table alias
  from: SqlBinding[] = [];
  fromConditions: SqlBinding[] = [];
  where: SqlBinding[] = [];

  promise: Promise<VersionedObject[]> | undefined = undefined;

  constructor() {}

  nextAlias(ctx: SharedContext): string {
    return `A${ctx.aliases++}`;
  }

  setMapper(on: SqlQuery, mapper: SqlMappedObject | undefined) : SqlQuery {
    if (on.mapper && on.mapper !== mapper) {
      if (this === on)
        throw new Error(`constraints on type collides`);
      on = new SqlQuery();
    }
    on.mapper = mapper;
    return on;
  }

  cstor(ctx: SharedContext) {
    return ctx.controlCenter.aspect(this.mapper!.name)!
  }

  addSubRequest(ctx: SharedContext, set: SqlQuery): string {
    let alias = this.subrequests.get(set);
    if (!alias) {
      this.subrequests.set(set, alias = this.nextAlias(ctx));
      set.joinInto(ctx, this, alias);
    }
    return alias;
  }

  table(ctx: SharedContext, path: SqlPath[]) : string {
    let key = "";
    let ret: string | undefined = "";
    let prev = ctx.maker.column(this.path.table, this.path.key);
    for (let p of path) {
      key += JSON.stringify([p.table, p.key]);
      ret = this.tables.get(key);
      if (!ret) {
        ret = this.nextAlias(ctx);
        this.from.push(ctx.maker.from(p.table, ret));
        this.fromConditions.push(ctx.maker.compare(prev, ConstraintType.Equal, ctx.maker.column(ret, p.key)));
        this.tables.set(key, ret);
      }
      prev = ctx.maker.column(ret, p.value);
      key += JSON.stringify(p.value);
    }
    return ret;
  }

  addConstraint(constraint: SqlBinding) {
    this.where.push(constraint);
  }

  mapValue(ctx: SharedContext, value, isId: boolean) {
    return mapValue(this.mapper!, ctx, value, isId);
  }

  addConstraintOnValue(ctx: SharedContext, attribute: string | undefined, operator: DataSourceInternal.ConstraintOnValueTypes, value: any | any[] | Promise<ObjectSet>) {
    let isId = attribute === "_id";
    value = Array.isArray(value) ? value.map(v => this.mapValue(ctx, v, isId)) : this.mapValue(ctx, value, isId);
    if (operator === ConstraintType.Text && !attribute) {
      let constraints: SqlBinding[] = [];
      this.cstor(ctx).aspect.attributes.forEach(attr => {
        if (attr.type.type === "primitive")
          constraints.push(ctx.maker.op(this.sqlColumn(ctx, attr.name), operator, value));
      });
      this.addConstraint(ctx.maker.or(constraints));
    }
    else {
      this.addConstraint(ctx.maker.op(this.sqlColumn(ctx, attribute), operator, value));
    }
  }

  addConstraintOnColumn(ctx: SharedContext, attribute: string | undefined, operator: DataSourceInternal.ConstraintBetweenColumnsTypes, rightQuery: SqlQuery | undefined, rightAttribute: string | undefined) {
    let rightAlias = rightQuery ? this.addSubRequest(ctx, rightQuery) : this.path.table;
    if (!this.mapper)
      throw new Error(`cannot add operator before mapper is set`);
    rightQuery = rightQuery || this;
    let rsqlattr = rightQuery.mapper!.get(rightAttribute || "_id");
    let rtable = rightQuery.table(ctx, rsqlattr.path);
    let rcolumn = rsqlattr.last().value;
    this.addConstraint(ctx.maker.compare(this.sqlColumn(ctx, attribute), operator, ctx.maker.column(rtable, rcolumn)));
  }

  sqlColumn(ctx: SharedContext, attribute: string | undefined, alias?: string) {
    let lsqlattr = this.mapper!.get(attribute || "_id");
    let table = this.table(ctx, lsqlattr.path);
    let column = lsqlattr.last().value;
    return ctx.maker.column(table, column, alias);
  }

  // BEGIN BUILD
  build(ctx: SharedContext, set: ObjectSet) : SqlQuery {
    let ret = ctx.queries.get(set);
    if (!ret) {
      ret = this;
      ret.set = set;
      set.constraintsOnType.forEach(constraint => ret = ret!.addConstraintOnType(ctx, set, constraint));
      ctx.queries.set(set, ret);
      let attr = ret.mapper!.get("_id");
      ret.path = attr.path[0];
      ret.tables.set(JSON.stringify([ret.path.table, ret.path.key]), ret.path.table);
      ret.from.push(ctx.maker.from(ret.path.table))
      set.constraintsOnValue.forEach(constraint => ret!.addConstraintOnValue(ctx, constraint.attribute, constraint.type, constraint.value));
      set.constraintsBetweenSet.forEach(constraint => ret!.addConstraintBetweenSet(ctx, set, constraint));
    }
    return ret;
  }

  buildSub(ctx: SharedContext, set: ObjectSet) : SqlQuery {
    let sub = new SqlQuery();
    return sub.build({
      controlCenter: ctx.controlCenter,
      aliases: 0,
      maker: ctx.maker,
      mappers: ctx.mappers,
      queries: new Map()
    }, set);
  }

  addConstraintOnType(ctx: SharedContext, set: ObjectSet, constraint: DataSourceInternal.ConstraintOnType) : SqlQuery {
    let ret: SqlQuery = this;
    switch(constraint.type) {
      case ConstraintType.ElementOf:
      case ConstraintType.In: {
        let sub = ret.build(ctx, constraint.value as ObjectSet);
        if (sub !== ret) {
          if ((constraint.value as ObjectSet).name) {
            ret = ret.setMapper(ret, sub.mapper);
            ret.addConstraintOnValue(ctx, undefined, ConstraintType.In, sub);
          }
          else {
            ret.addConstraintOnColumn(ctx, undefined, ConstraintType.Equal, sub, undefined);
          }
        }
        break;
      }
      case ConstraintType.Union:{
        let conditions = ret.where;
        for (let unionSet of constraint.value as ObjectSet[]) {
          ret.where = [];
          let sub = ret.build(ctx, unionSet);
          ret = ret.setMapper(ret, sub.mapper);
          if (sub !== ret)
            ret.addConstraintOnColumn(ctx, undefined, ConstraintType.Equal, sub, undefined);
          conditions.push(ctx.maker.and(ret.where));
        }
        ret.where = [ctx.maker.or(conditions)];
        break;
      }
      case ConstraintType.MemberOf:
      case ConstraintType.InstanceOf: {
        let v: any = constraint.value;
        ret = ret.setMapper(ret, ctx.mappers[v.aspect ? v.aspect.name : v.definition.name]);
        break;
      }
    }
    return ret;
  }

  addConstraintBetweenSet(ctx: SharedContext, set: ObjectSet, constraint: DataSourceInternal.ConstraintBetweenSet) {
    if (constraint.type !== ConstraintType.In && constraint.type !== ConstraintType.NotIn) {
      let sub = this.build(ctx, constraint.oppositeSet(set));
      if (set !== constraint.otherSet) {
        if (sub !== this) {
          // TODO: decide if we do sub or separate request (optimisation)
          this.addConstraintOnColumn(ctx, constraint.myAttribute(set), constraint.type, sub, constraint.oppositeAttribute(set));
        }
        else if (set === constraint.set) {
          this.addConstraintOnColumn(ctx, constraint.myAttribute(set), constraint.type, undefined, constraint.oppositeAttribute(set));
        }
      }
    }
    else if (set !== constraint.otherSet) {
      let sub = this.buildSub(ctx, constraint.otherSet);
      this.addConstraint(ctx.maker.compare_bind({ sql: this.sqlColumn(ctx, constraint.attribute), bind: [] }, constraint.type, sub.sqlSelect(ctx)));
    }
  }

  sqlSelect(ctx: SharedContext) : SqlBinding {
    let conditions = ctx.maker.and([...this.fromConditions, ...this.where]);
    return ctx.maker.select([ctx.maker.column(this.path.table, this.path.key)], this.from, [], conditions);
  }

  joinInto(ctx: SharedContext, into: SqlQuery, alias: string) {
    let w = ctx.maker.and([...this.fromConditions, ...this.where]);
    into.from.push(ctx.maker.from_sub(ctx.maker.select([this.path.key], this.from, [], w), alias));
    into.fromConditions.push(ctx.maker.compare(ctx.maker.column(alias, this.path.key), ConstraintType.Equal, ctx.maker.column(into.path.table, into.path.key)));
  }
  // END BUILD

  execute(ctx: SharedContext, db: { select(sql_select: SqlBinding) : Promise<object[]> }, component: AComponent): Promise<VersionedObject[]> {
    if (!this.promise) {
      this.promise = (async () => {
        //Array.from(ctx.queries.values()).forEach(q => q.execute(ctx, cc, db)); // start quering deps
        let set = this.set;
        let attributes = ["_version"];
        if (set.scope)
          attributes.push(...set.scope);
        let columns: string[] = [ctx.maker.column(this.path.table, this.path.key, "_id")];
        for (let attribute of attributes)
          columns.push(this.sqlColumn(ctx, attribute, attribute));
        let conditions = ctx.maker.and([...this.fromConditions, ...this.where]);
        let query = ctx.maker.select(columns, this.from, [], conditions);
        //query.bind = await Promise.all(query.bind);
        let rows = await db.select(query);
        let ret: VersionedObject[] = [];
        for (let row of rows) {
          ret.push(this.loadObject(ctx, component, row, attributes))
        }
        return ret;
      })();
    }
    return this.promise;
  }

  loadObject(ctx: SharedContext, component: AComponent, row: object, attributes: string[]): VersionedObject {
    let cstor = this.cstor(ctx);
    let cc = ctx.controlCenter;
    let id = this.mapper!.fromDbKey(this.mapper!.get("_id").fromDbKey(row["_id"]));
    let remoteAttributes = new Map<string, any>();
    let vo = cc.registeredObject(id) || new cstor();
    let manager = vo.manager();
    let aspect = manager.aspect();
    cc.registerObjects(component, [vo]);
    for (let i = 0; i < attributes.length; i++) {
      let attr = attributes[i];
      let aspectAttr = aspect.attributes.get(attr);
      let sqlattr = this.mapper!.get(attr);
      let value = sqlattr.fromDb(row[attr]);
      if (aspectAttr && aspectAttr.versionedObject) {
        let mapper = ctx.mappers[aspectAttr.versionedObject];
        let subid = mapper.fromDbKey(value);
        value = cc.registeredObject(subid);
        if (!value) {
          value = new (cc.aspect(aspectAttr.versionedObject)!)();
          value.manager().setId(subid);
          cc.registerObjects(component, [value]);
        }
      }
      remoteAttributes.set(attr, value);
    }
    let version = remoteAttributes.get('_version');
    remoteAttributes.delete('_version');
    manager.setId(id);
    manager.mergeWithRemoteAttributes(remoteAttributes as Map<keyof VersionedObject, any>, version);
    return vo;
  }
}
