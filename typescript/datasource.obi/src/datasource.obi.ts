import {Aspect, DataSource, VersionedObject, VersionedObjectConstructor, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, AComponent, Invocation} from '@openmicrostep/aspects';
import {Parser, Reporter} from '@openmicrostep/msbuildsystem.shared';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {OuiDB, ObiQuery, ObiParseContext, ObiDefinition, parseObis, getOne, ObiSharedContext} from './index.priv';
import {SqlMaker, DBConnectorTransaction, SqlBinding, SqlPath, SqlInsert, DBConnectorCRUD, Pool} from '@openmicrostep/aspects.sql';

export namespace ObiDataSource {
  export interface Config {
    aspectClassname_to_ObiEntity: (classname: string) => string;
    obiEntity_to_aspectClassname: (is: string) => string;
    aspectAttribute_to_ObiCar: (attribute: string) => string;
    aspectValue_to_obiValue: (value: any, attribute: string) => any;
    obiValue_to_aspectValue: (value: any, attribute: string) => any;
  }
}

function pass(a) { return a; }

export type ObiDataSourceTransaction = { tr: DBConnectorTransaction, versions: Map<VersionedObject, { _id: Identifier, _version: number }> };
export class ObiDataSource extends DataSource
{
  constructor(manager: VersionedObjectManager<ObiDataSource>,
    public db: OuiDB,
    config: Partial<ObiDataSource.Config>,
  ) {
    super(manager);
    this.config = Object.assign({
      aspectClassname_to_ObiEntity: pass,
      obiEntity_to_aspectClassname: pass,
      aspectAttribute_to_ObiCar: pass,
      aspectValue_to_obiValue: pass,
      obiValue_to_aspectValue: pass,
    }, config);
  }

  static parent = DataSource;
  static definition = {
    is: "class",
    name: "ObiDataSource",
    version: 0,
    aspects: DataSource.definition.aspects
  };
  static installAspect(on: ControlCenter, name: 'client'): { new(): DataSource.Aspects.client };
  static installAspect(on: ControlCenter, name: 'server'): { new(db?: OuiDB, config?: Partial<ObiDataSource.Config>): DataSource.Aspects.server };
  static installAspect(on: ControlCenter, name:string): any {
    return on.cache().createAspect(on, name, this);
  }

  config: ObiDataSource.Config;

  _ctx(db: DBConnectorCRUD, component: AComponent) : ObiSharedContext {
    return {
      db: db,
      component: component,
      config: this.config,
      cstor: ObiQuery,
      controlCenter: this.controlCenter(),
      maker: this.db.maker,
      systemObiByName: this.db.systemObiByName,
      systemObiById: this.db.systemObiById,
      car_entityid: this.db.config.CarEntityId,
      car_type: this.db.systemObiByName.get(this.db.config.CarTypeLib)!,
      car_table: this.db.systemObiByName.get(this.db.config.CarTableLib)!,
      queries: new Map(),
      aliases: 0
    };
  }

  execute(db: DBConnectorCRUD, set: ObjectSet, component: AComponent): Promise<VersionedObject[]> {
    let ctx = this._ctx(db, component);
    return ObiQuery.execute(ctx, set);
  }

  async save(tr: DBConnectorTransaction, reporter: Reporter, objects: Set<VersionedObject>, versions: Map<VersionedObject, { _id: Identifier, _version: number }>, object: VersionedObject) : Promise<void> {
    const insert = async (tr: DBConnectorTransaction, table: string, oid: number, cid: number, attribute: Aspect.InstalledAttribute, car_info: ObiQuery.CarInfo, value) => {
      if (value instanceof VersionedObject) {
        let state = value.manager().state();
        if (state === VersionedObjectManager.State.NEW) {
          let v = versions.get(value);
          if (v)
            value = v._id;
          else if (objects.has(value)) {
            let n = reporter.diagnostics.length;
            try {
              await this.save(tr, reporter, objects, versions, value);
            } catch (e) {
              reporter.error(e || `unknown error`);
            }
            if (reporter.diagnostics.length > n)
              return;
            value = versions.get(value)!._id;
          }
          else {
            reporter.diagnostic({ type: "error", msg: `cannot save ${attribute.name}: referenced object is not saved and won't be` });
            return;
          }
        }
        else {
          value = value.id();
        }
      }
      value = this.config.aspectValue_to_obiValue(value, attribute.name);
      await this.db.raw_insert(tr, table, oid, cid, value);
    }
    const remove = async (tr: DBConnectorTransaction, table: string, oid: number, cid: number, attribute: Aspect.InstalledAttribute, car_info: ObiQuery.CarInfo, value) => {
      if (value instanceof VersionedObject) {
        let state = value.manager().state();
        if (state === VersionedObjectManager.State.NEW) {
          reporter.diagnostic({ type: "error", msg: `cannot save ${attribute.name}: referenced object is not saved` });
          return;
        }
        else {
          value = value.id();
        }
      }
      value = this.config.aspectValue_to_obiValue(value, attribute.name);
      await this.db.raw_delete(tr, table, oid, cid, value);
    }

    let manager = object.manager();
    let aspect = manager.aspect();
    let oid = manager.id();
    let maker = this.db.maker;
    let version = manager.versionVersion();
    let state = manager.state();
    let n = reporter.diagnostics.length;

    if (state === VersionedObjectManager.State.DELETED) {
      await this.db.raw_delete_obi(tr, reporter, oid as number);
      versions.set(object, { _id: oid, _version: version });
    }
    else {
      let isNew = state === VersionedObjectManager.State.NEW;
      if (isNew)
        oid = await this.db.nextObiId(tr);

      let obi_ENT = this.config.aspectClassname_to_ObiEntity(aspect.name);
      let obi = this.db.systemObiByName.get(obi_ENT);
      if (!obi) {
        reporter.diagnostic({ type: "error", msg: `cannot found ${obi_ENT} obi definition` });
        return;
      }

      let car_table = this.db.systemObiByName.get(this.db.config.CarTableLib)!;
      let car_type = this.db.systemObiByName.get(this.db.config.CarTypeLib)!;
      let map = async (k: string, nv: any, ov: any | undefined) => {
        let obi_car_name = this.config.aspectAttribute_to_ObiCar(k);
        let a = aspect.attributes.get(k)!;
        let car = this.db.systemObiByName.get(obi_car_name);
        if (!car) {
          if (!a.relation)
            reporter.diagnostic({ type: "error", msg: `caracteristic ${obi_car_name} not found` });
          return;
        }
        let type = getOne(car, car_type) as ObiDefinition;
        let table = getOne(type, car_table, type.system_name!) as string;
        let ci = {
          car: car,
          type: type,
          table: table,
          direct: true,
        };

        switch (a.type.type) {
          case "primitive":
          case "class": {
            if (nv !== undefined)
              await insert(tr, table, oid as number, car._id!, a, ci, nv);
            if (ov !== undefined)
              await remove(tr, table, oid as number, car._id!, a, ci, ov);
            break;
          }
          case 'set': { // multi value obi style
            for (let nvv of nv) {
              if (!ov || !ov.has(nvv))
                await insert(tr, table, oid as number, car._id!, a, ci, nvv);
            }
            if (ov) {
              for (let ovv of ov) {
                if (!nv.has(ovv))
                  await remove(tr, table, oid as number, car._id!, a, ci, ovv);
              }
            }
            break;
          }
          default:
            reporter.diagnostic({ type: "error", msg: `unsupported attribute type ${a.type.type} by obi` });
          }
      };

      if (isNew)
        await this.db.raw_insert(tr, "ID", oid as number, this.db.config.CarEntityId, obi._id);
      await map("_version", version + 1, isNew ? undefined : version);
      versions.set(object, { _id: oid, _version: version + 1 });
      for (let [k, nv] of manager.localAttributes().entries())
        await map(k, nv, isNew ? undefined : manager.versionAttributes().get(k));
    }
  }

  scoped<P>(scope: (component: AComponent) => Promise<P>) : Promise<P> {
    let component = {};
    this.controlCenter().registerComponent(component);
    return scope(component)
      .then(v => { this.controlCenter().unregisterComponent(component); return Promise.resolve(v); })
      .catch(v => { this.controlCenter().unregisterComponent(component); return Promise.reject(v); })
  }

  implQuery({ tr, sets }: { tr?: ObiDataSourceTransaction, sets: ObjectSet[] }): Promise<{ [k: string]: VersionedObject[] }> {
    let ret = {};
    return this.scoped(component =>
      Promise.all(sets
        .filter(s => s.name)
        .map(s => this.execute(tr ? tr.tr : this.db.connector, s, component)
        .then(obs => ret[s.name!] = obs))
      ).then(() => ret));
  }

  async implLoad({tr, objects, scope} : {
    tr?: ObiDataSourceTransaction;
    objects: VersionedObject[];
    scope: DataSourceInternal.Scope;
  }): Promise<VersionedObject[]> {
    let set = new ObjectSet('load');
    set.and(new DataSourceInternal.ConstraintValue(ConstraintType.In, set._name, "_id", objects));
    set.scope = DataSourceInternal.resolveScopeForObjects(scope, this.controlCenter(), objects);
    return await this.scoped(component => ObiQuery.execute(this._ctx(tr ? tr.tr : this.db.connector, component), set).then(() => objects));
  }

  async implBeginTransaction(): Promise<ObiDataSourceTransaction> {
    let tr = await this.db.connector.transaction();
    return { tr: tr, versions: new Map<VersionedObject, { _id: Identifier, _version: number }>() };
  }

  async implSave({tr, objects}: { tr: ObiDataSourceTransaction, objects: Set<VersionedObject> }) : Promise<Invocation<void>> {
    let reporter = new Reporter();
    for (let obj of objects) {
      try {
        if (!tr.versions.has(obj))
          await this.save(tr.tr, reporter, objects, tr.versions, obj);
      } catch (e) {
        reporter.error(e || `unknown error`);
      }
    }
    return new Invocation(reporter.diagnostics, false, undefined);
  }

  async implEndTransaction({tr, commit}: { tr: ObiDataSourceTransaction, commit: boolean }) : Promise<void> {
    if (commit) {
      await tr.tr.commit();
      tr.versions.forEach((v, vo) => {
        let manager = vo.manager();
        manager.setId(v._id);
        manager.setVersion(v._version);
      });
    }
    else {
      await tr.tr.rollback();
    }
  }
}
