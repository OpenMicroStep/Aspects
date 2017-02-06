import {Identifier, VersionedObject, FarImplementation, areEquals, Invocation, InvocationState, Invokable } from './core';
import {DataSource} from '../../../generated/aspects.interfaces';

DataSource.category('local', <DataSource.ImplCategories.local<DataSource>>{
  /// category core 
  filter(this, objects: VersionedObject[], arg1) {
    return DataSourceInternal.applyWhere(arg1, objects);
  }
});

DataSource.category('client_', <DataSource.ImplCategories.client_<DataSource.Categories.server_>>{
  query(this, request: { [k: string]: any }) {
    // TODO: add some local checks
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

DataSource.category('server_', <DataSource.ImplCategories.server_<DataSource.Categories.safe>>{
  distantQuery(this, request: { [k: string]: any }) {
    // throw "TODO: generate request (request is an id + options)";
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
    return this.farPromise('implSave', objects);
  }
});

export namespace DataSourceInternal {
  export class ObjectSet {
    name?: string = undefined;
    scope?: string[] = undefined;
    sort?: string[] = undefined;
    constraints: Constraint[] = [];
    path?: string[] = undefined;
  }

  export enum ConstraintType {
    Equal = 0,
    NotEqual,
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
    Text,
    In = 10,
    NotIn,
    Union,
    Exists,
    InstanceOf = 20,
    MemberOf,
    CustomStart = 100 // The first 100 ([0-99]) are reserved
  }

  function passConstraint(type: ConstraintType, left, right) {
    switch(type) {
      case ConstraintType.Equal: return left === right;
      case ConstraintType.NotEqual: return left !== right;
      case ConstraintType.GreaterThan: return left > right;
      case ConstraintType.GreaterThanOrEqual: return left >= right;
      case ConstraintType.LessThan: return left < right;
      case ConstraintType.LessThanOrEqual: return left <= right;
      case ConstraintType.Text: {
        if (left instanceof VersionedObject && typeof right === "string") {
          let manager = left.manager();
          return manager.aspect().attributes.some(a => right.indexOf(`${manager.attributeValue(a.name)}`) !== -1);
        }
        return false;
      }
      case ConstraintType.In: return Array.isArray(right) && right.indexOf(left) !== -1;
      case ConstraintType.NotIn: return Array.isArray(right) && right.indexOf(left) === -1;
      case ConstraintType.Exists: {
        return right !== undefined && (!Array.isArray(right) || right.length > 0);
      }
      case ConstraintType.InstanceOf: return left instanceof right;
      case ConstraintType.MemberOf: return left.constructor === right.constructor;
    }
    return false;
  }

  export abstract class Constraint {
    type: ConstraintType;
    attribute?: string;
    constructor(type: ConstraintType, set: ObjectSet, attribute: string | undefined) {
      this.type = type;
      this.attribute = attribute;
      set.constraints.push(this);
    }
  }

  export class ConstraintOnValue extends Constraint {
    value: any;
    constructor(type: ConstraintType, set: ObjectSet, attribute: string | undefined, value: any) {
      super(type, set, attribute);
      this.value = value;
    }
  }

  export class ConstraintBetweenSet extends Constraint {
    set: ObjectSet;
    otherSet: ObjectSet;
    otherAttribute?: string;
    constructor(type: ConstraintType, set: ObjectSet, attribute: string | undefined, otherSet: ObjectSet, otherAttribute: string | undefined) {
      super(type, set, attribute);
      this.set = set;
      this.otherSet = otherSet;
      this.otherAttribute = otherAttribute;
      otherSet.constraints.push(this);
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
    $out: string,
    $exists: boolean,
  };
  export type ObjectSetDefinition = Partial<ObjectSetDefinitionR> & {
    [s: string]: Value | ConstraintDefinition
  };
  export interface Element extends ConstraintDefinition {
    $elementOf: Instance<ObjectSetDefinition>
  };
  export type Result = {
    name: string;
    where: Instance<ObjectSetDefinition>;
    sort?: string[];
    scope?: string[];
  }
  export type Request = Result | { result: (Result& { [s: string]: Instance<ObjectSetDefinition> })[], [s: string]: Instance<ObjectSetDefinition> };

  type OperatorBetweenSet = (context: ParseContext, constraint: ConstraintBetweenSet) => void;
  type OperatorOnSet<T> = (context: ParseContext, set: ObjectSet, elements: Map<string, ObjectSet>, out: string | undefined, value: T) => void;
  const operatorsOnSet: { [K in keyof ObjectSetDefinitionR]: OperatorOnSet<ObjectSetDefinitionR[K]>; } = {
    $instanceOf: (context, set, elements, out, value) => {
      if (typeof value !== "string" && typeof value !== "function")
        throw new Error(`instanceOf value must be a string or a class`);
      new ConstraintOnValue(ConstraintType.InstanceOf, set, undefined, value);
    },
    $memberOf: (context, set, elements, out, value) => {
      if (typeof value !== "string" && typeof value !== "function")
        throw new Error(`memberOf value must be a string or a class`);
      new ConstraintOnValue(ConstraintType.MemberOf, set, undefined, value);
    },
    $union: (context, set, elements, out, value) => {
      if (!Array.isArray(value))
        throw new Error(`union value must be an array of object set`);
      new ConstraintOnValue(ConstraintType.Union, set, undefined, value.map(v => context.parseSet(v)));
    },
    $intersection: (context, set, elements, out, value) => {
      if (!Array.isArray(value))
        throw new Error(`intersection value must be an array of object set`);
      value.forEach(v => new ConstraintOnValue(ConstraintType.In, set, undefined, context.parseSet(v)));
    },
    $diff: (context, set, elements, out, value) => {
      if (!Array.isArray(value) || value.length !== 2)
        throw new Error(`diff value must be an array of 2 object set`);
      new ConstraintOnValue(ConstraintType.In, set, undefined, context.parseSet(value[0]));
      new ConstraintOnValue(ConstraintType.NotIn, set, undefined, context.parseSet(value[1]));
    },
    $in: (context, set, elements, out, value) => {
      if (Array.isArray(value))
        new ConstraintOnValue(ConstraintType.In, set, undefined, value);
      else
        new ConstraintOnValue(ConstraintType.In, set, undefined, context.parseSet(value));
    },
    $nin: (context, set, elements, out, value) => {
      if (Array.isArray(value))
        new ConstraintOnValue(ConstraintType.NotIn, set, undefined, value);
      else
        new ConstraintOnValue(ConstraintType.NotIn, set, undefined, context.parseSet(value));
    },
    $or: (context, set, elements, out, value) => {
      if (!Array.isArray(value))
        throw new Error(`$or value must be an array of object set`);
      new ConstraintOnValue(ConstraintType.Union, set, undefined, value.map(v => context.parseSet(v, set, elements, out)));
    },
    $and: (context, set, elements, out, value) => {
      if (!Array.isArray(value))
        throw new Error(`$and value must be an array of object set`);
      value.forEach(v => {
        let s = context.parseSet(v, set, elements, out);
        if (s !== set)
          new ConstraintOnValue(ConstraintType.In, set, undefined, s);
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
  }
  
  const operatorsBetweenSet: { [s: string]: ConstraintType; } = {
    $eq: ConstraintType.Equal,
    $neq: ConstraintType.NotEqual,
    $gt: ConstraintType.GreaterThan,
    $gte: ConstraintType.GreaterThanOrEqual,
    $lt: ConstraintType.LessThan,
    $lte: ConstraintType.LessThanOrEqual,
  };
  const operatorsOnValue: { [s: string]: ConstraintType; } = {
    $eq: ConstraintType.Equal,
    $neq: ConstraintType.NotEqual,
    $gt: ConstraintType.GreaterThan,
    $gte: ConstraintType.GreaterThanOrEqual,
    $lt: ConstraintType.LessThan,
    $lte: ConstraintType.LessThanOrEqual,
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
    resolve(reference: string) : ObjectSet {
      let key = `${reference}=`;
      let v: ObjectSet | undefined, s: ParseStack | undefined = this.head;
      for (;!v && s; s = s.parent) {
        v = s.resolved.get(key);
        if (!v) {
          let o = s.original[key];
          let c = s == this.head ? this : new ParseContext(this.set, s);
          v = c.parseSet(o);
          s.resolved.set(key, v);
        }
      }
      if (!v)
        throw new Error(`no object set with the name ${key} found`);
      return v;
    }

    resolveSet(reference: string) : ObjectSet {
      let parts = reference.split(':');
      let set = this.resolve(parts[0]);
      if (parts.length > 1) {
        let subset = new ObjectSet();
        // TODO
      }
      return set;
    }

    resolveElement(reference: string, elements: Map<string, ObjectSet>) : [ObjectSet, string] {
      let parts = reference.split('.');
      let k = parts[0];
      let set = this.resolve(k);
      return this.resolveAttribute(set, elements, parts);
    }

    resolveAttribute(set: ObjectSet, elements: Map<string, ObjectSet>, parts: string[]) : [ObjectSet, string] {
      let k = parts[0];
      if (parts.length === 1)
        throw new Error(`an attribute was expected while defining constraint with ${parts.join('.')}`);
      for (let i = 1, len = parts.length - 1; i < len; i++) {
        k += `.${parts[i]}`;
        let s = elements.get(k);
        if (!s) {
          s = new ObjectSet();
          new ConstraintBetweenSet(ConstraintType.Equal, s, "_id", set, parts[i]);
          elements.set(k, s);
        }
        set = s;
      }
      return [set, parts[parts.length - 1]];
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
        if (!nout.startsWith("="))
          throw new Error(`an object set definition was expected`);
        set = new ObjectSet();
        out = nout;
        elements = new Map<string, ObjectSet>();
        elements.set(out.substring(1), set);
      }
      else {
        set = set || new ObjectSet();
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
        if (!o)
          throw new Error(`operator ${key} not found`);
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
        if (out)
          path[0] = `${out}.${path[0]}`;
        let [aset, attr] = this.resolveAttribute(set, elements, path);
        this.parseConditions(aset, elements, attr, <Value | ConstraintDefinition>value);
      }
    }

    parseConditions(set: ObjectSet, elements: Map<string, ObjectSet>, attribute: string, conditions: Value | ConstraintDefinition) {
      if (typeof conditions === "object") {
        this.push(conditions);
        for(var key in conditions) {
          if (!key.startsWith(`$`))
            throw new Error(`an operator was expected`);
          let v = conditions[key];
          if (typeof v === "string" && v.startsWith('=')) {
            let [otherSet, otherAttr] = this.resolveElement(v.substring(1), elements);
            let o = operatorsBetweenSet[key];
            if (!o) 
              throw new Error(`operator between two set '${key}' not found`);
            new ConstraintBetweenSet(o, set, attribute, otherSet, otherAttr);
          }
          else {
            let o = operatorsOnValue[key];
            if (!o) 
              throw new Error(`operator '${key}' not found`);
            new ConstraintOnValue(o, set, attribute, v);
          }
        }
        this.pop();
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
      request.result.forEach((result) => {
        parseResult(context, result); 
      });
    }
    return context.set;
  }

  export function applyWhere(where: ObjectSetDefinition, objects: VersionedObject[]) : VersionedObject[] {
    let context = new ParseContext([], new ParseStack(where));
    let set = context.parseSet(where);
    return objects.filter(o => set.constraints.every(c => {
      if (!(c instanceof ConstraintOnValue))
        throw new Error(`where is too complex and can't be proceeded, use query`);
      let value = c.attribute ? o[c.attribute] : o;
      return passConstraint(c.type, value, c.value);
    }));
  }

  export function applyRequest(request: Request, objects: VersionedObject[]) {
    return applySet(parseRequest(request), objects);
  }

  export function applySet(sets: ObjectSet[], objects: VersionedObject[]): { [s: string]: VersionedObject[] } {
    return { TODO: [] };
  }
}
