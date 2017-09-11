import {Identifier, VersionedObject, VersionedObjectManager, FarImplementation, areEquals, Invocation, InvocationState, Invokable, Aspect, DataSourceInternal } from './core';
import {Reporter, Diagnostic} from '@openmicrostep/msbuildsystem.shared';
import {DataSource} from '../../../generated/aspects.interfaces';
export {DataSource} from '../../../generated/aspects.interfaces';

DataSource.category('local', <DataSource.ImplCategories.local<DataSource>>{
  /// category core 
  filter(objects: VersionedObject[], arg1) {
    return DataSourceInternal.applyWhere(arg1, objects, this.controlCenter());
  }
});
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
  query(request: { id: string, [k: string]: any }) {
    return this.farPromise('distantQuery', request);
  },
  load(w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }) {
    let diagnostics: Diagnostic[] = [];
    let saved: VersionedObject[]= [];
    for (let vo of w.objects) {
      if (vo.manager().state() !== VersionedObjectManager.State.NEW)
        saved.push(vo);
    }
    if (saved.length > 0) {
      return this.farPromise('distantLoad', { objects: saved, scope: w.scope }).then((envelop) => {
        return new Invocation(envelop.diagnostics(), true, w.objects);
      });
    }
    else {
      return Promise.resolve(new Invocation([], true, w.objects));
    }
  },
  save(objects: VersionedObject.Categories.validation[]) {
    let reporter = new Reporter();
    let changed = new Set<VersionedObject>();
    for (let o of objects) {
      let manager = o.manager();
      let state = manager.state();
      if (state !== VersionedObjectManager.State.UNCHANGED) {
        changed.add(o);
        o.validate(reporter);
      }
    }
    if (reporter.diagnostics.length > 0)
      return new Invocation(reporter.diagnostics, true, objects);
    return this.farPromise('distantSave', [...changed]).then((inv) => {
      this.controlCenter().notificationCenter().postNotification({
        name: "saved",
        object: this,
        info: objects,
      })
      return new Invocation(inv.diagnostics(), true, objects);
    });
  }
});

DataSource.category('server', <DataSource.ImplCategories.server<DataSource.Categories.safe & { _queries?:DataSourceQueries }>>{
  distantQuery(request) {
    let creator = this._queries && this._queries.get(request.id);
    if (!creator)
      return new Invocation([{ type: "error", msg: `request ${request.id} doesn't exists` }], false, undefined);
    let reporter = new Reporter();
    reporter.transform.push((d) => { d.type = "error"; return d; });
    let query = creator(reporter, request);
    if (reporter.failed)
      return new Invocation(reporter.diagnostics, false, undefined);
    return this.farPromise('safeQuery', query);
  },
  distantLoad(w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }) {
    // TODO: add some local checks
    return this.farPromise('safeLoad', w);
  },
  distantSave(objects: VersionedObject[]) {
    // TODO: add some local checks
    return this.farPromise('safeSave', objects);
  }
});

export type SafeValidator<T extends VersionedObject = VersionedObject> = {
  filterObject?: (object: VersionedObject) => void,
  preSaveAttributes?: DataSourceInternal.Scope,
  preSavePerObject?: (reporter: Reporter, set: { add(object: VersionedObject) }, object: T) => Promise<void>,
  preSavePerDomain?: (reporter: Reporter, set: { add(object: VersionedObject) }, objects: VersionedObject[]) => Promise<void>,
}
export type SafeValidators = Map<string, SafeValidator>;

function filterObjects(validators: SafeValidators | undefined, objects: VersionedObject[]) {
  if (validators) {
    for (let o of objects) {
      let validator = validators.get(o.manager().name());
      if (validator && validator.filterObject)
        validator.filterObject(o);
    }
  }
}

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

DataSource.category('safe', <DataSource.ImplCategories.safe<DataSource.Categories.implementation & { _safeValidators?: SafeValidators }>>{
  async safeQuery(request: { [k: string]: any }) {
    let sets = DataSourceInternal.parseRequest(<any>request, this.controlCenter());
    let inv = await this.farPromise('implQuery', { tr: undefined, sets: sets });
    if (inv.hasResult()) {
      let r = inv.result();
      for (let k in r)
        filterObjects(this._safeValidators, r[k]);
    }
    return inv;
  },
  async safeLoad(w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }) {
    let inv = await this.farPromise('implLoad', { tr: undefined, objects: w.objects, scope: w.scope });
    if (inv.hasResult())
      filterObjects(this._safeValidators, inv.result());
    return inv;
  },
  async safeSave(objects: VersionedObject.Categories.validation[]) {
    // TODO: Do we want to force load attributes in case of failure or for unchanged objects ?
    let changed = filterChangedObjectsAndPrepareNew(objects);
    if (changed.size === 0)
      return new Invocation([], true, objects);
    
    let begin = await this.farPromise('implBeginTransaction', undefined);
    if (!begin.hasResult())
      return new Invocation(begin.diagnostics(), true, objects);

    let tr = begin.result();
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
      return new Invocation(reporter.diagnostics, true, objects);
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
    return new Invocation(reporter.diagnostics, true, objects); // TODO: clean object scope
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
      return new Invocation([], true, objects);
    let begin = await this.farPromise('implBeginTransaction', undefined);
    if (begin.hasResult()) {
      let tr = begin.result();
      let save = await this.farPromise('implSave', { tr: tr, objects: changed });
      let end = await this.farPromise('implEndTransaction', { tr: tr, commit: !save.hasDiagnostics() });
      return new Invocation([...begin.diagnostics(), ...save.diagnostics(), ...end.diagnostics()], true, objects);
    }
    return new Invocation(begin.diagnostics(), true, objects);
  }
});