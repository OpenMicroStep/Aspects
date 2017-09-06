import { Aspect, DataSource, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, AComponent, ImmutableSet, ImmutableList } from '@openmicrostep/aspects';
import { SqlBinding, SqlMaker } from './index';
import { SqlInsert, SqlValue, SqlPath, SqlMappedAttribute, SqlMappedObject } from './mapper';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import ConstraintTree = DataSourceInternal.ConstraintTree;
import ConstraintValue = DataSourceInternal.ConstraintValue;
import ConstraintVariable = DataSourceInternal.ConstraintVariable;
import ConstraintSub = DataSourceInternal.ConstraintSub;

export function mapValue(ctx: { mappers: { [s: string]: SqlMappedObject }  }, mapper: SqlMappedObject, attribute: SqlMappedAttribute, value) {
  if (value instanceof VersionedObject) {
    let name = value.manager().aspect().name;
    let mapper = ctx.mappers[name];
    if (!mapper)
      throw new Error(`cannot find mapper for ${name}`);
    let idattr = mapper.get("_id")!;
    value = idattr.toDbKey(mapper.toDbKey(value.id()));
  }
  else if (attribute.name === "_id") {
    value = mapper.toDbKey(value);
  }
  value = attribute.toDb(value);
  return value;
}

function mapIfExists<I, O>(arr: I[] | undefined, map: (v: I, idx: number) => O): O[] | undefined {
  return arr ? arr.map(map) : undefined;
}

export interface SqlMappedSharedContext extends SqlQuerySharedContext<SqlMappedSharedContext, SqlMappedQuery> {
  db: { select(sql_select: SqlBinding): Promise<object[]> },
  mappers: { [s: string]: SqlMappedObject },
}
export interface SqlQuerySharedContext<C extends SqlQuerySharedContext<C, Q>, Q extends SqlQuery<C>> {
  cstor: { new(ctx: C, set: ObjectSet): Q },
  component: AComponent,
  controlCenter: ControlCenter,
  maker: SqlMaker,
  queries: Map<ObjectSet, Q>,
  aliases: number,
}

export abstract class SqlQuery<SharedContext extends SqlQuerySharedContext<SharedContext, SqlQuery<SharedContext>>> {
  variables: Set<SqlQuery<SharedContext>> = new Set();
  subs = new Map<SqlQuery<SharedContext>, string>();

  initialFromTable: string | undefined = undefined;
  initialFromKeys: string[] = [];
  initialFromKeyColumns: SqlBinding[] = [];
  columns = new Map<string, string>();
  columns_ordered: string[] = [];
  from: SqlBinding[] = [];
  fromConditions: SqlBinding[] =  [];
  joins: SqlBinding[] = [];
  where: SqlBinding[] = [];

  static async build<
    SharedContext extends SqlQuerySharedContext<SharedContext, Q>,
    Q extends SqlQuery<SharedContext>
    >(ctx: SharedContext, set: ObjectSet): Promise<Q> {
    let ret = ctx.queries.get(set);
    if (!ret) {
      ret = new ctx.cstor(ctx, set);
      ctx.queries.set(set, ret);
      await ret.build();
    }
    return ret;
  }

  static async execute<
    SharedContext extends SqlQuerySharedContext<SharedContext, Q>,
    Q extends SqlQuery<SharedContext>
    >(ctx: SharedContext, set: ObjectSet): Promise<VersionedObject[]> {
    let q = await this.build(ctx, set);
    return q.execute();
  }

  constructor(public ctx: SharedContext, public set: ObjectSet) {
    this.variables.add(this);
  }

  nextAlias(): string {
    return `A${this.ctx.aliases++}`;
  }

  abstract setInitialType(name: string, instanceOf: boolean): void;
  abstract sql_column(attribute: string, required?: true): string;
  abstract sql_column(attribute: string, required: boolean): string | undefined;
  abstract execute(): Promise<VersionedObject[]>;
  abstract execute_ids(): Promise<Map<Identifier, { __is: string, _id: any, _version: number }>>;
  abstract mapValue(attribute: string, value): any;
  abstract setInitialUnionOfAlln(q_0: SqlQuery<SharedContext>, q_n: SqlQuery<SharedContext>, q_np1: SqlQuery<SharedContext>): Promise<void>;

  setInitialUnion(queries: SqlQuery<SharedContext>[]) {
    let maker = this.ctx.maker;
    let info = this.attributesAndCompatibleAspects();
    let table = this.nextAlias();
    let keys = queries[0].initialFromKeys;
    let from = maker.from_sub(maker.union(queries.map(q => {
      q.addLazyAttributes(info.attributes.values());
      return q.sql_select();
    })), table);
    this.addInitialFrom(from, table, keys, keys.map(k => ({ sql: this.ctx.maker.column(table, k), bind: [] })));
  }

  create_q_n(q_0: SqlQuery<SharedContext>, u_n: ObjectSet) {
      let q_n = new this.ctx.cstor(this.ctx, u_n);
      q_n.initialFromTable = this.nextAlias();
      q_n.initialFromKeys = q_0.initialFromKeys;
      q_n.from.push(this.ctx.maker.from(q_n.initialFromTable!));
      this.ctx.queries.set(u_n, q_n);
      return q_n;
  }
  setInitialRecursion(q_n: SqlQuery<SharedContext>) {
    let maker = this.ctx.maker;
    let c = q_n.initialFromKeys.map(k => ({ sql: this.ctx.maker.column(q_n.initialFromTable!, k), bind: [] }));
    this.addInitialFrom(q_n.from[0], q_n.initialFromTable!, q_n.initialFromKeys, c);
  }

  addInitialFrom(sql_from: SqlBinding, table: string, keys: string[], sql_key_columns: SqlBinding[]) {
    this.from.push(sql_from);
    if (!this.initialFromTable) {
      this.initialFromTable = table;
      this.initialFromKeys = keys;
      this.initialFromKeyColumns = sql_key_columns;
    }
    else if (this.initialFromKeys.length === sql_key_columns.length) {
      let maker = this.ctx.maker;
      this.initialFromKeys.forEach((lkey, idx) => {
        let lc = { sql: this.addAttribute(lkey), bind: [] };
        let rc = sql_key_columns[idx];
        this.addConstraint(this.ctx.maker.compare_bind(lc, ConstraintType.Equal, rc));
      });
    }
    else throw new Error(`internal error: initialFromKeys length mismatch`);
  }

  addConstraint(constraint: SqlBinding) {
    this.where.push(constraint);
  }

  attributesAndCompatibleAspects() {
    let ret =  this.set.attributesAndCompatibleAspects(this.ctx.controlCenter);
    if (this.set.scope) for (let a of this.set.scope) {
      for (let aspect of ret.compatibleAspects) {
        let ia = aspect.attributes.get(a);
        if (ia) {
          ret.attributes.set(a, ia);
          break;
        }
      }
    }
    return ret;
  }

  addLazyAttributes(attributes: Iterable<Aspect.InstalledAttribute>) {
    for (let attribute of attributes)
      this.addLazyAttribute(attribute);
  }

  addLazyAttribute(attribute: Aspect.InstalledAttribute): string {
    let sql_column = this.columns.get(attribute.name);
    if (!sql_column) {
      sql_column = this.sql_column(attribute.name, false);
      if (!sql_column) {
        let type: SqlMaker.NullType = undefined;
        let atype = attribute.type;
        if (atype.type === "set" || atype.type === "array")
          atype = atype.itemType;
        if (attribute.type.type === "class")
          type = "integer";
        else if (attribute.type.type === "primitive")
          type = attribute.type.name as SqlMaker.NullType;
        if (type === "date")
          type = "integer";
        sql_column = this.ctx.maker.value_null_typed(type);
      }
      this.columns.set(attribute.name, sql_column);
      this.columns_ordered.push(attribute.name);
    }
    return sql_column;
  }

  addAttributes(attributes: Iterable<string>) {
    for (let attribute of attributes)
      this.addAttribute(attribute);
  }

  addAttribute(attribute: string): string {
    let sql_column = this.columns.get(attribute);
    if (!sql_column) {
      sql_column = this.sql_column(attribute, true);
      this.columns.set(attribute, sql_column);
      this.columns_ordered.push(attribute);
    }
    return sql_column;
  }

  buildConstraintValue(var_set: ObjectSet, var_attribute: string, operator: DataSourceInternal.ConstraintOnValueTypes, value: any): SqlBinding {
    value = Array.isArray(value) ? value.map(v => this.mapValue(var_attribute, v)) : this.mapValue(var_attribute, value);
    return this.ctx.maker.op(this.buildVariable(var_set, var_attribute), operator, value);
  }

  buildVariable(var_set: ObjectSet, var_attribute: string): string {
    let q = this.ctx.queries.get(var_set)!;
    return q.sql_column(var_attribute);
  }

  buildConstraint(constraint: DataSourceInternal.Constraint, prefix: string): SqlBinding {
    if (constraint instanceof DataSourceInternal.ConstraintTree) {
      let constaints = constraint.value.map(c => this.buildConstraint(c, prefix + constraint.prefix));
      switch (constraint.type) {
        case ConstraintType.And: return this.ctx.maker.and(constaints);
        case ConstraintType.Or: return this.ctx.maker.or(constaints);
      }
    }
    else if (constraint instanceof DataSourceInternal.ConstraintValue) {
      let lset = this.set.variable(prefix + constraint.leftVariable)!;
      return this.buildConstraintValue(lset, constraint.leftAttribute, constraint.type, constraint.value);
    }
    else if (constraint instanceof DataSourceInternal.ConstraintVariable) {
      let lset = this.set.variable(prefix + constraint.leftVariable)!;
      let rset = this.set.variable(prefix + constraint.rightVariable)!;
      let lc = this.buildVariable(lset, constraint.leftAttribute);
      let rc = this.buildVariable(rset, constraint.rightAttribute);
      return this.ctx.maker.compare(lc, constraint.type, rc);
    }
    throw new Error(`unsupported constraint`);
  }

  buildConstraints() {
    for (let constraint of this.set.constraints)
      this.addConstraint(this.buildConstraint(constraint, ""));
  }

  async buildTypeConstraints() {
    for (let c of this.set.typeConstraints) {
      switch (c.type) {
        case ConstraintType.MemberOf:
          this.setInitialType(c.value.name, false);
          break;
        case ConstraintType.InstanceOf:
          this.setInitialType(c.value.name, true);
          break;
        case ConstraintType.UnionOf:
          let queries: SqlQuery<SharedContext>[] = [];
          for (let s of c.value) {
            let q = await SqlQuery.build(this.ctx, s);
            queries.push(q);
          }
          this.setInitialUnion(queries);
          break;
        case ConstraintType.UnionOfAlln: {
          let u_0 = c.value[0];
          let u_n = c.value[1];
          let u_np1 = c.value[2];
          let q_0 = await SqlQuery.build(this.ctx, u_0);
          let q_n = this.create_q_n(q_0, u_n)
          let q_np1 = await SqlQuery.build(this.ctx, u_np1);
          await this.setInitialUnionOfAlln(q_0, q_n, q_np1);
          break;
        }
        case ConstraintType.Recursion: {
          this.setInitialRecursion(this.ctx.queries.get(c.value)!);
          return;
        }
      }
    }
  }

  async build(): Promise<void> {
    let set = this.set;
    if (set.variables) for (let variable of set.variables.values()) {
      this.variables.add(await SqlQuery.build(this.ctx, variable));
    }
    await this.buildTypeConstraints();
    this.buildConstraints();
  }

  sql_select(): SqlBinding {
    return this.ctx.maker.select(
      this.sql_columns(),
      this.sql_from(), 
      this.sql_join(),
      this.sql_where()
    );
  }

  sql_join() {
    let sql_join: SqlBinding[] = [];
    sql_join.push(...this.joins);
    for (let variable of this.variables) {
      if (variable !== this)
        sql_join.push(...variable.sql_join());
    }
    return sql_join;
  }

  sql_from() {
    let sql_from: SqlBinding[] = [];
    sql_from.push(...this.from);
    for (let variable of this.variables) {
      if (variable !== this)
        sql_from.push(...variable.sql_from());
    }
    for (let [sub, desc] of this.subs) {
      sql_from.push(this.ctx.maker.from_sub(sub.sql_select(), desc));
    }
    return sql_from;
  }

  sql_columns(): (string | SqlBinding)[] {
    let sql_columns: (string | SqlBinding)[] = [];
    for (let attribute of this.columns_ordered)
      sql_columns.push(this.ctx.maker.column_alias(this.columns.get(attribute)!, attribute));
    return sql_columns;
  }

  sql_where(): SqlBinding {
    let conditions: SqlBinding[] = [];
    conditions.push(...this.fromConditions);
    conditions.push(...this.where);
    for (let variable of this.variables) {
      if (variable !== this)
        conditions.push(variable.sql_where());
    }
    return this.ctx.maker.and(conditions);
  }

  mergeRemotes(remotes: Map<VersionedObject, Map<string, any>>) {
    for (let [vo, remoteAttributes] of remotes) {
      let version = remoteAttributes.get('_version');
      let manager = vo.manager();
      remoteAttributes.delete('_version');
      manager.mergeWithRemoteAttributes(remoteAttributes as Map<keyof VersionedObject, any>, version);
    }
  }
}
export class SqlMappedQuery extends SqlQuery<SqlMappedSharedContext> {
  mappers = new Set<SqlMappedObject>();
  tables = new Map<string, string>();
  hasSub = false;
  private scope: ScopeTree = new Map();

  setInitialType(name: string, instanceOf: boolean): void {
    let mapper = this.ctx.mappers[name];
    if (!mapper)
      throw new Error(`mapper for '${name}' not found`);
    this.mappers.add(mapper);
    let attr = mapper.attribute_id();
    let alias = this.nextAlias();
    let table = attr.path[0].table;
    let key = attr.path[0].key;
    let sql_from = this.ctx.maker.from(table, alias);
    let keys = ["__is", "_id"];
    let sql_key_columns = [this.ctx.maker.value(mapper.name), { sql: this.ctx.maker.column(alias, key), bind: [] }];
    this.tables.set(JSON.stringify([table, key]), alias);
    this.addInitialFrom(sql_from, alias, keys, sql_key_columns);
  }

  aspect(name: string) {
    return this.ctx.controlCenter.aspectChecked(name);
  }

  setInitialUnion(queries: SqlMappedQuery[]) {
    for (let q of queries)
      for (let m of q.mappers)
        this.mappers.add(m);
    this.hasSub = true;
    super.setInitialUnion(queries);
  }

  create_q_n(q_0: SqlMappedQuery, u_n: ObjectSet) {
    let q_n: SqlMappedQuery = super.create_q_n(q_0, u_n) as SqlMappedQuery;
    q_n.mappers = q_0.mappers;
    return q_n;
  }

  async setInitialUnionOfAlln(q_0: SqlMappedQuery, q_n: SqlMappedQuery, q_np1: SqlMappedQuery): Promise<void> {
    for (let m of q_0.mappers)
      this.mappers.add(m);
    for (let m of q_np1.mappers)
      this.mappers.add(m);
    this.hasSub = true;
    let maker = this.ctx.maker;
    let info = this.attributesAndCompatibleAspects();
    let keys = q_0.initialFromKeys;
    let alias = this.nextAlias();
    if (maker.select_with_recursive) {
      let u_n = q_n.initialFromTable!;
      q_np1.addLazyAttributes(info.attributes.values());
      q_0.addLazyAttributes(info.attributes.values());
      
      let sql_columns: string[] = [maker.quote("__is")];
      for (let a of q_0.columns_ordered)
        sql_columns.push(maker.quote(a));
      let sql_from = maker.select_with_recursive(sql_columns, q_0.sql_select(), u_n, q_np1.sql_select());

      this.addInitialFrom(maker.from_sub(sql_from, alias), alias, keys, keys.map(k => ({ sql: this.ctx.maker.column(alias, k), bind: [] })));
    }
    else {
      let i = 0;
      let size = 0;
      let ids = await q_0.execute_ids();
      let nids = ids;
      while (size < ids.size) {
        size = ids.size;
        ++i;
        let s = q_n.set.clone(`${q_n.set._name}[${i}]`);
        let sids = [...nids.values()].map(i => i._id);
        s.typeConstraints.splice(0, 1); // Remove the recursion type
        s.constraints.push(new ConstraintValue(ConstraintType.In, s._name, "_id", sids));
        let q = await SqlQuery.build(this.ctx, s);
        q.addLazyAttributes(info.attributes.values());
        let from: SqlBinding = maker.from_sub(q.sql_select(), q_n.initialFromTable!);
        (q_n.from[0] as any).sql = from.sql;
        (q_n.from[0] as any).bind = from.bind;
        nids = await q_np1.execute_ids();
        for (let [k, id] of nids)
          ids.set(k, id);
      }

      let fids = [...ids.values()].map(i => i._id);
      let s = q_n.set.clone(`${q_n.set._name}[*]`);
      s.typeConstraints.splice(0, 1); // Remove the recursion type
      s.constraints.push(new ConstraintValue(ConstraintType.In, s._name, "_id", fids));
      let q_all = await SqlQuery.build(this.ctx, s);
      q_all.addLazyAttributes(info.attributes.values());
      this.addInitialFrom(maker.from_sub(q_all.sql_select(), alias), alias, keys, keys.map(k => ({ sql: this.ctx.maker.column(alias, k), bind: [] })));
    }
  }
  
  setInitialRecursion(q_n: SqlMappedQuery) {
    this.hasSub = true;
    this.mappers = q_n.mappers;
    super.setInitialRecursion(q_n);
  }

  sql_column(attribute: string, required?: true): string
  sql_column(attribute: string, required: false): string | undefined
  sql_column(attribute: string, required: boolean = true): string | undefined {
    let lsqlattr: SqlMappedAttribute | undefined;
    for (let mapper of this.mappers) {
      lsqlattr = mapper.get(attribute);
      if (lsqlattr)
        break;
    }
    if (!lsqlattr) {
      if (required)
        throw new Error(`attribute ${attribute} is not defined in ${[...this.mappers].map(m => m.name).join(', ')}`);
      return undefined;
    }
    if (!this.hasSub) {
      let table = this.table(lsqlattr.path);
      let column = lsqlattr.last().value;
      return this.ctx.maker.column(table, column);
    }
    else {
      return this.ctx.maker.column(this.initialFromTable!, attribute);
    }
  }

  table(path: SqlPath[]): string {
    let key = "";
    let ret: string | undefined = "";
    let prev = this.initialFromKeyColumns[1].sql;
    for (let p of path) {
      key += JSON.stringify([p.table, p.key]);
      ret = this.tables.get(key);
      if (!ret) {
        ret = this.nextAlias();
        this.from.push(this.ctx.maker.from(p.table, ret));
        this.fromConditions.push(this.ctx.maker.compare(prev, ConstraintType.Equal, this.ctx.maker.column(ret, p.key)));
        this.tables.set(key, ret);
      }
      prev = this.ctx.maker.column(ret, p.value);
      key += JSON.stringify(p.value);
    }
    return ret;
  }

  buildConstraints() {
    if (!this.mappers.size) {
      throw new Error(`not implemented yet`);
      //this.set.compatibleAspects(this.ctx.controlCenter);
    }
    let cc = this.ctx.controlCenter;
    let cstors = [...this.mappers].map(m => cc.aspectConstructorChecked(m.name)!);
    this.scope = buildScopeTree(cc, cstors, this.set.scope || []);
    this.addAttribute("_id");
    this.addAttribute("_version");
    // TODO: share mono attributes computation with execution work
    for (let a of this.monoAttributes(cstors.map(c => c.aspect)))
      this.addAttribute(a);
    super.buildConstraints();
  }

  *monoAttributes(aspects: Iterable<Aspect.Installed>)  {
    let attr: string[] = [];
    if (this.set.scope) for (let attribute of this.set.scope) {
      let isMono = -1;
      for (let aspect of aspects) {
        let a = aspect.attributes.get(attribute);
        if (a) {
          if (isMono !== 0 && (a.type.type === "primitive" || a.type.type === "class" || a.type.type === "dictionary"))
            isMono = 1;
          else
            isMono = 0;
        }
      }
      if (isMono === 1)
        yield attribute;
    }
  }

  buildConstraintValue(var_set: ObjectSet, var_attribute: string, operator: DataSourceInternal.ConstraintOnValueTypes, value: any): SqlBinding {
    if (operator === ConstraintType.Text && var_attribute === "_id") {
      // TODO: add support for external full text search ?
      let constraints: SqlBinding[] = [];
      let attr = new Set<string>();
      for (let mapper of this.mappers) {
        let aspect = this.aspect(mapper.name);
        for (let a of aspect.attributes.values()) {
          if (a.type.type === "primitive" && !attr.has(a.name)) {
            attr.add(a.name);
            constraints.push(super.buildConstraintValue(var_set, a.name, operator, value));
          }
        }
      }
      return this.ctx.maker.or(constraints);
    }
    else {
      if (operator === ConstraintType.Has)
        operator = ConstraintType.Equal;
      return super.buildConstraintValue(var_set, var_attribute, operator, value);
    }
  }

  mapValue(attribute: string, value) {
    let finalValue;
    let hasFinalValue = false;
    for (let mapper of this.mappers) {
      let a = mapper.get(attribute);
      if (a) {
        let v = mapValue(this.ctx, mapper, a, value);
        if (hasFinalValue && finalValue !== v)
          throw new Error(`attribute ${attribute} has two different db representation conversion in ${[...this.mappers].map(m => m.name).join(', ')}`);
        finalValue = v;
        hasFinalValue = true;
      }
    }
    if (!hasFinalValue)
      throw new Error(`attribute ${attribute} is not defined in ${[...this.mappers].map(m => m.name).join(', ')}`)
    return finalValue;
  }

  sql_columns(): (string | SqlBinding)[] {
    let sql_columns = super.sql_columns();
    if (!this.hasSub) {
      let is = this.mappers.values().next().value.name;
      sql_columns.unshift(this.ctx.maker.column_alias_bind(this.ctx.maker.value(is), '__is'));
    }
    else {
      sql_columns.unshift(this.ctx.maker.column(this.initialFromTable!, '__is', '__is'));
    }
    return sql_columns;
  }
  async execute_ids(): Promise<Map<Identifier, { __is: string, _id: any, _version: number }>> {
    let ret = new Map<Identifier, { __is: string, _id: any, _version: number }>();
    let mono_query = this.sql_select();
    let mono_rows = await this.ctx.db.select(mono_query);
    for (let row of mono_rows) {
      let { __is, _id, _version } = row as any;
      let mapper = this.ctx.mappers[__is]!;
      let id = mapper.fromDbKey(mapper.attribute_id().fromDbKey(_id));
      let version = mapper.get("_version")!.fromDbKey(_version);
      ret.set(id, { __is: __is, _id: id, _version: version });
    }
    return ret;
  }

  async execute(): Promise<VersionedObject[]> {
    let cc = this.ctx.controlCenter;
    let maker = this.ctx.maker;
    let remotes = new Map<VersionedObject, Map<string, any>>();
    let ret: VersionedObject[] = [];
    const loadMonoRows = (mono_rows: any[], scope: ScopeTree, mult_items: Set<ScopeTreeItem>, sub_items: Set<ScopeTreeItem>) => {
      for (let row of mono_rows) {
        let is = row["__is"];
        let db_id = row["_id"];
        let mapper = this.ctx.mappers[is]!;
        let scopeitem = scope.get(is)!;
        let id = mapper.fromDbKey(mapper.attribute_id().fromDbKey(db_id));
        let remoteAttributes = new Map<string, any>();
        let vo = cc.registeredObject(id) || new scopeitem.cstor();
        vo.manager().setId(id);
        cc.registerObjects(this.ctx.component, [vo]);
        remotes.set(vo, remoteAttributes);

        if (scope === this.scope)
          ret.push(vo);

        for (let a of scopeitem.mono.values()) {
          let k = a.name;
          let v = row[k];
          v = mapper.get(k)!.fromDb(v);
          v = this.loadValue(cc, this.ctx.component, a.type, v, scopeitem, sub_items);
          remoteAttributes.set(k, v);
        }
        if (scopeitem.objects) {
          for (let a of scopeitem.mult.values())
            remoteAttributes.set(a.name, a.type.type === "set" ? new Set() : []);
          mult_items.add(scopeitem);
          scopeitem.objects.add(vo);
        }
      }
    }

    let mono_query = this.sql_select();
    let mono_rows = await this.ctx.db.select(mono_query);
    let mult_items = new Set<ScopeTreeItem>();
    let sub_items = new Set<ScopeTreeItem>();
    loadMonoRows(mono_rows, this.scope, mult_items, sub_items);    
    while (mult_items.size > 0 || sub_items.size > 0) {
      let psub_items = [...sub_items];
      sub_items = new Set<ScopeTreeItem>();
      for (let [idx, scopeitem] of psub_items.entries()) {
        let ids = scopeitem.ids();
        let classname = scopeitem.cstor.aspect.name;
        let s = new ObjectSet(classname);
        let q = new SqlMappedQuery(this.ctx, s);
        let mapper = this.ctx.mappers[classname];
        let attribute_id = mapper.attribute_id();
        this.ctx.queries.set(s, q);
        q.setInitialType(classname, false);
        q.addAttribute("_id");
        q.addAttributes(scopeitem.mono.keys());
        q.addConstraint(q.buildConstraintValue(q.set, "_id", ConstraintType.In, ids));
        let mono_query = q.sql_select();
        let mono_rows = await this.ctx.db.select(mono_query);
        let scope = new Map() as ScopeTree;
        scope.set(scopeitem.cstor.aspect.name, scopeitem);
        loadMonoRows(mono_rows, scope, mult_items, sub_items);
      }

      // Building UNION of SELECT (__is, _id, _attribute, _value)
      let sql_selects: SqlBinding[] = [];
      let pmult_items = [...mult_items];
      mult_items = new Set<ScopeTreeItem>();
      for (let [idx, scopeitem] of pmult_items.entries()) {
        let ids = scopeitem.ids();
        for (let mult_attribute of scopeitem.mult.values()) {
          let classname = scopeitem.cstor.aspect.name;
          let s = new ObjectSet(classname);
          let q = new SqlMappedQuery(this.ctx, s);
          let mapper = this.ctx.mappers[classname];
          let attribute_id = mapper.attribute_id();
          this.ctx.queries.set(s, q);
          q.setInitialType(classname, false);
          q.addAttribute("_id");
          q.addConstraint(q.buildConstraintValue(q.set, "_id", ConstraintType.In, ids));
          q.columns.set("_value", q.sql_column(mult_attribute.name));
          q.columns_ordered.push("_value");
          let sql_columns = q.sql_columns();
          sql_columns.push(maker.column_alias_bind(maker.value(mult_attribute.name), "_attribute"));
          sql_columns.push(maker.column_alias_bind(maker.value(idx), "_scope"));
          let sql_select =  maker.select(
            sql_columns,
            q.sql_from(), [],
            q.sql_where()
          );
          sql_selects.push(sql_select);
        }
      }
      let rows = sql_selects.length ? await this.ctx.db.select(maker.union(sql_selects)) : [];
      for (let row of rows) {
        let {__is, _id, _attribute, _value, _scope} = row as any;
        let mapper = this.ctx.mappers[__is];
        let id = mapper.fromDbKey(mapper.attribute_id().fromDbKey(_id));
        let vo = cc.registeredObject(id)!;
        let remoteAttributes = remotes.get(vo)!;
        let scopeitem = pmult_items[_scope];
        let a = scopeitem.cstor.aspect.attributes.get(_attribute)!;
        let atype = a.type as Aspect.TypeSet | Aspect.TypeArray;
        let isSet = a.type.type === "set";
        let c = remoteAttributes.get(a.name);
        let mult_sql_attr = mapper.get(a.name)!;
        let value = this.loadValue(cc, this.ctx.component, atype.itemType, mult_sql_attr.fromDb(_value), scopeitem, sub_items);
        if (isSet)
          c.add(value);
        else // is array
          c.push(value);
      }
    }
    this.mergeRemotes(remotes);
    return ret;
  }

  private loadValue(cc: ControlCenter, component: AComponent, type: Aspect.Type, value, scopeitem: ScopeTreeItem, sub_items: Set<ScopeTreeItem>) {
    if (value === null)
      value = undefined;
    else if (type.type === "class" && value !== undefined) {
      let classname = type.name;
      let mapper = this.ctx.mappers[classname];
      let subid = mapper.fromDbKey(value);
      value = cc.registeredObject(subid);
      if (!value) {
        value = cc.findOrCreate(subid, classname);
        cc.registerObjects(component, [value]);
      }
      let sub = scopeitem.subs.get(value.manager().name());
      if (sub) {
        sub.objects!.add(value);
        sub_items.add(sub);
      }
    }
    return value;
  }
}

type ScopeTree = Map<string, ScopeTreeItem>;
class ScopeTreeItem {
  constructor(public cstor: Aspect.Constructor) {}
  mono: Map<string, Aspect.InstalledAttribute> = new Map();
  mult: Map<string, Aspect.InstalledAttribute> = new Map(); 
  subs: ScopeTree = new Map();
  objects?: Set<VersionedObject> = undefined;

  ids() {
    let ids: any[] = [];
    if (this.objects) for (let vo of this.objects)
      ids.push(vo.id());
    return ids;
  }
};

function buildScopeTreeItem(cc: ControlCenter, item: ScopeTreeItem, aspect: Aspect.Installed, scope: Iterable<string>, stack: Set<string>) {
  for (let k of scope) {
    let a = aspect.attributes.get(k);
    if (a && !stack.has(k)) {
      let sub_names = Aspect.typeToAspectNames(a.type);
      if (sub_names.length) {
        stack.add(k);
        for (let sub_name of sub_names) {
          let sub_tree = new ScopeTreeItem(cc.aspectConstructorChecked(sub_name));
          item.subs.set(sub_name, sub_tree);
          buildScopeTreeItem(cc, sub_tree, sub_tree.cstor.aspect, scope, stack);
          if (!sub_tree.objects)
            sub_tree.objects = new Set();
        }
        stack.delete(k);
      }
      if(a.type.type === "array" || a.type.type === "set")
        item.mult.set(a.name, a);
      else
        item.mono.set(a.name, a);
    }
  };
  if (item.mult.size > 0)
    item.objects = new Set();
}

function buildScopeTree(cc: ControlCenter, cstors: Aspect.Constructor[], scope: Iterable<string>) : ScopeTree {
  let clear_scope = new Set(scope);
  clear_scope.add("_version");
  let ret: ScopeTree = new Map();
  for (let cstor of cstors) {
    let item = new ScopeTreeItem(cstor);
    ret.set(cstor.aspect.name, item);
    buildScopeTreeItem(cc, item, cstor.aspect, clear_scope, new Set());
  }
  return ret;
}