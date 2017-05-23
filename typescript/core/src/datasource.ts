import {Identifier, VersionedObject, FarImplementation, areEquals, Invocation, InvocationState, Invokable, Aspect } from './core';
import {DataSource} from '../../../generated/aspects.interfaces';

DataSource.category('local', <DataSource.ImplCategories.local<DataSource>>{
  /// category core 
  filter(this, objects: VersionedObject[], arg1) {
    return DataSourceInternal.applyWhere(arg1, objects, (name) => {
      let cstor = this.controlCenter().aspect(name);
      return cstor && cstor.aspect;
    });
  }
});

const queries = new Map<string, (query) => any>();
export function registerQuery(id: string, creator: (query) => any) {
  queries.set(id, creator);
}

DataSource.category('client', <DataSource.ImplCategories.client<DataSource.Categories.server>>{
  query(this, request: { [k: string]: any }) {
    return this.farPromise('distantQuery', request);
  },
  load(this, w: {objects: VersionedObject[], scope: string[]}) {
    // TODO: add some local checks
    return this.farPromise('distantLoad', w);
  },
  save(this, objects: VersionedObject[]) {
    // TODO: add some local checks
    return this.farPromise('distantSave', objects);
  }
});

DataSource.category('server', <DataSource.ImplCategories.server<DataSource.Categories.safe>>{
  distantQuery(this, request: { [k: string]: any }) {
    // throw "TODO: generate request (request is an id + options)";
    request = queries.get(request['id'])!(request);
    return this.farPromise('safeQuery', request);
  },
  distantLoad(this, w: {objects: VersionedObject[], scope: string[]}) {
    // TODO: add some local checks
    return this.farPromise('safeLoad', w);
  },
  distantSave(this, objects: VersionedObject[]) {
    // TODO: add some local checks
    return this.farPromise('safeSave', objects);
  }
});

async function validateConsistency(this: DataSource, reporter: any/*Reporter*/, objects: VersionedObject[]) {
  // Let N be the number of objects (we may want if N = 1000, this method to took less than 100ms)
  // Let M be the number of classes (M range should be mostly in [1 - 10])
  // Let K be the number of attributes
  // Let V be the number of validators (V range should be mostly in [1 - 5])
  let ok = true;
  let classes = new Set();
  let attributes = new Set();
  let validators = new Map<any/*Validator*/, any/*VersionnedObject*/[]>();
  objects.forEach(o => classes.add(o.manager().aspect())); // O(N * log M)
  classes.forEach(c => (c as any).attributesToLoad('consistency').forEach(a => attributes.add(a))); // O(M * log K)
  await this.farPromise('rawLoad', { objects: objects, scope: Array.from(attributes) }); // O(K + N * K)
  objects.forEach(o => (o as any).validateConsistency(reporter) || (ok = false)); // O(N)
  objects.forEach(o => {
    let v = (o as any).validatorsForGraphConsistency();
    if (v)
      v.forEach(v => {
        let l = validators.get(v);
        if (!l) validators.set(v, l = []);
        l.push(o);
      })
  }); // O(N * V * log V)
  validators.forEach((l, v) => v(reporter, l) || (ok = false)); // O(V)
  return ok; 
  // O(N * (log M + K + V * log V + 1) + M * log K + K + V) this is quite heavy
  // perfect O= O(N * (K + V)) this is quite heavy
}

DataSource.category('safe', <DataSource.ImplCategories.safe<DataSource.Categories.raw>>{
  safeQuery(this, request: { [k: string]: any }) {
    return this.farPromise('rawQuery', request);
  },
  safeLoad(this, w: {objects: VersionedObject[], scope: string[]}) {
    return this.farPromise('rawLoad', w);
  },
  async safeSave(this, objects: VersionedObject[]) {
    let ok = validateConsistency.call(this, null /* reporter*/, objects);
    if (ok)
      return this.farPromise('rawSave', objects);
    return Promise.reject(""/* reporter.diagnostics */);
  }
});

DataSource.category('raw', <DataSource.ImplCategories.raw<DataSource.Categories.implementation>>{
  rawQuery(this, request: { [k: string]: any }) {
    let sets = DataSourceInternal.parseRequest(<any>request, (name) => {
      let cstor = this.controlCenter().aspect(name);
      return cstor && cstor.aspect;
    });
    return this.farPromise('implQuery', sets);
  },
  rawLoad(this, w: {objects: VersionedObject[], scope: string[]}) {
    return this.farPromise('implLoad', w);
  },
  rawSave(this, objects: VersionedObject[]) {
    let changed = objects.filter(o => o.manager().hasChanges());
    return this.farPromise('implSave', changed).then<VersionedObject[]>((envelop) => {
      if (envelop.state() === InvocationState.Terminated)
        return objects;
      else
        return Promise.reject(envelop.error());
    });
  }
});

export namespace DataSourceInternal {
  type VarDep = Map<ObjectSet, Set<ObjectSet>>;
  type Solution = {
    partial: Set<VersionedObject>,
    full: Set<VersionedObject> | undefined,
  };
  class FilterContext {
    _resolution = new Map<ObjectSet, Solution>();
    constructor(public objects: VersionedObject[] = []) {}

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

    private pass(set: ObjectSet, constraint: Constraint, prefix: string, object: VersionedObject) : boolean {
      let ok = true;
      if (constraint instanceof ConstraintTree) {
        switch(constraint.type) {
          case ConstraintType.And: ok = constraint.value.every(c => this.pass(set, c, prefix + constraint.prefix, object)); break;
          case ConstraintType.Or : ok = constraint.value.some (c => this.pass(set, c, prefix + constraint.prefix, object)); break;
        }
      }
      else if (constraint instanceof ConstraintValue) {
        ok = object.manager().hasAttributeValue(constraint.attribute as keyof VersionedObject) &&
             pass_value(constraint.type, object.manager().attributeValue(constraint.attribute as keyof VersionedObject), constraint.value);
      }
      return ok;
    }

    private solvePartial(set: ObjectSet) : Set<VersionedObject> {
      let ret = new Set<VersionedObject>();
      for (let object of this.objects) {
        let ok = false;
        switch (set.type) {
          case ConstraintType.InstanceOf:
          case ConstraintType.MemberOf: 
            ok = object.manager().aspect().name === (set.aspect as Aspect.Installed).name; // TODO: real instanceof/memberof
            break;
          case ConstraintType.UnionOf:
            ok = (set.aspect as ObjectSet[]).some(s => this.solveFull(set).has(object));
            break;
        }
        ok = ok && set.constraints.every(c => this.pass(set, c, "", object));
        if (ok)
          ret.add(object);
      }

      return ret;
    }

    private passVars(set: ObjectSet, set1: ObjectSet, o1: VersionedObject, set2: ObjectSet, o2: VersionedObject, constraint: Constraint, prefix: string) : boolean {
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
          let lm = (lset === set1 ? o1 : o2).manager();
          let rm = (rset === set1 ? o1 : o2).manager();
          ok = lm.hasAttributeValue(constraint.leftAttribute as any) && rm.hasAttributeValue(constraint.rightAttribute as any)
            && pass_value(constraint.type, lm.attributeValue(constraint.leftAttribute as any), rm.attributeValue(constraint.rightAttribute as any));
        }
      }
      return ok;
    }

    solveFull(set: ObjectSet, solution?: Solution) : Set<VersionedObject> {
      if (!solution)
        solution = this.solution(set);
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
    ConstraintType.LessThanOrEqual;
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
      public attribute: string,
      public value: any) {}
  }
  
  export class ConstraintVariable {
    constructor(
      public type: ConstraintBetweenColumnsTypes,
      public leftVariable: string,
      public leftAttribute: string,
      public rightVariable: string,
      public rightAttribute: string) {}
  }
  
  export class ConstraintSub {
    constructor(
      public type: ConstraintType.SubIn | ConstraintType.SubNotIn,
      public attribute: string,
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
  function c_value(type: ConstraintOnValueTypes, attribute: string, value: any): ConstraintValue 
  { return new ConstraintValue(type, attribute, value); }
  function c_var(type: ConstraintBetweenColumnsTypes, leftVariable: string, leftAttribute: string, rightVariable: string, rightAttribute: string): ConstraintVariable
  { return new ConstraintVariable(type, leftVariable, leftAttribute, rightVariable, rightAttribute); }
  function c_subin (sub: string, attribute?: string): ConstraintSub { return new ConstraintSub(ConstraintType.SubIn   , attribute || "_id", sub); }
  function c_subnin(sub: string, attribute?: string): ConstraintSub { return new ConstraintSub(ConstraintType.SubNotIn, attribute || "_id", sub); }


  function map(value) {
    if (value instanceof VersionedObject)
      value = value.id();
    return value;
  }
  function find(arr, value) {
    value = map(value);
    return Array.isArray(arr) && arr.findIndex(v => map(v) === value) !== -1;
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
      set.and(c_subin(set.sub(add)));
      set.and(c_subnin(set.sub(del)));
    },
    $in: (context, set, value) => {
      if (Array.isArray(value))
        set.and(c_value(ConstraintType.In, "_id", value));
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
        set.and(c_value(ConstraintType.NotIn, "_id", value));
      else {
        let sub = context.parseSet(value, `${set._name}.$nin`);
        set.and(c_subnin(set.sub(sub)));
      }
    },
    $out: (context, set, value) => {
      throw new Error(`$out is managed in ParseContext`);
    },
    $text: (context, set, value) => {
      if (typeof value !== "string")
        throw new Error(`$text value must be a string`);
      set.and(c_value(ConstraintType.Text, "_id", value));
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
  const operatorsOnValue: { [s: string]: ConstraintOnValueTypes; } = {
    $eq: ConstraintType.Equal,
    $ne: ConstraintType.NotEqual,
    $gt: ConstraintType.GreaterThan,
    $gte: ConstraintType.GreaterThanOrEqual,
    $lt: ConstraintType.LessThan,
    $lte: ConstraintType.LessThanOrEqual,
    $text: ConstraintType.Text,
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
  type VarPath = { set: ObjectSet, variable: string, attribute: string };
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
          let attr = (set.aspect as Aspect.Installed).attributes.get(parts[i])!; // TODO: add checks
          switch(attr.type.type) {
            case "class": s.setAspect(ConstraintType.InstanceOf, this.aspect(attr.type.name)); break;
            default: throw new Error(`invalid constraint attribute type ${attr.type.type} on ${parts[i]}`);
          }
          let c = c_var(ConstraintType.Equal, set._name, parts[i], k, "_id");
          decl(k, s, c);
        }
        set = s;
      }
      return { set: set, variable: k, attribute: i < parts.length ? parts[i] : "_id" };
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
              if (o === undefined) 
                throw new Error(`operator on value '${key}' not found`);
              set.variable(attr.variable)!.and(c_value(o, attr.attribute, v));
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
    let sctx = new FilterContext(objects);
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
  export function applySets(sets: ObjectSet[], objects: VersionedObject[], namedOnly = true): Map<ObjectSet, VersionedObject[]> {
    let ret = new Map<ObjectSet, VersionedObject[]>();
    let sctx = new FilterContext(objects);
    for (let set of sets) {
      if (set.name || !namedOnly) {
        ret.set(set, [...sctx.solveFull(set)]);
      }
    }
    return ret;
  }
}
