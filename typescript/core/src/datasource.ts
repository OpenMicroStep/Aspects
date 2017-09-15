import {
  Identifier, VersionedObject, VersionedObjectManager, VersionedObjectCoder,
  FarImplementation, areEquals, Result, Invokable, Aspect,
  DataSourceInternal, EncodedVersionedObjects,
} from './core';
import {Reporter, Diagnostic} from '@openmicrostep/msbuildsystem.shared';
import {DataSource} from '../../../generated/aspects.interfaces';
export {DataSource} from '../../../generated/aspects.interfaces';

DataSource.category('local', <DataSource.ImplCategories.local<DataSource>>{
  /// category core
  filter(objects: VersionedObject[], arg1) {
    return DataSourceInternal.applyWhere(arg1, objects, this.controlCenter());
  }
});
type ExtDataSource = { _queries?:DataSourceQueries, _safeValidators?: SafeValidators };
export type DataSourceTransaction = {};
export type DataSourceOptionalTransaction = DataSourceTransaction | undefined;
export type DataSourceQuery = (reporter: Reporter, query: { id: string, [s: string]: any }) => DataSourceInternal.Request;
export type DataSourceQueries = Map<string, DataSourceQuery>;
DataSource.category('initServer', <DataSource.ImplCategories.initServer<DataSource & { _queries?:DataSourceQueries, _safeValidators?: SafeValidators }>>{
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
    let coder = new VersionedObjectCoder(new Map(), undefined);
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
    let diagnostics: Diagnostic[] = [];
    let saved: VersionedObject[]= [];
    let coder = new VersionedObjectCoder(new Map(), undefined);
    for (let vo of w.objects) {
      if (vo.manager().state() !== VersionedObjectManager.State.NEW)
        saved.push(vo);
    }
    if (saved.length > 0) {
      let res = await this.farPromise('distantLoad', { objects: saved, scope: w.scope });
      if (res.hasOneValue()) {
        let coder = new VersionedObjectCoder(new Map(), undefined);
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
    let coder = new VersionedObjectCoder(new Map(), undefined);
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
        coder.decodeEncodedVersionedObjects(this.controlCenter(),res.value(), false);
        this.controlCenter().unregisterComponent(coder);
      }
      return Result.fromResultWithNewValue(res, objects);
    }
    return Result.fromValue(objects);
  }
});

DataSource.category('server', <DataSource.ImplCategories.server<DataSource.Categories.safe & ExtDataSource>>{
  async distantQuery(request) : Promise<Result<{ e: EncodedVersionedObjects, results: { [s: string] : Identifier[] } }>> {
    let creator = this._queries && this._queries.get(request.id);
    if (!creator)
      return new Result([{ is: "diagnostic", type: "error", msg: `request ${request.id} doesn't exists` }]);
    let reporter = new Reporter();
    reporter.transform.push((d) => { d.type = "error"; return d; });
    let query = creator(reporter, request);
    if (reporter.failed)
      return Result.fromDiagnostics(reporter.diagnostics);
    let res = await this.farPromise('safeQuery', query);
    if (!res.hasOneValue())
      return res as Result;

    let v = res.value();
    let r = {};
    let coder = new VersionedObjectCoder(this._safeValidators || new Map(), undefined);
    for (let k of Object.keys(v))
      r[k] = v[k].map(vo => {
        coder.encode(vo);
        return vo.id();
      });
    return Result.fromResultWithNewValue(res, { e: coder.takeEncodedVersionedObjects(), results: r });
  },
  async distantLoad(w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }): Promise<Result<EncodedVersionedObjects>> {
    let res = await this.farPromise('safeLoad', w);
    if (!res.hasOneValue())
      return res as Result;

    let coder = new VersionedObjectCoder(this._safeValidators || new Map(), undefined);
    for (let vo of res.value())
      coder.encode(vo);
    return Result.fromResultWithNewValue(res, coder.takeEncodedVersionedObjects());
  },
  async distantSave(data: EncodedVersionedObjects) : Promise<Result<EncodedVersionedObjects>> {
    let coder = new VersionedObjectCoder(this._safeValidators || new Map(), new Set());
    this.controlCenter().registerComponent(coder);
    let objects = coder.decodeEncodedVersionedObjects(this.controlCenter(), data, true);
    this.controlCenter().unregisterComponent(coder);
    let res = await this.farPromise('safeSave', objects);
    if (!res.hasOneValue())
      return res as Result;

    for (let vo of res.value())
      coder.encode(vo);
    return Result.fromResultWithNewValue(res, coder.takeEncodedVersionedObjects());
  }
});

export type SafeValidator<T extends VersionedObject = VersionedObject> = {
  filterObject?: (manager: VersionedObjectManager) => void,
  preSaveAttributes?: DataSourceInternal.Scope,
  preSavePerObject?: (reporter: Reporter, set: { add(object: VersionedObject) }, object: T) => Promise<void>,
  preSavePerDomain?: (reporter: Reporter, set: { add(object: VersionedObject) }, objects: VersionedObject[]) => Promise<void>,
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

DataSource.category('safe', <DataSource.ImplCategories.safe<DataSource.Categories.implementation & ExtDataSource>>{
  safeQuery(request: { [k: string]: any }) {
    let sets = DataSourceInternal.parseRequest(<any>request, this.controlCenter());
    return this.farPromise('implQuery', { tr: undefined, sets: sets });
  },
  safeLoad(w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }) {
    return this.farPromise('implLoad', { tr: undefined, objects: w.objects, scope: w.scope });
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
    let cc = this.controlCenter();
    let validators = new Map<SafeValidator, VersionedObject[]>();
    let domainValidators = new Map<(reporter: Reporter, set: { add(object: VersionedObject) }, objects: VersionedObject[]) => Promise<void>, VersionedObject[]>();
    for (let o of changed) {
      o.validate(reporter);
      let validator = this._safeValidators && this._safeValidators.get(o.manager().name());
      if (validator) {
          if (validator.preSaveAttributes || validator.preSavePerObject) {
          let list = validators.get(validator);
          list ? list.push(o) : validators.set(validator, [o]);
        }
        if (validator.preSavePerDomain) {
          let list = domainValidators.get(validator.preSavePerDomain);
          list ? list.push(o) : domainValidators.set(validator.preSavePerDomain, [o]);
        }
      }
    }
    if (reporter.diagnostics.length > 0)
      return Result.fromDiagnosticsAndValue(reporter.diagnostics, objects);
    for (let [validator, objects] of validators) {
      if (validator.preSaveAttributes)
        await this.farPromise('implLoad', { tr: tr, objects: objects, scope: validator.preSaveAttributes });
      if (validator.preSavePerObject) {
        for (let o of objects)
          await validator.preSavePerObject(reporter, changed, o);
      }
    }
    for (let [validator, objects] of domainValidators)
      await validator(reporter, changed, objects);

    if (reporter.diagnostics.length === 0) {
      let save = await this.farPromise('implSave', { tr: tr, objects: changed });
      reporter.diagnostics.push(...save.diagnostics());
    }
    let end = await this.farPromise('implEndTransaction', { tr: tr, commit: reporter.diagnostics.length === 0 });
    reporter.diagnostics.push(...end.diagnostics());
    return Result.fromDiagnosticsAndValue(reporter.diagnostics, objects); // TODO: clean object scope
  }
});

DataSource.category('raw', <DataSource.ImplCategories.raw<DataSource.Categories.implementation>>{
  rawQuery(request: { [k: string]: any }) {
    let sets = DataSourceInternal.parseRequest(<any>request, this.controlCenter());
    return this.farPromise('implQuery', { tr: undefined, sets: sets });
  },
  rawLoad(w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }) {
    return this.farPromise('implLoad', { tr: undefined, objects: w.objects, scope: w.scope });
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
