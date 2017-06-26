import {Identifier, VersionedObject, VersionedObjectManager, FarImplementation, areEquals, Invocation, InvocationState, Invokable, Aspect, DataSource } from './core';
import {Reporter, Diagnostic} from '@openmicrostep/msbuildsystem.shared';

DataSource.category('local', <DataSource.ImplCategories.local<DataSource>>{
  /// category core 
  filter(objects: VersionedObject[], arg1) {
    return DataSourceInternal.applyWhere(arg1, objects, (name) => {
      let cstor = this.controlCenter().aspect(name);
      return cstor && cstor.aspect;
    });
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
  load(w: {objects: VersionedObject[], scope: string[]}) {
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
    let changed = filterToOnlyChangedObjects(objects);
    for (let o of changed)
      o.validate(reporter);
    if (reporter.diagnostics.length > 0)
      return new Invocation(reporter.diagnostics, true, objects);
    return this.farPromise('distantSave', [...changed]).then((inv) => {
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
  distantLoad(w: {objects: VersionedObject[], scope: string[]}) {
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
  preSaveAttributes?: string[],
  preSavePerObject?: (reporter: Reporter, set: { add(object: VersionedObject) }, object: T) => void,
  preSavePerDomain?: (reporter: Reporter, set: { add(object: VersionedObject) }, objects: VersionedObject[]) => void,
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

function filterToOnlyChangedObjects<T extends VersionedObject>(objects: T[]) : Set<T> {
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
    let sets = DataSourceInternal.parseRequest(<any>request, (name) => {
      let cstor = this.controlCenter().aspect(name);
      return cstor && cstor.aspect;
    });
    let inv = await this.farPromise('implQuery', { tr: undefined, sets: sets });
    if (inv.hasResult()) {
      let r = inv.result();
      for (let k in r)
        filterObjects(this._safeValidators, r[k]);
    }
    return inv;
  },
  async safeLoad(w: {objects: VersionedObject[], scope: string[]}) {
    let inv = await this.farPromise('implLoad', { tr: undefined, objects: w.objects, scope: w.scope });
    if (inv.hasResult())
      filterObjects(this._safeValidators, inv.result());
    return inv;
  },
  async safeSave(objects: VersionedObject.Categories.validation[]) {
    // TODO: Do we want to force load attributes in case of failure or for unchanged objects ?
    let changed = filterToOnlyChangedObjects(objects);
    if (changed.size === 0)
      return new Invocation([], true, objects);
    
    let begin = await this.farPromise('implBeginTransaction', undefined);
    if (!begin.hasResult())
      return new Invocation(begin.diagnostics(), true, objects);

    let tr = begin.result();
    let reporter = new Reporter();
    let cc = this.controlCenter();
    let validators = new Map<SafeValidator, VersionedObject[]>();
    let domainValidators = new Map<(reporter: Reporter, set: { add(object: VersionedObject) }, objects: VersionedObject[]) => void, VersionedObject[]>();
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
          list ? list.push(o) : validators.set(validator.preSavePerDomain, [o]);
        }
      }
    }
    if (reporter.diagnostics.length > 0)
      return new Invocation(reporter.diagnostics, true, objects);
    for (let [validator, objects] of validators) {
      if (validator.preSaveAttributes && validator.preSaveAttributes.length > 0)
        await this.farPromise('implLoad', { tr: tr, objects: objects, scope: validator.preSaveAttributes });
      if (validator.preSavePerObject) {
        for (let o of objects)
          validator.preSavePerObject(reporter, changed, o);
      }
    }
    for (let [validator, objects] of domainValidators)
      validator(reporter, changed, objects);
    
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
    let sets = DataSourceInternal.parseRequest(<any>request, (name) => {
      let cstor = this.controlCenter().aspect(name);
      return cstor && cstor.aspect;
    });
    return this.farPromise('implQuery', { tr: undefined, sets: sets });
  },
  rawLoad(w: {objects: VersionedObject[], scope: string[]}) {
    return this.farPromise('implLoad', { tr: undefined, objects: w.objects, scope: w.scope });
  },
  async rawSave(objects: VersionedObject[]) {
    let changed = filterToOnlyChangedObjects(objects);
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

export namespace DataSourceInternal {
  type VarDep = Map<ObjectSet, Set<ObjectSet>>;
  type Solution<T> = {
    partial: Set<T>,
    full: Set<T> | undefined,
  };
  export type Mapper<T> = {
    aspect(object: T): Aspect.Installed;
    has(object: T, attribute: string): boolean;
    get(object: T, attribute: string): any;
    todb(object: T, attribute: string, value): any;
  };
  export const versionedObjectMapper: Mapper<VersionedObject> = {
    aspect(vo: VersionedObject) { return vo.manager().aspect(); },
    has(vo: VersionedObject, attribute: string) { return vo.manager().hasAttributeValue(attribute); },
    get(vo: VersionedObject, attribute:  keyof VersionedObject) { return vo.manager().attributeValue(attribute); },
    todb(vo: VersionedObject, attribute: string, value) { return value; }
  }
  export class FilterContext<T> {
    _resolution = new Map<ObjectSet, Solution<T>>();
    constructor(public objects: T[] = [], public mapper: Mapper<T>) {}

    solution(set: ObjectSet) {
      let s = this._resolution.get(set)!
      if (!s) {
        s = {
          partial: this.solvePartial(set),
          full: undefined,
        };
        this._resolution.set(set, s);
      }
      return s;
    }

    private addDep(deps: VarDep, set: ObjectSet, dep: ObjectSet) {
      let d = deps.get(set);
      if (!d)
        deps.set(set, d = new Set());
      d.add(dep);
    }

    private buildDeps(set: ObjectSet, constraint: Constraint, prefix: string, deps: VarDep) {
      if (constraint instanceof ConstraintTree) {
        constraint.value.forEach(c => this.buildDeps(set, c, prefix + constraint.prefix, deps));
      }
      else if (constraint instanceof ConstraintVariable) {
        let lset = set.variable(prefix + constraint.leftVariable)!;
        let rset = set.variable(prefix + constraint.rightVariable)!;
        this.addDep(deps, lset, rset);
        this.addDep(deps, rset, lset);
      }
    }

    private buildOrder(set: ObjectSet) : ObjectSet[] {
      let deps = new Map<ObjectSet, Set<ObjectSet>>();
      for (let c of set.constraints)
        this.buildDeps(set, c, "", deps);
      let order: ObjectSet[] = [];
      traverse(set);

      function traverse(set: ObjectSet) {
        if (order.indexOf(set) === -1) {
          order.push(set);
          for (let dep of deps.get(set)!)
            traverse(dep);
        }
      }

      return order;
    }

    private pass(set: ObjectSet, constraint: Constraint, prefix: string, object: T) : boolean {
      let ok = true;
      if (constraint instanceof ConstraintTree) {
        switch(constraint.type) {
          case ConstraintType.And: ok = constraint.value.every(c => this.pass(set, c, prefix + constraint.prefix, object)); break;
          case ConstraintType.Or : ok = constraint.value.some (c => this.pass(set, c, prefix + constraint.prefix, object)); break;
        }
      }
      else if (constraint instanceof ConstraintValue) {
        ok = this.mapper.has(object, constraint.attribute.name) &&
             pass_value(constraint.type, this.mapper.get(object, constraint.attribute.name), this.mapper.todb(object, constraint.attribute.name, constraint.value));
      }
      return ok;
    }

    private solvePartial(set: ObjectSet) : Set<T> {
      let ret = new Set<T>();
      for (let object of this.objects) {
        let ok = false;
        switch (set.type) {
          case ConstraintType.InstanceOf:
          case ConstraintType.MemberOf: 
            ok = this.mapper.aspect(object).name === (set.aspect as Aspect.Installed).name; // TODO: real instanceof/memberof
            break;
          case ConstraintType.UnionOf:
            ok = (set.aspect as ObjectSet[]).some(s => this.solveFull(s).has(object));
            break;
        }
        ok = ok && set.constraints.every(c => this.pass(set, c, "", object));
        if (ok)
          ret.add(object);
      }

      return ret;
    }

    private passVars(set: ObjectSet, set1: ObjectSet, o1: T, set2: ObjectSet, o2: T, constraint: Constraint, prefix: string) : boolean {
      let ok = true;
      if (constraint instanceof ConstraintTree) {
        switch(constraint.type) {
          case ConstraintType.And: ok = constraint.value.every(c => this.passVars(set, set1, o1, set2, o2, c, prefix + constraint.prefix)); break;
          case ConstraintType.Or : ok = constraint.value.some (c => this.passVars(set, set1, o1, set2, o2, c, prefix + constraint.prefix)); break;
        }
      }
      else if (constraint instanceof ConstraintVariable) {
        let lset = set.variable(prefix + constraint.leftVariable)!;
        let rset = set.variable(prefix + constraint.rightVariable)!;
        if ((lset === set1 || lset === set2) && (rset === set1 || rset === set2)) {
          let lo = (lset === set1 ? o1 : o2);
          let ro = (rset === set1 ? o1 : o2);
          ok = this.mapper.has(lo, constraint.leftAttribute.name) && this.mapper.has(ro, constraint.rightAttribute.name)
            && pass_value(constraint.type, this.mapper.get(lo, constraint.leftAttribute.name), this.mapper.get(ro, constraint.rightAttribute.name));
        }
      }
      return ok;
    }

    solveFull(set: ObjectSet) : Set<T> {
      let solution = this.solution(set);
      if (!solution.full) {
        if (set.variables) {
          let order = this.buildOrder(set);
          for (let i = order.length - 1; i > 0; i--) {
            let set1 = order[i    ];
            let set2 = order[i - 1];
            let objs1 = this.solution(set1).partial;
            let objs2 = this.solution(set2).partial;
            for (let o2 of objs2) {
              let ok2 = false;
              for (let o1 of objs1) {
                let ok1 = set.constraints.every(c => this.passVars(set, set1, o1, set2, o2, c, ""));
                ok2 = ok2 || ok1;
              }
              if (!ok2) 
                objs2.delete(o2);
            }
          }
        }
        solution.full = solution.partial;
      }
      return solution.full;
    }
  
  };

  export enum ConstraintType {
    Equal = 0,
    NotEqual,
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
    Text,
    Exists,
    In = 20,
    NotIn,
    SubIn,
    SubNotIn,
    Has,
    InstanceOf,
    MemberOf,
    UnionOf,
    Or,
    And,
    CustomStart = 100 // The first 100 ([0-99]) are reserved
  }
  export type ConstraintBetweenColumnsTypes = 
    ConstraintType.Equal |
    ConstraintType.NotEqual |
    ConstraintType.GreaterThan |
    ConstraintType.GreaterThanOrEqual |
    ConstraintType.LessThan |
    ConstraintType.LessThanOrEqual |
    ConstraintType.Has;
  export type ConstraintBetweenSetTypes = 
    ConstraintBetweenColumnsTypes |
    ConstraintType.In |
    ConstraintType.NotIn;
  export type ConstraintOnValueTypes = 
    ConstraintBetweenSetTypes |
    ConstraintType.Text |
    ConstraintType.Exists;
  export type ConstraintOnTypeTypes = ConstraintType.InstanceOf | ConstraintType.MemberOf | ConstraintType.UnionOf;

  export class ConstraintTree {
    constructor(
      public type: ConstraintType.Or | ConstraintType.And, 
      public prefix: string, // for fast variable prefixing
      public value: Constraint[]) {}
  }
  
  export class ConstraintValue {
    constructor(
      public type: ConstraintOnValueTypes,
      public attribute: Aspect.InstalledAttribute,
      public value: any) {}
  }
  
  export class ConstraintVariable {
    constructor(
      public type: ConstraintBetweenColumnsTypes,
      public leftVariable: string,
      public leftAttribute: Aspect.InstalledAttribute,
      public rightVariable: string,
      public rightAttribute: Aspect.InstalledAttribute) {}
  }
  
  export class ConstraintSub {
    constructor(
      public type: ConstraintType.SubIn | ConstraintType.SubNotIn,
      public attribute: Aspect.InstalledAttribute,
      public sub: string) {}
  }

  export type Constraint = ConstraintTree | ConstraintValue | ConstraintVariable | ConstraintSub;

  function isCompatible(
    typeA: ConstraintOnTypeTypes | undefined, aspectA: Aspect.Installed | ObjectSet[] | undefined, 
    typeB: ConstraintOnTypeTypes | undefined, aspectB: Aspect.Installed | ObjectSet[] | undefined
  ) : boolean {
    return aspectA ? aspectA === aspectB : true; // use type to check compatibility
  }

  export class ObjectSet {
    _name: string;
    type?: ConstraintOnTypeTypes = undefined;
    aspect?: Aspect.Installed | ObjectSet[] = undefined;
    name?: string = undefined;
    scope?: string[] = undefined;
    sort?: string[] = undefined;
    constraints: Constraint[] = [];
    variables?: Map<string, ObjectSet> = undefined;
    subs?: Map<string, ObjectSet> = undefined;

    clone(name: string) {
      let ret = new ObjectSet(name);
      ret.setAspect(this.type!, this.aspect);
      ret.constraints = this.constraints;
      if (this.variables) {
        for (let [name, variable] of this.variables)
          ret.setVariable(name, variable === this ? ret : variable);
      }
      ret.subs = this.subs;
      return ret;
    }

    hasVariable(name: string) : boolean {
      return !!((this.variables && this.variables.has(name)) || (this.subs && this.subs.has(name)));
    }
    setVariable(name: string, set: ObjectSet) {
      if (!this.variables)
        this.variables = new Map();
      if (this.hasVariable(name))
        throw new Error(`variable ${name} is already used`);

      this.variables.set(name, set);
    }

    variable(name: string): ObjectSet | undefined {
      if (name === this._name)
        return this;
      return this.variables && this.variables.get(name);
    }

    isCompatible(type: ConstraintOnTypeTypes, aspect?: Aspect.Installed | ObjectSet[]) {
      return isCompatible(this.type, this.aspect, type, aspect);
    }

    setAspect(type: ConstraintOnTypeTypes, aspect?: Aspect.Installed | ObjectSet[]) {
      if (!this.isCompatible(type, aspect)) {
        throw new Error(`incompatible aspect`);
      }
      this.type = type;
      this.aspect = aspect;
    }

    setAspectIfCompatible(other: ObjectSet) : boolean {
      let ret = other.type !== undefined && this.isCompatible(other.type, other.aspect);
      if (ret)
        this.setAspect(other.type!, other.aspect);
      return ret;
    }

    aspectAttribute(name: string) {
      let attr = (this.aspect as Aspect.Installed).attributes.get(name);
      if (!attr)
        throw new Error(`attribute ${name} not found in ${(this.aspect as Aspect.Installed).name}`);
      return attr;
    }

    sub(sub: ObjectSet) : string {
      if (!this.subs)
        this.subs = new Map();
      let name = sub._name;
      if (this.hasVariable(name))
        throw new Error(`variable ${name} is already used`);
      this.subs.set(name, sub);
      return name;
    }

    merge(sub: ObjectSet) : Constraint | undefined {
      let prefix = "";
      if (sub.variables) {
        prefix = sub._name + ".";
        for (let [k, s] of sub.variables.entries())
          this.setVariable(prefix + k, s === sub ? this : s);
      }
      return sub.constraints.length ? c_and(sub.constraints, prefix) : undefined;
    }

    and(constraint?: Constraint) : void {
      if (constraint)
        this.constraints.push(constraint);
    }

    constraint() {
      return c_and(this.constraints);
    }

    constructor(name: string) {
      this._name = name;
    }
  }

  function c_or (constraints: Constraint[] = [], prefix = "") { return new ConstraintTree(ConstraintType.Or , prefix, constraints); }
  function c_and(constraints: Constraint[] = [], prefix = "") { return new ConstraintTree(ConstraintType.And, prefix, constraints); }
  function c_value(type: ConstraintOnValueTypes, attribute: Aspect.InstalledAttribute, value: any): ConstraintValue 
  { return new ConstraintValue(type, attribute, value); }
  function c_var(type: ConstraintBetweenColumnsTypes, leftVariable: string, leftAttribute: Aspect.InstalledAttribute, rightVariable: string, rightAttribute: Aspect.InstalledAttribute): ConstraintVariable
  { return new ConstraintVariable(type, leftVariable, leftAttribute, rightVariable, rightAttribute); }
  function c_subin (sub: string, attribute: Aspect.InstalledAttribute): ConstraintSub { return new ConstraintSub(ConstraintType.SubIn   , attribute, sub); }
  function c_subnin(sub: string, attribute: Aspect.InstalledAttribute): ConstraintSub { return new ConstraintSub(ConstraintType.SubNotIn, attribute, sub); }


  function map(value) {
    if (value instanceof VersionedObject)
      value = value.id();
    return value;
  }
  function find(arr: IterableIterator<any>, value) {
    value = map(value);
    for (let v of arr) {
      if (map(v) === value)
        return true;
    }
    return false;
  }

  function pass_value(op: ConstraintOnValueTypes, left, right) {
    switch(op) {
      case ConstraintType.Equal: return map(left) === map(right);
      case ConstraintType.NotEqual: return map(left) !== map(right);
      case ConstraintType.GreaterThan: return left > right;
      case ConstraintType.GreaterThanOrEqual: return left >= right;
      case ConstraintType.LessThan: return left < right;
      case ConstraintType.LessThanOrEqual: return left <= right;
      case ConstraintType.Text: {
        if (left instanceof VersionedObject && typeof right === "string") {
          let manager = left.manager();
          for (let a of manager.aspect().attributes.values())
            if (right.indexOf(`${manager.attributeValue(a.name as keyof VersionedObject)}`) !== -1)
              return true;
          return false;
        }
        return false;
      }
      case ConstraintType.In: return find(right, left);
      case ConstraintType.NotIn: return !find(right, left);
      case ConstraintType.Has: return find(left, right);
      case ConstraintType.Exists: {
        return right !== undefined && (!Array.isArray(right) || right.length > 0);
      }
    }
    throw new Error(`Unsupported on value constraint ${ConstraintType[op as any]}`);
  }

  export type Scope = string[];
  export type Value = any;
  export type Instance<R> = string | R;
  export interface ConstraintDefinition {
    $eq?: Value,
    $ne?: Value,
    $gt?: string | Date | number,
    $gte?: string | Date | number,
    $lt?: string | Date | number,
    $lte?: string | Date | number,
    $exists?: boolean,
    $in?: Instance<ObjectSetDefinition> | (Value[]),
    $nin?: Instance<ObjectSetDefinition> | (Value[]),
    $has?: Instance<ObjectSetDefinition> | Value,
    [s: string]: Value | ConstraintDefinition
  };
  export interface ObjectSetDefinitionR {
    $in: Instance<ObjectSetDefinition> | (Value[]),
    $nin: Instance<ObjectSetDefinition> | (Value[]),
    $union : Instance<ObjectSetDefinition>[],
    $intersection : Instance<ObjectSetDefinition>[],
    $diff: [Instance<ObjectSetDefinition>, Instance<ObjectSetDefinition>],
    $instanceOf: string | Function,
    $memberOf: string | Function,
    $text: string,
    $out: string,
  };
  export type ObjectSetDefinition = Partial<ObjectSetDefinitionR> & {
    [s: string]: Value | ConstraintDefinition
  };
  export interface Element extends ObjectSetDefinitionR {
    $elementOf: Instance<ObjectSetDefinition>
  };
  export type Result = {
    name: string;
    where: Instance<ObjectSetDefinition>;
    sort?: string[];
    scope?: string[];
  }
  export type Request = Result | { results: (Result& { [s: string]: Instance<ObjectSetDefinition> })[], [s: string]: Instance<ObjectSetDefinition> };

  type OperatorOnSet<T> = (context: ParseContext, set: ObjectSet, value: T) => void;
  const operatorsOnSet: { [K in keyof Element]: OperatorOnSet<Element[K]>; } = {
    $elementOf: (context, set, value) => {
      let sub = context.parseSet(value, `${set._name}.$elementOf`);
      if (set.setAspectIfCompatible(sub)) // compatible
        set.and(set.merge(sub));
      else
        throw new Error(`cannot elementOf between incompatible sets`);
    },
    $instanceOf: (context, set, value) => {
      set.setAspect(ConstraintType.InstanceOf, context.aspect(value));
      set.type = ConstraintType.InstanceOf;
    },
    $memberOf: (context, set, value) => {
      set.setAspect(ConstraintType.MemberOf, context.aspect(value));
    },
    $union: (context, set, value) => {
      let subs = value.map((v, i) => context.parseSet(v, `${set._name}.$union[${i}]`));
      let type: ConstraintOnTypeTypes | undefined = set.type;
      let aspect = set.aspect;
      let areCompatibles = subs.every(s => {
        let r = isCompatible(type, aspect, s.type, s.aspect);
        if (r && s.aspect) {
          type = s.type;
          aspect = s.aspect;
        }
        return r;
      });
      if (areCompatibles) {
        let arr: Constraint[] = [];
        for (let sub of subs) {
          let c = set.merge(sub)
          if (c)
            arr.push(c);
        }
        set.and(c_or(arr));
      }
      else {
        set.setAspect(ConstraintType.UnionOf, subs);
      }
    },
    $intersection: (context, set, value) => {
      value.forEach((v, i) => {
        let sub = context.parseSet(v, `${set._name}.$intersection[${i}]`);
        if (set.setAspectIfCompatible(sub)) // must be compatible
          set.and(set.merge(sub));
        else
          throw new Error(`cannot intersect between incompatible sets`);
      });
    },
    $diff: (context, set, value) => {
      if (!Array.isArray(value) || value.length !== 2)
        throw new Error(`diff value must be an array of 2 object set`);
      let add = context.parseSet(value[0], `${set._name}.$diff+`);
      let del = context.parseSet(value[1], `${set._name}.$diff-`);
      set.and(c_subin(set.sub(add), add.aspectAttribute("_id")));
      set.and(c_subnin(set.sub(del), del.aspectAttribute("_id")));
    },
    $in: (context, set, value) => {
      if (Array.isArray(value))
        set.and(c_value(ConstraintType.In, set.aspectAttribute("_id"), value));
      else {
        let sub = context.parseSet(value, `${set._name}.$in`);
        if (set.setAspectIfCompatible(sub)) // must be compatible
          set.and(set.merge(sub));
        else
          throw new Error(`cannot intersect between incompatible sets`);
      }
    },
    $nin: (context, set, value) => {
      if (Array.isArray(value))
        set.and(c_value(ConstraintType.NotIn, set.aspectAttribute("_id"), value));
      else {
        let sub = context.parseSet(value, `${set._name}.$nin`);
        set.and(c_subnin(set.sub(sub), sub.aspectAttribute("_id")));
      }
    },
    $out: (context, set, value) => {
      throw new Error(`$out is managed in ParseContext`);
    },
    $text: (context, set, value) => {
      if (typeof value !== "string")
        throw new Error(`$text value must be a string`);
      if (value) // No constraint on empty string
        set.and(c_value(ConstraintType.Text, set.aspectAttribute("_id"), value));
    },
  }

  const operatorsBetweenSet: { [s: string]: ConstraintBetweenColumnsTypes; } = {
    $eq: ConstraintType.Equal,
    $ne: ConstraintType.NotEqual,
    $gt: ConstraintType.GreaterThan,
    $gte: ConstraintType.GreaterThanOrEqual,
    $lt: ConstraintType.LessThan,
    $lte: ConstraintType.LessThanOrEqual,
  };
  function alwaysTrue() { return true; }
  function validateInValue(this: { type: ConstraintOnValueTypes }, attribute: Aspect.InstalledAttribute, value) {
    if (!Array.isArray(value))
      throw new Error(`${attribute.name} ${ConstraintType[this.type]} value must be an array`);
  }
  function validateHasValue(this: { type: ConstraintOnValueTypes }, attribute: Aspect.InstalledAttribute, value) {
    if (attribute.type.type !== "array" && attribute.type.type !== "set")
      throw new Error(`${attribute.name}  must be an array or a set to allow ${ConstraintType[this.type]} operator`);
  }
  const operatorsOnValue: { [s: string]: { type: ConstraintOnValueTypes, validate(attribute: Aspect.InstalledAttribute, value): void } } = {
    $eq  : { type: ConstraintType.Equal             , validate: alwaysTrue },
    $ne  : { type: ConstraintType.NotEqual          , validate: alwaysTrue },
    $gt  : { type: ConstraintType.GreaterThan       , validate: alwaysTrue },
    $gte : { type: ConstraintType.GreaterThanOrEqual, validate: alwaysTrue },
    $lt  : { type: ConstraintType.LessThan          , validate: alwaysTrue },
    $lte : { type: ConstraintType.LessThanOrEqual   , validate: alwaysTrue },
    $in  : { type: ConstraintType.In                , validate: validateInValue },
    $nin : { type: ConstraintType.NotIn             , validate: validateInValue },
    $has : { type: ConstraintType.Has               , validate: validateHasValue },
    $text: { type: ConstraintType.Text              , validate: alwaysTrue },
  };

  function isResult(result: Request): result is Result {
    return (result as Result).name !== undefined;
  }

  class ParseStack {
    parent?: ParseStack;
    resolved: Map<string, ObjectSet>; // Pre-resolved sets
    original: any; // Original object
    constructor(original, parent?: ParseStack) {
      this.parent = parent;
      this.resolved = new Map();
      this.original = original;
    }
  }
  type VarPath = { set: ObjectSet, variable: string, attribute: Aspect.InstalledAttribute };
  class ParseContext {
    constructor(public head: ParseStack, public end: ParseStack | undefined, private _aspect: (name: string) => Aspect.Installed | undefined) {}

    derive(head: ParseStack, end: ParseStack | undefined) {
      return new ParseContext(head, end, this._aspect);
    }
    aspect(name: string | Function) : Aspect.Installed {
      let n: string = typeof name === "string" ? name : (name as any).aspect ? (name as any).aspect.name : (name as any).definition.name;
      let aspect = this._aspect(n);
      if (!aspect)
        throw new Error(`aspect ${n} not found`);
      return aspect;
    }
    push(original: any) {
      this.head = new ParseStack(original, this.head);
    }
    pop() {
      if (!this.head.parent)
        throw new Error(`cannot pop stack`);
      this.head = this.head.parent;
    }
    
    resolve(reference: string, deep = Number.MAX_SAFE_INTEGER) : ObjectSet {
      let key = `${reference}=`;
      let v: ObjectSet | undefined, s: ParseStack | undefined = this.head;
      for (;!v && s; s = s.parent) {
        let o = s.original[key];
        if (o) {
          v = s.resolved.get(key);
          if (!v) {
            let c = s == this.head ? this : this.derive(s, undefined);
            v = c.parseSet(o, reference);
            s.resolved.set(key, v);
          }
        }
        deep--;
      }
      if (!v)
        throw new Error(`no object set with the name ${key} found`);
      return v;
    }

    createSet(name: string): ObjectSet {
      let set = new ObjectSet(name);
      return set;
    }

    resolveSet(reference: string) : ObjectSet {
      let parts = reference.split(':');
      let set = this.resolve(parts[0]);
      if (parts.length > 1) {
        let k = parts[0];
        let vars: [string, ObjectSet, Constraint | undefined][] = [];
        let fset = this.resolveAttribute(set, parts, k, 1, parts.length, (k, s, c) => {
          vars.push([k, s, c]);
        }).set;
        fset.setVariable(k, set);
        for (let [k, s, c] of vars) {
          fset.setVariable(k, s);
          fset.and(c);
        }
        set = fset;
      }
      return set;
    }

    resolveElement(reference: string, set: ObjectSet) : VarPath{
      let parts = reference.split('.');
      let k = parts[0];
      let elementSet = set.variable(k);
      if (!elementSet) {
        let sub = this.resolve(k, 1);
        elementSet = sub.clone(k);
        set.setVariable(k, elementSet);
      }
      return this.resolveAttribute(elementSet, parts, k, 1);
    }

    resolveAttribute(set: ObjectSet, parts: string[], k: string = set._name, start: number = 0, last = parts.length - 1, decl?: (k: string, s: ObjectSet, c?: Constraint) => void) : VarPath {
      if (!decl) {
        decl = (k, s, c) => {
          set.setVariable(k, s);
          set.and(c);
        }
      }
      let i = start;
      for (; i < last; i++) { // >.attr1<.attr2
        k += `.${parts[i]}`;
        let s = set.variable(k);
        if (!s) {
          s = this.createSet(k);
          let attr = set.aspectAttribute(parts[i]);
          let type = attr.type;
          if (type.type === "class") {
            s.setAspect(ConstraintType.InstanceOf, this.aspect(type.name));
            decl(k, s, c_var(ConstraintType.Equal, set._name, attr, k, s.aspectAttribute("_id")));
          }
          else if ((type.type === "set" || type.type === "array") && type.itemType.type === "class") {
            s.setAspect(ConstraintType.InstanceOf, this.aspect(type.itemType.name));
            decl(k, s, c_var(ConstraintType.Equal, set._name, attr, k, s.aspectAttribute("_id")));
          }
          else 
            throw new Error(`invalid constraint attribute type ${attr.type.type} on ${parts[i]}`);
        }
        set = s;
      }
      return { set: set, variable: k, attribute: set.aspectAttribute(i < parts.length ? parts[i] : "_id") };
    }

    parseSet(v: Instance<ObjectSetDefinition>, name: string, set?: ObjectSet) : ObjectSet {
      this.push(v);
      if (typeof v === "string") {
        if (!v.startsWith("="))
          throw new Error(`an object set definition was expected`);
        return this.resolveSet(v.substring(1));
      }

      let nout = v["$out"];
      if (nout) {
        if (!nout.startsWith("=") && nout.indexOf(".") !== -1)
          throw new Error(`an element was expected`);
        nout = nout.substring(1);
        set = this.resolve(nout);
        set.variables = new Map<string, ObjectSet>();
        set.variables.set(nout, set);
      }
      else {
        set = set || this.createSet(name);
      }

      for(let key in v) {
        if (key.startsWith('$') && key !== "$out") {
          // key is an operator
          let o = operatorsOnSet[key];
          if (o === undefined)
            throw new Error(`operator on set ${key} not found`);
          o(this, set, v[key]);
        }
      }

      for(let key in v) {
        if (!key.startsWith('$')) {
          if (key.startsWith('=')) {
            // only elements are allowed here ( ie. =element_name(.attribute)* )
            let a = this.resolveElement(key.substring(1), set);
            this.parseConditions(set, a, v[key]);
          }
          else if (!key.endsWith('=')) {
            // key is an attribute path
            let a = this.resolveAttribute(set, key.split('.'));
            this.parseConditions(set, a, v[key]);
          }
        }
      }

      this.pop();
      return set;
    }

    parseConditions(set: ObjectSet, attr: VarPath, conditions: Value | ConstraintDefinition) {
      if (typeof conditions === "object") {
        if (conditions instanceof VersionedObject) {
          set.variable(attr.variable)!.and(c_value(ConstraintType.Equal, attr.attribute, conditions));
        }
        else {
          this.push(conditions);
          for(var key in conditions) {
            if (!key.startsWith(`$`))
              throw new Error(`an operator was expected`);
            let v = conditions[key];
            if (typeof v === "string" && v.startsWith('=')) {
              let right = this.resolveElement(v.substring(1), set);
              let o = operatorsBetweenSet[key];
              if (o === undefined) 
                throw new Error(`operator between two set '${key}' not found`);
              set.and(c_var(o, attr.variable, attr.attribute, right.variable, right.attribute))
            }
            else {
              let o = operatorsOnValue[key];
              if (!o) 
                throw new Error(`operator on value '${key}' not found`);
              o.validate(attr.attribute, v);
              set.variable(attr.variable)!.and(c_value(o.type, attr.attribute, v));
            }
          }
          this.pop();
        }
      }
      else {
        set.variable(attr.variable)!.and(c_value(ConstraintType.Equal, attr.attribute, conditions));
      }
    }
  }

  function parseResult(context: ParseContext, result: Result) {
    context.push(result);
    let set = context.parseSet(result.where, result.name)
    set = set.clone(set._name);
    set.name = result.name;
    set.scope = result.scope;
    set.sort = result.sort;
    context.pop();
    return set;
  }
  export function parseRequest(request: Request, findAspect: (name: string) => Aspect.Installed | undefined) : ObjectSet[] {
    let context = new ParseContext(new ParseStack(request), undefined, findAspect);
    let sets: ObjectSet[] = [];
    if (isResult(request))
      sets.push(parseResult(context, request));
    else {
      request.results.forEach((result) => {
        sets.push(parseResult(context, result));
      });
    }
    return sets;
  }

  export function applyWhere(where: ObjectSetDefinition, objects: VersionedObject[], findAspect: (name: string) => Aspect.Installed | undefined) : VersionedObject[] {
    let context = new ParseContext(new ParseStack(where), undefined, findAspect);
    let set = context.parseSet(where, "where");
    let sctx = new FilterContext(objects, versionedObjectMapper);
    return [...sctx.solveFull(set)];
  }

  export function applyRequest(request: Request, objects: VersionedObject[], findAspect: (name: string) => Aspect.Installed | undefined) : { [s: string]: VersionedObject[] } {
    let map = applySets(parseRequest(request, findAspect), objects, true);
    let ret = {};
    map.forEach((objs, set) => {
      ret[set.name] = objs;
    });
    return ret;
  }

  export function applySets(sets: ObjectSet[], objects: VersionedObject[], namedOnly: true): Map<ObjectSet & { name: string }, VersionedObject[]>
  export function applySets(sets: ObjectSet[], objects: VersionedObject[], namedOnly?: boolean): Map<ObjectSet, VersionedObject[]>
  export function applySets<T>(sets: ObjectSet[], objects: T[], namedOnly: true, mapper: Mapper<T>): Map<ObjectSet & { name: string }, T[]>
  export function applySets<T>(sets: ObjectSet[], objects: T[], namedOnly: boolean, mapper: Mapper<T>): Map<ObjectSet, T[]>
  export function applySets(sets: ObjectSet[], objects: any[], namedOnly = true, mapper: Mapper<any> = versionedObjectMapper): Map<ObjectSet, VersionedObject[]> {
    let ret = new Map<ObjectSet, VersionedObject[]>();
    let sctx = new FilterContext(objects, mapper);
    for (let set of sets) {
      if (set.name || !namedOnly) {
        ret.set(set, [...sctx.solveFull(set)]);
      }
    }
    return ret;
  }
}
