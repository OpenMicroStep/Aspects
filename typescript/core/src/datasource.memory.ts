import {DataSource, areEquals, VersionedObject, VersionedObjectManager, Invocation, Identifier, ControlCenter, DataSourceInternal, AComponent, Aspect, ImmutableMap} from './core';
import {Reporter, Diagnostic} from '@openmicrostep/msbuildsystem.shared';
import ObjectSet = DataSourceInternal.ObjectSet;
declare var console: any;

export type MemoryDataSourceTransaction = { tr: InMemoryDataSource.DataStoreTransaction };
export class InMemoryDataSource extends DataSource 
{
  constructor(manager: VersionedObjectManager<InMemoryDataSource>, private ds: InMemoryDataSource.DataStore) {
    super(manager);
  }
  static parent = DataSource;
  static definition = {
    is: "class",
    name: "InMemoryDataSource",
    version: 0,
    aspects: DataSource.definition.aspects
  };
  static installAspect(on: ControlCenter, name: 'client'): { new(): DataSource.Aspects.client };
  static installAspect(on: ControlCenter, name: 'server'): { new(ds?: InMemoryDataSource.DataStore): DataSource.Aspects.server };
  static installAspect(on: ControlCenter, name:string): any {
    return on.cache().createAspect(on, name, this);
  }

  implQuery({ tr, sets }: { tr?: InMemoryDataSource.DataStoreTransaction, sets: ObjectSet[] }): { [k: string]: VersionedObject[] } {
    let ds = tr || this.ds;
    let ret = {};
    let cc = this.controlCenter();
    let component = {};
    cc.registerComponent(component);
    let res = DataSourceInternal.applySets(sets, ds.objectsAsArray(), true, {
      aspect: (vo: InMemoryDataSource.DataStoreObject) => cc.aspect(vo.is)!.aspect,
      has: (vo: InMemoryDataSource.DataStoreObject, attribute: string) => vo.has(attribute),
      get: (vo: InMemoryDataSource.DataStoreObject, attribute: string) => {
        if (attribute === "_id")
          return ds.get(vo.id);
        return ds.fixValue(vo.get(attribute));
      },
      todb: (vo: InMemoryDataSource.DataStoreObject, attribute: string, value) => {
        if (attribute === "_id" && typeof value !== "object")
          return ds.get(this.ds.toDSId(value));
        return ds.toDSValue(value);
      }
    });
    res.forEach((objs, set) => {
      ret[set.name] = objs.map(dObject => {
        let cstor = cc.aspect(dObject.is)!;
        let lId = this.ds.fromDSId(dObject.id);
        let lObject = cc.registeredObject(lId) || new cstor();
        let remoteAttributes = new Map<keyof VersionedObject, any>();
        let lManager = lObject.manager();
        cc.registerObjects(component, [lObject]);
        if (set.scope) for (let k of set.scope as (keyof VersionedObject)[])
          remoteAttributes.set(k, ds.fromDSValue(cc, component, dObject.get(k)));
        lManager.setId(lId);
        lManager.mergeWithRemoteAttributes(remoteAttributes, dObject.version);
        return lObject;
      });
    });
    cc.unregisterComponent(component);
    return ret;
  }

  implLoad({tr, objects, scope} : {
    tr?: InMemoryDataSource.DataStoreTransaction;
    objects: VersionedObject[];
    scope?: string[];
  }): VersionedObject[] {
    let ds = tr || this.ds;
    let cc = this.controlCenter();
    let component = {};
    let ret: VersionedObject[] = [];
    cc.registerComponent(component);
    if (objects) {
      for (let lObject of objects) {
        let dbId = this.ds.toDSId(lObject.id());
        let dObject = ds.get(dbId);
        if (dObject) {
          let lManager = lObject.manager();
          let remoteAttributes = new Map<keyof VersionedObject, any>();
          cc.registerObjects(component, [lObject]);
          if (scope) for (let k of scope as (keyof VersionedObject)[])
            remoteAttributes.set(k, ds.fromDSValue(cc, component, dObject.get(k)));
          lManager.mergeWithRemoteAttributes(remoteAttributes, dObject.version);
          ret.push(lObject);
        }
      }
    }
    cc.unregisterComponent(component);
    return ret;
  }

  implBeginTransaction(): InMemoryDataSource.DataStoreTransaction {
    return this.ds.beginTransaction();
  }

  implSave({tr, objects} : { tr: InMemoryDataSource.DataStoreTransaction ,objects: Set<VersionedObject> }) : Promise<Invocation<void>> {
    let cc = this.controlCenter();
    let diags: Diagnostic[] = [];
    let component = {};
    cc.registerComponent(component);
    for (let lObject of objects) {
      let lVersion = lObject.manager().versionVersion();
      let dbId = this.ds.toDSId(lObject.id());
      if (lVersion === VersionedObjectManager.DeletedVersion) {
        if (!tr.delete(dbId))
          diags.push({ type: "error", msg: `cannot delete ${lObject.id()}: object not found` });
      }
      else if (lVersion !== VersionedObjectManager.NoVersion) { // Update
        let dObject = tr.get(dbId);
        if (!dObject)
          diags.push({ type: "error", msg: `cannot update ${lObject.id()}: object not found` });
        if (dObject) {
          dObject = tr.willUpdate(dObject);
          dObject.version++;
          let lManager = lObject.manager();
          let n = diags.length;
          for (let [k, lv] of lManager._localAttributes) {
            let dbv = dObject.attributes.get(k);
            let exv = lManager._versionAttributes.get(k);
            if (!areEquals(exv,dbv))
              diags.push({ type: "error", msg: `cannot update ${lObject.id()}: attribute ${k} mismatch` });
            else
              dObject.attributes.set(k, tr.toDSValue(lv));
          }
          if (diags.length > n) {
            let remoteAttributes = new Map<keyof VersionedObject, any>();
            cc.registerObjects(component, [lObject]);
            for (let k of lManager._localAttributes.keys())
              remoteAttributes.set(k, tr.fromDSValue(cc, component, dObject.attributes.get(k)));
            lManager.mergeWithRemoteAttributes(remoteAttributes, dObject.version);
          }
          else {
            tr.versions.set(lObject, { _id: this.ds.fromDSId(dObject.id), _version: dObject.version });
          }
        }
      }
      else { // new
        let lManager = lObject.manager();
        let dObject = new InMemoryDataSource.DataStoreObject(lManager.aspect().name, this.ds.nextId(), 0);
        for (let [k, lv] of lManager._localAttributes)
          dObject.attributes.set(k, tr.toDSValue(lv));
        tr.versions.set(lObject, { _id: this.ds.fromDSId(dObject.id), _version: dObject.version });
        tr.add(dObject);
      }
    }
    cc.unregisterComponent(component);
    return Promise.resolve(new Invocation(diags, false, undefined));
  }

  async implEndTransaction({tr, commit}: { tr: InMemoryDataSource.DataStoreTransaction, commit: boolean }) : Promise<void> {
    if (commit) {
      tr.commit();
      tr.versions.forEach((v, vo) => {
        let manager = vo.manager();
        manager.setId(v._id);
        manager.setVersion(v._version);
      });
    }
  }
};
export namespace InMemoryDataSource {
  export class DataStoreObject {
    is: string;
    id: string;
    version: number;
    attributes: Map<string, any>;

    constructor(is : string, id: string, version: number, attributes = new Map<string, any>()) {
      this.is = is;
      this.id = id;
      this.version = version;
      this.attributes = attributes;
    }

    has(name: string) {
      return name === "_id" || name === "_version" || this.attributes.has(name);
    }

    get(name: string) {
      if(name === "_id") return this.id;
      if (name === "_version") return this.version;
      return this.attributes.get(name);
    }

    copy() {
      return new DataStoreObject(this.is, this.id, this.version, new Map(this.attributes));
    }
  }
  export interface DataStoreCRUD {
    objectsAsArray(): DataStoreObject[];
    delete(id: Identifier);
    add(obj: DataStoreObject): void;    
    get(id: Identifier) : DataStoreObject | undefined;
    fixValue(value): any;
    toDSValue(value): any;
    fromDSValue(cc: ControlCenter, cmp: AComponent, value): any;
  }

  function fixValue(ds: DataStoreCRUD, value): any { 
    if (value instanceof Set)
      return new Set([...value].map(v => fixValue(ds, v)));
    if (value instanceof Array)
      return value.map(v => fixValue(ds, v));
    if (value instanceof DataStoreObject)
      return ds.get(value.id);
    return value;
  }

  function toDSValue(ds: DataStore, tr: DataStoreCRUD, value): any {
    if (value instanceof Set)
      return new Set([...value].map(v => toDSValue(ds, tr, v)));
    if (value instanceof Array)
      return value.map(v => toDSValue(ds, tr, v));
    if (value instanceof VersionedObject) {
      let dsId = ds.toDSId(value.id());
      return tr.get(dsId) || new DataStoreObject(value.manager().name(), dsId, -1);
    }
    return value;
  }

  function fromDSValue(ds: DataStore, tr: DataStoreCRUD, cc: ControlCenter, cmp: AComponent, value): any {
    if (value instanceof Set)
      return new Set([...value].map(v => fromDSValue(ds, tr, cc, cmp, v)));
    if (value instanceof Array)
      return value.map(v => fromDSValue(ds, tr, cc, cmp, v));
    if (value instanceof DataStoreObject) {
      let lId = ds.fromDSId(value.id);
      let vo = cc.registeredObject(lId);
      if (!vo) {
        vo = new (cc.aspect(value.is)!)();
        vo.manager().setId(lId);
        cc.registerObjects(cmp, [vo]);
      }
      return vo;
    }
    return value;
  }

  export class DataStore implements DataStoreCRUD {
    private prefix = "memory:";
    private idCounter = 0;
    private _objects = new Map<Identifier, DataStoreObject>();
    private _locks = new Map<VersionedObject, Set<DataStoreTransaction>>();

    beginTransaction() {
      return new DataStoreTransaction(this);
    }
    objectsAsArray() {
      return [...this._objects.values()];
    }

    objects() : ImmutableMap<Identifier, DataStoreObject> {
      return this._objects;
    }

    nextId() {
      return `ds:${this.prefix}${++this.idCounter}`;
    }

    toDSId(id: Identifier) {
      return `ds:${id}`;
    }

    fromDSId(id: Identifier) {
      return (id as string).substring(3);
    }

    delete(id: Identifier) {
      this._objects.delete(id);
    }

    add(object: DataStoreObject) {
      this._objects.set(object.id, object);
    }
    
    get(id: Identifier) {
      return this._objects.get(id);
    }
    fixValue(value): any { return value; }
    toDSValue(value): any { return toDSValue(this, this, value); }
    fromDSValue(cc: ControlCenter, cmp: AComponent, value): any { return fromDSValue(this, this, cc, cmp, value); }
  }

  export class DataStoreTransaction implements DataStoreCRUD {
    private edt_objects = new Map<Identifier, DataStoreObject>();
    private del_objects = new Set<Identifier>();
    versions = new Map<VersionedObject, { _id: Identifier, _version: number }>();
    constructor(private ds: DataStore) {}

    objectsAsArray() {
      let ret: DataStoreObject[] = [];
      if (this.del_objects.size > 0) {
        for (let [id, vo] of this.ds.objects())
          if (!this.del_objects.has(id))
            ret.push(vo);
      }
      else
        ret.push(...this.ds.objects().values());
      ret.push(...this.edt_objects.values());
      return ret;
    }

    nextId() { return this.ds.nextId(); }
    toDSId(id: Identifier) { return this.ds.toDSId(id); }
    fromDSId(id: Identifier) { return this.ds.fromDSId(id); }
    
    delete(id: Identifier) : boolean {
      let can = this.ds.get(id) !== undefined;
      if (can)
        this.del_objects.add(id);
      return can;
    }

    add(object: DataStoreObject) {
      this.edt_objects.set(object.id, object);
    }
    willUpdate(object: DataStoreObject) : DataStoreObject {
      object = object.copy();
      this.edt_objects.set(object.id, object);
      return object;
    }
    
    get(id: Identifier) {
      return this.del_objects.has(id) ? undefined : (this.edt_objects.get(id) || this.ds.get(id));
    }
    fixValue(value): any {
      return fixValue(this, value);
    }
    toDSValue(value): any { return toDSValue(this.ds, this, value); }
    fromDSValue(cc: ControlCenter, cmp: AComponent, value): any { return fromDSValue(this.ds, this, cc, cmp, value); }

    commit() {
      for (let deleted of this.del_objects)
        this.ds.delete(deleted);
      for (let edited of this.edt_objects.values()) {
        for (let [k, v] of edited.attributes)
          edited.attributes.set(k, fixValue(this.ds, v));
        let o = this.ds.get(edited.id);
        if (o) {
          o.version = edited.version;
          o.attributes = edited.attributes;
        }
        else
          this.ds.add(edited);
      }
    }
  }
}
