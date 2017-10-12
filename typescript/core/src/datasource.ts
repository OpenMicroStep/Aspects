import {
  Identifier, VersionedObject, VersionedObjectManager, VersionedObjectCoder,
  ControlCenter, Result,
  DataSourceInternal, EncodedVersionedObjects,
  ImmutableSet,
} from './core';
import {Reporter} from '@openmicrostep/msbuildsystem.shared';
import {DataSource} from '../../../generated/aspects.interfaces';
export {DataSource} from '../../../generated/aspects.interfaces';

DataSource.category('local', <DataSource.ImplCategories.local<DataSource>>{
  /// category core
  filter(objects: VersionedObject[], arg1) {
    return DataSourceInternal.applyWhere(arg1, objects, this.controlCenter());
  }
});
type ExtDataSource = { _queries?: DataSourceQueries, _safeValidators?: SafeValidators };
export type DataSourceTransaction = {};
export type DataSourceOptionalTransaction = DataSourceTransaction | undefined;
export type DataSourceQuery = (
  reporter: Reporter,
  query: { id: string, [s: string]: any },
  cc: ControlCenter
) => DataSourceInternal.Request | Promise<DataSourceInternal.Request>;
export type DataSourceQueries = Map<string, DataSourceQuery>;
DataSource.category('initServer', <DataSource.ImplCategories.initServer<DataSource & ExtDataSource>>{
  setQueries(queries) {
    this._queries = queries;
  },
  setSafeValidators(validators) {
    this._safeValidators = validators;
  },
});

DataSource.category('client', <DataSource.ImplCategories.client<DataSource.Categories.server>>{
  async query(request: { id: string, [k: string]: any }) : Promise<Result<{ [s: string]: VersionedObject[] }>> {
    let cc = this.controlCenter();
    let coder = new VersionedObjectCoder();
    let res = await this.farPromise('distantQuery', request);
    if (!res.hasOneValue())
      return res as Result;

    let v = res.value();
    cc.registerComponent(coder);
    coder.decodeEncodedVersionedObjects(cc, v.e, false);
    let r = {};
    for (let k of Object.keys(v.results))
      r[k] = v.results[k].map(id => cc.findChecked(id));
    cc.unregisterComponent(coder);
    return Result.fromResultWithNewValue(res, r);
  },
  async load(w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }): Promise<Result<VersionedObject[]>>  {
    let saved: VersionedObject[] = [];
    for (let vo of w.objects) {
      if (vo.manager().state() !== VersionedObjectManager.State.NEW)
        saved.push(vo);
    }
    if (saved.length > 0) {
      let res = await this.farPromise('distantLoad', { objects: saved, scope: w.scope });
      if (res.hasOneValue()) {
        let coder = new VersionedObjectCoder();
        this.controlCenter().registerComponent(coder);
        coder.decodeEncodedVersionedObjects(this.controlCenter(), res.value(), false);
        this.controlCenter().unregisterComponent(coder);
      }
      return Result.fromResultWithNewValue(res, w.objects);
    }
    return Promise.resolve(Result.fromValue(w.objects));
  },
  async save(objects: VersionedObject.Categories.validation[]) : Promise<Result<VersionedObject[]>> {
    let reporter = new Reporter();
    let coder = new VersionedObjectCoder();
    for (let vo of objects) {
      let manager = vo.manager();
      let state = manager.state();
      if (state !== VersionedObjectManager.State.UNCHANGED) {
        vo.validate(reporter);
        coder.encode(vo);
      }
    }
    if (reporter.diagnostics.length > 0)
      return Result.fromDiagnosticsAndValue(reporter.diagnostics, objects);
    let changed = coder.takeEncodedVersionedObjects();
    if (changed.length > 0) {
      let res = await this.farPromise('distantSave', changed);
      if (res.hasOneValue()) {
        this.controlCenter().registerComponent(coder);
        coder.decodeEncodedVersionedObjects(this.controlCenter(), res.value(), false);
        this.controlCenter().unregisterComponent(coder);
      }
      return Result.fromResultWithNewValue(res, objects);
    }
    return Result.fromValue(objects);
  }
});

DataSource.category('server', <DataSource.ImplCategories.server<DataSource.Categories.safe & ExtDataSource>>{
  async distantQuery(request) : Promise<Result<{ e: EncodedVersionedObjects, results: { [s: string]: Identifier[] } }>> {
    let creator = this._queries && this._queries.get(request.id);
    if (!creator)
      return new Result([{ is: "error", msg: `request ${request.id} doesn't exists` }]);
    let reporter = new Reporter();
    reporter.transform.push((d) => { d.is = "error"; return d; });
    let query = await creator(reporter, request, this.controlCenter());
    if (reporter.failed)
      return Result.fromDiagnostics(reporter.diagnostics);
    let all = new Set();
    let res = await safeQuery(this, all, query);
    if (!res.hasOneValue())
      return res as Result;

    let v = res.value();
    let r = {};
    let coder = new VersionedObjectCoder();
    for (let vo of all)
      coder.encode(vo);
    for (let k of Object.keys(v))
      r[k] = v[k].map(vo => vo.id());
    return Result.fromResultWithNewValue(res, { e: coder.takeEncodedVersionedObjects(), results: r });
  },
  async distantLoad(w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }): Promise<Result<EncodedVersionedObjects>> {
    let all = new Set();
    let res = await safeLoad(this, all, w);
    if (!res.hasOneValue())
      return res as Result;

    let coder = new VersionedObjectCoder();
    for (let vo of all)
      coder.encode(vo);
    return Result.fromResultWithNewValue(res, coder.takeEncodedVersionedObjects());
  },
  async distantSave(data: EncodedVersionedObjects) : Promise<Result<EncodedVersionedObjects>> {
    let coder = new VersionedObjectCoder();
    this.controlCenter().registerComponent(coder);
    let objects = coder.decodeEncodedVersionedObjects(this.controlCenter(), data, true);
    try {
      let res = await this.farPromise('safeSave', objects);
      if (!res.hasOneValue())
        return res as Result;

      for (let vo of res.value())
        coder.encode(vo);
      return Result.fromResultWithNewValue(res, coder.takeEncodedVersionedObjects());
    }
    finally {
      this.controlCenter().unregisterComponent(coder);
    }
  }
});


export type SafePostLoad = (reporter: Reporter, dataSource: DataSource.Categories.raw) => SafePostLoadContext;
export type SafePostLoadContext = {
  for_each(vo: VersionedObject, path: string): void
  finalize(): Promise<void>
};
export type SafePreSave = (reporter: Reporter, dataSource: DataSource.Categories.raw, tr: DataSourceTransaction) => SafePreSaveContext;
export type SafePreSaveContext = {
  for_each(vo: VersionedObject, set: ImmutableSet<VersionedObject> & { add(object: VersionedObject) }): void
  finalize(): Promise<void>
};
export type SafePostSave = (reporter: Reporter, dataSource: DataSource.Categories.raw, tr: DataSourceTransaction) => SafePostSaveContext;
export type SafePostSaveContext = {
  for_each(vo: VersionedObject): void
  finalize(): Promise<void>
};

export type SafeValidator = {
  safe_post_load: SafePostLoad[];
  safe_pre_save: SafePreSave[];
  safe_post_save: SafePostSave[];
}
export type SafeValidators = Map<string, SafeValidator>;

function filterChangedObjectsAndPrepareNew<T extends VersionedObject>(objects: T[]) : Set<T> {
  let changed = new Set<T>();
  for (let o of objects) {
    let manager = o.manager();
    let state = manager.state();
    if (state === VersionedObjectManager.State.NEW)
      manager.setNewObjectMissingValues();
    if (state !== VersionedObjectManager.State.UNCHANGED)
      changed.add(o);
  }
  return changed;
}

async function safeScope(
  reporter: Reporter,
  db: DataSource.Categories.implementation & ExtDataSource,
  all: Set<VersionedObject> | undefined,
  iterator: Iterable<[VersionedObject, DataSourceInternal.ResolvedScope]>,
  strictScope: boolean = true,
): Promise<void> {
  let filters = new Map<SafePostLoad, SafePostLoadContext>();
  let extras = new Map<VersionedObject, Set<string>>();
  let cmp = {};
  let cc = db.controlCenter();
  try {
    cc.registerComponent(cmp);
    for (let [object, scope] of iterator) {
      DataSourceInternal.traverseScope(scope, object, (manager, path, scope_attributes) => {
        let vo = manager.object();
        cc.registerObject(cmp, vo);
        if (all)
          all.add(vo);
        let safe_validator = db._safeValidators && db._safeValidators.get(manager.name());
        if (safe_validator) for (let safe_post_load of safe_validator.safe_post_load) {
          let f = filters.get(safe_post_load);
          if (!f)
            filters.set(safe_post_load, f = safe_post_load(reporter, db));
          f.for_each(vo, path);
        }
        if (strictScope) {
          let extra = extras.get(vo);
          if (!extra) {
            extra = new Set();
            for (let a of manager.localAttributes().keys())
              if (a !== "_id" && a !== "_version")
                extra.add(a);
            for (let a of manager.versionAttributes().keys())
              if (a !== "_id" && a !== "_version")
                extra.add(a);
            extras.set(vo, extra);
          }
          for (let a of scope_attributes)
            extra.delete(a.name);
        }
      });
    }
    if (strictScope) {
      for (let extra of extras.values()) {
        for (let a of extra) {
          reporter.diagnostic({ is: "error", msg: `attribute ${a} can't be loaded` });
        }
      }
    }
    if (filters.size > 0)
      await Promise.all([...filters.values()].map(f => f.finalize()));
  }
  finally {
    cc.unregisterComponent(cmp);
  }
}

async function safeQuery(
  db: DataSource.Categories.implementation & ExtDataSource,
  all: Set<VersionedObject> | undefined,
  request: { [k: string]: any },
  strictScope: boolean = true,
) : Promise<Result<{ [k: string]: VersionedObject[] }>> {
  let reporter = new Reporter();
  let sets = DataSourceInternal.parseRequest(<any>request, db.controlCenter());
  let res = await db.farPromise('implQuery', { tr: undefined, sets: sets });
  if (res.hasOneValue()) {
    let v = res.value();
    await safeScope(reporter, db, all, (function*(): Iterable<[VersionedObject, DataSourceInternal.ResolvedScope]> {
      for (let set of sets) {
        let objects = v[set.name!];
        for (let object of objects)
          yield [object, set.scope!];
      }
    })());
    if (reporter.failed)
      return Result.fromItemsWithoutValue([...res.items(), ...reporter.diagnostics]);
  }
  return res;
}

async function safeLoad(
  db: DataSource.Categories.implementation & ExtDataSource,
  all: Set<VersionedObject> | undefined,
  w: {objects: VersionedObject[], scope: DataSourceInternal.Scope },
  strictScope: boolean = true,
) : Promise<Result<VersionedObject[]>> {
  let reporter = new Reporter();
  let rscope = DataSourceInternal.resolveScopeForObjects(w.scope, db.controlCenter(), w.objects);
  let res = await db.farPromise('implLoad', { tr: undefined, objects: w.objects, scope: rscope });
  if (res.hasOneValue()) {
    let v = res.value();
    await safeScope(reporter, db, all, (function*(): Iterable<[VersionedObject, DataSourceInternal.ResolvedScope]> {
      for (let object of v) {
        yield [object, rscope];
      }
    })());
    if (reporter.failed)
      return Result.fromItemsWithoutValue([...res.items(), ...reporter.diagnostics]);
  }
  return res;
}

DataSource.category('safe', <DataSource.ImplCategories.safe<DataSource.Categories.implementation & ExtDataSource>>{
  safeQuery(request: { [k: string]: any }) {
    return safeQuery(this, undefined, request);
  },
  safeLoad(w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }) {
    return safeLoad(this, undefined, w);
  },
  async safeSave(objects: VersionedObject.Categories.validation[]) {
    // TODO: Do we want to force load attributes in case of failure or for unchanged objects ?
    let changed = filterChangedObjectsAndPrepareNew(objects);
    if (changed.size === 0)
      return Result.fromValue(objects); // safe, there is no way new attributes have been loaded

    let begin = await this.farPromise('implBeginTransaction', undefined);
    if (!begin.hasOneValue())
      return Result.fromResultWithNewValue(begin, objects); // safe, there is no way new attributes have been loaded

    let tr = begin.value();
    let reporter = new Reporter();
    try {
      {
        let safe_pre_saves = new Map<SafePreSave, SafePreSaveContext>();
        for (let o of changed) {
          o.validate(reporter);
          let validator = this._safeValidators && this._safeValidators.get(o.manager().name());
          if (validator) for (let safe_pre_save of validator.safe_pre_save) {
            let f = safe_pre_saves.get(safe_pre_save);
            if (!f)
              safe_pre_saves.set(safe_pre_save, f = safe_pre_save(reporter, this, tr));
            f.for_each(o, changed);
          }
        }
        if (safe_pre_saves.size > 0)
          await Promise.all([...safe_pre_saves.values()].map(f => f.finalize()));
      }
      if (reporter.diagnostics.length === 0) {
        let save = await this.farPromise('implSave', { tr: tr, objects: changed });
        reporter.diagnostics.push(...save.diagnostics());
      }
      if (reporter.diagnostics.length === 0) {
        let safe_post_saves = new Map<SafePostSave, SafePostSaveContext>();
        for (let o of changed) {
          o.validate(reporter);
          let validator = this._safeValidators && this._safeValidators.get(o.manager().name());
          if (validator) for (let safe_post_save of validator.safe_post_save) {
            let f = safe_post_saves.get(safe_post_save);
            if (!f)
            safe_post_saves.set(safe_post_save, f = safe_post_save(reporter, this, tr));
            f.for_each(o);
          }
        }
        if (safe_post_saves.size > 0)
          await Promise.all([...safe_post_saves.values()].map(f => f.finalize()));
      }
    } finally {
      let end = await this.farPromise('implEndTransaction', { tr: tr, commit: reporter.diagnostics.length === 0 });
      reporter.diagnostics.push(...end.diagnostics());
    }

    return Result.fromDiagnosticsAndValue(reporter.diagnostics, objects); // TODO: clean object scope
  }
});

DataSource.category('raw', <DataSource.ImplCategories.raw<DataSource.Categories.implementation>>{
  rawQuery(request: { [k: string]: any }) {
    let sets = DataSourceInternal.parseRequest(<any>request, this.controlCenter());
    return this.farPromise('implQuery', { tr: undefined, sets: sets });
  },
  rawLoad(w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }) {
    let rscope = DataSourceInternal.resolveScopeForObjects(w.scope,  this.controlCenter(), w.objects);
    return this.farPromise('implLoad', { tr: undefined, objects: w.objects, scope: rscope });
  },
  async rawSave(objects: VersionedObject[]) {
    let changed = filterChangedObjectsAndPrepareNew(objects);
    if (changed.size === 0)
      return Result.fromValue(objects);
    let begin = await this.farPromise('implBeginTransaction', undefined);
    if (begin.hasOneValue()) {
      let tr = begin.value();
      let save = await this.farPromise('implSave', { tr: tr, objects: changed });
      let end = await this.farPromise('implEndTransaction', { tr: tr, commit: !save.hasDiagnostics() });
      return Result.fromDiagnosticsAndValue([...begin.diagnostics(), ...save.diagnostics(), ...end.diagnostics()], objects);
    }
    return Result.fromResultWithNewValue(begin, objects);
  }
});
