import {Parser, Reporter} from '@openmicrostep/msbuildsystem.shared';
import {ObiParseContext, ObiDefinition, SysObiDefinition, parseObis, getOne, add_to, del_from} from './index.priv';
import {DataSourceInternal, Aspect} from '@openmicrostep/aspects';
import {SqlMaker, DBConnector} from '@openmicrostep/aspects.sql';
import ConstraintType = DataSourceInternal.ConstraintType;

function mk_obi(id: number | undefined, system_name: string | undefined): ObiDefinition {
  return { is: undefined, _id: id, system_name: system_name, attributes: new Map() }
}

interface TmpObiDefinition {
  _id: number;
  system_name: string | undefined;
  add_attributes: Map<ObiDefinition, Set<string | number | ObiDefinition>>;
  del_attributes: Map<ObiDefinition, Set<string | number | ObiDefinition>>;
}

export namespace OuiDB {
  export interface Config {
    CarEntityId: number;
    CarSystemNameId: number;
    CarSystemNameLib: string;
    CarTableLib: string;
    CarTypeLib: string;
    TypIDLib: string;
    TypSIDLib: string;
    DatabaseSystemName: string;
    NextOidLib: string;
    NextOidReserveSize: number;
    mapTypes: { [s: string]: Aspect.Type };
  }
}

export class OuiDB {
  constructor(public connector: DBConnector) {
    this.maker = connector.maker;
  }
  maker: SqlMaker;

  systemObiByName = new Map<string, SysObiDefinition>();
  systemObiById = new Map<number, SysObiDefinition>();
  _valTables: string[] = ["TJ_VAL_ID", "TJ_VAL_INT", "TJ_VAL_STR"];
  _next_oid_pos = 0;
  _next_oid_end = 0;
  config: OuiDB.Config = {
    CarEntityId: 101,
    CarSystemNameId: 102,
    CarSystemNameLib: "system name",
    CarTableLib: "table",
    CarTypeLib: "type",
    TypIDLib: "ID",
    TypSIDLib: "SID",
    DatabaseSystemName: "database",
    NextOidLib: "next oid",
    NextOidReserveSize: 10e3,
    mapTypes: {
      STR : Aspect.Type.stringType,
      INT : Aspect.Type.integerType,
      BOOL: Aspect.Type.booleanType,
      GMT : Aspect.Type.integerType,
      DAT : Aspect.Type.integerType,
      DTM : Aspect.Type.integerType,
      DUR : Aspect.Type.integerType,
    }
  }

  parseObis(parser: Parser) {
    let ctx: ObiParseContext = {
      obis: [],
      roById: this.systemObiById,
      roByName: this.systemObiByName,
      byId: new Map(),
      byName: new Map(),
      CarSystemNameLib: this.config.CarSystemNameLib,
      CarTypeLib: this.config.CarTypeLib,
      TypIDLib: this.config.TypIDLib,
      TypSIDLib: this.config.TypSIDLib,
    };
    return parseObis(ctx, parser);
  }

  private referencedIds(defs: ObiDefinition[]) {
    let byId = new Map<number, ObiDefinition>();
    let byName = new Map<string, ObiDefinition>();
    let done = new Set<ObiDefinition>();
    let ids: number[] = []; // TODO: recursive id list
    const markReferences = (def: ObiDefinition) => {
      if (done.has(def)) return;
      done.add(def);

      if (def._id) {
        ids.push(def._id);
        byId.set(def._id, def);
      }
      if (def.system_name)
        byName.set(def.system_name, def);
      for (let [car, set] of def.attributes) {
        markReferences(car);
        for (let v of set) {
          if (typeof v === "object")
            markReferences(v);
        }
      }
    }
    for (let def of defs) {
      markReferences(def);
    }
    return { byId: byId, byName: byName, ids: ids };
  }

  async raw_insert(tr: DBConnector.Transaction, table: string, oid: number, cid: number, v)  {
    table = "TJ_VAL_" + table;
    let sql_insert = this.maker.insert(table, [
      "VAL_INST",
      "VAL_CAR" ,
      "VAL"     ,
    ], this.maker.values([oid, cid, v]), []);
    await tr.insert(sql_insert, []);
  }

  async raw_delete(tr: DBConnector.Transaction, table: string, oid: number, cid: number, v)  {
    table = "TJ_VAL_" + table;
    let sql_delete = this.maker.delete(table, this.maker.and([
      this.maker.op(this.maker.column(table, "VAL_INST"), ConstraintType.Equal, oid),
      this.maker.op(this.maker.column(table, "VAL_CAR" ), ConstraintType.Equal, cid),
      this.maker.op(this.maker.column(table, "VAL"     ), ConstraintType.Equal, v  ),
    ]));
    if (await tr.delete(sql_delete) !== 1)
      return Promise.reject('unable to delete previous value');
    return Promise.resolve();
  }

  async raw_delete_obi(tr: DBConnector.Transaction, reporter: Reporter, oid: number)  {
    const maker = this.maker;
    const CarTypeIDId = this.systemObiByName.get(this.config.CarTypeLib)!._id!;
    const TypSIDId = this.systemObiByName.get(this.config.TypSIDLib)!._id!;

    let sql_select = maker.select(
      [maker.column("RID", "VAL_INST")],
      maker.from("TJ_VAL_ID", "RID"), [
        maker.join("inner", "TJ_VAL_ID", "CAR", maker.and([
          maker.compare(maker.column("CAR", "VAL_INST"), ConstraintType.Equal, maker.column("RID", "VAL_CAR")),
          maker.op(maker.column("CAR", "VAL_CAR"), ConstraintType.Equal, CarTypeIDId),
          maker.op(maker.column("CAR", "VAL"), ConstraintType.NotEqual, TypSIDId),
        ])),
      ],
      maker.or([
        maker.op(maker.column("RID", "VAL")    , ConstraintType.Equal, oid),
        maker.op(maker.column("RID", "VAL_CAR"), ConstraintType.Equal, oid),
      ]));
    let rows = await tr.select(sql_select);
    for (let row of rows)
      reporter.diagnostic({ is: "error", msg: `cannot delete (${row["VAL_INST"]} is still linked to ${oid})` });

    let sql_select_subs = maker.select(
      [maker.column("SID", "VAL")],
      maker.from("TJ_VAL_ID", "SID"), [
        maker.join("inner", "TJ_VAL_ID", "CAR", maker.and([
          maker.compare(maker.column("CAR", "VAL_INST"), ConstraintType.Equal, maker.column("SID", "VAL_CAR")),
          maker.op(maker.column("CAR", "VAL_CAR"), ConstraintType.Equal, CarTypeIDId),
          maker.op(maker.column("CAR", "VAL"), ConstraintType.Equal, TypSIDId),
        ])),
      ],
      maker.and([
        maker.op(maker.column("SID", "VAL_INST"), ConstraintType.Equal, oid),
        maker.op(maker.column("SID", "VAL_CAR"), ConstraintType.NotEqual, this.config.CarEntityId),
      ]));
    let sub_rows = await tr.select(sql_select_subs);
    for (let row of sub_rows)
      await this.raw_delete_obi(tr, reporter, row["VAL"]);
    for (let table of this._valTables) {
      let sql_delete = maker.delete(table, maker.op(this.maker.column(table, "VAL_INST"), ConstraintType.Equal, oid));
      await tr.delete(sql_delete);
    }
  }

  async injectObis(defs: ObiDefinition[]) {
    const new_findByName = (name: string) => {
      let car = new_byName.get(name) || this.systemObiByName.get(name);
      if (!car)
        throw new Error(`cannot inject: caracteristic ${name} not found`);
      return car;
    }
    const cur_findByName = (name: string) => {
      let car = this.systemObiByName.get(name);
      if (!car)
        throw new Error(`cannot inject: caracteristic ${name} not found`);
      return car;
    }

    // load current state
    let new_refs = this.referencedIds(defs);
    let new_byId = new_refs.byId;
    let new_byName = new_refs.byName;
    let cur_byId = await this.loadObis(new_refs.ids);
    for (let obi of cur_byId.values())
      if (obi.system_name)
        this._registerSystemObi(obi);
    const injected = new Map<ObiDefinition, TmpObiDefinition>(); // new -> tmp
    const tr = await this.connector.transaction();

    // load core caracteristics
    let new_car_system_name = new_findByName(this.config.CarSystemNameLib);
    let new_car_table = new_findByName(this.config.CarTableLib);
    let new_car_type = new_findByName(this.config.CarTypeLib);
    let cur_car_system_name = this.systemObiByName.get(this.config.CarSystemNameLib);
    let cur_car_table = this.systemObiByName.get(this.config.CarTableLib);
    let cur_car_type = this.systemObiByName.get(this.config.CarTypeLib);
    const injectObi = async (new_obi: Readonly<ObiDefinition>) => {
      let tmp_obi = injected.get(new_obi);
      if (tmp_obi)
        return tmp_obi;

      let cur_obi: ObiDefinition | undefined;
      if (new_obi._id)
        cur_obi = cur_byId.get(new_obi._id);
      if (!cur_obi && new_obi.system_name)
        cur_obi = this.systemObiByName.get(new_obi.system_name);

      if (cur_obi && cur_obi.is && new_obi.is && cur_obi.is.system_name !== new_obi.is.system_name)
        throw new Error(`cannot inject: conflict on is, new={ is: ${new_obi.is.system_name} } current={ is: ${cur_obi.is.system_name} }`);
      if (cur_obi && cur_obi.system_name && new_obi.system_name && cur_obi.system_name !== new_obi.system_name)
        throw new Error(`cannot inject: conflict on system name, new={ system name: ${new_obi.system_name} } current={ system name: ${cur_obi.system_name} }`);
      if (cur_obi && cur_obi._id && new_obi._id && cur_obi._id !== new_obi._id)
        throw new Error(`cannot inject: conflict on _id, new={ _id: ${new_obi._id} }, current={ _id: ${cur_obi._id} }`);
      let _id = new_obi._id || (cur_obi ? cur_obi._id : await this.nextObiId(tr));
      tmp_obi = {
        _id: _id as number,
        system_name: new_obi.system_name || (cur_obi && cur_obi.system_name),
        add_attributes: new Map(),
        del_attributes: new Map(),
      };
      injected.set(new_obi, tmp_obi);
      if (new_obi.is && (!cur_obi || !cur_obi.is)) {
        let tmp_obi_is = await injectObi(new_obi.is);
        await this.raw_insert(tr, "ID", tmp_obi._id, this.config.CarEntityId, tmp_obi_is._id);
      }

      for (let [new_car, new_set] of new_obi.attributes) {
        let tmp_car = await injectObi(new_car);
        let new_type = getOne(new_car, new_car_type) as ObiDefinition;
        let new_table = getOne(new_type, new_car_table, new_type.system_name!) as string;
        let new_isId = new_type.system_name === this.config.TypIDLib || new_type.system_name === this.config.TypSIDLib;
        let cur_car = cur_obi && this.systemObiByName.get(tmp_car.system_name!);
        let cur_type = cur_car && cur_car_type && getOne(cur_car, cur_car_type) as ObiDefinition;
        let cur_table = cur_type && cur_car_table && getOne(cur_type, cur_car_table, cur_type.system_name!) as string;
        let cur_isId = cur_type && (cur_type.system_name === this.config.TypIDLib || cur_type.system_name === this.config.TypSIDLib);
        let cur_set = cur_obi && cur_car && cur_type && cur_obi.attributes.get(cur_car);
        let isCompatible = !cur_set || !cur_table || cur_table === new_table;
        let cur_set_d = cur_isId ? (cur_set && new Set([...cur_set].map((obi: ObiDefinition) => obi._id!))) : cur_set;
        for (let new_value of new_set) {
          if (new_isId) {
            let tmp_obi_v = await injectObi(new_value as ObiDefinition);
            if (!cur_set_d || !cur_set_d.has(tmp_obi_v._id)) {
              add_to(tmp_obi.add_attributes, cur_car || new_car, new_value);
              await this.raw_insert(tr, "ID", tmp_obi._id, tmp_car._id, tmp_obi_v._id);
            }
          }
          else {
            if (!cur_set_d || !cur_set_d.has(new_value)) {
              add_to(tmp_obi.add_attributes, cur_car || new_car, new_value);
              await this.raw_insert(tr, new_table, tmp_obi._id, tmp_car._id, new_value);
            }
          }
        }
        if (cur_set) {
          let new_set_d = new_isId ? new Set([...new_set].map((obi: ObiDefinition) => obi._id!)) : new_set;
          for (let cur_value of cur_set) {
            if (cur_isId)
              cur_value = (cur_value as ObiDefinition)._id!;
            if (!new_set_d.has(cur_value)) {
              add_to(tmp_obi.del_attributes, cur_car || new_car, cur_value);
              await this.raw_delete(tr, "ID", tmp_obi._id, new_car._id!, cur_value);
            }
          }
        }
      }
      return tmp_obi;
    }
    const mergedObi = <T>(new_cur_obi: T) => {
      let tmp_obi = injected.get(new_cur_obi as any);
      return tmp_obi ? mergeObi(new_cur_obi as any, tmp_obi) : new_cur_obi;
    }
    const mergeObi = (new_obi: ObiDefinition, tmp_obi: TmpObiDefinition) => {
      let ret_obi = merged.get(new_obi);
      if (ret_obi)
        return ret_obi;
      let cur_obi = cur_byId.get(tmp_obi._id);
      ret_obi = cur_obi || mk_obi(tmp_obi._id, tmp_obi.system_name);
      merged.set(new_obi, ret_obi);
      ret_obi.is = ret_obi.is || mergedObi(new_obi.is!);

      if (cur_obi && cur_obi.system_name && cur_obi.system_name !== tmp_obi.system_name) {
          this.systemObiByName.delete(cur_obi.system_name);
          this.systemObiById.delete(tmp_obi._id);
      }
      if (tmp_obi.system_name && (!cur_obi || cur_obi.system_name !== tmp_obi.system_name)) {
          this.systemObiByName.set(tmp_obi.system_name, ret_obi as SysObiDefinition);
          this.systemObiById.set(tmp_obi._id, ret_obi as SysObiDefinition);
      }
      ret_obi.system_name = tmp_obi.system_name;

      for (let [new_car, new_set] of tmp_obi.add_attributes) {
        for (let new_value of new_set)
          add_to(ret_obi.attributes, mergedObi(new_car), mergedObi(new_value));
      }
      for (let [cur_car, cur_set] of tmp_obi.del_attributes) {
        for (let cur_value of cur_set)
          del_from(ret_obi.attributes, cur_car, cur_value);
      }

      return ret_obi;
    };
    if (new_car_system_name !== cur_car_system_name)
      await injectObi(new_car_system_name);
    for (let new_obi of defs)
      await injectObi(new_obi);
    await tr.commit();

    const merged = new Map<ObiDefinition, ObiDefinition>();
    let ret: ObiDefinition[] = [];
    for (let [new_obi, tmp_obi] of injected)
      ret.push(mergeObi(new_obi, tmp_obi));
    return ret;
  }

  async loadSystemObis() {
    this.systemObiById.clear();
    this.systemObiByName.clear();
    let sql_systemObis = this.maker.select([
      this.maker.column("TJ_VAL_STR", "VAL_INST"),
      this.maker.column("TJ_VAL_STR", "VAL"),
    ],
    this.maker.from("TJ_VAL_STR"), [],
    this.maker.op({ sql: this.maker.quote("VAL_CAR"), bind: [] }, ConstraintType.Equal, this.config.CarSystemNameId)
  );
    let rows = await this.connector.select(sql_systemObis);
    let ids: number[] = [];
    for (let row of rows as { VAL_INST: number, VAL: string }[]) {
      let obi: ObiDefinition = mk_obi(row.VAL_INST, row.VAL);
      ids.push(obi._id!);
      this.systemObiById.set(obi._id!, obi as SysObiDefinition);
      this.systemObiByName.set(obi.system_name!, obi as SysObiDefinition);
    }
    await this._loadObis(this.connector, ids, this.systemObiById);
  }

  async loadObis(ids: number[], cache: Map<number, ObiDefinition> = this.systemObiById, db: DBConnector.CRUD = this.connector) {
    let ret = new Map<number, ObiDefinition>();
    for (let id of ids) {
      let obi: ObiDefinition = cache.get(id) || mk_obi(id, undefined);
      ret.set(obi._id!, obi);
    }
    await this._loadObis(db, ids, ret);
    return ret;
  }

  private _registerSystemObi(obi: ObiDefinition) {
    let cur_obi = this.systemObiById.get(obi._id!);
    if (!cur_obi) {
      this.systemObiById.set(obi._id!, obi as SysObiDefinition);
      this.systemObiByName.set(obi.system_name!, obi as SysObiDefinition);
    }
    else if (cur_obi !== obi)
      throw new Error(`conflict while loading obi ${obi._id}`);
  }

  private async _loadObis(db: DBConnector.CRUD, ids: number[], into: Map<number, ObiDefinition>, unresolved = new Map<number, ObiDefinition>()) {
    let unresolved_ids: number[] = [];
    for (let table of this._valTables) {
      let sql_car = this.maker.select([
        this.maker.column(table, "VAL_INST"),
        this.maker.column(table, "VAL_CAR" ),
        this.maker.column(table, "VAL"     ),
      ], this.maker.from(table), [], this.maker.op({ sql: this.maker.quote("VAL_INST"), bind: [] }, ConstraintType.In, ids));
      let rows = await db.select(sql_car);
      for (let row of rows as { VAL_INST: number, VAL_CAR: number, VAL: any }[]) {
        let obi = into.get(row.VAL_INST)!;
        let obi_car = this.systemObiById.get(row.VAL_CAR)!;
        if (row.VAL_CAR === this.config.CarSystemNameId) {
          obi.system_name = row.VAL;
          this._registerSystemObi(obi);
        }
        if (row.VAL_CAR === this.config.CarEntityId)
          obi.is = this.systemObiById.get(row.VAL);
        else {
          let values = obi.attributes.get(obi_car);
          let value = row.VAL;
          if (table === "TJ_VAL_ID") {
            let value_obi = into.get(value) || this.systemObiById.get(value);
            if (!value_obi) {
              if (unresolved.has(value))
                throw new Error(`obi with id ${value} not found`);
              else {
                unresolved_ids.push(value);
                unresolved.set(value, value_obi = mk_obi(value, undefined));
                into.set(value, value_obi);
              }
            }
            value = value_obi;
          }
          if (!values)
            obi.attributes.set(obi_car, values = new Set());
          values.add(value);
        }
      }
    }
    if (unresolved_ids.length > 0)
      await this._loadObis(db, unresolved_ids, into, unresolved);
  }

  async nextObiId(tr: DBConnector.Transaction) : Promise<number> {
    if (this._next_oid_pos >= this._next_oid_end) {
      // reserve a new oid block
      let database = this.systemObiByName.get(this.config.DatabaseSystemName);
      let next_oid_car = this.systemObiByName.get(this.config.NextOidLib);
      let next_oid = database && next_oid_car && (getOne(database, next_oid_car) as number);
      if (next_oid === undefined)
        return Promise.reject('unable to get next_oid');
      this._next_oid_pos = next_oid;
      this._next_oid_end = next_oid + this.config.NextOidReserveSize;
      let sql_update = this.maker.update("TJ_VAL_INT", [this.maker.set("VAL", this._next_oid_end)], this.maker.and([
        this.maker.op(this.maker.column("TJ_VAL_INT", "VAL_INST"), ConstraintType.Equal, database!._id),
        this.maker.op(this.maker.column("TJ_VAL_INT", "VAL_CAR" ), ConstraintType.Equal, next_oid_car!._id),
        this.maker.op(this.maker.column("TJ_VAL_INT", "VAL"     ), ConstraintType.Equal, next_oid),
      ]));
      await tr.update(sql_update);
    }
    return ++this._next_oid_pos;
  }
}
