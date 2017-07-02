import {Aspect, DataSource, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, AComponent, ImmutableSet, ImmutableList} from '@openmicrostep/aspects';
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
export function mapValue(ctx: { mappers: { [s: string] : SqlMappedObject } }, mapper: SqlMappedObject, attribute: SqlMappedAttribute, value) {
  if (value instanceof VersionedObject) {
    let name = value.manager().aspect().name;
    let mapper = ctx.mappers[name];
    if (!mapper)
      throw new Error(`cannot find mapper for ${name}`);
    let idattr = mapper.get("_id");
    value = idattr.toDbKey(mapper.toDbKey(value.id()));
  }
  else if (attribute.name === "_id") {
    value = mapper.toDbKey(value);
  }
  value = attribute.toDb(value);
  return value;
}
export type SqlQuerySharedContext<C extends SqlQuerySharedContext<C, Q>, Q extends SqlQuery<C>> = {
  cstor: { new(ctx: C): Q },
  controlCenter: ControlCenter,
  maker: SqlMaker,
  queries: Map<ObjectSet, Q>,
  aliases: number,
}

export abstract class SqlQuery<SharedContext extends SqlQuerySharedContext<SharedContext, SqlQuery<SharedContext>>> {
  variables: Set<SqlQuery<SharedContext>> = new Set();
  subs = new Map<SqlQuery<SharedContext>, string>();
  
  initialFromTable: string | undefined = undefined;
  initialFromKey: string | undefined = undefined;
  columns = new Map<string, string>();
  from: SqlBinding[] = [];
  fromConditions: SqlBinding[] = [];
  joins: SqlBinding[] = [];
  where: SqlBinding[] = [];

  static build<
    SharedContext extends SqlQuerySharedContext<SharedContext, Q>, 
    Q extends SqlQuery<SharedContext>
  >(ctx: SharedContext, set: ObjectSet) : Q {
    let ret = ctx.queries.get(set);
    if (!ret) {
      ret = new ctx.cstor(ctx);
      ctx.queries.set(set, ret);
      ret.build(ctx, set);
    }
    return ret;
  }

  static async execute<
    SharedContext extends SqlQuerySharedContext<SharedContext, Q>, 
    Q extends SqlQuery<SharedContext>
  >(ctx: SharedContext, set: ObjectSet) : Promise<VersionedObject[]> {
    
  }

  constructor(public ctx: SharedContext) {
    this.variables.add(this);
  }

  nextAlias(): string {
    return `A${this.ctx.aliases++}`;
  }

  abstract setInitialType(mapper: string | undefined, instanceOf: boolean): void;
  abstract setInitialUnion(queries: SqlQuery<SharedContext>[]): void;
  abstract aspect(): Aspect.Installed;
  abstract sqlColumn(attribute: string) : string;  
  abstract execute(scope: string[], db: { select(sql_select: SqlBinding) : Promise<object[]> }, component: AComponent): Promise<VersionedObject[]>;
  abstract mapValue(attribute: string, value): any;
  
  setInitialUnionOfAlln(ctx: SharedContext, q_0: SqlQuery<SharedContext>, q_n: SqlQuery<SharedContext>, q_np1: SqlQuery<SharedContext>) {

  }

  addInitialFrom(ctx: SharedContext, sql_from: SqlBinding, table: string, key: string) {
    this.from.push(sql_from);
    if (!this.initialFromTable) {
      this.initialFromTable = table;
      this.initialFromKey = key;
    }
    else {
      // If we have multiple initial from (ie. $instanceof and $union), constraint them on both id and type (as db ID aren't unique)
      this.addConstraint(ctx.maker.compare(ctx.maker.column(this.initialFromTable, this.initialFromKey!), ConstraintType.Equal, ctx.maker.column(table, key)));
    }
  }

  addConstraint(constraint: SqlBinding) {
    this.where.push(constraint);
  }

  addAttributes(attributes: Iterable<string>) {
    for (let attribute of attributes)
      this.addAttribute(attribute);
  }

  addAttribute(attribute: string) : string {
    let sql_column = this.columns.get(attribute);
    if (!sql_column)
      this.columns.set(attribute, sql_column = this.sqlColumn(attribute));
    return sql_column;
  }

  buildConstraintValue(var_set: ObjectSet, var_attribute: string, operator: DataSourceInternal.ConstraintOnValueTypes, value: any) : SqlBinding {
    value = Array.isArray(value) ? value.map(v => this.mapValue( var_attribute, v)) : this.mapValue(var_attribute, value);
    let maker = this.ctx.maker;
    if (operator === ConstraintType.Text && var_attribute === "_id") {
      let constraints: SqlBinding[] = [];
      this.aspect().attributes.forEach(attr => {
        if (attr.type.type === "primitive")
          constraints.push(maker.op(this.buildVariable(var_set, attr.name), operator, value));
      });
      return maker.or(constraints);
    }
    else {
      if (operator === ConstraintType.Has)
        operator = ConstraintType.Equal;
      return maker.op(this.buildVariable(var_set, var_attribute), operator, value);
    }
  }

  buildVariable(var_set: ObjectSet, var_attribute: string) : string {
    let q = SqlQuery.build(this.ctx, var_set);
    this.variables.add(q);
    return q.sqlColumn(var_attribute);
  }

  buildConstraint(set: ObjectSet, constraint: DataSourceInternal.Constraint, prefix: string) : SqlBinding {
    if (constraint instanceof DataSourceInternal.ConstraintTree) {
      let constaints = constraint.value.map(c => this.buildConstraint(set, c, prefix + constraint.prefix));
      switch(constraint.type) {
        case ConstraintType.And: return this.ctx.maker.and(constaints);
        case ConstraintType.Or : return this.ctx.maker.or (constaints);
      }
    }
    else if (constraint instanceof DataSourceInternal.ConstraintValue) {
      let lset = set.variable(prefix + constraint.leftVariable)!;
      return this.buildConstraintValue(lset, constraint.leftAttribute, constraint.type, constraint.value);
    }
    else if (constraint instanceof DataSourceInternal.ConstraintVariable) {
      let lset = set.variable(prefix + constraint.leftVariable)!;
      let rset = set.variable(prefix + constraint.rightVariable)!;
      let lc = this.buildVariable(lset, constraint.leftAttribute);
      let rc = this.buildVariable(rset, constraint.rightAttribute);
      return this.ctx.maker.compare(lc, constraint.type, rc);
    }
    throw new Error(`unsupported constraint`);
  }

  build(ctx: SharedContext, set: ObjectSet) {
    for (let c of set.typeConstraints) {
      switch (c.type) {
        case ConstraintType.MemberOf:
          this.setInitialType(c.value.name, false);
          break;
        case ConstraintType.InstanceOf:
          this.setInitialType(c.value.name, true);
          break;
        case ConstraintType.UnionOf:
          let attributes = set.attributes(ctx.controlCenter);
          let queries: SqlQuery<SharedContext>[] = [];
          for (let s of c.value) {
            let q = SqlQuery.build(ctx, s);
            q.addAttributes(attributes);
            queries.push(q);
          }
          this.setInitialUnion(queries);
          break;
        case ConstraintType.UnionOfAlln: {
          let attributes = set.attributes(ctx.controlCenter);
          let u_0 = c.value[0];
          let u_n = c.value[1];
          let u_np1 = c.value[2];
          let q_0 = SqlQuery.build(ctx, u_0);
          q_0.addAttributes(attributes);
          let q_n = new ctx.cstor(ctx);
          ctx.queries.set(u_n, q_n);
          let q_np1 = SqlQuery.build(ctx, u_np1);
          q_np1.addAttributes(attributes);
          this.setInitialUnionOfAlln(ctx, q_0, q_n, q_np1);
          break;
        }
      }
    }
    this.addAttribute("_id");
    if (set.scope)
      this.addAttributes(set.scope);
    for (let constraint of set.constraints)
      this.addConstraint(this.buildConstraint(set, constraint, ""));
  }
  

  sql_from(ctx: SharedContext) : SqlBinding[] {
    let from: SqlBinding[] = [];
    for (let variable of this.variables)
      from.push(...variable.from);
    for (let [sub, desc] of this.subs) {
      let sql_select = ctx.maker.select(sub.sql_columns(ctx, desc.scope), sub.sql_from(ctx), sub.sql_join(ctx), sub.sql_where(ctx));
      from.push(ctx.maker.from_sub(sql_select, desc.table));
    }
    return from;
  }

  sql_join(ctx: SharedContext) : SqlBinding[] {
    let join: SqlBinding[] = [];
    for (let variable of this.variables)
      join.push(...variable.joins);
    return join;
  }

  sql_where(ctx: SharedContext) : SqlBinding {
    let conditions: SqlBinding[] = [];
    for (let variable of this.variables) {
      conditions.push(...variable.fromConditions);
      conditions.push(...variable.where);
    }
    return ctx.maker.and(conditions);
  }

  mergeRemotes(remotes: Map<VersionedObject, Map<string, any>>): VersionedObject[] {
    for (let [vo, remoteAttributes] of remotes) {
      let version = remoteAttributes.get('_version');
      let manager = vo.manager();
      remoteAttributes.delete('_version');
      manager.mergeWithRemoteAttributes(remoteAttributes as Map<keyof VersionedObject, any>, version);
    }
    return [...remotes.keys()];
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

  sqlColumn(ctx: SqlMappedSharedContext, attribute: string, alias?: string) {
    let lsqlattr = this.mapper!.get(attribute);
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
  
  mapValue(ctx: SqlMappedSharedContext, attribute: string, value) {
    return mapValue(ctx, this.mapper!, this.mapper!.get(attribute), value);
  }

  async execute(ctx: SqlMappedSharedContext, scope: string[], db: { select(sql_select: SqlBinding) : Promise<object[]> }, component: AComponent): Promise<VersionedObject[]> {
    let ret: VersionedObject[] = [];
    let remotes = new Map<VersionedObject, Map<string, any>>();
    let cc = ctx.controlCenter;
    let cstor = this.cstor(ctx);
    let aspect = cstor.aspect;

    let mono_attributes: string[] = ["_version"];
    let mult_attributes: Aspect.InstalledAttribute[] = [];
    for (let attribute of scope) {
      let a = aspect.attributes.get(attribute)!;
      if (a.type.type === "primitive" || a.type.type === "class" || a.type.type === "dictionary")
        mono_attributes.push(attribute);
      else if (a.type.type === "set" || a.type.type === "array")
        mult_attributes.push(a);
    }

    let mono_query = ctx.maker.select(this.sql_columns(ctx, ["_id", ...mono_attributes]), this.sql_from(ctx), this.sql_join(ctx), this.sql_where(ctx));
    let mono_rows = await db.select(mono_query);
    let attribute_id = this.mapper!.get("_id");
    let ids: any[] = [];
    for (let row of mono_rows) {
      let db_id = row["_id"];
      let id = this.mapper!.fromDbKey(attribute_id.fromDbKey(db_id));
      let remoteAttributes = new Map<string, any>();
      let vo = cc.registeredObject(id) || new cstor();
      vo.manager().setId(id);
      ids.push(id);
      cc.registerObjects(component, [vo]);
      remotes.set(vo, remoteAttributes);
      for (let attr of mono_attributes) {
        let aspectAttr = aspect.attributes.get(attr)!;
        let sqlattr = this.mapper!.get(attr);
        let value = this.loadValue(ctx, component, aspectAttr.type, sqlattr.fromDb(row[attr]));
        remoteAttributes.set(attr, value);
      }
      for (let mult_attribute of mult_attributes) {
        let isSet = mult_attribute.type.type === "set";
        remoteAttributes.set(mult_attribute.name, isSet ? new Set() : []);
      }
    }
    for (let mult_attribute of mult_attributes) {
      let q = new SqlMappedQuery();
      q.setMapper(ctx, this.mapper!.name);
      q.addConstraint(q.buildConstraintValue(ctx, aspect.attributes.get("_id")!, ConstraintType.In, ids));
      let mult_columns = q.sql_columns(ctx, ["_id", mult_attribute.name]);
      let mult_query = ctx.maker.select(mult_columns, q.sql_from(ctx), q.sql_join(ctx), q.sql_where(ctx));
      let mult_rows = await db.select(mult_query);
      let mult_sql_attr = this.mapper!.get(mult_attribute.name);
      let isSet = mult_attribute.type.type === "set";
      for (let row of mult_rows) {
        let id = this.mapper!.fromDbKey(attribute_id.fromDbKey(row["_id"]));
        let vo = cc.registeredObject(id)!;
        let remoteAttributes = remotes.get(vo)!;
        let value = this.loadValue(ctx, component, (mult_attribute.type as any).itemType, mult_sql_attr.fromDb(row[mult_attribute.name]));
        let c = remoteAttributes.get(mult_attribute.name);
        if (isSet)
          c.add(value);
        else // is array
          c.push(value);
      }
    }
    return this.mergeRemotes(remotes);
  }

  loadValue(ctx: SqlMappedSharedContext, component: AComponent, type: Aspect.Type, value) {
    if (type.type === "class") {
      let classname = type.name;
      let mapper = ctx.mappers[classname];
      let subid = mapper.fromDbKey(value);
      value = ctx.controlCenter.registeredObject(subid);
      if (!value) {
        value = new (ctx.controlCenter.aspect(classname)!)();
        value.manager().setId(subid);
        ctx.controlCenter.registerObjects(component, [value]);
      }
    }
    return value;
  }
}
