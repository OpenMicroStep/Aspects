import {
  Identifier, VersionedObject, VersionedObjectManager,
  ControlCenter, ControlCenterContext, Result,
  DataSourceInternal, PathReporter,
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

DataSource.category('client', <DataSource.ImplCategories.client<DataSource.Categories.Public>>{
  query({ context: { ccc } }, request: { id: string, [k: string]: any }) : Promise<Result<{ [s: string]: VersionedObject[] }>> {
    return ccc.farPromise(this.publicQuery, request);
  },
  load({ context: { ccc } }, w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }): Promise<Result<VersionedObject[]>>  {
    let reporter = new Reporter();
    let saved: VersionedObject[] = [];
    for (let vo of w.objects) {
      if (vo.manager().isSubObject())
        reporter.diagnostic({ is: "error", msg: `you cannot load sub-objects directly, you must load using root objects only` });
      else if (vo.manager().isSaved())
        saved.push(vo);
    }
    if (reporter.diagnostics.length > 0)
      return Promise.resolve(Result.fromDiagnosticsAndValue(reporter.diagnostics, w.objects));
    if (saved.length > 0) {
      return ccc.farPromise(this.publicLoad, { objects: saved, scope: w.scope });
    }
    return Promise.resolve(Result.fromValue(w.objects));
  },
  async save({ context: { ccc } }, objects: VersionedObject.Categories.validation[]) : Promise<Result<VersionedObject[]>> {
    let reporter = new Reporter();
    let ordered = filterValidateChangedObjects(reporter, objects).ordered;
    if (reporter.diagnostics.length > 0)
      return Result.fromDiagnosticsAndValue(reporter.diagnostics, objects);
    if (ordered.length > 0) {
      let res = await ccc.farPromise(this.publicSave, ordered);
      return Result.fromResultWithNewValue(res, objects);
    }
    return Result.fromValue(objects);
  }
});

DataSource.category('Public', <DataSource.ImplCategories.Public<DataSource.Categories.raw & DataSource.Categories.implementation & DataSource.Categories.safe & ExtDataSource>>{
  async publicQuery({ context: { ccc } }, request) : Promise<Result<{ [s: string]: VersionedObject[] }>> {
    let creator = this._queries && this._queries.get(request.id);
    if (!creator)
      return new Result([{ is: "error", msg: `request ${request.id} doesn't exists` }]);
    let reporter = new Reporter();
    reporter.transform.push((d) => { d.is = "error"; return d; });
    let query = await creator(reporter, request, this.controlCenter());
    if (reporter.failed)
      return Result.fromDiagnostics(reporter.diagnostics);
    return await safeQuery(ccc, this, new Set(), query);
  },
  publicLoad({ context: { ccc } }, w): Promise<Result<VersionedObject[]>> {
    return safeLoad(ccc, this, new Set(), w);
  },
  publicSave({ context: { ccc } }, objects) : Promise<Result<VersionedObject[]>> {
    return ccc.farPromise(this.safeSave, objects);
  }
});


export type SafePostLoad = (reporter: Reporter, dataSource: DataSource.Categories.raw) => SafePostLoadContext;
export type SafePostLoadContext = {
  for_each(vo: VersionedObject, path: string): void
  finalize(): Promise<void>
};
export type SafePreSave = (reporter: Reporter, dataSource: DataSource.Categories.raw, tr: DataSourceTransaction) => SafePreSaveContext;
export type SafePreSaveContext = {
  for_each(vo: VersionedObject, push: (object: VersionedObject) => void): void
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

function filterValidateChangedObjects(
  reporter: Reporter,
  objects: VersionedObject.Categories.validation[]
) : {
  ordered: VersionedObject.Categories.validation[],
  changed: Set<VersionedObject.Categories.validation>,
  missing_relations: { objects: VersionedObject[], scope: DataSourceInternal.ResolvedScope },
} {
  let changed = new Set<VersionedObject.Categories.validation>();
  let ordered: VersionedObject.Categories.validation[] = [];
  let all_objects = new Set(objects);
  let missing_relations = { objects: [] as VersionedObject[], scope: new DataSourceInternal.ResolvedScope() };
  let missing_scope = missing_relations.scope.scope;

  for (let o of objects) {
    let m = o.manager();
    if (m.isSubObject()) {
      reporter.diagnostic({ is: "error", msg: `you cannot save sub-objects directly, you must save the root object` })
    }
    else if (m.isModified() || m.isPendingDeletion()) {
      if (add_object(o)) {
        ordered.push(o);
        o.validate(new PathReporter(reporter));
        add_attributes(m);
      }
    }
  }
  return { ordered, changed, missing_relations };

  function add_object(o: VersionedObject.Categories.validation) {
    let sz = changed.size;
    changed.add(o);
    return sz < changed.size;
  }

  function add_sub_object(o: VersionedObject.Categories.validation) {
    if (add_object(o)) {
      o.validate(new PathReporter(reporter));
      add_attributes(o.manager());
    }
  }

  function add_attributes(m: VersionedObjectManager) {
    for (let { attribute, modified } of m.modifiedAttributes()) {
      if (attribute.is_sub_object) {
        for (let sub_vo of attribute.traverseValue<VersionedObject.Categories.validation>(modified))
          add_sub_object(sub_vo);
        for (let sub_vo of attribute.traverseValue<VersionedObject.Categories.validation>(m.savedAttributeValueFast(attribute)))
          add_sub_object(sub_vo);
      }
      else if (attribute.relation) {
        // both side of a relation must be saved
        for (let [, vo] of attribute.diffValue<VersionedObject.Categories.validation>(m.attributeValueFast(attribute), m.savedAttributeValueFast(attribute))) {
          if (!all_objects.has(vo) || !vo.manager().hasAttributeValueFast(attribute.relation.attribute)) {
            missing_relations.objects.push(vo);
            let missing_scope_cls = missing_scope.get(vo.manager().classname());
            let missing_scope_attr: Set<Aspect.InstalledAttribute>;
            if (!missing_scope_cls) {
              let missing_scope_cls = new Map<string, Set<Aspect.InstalledAttribute>>();
              missing_scope_attr = new Set();
              missing_scope_cls.set('.', missing_scope_attr);
              missing_scope.set(vo.manager().classname(), missing_scope_cls);
            }
            else {
              missing_scope_attr = missing_scope_cls.get('.')!;
            }

            missing_scope_attr.add(attribute.relation.attribute);
            if (add_object(vo)) {
              ordered.push(vo);
            }
          }
        }
      }
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
  let saved: VersionedObject[] = [];
  for (let o of w.objects)
    if (o.manager().isSaved())
      saved.push(o);
  let res = await ccc.farPromise(db.implLoad, { tr: undefined, objects: saved, scope: rscope });
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
  return Result.fromResultWithNewValue(res, w.objects);
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
    // TODO: snapshot/restore object scope, until then, SafePreSave can leak data
    let reporter = new Reporter();
    let { ordered, changed, missing_relations } = filterValidateChangedObjects(reporter, objects);
    if (changed.size === 0 || reporter.failed)
      return Result.fromDiagnosticsAndValue(reporter.diagnostics, objects); // safe, there is no way new attributes have been loaded

    let begin = await ccc.farPromise(this.implBeginTransaction, undefined);
    if (!begin.hasOneValue() || begin.hasDiagnostics())
      return Result.fromResultWithNewValue(begin, objects); // safe, there is no way new attributes have been loaded

    let tr = begin.value();
    try {
      {
        if (missing_relations.objects.length) {
          (await ccc.farPromise(this.implLoad, { tr, ...missing_relations })).safeValue(reporter);
        }
        let ordered_push = (vo: VersionedObject.Categories.validation) => {
          if (!changed.has(vo)) {
            changed.add(vo);
            ordered.push(vo);
          }
        };
        let safe_pre_saves = new Map<SafePreSave, SafePreSaveContext>();
        for (let o of changed) {
          let validator = this._safeValidators && this._safeValidators.get(o.manager().classname());
          if (validator) for (let safe_pre_save of validator.safe_pre_save) {
            let f = safe_pre_saves.get(safe_pre_save);
            if (!f)
              safe_pre_saves.set(safe_pre_save, f = safe_pre_save(reporter, this, tr));
            f.for_each(o, ordered_push);
          }
        }
        if (safe_pre_saves.size > 0)
          await Promise.all([...safe_pre_saves.values()].map(f => f.finalize()));
      }
      if (reporter.diagnostics.length === 0) {
        let save = await ccc.farPromise(this.implSave, { tr: tr, objects: ordered});
        reporter.diagnostics.push(...save.diagnostics());
      }
      if (reporter.diagnostics.length === 0) {
        let safe_post_saves = new Map<SafePostSave, SafePostSaveContext>();
        for (let o of changed) {
          o.validate(new PathReporter(reporter));
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

    return Result.fromReporterAndValue(reporter, objects);
  }
});

DataSource.category('raw', <DataSource.ImplCategories.raw<DataSource.Categories.implementation>>{
  rawQuery({ context: { ccc } }, request: { [k: string]: any }) {
    let sets = DataSourceInternal.parseRequest(<any>request, this.controlCenter());
    if (!sets.hasDiagnostics())
      return ccc.farPromise(this.implQuery, { tr: undefined, sets: sets.value() });
    return Promise.resolve(Result.fromResultWithoutValue(sets));
  },
  async rawLoad({ context: { ccc } }, w: {objects: VersionedObject[], scope: DataSourceInternal.Scope }) {
    let rscope = DataSourceInternal.resolveScopeForObjects(w.scope,  this.controlCenter(), w.objects);
    let saved: VersionedObject[] = [];
    for (let o of w.objects)
      if (o.manager().isSaved())
        saved.push(o);
    let res = await ccc.farPromise(this.implLoad, { tr: undefined, objects: saved, scope: rscope });
    return Result.fromResultWithNewValue(res, w.objects);
  },
  async rawSave({ context: { ccc } }, objects: VersionedObject.Categories.validation[]) {
    let reporter = new Reporter();
    let { ordered, missing_relations } = filterValidateChangedObjects(reporter, objects);
    if (ordered.length === 0 || reporter.failed)
      return Result.fromDiagnosticsAndValue(reporter.diagnostics, objects);

    let begin = await ccc.farPromise(this.implBeginTransaction, undefined);
    if (begin.hasOneValue() && !begin.hasDiagnostics()) {
      let tr = begin.value();
      if (missing_relations.objects.length) {
        let load_missings = await ccc.farPromise(this.implLoad, { tr: undefined, ...missing_relations });
        if (load_missings.hasDiagnostics())
          return Result.fromResultWithNewValue(load_missings, objects);
      }
      let save = await ccc.farPromise(this.implSave, { tr: tr, objects: ordered });
      let end = await ccc.farPromise(this.implEndTransaction, { tr: tr, commit: !save.hasDiagnostics() });
      return Result.fromDiagnosticsAndValue([...save.diagnostics(), ...end.diagnostics()], objects);
    }
    return Result.fromResultWithNewValue(begin, objects);
  }
});
