import {
  ControlCenter, Identifier, VersionedObject, VersionedObjectManager,
  FarImplementation, areEquals, Invokable,
  Aspect, DataSource, Validation,
  ImmutableSet,
} from './core';
import * as DataSourceScope from './datasource.scope';
import {Reporter, Diagnostic, AttributeTypes as V} from '@openmicrostep/msbuildsystem.shared';

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
    sort(a, b, type: Aspect.Type): number;
  };
  export const versionedObjectMapper: Mapper<VersionedObject> = {
    aspect(vo: VersionedObject) { return vo.manager().aspect(); },
    has(vo: VersionedObject, attribute: string) { return vo.manager().hasAttributeValue(attribute); },
    get(vo: VersionedObject, attribute:  keyof VersionedObject) { return vo.manager().attributeValue(attribute); },
    todb(vo: VersionedObject, attribute: string, value) { return value; },
    sort(a, b, type: Aspect.Type) {
      if (Aspect.typeIsClass(type)) {
        a = a.id();
        b = b.id();
      }
      return a === b ? 0 : (a < b ? -1 : +1 );
    },
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
        if (set.variable(prefix + constraint.leftVariable) === set) {
          ok = this.mapper.has(object, constraint.leftAttribute) &&
              pass_value(constraint.type, this.mapper.get(object, constraint.leftAttribute), this.mapper.todb(object, constraint.leftAttribute, constraint.value));
        }
      }
      return ok;
    }

    private solvePartial(set: ObjectSet) : Set<T> {
      let ret = new Set<T>();
      for (let object of this.objects) {
        let ok = false;
        for (let c of set.typeConstraints) {
          switch (c.type) {
            case ConstraintType.InstanceOf:
              ok = this.mapper.aspect(object).name === c.value.name; // TODO: real instanceof
              break;
            case ConstraintType.MemberOf:
              ok = this.mapper.aspect(object).name === c.value.name;
              break;
            case ConstraintType.UnionOf:
              ok = [...c.value].some(s => this.solveFull(s).has(object));
              break;
            case ConstraintType.UnionOfAlln: {
              let u_0 = c.value[0];
              let s = this._resolution.get(u_0);
              if (!s) {
                let u_n = c.value[1];
                let u_np1 = c.value[2];
                let sol_u_0 = this.solveFull(u_0);
                let sol_u_n = new Set(sol_u_0);
                let sol_u_np1: Set<T>;
                let size = 0;
                s = { partial: sol_u_n, full: sol_u_n };
                this._resolution.set(u_n, s);
                let resolution = new Map(this._resolution);
                while (size < sol_u_0.size) {
                  // Iterate
                  size = sol_u_0.size;
                  sol_u_np1 = this.solveFull(u_np1);
                  for (let o of sol_u_np1)
                    sol_u_0.add(o);

                  // Prepare the next iteration
                  this._resolution = resolution;
                  s.partial = sol_u_np1;
                  s.full = sol_u_np1;
                }
                this._resolution.delete(u_n);
                // Write the final solution
                s.partial = sol_u_0;
                s.full = sol_u_0;
              }
              ok = s.full!.has(object);
              break;
            }
            case ConstraintType.Recursion: {
              ok = this.solveFull(c.value).has(object);
              break;
            }
          }
          if (!ok)
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
          ok = this.mapper.has(lo, constraint.leftAttribute) && this.mapper.has(ro, constraint.rightAttribute)
            && pass_value(constraint.type, this.mapper.get(lo, constraint.leftAttribute), this.mapper.get(ro, constraint.rightAttribute));
        }
      }
      else if (constraint instanceof ConstraintValue) {
        let lset = set.variable(prefix + constraint.leftVariable)!;
        if (lset === set2) {
          ok = this.mapper.has(o2, constraint.leftAttribute) &&
              pass_value(constraint.type, this.mapper.get(o2, constraint.leftAttribute), this.mapper.todb(o2, constraint.leftAttribute, constraint.value));
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

    valueAtPath(o: T, path: Aspect.InstalledAttribute[]) {
      let v = o;
      for (let a of path) {
        v = this.mapper.get(v, a.name);
      }
      return v;
    }

    solveSorted(set: ObjectSet) : T[] {
      let full = this.solveFull(set);
      if (!set.sort)
        return [...full];

      return [...full].sort((a, b) => {
        let r = 0;
        for (let s of set.sort!) {
          let va = this.valueAtPath(a, s.path);
          let vb = this.valueAtPath(b, s.path);
          r = this.mapper.sort(va, vb, s.path[s.path.length - 1].type);
          if (r !== 0)
            return s.asc ? +r : -r;
        }
        return r;
      });
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
    UnionOfAlln,
    Recursion,
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

  export type ConstraintOnType =
     { type: ConstraintType.InstanceOf | ConstraintType.MemberOf, value: Aspect.Installed } |
     { type: ConstraintType.UnionOf, value: Set<ObjectSet> } |
     { type: ConstraintType.UnionOfAlln, value: [ObjectSet, ObjectSet, ObjectSet] } |
     { type: ConstraintType.Recursion, value: ObjectSet };

  export class ConstraintTree {
    constructor(
      public type: ConstraintType.Or | ConstraintType.And,
      public prefix: string, // for fast variable prefixing
      public value: Constraint[]) {}
  }

  export class ConstraintValue {
    constructor(
      public type: ConstraintOnValueTypes,
      public leftVariable: string,
      public leftAttribute: string,
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

  const type_any: Aspect.Type = { is: "type", type: "primitive", name: "any" as Aspect.PrimaryType };
  const attribute_id: Aspect.InstalledAttribute = {
    name: "_id",
    type: type_any,
    validator: Validation.validateId,
    relation: undefined,
  };
  function attribute_any(name: string): Aspect.InstalledAttribute {
    return {
      name: name,
      type: type_any,
      validator: V.validateAny,
      relation: undefined,
    };
  }

  function hasRSet(var_set: ObjectSet, r_set: ObjectSet) {
    let has = false;
    for (let c of var_set.typeConstraints) {
      if (c.type === ConstraintType.UnionOf) {
        for (let s of c.value) {
          has = hasRSet(s, r_set);
          if (has) break;
        }
      }
      else if (c.type === ConstraintType.UnionOfAlln) {
        has = hasRSet(c.value[0], r_set) || hasRSet(c.value[2], r_set);
      }
      else if (c.type === ConstraintType.Recursion) {
        has = c.value === r_set;
      }
      if (has) break;
    }
    return has;
  }

  function hasVariableAttribute(aspect: Aspect.Installed, set: ObjectSet, r_set: ObjectSet | undefined, attributes: Map<string, Aspect.InstalledAttribute>, variable: string, attribute: string) {
    let var_set = set.variable(variable);
    if (var_set === set || (var_set && r_set && hasRSet(var_set, r_set))) {
      let a = aspect.attributes.get(attribute);
      if (a) {
        attributes.set(a.name, a);
        return true;
      }
    }
    return false;
  }
  function hasAttribute(aspect: Aspect.Installed, set: ObjectSet, r_set: ObjectSet | undefined, attributes: Map<string, Aspect.InstalledAttribute>, constraint: Constraint, prefix: string): boolean {
    if (constraint instanceof ConstraintTree) {
      let has = false;
      for (let c of constraint.value)
        has = hasAttribute(aspect, set, r_set, attributes, c, prefix + constraint.prefix) || has;
      return has;
    }
    else if (constraint instanceof ConstraintValue) {
      return hasVariableAttribute(aspect, set, r_set, attributes, prefix + constraint.leftVariable, constraint.leftAttribute);
    }
    else if (constraint instanceof ConstraintVariable) {
      let lhas = hasVariableAttribute(aspect, set, r_set, attributes, prefix + constraint.leftVariable , constraint.leftAttribute );
      let rhas = hasVariableAttribute(aspect, set, r_set, attributes, prefix + constraint.rightVariable, constraint.rightAttribute);
      return lhas || rhas;
    }
    else if (constraint instanceof ConstraintSub) {
      let a = aspect.attributes.get(constraint.attribute);
      if (a) {
        attributes.set(a.name, a);
        return true;
      }
    }
    return false;
  }
  function hasAllAttributes(aspect: Aspect.Installed, set: ObjectSet, r_set: ObjectSet | undefined, attributes: Map<string, Aspect.InstalledAttribute>) {
    for (let c of set.constraints) {
      if (!hasAttribute(aspect, set, r_set, attributes, c, ''))
        return false;
    }
    return true;
  }
  function _compatibleAspects(cc: ControlCenter, set: ObjectSet, r_set: ObjectSet | undefined, aspects: Set<Aspect.Installed>, attributes: Map<string, Aspect.InstalledAttribute>, union: boolean) {
    for (let c of set.typeConstraints) {
      if (c.type === ConstraintType.InstanceOf || c.type === ConstraintType.MemberOf) {
        if (!union)
          aspects.clear(); // TODO: real memberof/instanceof
        aspects.add(c.value);
      }
      else if (c.type === ConstraintType.UnionOf) {
        for (let s of c.value)
          _compatibleAspects(cc, s, undefined, aspects, attributes, true);
      }
      else if (c.type === ConstraintType.UnionOfAlln) {
        _compatibleAspects(cc, c.value[0], undefined, aspects, attributes, true);
        _compatibleAspects(cc, c.value[2], c.value[1], aspects, attributes, true);
      }
    }
    if (aspects.size === 0) {
      for (let aspect of cc.installedAspects()) {
        if (hasAllAttributes(aspect, set, r_set, attributes))
        aspects.add(aspect);
      }
    }
    else {
      for (let aspect of aspects) {
        if (!hasAllAttributes(aspect, set, r_set, attributes))
          aspects.delete(aspect);
      }
    }
  }

  export class ObjectSet {
    _name: string;
    typeConstraints: ConstraintOnType[] = [];
    name?: string = undefined;
    scope?: ResolvedScope = undefined;
    sort?: ResolvedSort = undefined;
    constraints: Constraint[] = [];
    variables?: Map<string, ObjectSet> = undefined;
    subs?: Map<string, ObjectSet> = undefined;

    clone(name: string) {
      let ret = new ObjectSet(name);
      ret.typeConstraints = this.typeConstraints.slice(0);
      ret.constraints = this.constraints.slice(0);
      if (this.variables) {
        for (let [name, variable] of this.variables)
          ret.setVariable(name, variable === this ? ret : variable);
      }
      if (ret.constraints.length)
        ret.setVariable(this._name, ret);
      if (this.subs)
        ret.subs = new Map(this.subs);
      return ret;
    }

    hasVariable(name: string) : boolean {
      return !!(name === this._name || (this.variables && this.variables.has(name)) || (this.subs && this.subs.has(name)));
    }
    setVariable(name: string, set: ObjectSet) {
      if (name === this._name) {
        if (set !== this)
          throw new Error(`variable ${name} is already used`);
        return;
      }

      if (!this.variables)
        this.variables = new Map();
      else if (this.variables.get(name) === set)
        return;
      if (this.hasVariable(name))
        throw new Error(`variable ${name} is already used`);
      this.variables.set(name, set);
    }

    variable(name: string): ObjectSet | undefined {
      if (name === this._name)
        return this;
      return this.variables && this.variables.get(name);
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

    protected canAddType(c_with: ConstraintOnType) : boolean | undefined {
      for (let c_self of this.typeConstraints) {
        if (c_self.type === c_with.type) {
          if (areEquals(c_self.value, c_with.value))
            return undefined;
          return false;
        }
      }
      return true;
    }

    addType(c_with: ConstraintOnType) {
      if (this.canAddType(c_with) === true)
        this.typeConstraints.push(c_with);
    }

    tryToMerge(other: ObjectSet) : boolean {
      let r: ConstraintOnType[] = [];
      let can: boolean | undefined = true;
      for (let c_with of other.typeConstraints) {
        can = this.canAddType(c_with);
        if (can === false)
          break;
        if (can === true)
          r.push(c_with);
      }
      if (can !== false) {
        this.typeConstraints.push(...r);
        let prefix = "";
        if (other.variables) {
          prefix = `${other._name}.`;
          for (let [k, s] of other.variables.entries())
            this.setVariable(prefix + k, s === other ? this : s);
        }
        if (other.constraints.length) {
          this.setVariable(prefix + other._name, this);
          this.and(c_and(other.constraints, prefix));
        }
        return true;
      }
      return false;
    }

    aspectAttribute(name: string): Aspect.InstalledAttribute {
      if (name === "_id")
        return attribute_id;
      let attr: Aspect.InstalledAttribute | undefined = undefined;
      for (let c_self of this.typeConstraints) {
        if (c_self.type === ConstraintType.InstanceOf || c_self.type === ConstraintType.MemberOf) {
          setAttr(c_self.value.attributes.get(name));
        }
        else if (c_self.type === ConstraintType.UnionOf) {
          for (let u of c_self.value)
            setAttr(u.aspectAttribute(name));
        }
        else if (c_self.type === ConstraintType.UnionOfAlln) {
          setAttr(c_self.value[0].aspectAttribute(name));
        }
      }
      return attr || attribute_any(name);

      function setAttr(a: Aspect.InstalledAttribute | undefined) {
        if (a) {
          if (attr && a !== attr)
            throw new Error(`attribute ${name} refer to multiple aspect attributes`);
          attr = a;
        }
      }
    }

    and(constraint?: Constraint) : void {
      if (constraint)
        this.constraints.push(constraint);
    }

    constraint() {
      return c_and(this.constraints);
    }

    attributesAndCompatibleAspects(cc: ControlCenter) {
      let ret = {
        compatibleAspects: new Set<Aspect.Installed>(),
        attributes: new Map<string, Aspect.InstalledAttribute>(),
      }
      _compatibleAspects(cc, this, undefined, ret.compatibleAspects, ret.attributes, false);
      return ret;
    }

    constructor(name: string) {
      this._name = name;
    }
  }

  function c_or (constraints: Constraint[] = [], prefix = "") { return constraints.length === 1 && !prefix ? constraints[0] : new ConstraintTree(ConstraintType.Or , prefix, constraints); }
  function c_and(constraints: Constraint[] = [], prefix = "") { return constraints.length === 1 && !prefix ? constraints[0] : new ConstraintTree(ConstraintType.And, prefix, constraints); }
  function c_value(type: ConstraintOnValueTypes, leftVariable: string, leftAttribute: string, value: any): ConstraintValue
  { return new ConstraintValue(type, leftVariable, leftAttribute, value); }
  function c_var(type: ConstraintBetweenColumnsTypes, leftVariable: string, leftAttribute: string, rightVariable: string, rightAttribute: string): ConstraintVariable
  { return new ConstraintVariable(type, leftVariable, leftAttribute, rightVariable, rightAttribute); }
  function c_subin (sub: string, attribute: string): ConstraintSub { return new ConstraintSub(ConstraintType.SubIn   , attribute, sub); }
  function c_subnin(sub: string, attribute: string): ConstraintSub { return new ConstraintSub(ConstraintType.SubNotIn, attribute, sub); }


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

  export import Scope = DataSourceScope.Scope;
  export import ResolvedScope = DataSourceScope.ResolvedScope;
  export import ResolvedSort = DataSourceScope.ResolvedSort;
  export import parseScope = DataSourceScope.parseScope;

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
    $unionForAlln : string,
    $intersection : Instance<ObjectSetDefinition>[],
    $diff: [Instance<ObjectSetDefinition>, Instance<ObjectSetDefinition>],
    $instanceOf: string | Function,
    $memberOf: string | Function,
    $text: string,
    $out: string,
    $or: ConstraintDefinition[],
    $and: ConstraintDefinition[],
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
    scope?: string[] | Scope;
  }
  export type Request = Result | { results: (Result& { [s: string]: Instance<ObjectSetDefinition> })[], [s: string]: Instance<ObjectSetDefinition> };

  type OperatorOnSet<T> = (context: ParseContext, set: ObjectSet, value: T) => void;
  const operatorsOnSet: { [K in keyof Element]: OperatorOnSet<Element[K]>; } = {
    $or: (context, set, value) => {
      let constraints: Constraint[] = [];
      context.parseConditionsArray(set, constraints, context.head, value);
      if (constraints.length)
        set.and(c_or(constraints));
    },
    $and: (context, set, value) => {
      let constraints: Constraint[] = [];
      context.parseConditionsArray(set, constraints, context.head, value);
      if (constraints.length)
        set.and(c_and(constraints));
    },
    $elementOf: (context, set, value) => {
      let sub = context.parseSet(value, `${set._name}.$elementOf`);
      if (!set.tryToMerge(sub)) // compatible
        throw new Error(`cannot elementOf between incompatible sets`);
    },
    $instanceOf: (context, set, value) => {
      set.addType({ type: ConstraintType.InstanceOf, value: context.aspect(value) });
    },
    $memberOf: (context, set, value) => {
      set.addType({ type: ConstraintType.MemberOf, value: context.aspect(value) });
    },
    $union: (context, set, value) => {
      let subs = value.map((v, i) => context.parseSet(v, `${set._name}.$union[${i}]`));
      set.addType({ type: ConstraintType.UnionOf, value: new Set(subs) });
    },
    $unionForAlln: (context, set, value) => {
      let m = typeof value === "string" ? value.match(/^=(\w+)\(\s*n\s*\)$/) : null;
      if (!m)
        throw new Error(`$unionForAlln must be a reference to a recursive set definition`);
      let letter = m[1];
      let u_n_name = `${letter}(n)=`;
      let s = new ParseStack({ ...context.head.original, [u_n_name]: {} }, context.head.parent);
      let c = context.derive(s);
      let u_n = c.createSet(`${letter}(n)`);
      s.resolved.set(u_n_name, u_n);
      let u_0 = c.resolve(`${letter}(0)`, c.head);
      u_n.typeConstraints.push({ type: ConstraintType.Recursion, value: u_n });
      u_n.typeConstraints.push(...u_0.typeConstraints);
      let u_np1 = c.resolve(`${letter}(n + 1)`, c.head);
      set.addType({ type: ConstraintType.UnionOfAlln, value: [u_0, u_n, u_np1] });
    },
    $intersection: (context, set, value) => {
      value.forEach((v, i) => {
        let sub = context.parseSet(v, `${set._name}.$intersection[${i}]`);
        if (!set.tryToMerge(sub)) // must be compatible
          throw new Error(`cannot intersect between incompatible sets`);
      });
    },
    $diff: (context, set, value) => {
      if (!Array.isArray(value) || value.length !== 2)
        throw new Error(`diff value must be an array of 2 object set`);
      let add = context.parseSet(value[0], `${set._name}.$diff+`);
      let del = context.parseSet(value[1], `${set._name}.$diff-`);
      set.and(c_subin(set.sub(add), "_id"));
      set.and(c_subnin(set.sub(del), "_id"));
    },
    $in: (context, set, value) => {
      if (Array.isArray(value))
        set.and(c_value(ConstraintType.In, set._name, "_id", value));
      else {
        let sub = context.parseSet(value, `${set._name}.$in`);
        if (!set.tryToMerge(sub)) // must be compatible
          throw new Error(`cannot intersect between incompatible sets`);
      }
    },
    $nin: (context, set, value) => {
      if (Array.isArray(value))
        set.and(c_value(ConstraintType.NotIn, set._name, "_id", value));
      else {
        let sub = context.parseSet(value, `${set._name}.$nin`);
        set.and(c_subnin(set.sub(sub), "_id"));
      }
    },
    $out: (context, set, value) => {
      throw new Error(`$out is managed in ParseContext`);
    },
    $text: (context, set, value) => {
      if (typeof value !== "string")
        throw new Error(`$text value must be a string`);
      if (value) // No constraint on empty string
        set.and(c_value(ConstraintType.Text, set._name, "_id", value));
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
  function validateInValue(this: { type: ConstraintOnValueTypes }, attribute: string, value) {
    if (!Array.isArray(value))
      throw new Error(`${attribute} ${ConstraintType[this.type]} value must be an array`);
  }
  const operatorsOnValue: { [s: string]: { type: ConstraintOnValueTypes, validate(attribute: string, value): void } } = {
    $eq  : { type: ConstraintType.Equal             , validate: alwaysTrue },
    $ne  : { type: ConstraintType.NotEqual          , validate: alwaysTrue },
    $gt  : { type: ConstraintType.GreaterThan       , validate: alwaysTrue },
    $gte : { type: ConstraintType.GreaterThanOrEqual, validate: alwaysTrue },
    $lt  : { type: ConstraintType.LessThan          , validate: alwaysTrue },
    $lte : { type: ConstraintType.LessThanOrEqual   , validate: alwaysTrue },
    $in  : { type: ConstraintType.In                , validate: validateInValue },
    $nin : { type: ConstraintType.NotIn             , validate: validateInValue },
    $has : { type: ConstraintType.Has               , validate: alwaysTrue },
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
  type VarPath = { set: ObjectSet, variable: string, attribute: string };
  class ParseContext {
    constructor(public head: ParseStack, public cc: ControlCenter) {}

    derive(head: ParseStack) {
      return new ParseContext(head, this.cc);
    }
    aspect(name: string | Function) : Aspect.Installed {
      let n: string = typeof name === "string" ? name : (name as any).aspect ? (name as any).aspect.name : (name as any).definition.name;
      return this.cc.aspectChecked(n);
    }
    aspects() {
      return this.cc.installedAspects();
    }
    push(original: any) {
      this.head = new ParseStack(original, this.head);
    }
    pop() {
      if (!this.head.parent)
        throw new Error(`cannot pop stack`);
      this.head = this.head.parent;
    }

    resolve(reference: string, end: ParseStack | undefined = undefined) : ObjectSet {
      let key = `${reference}=`;
      let v: ObjectSet | undefined, s: ParseStack | undefined = this.head;
      for (;!v && s; s = s.parent) {
        let o = s.original[key];
        if (o) {
          v = s.resolved.get(key);
          if (!v) {
            let c = this.derive(s);
            v = c.parseSet(o, reference);
            s.resolved.set(key, v);
          }
        }
        if (s === end)
          break;
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

    resolveElement(reference: string, set: ObjectSet, end: ParseStack | undefined) : VarPath {
      let parts = reference.split('.');
      let k = parts[0];
      let variable = set.variable(k);
      if (!variable) {
        let sub = this.resolve(k, end);
        variable = sub.clone(k);
        set.setVariable(k, variable);
      }
      return this.resolveAttribute(variable, parts, k, 1);
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
          let type = attr && attr.type;
          if (type.type === "class") {
            s.addType({ type: ConstraintType.InstanceOf, value: this.aspect(type.name) });
            decl(k, s, c_var(ConstraintType.Equal, set._name, attr.name, k, "_id"));
          }
          else if ((type.type === "set" || type.type === "array") && type.itemType.type === "class") {
            s.addType({ type: ConstraintType.InstanceOf, value: this.aspect(type.itemType.name) });
            decl(k, s, c_var(ConstraintType.Equal, set._name, attr.name, k, "_id"));
          }
          else
            throw new Error(`invalid constraint attribute type ${attr.type.type} on ${parts[i]}`);
        }
        set = s;
      }
      return { set: set, variable: k, attribute: set.aspectAttribute(i < parts.length ? parts[i] : "_id").name };
    }

    parseSet(v: Instance<ObjectSetDefinition>, name: string, set?: ObjectSet) : ObjectSet {
      if (typeof v === "string") {
        if (!v.startsWith("="))
          throw new Error(`an object set definition was expected`);
        return this.resolveSet(v.substring(1));
      }
      this.push(v);

      let nout = v["$out"];
      if (nout) {
        if (!nout.startsWith("=") && nout.indexOf(".") !== -1)
          throw new Error(`an element was expected`);
        nout = nout.substring(1);
        set = this.resolve(nout);
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

      this.parseConditions(set, set.constraints, this.head, v);

      this.pop();
      return set;
    }

    parseConditionsArray(set: ObjectSet, constraints: Constraint[], end: ParseStack | undefined, c: ConstraintDefinition[]) {
      for (let conditions of c)
        this.parseConditions(set, constraints, this.head, conditions);
    }

    parseConditions(set: ObjectSet, constraints: Constraint[], end: ParseStack | undefined, conditions: ConstraintDefinition) {
      for(let key in conditions) {
        if (!key.startsWith('$')) {
          if (key.startsWith('=')) {
            // only elements are allowed here ( ie. =element_name(.attribute)* )
            let a = this.resolveElement(key.substring(1), set, end);
            this.parseRightConditions(set, constraints, end, a, conditions[key]);
          }
          else if (!key.endsWith('=')) {
            // key is an attribute path
            let a = this.resolveAttribute(set, key.split('.'));
            this.parseRightConditions(set, constraints, end, a, conditions[key]);
          }
        }
      }
    }

    parseRightConditions(set: ObjectSet, constraints: Constraint[], end: ParseStack | undefined, left: VarPath, conditions: Value | ConstraintDefinition) {
      if (conditions && typeof conditions === "object") {
        if (conditions instanceof VersionedObject) {
          constraints.push(c_value(ConstraintType.Equal, left.variable, left.attribute, conditions));
        }
        else {
          this.push(conditions);
          for(var key in conditions) {
            if (!key.startsWith(`$`))
              throw new Error(`an operator was expected`);
            let v = conditions[key];
            if (typeof v === "string" && v.startsWith('=')) {
              let right = this.resolveElement(v.substring(1), set, end);
              let o = operatorsBetweenSet[key];
              if (o === undefined)
                throw new Error(`operator between two set '${key}' not found`);
              constraints.push(c_var(o, left.variable, left.attribute, right.variable, right.attribute))
            }
            else {
              let o = operatorsOnValue[key];
              if (!o)
                throw new Error(`operator on value '${key}' not found`);
              o.validate(left.attribute, v);
              constraints.push(c_value(o.type, left.variable, left.attribute, v));
            }
          }
          this.pop();
        }
      }
      else if (typeof conditions === "string" && conditions.startsWith('=')) {
        let right = this.resolveElement(conditions.substring(1), set, end);
        constraints.push(c_var(ConstraintType.Equal, left.variable, left.attribute, right.variable, right.attribute));
      }
      else {
        constraints.push(c_value(ConstraintType.Equal, left.variable, left.attribute, conditions));
      }
    }
  }

  function parseResult(context: ParseContext, result: Result) {
    context.push(result);
    let set = context.parseSet(result.where, result.name)
    set = set.clone(set._name);
    set.name = result.name;
    if (result.scope) {
      let r = parseScope(result.scope, function *(type) {
        if (type !== '_')
          yield context.aspect(type);
        else
          yield* set.attributesAndCompatibleAspects(context.cc).compatibleAspects;
      });
      set.scope = r.scope;
      set.sort = r.sort;
    }
    context.pop();
    return set;
  }

  export function resolveScopeForObjects(unsafe_scope: Scope | string[], cc: ControlCenter, objects: Iterable<VersionedObject>) : ResolvedScope {
    return parseScope(unsafe_scope, function *(type) {
      if (type !== '_') {
        yield cc.aspectChecked(type);
      }
      else {
        let aspects = new Set<Aspect.Installed>();
        for (let o of objects)
          aspects.add(o.manager().aspect());
        yield* aspects;
      }
    }).scope;
  }

  export function parseRequest(request: Request, cc: ControlCenter) : ObjectSet[] {
    let context = new ParseContext(new ParseStack(request), cc);
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

  export function applyWhere(where: ObjectSetDefinition, objects: VersionedObject[], cc: ControlCenter) : VersionedObject[] {
    let context = new ParseContext(new ParseStack(where), cc);
    let set = context.parseSet(where, "where");
    let sctx = new FilterContext(objects, versionedObjectMapper);
    return sctx.solveSorted(set);
  }

  export function applyRequest(request: Request, objects: VersionedObject[], cc: ControlCenter) : { [s: string]: VersionedObject[] } {
    let map = applySets(parseRequest(request, cc), objects, true);
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
        ret.set(set, sctx.solveSorted(set));
      }
    }
    return ret;
  }

  export function buildScopeTreeItem(
    cc: ControlCenter, aspect: Aspect.Installed, scope: Iterable<string>,
    lvl: number, stack: Set<string>,
    handleAttribute: (aspect: Aspect.Installed, attribute: Aspect.InstalledAttribute) => void,
  ) {
    for (let k of scope) {
      let a = aspect.attributes.get(k);
      if (a) {
        let sub_names = Aspect.typeToAspectNames(a.type);
        handleAttribute(aspect, a);
        if (sub_names.length) {
          stack.add(k);
          for (let sub_name of sub_names) {
            let aspect = cc.aspect(sub_name)!;
            buildScopeTreeItem(cc, aspect, scope, lvl + 1, stack, handleAttribute);
          }
          stack.delete(k);
        }
      }
    }
  }
}
