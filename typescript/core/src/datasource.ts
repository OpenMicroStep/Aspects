import {Identifier, VersionedObject, FarImplementation, areEquals, Invocation, InvocationState, Invokable } from './core';
import {DataSource} from '../../../generated/aspects.interfaces';

DataSource.category('local', <DataSource.ImplCategories.local<DataSource>>{
  /// category core 
  filter(this, objects: VersionedObject[], arg1) {
    return DataSourceInternal.applyWhere(arg1, objects);
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
    let sets = DataSourceInternal.parseRequest(<any>request);
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

    passType(c: ConstraintOnType, object: VersionedObject) {
      switch(c.type) {
        case ConstraintType.In: return this.solveFull(c.value as ObjectSet).has(object);
        case ConstraintType.Union: return (c.value as ObjectSet[]).some(set => this.solveFull(set).has(object));
        case ConstraintType.InstanceOf: return object instanceof (c.value as Function);
        case ConstraintType.MemberOf: return object.constructor === (c.value as Function);
        case ConstraintType.ElementOf: return this.solveFull(c.value as ObjectSet).has(object);
      }
      throw new Error(`Unsupported on type constraint ${ConstraintType[c.type as any]}`);
    }

    solvePartial(set: ObjectSet) : Set<VersionedObject> {
      let ret = new Set<VersionedObject>();
      for (let object of this.objects) {
        let ok = 
          set.constraintsOnType.every(c => this.passType(c, object)) && 
          set.constraintsOnValue.every(c => {
            if (c.attribute)
              return object.manager().hasAttributeValue(c.attribute as keyof VersionedObject) ? c.pass(object[c.attribute], c.value) : false;
            return c.pass(object, c.value);
          });
        if (ok)
          ret.add(object);
      }
      return ret;
    }

    solveFull(set: ObjectSet, solution?: Solution) : Set<VersionedObject> {
      if (!solution)
        solution = this.solution(set);
      if (!solution.full) {
        if (set.constraintsBetweenSet.length > 0) {
          let variables = set.variables();
          for (let object of solution.partial) {
            for (let [oppositeSet, variable] of variables.entries()) {
              let oppositeObjects = this.solution(oppositeSet).partial;
              let ok = oppositeObjects.size > 0;
              for (let oppositeObject of oppositeObjects) {
                ok = true;
                for (let c of variable) {
                  if (!(ok = c.pass(set === c.set ? object : oppositeObject, set === c.set ? oppositeObject : object)))
                    break;
                }
                if (ok)
                  break;
              }
              if (!ok)
                solution.partial.delete(object);
            }
          }
        }
        solution.full = solution.partial;
      }
      return solution.full;
    }
  
  };
  export class ObjectSet {
    _name: string;
    name?: string = undefined;
    scope?: string[] = undefined;
    sort?: string[] = undefined;
    constraintsOnType: ConstraintOnType[] = []; // InstanceOf, MemberOf, ElementOf, Union, In
    constraintsOnValue: ConstraintOnValue[] = [];
    constraintsBetweenSet: ConstraintBetweenSet[] = [];

    variables() {
      let variables = new Map<ObjectSet, ConstraintBetweenSet[]>();
      for (let c of this.constraintsBetweenSet) {
        let otherSet = c.oppositeSet(this);
        let constraints = variables.get(otherSet);
        if (!constraints)
          variables.set(otherSet, constraints = []);
        constraints.push(c);
      }
      return variables;
    }
  }

  export enum ConstraintType {
    Equal = 0,
    NotEqual,
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
    Text,
    NotIn,
    Exists,
    In = 20,
    Union,
    InstanceOf,
    MemberOf,
    ElementOf,
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
  export type ConstraintOnTypeTypes = 
    ConstraintType.In | 
    ConstraintType.ElementOf |
    ConstraintType.InstanceOf |
    ConstraintType.MemberOf |
    ConstraintType.Union;

  export abstract class Constraint {
    type: ConstraintType;
    attribute?: string;
    constructor(type: ConstraintType, set: ObjectSet, attribute: string | undefined) {
      this.type = type;
      this.attribute = attribute;
    }
  }

  function map(value) {
    if (value instanceof VersionedObject)
      value = value.id();
    return value;
  }
  function find(arr, value) {
    value = map(value);
    return Array.isArray(arr) && arr.findIndex(v => map(v) === value) !== -1;
  }
  export class ConstraintOnValue extends Constraint {
    type: ConstraintOnValueTypes;
    value: any;
    constructor(type: ConstraintOnValueTypes, set: ObjectSet, attribute: string | undefined, value: any) {
      super(type, set, attribute);
      this.value = value;
      set.constraintsOnValue.push(this);
    }
    pass(left, right) {
      switch(this.type) {
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
      throw new Error(`Unsupported on value constraint ${ConstraintType[this.type as any]}`);
    }
  }
  export class ConstraintOnType extends Constraint {
    type: ConstraintOnTypeTypes;
    value: ObjectSet | ObjectSet[] | string | Function;
    constructor(type: ConstraintType.In | ConstraintType.ElementOf, set: ObjectSet, value: ObjectSet);
    constructor(type: ConstraintType.Union, set: ObjectSet, value: ObjectSet[]);
    constructor(type: ConstraintType.InstanceOf | ConstraintType.MemberOf, set: ObjectSet, value: Function);
    constructor(type: ConstraintOnTypeTypes, set: ObjectSet, value: ObjectSet | ObjectSet[] | Function) {
      super(type, set, undefined);
      this.value = value;
      set.constraintsOnType.push(this);
    }
  }

  export class ConstraintBetweenSet extends Constraint {
    type: ConstraintBetweenSetTypes;
    set: ObjectSet;
    otherSet: ObjectSet;
    otherAttribute?: string;
    constructor(type: ConstraintBetweenSetTypes, set: ObjectSet, attribute: string | undefined, otherSet: ObjectSet, otherAttribute: string | undefined) {
      super(type, set, attribute);
      this.set = set;
      this.otherSet = otherSet;
      this.otherAttribute = otherAttribute;
      set.constraintsBetweenSet.push(this);
      otherSet.constraintsBetweenSet.push(this);
    }

    pass(object: VersionedObject, otherObject: VersionedObject) {
      if (this.attribute && !object.manager().hasAttributeValue(this.attribute as keyof VersionedObject)) return false;
      if (this.otherAttribute && !otherObject.manager().hasAttributeValue(this.otherAttribute as keyof VersionedObject)) return false;
      let left = this.attribute ? object[this.attribute] : object;
      let right = this.otherAttribute ? otherObject[this.otherAttribute] : otherObject;
      switch(this.type) {
        case ConstraintType.Equal: return map(left) === map(right);
        case ConstraintType.NotEqual: return map(left) !== map(right);
        case ConstraintType.GreaterThan: return left > right;
        case ConstraintType.GreaterThanOrEqual: return left >= right;
        case ConstraintType.LessThan: return left < right;
        case ConstraintType.LessThanOrEqual: return left <= right;
        case ConstraintType.In: return map(left) === map(right);
        case ConstraintType.NotIn: return map(left) !== map(right);
      }
      throw new Error(`Unsupported on value constraint ${ConstraintType[this.type as any]}`);
    }

    myView(set: ObjectSet) {
      let my = this.set === set;
      return {
        attribute: my ? this.attribute : this.otherAttribute,
        otherSet: my ? this.otherSet : this.set,
        otherAttribute: my ? this.otherAttribute : this.attribute,
      };
    }
    myAttribute(set: ObjectSet) {
      return this.set === set? this.attribute : this.otherAttribute;
    }
    oppositeSet(set: ObjectSet) {
      return this.set === set ? this.otherSet : this.set;
    }
    oppositeAttribute(set: ObjectSet) {
      return this.set === set? this.otherAttribute : this.attribute;
    }
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
    $or: ObjectSetDefinition[],
    $and: ObjectSetDefinition[],
    $union : Instance<ObjectSetDefinition>[],
    $intersection : Instance<ObjectSetDefinition>[],
    $diff: [Instance<ObjectSetDefinition>, Instance<ObjectSetDefinition>],
    $instanceOf: string | Function,
    $memberOf: string | Function,
    $text: string,
    $out: string,
    $exists: boolean,
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

  type OperatorBetweenSet = (context: ParseContext, constraint: ConstraintBetweenSet) => void;
  type OperatorOnSet<T> = (context: ParseContext, set: ObjectSet, elements: Map<string, ObjectSet>, out: string | undefined, value: T) => void;
  const operatorsOnSet: { [K in keyof Element]: OperatorOnSet<Element[K]>; } = {
    $elementOf: (context, set, elements, out, value) => {
      new ConstraintOnType(ConstraintType.ElementOf, set, context.parseSet(value));
    },
    $instanceOf: (context, set, elements, out, value) => {
      if (typeof value !== "function")
        throw new Error(`instanceOf value must be a string or a class`);
      new ConstraintOnType(ConstraintType.InstanceOf, set, value);
    },
    $memberOf: (context, set, elements, out, value) => {
      if (typeof value !== "function")
        throw new Error(`memberOf value must be a string or a class`);
      new ConstraintOnType(ConstraintType.MemberOf, set, value);
    },
    $union: (context, set, elements, out, value) => {
      if (!Array.isArray(value))
        throw new Error(`union value must be an array of object set`);
      new ConstraintOnType(ConstraintType.Union, set, value.map(v => context.parseSet(v)));
    },
    $intersection: (context, set, elements, out, value) => {
      if (!Array.isArray(value))
        throw new Error(`intersection value must be an array of object set`);
      value.forEach(v => new ConstraintOnType(ConstraintType.In, set, context.parseSet(v)));
    },
    $diff: (context, set, elements, out, value) => {
      if (!Array.isArray(value) || value.length !== 2)
        throw new Error(`diff value must be an array of 2 object set`);
      new ConstraintOnType(ConstraintType.In, set, context.parseSet(value[0]));
      new ConstraintBetweenSet(ConstraintType.NotIn, set, undefined, context.parseSet(value[1]), undefined);
    },
    $in: (context, set, elements, out, value) => {
      if (Array.isArray(value))
        new ConstraintOnValue(ConstraintType.In, set, undefined, value);
      else
        new ConstraintOnType(ConstraintType.In, set, context.parseSet(value));
    },
    $nin: (context, set, elements, out, value) => {
      if (Array.isArray(value))
        new ConstraintOnValue(ConstraintType.NotIn, set, undefined, value);
      else
        new ConstraintBetweenSet(ConstraintType.NotIn, set, undefined, context.parseSet(value), undefined);
    },
    $or: (context, set, elements, out, value) => {
      if (!Array.isArray(value))
        throw new Error(`$or value must be an array of object set`);
      new ConstraintOnType(ConstraintType.Union, set, value.map(v => context.parseSet(v, set, elements, out)));
    },
    $and: (context, set, elements, out, value) => {
      if (!Array.isArray(value))
        throw new Error(`$and value must be an array of object set`);
      value.forEach(v => {
        let s = context.parseSet(v, set, elements, out);
        if (s !== set)
          new ConstraintOnType(ConstraintType.In, set, s);
      });
    },
    $exists: (context, set, elements, out, value) => {
      if (typeof value !== "boolean")
        throw new Error(`$exists value must be a boolean`);
      new ConstraintOnValue(ConstraintType.Exists, set, undefined, value);
    },
    $out: (context, set, elements, out, value) => {
      throw new Error(`$out is managed in ParseContext`);
    },
    $text: (context, set, elements, out, value) => {
      if (typeof value !== "string")
        throw new Error(`$text value must be a string`);
      new ConstraintOnValue(ConstraintType.Text, set, undefined, value);
    },
  }
  
  const operatorsBetweenSet: { [s: string]: ConstraintBetweenSetTypes; } = {
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
  class ParseContext { 
    constructor(public set: ObjectSet[], public head: ParseStack) {}
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
      for (;deep > 0 && !v && s; s = s.parent) {
        let o = s.original[key];
        if (o) {
          v = s.resolved.get(key);
          if (!v) {
            let c = s == this.head ? this : new ParseContext(this.set, s);
            v = c.parseSet(o);
            s.resolved.set(key, v);
          }
        }
        deep--;
      }
      if (!v)
        throw new Error(`no object set with the name ${key} found`);
      return v;
    }

    createSet(): ObjectSet {
      let set = new ObjectSet();
      this.set.push(set);
      return set;
    }

    resolveSet(reference: string) : ObjectSet {
      let parts = reference.split(':');
      let set = this.resolve(parts[0]);
      if (parts.length > 1) {
        for (let i = 1; i < parts.length; i++) {
          let subset = this.createSet();
          new DataSourceInternal.ConstraintBetweenSet(ConstraintType.Equal, subset, undefined, set, parts[i]);
          set = subset;
        }
      }
      return set;
    }

    resolveElement(reference: string, elements: Map<string, ObjectSet>) : [ObjectSet, string | undefined] {
      let parts = reference.split('.');
      let k = parts[0];
      let set = this.resolve(k);
      return this.resolveAttribute(set, elements, parts, k, 1);
    }

    resolveAttribute(set: ObjectSet, elements: Map<string, ObjectSet>, parts: string[], k: string, start: number) : [ObjectSet, string | undefined] {
      let i = start, last = parts.length - 1;
      for (; i < last; i++) {
        k += `.${parts[i]}`;
        let s = elements.get(k);
        if (!s) {
          s = this.createSet();
          new ConstraintBetweenSet(ConstraintType.Equal, s, "_id", set, parts[i]);
          elements.set(k, s);
        }
        set = s;
      }
      return [set, start <= last ? parts[last] : undefined];
    }

    parseSet(v: Instance<ObjectSetDefinition>, set?: ObjectSet, elements?: Map<string, ObjectSet>, out?: string) : ObjectSet {
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
        out = nout;
        nout = nout.substring(1);
        elements = new Map<string, ObjectSet>();
        set = this.resolve(nout, 1);
        elements.set(nout, set);
      }
      else {
        set = set || this.createSet();
        elements = elements || new Map<string, ObjectSet>();
      }

      for(var key in v) {
        if (key !== "$out")
          this.parseCondition(set, elements, out, key, v[key]);
      }
      this.pop();
      return set;
    }

    parseCondition(set: ObjectSet, elements: Map<string, ObjectSet>, out: string | undefined, key: string, value: Instance<ObjectSetDefinition>) {
      if (key.startsWith('$')) {
        // key is an operator
        let o = operatorsOnSet[key];
        if (o === undefined)
          throw new Error(`operator on set ${key} not found`);
        o(this, set, elements, out, value);
      }
      else if (key.startsWith('=')) {
        // only elements are allowed here ( ie. =element_name(.attribute)* )
        let [set, attr] = this.resolveElement(key.substring(1), elements);
        this.parseConditions(set, elements, attr, <Value | ConstraintDefinition>value);
      }
      else if (!key.endsWith('=')) {
        // key is an attribute path
        let path = key.split('.');
        let [aset, attr] = this.resolveAttribute(set, elements, path, out || "", 0);
        this.parseConditions(aset, elements, attr, <Value | ConstraintDefinition>value);
      }
    }

    parseConditions(set: ObjectSet, elements: Map<string, ObjectSet>, attribute: string | undefined, conditions: Value | ConstraintDefinition) {
      if (typeof conditions === "object") {
        if (conditions instanceof VersionedObject) {
          new ConstraintOnValue(ConstraintType.Equal, set, attribute, conditions);
        }
        else {
          this.push(conditions);
          for(var key in conditions) {
            if (!key.startsWith(`$`))
              throw new Error(`an operator was expected`);
            let v = conditions[key];
            if (typeof v === "string" && v.startsWith('=')) {
              let [otherSet, otherAttr] = this.resolveElement(v.substring(1), elements);
              let o = operatorsBetweenSet[key];
              if (o === undefined) 
                throw new Error(`operator between two set '${key}' not found`);
              new ConstraintBetweenSet(o, set, attribute, otherSet, otherAttr);
            }
            else {
              let o = operatorsOnValue[key];
              if (o === undefined) 
                throw new Error(`operator on value '${key}' not found`);
              new ConstraintOnValue(o, set, attribute, v);
            }
          }
          this.pop();
        }
      }
      else {
        new ConstraintOnValue(ConstraintType.Equal, set, attribute, conditions);
      }
    }
  }

  function parseResult(context: ParseContext, result: Result) {
    context.push(result);
    let set = context.parseSet(result.where);
    set.name = result.name;
    set.scope = result.scope;
    set.sort = result.sort;
    context.pop();
  }
  export function parseRequest(request: Request) : ObjectSet[] {
    let context = new ParseContext([], new ParseStack(request));
    if (isResult(request))
      parseResult(context, request);
    else {
      request.results.forEach((result) => {
        parseResult(context, result); 
      });
    }
    return context.set;
  }

  export function applyWhere(where: ObjectSetDefinition, objects: VersionedObject[]) : VersionedObject[] {
    let context = new ParseContext([], new ParseStack(where));
    let set = context.parseSet(where);
    let sctx = new FilterContext(objects);
    return [...sctx.solveFull(set)];
  }

  export function applyRequest(request: Request, objects: VersionedObject[]) : { [s: string]: VersionedObject[] } {
    let map = applySets(parseRequest(request), objects, true);
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
