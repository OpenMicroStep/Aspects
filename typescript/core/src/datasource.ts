import {
  Identifier, VersionedObject, VersionedObjectManager, VersionedObjectCoder,
  ControlCenter, ControlCenterContext, Result,
  DataSourceInternal, EncodedVersionedObjects,
  ImmutableSet, Aspect,
} from './core';
import {Reporter} from '@openmicrostep/msbuildsystem.shared';
import {DataSource} from '../../../generated/aspects.interfaces';
export {DataSource} from '../../../generated/aspects.interfaces';

DataSource.category('local', <DataSource.ImplCategories.local<DataSource>>{
  /// category core
  filter(objects: VersionedObject[], arg1) {
    let res = DataSourceInternal.applyWhere(arg1, objects, this.controlCenter());
    return !res.hasDiagnostics() ? res.value() : [];
  }
});
type ExtDataSource = { _queries?: DataSourceQueries, _safeValidators?: SafeValidators };
export type DataSourceTransaction = {};
export type DataSourceOptionalTransaction = DataSourceTransaction | undefined;
export type DataSourceQuery = (
  reporter: Reporter,
  query: { id: string, [s: string]: any },
  cc: ControlCenter
) => DataSourceInternal.RequestDefinition | Promise<DataSourceInternal.RequestDefinition>;
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
  async query({ context: { ccc } }, request: { id: string, [k: string]: any }) : Promise<Result<{ [s: string]: VersionedObject[] }>> {
    let coder = new VersionedObjectCoder();
    let res = await ccc.farPromise(this.distantQuery, request);
    if (!res.hasOneValue())
      return res as Result;

    let v = res.value();
    await coder.decodeEncodedVersionedObjectsClient(ccc, v.e, this);
    let r = {};
    for (let k of Object.keys(v.results))
      r[k] = v.results[k].map(id => ccc.findChecked(id));
    return Result.fromResultWithNewValue(res, r);
  },
  async load({ context: { ccc } }, w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }): Promise<Result<VersionedObject[]>>  {
    let saved: VersionedObject[] = [];
    for (let vo of w.objects) {
      if (vo.manager().isSaved())
        saved.push(vo);
    }
    if (saved.length > 0) {
      let res = await ccc.farPromise(this.distantLoad, { objects: saved, scope: w.scope });
      if (res.hasOneValue()) {
        let coder = new VersionedObjectCoder();
        await coder.decodeEncodedVersionedObjectsClient(ccc, res.value(), this);
      }
      return Result.fromResultWithNewValue(res, w.objects);
    }
    return Promise.resolve(Result.fromValue(w.objects));
  },
  async save({ context: { ccc } }, objects: VersionedObject.Categories.validation[]) : Promise<Result<VersionedObject[]>> {
    let reporter = new Reporter();
    let coder = new VersionedObjectCoder();
    for (let vo of objects) {
      if (vo.manager().isModified()) {
        vo.validate(reporter);
        coder.encode(vo);
      }
    }
    if (reporter.diagnostics.length > 0)
      return Result.fromDiagnosticsAndValue(reporter.diagnostics, objects);
    let changed = coder.takeEncodedVersionedObjects();
    if (changed.length > 0) {
      let res = await ccc.farPromise(this.distantSave, changed);
      if (res.hasOneValue())
        await coder.decodeEncodedVersionedObjectsClient(ccc, res.value(), this);
      return Result.fromResultWithNewValue(res, objects);
    }
    return Result.fromValue(objects);
  }
});

DataSource.category('server', <DataSource.ImplCategories.server<DataSource.Categories.raw & DataSource.Categories.implementation & DataSource.Categories.safe & ExtDataSource>>{
  async distantQuery({ context: { ccc } }, request) : Promise<Result<{ e: EncodedVersionedObjects, results: { [s: string]: Identifier[] } }>> {
    let creator = this._queries && this._queries.get(request.id);
    if (!creator)
      return new Result([{ is: "error", msg: `request ${request.id} doesn't exists` }]);
    let reporter = new Reporter();
    reporter.transform.push((d) => { d.is = "error"; return d; });
    let query = await creator(reporter, request, this.controlCenter());
    if (reporter.failed)
      return Result.fromDiagnostics(reporter.diagnostics);
    let all = new Set();
    let res = await safeQuery(ccc, this, all, query);
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
  async distantLoad({ context: { ccc } }, w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }): Promise<Result<EncodedVersionedObjects>> {
    let all = new Set();
    let res = await safeLoad(ccc, this, all, w);
    if (!res.hasOneValue())
      return res as Result;

    let coder = new VersionedObjectCoder();
    for (let vo of all)
      coder.encode(vo);
    return Result.fromResultWithNewValue(res, coder.takeEncodedVersionedObjects());
  },
  async distantSave({ context: { ccc } }, data: EncodedVersionedObjects) : Promise<Result<EncodedVersionedObjects>> {
    let coder = new VersionedObjectCoder();
    this.controlCenter().registerComponent(coder);
    let objects = coder.decodeEncodedVersionedObjectsWithModifiedValues(ccc, data);
    let res = await ccc.farPromise(this.safeSave, objects);
    if (!res.hasOneValue())
      return res as Result;

    for (let vo of res.value())
      coder.encode(vo);
    return Result.fromResultWithNewValue(res, coder.takeEncodedVersionedObjects());
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
  for (let o of objects)
    add(o);
  return changed;

  function add(o) {
    let manager = o.manager();
    manager.fillNewObjectMissingValues();
    if (manager.isModified()) {
      let attributes_by_index = manager.aspect().attributes_by_index;
      for (let i = 2; i < attributes_by_index.length; i++) {
        let attribute = attributes_by_index[i];
        if (attribute.is_sub_object && manager.isAttributeModifiedFast(attribute)) {
          for (let sub of Aspect.traverse<VersionedObject>(attribute.type, manager.attributeValueFast(attribute)))
            if (!changed.has(o))
              add(o);
          for (let sub of Aspect.traverse<VersionedObject>(attribute.type, manager.savedAttributeValueFast(attribute)))
            if (!changed.has(o))
              add(o);
        }
      }
      changed.add(o);
    }
  }
}

async function safeScope(
  ccc: ControlCenterContext,
  reporter: Reporter,
  db: DataSource.Categories.implementation & DataSource.Categories.raw & ExtDataSource,
  all: Set<VersionedObject> | undefined,
  iterator: Iterable<[VersionedObject, DataSourceInternal.ResolvedScope]>,
): Promise<void> {
  let filters = new Map<SafePostLoad, SafePostLoadContext>();
  let extras = new Map<VersionedObject, Set<string>>();
  for (let [object, scope] of iterator) {
    DataSourceInternal.traverseScope(scope, object, (manager, path, scope_attributes) => {
      let vo = manager.object();
      ccc.registerObject(vo);
      if (all)
        all.add(vo);
      let safe_validator = db._safeValidators && db._safeValidators.get(manager.classname());
      if (safe_validator) for (let safe_post_load of safe_validator.safe_post_load) {
        let f = filters.get(safe_post_load);
        if (!f)
          filters.set(safe_post_load, f = safe_post_load(reporter, db));
        f.for_each(vo, path);
      }
    });
  }
  if (filters.size > 0)
    await Promise.all([...filters.values()].map(f => f.finalize()));
}

async function safeQuery(
  ccc: ControlCenterContext,
  db: DataSource.Categories.implementation & DataSource.Categories.raw & ExtDataSource,
  all: Set<VersionedObject> | undefined,
  request: { [k: string]: any },
  strictScope: boolean = true,
) : Promise<Result<{ [k: string]: VersionedObject[] }>> {
  let reporter = new Reporter();
  let sets = DataSourceInternal.parseRequest(<any>request, db.controlCenter());
  if (sets.hasDiagnostics())
    return Result.fromResultWithoutValue(sets);
  let res = await ccc.farPromise(db.implQuery, { tr: undefined, sets: sets.value() });
  if (res.hasOneValue()) {
    let v = res.value();
    await safeScope(ccc, reporter, db, all, (function*(): Iterable<[VersionedObject, DataSourceInternal.ResolvedScope]> {
      for (let set of sets.value()) {
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
  ccc: ControlCenterContext,
  db: DataSource.Categories.implementation & DataSource.Categories.raw & ExtDataSource,
  all: Set<VersionedObject> | undefined,
  w: {objects: VersionedObject[], scope: DataSourceInternal.Scope },
  strictScope: boolean = true,
) : Promise<Result<VersionedObject[]>> {
  let reporter = new Reporter();
  let rscope = DataSourceInternal.resolveScopeForObjects(w.scope, db.controlCenter(), w.objects);
  let res = await ccc.farPromise(db.implLoad, { tr: undefined, objects: w.objects, scope: rscope });
  if (res.hasOneValue()) {
    let v = res.value();
    await safeScope(ccc, reporter, db, all, (function*(): Iterable<[VersionedObject, DataSourceInternal.ResolvedScope]> {
      for (let object of v) {
        yield [object, rscope];
      }
    })());
    if (reporter.failed)
      return Result.fromItemsWithoutValue([...res.items(), ...reporter.diagnostics]);
  }
  return res;
}

DataSource.category('safe', <DataSource.ImplCategories.safe<DataSource.Categories.implementation & DataSource.Categories.raw & ExtDataSource>>{
  safeQuery({ context: { ccc } }, request: { [k: string]: any }) {
    return safeQuery(ccc, this, undefined, request);
  },
  safeLoad({ context: { ccc } }, w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }) {
    return safeLoad(ccc, this, undefined, w);
  },
  async safeSave({ context: { ccc } }, objects: VersionedObject.Categories.validation[]) {
    // TODO: Do we want to force load attributes in case of failure or for unchanged objects ?
    let changed = filterChangedObjectsAndPrepareNew(objects);
    if (changed.size === 0)
      return Result.fromValue(objects); // safe, there is no way new attributes have been loaded

    let begin = await ccc.farPromise(this.implBeginTransaction, undefined);
    if (!begin.hasOneValue())
      return Result.fromResultWithNewValue(begin, objects); // safe, there is no way new attributes have been loaded

    let tr = begin.value();
    let reporter = new Reporter();
    try {
      {
        let safe_pre_saves = new Map<SafePreSave, SafePreSaveContext>();
        for (let o of changed) {
          o.validate(reporter);
          let validator = this._safeValidators && this._safeValidators.get(o.manager().classname());
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
        let save = await ccc.farPromise(this.implSave, { tr: tr, objects: changed });
        reporter.diagnostics.push(...save.diagnostics());
      }
      if (reporter.diagnostics.length === 0) {
        let safe_post_saves = new Map<SafePostSave, SafePostSaveContext>();
        for (let o of changed) {
          o.validate(reporter);
          let validator = this._safeValidators && this._safeValidators.get(o.manager().classname());
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
      let end = await ccc.farPromise(this.implEndTransaction, { tr: tr, commit: reporter.diagnostics.length === 0 });
      reporter.diagnostics.push(...end.diagnostics());
    }

    return Result.fromReporterAndValue(reporter, objects); // TODO: clean object scope
  }
});

DataSource.category('raw', <DataSource.ImplCategories.raw<DataSource.Categories.implementation>>{
  rawQuery({ context: { ccc } }, request: { [k: string]: any }) {
    let sets = DataSourceInternal.parseRequest(<any>request, this.controlCenter());
    if (!sets.hasDiagnostics())
      return ccc.farPromise(this.implQuery, { tr: undefined, sets: sets.value() });
    return Promise.resolve(Result.fromResultWithoutValue(sets));
  },
  rawLoad({ context: { ccc } }, w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }) {
    let rscope = DataSourceInternal.resolveScopeForObjects(w.scope,  this.controlCenter(), w.objects);
    return ccc.farPromise(this.implLoad, { tr: undefined, objects: w.objects, scope: rscope });
  },
  async rawSave({ context: { ccc } }, objects: VersionedObject[]) {
    let changed = filterChangedObjectsAndPrepareNew(objects);
    if (changed.size === 0)
      return Result.fromValue(objects);
    let begin = await ccc.farPromise(this.implBeginTransaction, undefined);
    if (begin.hasOneValue()) {
      let tr = begin.value();
      let save = await ccc.farPromise(this.implSave, { tr: tr, objects: changed });
      let end = await ccc.farPromise(this.implEndTransaction, { tr: tr, commit: !save.hasDiagnostics() });
      return Result.fromDiagnosticsAndValue([...begin.diagnostics(), ...save.diagnostics(), ...end.diagnostics()], objects);
    }
    return Result.fromResultWithNewValue(begin, objects);
  }
});
