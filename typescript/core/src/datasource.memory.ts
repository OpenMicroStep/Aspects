import {DataSource, areEquals, VersionedObject, VersionedObjectManager, Result, Identifier, ControlCenter, DataSourceInternal, AComponent, Aspect, ImmutableMap} from './core';
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

  private _loads(
    component: AComponent, ds: InMemoryDataSource.DataStoreCRUD,
    scope: DataSourceInternal.ResolvedScope, lObject: VersionedObject, dObject: InMemoryDataSource.DataStoreObject
  ) {
    this._load(component, ds, scope, '.', '', lObject, dObject);
  }

  private _load(
    component: AComponent, ds: InMemoryDataSource.DataStoreCRUD,
    scope: DataSourceInternal.ResolvedScope, path: string, npath: string, lObject: VersionedObject, dObject: InMemoryDataSource.DataStoreObject
  ) {
    let cc = this.controlCenter();
    let lManager = lObject.manager();
    let aspect = lManager.aspect();
    let remoteAttributes = new Map<keyof VersionedObject, any>();
    cc.registerObject(component, lObject);
    function *attributes(aspect: Aspect.Installed, scope: DataSourceInternal.ResolvedScope, path: string): IterableIterator<Aspect.InstalledAttribute> {
      let cls_scope = scope[aspect.name];
      if (!cls_scope)
        return
      let attributes = cls_scope[path] || cls_scope['_'];
      if (!attributes)
        return;
      yield* attributes;
    }
    const load = (a: Aspect.InstalledAttribute, v) => {
      if (v instanceof InMemoryDataSource.DataStoreObject) {
        let dObject = v;
        let lId = this.ds.fromDSId(dObject.id);
        let lObject = cc.findOrCreate(lId, dObject.is);
        let spath = `${npath}${a.name}.`;
        this._load(component, ds, scope, spath, spath, lObject, dObject);
      }
    }
    for (let a of attributes(aspect, scope, path)) {
      let v = dObject.get(a.name);
      if (v instanceof Set || v instanceof Array) {
        for (let vi of v)
          load(a, vi);
      }
      else {
        load(a, v);
      }
      remoteAttributes.set(a.name as keyof VersionedObject, ds.fromDSValue(cc, component, v));
    }
    lManager.mergeWithRemoteAttributes(remoteAttributes, dObject.version);
  }

  implQuery({ tr, sets }: { tr?: InMemoryDataSource.DataStoreTransaction, sets: ObjectSet[] }): { [k: string]: VersionedObject[] } {
    let ds = tr || this.ds;
    let ret = {};
    let cc = this.controlCenter();
    let component = {};
    cc.registerComponent(component);
    let res = DataSourceInternal.applySets(sets, ds.objectsAsArray(), true, {
      aspect: (vo: InMemoryDataSource.DataStoreObject) => cc.aspectChecked(vo.is),
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
      },
      sort: (a, b, type) => {
        if (Aspect.typeIsClass(type)) {
          a = a.id;
          b = b.id;
        }
        return a === b ? 0 : (a < b ? -1 : +1 );
      },
    });
    res.forEach((objs, set) => {
      ret[set.name] = objs.map(dObject => {
        let lId = this.ds.fromDSId(dObject.id);
        let lObject = cc.findOrCreate(lId, dObject.is);
        if (set.scope)
          this._loads(component, ds, set.scope, lObject, dObject);
        return lObject;
      });
    });
    cc.unregisterComponent(component);
    return ret;
  }

  implLoad({tr, objects, scope} : {
    tr?: InMemoryDataSource.DataStoreTransaction;
    objects: VersionedObject[];
    scope: DataSourceInternal.Scope;
  }): VersionedObject[] {
    let ds = tr || this.ds;
    let cc = this.controlCenter();
    let component = {};
    let ret: VersionedObject[] = [];
    cc.registerComponent(component);
    if (objects) {
      let rscope = DataSourceInternal.resolveScopeForObjects(scope, this.controlCenter(), objects);
      for (let lObject of objects) {
        let dbId = this.ds.toDSId(lObject.id());
        let dObject = ds.get(dbId);
        if (dObject) {
          this._loads(component, ds, rscope, lObject, dObject);
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

  implSave({tr, objects} : { tr: InMemoryDataSource.DataStoreTransaction, objects: Set<VersionedObject> }) : Promise<Result<void>> {
    let saved = new Set<VersionedObject>();
    const save = (lObject: VersionedObject): InMemoryDataSource.DataStoreObject | undefined => {
      let dVersion = tr.versions.get(lObject);
      if (dVersion) {
        let dbId = this.ds.toDSId(dVersion._id);
        return tr.get(dbId);
      }

      let lVersion = lObject.manager().versionVersion();
      if (lVersion === VersionedObjectManager.DeletedVersion) {
        let dbId = this.ds.toDSId(lObject.id());
        if (!tr.delete(dbId))
          diags.push({ type: "error", msg: `cannot delete ${lObject.id()}: object not found` });
        return undefined;
      }
      else if (lVersion !== VersionedObjectManager.NoVersion) { // Update
        let dbId = this.ds.toDSId(lObject.id());
        let dObject = tr.get(dbId);
        if (!dObject)
          diags.push({ type: "error", msg: `cannot update ${lObject.id()}: object not found` });
        if (dObject) {
          dObject = tr.willUpdate(dObject);
          dObject.version++;
          tr.versions.set(lObject, { _id: this.ds.fromDSId(dObject.id), _version: dObject.version });
          let lManager = lObject.manager();
          let n = diags.length;
          for (let [k, lv] of lManager._localAttributes) {
            let dbv = dObject.attributes.get(k);
            let exv = lManager._versionAttributes.get(k);
            if (!areEquals(exv,dbv))
              diags.push({ type: "error", msg: `cannot update ${lObject.id()}: attribute ${k} mismatch` });
            else
              dObject.attributes.set(k, tr.toDSValue(lv, create));
          }
          if (diags.length > n) {
            let remoteAttributes = new Map<keyof VersionedObject, any>();
            cc.registerObject(component, lObject);
            for (let k of lManager._localAttributes.keys())
              remoteAttributes.set(k, tr.fromDSValue(cc, component, dObject.attributes.get(k)));
            lManager.mergeWithRemoteAttributes(remoteAttributes, dObject.version);
          }
        }
        return dObject;
      }
      else { // new
        let lManager = lObject.manager();
        let dObject = new InMemoryDataSource.DataStoreObject(lManager.aspect().name, this.ds.nextId(), 0);
        tr.versions.set(lObject, { _id: this.ds.fromDSId(dObject.id), _version: dObject.version });
        tr.add(dObject);
        for (let [k, lv] of lManager._localAttributes)
          dObject.attributes.set(k, tr.toDSValue(lv, create));
        return dObject;
      }
    }

    const create = (vo) : InMemoryDataSource.DataStoreObject | undefined => {
      if (objects.has(vo))
        return save(vo)!;
      diags.push({ type: "error", msg: `cannot save, the object ${vo.id()} is not is the save list` });
      return undefined;
    }

    let cc = this.controlCenter();
    let diags: Diagnostic[] = [];
    let component = {};
    cc.registerComponent(component);
    for (let lObject of objects) {
      save(lObject);
    }
    cc.unregisterComponent(component);
    return Promise.resolve(Result.fromDiagnostics(diags));
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
    toDSValue(value, create?: (o: VersionedObject) => DataStoreObject | undefined): any;
    fromDSValue(cc: ControlCenter, cmp: AComponent, value): any;
  }

  function fixDSValue(value, fix: (value: DataStoreObject) => any): any {
    if (value instanceof Set)
      return new Set([...value].map(v => fixDSValue(v, fix)));
    if (value instanceof Array)
      return value.map(v => fixDSValue(v, fix));
    if (value instanceof DataStoreObject)
      return fix(value);
    return value;
  }

  function fixVOValue(value, fix: (value: VersionedObject) => any): any {
    if (value instanceof Set)
      return new Set([...value].map(v => fixVOValue(v, fix)));
    if (value instanceof Array)
      return value.map(v => fixVOValue(v, fix));
    if (value instanceof VersionedObject)
      return fix(value);
    return value;
  }

  function toDSValue(ds: DataStore, tr: DataStoreCRUD, value, create?: (value: VersionedObject) => DataStoreObject | undefined): any {
    const fix = (value: VersionedObject) => {
      let dsId = ds.toDSId(value.id());
      return tr.get(dsId) || (create && create(value)) || new DataStoreObject(value.manager().name(), ds.toDSId(value.id()), -1);
    }
    return fixVOValue(value, fix);
  }

  function fromDSValue(ds: DataStore, tr: DataStoreCRUD, cc: ControlCenter, cmp: AComponent, value): any {
    const fix = (value: DataStoreObject) => {
      let lId = ds.fromDSId(value.id);
      let vo = cc.find(lId);
      if (!vo) {
        vo = cc.findOrCreate(lId, value.is);
        cc.registerObject(cmp, vo);
      }
      return vo;
    }
    return fixDSValue(value, fix);
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
    toDSValue(value, create?: (value: VersionedObject) => DataStoreObject | undefined): any { return toDSValue(this, this, value, create); }
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
      return fixDSValue(value, value => this.ds.get(value.id));
    }
    toDSValue(value, create?: (value: VersionedObject) => DataStoreObject | undefined): any { return toDSValue(this.ds, this, value, create); }
    fromDSValue(cc: ControlCenter, cmp: AComponent, value): any { return fromDSValue(this.ds, this, cc, cmp, value); }

    commit() {
      let fix = value => this.ds.get(value.id) || value;
      for (let deleted of this.del_objects)
        this.ds.delete(deleted);
      for (let edited of this.edt_objects.values()) {
        for (let [k, v] of edited.attributes)
          edited.attributes.set(k, fixDSValue(v, fix));
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
