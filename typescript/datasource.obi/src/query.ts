import {Aspect, DataSource, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, AComponent} from '@openmicrostep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlBinding, SqlMaker, SqlQuery, SqlQuerySharedContext, DBConnectorCRUD} from '@openmicrostep/aspects.sql';
import {ObiDefinition, SysObiDefinition, getOne, ObiDataSource} from './index.priv';
import ConstraintValue = DataSourceInternal.ConstraintValue;

function mapIfExists<I, O>(arr: I[] | undefined, map: (v: I, idx: number) => O) : O[] | undefined {
  return arr ? arr.map(map) : undefined;
}

export function mapValue(def: ObiDefinition, ctx: ObiSharedContext, value, isId: boolean) {
  if (value instanceof VersionedObject) {
    value = value.id();
  }
  return value;
}

export interface ObiSharedContext extends SqlQuerySharedContext<ObiSharedContext, ObiQuery> {
  db: DBConnectorCRUD,
  config: ObiDataSource.Config,
  systemObiByName: Map<string, SysObiDefinition>,
  systemObiById: Map<number, SysObiDefinition>,
  car_entityid: number,
  car_type: ObiDefinition,
  car_table: ObiDefinition,
}

const __is = "f4e21b09-793d-447a-b92c-5a2e76d939f2";

export namespace ObiQuery {
  export interface CarInfo {
    car: ObiDefinition;
    type: ObiDefinition;
    table: string;
    relation: boolean;
  }
}
export class ObiQuery extends SqlQuery<ObiSharedContext> {
  mappers = new Set<SysObiDefinition>();
  tables = new Map<string, string>();
  sub_id_columns: string[] = [];
  sub_is_columns: string[] = [];
  cars = new Map<string, { 
    da: Map<string, ObiQuery.CarInfo>,
    ra: Map<string, ObiQuery.CarInfo>,
    do: Map<number, Aspect.InstalledAttribute>,
    ro: Map<number, Aspect.InstalledAttribute>,
  }>();

  setInitialType(name: string, instanceOf: boolean): void {
    let is = this.ctx.systemObiByName.get(this.ctx.config.aspectClassname_to_ObiEntity(name));
    if (!is)
      throw new Error(`system object named '${name}' not found`);
    this.mappers.add(is);

    this.addDefaultInitialFrom();
    this.fromConditions.push(this.ctx.maker.op(this.ctx.maker.column(this.initialFromTable!, "VAL"), ConstraintType.Equal, is._id));
  }

  setInitialUnion(queries: ObiQuery[]) {
    let maker = this.ctx.maker;
    let table = this.nextAlias();
    let keys = queries[0].initialFromKeys;
    let from = maker.from_sub(maker.union(queries.map(q => q.sql_select_id())), table);
    this.addDefaultInitialFrom();
    this.addInitialFrom(from, table, keys, keys.map(k => ({ sql: this.ctx.maker.column(table, k), bind: [] })));
  }

  setInitialRecursion(q_n: ObiQuery) {
    let maker = this.ctx.maker;
    let c = q_n.initialFromKeys.map(k => ({ sql: this.ctx.maker.column(q_n.initialFromTable!, k), bind: [] }));
    this.addDefaultInitialFrom();
    this.addInitialFrom(q_n.from[0], q_n.initialFromTable!, q_n.initialFromKeys, c);
  }

  async setInitialUnionOfAlln(q_0: ObiQuery, q_n: ObiQuery, q_np1: ObiQuery): Promise<void> {
    let maker = this.ctx.maker;
    let keys = q_0.initialFromKeys;
    let alias = this.nextAlias();
    this.addDefaultInitialFrom();
    if (maker.select_with_recursive) {
      let u_n = q_n.initialFromTable!;
      let sql_from = maker.select_with_recursive([maker.quote("_id")], q_0.sql_select_id(), u_n, q_np1.sql_select_id());
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
        let q = await SqlQuery.build(this.ctx, s) as ObiQuery;
        let from: SqlBinding = maker.from_sub(q.sql_select_id(), q_n.initialFromTable!);
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
      let q_all = await SqlQuery.build(this.ctx, s) as ObiQuery;
      this.addInitialFrom(maker.from_sub(q_all.sql_select_id(), alias), alias, keys, keys.map(k => ({ sql: this.ctx.maker.column(alias, k), bind: [] })));
    }
  }

  sql_select_id(): SqlBinding {
    return this.ctx.maker.select(
      [this.ctx.maker.column(this.initialFromTable!, "VAL_INST", "_id")],
      this.sql_from(), 
      this.sql_join(),
      this.sql_where()
    );
  }

  addDefaultInitialFrom() {
    if (this.initialFromTable)
      return;
    let alias = this.nextAlias();
    let table = "TJ_VAL_ID";
    let key = "VAL_INST";
    let sql_from = this.ctx.maker.from(table, alias);
    let keys = ["_id"];
    let sql_key_columns = [{ sql: this.ctx.maker.column(alias, key), bind: [] }];
    this.tables.set("_id", alias);
    this.addInitialFrom(sql_from, alias, keys, sql_key_columns);
  }

  addInitialFrom(sql_from: SqlBinding, table: string, keys: string[], sql_key_columns: SqlBinding[]) {
    if (!this.initialFromTable)
      this.fromConditions.push(this.ctx.maker.op(this.ctx.maker.column(table, "VAL_CAR"), ConstraintType.Equal, this.ctx.car_entityid));
    super.addInitialFrom(sql_from, table, keys, sql_key_columns);
    if (!this.columns.has('_is')) {
      this.columns.set('_is', this.ctx.maker.column(this.initialFromTable!, "VAL"));
      this.columns_ordered.push('_is');
    }
  }

  aspect(is_system_name: string) {
    let aname = this.ctx.config.obiEntity_to_aspectClassname(is_system_name);
    let aspect = this.ctx.controlCenter.aspectChecked(aname);
    return aspect;
  }

  aspectAttribute(attribute: string) {
    if (this.mappers.size > 0) {
      for (let is of this.mappers) {
        let a = this.aspect(is.system_name).attributes.get(attribute);
        if (a)
          return a;
      }
    }
    else {
      for (let cstor of this.ctx.controlCenter.installedAspectConstructors()) {
        let a = cstor.aspect.attributes.get(attribute);
        if (a)
          return a;
      }
    }
    throw new Error(`aspect attribute ${attribute} not found in ${[...this.mappers].map(m => m.system_name).join(', ')}`);
  }

  obiCar(attribute: string) {
    return this.ctx.systemObiByName.get(this.ctx.config.aspectAttribute_to_ObiCar(attribute));
  }

  mk_car_info(car: ObiDefinition, relation: boolean): ObiQuery.CarInfo {
    let type = car && getOne(car, this.ctx.car_type) as ObiDefinition;
    if (!type)
      throw new Error(`caracteristic ${car.system_name!} has no type`);
    let table = getOne(type, this.ctx.car_table, type.system_name!) as string;
    return {
      car: car,
      type: type,
      table: "TJ_VAL_" + table,
      relation: relation,
    };
  }

  car_info(attribute: string): ObiQuery.CarInfo {
    let car = this.obiCar(attribute);
    if (car) return this.mk_car_info(car, false);
    else {
      let a = this.aspectAttribute(attribute);
      if (a.relation) {
        let other_is_name = this.ctx.config.aspectClassname_to_ObiEntity(a.relation.class);
        let other_is = this.ctx.systemObiByName.get(other_is_name);
        if (!other_is)
          throw new Error(`obi ${other_is_name} not found`);
        let other_car = this.ctx.systemObiByName.get(this.ctx.config.aspectAttribute_to_ObiCar(a.relation.attribute));
        if (!other_car)
          throw new Error(`caracteristic ${a.relation.attribute} not found`);
        return this.mk_car_info(other_car, true);
      }
    }
    throw new Error(`caracteristic ${attribute} not found`);
  }

  sql_column(attribute: string, required?: true): string
  sql_column(attribute: string, required: false): string | undefined
  sql_column(attribute: string, required: boolean = true): string | undefined {
    let maker = this.ctx.maker;
    if (attribute !== "_id") {
      let table = this.tables.get(attribute);
      let car_info = this.car_info(attribute);
      if (!table) {
        table = this.nextAlias();
        this.tables.set(attribute, table);
        this.joins.push(maker.left_join(car_info.table, table, maker.and([
          maker.compare(maker.column(table, car_info.relation ? "VAL" : "VAL_INST"), ConstraintType.Equal, maker.column(this.initialFromTable!, "VAL_INST")),
          maker.op(maker.column(table, "VAL_CAR" ), ConstraintType.Equal, car_info.car._id),
        ])));
      }
      return maker.column(table, car_info.relation ? "VAL_INST" : "VAL");
    }
    else {
      return maker.column(this.initialFromTable!, "VAL_INST");
    }
  }

  buildConstraintValue(var_set: ObjectSet, var_attribute: string, operator: DataSourceInternal.ConstraintOnValueTypes, value: any): SqlBinding {
    if (operator === ConstraintType.Text && var_attribute === "_id") {
      // obi make full text search on the whole object attributes easy and fast
      let alias = this.nextAlias();
      let maker = this.ctx.maker;
      this.joins.push(maker.left_join("TJ_VAL_STR", alias, maker.compare(maker.column(alias, "VAL_INST"), ConstraintType.Equal, maker.column(this.initialFromTable!, this.initialFromKeys[1]))));
      return maker.op(maker.column(alias, "VAL"), ConstraintType.Text, value);
    }
    else {
      if (operator === ConstraintType.Has)
        operator = ConstraintType.Equal;
      return super.buildConstraintValue(var_set, var_attribute, operator, value);
    }
  }

  mapValue(attribute: string, value) {
    if (value instanceof VersionedObject) {
      value = value.id();
    }
    if (attribute === "_id")
      return value;
    return this.ctx.config.aspectValue_to_obiValue(value, attribute);
  }
  
  async execute_ids(): Promise<Map<Identifier, { __is: string, _id: any, _version: number }>> {
    let ret = new Map<Identifier, { __is: string, _id: any, _version: number }>();
    let mono_query = this.sql_select();
    let mono_rows = await this.ctx.db.select(mono_query);
    for (let row of mono_rows) {
      let { __is, _id, _version } = row as any;
      let is = this.ctx.config.obiEntity_to_aspectClassname(__is)
      ret.set(_id, { __is: is, _id: _id, _version: _version });
    }
    return ret;
  }

  buildConstraints() {
    this.addDefaultInitialFrom();
    this.addAttribute("_id");
    if (this.set.scope)
      this.buildScopeTree(this.set.scope);
    super.buildConstraints();
  }

  buildScopeTree(scope: Iterable<string>) {
    let dt = [{ table: this.initialFromTable!, or: [] }];
    let rt = [{ table: this.initialFromTable!, or: [] }];
    let clean_scope = new Set(scope);
    clean_scope.add("_version");
    if (this.mappers.size > 0) {
      for (let is of this.mappers) {
        let aspect = this.aspect(is.system_name);
        this.buildScopeTreeItem(aspect, clean_scope, 1, new Set(), dt, rt);
      }
    }
    else {
      for (let cstor of this.ctx.controlCenter.installedAspectConstructors()) {
        this.buildScopeTreeItem(cstor.aspect, clean_scope, 1, new Set(), dt, rt);
      }
    }
    this.buildScopeJoins(dt, rt, false);
    this.buildScopeJoins(dt, rt, true);
  }

  buildScopeJoins(dt: ({ table: string, or: number[] } | undefined)[], rt: ({ table: string, or: number[] } | undefined)[], relation: boolean) {
    let maker = this.ctx.maker;
    let t = relation ? rt : dt;
    for (let lvl = 1; lvl < t.length; lvl++) {
      let sub_table = t[lvl];
      if (sub_table) {
        let pdt = dt[lvl - 1];
        let prt = rt[lvl - 1];
        let or : SqlBinding[] = [];
        if (pdt)
          or.push(maker.compare(maker.column(sub_table.table, relation ? "VAL" : "VAL_INST"), 
            ConstraintType.Equal, maker.column(pdt.table, "VAL_INST")));
        if (prt && lvl > 1)
          or.push(maker.compare(maker.column(sub_table.table, relation ? "VAL" : "VAL_INST"), 
            ConstraintType.Equal, maker.column(prt.table, "VAL_INST")));
        this.joins.push(maker.left_join("TJ_VAL_ID", sub_table.table, maker.and([
          maker.or(or), // sub id relation
          this.ctx.maker.op(this.ctx.maker.column(sub_table.table, "VAL_CAR"), ConstraintType.In, sub_table.or), // sub car relation
        ])));
        let table_is = this.nextAlias();
        this.joins.push(maker.left_join("TJ_VAL_ID", table_is, maker.and([
          maker.compare(
            maker.column(table_is, "VAL_INST"), 
            ConstraintType.Equal, 
            maker.column(sub_table.table, relation ? "VAL_INST" : "VAL")
          ),
          maker.op(maker.column(table_is, "VAL_CAR"), ConstraintType.Equal, this.ctx.car_entityid),
        ])));
        this.sub_is_columns.push(maker.column(table_is, "VAL", `_sis${this.sub_is_columns.length}`));
        this.sub_id_columns.push(maker.column(sub_table.table, relation ? "VAL_INST" : "VAL", `_sid${this.sub_id_columns.length}`));
      }
    }
  }

  buildScopeTreeItem(
    aspect: Aspect.Installed, scope: Iterable<string>, 
    lvl: number, stack: Set<string>,
    dt: ({ table: string, or: number[] } | undefined)[], rt: ({ table: string, or: number[] } | undefined)[]
  ) {
    let sub_cars = new Set<ObiQuery.CarInfo>();
    for (let k of scope) {
      let a = aspect.attributes.get(k);
      if (a) {
        let car_info = this.car_info(k);
        let sub_names = Aspect.typeToAspectNames(a.type);
        if (sub_names.length) {
          stack.add(k);
          for (let sub_name of sub_names) {
            sub_cars.add(car_info);
            let aspect = this.ctx.controlCenter.aspectChecked(sub_name);
            this.buildScopeTreeItem(aspect, scope, lvl + 1, stack, dt, rt);
          }
          stack.delete(k);
        }
        let drcars = this.cars.get(car_info.table);
        if (!drcars)
          this.cars.set(car_info.table, drcars = { da: new Map(), ra: new Map(), do: new Map(), ro: new Map() });
        let cars_a = car_info.relation ? drcars.ra : drcars.da;
        let cars_o = car_info.relation ? drcars.ro : drcars.do;
        let car = cars_a.get(k);
        if (!car) {
          cars_a.set(k, car_info);
          cars_o.set(car_info.car._id!, a);
        }
      }
    }
    for (let car_info of sub_cars) {
      let tables = car_info.relation ? rt : dt;
      let sub_table = tables[lvl];
      if (!sub_table)
        tables[lvl] = sub_table = { table: this.nextAlias(), or: [] };
      sub_table.or.push(car_info.car._id!)
    }
  }

  sql_columns() {
    let ret = super.sql_columns();
    ret.push(...this.sub_id_columns);
    ret.push(...this.sub_is_columns);
    return ret;
  }

  async execute(): Promise<VersionedObject[]> {
    let cc = this.ctx.controlCenter;
    let query_instances = this.sql_select();
    let rows_intances = await this.ctx.db.select(query_instances);
    if (rows_intances.length === 0)
      return [];
    let ret: VersionedObject[] = [];
    let added = new Set<VersionedObject>();
    let ids = new Set<number>();
    let remotes = new Map<VersionedObject, Map<string, any>>();
    let id_columns = [["_is", "_id"]];
    for (let i = 0; i < this.sub_id_columns.length; i++)
      id_columns.push([`_sis${i}`, `_sid${i}`]);
    for (let row of rows_intances) {
      for (let c_idx = 0; c_idx < id_columns.length; c_idx++) {
        let c = id_columns[c_idx];
        let is = row[c[0]];
        let id = row[c[1]];
        if (id && is) {
          let vo = cc.registeredObject(id);
          if (!vo) {
            let isname = this.ctx.systemObiById.get(is)!.system_name;
            let aname = this.ctx.config.obiEntity_to_aspectClassname(isname);
            vo = new (cc.aspectConstructorChecked(aname))();
          }
          let manager = vo.manager();
          cc.registerObjects(this.ctx.component, [vo]);
          manager.setId(id);
          ids.add(id);
          let remoteAttributes = remotes.get(vo);
          if (!remoteAttributes) {
            remotes.set(vo, remoteAttributes = new Map<string, any>());
            if (this.set.scope) {
              let attributes = manager.aspect().attributes;
              for (let aname of this.set.scope) {
                let a = attributes.get(aname);
                if (a) {
                  let d: undefined | Set<any> | any[] = undefined;
                    if (a.type.type === "set")
                      d = new Set();
                    else if (a.type.type === "array")
                      d = [];
                    remoteAttributes.set(a.name, d);
                }
              }
            }
          }
          if (c_idx === 0 && !added.has(vo)) {
            ret.push(vo);
            added.add(vo);
          }
        }
      }
    }

    let arr_ids = [...ids];
    const loadAttributes = async (sql_select: SqlBinding, cars_a: Map<number, Aspect.InstalledAttribute>) => {
      let row_values = await this.ctx.db.select(sql_select);
      for (let row of row_values) {
        let {is, _id, car_id, value} = row as {is?: number, _id: number, car_id: number, value: string};
        let vo = cc.registeredObject(_id)!;
        let remoteAttributes = remotes.get(vo)!;
        let a = cars_a.get(car_id)!;
        value = this.ctx.config.obiValue_to_aspectValue(value, a.name);
        if (a.type.type === "set" || a.type.type === "array") {
          let c = remoteAttributes.get(a.name);
          value = this.loadValue(this.ctx.component, a.type.itemType, value, is);
          if (a.type.type === "set")
            c.add(value);
          else // array
            c.push(value);
        }
        else {
          value = this.loadValue(this.ctx.component, a.type, value, is);
          remoteAttributes.set(a.name, value);
        }
      }
    }
    for (let [table, drcars] of this.cars) {
      let car_ids = [...drcars.da.values()].map(i => i.car._id!);
      if (car_ids.length)
        await loadAttributes(mk_query(this.ctx, table, "VAL_INST", "VAL", arr_ids, car_ids), drcars.do);
      car_ids = [...drcars.ra.values()].map(i => i.car._id!);
      if (car_ids.length)
        await loadAttributes(mk_query(this.ctx, table, "VAL", "VAL_INST", arr_ids, car_ids), drcars.ro);
    }
    this.mergeRemotes(remotes);
    return ret;
  }

  loadValue(component: AComponent, type: Aspect.Type, value, is: number | undefined) {
    if (typeof is === "number") {
      let subid = value;
      value = this.ctx.controlCenter.registeredObject(subid);
      if (!value) {
        let obi_is = this.ctx.systemObiById.get(is)!;
        let classname = this.ctx.config.obiEntity_to_aspectClassname(obi_is.system_name!);
        value = new (this.ctx.controlCenter.aspectConstructorChecked(classname))();
        value.manager().setId(subid);
        this.ctx.controlCenter.registerObjects(component, [value]);
      }
    }
    return value;
  }
}

function mk_query(ctx: ObiSharedContext, table: string, id_column: string, val_column: string, ids: number[], car_ids: number[]) {
  let columns = [
    ctx.maker.column(table, id_column , "_id"   ),
    ctx.maker.column(table, "VAL_CAR" , "car_id"),
    ctx.maker.column(table, val_column, "value" ),
  ];
  let from = [ctx.maker.from(table)];
  let and = [
    ctx.maker.op(ctx.maker.column(table, id_column), ConstraintType.In, ids),
    ctx.maker.op(ctx.maker.column(table, "VAL_CAR"), ConstraintType.In, car_ids),
  ];
  if (table === "TJ_VAL_ID") {
    columns.push(ctx.maker.column("AIS", "VAL", "is"));
    from.push(ctx.maker.from("TJ_VAL_ID", "AIS"));
    and.push(ctx.maker.compare(ctx.maker.column("AIS", "VAL_INST"), ConstraintType.Equal, ctx.maker.column(table, val_column)))
    and.push(ctx.maker.op(ctx.maker.column("AIS", "VAL_CAR"), ConstraintType.Equal, ctx.car_entityid))
  }
  let query = ctx.maker.select(columns, from, [], ctx.maker.and(and));
  return query;
}

