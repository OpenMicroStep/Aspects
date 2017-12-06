import {
  Aspect, Identifier, ControlCenterContext,
  VersionedObject, VersionedObjectManager, VersionedObjectSnapshot,
  DataSourceInternal,
} from '@openmicrostep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlBinding, SqlQuery, SqlQuerySharedContext, DBConnector} from '@openmicrostep/aspects.sql';
import {ObiDefinition, SysObiDefinition, getOne, ObiDataSource} from './index.priv';
import ConstraintValue = DataSourceInternal.ConstraintValue;
import scope_at_type_path = DataSourceInternal.ResolvedScope.scope_at_type_path;

export function mapValue(def: ObiDefinition, ctx: ObiSharedContext, value, isId: boolean) {
  if (value instanceof VersionedObject) {
    value = value.id();
  }
  return value;
}

export interface ObiSharedContext extends SqlQuerySharedContext<ObiSharedContext, ObiQuery> {
  db: DBConnector.CRUD;
  config: ObiDataSource.Config;
  systemObiByName: Map<string, SysObiDefinition>;
  systemObiById: Map<number, SysObiDefinition>;
  car_entityid: number;
  car_type: ObiDefinition;
  car_table: ObiDefinition;
}

export namespace ObiQuery {
  export interface CarInfo {
    car: ObiDefinition;
    type: ObiDefinition;
    table: string;
    direct: boolean;
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
    let c = q_n.initialFromKeys.map(k => ({ sql: this.ctx.maker.column(q_n.initialFromTable!, k), bind: [] }));
    this.addDefaultInitialFrom();
    this.addInitialFrom(q_n.from, q_n.initialFromTable!, q_n.initialFromKeys, c);
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
        s.constraints.push(new ConstraintValue(ConstraintType.In, s._name, Aspect.attribute_id, sids));
        let q = await SqlQuery.build(this.ctx, s) as ObiQuery;
        let from: SqlBinding = maker.from_sub(q.sql_select_id(), q_n.initialFromTable!);
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
      let q_all = await SqlQuery.build(this.ctx, s) as ObiQuery;
      this.addInitialFrom(maker.from_sub(q_all.sql_select_id(), alias), alias, keys, keys.map(k => ({ sql: this.ctx.maker.column(alias, k), bind: [] })));
    }
  }

  sql_select_id(): SqlBinding {
    return this.ctx.maker.select(
      [this.ctx.maker.column_alias(this.initialFromKeyColumns[0].sql, "_id")],
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
    if (!this.columns.has('__is')) {
      this.columns.set('__is', this.ctx.maker.column(this.initialFromTable!, "VAL"));
      this.columns_ordered.push('__is');
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
      for (let aspect of this.ctx.controlCenter.installedAspects()) {
        let a = aspect.attributes.get(attribute);
        if (a)
          return a;
      }
    }
    throw new Error(`aspect attribute ${attribute} not found in ${[...this.mappers].map(m => m.system_name).join(', ')}`);
  }

  obiCar(attribute: string) {
    return this.ctx.systemObiByName.get(this.ctx.config.aspectAttribute_to_ObiCar(attribute));
  }

  mk_car_info(car: ObiDefinition, direct: boolean): ObiQuery.CarInfo {
    let type = car && getOne(car, this.ctx.car_type) as ObiDefinition;
    if (!type)
      throw new Error(`caracteristic ${car.system_name!} has no type`);
    let table = getOne(type, this.ctx.car_table, type.system_name!) as string;
    return {
      car: car,
      type: type,
      table: "TJ_VAL_" + table,
      direct: direct,
    };
  }

  car_info(attribute: string): ObiQuery.CarInfo {
    let car = this.obiCar(attribute);
    if (car) return this.mk_car_info(car, true);
    else {
      let a = this.aspectAttribute(attribute);
      if (a.relation) {
        let other_is_name = this.ctx.config.aspectClassname_to_ObiEntity(a.relation.class.classname);
        let other_is = this.ctx.systemObiByName.get(other_is_name);
        if (!other_is)
          throw new Error(`obi ${other_is_name} not found`);
        let other_car = this.ctx.systemObiByName.get(this.ctx.config.aspectAttribute_to_ObiCar(a.relation.attribute.name));
        if (!other_car)
          throw new Error(`caracteristic ${a.relation.attribute} not found`);
        return this.mk_car_info(other_car, false);
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
        this.joins.push(maker.join("left", car_info.table, table, maker.and([
          maker.compare(maker.column(table, column_id(car_info.direct)), ConstraintType.Equal, this.initialFromKeyColumns[0].sql),
          maker.op(maker.column(table, "VAL_CAR" ), ConstraintType.Equal, car_info.car._id),
        ])));
      }
      return maker.column(table, column_val(car_info.direct));
    }
    else {
      return this.initialFromKeyColumns[0].sql;
    }
  }

  buildConstraintValue(var_set: ObjectSet, var_attribute: Aspect.InstalledAttribute, operator: DataSourceInternal.ConstraintBetweenAnyValueAndFixedValue, value: any): SqlBinding {
    if (operator === ConstraintType.Text && var_attribute.name === "_id") {
      // obi make full text search on the whole object attributes easy and fast
      let alias = this.nextAlias();
      let maker = this.ctx.maker;
      this.joins.push(maker.join("left", "TJ_VAL_STR", alias, maker.compare(maker.column(alias, "VAL_INST"), ConstraintType.Equal, this.sql_column("_id"))));
      return maker.op(maker.column(alias, "VAL"), ConstraintType.Text, value);
    }
    else {
      return super.buildConstraintValue(var_set, var_attribute, operator, value);
    }
  }

  sql_sub_count_lvar_intersects_value(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute, value: any) {
    return this.sql_sub_count_mutate(
      var_set, var_attribute,
      (sql_left_column) => this.ctx.maker.op(sql_left_column,  Array.isArray(value) ? ConstraintType.In : ConstraintType.Equal, value)
    );
  }

  sql_sub_count_var(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute) {
    return this.sql_sub_count_mutate(var_set, var_attribute, undefined);
  }

  sql_sub_count_lvar_intersects_rvar_single(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute, sql_right_column: string) {
    return this.sql_sub_count_mutate(
      var_set, var_attribute,
      (sql_left_column) => this.ctx.maker.compare(sql_left_column, ConstraintType.Equal, sql_right_column)
    );
  }

  sql_sub_count_mutate(var_set: DataSourceInternal.ObjectSet, var_attribute: Aspect.InstalledAttribute, mutate?: (sql_left_column: string) => SqlBinding) {
    let maker = this.ctx.maker;
    let columns = [maker.column_count()];
    let joins: SqlBinding[] = [];
    let lcar = this.car_info(var_attribute.name);
    let and = [
      maker.compare(maker.column(lcar.table, column_id(lcar.direct)), ConstraintType.Equal, this.buildVariable(var_set, Aspect.attribute_id)),
      maker.op(maker.column(lcar.table, "VAL_CAR"), ConstraintType.Equal, lcar.car._id),
    ];
    if (mutate)
      and.push(mutate(maker.column(lcar.table, column_val(lcar.direct))));
    let query = maker.sub(maker.select(
      [maker.column_count()],
      maker.from(lcar.table), [],
      maker.and(and)
    ));
    return query;
  }

  sql_sub_count_lvar_intersects_rvar_mult(
    lset: ObjectSet, lattribute: Aspect.InstalledAttribute,
    rset: ObjectSet, rattribute: Aspect.InstalledAttribute
  ) {
    let maker = this.ctx.maker;
    let columns = [maker.column_count()];
    let joins: SqlBinding[] = [];
    let lcar = this.car_info(lattribute.name);
    let rcar = this.car_info(rattribute.name);
    let ltable = this.nextAlias();
    let rtable = this.nextAlias();
    let query = maker.sub(maker.select(
      [maker.column_count()],
      maker.from(lcar.table, ltable), [maker.join("", rcar.table, rtable)],
      maker.and([
        maker.compare(maker.column(ltable, column_id(lcar.direct)), ConstraintType.Equal, this.buildVariable(lset, Aspect.attribute_id)),
        maker.op(maker.column(ltable, "VAL_CAR"), ConstraintType.Equal, lcar.car._id),
        maker.compare(maker.column(rtable, column_id(rcar.direct)), ConstraintType.Equal, this.buildVariable(rset, Aspect.attribute_id)),
        maker.op(maker.column(rtable, "VAL_CAR"), ConstraintType.Equal, rcar.car._id),
        maker.compare(maker.column(ltable, column_val(lcar.direct)), ConstraintType.Equal, maker.column(rtable, column_val(rcar.direct))),
      ])
    ));
    return query;
  }

  mapSingleValue(attribute: Aspect.InstalledAttribute, value) {
    if (value instanceof VersionedObject) {
      value = value.id();
    }
    if (attribute.name === "_id")
      return value;
    return this.ctx.config.aspectValue_to_obiValue(value, attribute);
  }

  async execute_ids(): Promise<Map<Identifier, { __is: string, _id: any, _version: number }>> {
    let ret = new Map<Identifier, { __is: string, _id: any, _version: number }>();
    let mono_query = this.sql_select();
    let mono_rows = await this.ctx.db.select(mono_query);
    for (let row of mono_rows) {
      let { __is, _id, _version } = row as any;
      let is = this.ctx.config.obiEntity_to_aspectClassname(__is);
      ret.set(_id, { __is: is, _id: _id, _version: _version });
    }
    return ret;
  }

  buildConstraints() {
    this.addDefaultInitialFrom();
    this.addAttribute("_id");
    this.addAttribute("_version");
    super.buildConstraints();
  }

  sql_columns() {
    let ret = super.sql_columns();
    ret.push(...this.sub_id_columns);
    ret.push(...this.sub_is_columns);
    return ret;
  }

  async execute(): Promise<VersionedObject[]> {
    let ccc = this.ctx.ccc;
    let maker = this.ctx.maker;
    let snapshots = new Map<VersionedObject, VersionedObjectSnapshot>();
    let idsByPathType = new Map<string, Map<Aspect.Installed, number[]>>();
    let ret: VersionedObject[] = [];

    const load_ids = async (query: SqlBinding) => {
      let rows = await this.ctx.db.select(query);
      let subs = new Map<string, { ids: number[], car_info: ObiQuery.CarInfo }>();
      for (let row of rows) {
        let {__is, _id, _version, _path } = row as { __is: number, _id: number, _version: number, _path?: string };
        let isname = this.ctx.systemObiById.get(__is)!.system_name;
        let aname = this.ctx.config.obiEntity_to_aspectClassname(isname);
        let vo = ccc.findOrCreate(_id, aname);
        let manager = vo.manager();
        let path_n = _path || "";
        _path = _path || ".";
        let idsByType = idsByPathType.get(_path);
        if (!idsByType)
          idsByPathType.set(_path, idsByType = new Map<Aspect.Installed, number[]>());
        let ids = idsByType.get(manager.aspect());
        if (!ids)
          idsByType.set(manager.aspect(), ids = []);
        ids.push(_id);

        if (_path === ".")
          ret.push(vo);

        let snapshot = snapshots.get(vo);
        if (!snapshot) {
          snapshots.set(vo, snapshot = new VersionedObjectSnapshot(manager.aspect(), manager.id()));
          snapshot.setAttributeValueFast(Aspect.attribute_version, _version);
          for (let a of scope_at_type_path(this.set.scope, manager.classname(), _path)) {
            let d: undefined | Set<any> | any[] = undefined;
            if (a.type.type === "set")
              d = new Set();
            else if (a.type.type === "array")
              d = [];
            for (let type of Aspect.typeToAspectNames(a.type)) {
              let path_a = `${path_n}${a.name}.`;
              let attributes = scope_at_type_path(this.set.scope, type, path_a);
              if (attributes.size) {
                let sub_ids = subs.get(path_a);
                if (!sub_ids)
                  subs.set(path_a, sub_ids = { ids: [], car_info: this.car_info(a.name) });
                sub_ids.ids.push(_id);
              }
            }
            snapshot.setAttributeValueFast(a, d);
          }
        }
      }
      let queries: SqlBinding[] = [];
      for (let [path_a, { ids, car_info }] of subs) {
        let car_version = this.car_info("_version");
        let w = mk_where(this.ctx, "TJ_VAL_ID", car_info.direct, car_version, ids, [car_info.car._id!]);
        let sql_query = mk_query_ids(this.ctx, car_info.direct, car_version, w, path_a);
        queries.push(sql_query);
      }
      if (queries.length)
        await load_ids(maker.union(queries));
    };
    await load_ids(this.sql_select());

    let car2attr_d = new Map<number, Aspect.InstalledAttribute>();
    let car2attr_r = new Map<number, Aspect.InstalledAttribute>();
    const load_attributes = async (sql_select: SqlBinding) => {
      let row_values = await this.ctx.db.select(sql_select);
      for (let row of row_values) {
        let {__is, _id, car, val, direct} = row as {__is?: number, _id: number, car: number, val: any, direct: boolean};
        let vo = ccc.find(_id)!;
        let snapshot = snapshots.get(vo)!;
        let a = (direct ? car2attr_d : car2attr_r).get(car)!;
        val = this.ctx.config.obiValue_to_aspectValue(val, a);
        val = this.loadValue(ccc, val, __is);
        if (a.type.type === "set" || a.type.type === "array") {
          let c = snapshot.attributeValueFast(a);
          if (a.type.type === "set")
            c.add(val);
          else // array
            c.push(val);
        }
        else {
          snapshot.setAttributeValueFast(a, val);
        }
      }
    };
    for (let [path, idsByType] of idsByPathType) {
      let tables = new Map<string, { dor: SqlBinding[], ror: SqlBinding[] }>();
      for (let [type, ids] of idsByType) {
        let cars_by_tables = new Map<string, { dcar_ids: number[], rcar_ids: number[]}>();
        let attributes = scope_at_type_path(this.set.scope, type.classname, path);
        for (let a of attributes) {
          let car_info = this.car_info(a.name);
          let cars = cars_by_tables.get(car_info.table);
          (car_info.direct ? car2attr_d : car2attr_r).set(car_info.car._id!, a);
          if (!cars)
            cars_by_tables.set(car_info.table, cars = { dcar_ids: [], rcar_ids: [] });
          (car_info.direct ? cars.dcar_ids : cars.rcar_ids).push(car_info.car._id!);
        }
        for (let [table, { dcar_ids, rcar_ids }] of cars_by_tables) {
          let or = tables.get(table);
          if (!or)
            tables.set(table, or = { dor: [], ror: [] });
          if (dcar_ids.length)
            or.dor.push(mk_where(this.ctx, table, true, undefined, ids, dcar_ids));
          if (rcar_ids.length)
            or.ror.push(mk_where(this.ctx, table, false, undefined, ids, rcar_ids));
        }
      }
      for (let [table, { dor, ror }] of tables) {
        let queries: SqlBinding[] = [];
        if (dor.length)
          queries.push(mk_query_val(this.ctx, table, true, maker.or(dor)));
        if (ror.length)
          queries.push(mk_query_val(this.ctx, table, false, maker.or(ror)));
        await load_attributes(maker.union(queries));
      }
    }

    this.mergeSnapshots(snapshots);
    return ret;
  }

  loadValue(ccc: ControlCenterContext, value, is: number | undefined) {
    if (typeof is === "number") {
      let subid = value;
      value = ccc.find(subid);
      if (!value) {
        let obi_is = this.ctx.systemObiById.get(is)!;
        let classname = this.ctx.config.obiEntity_to_aspectClassname(obi_is.system_name!);
        let vo = value = ccc.create<VersionedObject>(classname);
        vo.manager().setSavedIdVersion(subid, VersionedObjectManager.UndefinedVersion);
      }
    }
    return value;
  }
}

function column_id(direct: boolean) {
  return direct ? "VAL_INST" : "VAL";
}
function column_val(direct: boolean) {
  return direct ? "VAL" : "VAL_INST";
}


function mk_query_ids(ctx: ObiSharedContext, direct: boolean, version: ObiQuery.CarInfo, where: SqlBinding, path: string) {
  let table = "TJ_VAL_ID";
  let columns = [
    ctx.maker.column("AIS", "VAL", "__is"),
    ctx.maker.column(table, column_val(direct) , "_id"),
    ctx.maker.column("AVE", "VAL", "_version"),
    ctx.maker.column_alias_bind(ctx.maker.value(path), "_path"),
  ];
  let from = ctx.maker.from(table);
  let joins = [
    ctx.maker.join('', table, "AIS"),
    ctx.maker.join('', version.table, "AVE")
  ];
  let query = ctx.maker.select(columns, from, joins, where);
  return query;
}

function mk_where(ctx: ObiSharedContext, table, direct: boolean, version: ObiQuery.CarInfo | undefined, ids: number[], car_ids: number[]) {
  let and = [
    ctx.maker.op(ctx.maker.column(table, column_id(direct)), ConstraintType.In, ids),
    ctx.maker.op(ctx.maker.column(table, "VAL_CAR"), ConstraintType.In, car_ids),
  ];
  if (table === "TJ_VAL_ID") {
    and.push(ctx.maker.compare(ctx.maker.column("AIS", "VAL_INST"), ConstraintType.Equal, ctx.maker.column(table, column_val(direct))));
    and.push(ctx.maker.op(ctx.maker.column("AIS", "VAL_CAR"), ConstraintType.Equal, ctx.car_entityid));
    if (version) {
      and.push(ctx.maker.compare(ctx.maker.column("AVE", "VAL_INST"), ConstraintType.Equal, ctx.maker.column(table, column_val(direct))));
      and.push(ctx.maker.op(ctx.maker.column("AVE", "VAL_CAR"), ConstraintType.Equal, version.car._id!));
    }
  };
  return ctx.maker.and(and);
}

function mk_query_val(ctx: ObiSharedContext, table: string, direct: boolean, where: SqlBinding) {
  let columns = [
    ctx.maker.column(table, column_id(direct) , "_id"),
    ctx.maker.column(table, "VAL_CAR" , "car"),
    ctx.maker.column(table, column_val(direct), "val"),
    ctx.maker.column_alias_bind(ctx.maker.value(direct) , "direct"),
  ];
  let joins: SqlBinding[] = [];
  if (table === "TJ_VAL_ID") {
    columns.push(ctx.maker.column("AIS", "VAL", "__is"));
    joins.push(ctx.maker.join('', table, "AIS"));
  }
  let query = ctx.maker.select(columns, ctx.maker.from(table), joins, where);
  return query;
}

