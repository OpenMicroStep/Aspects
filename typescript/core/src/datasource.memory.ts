import {
  ControlCenter, ControlCenterContext, Result, Identifier,
  DataSource, DataSourceInternal,
  Aspect, VersionedObject, VersionedObjectManager, VersionedObjectSnapshot,
  areEquals, ImmutableMap,
} from './core';
import {Diagnostic} from '@openmicrostep/msbuildsystem.shared';
import ObjectSet = DataSourceInternal.ObjectSet;
declare var console: any;

export type MemoryDataSourceTransaction = { tr: InMemoryDataSource.DataStoreTransaction };
export class InMemoryDataSource extends DataSource {
  constructor(cc: ControlCenter, private ds: InMemoryDataSource.DataStore) {
    super(cc);
  }
  static parent = DataSource;
  static definition = {
    is: "class",
    name: "InMemoryDataSource",
    version: 0,
    is_sub_object: false,
    aspects: DataSource.definition.aspects
  };

  private _loads(
    ccc: ControlCenterContext, ds: InMemoryDataSource.DataStoreCRUD,
    scope: DataSourceInternal.ResolvedScope, lObject: VersionedObject, dObject: InMemoryDataSource.DataStoreObject
  ) {
    this._load(ccc, ds, scope, '.', '', lObject, dObject);
  }

  private _load(
    ccc: ControlCenterContext, ds: InMemoryDataSource.DataStoreCRUD,
    scope: DataSourceInternal.ResolvedScope, path: string, npath: string, lObject: VersionedObject, dObject: InMemoryDataSource.DataStoreObject
  ) {
    let lManager = lObject.manager();
    let aspect = lManager.aspect();
    let snapshot = new VersionedObjectSnapshot(aspect, lManager.id());
    function *attributes(aspect: Aspect.Installed, scope: DataSourceInternal.ResolvedScope, path: string): IterableIterator<Aspect.InstalledAttribute> {
      let cls_scope = scope[aspect.classname];
      if (!cls_scope)
        return;
      let attributes = cls_scope[path] || cls_scope['_'];
      if (!attributes)
        return;
      yield* attributes;
    }
    const load = (a: Aspect.InstalledAttribute, v) => {
      if (v instanceof InMemoryDataSource.DataStoreObject) {
        let dObject = v;
        let lId = this.ds.fromDSId(dObject.get(Aspect.attribute_id));
        let lObject = ccc.findOrCreate(lId, dObject.is);
        let spath = `${npath}${a.name}.`;
        this._load(ccc, ds, scope, spath, spath, lObject, dObject);
      }
    };
    snapshot.setAttributeValueFast(Aspect.attribute_version, dObject.get(Aspect.attribute_version));
    for (let attribute of attributes(aspect, scope, path)) {
      let v = dObject.get(attribute);
      if (v instanceof Set || v instanceof Array) {
        for (let vi of v)
          load(attribute, vi);
      }
      else {
        load(attribute, v);
      }
      snapshot.setAttributeValueFast(attribute, ds.fromDSValue(ccc, v));
    }
    lManager.mergeSavedAttributes(snapshot);
  }

  implQuery({ context: { ccc } }, { tr, sets }: { tr?: InMemoryDataSource.DataStoreTransaction, sets: ObjectSet[] }): { [k: string]: VersionedObject[] } {
    let ds = tr || this.ds;
    let ret = {};
    let res = DataSourceInternal.applySets(sets, ds.objectsAsArray(), true, {
      aspect: (vo: InMemoryDataSource.DataStoreObject) => this.controlCenter().aspectChecked(vo.is),
      has: (vo: InMemoryDataSource.DataStoreObject, attribute: Aspect.InstalledAttribute) => true,
      get: (vo: InMemoryDataSource.DataStoreObject, attribute: Aspect.InstalledAttribute) => {
        if (attribute.name === "_id")
          return ds.get(vo.get(Aspect.attribute_id));
        return ds.fixValue(vo.get(attribute));
      },
      todb: (vo: InMemoryDataSource.DataStoreObject, attribute: Aspect.InstalledAttribute, value) => {
        if (attribute.name === "_id" && typeof value !== "object")
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
        let lId = this.ds.fromDSId(dObject.get(Aspect.attribute_id));
        let lObject = ccc.findOrCreate(lId, dObject.is);
        if (set.scope)
          this._loads(ccc, ds, set.scope, lObject, dObject);
        return lObject;
      });
    });
    return ret;
  }

  implLoad({ context: { ccc } }, {tr, objects, scope}: {
    tr?: InMemoryDataSource.DataStoreTransaction;
    objects: VersionedObject[];
    scope: DataSourceInternal.ResolvedScope;
  }): VersionedObject[] {
    let ds = tr || this.ds;
    let ret: VersionedObject[] = [];
    if (objects) {
      for (let lObject of objects) {
        let dbId = this.ds.toDSId(lObject.id());
        let dObject = ds.get(dbId);
        if (dObject) {
          this._loads(ccc, ds, scope, lObject, dObject);
          ret.push(lObject);
        }
      }
    }
    return ret;
  }

  implBeginTransaction(): InMemoryDataSource.DataStoreTransaction {
    return this.ds.beginTransaction();
  }

  implSave({ context: { ccc } }, {tr, objects}: { tr: InMemoryDataSource.DataStoreTransaction, objects: VersionedObject[] }) : Promise<Result<void>> {
    let diags: Diagnostic[] = [];
    let objects_set = new Set(objects);

    const save = (lObject: VersionedObject): InMemoryDataSource.DataStoreObject | undefined => {
      let dVersion = tr.versions.get(lObject);
      if (dVersion) {
        let dbId = this.ds.toDSId(dVersion._id);
        return tr.get(dbId);
      }

      let lVersion = lObject.manager().version();
      if (lObject.manager().isPendingDeletion()) {
        let dbId = this.ds.toDSId(lObject.id());
        if (!tr.delete(dbId))
          diags.push({ is: "error", msg: `cannot delete ${lObject.id()}: object not found` });
        return undefined;
      }
      else if (lVersion !== VersionedObjectManager.NoVersion) { // Update
        let dbId = this.ds.toDSId(lObject.id());
        let dObject = tr.get(dbId);
        if (!dObject)
          diags.push({ is: "error", msg: `cannot update ${lObject.id()}: object not found` });
        if (dObject) {
          dObject = tr.willUpdate(dObject);
          dObject.set(Aspect.attribute_version, dObject.get(Aspect.attribute_version) + 1);
          tr.versions.set(lObject, { _id: this.ds.fromDSId(dObject.get(Aspect.attribute_id)), _version: dObject.get(Aspect.attribute_version) });
          let lManager = lObject.manager();
          let n = diags.length;
          for (let { attribute, modified } of lManager.modifiedAttributes()) {
            let dbv = dObject.get(attribute);
            let exv = lManager.savedAttributeValueFast(attribute);
            if (!areEquals(exv, dbv))
              diags.push({ is: "error", msg: `cannot update ${lObject.id()}: attribute ${attribute.name} mismatch` });
            else
              dObject.set(attribute, tr.toDSValue(modified, create));
          }
          if (diags.length > n) {
            let snapshot = new VersionedObjectSnapshot(lManager.aspect(), lManager.id());
            for (let { attribute, modified } of lManager.modifiedAttributes())
              snapshot.setAttributeValueFast(attribute, tr.fromDSValue(ccc, dObject.get(attribute)));
            lManager.mergeSavedAttributes(snapshot);
          }
        }
        return dObject;
      }
      else { // new
        let lManager = lObject.manager();
        let dObject = InMemoryDataSource.DataStoreObject.create(lManager, this.ds.nextId(), 0);
        tr.versions.set(lObject, { _id: this.ds.fromDSId(dObject.get(Aspect.attribute_id)), _version: dObject.get(Aspect.attribute_version) });
        tr.add(dObject);
        for (let { attribute, modified } of lManager.modifiedAttributes()) {
          dObject.set(attribute, tr.toDSValue(modified, create));
        }
        return dObject;
      }
    };

    function create(vo) : InMemoryDataSource.DataStoreObject | undefined {
      if (objects_set.has(vo))
        return save(vo);
      diags.push({ is: "error", msg: `cannot save, the object ${vo.id()} is not is the save list` });
      return undefined;
    };

    for (let lObject of objects)
      save(lObject);
    return Promise.resolve(Result.fromDiagnostics(diags));
  }

  async implEndTransaction({ context: { ccc } }, {tr, commit}: { tr: InMemoryDataSource.DataStoreTransaction, commit: boolean }) : Promise<void> {
    if (commit) {
      tr.commit();
      tr.versions.forEach((v, vo) => {
        let manager = vo.manager();
        manager.setId(v._id);
        manager.setSavedVersion(v._version);
      });
    }
  }
};
export namespace InMemoryDataSource {
  export class DataStoreObject {
    readonly is: string;
    attributes: any[];

    static create(manager: VersionedObjectManager, id: Identifier, version: number) : DataStoreObject {
      let attributes = new Array(manager.aspect().attributes_by_index.length);
      attributes[Aspect.attribute_id.index] = id; // _id
      attributes[Aspect.attribute_version.index] = version; // _version
      for (let i = 2; i < attributes.length; i++)
        attributes[i] = undefined;
      return new InMemoryDataSource.DataStoreObject(manager.classname(), attributes);
    }

    constructor(is: string, attributes: any[] = []) {
      this.is = is;
      this.attributes = attributes;
    }

    get(attribute: Aspect.InstalledAttribute) {
      return this.attributes[attribute.index];
    }

    set(attribute: Aspect.InstalledAttribute, value: any) {
      this.attributes[attribute.index] = value;
    }

    copy() {
      return new DataStoreObject(this.is, this.attributes.slice(0));
    }
  }
  export interface DataStoreCRUD {
    objectsAsArray(): DataStoreObject[];
    delete(id: Identifier);
    add(obj: DataStoreObject): void;
    get(id: Identifier) : DataStoreObject | undefined;
    fixValue(value): any;
    toDSValue(value, create?: (o: VersionedObject) => DataStoreObject | undefined): any;
    fromDSValue(ccc: ControlCenterContext, value): any;
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
      return tr.get(dsId) || (create && create(value)) || DataStoreObject.create(value.manager(), ds.toDSId(value.id()), -1);
    };
    return fixVOValue(value, fix);
  }

  function fromDSValue(ds: DataStore, tr: DataStoreCRUD, ccc: ControlCenterContext, value): any {
    const fix = (value: DataStoreObject) => {
      let lId = ds.fromDSId(value.get(Aspect.attribute_id));
      return ccc.findOrCreate(lId, value.is);
    };
    return fixDSValue(value, fix);
  }

  export class DataStore implements DataStoreCRUD {
    private prefix = "memory:";
    private idCounter = 0;
    private _objects = new Map<Identifier, DataStoreObject>();

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
      this._objects.set(object.get(Aspect.attribute_id), object);
    }

    get(id: Identifier) {
      return this._objects.get(id);
    }
    fixValue(value): any { return value; }
    toDSValue(value, create?: (value: VersionedObject) => DataStoreObject | undefined): any { return toDSValue(this, this, value, create); }
    fromDSValue(ccc: ControlCenterContext, value): any { return fromDSValue(this, this, ccc, value); }
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
      this.edt_objects.set(object.get(Aspect.attribute_id), object);
    }
    willUpdate(object: DataStoreObject) : DataStoreObject {
      object = object.copy();
      this.edt_objects.set(object.get(Aspect.attribute_id), object);
      return object;
    }

    get(id: Identifier) {
      return this.del_objects.has(id) ? undefined : (this.edt_objects.get(id) || this.ds.get(id));
    }
    fixValue(value): any {
      return fixDSValue(value, value => this.ds.get(value.get(Aspect.attribute_id)));
    }
    toDSValue(value, create?: (value: VersionedObject) => DataStoreObject | undefined): any { return toDSValue(this.ds, this, value, create); }
    fromDSValue(ccc: ControlCenterContext, value): any { return fromDSValue(this.ds, this, ccc, value); }

    commit() {
      let fix = (value: DataStoreObject) => this.ds.get(value.get(Aspect.attribute_id)) || value;
      for (let deleted of this.del_objects)
        this.ds.delete(deleted);
      for (let edited of this.edt_objects.values()) {
        for (let [idx, v] of edited.attributes.entries())
          edited.attributes[idx] = fixDSValue(v, fix);
        let o = this.ds.get(edited.get(Aspect.attribute_id));
        if (o) {
          o.set(Aspect.attribute_version, edited.get(Aspect.attribute_version));
          o.attributes = edited.attributes;
        }
        else
          this.ds.add(edited);
      }
    }
  }
}

export namespace InMemoryDataSource {
  export const Aspects = {
    client: Aspect.disabled_aspect<DataSource.Aspects.client>("DataSource", "client", "InMemoryDataSource"),
    server: <Aspect.FastConfiguration<DataSource.Aspects.server>> {
      name: "DataSource", aspect: "server", cstor: InMemoryDataSource, categories: DataSource.Aspects.server.categories,
      create(ccc: ControlCenterContext, ds: InMemoryDataSource.DataStore) { return ccc.create<DataSource.Aspects.server>("DataSource", this.categories, ds); },
    },
  };
}
