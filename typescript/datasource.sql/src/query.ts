import {
  ControlCenter, ControlCenterContext, Identifier, AComponent,
  DataSourceInternal,
  Aspect, VersionedObject, VersionedObjectSnapshot,
} from '@openmicrostep/aspects';
import { SqlBinding, SqlBindingW, SqlMaker } from './index';
import { SqlInsert, SqlValue, SqlPath, SqlMappedAttribute, SqlMappedObject } from './mapper';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import ConstraintTree = DataSourceInternal.ConstraintTree;
import ConstraintValue = DataSourceInternal.ConstraintValue;
import ConstraintVariable = DataSourceInternal.ConstraintVariable;
import ConstraintSub = DataSourceInternal.ConstraintSub;

const $is = Aspect.create_virtual_attribute("$is", new Aspect.Type.VirtualType(Aspect.Type.stringType, { operator: "$is", sort: [], group_by: [] }));

export function mapValue(ctx: { mappers: { [s: string]: SqlMappedObject }  }, mapper: SqlMappedObject, attribute: SqlMappedAttribute, value) {
  if (value instanceof VersionedObject) {
    let name = value.manager().classname();
    let mapper = ctx.mappers[name];
    if (!mapper)
      throw new Error(`cannot find mapper for ${name}`);
    let idattr = mapper.get("_id")!;
    value = idattr.toDbKey(mapper.toDbKey( value.id()));
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
  ccc: ControlCenterContext,
  controlCenter: ControlCenter,
  maker: SqlMaker,
  queries: Map<ObjectSet, Q>,
  aliases: number,
}

export abstract class SqlQuery<SharedContext extends SqlQuerySharedContext<SharedContext, SqlQuery<SharedContext>>> {
  variables: Set<SqlQuery<SharedContext>> = new Set();
  subs = new Map<SqlQuery<SharedContext>, string>();
  inner_join = true;

  initialFromTable: string | undefined = undefined;
  initialFromKeys: Aspect.InstalledAttribute[] = [];
  initialFromKeyColumns: SqlBinding[] = [];
  columns = new Map<string, SqlBinding>();
  columns_ordered: string[] = [];
  from: SqlBindingW = { sql: '', bind: [] };
  fromConditions: SqlBinding[] =  [];
  joins: SqlBinding[] = [];
  where: SqlBinding[] = [];
  sort: string[] = [];

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
  abstract sql_column(attribute: Aspect.InstalledAttribute, required?: true): SqlBinding;
  abstract sql_column(attribute: Aspect.InstalledAttribute, required: boolean): SqlBinding | undefined;
  abstract execute(): Promise<VersionedObject[]>;
  abstract execute_ids(): Promise<Map<Identifier, { $is: string, _id: any, _version: number }>>;
  abstract mapSingleValue(attribute: Aspect.InstalledAttribute, value): any;
  abstract setInitialUnionOfAlln(q_0: SqlQuery<SharedContext>, q_n: SqlQuery<SharedContext>, q_np1: SqlQuery<SharedContext>): Promise<void>;

  abstract sql_sub_count_lvar_intersects_value(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute, value: any): SqlBinding;
  abstract sql_sub_count_var(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute): SqlBinding;
  abstract sql_sub_count_lvar_intersects_rvar_single(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute, sql_right_column: SqlBinding): SqlBinding;
  abstract sql_sub_count_lvar_intersects_rvar_mult(
    lset: ObjectSet, lattribute: Aspect.InstalledAttribute,
    rset: ObjectSet, rattribute: Aspect.InstalledAttribute
  ): SqlBinding;

  abstract sql_sub_count_virtual(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute,op:DataSourceInternal.ConstraintBetweenValueAndValue,value:number): SqlBinding;

  mapValue(attribute: Aspect.InstalledAttribute, value): any {
    return Array.isArray(value) ? value.map(v => this.mapSingleValue(attribute, v)) : this.mapSingleValue(attribute, value);
  }

  setInitialUnion(queries: SqlQuery<SharedContext>[]) {
    let maker = this.ctx.maker;
    let info = this.attributesAndCompatibleAspects();
    let table = this.nextAlias();
    let keys = queries[0].initialFromKeys;
    let from = maker.from_sub(maker.union(queries.map(q => {
      q.addLazyAttributes(info.attributes.values());
      return q.sql_select();
    })), table);
    this.addInitialFrom(from, table, keys, keys.map(k => (this.ctx.maker.column(table, k.name))));
  }

  create_q_n(q_0: SqlQuery<SharedContext>, u_n: ObjectSet) {
      let q_n = new this.ctx.cstor(this.ctx, u_n);
      q_n.initialFromTable = this.nextAlias();
      q_n.initialFromKeys = q_0.initialFromKeys;
      q_n.initialFromKeyColumns = [this.ctx.maker.column(q_n.initialFromTable!, "_id")];
      q_n.from = this.ctx.maker.from(q_n.initialFromTable!);
      this.ctx.queries.set(u_n, q_n);
      return q_n;
  }
  setInitialRecursion(q_n: SqlQuery<SharedContext>) {
    let c = q_n.initialFromKeys.map(k => (this.ctx.maker.column(q_n.initialFromTable!, k.name)));
    this.addInitialFrom(q_n.from, q_n.initialFromTable!, q_n.initialFromKeys, c);
  }

  addInitialFrom(sql_from: SqlBinding, table: string, keys: Aspect.InstalledAttribute[], sql_key_columns: SqlBinding[], left_join?: { query: SqlQuery<SharedContext>, attribute: Aspect.InstalledAttribute }) {
    let maker = this.ctx.maker;
    let constraints: SqlBinding[] = [];
    if (left_join)
      this.inner_join = false;
    if (!this.initialFromTable) {
      this.initialFromTable = table;
      this.initialFromKeys = keys;
      this.initialFromKeyColumns = sql_key_columns;
    }
    else if (this.initialFromKeys.length === sql_key_columns.length) {
      this.initialFromKeys.forEach((lkey, idx) => {
        let lc = this.addAttribute(lkey);
        let rc = sql_key_columns[idx];
        constraints.push(maker.compare(lc, ConstraintType.Equal, rc));
      });
    }
    else throw new Error(`internal error: initialFromKeys length mismatch`);

    if (left_join) {
      constraints.push(maker.compare(
        this.sql_column(Aspect.attribute_id), ConstraintType.Equal, left_join.query.sql_column(left_join.attribute)
      ));
    }
    if (constraints.length > 0)
      this.joins.push(maker.join_from(left_join ? "left" : "inner", sql_from, maker.and(constraints)));
    else
      this.from = sql_from;
  }

  addConstraint(constraint: SqlBinding) {
    this.where.push(constraint);
  }

  attributesAndCompatibleAspects() {
    let ret =  this.set.attributesAndCompatibleAspects(this.ctx.controlCenter);
    if (this.set.scope) {
      for (let aspect of ret.compatibleAspects) {
        for (let a of this.set.scope.attributes(aspect.classname, '.'))
          ret.attributes.set(a.name, a);
      }
    }
    return ret;
  }

  addLazyAttributes(attributes: Iterable<Aspect.InstalledAttribute>) {
    for (let attribute of attributes)
      this.addLazyAttribute(attribute);
  }

  addLazyAttribute(attribute: Aspect.InstalledAttribute): SqlBinding {
    let sql_column = this.columns.get(attribute.name);
    if (!sql_column) {
      sql_column = this.sql_column(attribute, false);
      if (!sql_column) {
        // TODO: remove this code and use informations from the mapper
        let type: SqlMaker.NullType = undefined;
        let atype = attribute.type;
        if (atype instanceof Aspect.Type.ArrayType || atype instanceof Aspect.Type.SetType)
          atype = atype.type;
        if (attribute.containsVersionedObject())
          type = "integer";
        else
          type = attribute.type.asPrimitive() as SqlMaker.NullType;
        if (type === "date")
          type = "integer";
        sql_column = this.ctx.maker.value_null_typed(type);
      }
      this.addColumn(attribute.name, sql_column);
    }
    return sql_column;
  }

  addAttributes(attributes: Iterable<Aspect.InstalledAttribute>) {
    for (let attribute of attributes)
      this.addAttribute(attribute);
  }

  addAttribute(attribute: Aspect.InstalledAttribute): SqlBinding {
    let sql_column = this.columns.get(attribute.name);
    if (!sql_column) {
      sql_column = this.sql_column(attribute, true);
      this.addColumn(attribute.name, sql_column);
    }
    return sql_column;
  }

  addColumn(name: string, sql_column: SqlBinding) {
    this.columns.set(name, sql_column);
    this.columns_ordered.push(name);
  }

  buildConstraintValue(
    var_set: ObjectSet, var_attribute: Aspect.InstalledAttribute,
    operator: DataSourceInternal.ConstraintBetweenAnyValueAndFixedValue,
    value: any
  ): SqlBinding {
    if (ConstraintType.BEGIN_A_op_B <= operator && operator <= ConstraintType.END_A_op_B) {
      let count_var_intersects_value: SqlBinding = this.sql_sub_count_lvar_intersects_value(var_set, var_attribute, value);
      if (operator === ConstraintType.Intersects) {
        return this.ctx.maker.op(count_var_intersects_value, ConstraintType.GreaterThan, 0);
      }
      else if (operator === ConstraintType.NotIntersects) {
        return this.ctx.maker.op(count_var_intersects_value, ConstraintType.Equal, 0);
      }
      else if (operator === ConstraintType.SubSet) {
        let count_var: SqlBinding = this.sql_sub_count_var(var_set, var_attribute);
        return this.ctx.maker.compare(count_var_intersects_value, ConstraintType.Equal, count_var);
      }
      else if (operator === ConstraintType.NotSubSet) {
        let count_var: SqlBinding = this.sql_sub_count_var(var_set, var_attribute);
        return this.ctx.maker.compare(count_var_intersects_value, ConstraintType.NotEqual, count_var);
      }
      else if (operator === ConstraintType.SuperSet) {
        return this.ctx.maker.op(count_var_intersects_value, ConstraintType.Equal, value.length);
      }
      else if (operator === ConstraintType.NotSuperSet) {
        return this.ctx.maker.op(count_var_intersects_value, ConstraintType.NotEqual, value.length);
      }
      else if (operator === ConstraintType.SameSet) {
        let count_var: SqlBinding = this.sql_sub_count_var(var_set, var_attribute);
        return this.ctx.maker.and([
          this.ctx.maker.op(count_var_intersects_value, ConstraintType.Equal, value.length),
          this.ctx.maker.op(count_var, ConstraintType.Equal, value.length)
        ]);
      }
      else { // if (operator === ConstraintType.NotSameSet)
        let count_var: SqlBinding = this.sql_sub_count_var(var_set, var_attribute);
        return this.ctx.maker.or([
          this.ctx.maker.op(count_var_intersects_value, ConstraintType.NotEqual, value.length),
          this.ctx.maker.op(count_var, ConstraintType.NotEqual, value.length)
        ]);
      }
    }
    else if (ConstraintType.BEGIN_A_op_b <= operator && operator <= ConstraintType.END_A_op_b) {
      let sql_select_count: SqlBinding = this.sql_sub_count_lvar_intersects_value(var_set, var_attribute, value);
      if (operator === ConstraintType.Contains)
        return this.ctx.maker.op(sql_select_count, ConstraintType.GreaterThan, 0);
      else
        return this.ctx.maker.op(sql_select_count, ConstraintType.Equal, 0);
    }
    else {
      return this.ctx.maker.op(this.buildVariable(var_set, var_attribute), operator, value);
    }
  }

  buildConstraintVariable(
    lset: ObjectSet, lattribute: Aspect.InstalledAttribute,
    operator: DataSourceInternal.ConstraintBetweenAnyValueAndAnyValue,
    rset: ObjectSet, rattribute: Aspect.InstalledAttribute
  ) {
    if (ConstraintType.BEGIN_A_op_B <= operator && operator <= ConstraintType.END_A_op_B) {
      let count_lvar_intersects_rvar: SqlBinding = this.sql_sub_count_lvar_intersects_rvar_mult(lset, lattribute,rset,rattribute);
      if (operator === ConstraintType.Intersects) {
        return this.ctx.maker.op(count_lvar_intersects_rvar, ConstraintType.GreaterThan, 0);
      }
      else if (operator === ConstraintType.NotIntersects) {
        return this.ctx.maker.op(count_lvar_intersects_rvar, ConstraintType.Equal, 0);
      }
      else if (operator === ConstraintType.SubSet) {
        let count_lvar: SqlBinding = this.sql_sub_count_var(lset, lattribute);
        return this.ctx.maker.compare(count_lvar_intersects_rvar, ConstraintType.Equal, count_lvar);
      }
      else if (operator === ConstraintType.NotSubSet) {
        let count_lvar: SqlBinding = this.sql_sub_count_var(lset, lattribute);
        return this.ctx.maker.compare(count_lvar_intersects_rvar, ConstraintType.NotEqual, count_lvar);
      }
      else if (operator === ConstraintType.SuperSet) {
        let count_rvar: SqlBinding = this.sql_sub_count_var(rset, rattribute);
        return this.ctx.maker.compare(count_lvar_intersects_rvar, ConstraintType.Equal, count_rvar);
      }
      else if (operator === ConstraintType.NotSuperSet) {
        let count_rvar: SqlBinding = this.sql_sub_count_var(rset, rattribute);
        return this.ctx.maker.compare(count_lvar_intersects_rvar, ConstraintType.NotEqual, count_rvar);
      }
      else if (operator === ConstraintType.SameSet) {
        let count_lvar: SqlBinding = this.sql_sub_count_var(lset, lattribute);
        let count_rvar: SqlBinding = this.sql_sub_count_var(rset, rattribute);
        return this.ctx.maker.and([
          this.ctx.maker.compare(count_lvar_intersects_rvar, ConstraintType.Equal, count_lvar),
          this.ctx.maker.compare(count_lvar, ConstraintType.Equal, count_rvar)
        ]);
      }
      else { // if (operator === ConstraintType.NotSameSet)
        let count_lvar: SqlBinding = this.sql_sub_count_var(lset, lattribute);
        let count_rvar: SqlBinding = this.sql_sub_count_var(rset, rattribute);
        return this.ctx.maker.or([
          this.ctx.maker.compare(count_lvar_intersects_rvar, ConstraintType.NotEqual, count_lvar),
          this.ctx.maker.compare(count_lvar, ConstraintType.NotEqual, count_rvar)
        ]);
      }
    }
    else if (ConstraintType.BEGIN_A_op_b <= operator && operator <= ConstraintType.END_A_op_b) {
      let sql_select_count: SqlBinding = this.sql_sub_count_lvar_intersects_rvar_single(lset, lattribute, this.buildVariable(rset, rattribute));
      if (operator === ConstraintType.Contains)
        return this.ctx.maker.op(sql_select_count, ConstraintType.GreaterThan, 0);
      else
        return this.ctx.maker.op(sql_select_count, ConstraintType.Equal, 0);
    }
    else {
      let lc = this.buildVariable(lset, lattribute);
      let rc = this.buildVariable(rset, rattribute);
      return this.ctx.maker.compare(lc, operator, rc);
    }
  }

  buildVariable(var_set: ObjectSet, var_attribute: Aspect.InstalledAttribute): SqlBinding {
    let q = this.ctx.queries.get(var_set)!
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
      let value = constraint.value;
      value = this.mapValue(constraint.leftAttribute, value);
      return this.buildConstraintValue(lset, constraint.leftAttribute, constraint.type, value);
    }
    else if (constraint instanceof DataSourceInternal.ConstraintVariable) {
      let lset = this.set.variable(prefix + constraint.leftVariable)!;
      let rset = this.set.variable(prefix + constraint.rightVariable)!;
      return this.buildConstraintVariable(lset, constraint.leftAttribute, constraint.type, rset, constraint.rightAttribute);
    }
    throw new Error(`unsupported constraint`);
  }

  buildConstraints() {
    for (let constraint of this.set.constraints)
      this.addConstraint(this.buildConstraint(constraint, ""));
  }

  sql_sort_column({ asc, path }: { asc: boolean, path: Aspect.InstalledAttribute[] }): string {
    let sql_column = "";
    let column = "";
    let q: SqlQuery<SharedContext> = this;
    let i = 0, last = path.length - 1;
    let p: Aspect.InstalledAttribute;
    while (i < last) {
      p = path[i++];
      let types = p.contained_aspects;
      let q_r = new this.ctx.cstor(this.ctx, new ObjectSet(p.name));
      if (types.size === 1) {
        q_r.setInitialType([...types][0].classname, false);
      }
      else {
        let queries: SqlQuery<SharedContext>[] = [];
        for (let type of types) {
          let q_rt = new this.ctx.cstor(this.ctx, new ObjectSet(p.name));
          q_rt.setInitialType(type.classname, false);
          q_rt.addConstraint(this.ctx.maker.compare(q_rt.sql_column(Aspect.attribute_id), ConstraintType.Equal, q.sql_column(p)));
          queries.push(q_rt);
        }
        q_r.setInitialUnion(queries);
      }
      q_r.addConstraint(this.ctx.maker.compare(q_r.sql_column(Aspect.attribute_id), ConstraintType.Equal, q.sql_column(p)));
      this.variables.add(q_r);
      q = q_r;
    }
    p = path[last];
    return this.ctx.maker.sort_column(q.sql_column(p), asc);
  }

  buildSort() {
    if (this.set.sort) {
      for (let sort of this.set.sort) {
        this.sort.push(this.sql_sort_column(sort));
      }
    }
  }

  async buildTypeConstraints() {
    for (let c of this.set.typeConstraints) {
      switch (c.type) {
        case ConstraintType.Is:
          this.setInitialType(c.value.classname, false);
          break;
        case ConstraintType.InstanceOf:
          this.setInitialType(c.value.classname, true);
          break;
        case ConstraintType.Union:
          let queries: SqlQuery<SharedContext>[] = [];
          for (let s of c.value) {
            let q = await SqlQuery.build(this.ctx, s);
            queries.push(q);
          }
          this.setInitialUnion(queries);
          break;
        case ConstraintType.UnionForAlln: {
          let u_0 = c.value[0];
          let u_n = c.value[1];
          let u_np1 = c.value[2];
          let q_0 = await SqlQuery.build(this.ctx, u_0);
          let q_n = this.create_q_n(q_0, u_n);
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
    this.buildSort();
  }

  sql_select(): SqlBinding {
    return this.ctx.maker.select(
      this.sql_columns(),
      this.sql_from(),
      this.sql_join(),
      this.sql_where(),
      this.sql_sort(),
    );
  }

  sql_select_count(): SqlBinding {
    return this.ctx.maker.select(
      [this.ctx.maker.column_count()],
      this.sql_from(),
      this.sql_join(),
      this.sql_where(),
    );
  }

  sql_columns(): (string | SqlBinding)[] {
    let sql_columns: (string | SqlBinding)[] = [];
    for (let attribute of this.columns_ordered)
      sql_columns.push(this.ctx.maker.column_alias(this.columns.get(attribute)!, attribute));
    return sql_columns;
  }

  sql_from() : SqlBinding {
    return this.from;
  }

  sql_join() {
    let sql_join: SqlBinding[] = [];
    sql_join.push(...this.joins);
    for (let variable of this.variables) {
      if (variable !== this) {
        if (variable.from.sql)
          sql_join.push(this.ctx.maker.join_from('', variable.from))
        sql_join.push(...variable.sql_join());
      }
    }
    return sql_join;
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

  sql_sort(): string[] {
    return this.sort;
  }

  mergeSnapshots(remotes: Map<VersionedObject, VersionedObjectSnapshot>) {
    for (let [vo, snapshot] of remotes) {
      let manager = vo.manager();
      manager.mergeSavedAttributes(snapshot);
    }
  }
}
export class SqlMappedQuery extends SqlQuery<SqlMappedSharedContext> {
  mappers = new Set<SqlMappedObject>();
  tables = new Map<string, string>();
  hasSub = false;

  setInitialType(name: string, instanceOf: boolean, left_join?: { query: SqlMappedQuery, attribute: Aspect.InstalledAttribute }): void {
    let mapper = this.ctx.mappers[name];
    if (!mapper)
      throw new Error(`mapper for '${name}' not found`);
    this.mappers.add(mapper);
    let attr = mapper.attribute_id();
    let alias = this.nextAlias();
    let table = attr.path[0].table;
    let key = attr.path[0].key;
    let sql_from = this.ctx.maker.from(table, alias);
    let keys = [$is, Aspect.attribute_id];
    let sql_key_columns = [this.ctx.maker.value(mapper.name), this.ctx.maker.column(alias, key)];
    this.tables.set(JSON.stringify([table, key]), alias);
    this.addInitialFrom(sql_from, alias, keys, sql_key_columns, left_join);
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

      let sql_columns: string[] = [maker.quote("$is")];
      for (let a of q_0.columns_ordered)
        sql_columns.push(maker.quote(a));
      let sql_from = maker.select_with_recursive(sql_columns, q_0.sql_select(), u_n, q_np1.sql_select());

      this.addInitialFrom(maker.from_sub(sql_from, alias), alias, keys, keys.map(k => (this.ctx.maker.column(alias, k.name))));
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
        s.constraints.push(new ConstraintValue(ConstraintType.In, s._name, Aspect.attribute_id, sids));
        let q = await SqlQuery.build(this.ctx, s);
        q.addLazyAttributes(info.attributes.values());
        let from: SqlBinding = maker.from_sub(q.sql_select(), q_n.initialFromTable!);
        q_n.from.sql = from.sql;
        q_n.from.bind = from.bind;
        nids = await q_np1.execute_ids();
        for (let [k, id] of nids)
          ids.set(k, id);
      }

      let fids = [...ids.values()].map(i => i._id);
      let s = q_n.set.clone(`${q_n.set._name}[*]`);
      s.typeConstraints.splice(0, 1); // Remove the recursion type
      s.constraints.push(new ConstraintValue(ConstraintType.In, s._name, Aspect.attribute_id, fids));
      let q_all = await SqlQuery.build(this.ctx, s);
      q_all.addLazyAttributes(info.attributes.values());
      this.addInitialFrom(maker.from_sub(q_all.sql_select(), alias), alias, keys, keys.map(k => (this.ctx.maker.column(alias, k.name))));
    }
  }

  setInitialRecursion(q_n: SqlMappedQuery) {
    this.hasSub = true;
    this.mappers = q_n.mappers;
    super.setInitialRecursion(q_n);
  }

  sql_column(attribute: Aspect.InstalledAttribute, required?: true): SqlBinding
  sql_column(attribute: Aspect.InstalledAttribute, required: false): SqlBinding | undefined
  sql_column(attribute: Aspect.InstalledAttribute, required: boolean = true): SqlBinding | undefined {


    if (attribute.isVirtualValue()) {
      let metadata = (attribute.type as Aspect.Type.VirtualType).metadata;
      if (metadata.operator === "$is_last") {
        let sql_select_count: SqlBinding = this.sql_sub_count_virtual(this.set,attribute,ConstraintType.Equal,0);
        return sql_select_count;
        //let b = this.ctx.maker.op_bind(sql_select_count,(value === true) ? ConstraintType.Equal : ConstraintType.NotEqual, 0);
      } else {
        throw new Error(`virtual operator ${metadata.operator} is not implemented`);
      }
    }

    let lsqlattr: SqlMappedAttribute | undefined;
    for (let mapper of this.mappers) {
      lsqlattr = mapper.get(attribute.name);
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
      return  this.ctx.maker.column(this.initialFromTable!, attribute.name);
    }
  }

  table(path: SqlPath[]): string {
    let key = "";
    let ret: string | undefined = "";
    let maker = this.ctx.maker;
    let prev = this.initialFromKeyColumns[1];
    for (let p of path) {
      key += JSON.stringify([p.table, p.key]);
      ret = this.tables.get(key);
      if (!ret) {
        ret = this.nextAlias();
        let sql_join = maker.join(
          this.inner_join ? "inner" : "left",
          p.table, ret,
          maker.compare(prev, ConstraintType.Equal, maker.column(ret, p.key))
        );
        this.joins.push(sql_join);
        this.tables.set(key, ret);
      }
      prev = maker.column(ret, p.value);
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
    let aspects = [...this.mappers].map(m => cc.aspectChecked(m.name)!);
    this.addAttribute(Aspect.attribute_id);
    this.addAttribute(Aspect.attribute_version);
    // TODO: share mono attributes computation with execution work
    for (let a of this.monoAttributes(aspects))
      this.addAttribute(a);
    super.buildConstraints();
  }

  monoAttributes(aspects: Iterable<Aspect.Installed>) : IterableIterator<Aspect.InstalledAttribute> {
    let monoAttributes = new Set<Aspect.InstalledAttribute>();
    if (this.set.scope) {
      for (let aspect of aspects) {
        for (let a of this.set.scope.attributes(aspect.classname, '.'))
          if (a.isMonoValue())
            monoAttributes.add(a);
      }
    }
    return monoAttributes.values();
  }

  buildConstraintValue(
    var_set: ObjectSet, var_attribute: Aspect.InstalledAttribute,
    operator: DataSourceInternal.ConstraintBetweenAnyValueAndFixedValue,
    value: any
  ): SqlBinding {
    if (operator === ConstraintType.Text && var_attribute.name === "_id") {
      // TODO: add support for external full text search ?
      let constraints: SqlBinding[] = [];
      let attr = new Set<string>();
      for (let mapper of this.mappers) {
        let aspect = this.aspect(mapper.name);
        for (let a of aspect.attributes.values()) {
          if (a.type.asPrimitive() && !attr.has(a.name)) {
            attr.add(a.name);
            constraints.push(this.ctx.maker.op(this.buildVariable(var_set, var_attribute), operator, value));
          }
        }
      }
      return this.ctx.maker.or(constraints);
    }
    else {
      return super.buildConstraintValue(var_set, var_attribute, operator, value);
    }
  }

  sql_sub_count_lvar_intersects_value(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute, value: any) {
    return this.sql_sub_count_mutate(var_set, var_attribute, (sub_var_query) => {
      sub_var_query.addConstraint(this.ctx.maker.op(
        sub_var_query.sql_column(var_attribute),
        Array.isArray(value) ? ConstraintType.In : ConstraintType.Equal,
        value)
      );
    });
  }

  sql_sub_count_var(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute) {
    return this.sql_sub_count_mutate(var_set, var_attribute, (sub_var_query) => {
      sub_var_query.sql_column(var_attribute);
    });
  }

  sql_sub_count_lvar_intersects_rvar_single(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute, sql_right_column: SqlBinding) {
    return this.sql_sub_count_mutate(var_set, var_attribute, (sub_var_query) => {
      sub_var_query.addConstraint(this.ctx.maker.compare(
        sub_var_query.sql_column(var_attribute),
        ConstraintType.Equal,
        sql_right_column)
      );
    });
  }

  sql_sub_count_lvar_intersects_rvar_mult(
    lset: ObjectSet, lattribute: Aspect.InstalledAttribute,
    rset: ObjectSet, rattribute: Aspect.InstalledAttribute
  ) {
    let rvar_query = this.ctx.queries.get(rset)!;
    let cases = new Map<string, SqlBinding>();
    for (let rmapper of rvar_query.mappers) {
      let sql = this.sql_sub_count_mutate(lset, lattribute, (lsub_var_query) => {
        let rsub_var_set = new ObjectSet(rmapper.name);
        let rsub_var_query = new SqlMappedQuery(this.ctx, rsub_var_set);
        this.ctx.queries.set(rsub_var_set, rsub_var_query);
        rsub_var_query.setInitialType(rmapper.name, false);

        rsub_var_query.addConstraint(this.ctx.maker.compare(
          rsub_var_query.sql_column(Aspect.attribute_id),
          ConstraintType.Equal,
          rvar_query.sql_column(Aspect.attribute_id)
        ));

        lsub_var_query.variables.add(rsub_var_query);


        lsub_var_query.addConstraint(this.ctx.maker.compare(
          lsub_var_query.sql_column(lattribute),
          ConstraintType.Equal,
          rsub_var_query.sql_column(rattribute),
        ));
      });
      cases.set(rmapper.name, sql);
    }
    let sql_select_count: SqlBinding;
    if (cases.size === 1) {
      sql_select_count = [...cases.values()][0];
    }
    else {
      sql_select_count = this.ctx.maker.case(rvar_query.sql_column($is), cases);
    }
    return this.ctx.maker.sub(sql_select_count);
  }

  sql_sub_count_mutate(lset: DataSourceInternal.ObjectSet, lattribute: Aspect.InstalledAttribute, mutate: (sub_var_query: SqlMappedQuery) => void) {
    let lvar_query = this.ctx.queries.get(lset)!;
    let cases = new Map<string, SqlBinding>();
    for (let lmapper of lvar_query.mappers) {
      let lsub_var_set = new ObjectSet(lmapper.name);
      let lsub_var_query = new SqlMappedQuery(this.ctx, lsub_var_set);
      this.ctx.queries.set(lsub_var_set, lsub_var_query);
      lsub_var_query.setInitialType(lmapper.name, false);
      lsub_var_query.addConstraint(this.ctx.maker.compare(
        lsub_var_query.sql_column(Aspect.attribute_id),
        ConstraintType.Equal,
        lvar_query.sql_column(Aspect.attribute_id)
      ));
      mutate(lsub_var_query);
      let sql_select_count = lsub_var_query.sql_select_count();
      cases.set(lmapper.name, sql_select_count);
    }
    let sql_select_count: SqlBinding;
    if (cases.size === 1) {
      sql_select_count = [...cases.values()][0];
    }
    else {
      lvar_query.sql_column($is)
      sql_select_count = this.ctx.maker.case(lvar_query.sql_column($is), cases);
    }
    return this.ctx.maker.sub(sql_select_count);
  }


  sql_sub_count_virtual(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute,op:DataSourceInternal.ConstraintBetweenValueAndValue,value:number) {

    let metadata = (var_attribute.type as Aspect.Type.VirtualType).metadata;
    let lvar_query = this.ctx.queries.get(var_set)!;
    let cases = new Map<string, SqlBinding>();

    for (let lmapper of lvar_query.mappers) {
      let lsub_var_set = new ObjectSet(lmapper.name);
      let lsub_var_query = new SqlMappedQuery(this.ctx, lsub_var_set);
      this.ctx.queries.set(lsub_var_set, lsub_var_query);
      lsub_var_query.setInitialType(lmapper.name, false);

      metadata.group_by.map(g => {
        lsub_var_query.addConstraint(this.ctx.maker.compare(
          lsub_var_query.sql_column(g),
          ConstraintType.Equal,
          lvar_query.sql_column(g)
        ));
      });

      let prev: SqlBinding[]=[];
      let done: SqlBinding[]=[];

      metadata.sort.map(s => {

        let cur = this.ctx.maker.compare(
          lsub_var_query.sql_column(s.attribute),
          s.asc ? ConstraintType.GreaterThan : ConstraintType.LessThan,
          lvar_query.sql_column(s.attribute)
        )

        if (prev.length === 0)
          done.push ( cur )
        else if (prev.length>0)
          done.push ( this.ctx.maker.and([cur,...prev]) )

        prev.push(
          this.ctx.maker.compare(
            lsub_var_query.sql_column(s.attribute),
            ConstraintType.Equal,
            lvar_query.sql_column(s.attribute)
          )
        )

      })

      lsub_var_query.addConstraint(this.ctx.maker.or(done));
      let sql_select_count =  this.ctx.maker.sub(lsub_var_query.sql_select_count());
      let sql =  this.ctx.maker.sub(this.ctx.maker.op(sql_select_count,op,value));
      cases.set(lmapper.name, sql);
    }

    let sql_select_count: SqlBinding;
    if (cases.size === 1) {
      sql_select_count = [...cases.values()][0];
    }
    else {
      sql_select_count = this.ctx.maker.case(lvar_query.sql_column($is), cases);
    }

    return this.ctx.maker.sub(sql_select_count);
  }



  mapSingleValue(attribute: Aspect.InstalledAttribute, value) {
    let finalValue;
    let hasFinalValue = false;
    if (attribute.isVirtualValue()){
      finalValue = value;
      hasFinalValue = true;
    } else
    for (let mapper of this.mappers) {
      let a = mapper.get(attribute.name);
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
      sql_columns.unshift(this.ctx.maker.column_alias(this.ctx.maker.value(is), '$is'));
    }
    else {
      sql_columns.unshift(this.ctx.maker.column(this.initialFromTable!, '$is', '$is'));
    }
    return sql_columns;
  }

  async execute_ids(): Promise<Map<Identifier, { $is: string, _id: any, _version: number }>> {
    let ret = new Map<Identifier, { $is: string, _id: any, _version: number }>();
    let mono_query = this.sql_select();
    let mono_rows = await this.ctx.db.select(mono_query);
    for (let row of mono_rows) {
      let { $is, _id, _version } = row as any;
      let mapper = this.ctx.mappers[$is]!;
      let id = mapper.fromDbKey(mapper.attribute_id().fromDbKey(_id));
      let version = mapper.get("_version")!.fromDbKey(_version);
      ret.set(id, { $is: $is, _id: id, _version: version });
    }
    return ret;
  }

  async execute(): Promise<VersionedObject[]> {
    let ccc = this.ctx.ccc;
    let maker = this.ctx.maker;
    let snapshots = new Map<VersionedObject, VersionedObjectSnapshot>();
    let ret: VersionedObject[] = [];

    const loadMultValue = (rtype: string, rdb_id: any, rname: string, value: any) => {
      let rmapper = this.ctx.mappers[rtype]!;
      let rid = rmapper.fromDbKey(rmapper.attribute_id().fromDbKey(rdb_id));
      let rvo = ccc.findChecked(rid);
      let rsnapshot = snapshots.get(rvo)!;
      let rattribute = rvo.manager().aspect().attributes.get(rname)!;
      let rset = rsnapshot.attributeValueFast(rattribute);
      if (rset instanceof Set)
        rset.add(value);
      else
        rset.push(value);
    };

    const loadMonoRow = (row: any, prefix: string, path: string, mult_items: Map<Aspect.Installed, Map<Aspect.InstalledAttribute, Set<Identifier>>>) => {
      let type = row[prefix + "$is"];
      let db_id = row[prefix + "_id"];
      if (!type || !db_id)
        return;
      let mapper = this.ctx.mappers[type]!;
      let scope_path = this.set.scope.attributes(type, path);
      let id = mapper.fromDbKey(mapper.attribute_id().fromDbKey(db_id));
      let version = row[prefix + "_version"];
      let vo = ccc.findOrCreate(id, type);
      let snapshot = snapshots.get(vo);
      if (!snapshot)
        snapshots.set(vo, snapshot = new VersionedObjectSnapshot(vo.manager().aspect(), vo.id()));

      let rtype = row[prefix + "__ris"];
      if (rtype) {
        let rname = rtype && row[prefix + "__rname"];
        let rdb_id = rtype && row[prefix + "__rid"];
        loadMultValue(rtype, rdb_id, rname, vo);
      }

      if (path === '.')
        ret.push(vo);

      version = mapper.attribute_version().fromDb(version);
      snapshot.setAttributeValueFast(Aspect.attribute_version, version);
      for (let a of scope_path) {
        if (a.isMonoValue()) {
          let k = a.name;
          let v = row[prefix + k];
          if (!a.isVirtualValue()) {
            v = mapper.get(k)!.fromDb(v);
            v = this.loadValue(ccc, a, v);
            snapshot.setAttributeValueFast(a, v);
          } else {
            vo.manager().setVirtualAttributeValue(a.name, v);
          }

        }
        else {
          let m_attrs = mult_items.get(vo.manager().aspect());
          if (!m_attrs)
            mult_items.set(vo.manager().aspect(), m_attrs = new Map());
          let objects = m_attrs.get(a);
          if (!objects)
            m_attrs.set(a, objects = new Set());
          objects.add(id);
          snapshot.setAttributeValueFast(a, a.defaultValue());
        }
      }
    }
    const loadMultRows = async (mult_items: Map<Aspect.Installed, Map<Aspect.InstalledAttribute, Set<Identifier>>>, path: string) => {
      for (let [aspect, m_attrs] of mult_items) {
        for (let [attribute, ids] of m_attrs) {
          let types = attribute.contained_aspects;
          let attribute_path = `${path}${attribute.name}.`;
          if (types.size > 0) {
            for (let type_r of types) {
              let scope_path = this.set.scope.attributes(type_r.classname, attribute_path);
              let s_m = new ObjectSet(aspect.classname);
              let q_m = new SqlMappedQuery(this.ctx, s_m);
              let s_r = new ObjectSet(type_r.classname);
              let q_r = new SqlMappedQuery(this.ctx, s_r);
              this.ctx.queries.set(s_r, q_r);
              q_r.setInitialType(type_r.classname, false);
              q_r.addAttribute(Aspect.attribute_id);
              q_r.addAttribute(Aspect.attribute_version);
              for (let a of scope_path)
                q_r.addAttribute(a);

              this.ctx.queries.set(s_m, q_m);
              q_m.setInitialType(aspect.classname, false);
              q_m.addConstraint(q_m.buildConstraintValue(q_m.set, Aspect.attribute_id, ConstraintType.In, this.mapValue(Aspect.attribute_id, [...ids])));

              q_r.variables.add(q_m);
              q_r.addConstraint(this.ctx.maker.compare(q_r.sql_column(Aspect.attribute_id), ConstraintType.Equal, q_m.sql_column(attribute)));
              let sql_columns = q_r.sql_columns();
              sql_columns.push(maker.column_alias(maker.value(aspect.classname), `__ris`));
              sql_columns.push(maker.column_alias(maker.value(attribute.name), `__rname`));
              sql_columns.push(maker.column_alias(q_m.sql_column(Aspect.attribute_id), `__rid`));

              await doQuery(q_r, sql_columns, [type_r.classname], attribute_path);
            }
          }
          else { // array/set of primitive values
            let s_m = new ObjectSet(aspect.classname);
            let q_m = new SqlMappedQuery(this.ctx, s_m);
            this.ctx.queries.set(s_m, q_m);
            q_m.setInitialType(aspect.classname, false);
            q_m.addAttribute(Aspect.attribute_id);
            q_m.addAttribute(attribute);
            q_m.addConstraint(q_m.buildConstraintValue(q_m.set, Aspect.attribute_id, ConstraintType.In, this.mapValue(Aspect.attribute_id, [...ids])));
            let sql_select = q_m.sql_select();
            let rows = await this.ctx.db.select(sql_select);
            for (let row of rows) {
              let _id = row["_id"];
              let value = row[attribute.name];
              loadMultValue(aspect.classname, _id, attribute.name, value);
            }
          }
        }
      }
    };
    const doQuery = async (query: SqlMappedQuery, sql_columns: (string | SqlBinding)[], types: string[], path: string) => {
      // add 1:1 relations
      let relation_11_paths: string[] = [];
      for (let type of types) {
        let scope_path = this.set.scope.attributes(type, path);
        for (let a of scope_path) {
          if (a.isMonoVersionedObjectValue()) { // 1:1 relation
            let path_r = `${path}${a.name}.`;
            for (let type_r of a.contained_aspects) {
              let scope_path_r = this.set.scope.attributes(type_r.classname, path_r);
              if (scope_path_r.size > 0) { // 1:1 relation with attributes requested
                // TODO: reuse existing variable if possible
                let s_r = new ObjectSet(type_r.classname);
                let q_r = new SqlMappedQuery(this.ctx, s_r);
                let relation_idx = relation_11_paths.length;
                relation_11_paths.push(path_r);
                q_r.setInitialType(type_r.classname, false, { query: query, attribute: a });
                query.variables.add(q_r);
                sql_columns.push(maker.column_alias(maker.value(type_r.classname), `${relation_idx}:$is`));
                sql_columns.push(maker.column_alias(q_r.sql_column(Aspect.attribute_id), `${relation_idx}:_id`));
                sql_columns.push(maker.column_alias(q_r.sql_column(Aspect.attribute_version), `${relation_idx}:_version`));
                for (let a of scope_path_r)
                  sql_columns.push(maker.column_alias(q_r.sql_column(a), `${relation_idx}:${a.name}`));
                relation_idx++;
              }
            }
          }
        }
      }
      let mono_query = this.ctx.maker.select(
        sql_columns,
        query.sql_from(),
        query.sql_join(),
        query.sql_where(),
        query.sql_sort(),
      );
      let mono_rows = await this.ctx.db.select(mono_query);
      let mult_items = [new Map<Aspect.Installed, Map<Aspect.InstalledAttribute, Set<Identifier>>>()];
      for (let [idx, path] of relation_11_paths.entries())
        mult_items[idx + 1] = new Map();
      for (let row of mono_rows) {
        loadMonoRow(row, '', path, mult_items[0]);
        for (let [idx, path] of relation_11_paths.entries())
          loadMonoRow(row, `${idx}:`, path, mult_items[idx + 1]);
      }
      await loadMultRows(mult_items[0], path);
      for (let [idx, path] of relation_11_paths.entries())
        await loadMultRows(mult_items[idx + 1], path);
    };
    await doQuery(this, this.sql_columns(), [...this.mappers].map(m => m.name), '.');
    this.mergeSnapshots(snapshots);
    return ret;
  }

  private loadValue(ccc: ControlCenterContext, attribute: Aspect.InstalledAttribute, value) {
    if (value === null)
      value = undefined;
    else if (attribute.isMonoVersionedObjectValue() && value !== undefined) {
      // TODO: fix this limitation (ie. classname should not come for the attribute type)
      let classname = attribute.containedVersionedObjectIfAlone()!.classname;
      let mapper = this.ctx.mappers[classname];
      let subid = mapper.fromDbKey(value);
      value = ccc.findOrCreate(subid, classname);
    }
    return value;
  }
}
