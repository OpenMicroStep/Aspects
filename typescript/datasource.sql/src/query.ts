import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, AComponent} from '@openmicrostep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlBinding, SqlMaker} from './index';
import {SqlInsert, SqlValue, SqlPath, SqlMappedAttribute, SqlMappedObject} from './mapper';


function mapIfExists<I, O>(arr: I[] | undefined, map: (v: I, idx: number) => O) : O[] | undefined {
  return arr ? arr.map(map) : undefined;
}

export type SqlMappedSharedContext = {
  cstor: { new(): SqlMappedQuery },
  controlCenter: ControlCenter,
  maker: SqlMaker,
  mappers: { [s: string] : SqlMappedObject },
  queries: Map<ObjectSet, SqlMappedQuery>,
  aliases: number,
}
export function mapValue(mapper: SqlMappedObject, ctx: { mappers: { [s: string] : SqlMappedObject } }, value, isId: boolean) {
  if (value instanceof VersionedObject) {
    let name = value.manager().aspect().name;
    let mapper = ctx.mappers[name];
    if (!mapper)
      throw new Error(`cannot find mapper for ${name}`);
    let idattr = mapper.get("_id");
    value = idattr.toDbKey(mapper.toDbKey(value.id()));
  }
  else if (isId) {
    value = mapper.get("_id").toDbKey(mapper.toDbKey(value));
  }
  return value;
}
export type SqlQuerySharedContext<C extends SqlQuerySharedContext<C, Q>, Q extends SqlQuery<C>> = {
  cstor: { new(): Q },
  controlCenter: ControlCenter,
  maker: SqlMaker,
  queries: Map<ObjectSet, Q>,
  aliases: number,
}
export abstract class SqlQuery<SharedContext extends SqlQuerySharedContext<SharedContext, SqlQuery<SharedContext>>> {
  path?: { table: string, key: string } = undefined;

  tables = new Map<string, string>(); // [table, ref]"value"*[table, ref] -> table alias 
  from: SqlBinding[] = [];
  fromConditions: SqlBinding[] = [];
  variables: Set<SqlQuery<SharedContext>> = new Set();
  subs = new Map<SqlQuery<SharedContext>, { table: string, scope: string[] }>();
  where: SqlBinding[] = [];

  static build<SharedContext extends SqlQuerySharedContext<SharedContext, Q>, Q extends SqlQuery<SharedContext>>(ctx: SharedContext, set: ObjectSet
  ) : Q {
    let ret = ctx.queries.get(set);
    if (!ret) {
      ret = new ctx.cstor();
      ctx.queries.set(set, ret);
      ret.build(ctx, set);
    }
    return ret;
  }

  constructor() {}

  nextAlias(ctx: SharedContext): string {
    return `A${ctx.aliases++}`;
  }

  abstract setMapper(ctx: SharedContext, mapper: string | undefined): void;
  abstract aspect(ctx: SharedContext): Aspect.Installed;
  abstract sqlColumn(ctx: SharedContext, attribute: string | undefined, alias?: string) : string;  
  abstract execute(ctx: SharedContext, scope: string[], db: { select(sql_select: SqlBinding) : Promise<object[]> }, component: AComponent): Promise<VersionedObject[]>;
  abstract mapValue(ctx: SharedContext, value, isId: boolean): any;

  addConstraint(constraint: SqlBinding) {
    this.where.push(constraint);
  }


  buildConstraintValue(ctx: SharedContext, attribute: string, operator: DataSourceInternal.ConstraintOnValueTypes, value: any) : SqlBinding {
    let isId = attribute === "_id";
    value = Array.isArray(value) ? value.map(v => this.mapValue(ctx, v, isId)) : this.mapValue(ctx, value, isId);
    if (operator === ConstraintType.Text && !attribute) {
      let constraints: SqlBinding[] = [];
      this.aspect(ctx).attributes.forEach(attr => {
        if (attr.type.type === "primitive")
          constraints.push(ctx.maker.op(this.sqlColumn(ctx, attr.name), operator, value));
      });
      return ctx.maker.or(constraints);
    }
    else {
      return ctx.maker.op(this.sqlColumn(ctx, attribute), operator, value);
    }
  }


  buildVariable(ctx: SharedContext, var_set: ObjectSet, var_attribute: string) : string {
    let q = SqlQuery.build(ctx, var_set);
    if (q !== this && q.variables.size > 1) {
      let desc = this.subs.get(q);
      if (!desc)
        this.subs.set(q, desc = { table: this.nextAlias(ctx), scope: [] });
      desc.scope.push(var_attribute);
      return ctx.maker.column(desc.table, var_attribute);
    }
    else {
      this.variables.add(q);
      return q.sqlColumn(ctx, var_attribute);
    }
  }
  buildConstraint(ctx: SharedContext, set: ObjectSet, constraint: DataSourceInternal.Constraint, prefix: string) : SqlBinding {
    if (constraint instanceof DataSourceInternal.ConstraintTree) {
      let constaints = constraint.value.map(c => this.buildConstraint(ctx, set, c, prefix + constraint.prefix));
      switch(constraint.type) {
        case ConstraintType.And: return ctx.maker.and(constaints);
        case ConstraintType.Or : return ctx.maker.or (constaints);
      }
    }
    else if (constraint instanceof DataSourceInternal.ConstraintValue) {
      return this.buildConstraintValue(ctx, constraint.attribute, constraint.type, constraint.value);
    }
    else if (constraint instanceof DataSourceInternal.ConstraintVariable) {
      let lset = set.variable(prefix + constraint.leftVariable)!;
      let rset = set.variable(prefix + constraint.rightVariable)!;
      let lc = this.buildVariable(ctx, lset, constraint.leftAttribute);
      let rc = this.buildVariable(ctx, rset, constraint.rightAttribute);
      return ctx.maker.compare(lc, constraint.type, rc);
    }
    throw new Error(`unsupported constraint`);
  }

  build(ctx: SharedContext, set: ObjectSet) {
    switch (set.type) {
      case ConstraintType.InstanceOf:
      case ConstraintType.MemberOf: 
        this.setMapper(ctx, (set.aspect as Aspect.Installed).name); // TODO: real instanceof/memberof
        break;
      default:
        throw new Error(`unsupported type ${ConstraintType[set.type as ConstraintType]}`);
    }
    this.variables.add(this);
    for (let constraint of set.constraints)
      this.addConstraint(this.buildConstraint(ctx, set, constraint, ""));
  }

  sql_columns(ctx: SharedContext, attributes: string[]) : string[] {
    let columns: string[] = [];
    for (let attribute of attributes)
      columns.push(this.sqlColumn(ctx, attribute, attribute));
    return columns;
  }

  sql_from(ctx: SharedContext) : SqlBinding[] {
    let from: SqlBinding[] = [];
    for (let variable of this.variables)
      from.push(...variable.from);
    for (let [sub, desc] of this.subs) {
      let sql_select = ctx.maker.select(sub.sql_columns(ctx, desc.scope), sub.sql_from(ctx), [], sub.sql_where(ctx));
      from.push(ctx.maker.from_sub(sql_select, desc.table));
    }
    return from;
  }

  sql_where(ctx: SharedContext) : SqlBinding {
    let conditions: SqlBinding[] = [];
    for (let variable of this.variables) {
      conditions.push(...variable.fromConditions);
      conditions.push(...variable.where);
    }
    return ctx.maker.and(conditions);
  }
}
export class SqlMappedQuery extends SqlQuery<SqlMappedSharedContext> {
  mapper?: SqlMappedObject = undefined;
  
  setMapper(ctx: SqlMappedSharedContext, name: string | undefined) {
    let mapper = name && ctx.mappers[name];
    if (!mapper || this.mapper === mapper)
      return;

    this.mapper = mapper;
    let attr = mapper.get("_id");
    let alias = this.nextAlias(ctx);
    let table = attr.path[0].table;
    this.path = { table: alias, key: attr.path[0].key };
    this.tables.set(JSON.stringify([table, this.path.key]), alias);
    this.from.push(ctx.maker.from(table, alias))
  }

  aspect(ctx: SqlMappedSharedContext): Aspect.Installed {
    return this.cstor(ctx).aspect;
  }
  cstor(ctx: SqlMappedSharedContext) {
    return ctx.controlCenter.aspect(this.mapper!.name)!
  }

  sqlColumn(ctx: SqlMappedSharedContext, attribute: string | undefined, alias?: string) {
    let lsqlattr = this.mapper!.get(attribute || "_id");
    let table = this.table(ctx, lsqlattr.path);
    let column = lsqlattr.last().value;
    return ctx.maker.column(table, column, alias);
  }

  table(ctx: SqlMappedSharedContext, path: SqlPath[]) : string {
    let key = "";
    let ret: string | undefined = "";
    let prev = ctx.maker.column(this.path!.table, this.path!.key);
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
  
  mapValue(ctx: SqlMappedSharedContext, value, isId: boolean) {
    return mapValue(this.mapper!, ctx, value, isId);
  }

  async execute(ctx: SqlMappedSharedContext, scope: string[], db: { select(sql_select: SqlBinding) : Promise<object[]> }, component: AComponent): Promise<VersionedObject[]> {
    let attributes = ["_id", "_version", ...scope];
    let columns: string[] = this.sql_columns(ctx, attributes);
    let query = ctx.maker.select(columns, this.sql_from(ctx), [], this.sql_where(ctx));
    let rows = await db.select(query);
    let ret: VersionedObject[] = [];
    for (let row of rows) {
      ret.push(this.loadObject(ctx, component, row, attributes))
    }
    return ret;
  }

  loadObject(ctx: SqlMappedSharedContext, component: AComponent, row: object, attributes: string[]): VersionedObject {
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
