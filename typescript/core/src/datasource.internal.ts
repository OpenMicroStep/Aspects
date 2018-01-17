import {
  ControlCenter, VersionedObject,
  areEquals,
  Aspect, Result, traverseAllScope,
} from './core';
import * as DataSourceScope from './datasource.scope';
import { AttributeTypes as V, PathReporter, Reporter } from '@openmicrostep/msbuildsystem.shared';

export namespace DataSourceInternal {
  export import Scope = DataSourceScope.Scope;
  export import ResolvedScope = DataSourceScope.ResolvedScope;
  export import ResolvedSort = DataSourceScope.ResolvedSort;
  export import parseScope = DataSourceScope.parseScope;
  export import parseScopeExtension = DataSourceScope.parseScopeExtension;
  export import traverseScope = DataSourceScope.traverseScope;

  type VarDep = Map<ObjectSet, Set<ObjectSet>>;
  type Solution<T> = {
    partial: Set<T>,
    full: Set<T> | undefined,
  };
  export type Mapper<T> = {
    aspect(object: T): Aspect.Installed;
    has(object: T, attribute: Aspect.InstalledAttribute): boolean;
    get(object: T, attribute: Aspect.InstalledAttribute): any;
    todb(object: T, attribute: Aspect.InstalledAttribute, value): any;
    sort(a, b, attribute: Aspect.InstalledAttribute): number;
  };
  export const versionedObjectMapper: Mapper<VersionedObject> = {
    aspect(vo: VersionedObject) { return vo.manager().aspect(); },
    has(vo: VersionedObject, attribute: Aspect.InstalledAttribute) { return vo.manager().hasAttributeValueFast(attribute); },
    get(vo: VersionedObject, attribute:  Aspect.InstalledAttribute) { return vo.manager().attributeValueFast(attribute); },
    todb(vo: VersionedObject, attribute: Aspect.InstalledAttribute, value) { return value; },
    sort(a, b, attribute: Aspect.InstalledAttribute) {
      if (attribute.isMonoVersionedObjectValue()) {
        a = a.id();
        b = b.id();
      }
      return a === b ? 0 : (a < b ? -1 : +1 );
    },
  };
  export class FilterContext<T> {
    _resolution = new Map<ObjectSet, Solution<T>>();
    constructor(public objects: T[] = [], public mapper: Mapper<T>) {}

    solution(set: ObjectSet) {
      let s = this._resolution.get(set)!;
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
        switch (constraint.type) {
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
              ok = this.mapper.aspect(object).classname === c.value.classname; // TODO: real instanceof
              break;
            case ConstraintType.Is:
              ok = this.mapper.aspect(object).classname === c.value.classname;
              break;
            case ConstraintType.Union:
              ok = [...c.value].some(s => this.solveFull(s).has(object));
              break;
            case ConstraintType.UnionForAlln: {
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
            } break;
            case ConstraintType.Recursion: {
              ok = this.solveFull(c.value).has(object);
            } break;
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
        switch (constraint.type) {
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
        v = this.mapper.get(v, a);
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
          r = this.mapper.sort(va, vb, s.path[s.path.length - 1]);
          if (r !== 0)
            return s.asc ? +r : -r;
        }
        return r;
      });
    }

  };

  export enum ConstraintType {
    // a operator b
    BEGIN_a_op_b = 0,
    Equal = 0,
    NotEqual = 1,
    GreaterThan = 2,
    GreaterThanOrEqual = 3,
    LessThan = 4,
    LessThanOrEqual = 5,
    END_a_op_b = 9,

    // A operator b
    BEGIN_A_op_b = 10,
    Contains = 10,
    NotContains = 11,
    END_A_op_b = 19,

    // a operator B
    BEGIN_a_op_B = 20,
    In = 21,
    NotIn = 22,
    END_a_op_B = 29,

    // A operator B
    BEGIN_A_op_B = 30,
    Intersects = 30,
    NotIntersects = 31,
    SubSet = 32,
    NotSubSet = 33,
    SuperSet = 34,
    NotSuperSet = 35,
    SameSet = 36,
    NotSameSet = 37,
    END_A_op_B = 39,

    // a operator value
    Text,
    Exists,

    // set operators
    SubIn,
    SubNotIn,
    InstanceOf,
    Is,
    Union,
    UnionForAlln,
    Recursion,
    Or,
    And,
    CustomStart = 100 // The first 100 ([0-99]) are reserved
  }

  export type Value = string | number | boolean | Date | undefined;
  export type ValueSet = Value[] | Set<Value>;
  export type AnyValue = Value | ValueSet;
  export type ConstraintBetweenValueAndValue =
    ConstraintType.Equal |
    ConstraintType.NotEqual |
    ConstraintType.GreaterThan |
    ConstraintType.GreaterThanOrEqual |
    ConstraintType.LessThan |
    ConstraintType.LessThanOrEqual;
  export type ConstraintBetweenValueSetAndValue =
    ConstraintType.In |
    ConstraintType.NotIn;
  export type ConstraintBetweenValueAndValueSet =
    ConstraintType.Contains |
    ConstraintType.NotContains;
  export type ConstraintBetweenValueSetAndValueSet =
    ConstraintType.Intersects |
    ConstraintType.NotIntersects |
    ConstraintType.SubSet |
    ConstraintType.NotSubSet |
    ConstraintType.SuperSet |
    ConstraintType.NotSuperSet |
    ConstraintType.SameSet |
    ConstraintType.NotSameSet;
  export type ConstraintBetweenAnyValueAndAnyValue =
    ConstraintBetweenValueAndValue |
    ConstraintBetweenValueSetAndValue |
    ConstraintBetweenValueAndValueSet |
    ConstraintBetweenValueSetAndValueSet;
  export type ConstraintBetweenAnyValueAndFixedValue =
    ConstraintBetweenAnyValueAndAnyValue |
    ConstraintType.Text |
    ConstraintType.Exists;


  export type ConstraintOnType =
     { type: ConstraintType.InstanceOf | ConstraintType.Is, value: Aspect.Installed } |
     { type: ConstraintType.Union, value: Set<ObjectSet> } |
     { type: ConstraintType.UnionForAlln, value: [ObjectSet, ObjectSet, ObjectSet] } |
     { type: ConstraintType.Recursion, value: ObjectSet };

  export class ConstraintTree {
    constructor(
      public type: ConstraintType.Or | ConstraintType.And,
      public prefix: string, // for fast variable prefixing
      public value: Constraint[]) {}
  }

  export class ConstraintValue {
    constructor(
      public type: ConstraintBetweenAnyValueAndFixedValue,
      public leftVariable: string,
      public leftAttribute: Aspect.InstalledAttribute,
      public value: any) {}
  }

  export class ConstraintVariable {
    constructor(
      public type: ConstraintBetweenAnyValueAndAnyValue,
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

  function hasRSet(var_set: ObjectSet, r_set: ObjectSet) {
    let has = false;
    for (let c of var_set.typeConstraints) {
      if (c.type === ConstraintType.Union) {
        for (let s of c.value) {
          has = hasRSet(s, r_set);
          if (has) break;
        }
      }
      else if (c.type === ConstraintType.UnionForAlln) {
        has = hasRSet(c.value[0], r_set) || hasRSet(c.value[2], r_set);
      }
      else if (c.type === ConstraintType.Recursion) {
        has = c.value === r_set;
      }
      if (has) break;
    }
    return has;
  }

  function fillVariableAttribute(set: ObjectSet, r_set: ObjectSet | undefined, attributes: Map<string, Aspect.InstalledAttribute>, variable: string, attribute: Aspect.InstalledAttribute) {
    let var_set = set.variable(variable);
    if (var_set === set || (var_set && r_set && hasRSet(var_set, r_set))) {
      attributes.set(attribute.name, attribute);
    }
    return false;
  }
  function fill_attributes(set: ObjectSet, r_set: ObjectSet | undefined, attributes: Map<string, Aspect.InstalledAttribute>, constraint: Constraint, prefix: string): boolean {
    if (constraint instanceof ConstraintTree) {
      for (let c of constraint.value)
        fill_attributes(set, r_set, attributes, c, prefix + constraint.prefix);
    }
    else if (constraint instanceof ConstraintValue) {
      fillVariableAttribute(set, r_set, attributes, prefix + constraint.leftVariable, constraint.leftAttribute);
    }
    else if (constraint instanceof ConstraintVariable) {
      fillVariableAttribute(set, r_set, attributes, prefix + constraint.leftVariable , constraint.leftAttribute );
      fillVariableAttribute(set, r_set, attributes, prefix + constraint.rightVariable, constraint.rightAttribute);
    }
    else if (constraint instanceof ConstraintSub) {
      attributes.set(constraint.attribute.name, constraint.attribute);
    }
    return false;
  }
  function hasAllAttributes(aspect: Aspect.Installed, attributes: Map<string, Aspect.InstalledAttribute>) {
    for (let [name, attr] of attributes) {
      let f_attr = aspect.attributes.get(name);
      if (
        (!attr.isVirtualValue()) &&
        (!f_attr || !Aspect.Type.areComparable(f_attr.type, attr.type)) &&
        (name !== "_id" || !Aspect.Type.areComparable(aspect.attribute_ref.type, attr.type))
      )
       return false;
    }
    return true;
  }
  function _possibleAspectsAndRequiredAttributes(cc: ControlCenter, set: ObjectSet, r_set: ObjectSet | undefined,
    aspects = new Set<Aspect.Installed>(),
    attributes: Map<string, Aspect.InstalledAttribute> | undefined
  ) {
    for (let c of set.typeConstraints) {
      if (c.type === ConstraintType.InstanceOf || c.type === ConstraintType.Is) {
        aspects.add(c.value);
      }
      else if (c.type === ConstraintType.Union) {
        for (let s of c.value) {
          _possibleAspectsAndRequiredAttributes(cc, s, undefined, aspects, undefined);
        }
      }
      else if (c.type === ConstraintType.UnionForAlln) {
        _possibleAspectsAndRequiredAttributes(cc, c.value[0], undefined, aspects, attributes);
        _possibleAspectsAndRequiredAttributes(cc, c.value[2], c.value[1], aspects, attributes);
      }
    }
    if (attributes) for (let c of set.constraints)
      fill_attributes(set, r_set, attributes, c, '');
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

    and(constraint?: Constraint) : void {
      if (constraint)
        this.constraints.push(constraint);
    }

    constraint() {
      return c_and(this.constraints);
    }

    attributesAndCompatibleAspects(cc: ControlCenter) {
      let aspects = new Set<Aspect.Installed>();
      let attributes = new Map<string, Aspect.InstalledAttribute>();
      _possibleAspectsAndRequiredAttributes(cc, this, undefined, aspects, attributes);
      if (aspects.size === 0) {
        for (let aspect of cc.installedAspects()) {
          if (hasAllAttributes(aspect, attributes))
            aspects.add(aspect);
        }
      }
      else {
        for (let aspect of aspects) {
          if (!hasAllAttributes(aspect, attributes))
            aspects.delete(aspect);
        }
      }
      return {
        compatibleAspects: aspects,
        attributes: attributes,
      };
    }

    constructor(name: string) {
      this._name = name;
    }
  }

  function c_or (constraints: Constraint[] = [], prefix = "") { return constraints.length === 1 && !prefix ? constraints[0] : new ConstraintTree(ConstraintType.Or , prefix, constraints); }
  function c_and(constraints: Constraint[] = [], prefix = "") { return constraints.length === 1 && !prefix ? constraints[0] : new ConstraintTree(ConstraintType.And, prefix, constraints); }
  function c_value(type: ConstraintBetweenAnyValueAndFixedValue, leftVariable: string, leftAttribute: Aspect.InstalledAttribute, value: any): ConstraintValue {
    return new ConstraintValue(type, leftVariable, leftAttribute, value); }
  function c_var(type: ConstraintBetweenAnyValueAndAnyValue, leftVariable: string, leftAttribute: Aspect.InstalledAttribute, rightVariable: string, rightAttribute: Aspect.InstalledAttribute): ConstraintVariable {
    return new ConstraintVariable(type, leftVariable, leftAttribute, rightVariable, rightAttribute); }
  function c_subin (sub: string, attribute: Aspect.InstalledAttribute): ConstraintSub { return new ConstraintSub(ConstraintType.SubIn   , attribute, sub); }
  function c_subnin(sub: string, attribute: Aspect.InstalledAttribute): ConstraintSub { return new ConstraintSub(ConstraintType.SubNotIn, attribute, sub); }

  function find(set: ValueSet, value: Value) { // O(set.size)
    for (let v of set) {
      if (v === value)
        return true;
    }
    return false;
  }
  function a_intersects_b(a: ValueSet, b: ValueSet) { // TODO: fix O(a.size * b.size) -> O(a.size * log(b.size))
    for (let va of a) {
      if (find(b, va))
        return true;
    }
    return false;
  }
  function a_subsetof_b(a: ValueSet, b: ValueSet) { // TODO: fix O(a.size * b.size) -> O(a.size * log(b.size))
    for (let va of a) {
      if (!find(b, va))
        return false;
    }
    return true;
  }
  function a_samesetas_b(a: ValueSet, b: ValueSet) { // TODO: fix O(a.size * b.size * 2) -> O(a.size * log(b.size))
    return a_subsetof_b(a, b) && a_subsetof_b(b, a);
  }

  function pass_value(op: ConstraintBetweenAnyValueAndFixedValue, left: AnyValue, right: AnyValue) {
    switch (op) {
      // a operator b
      case ConstraintType.Equal: return left === right;
      case ConstraintType.NotEqual: return left !== right;
      case ConstraintType.GreaterThan: return left! > right!;
      case ConstraintType.GreaterThanOrEqual: return left! >= right!;
      case ConstraintType.LessThan: return left! < right!;
      case ConstraintType.LessThanOrEqual: return left! <= right!;

      // A operator b
      case ConstraintType.Contains: return find(left as ValueSet, right as Value);
      case ConstraintType.NotContains: return !find(left as ValueSet, right as Value);

      // a operator B
      case ConstraintType.In: return find(right as ValueSet, left as Value);
      case ConstraintType.NotIn: return !find(right as ValueSet, left as Value);

      // A operator B
      case ConstraintType.Intersects: return a_intersects_b(left as ValueSet, right as ValueSet);
      case ConstraintType.NotIntersects: return !a_intersects_b(left as ValueSet, right as ValueSet);
      case ConstraintType.SubSet: return a_subsetof_b(left as ValueSet, right as ValueSet);
      case ConstraintType.NotSubSet: return !a_subsetof_b(left as ValueSet, right as ValueSet);
      case ConstraintType.SuperSet: return a_subsetof_b(right as ValueSet, left as ValueSet);
      case ConstraintType.NotSuperSet: return !a_subsetof_b(right as ValueSet, left as ValueSet);
      case ConstraintType.SameSet: return a_samesetas_b(left as ValueSet, right as ValueSet);
      case ConstraintType.NotSameSet: return !a_samesetas_b(left as ValueSet, right as ValueSet);

      // a operator value
      case ConstraintType.Text: return (left as string).indexOf(right as string) !== -1;
      case ConstraintType.Exists: return right !== undefined && (!Array.isArray(right) || right.length > 0);
    }
    throw new Error(`Unsupported on value constraint ${ConstraintType[op as any]}`);
  }

  export type Instance<R> = string | R;
  export interface ConstraintDefinition {
    $eq?: Value;
    $neq?: Value;
    $gt?: string | Date | number;
    $gte?: string | Date | number;
    $lt?: string | Date | number;
    $lte?: string | Date | number;
    $exists?: boolean;
    $in?: Instance<ObjectSetDefinition> | (Value[]);
    $nin?: Instance<ObjectSetDefinition> | (Value[]);
    $contains?: Instance<ObjectSetDefinition> | Value;
    $ncontains?: Instance<ObjectSetDefinition> | Value;
    [s: string]: AnyValue | ConstraintDefinition | Function | undefined;
  }
  export interface ObjectSetDefinitionR {
    $in: Instance<ObjectSetDefinition>;
    $nin: Instance<ObjectSetDefinition>;
    $union: Instance<ObjectSetDefinition>[];
    $unionForAlln: string;
    $intersection: Instance<ObjectSetDefinition>[];
    $diff: [Instance<ObjectSetDefinition>, Instance<ObjectSetDefinition>];
    $instanceOf: string | Function;
    $is: string | Function;
    $text: string;
    $out: string;
    $or: ConstraintDefinition[];
    $and: ConstraintDefinition[];
  }
  export type ObjectSetDefinition = Partial<ObjectSetDefinitionR> & {
    [s: string]: Value | ConstraintDefinition | Function
  }
  export interface Element extends ObjectSetDefinitionR {
    $elementOf: Instance<ObjectSetDefinition>;
  }
  export type ResultDefinition = {
    name: string;
    where: Instance<ObjectSetDefinition>;
    scope?: Scope;
    [s: string]: any;
  }
  export type RequestDefinition = ResultDefinition | { results:ResultDefinition[], [s: string]: any; };

  type OperatorOnSet<T> = (context: ParseContext, p: PathReporter, set: ObjectSet, value: T) => void;
  const operatorsOnSet: { [op: string]: OperatorOnSet<any>; } = {
    $or: (context, p, set, value) => {
      let constraints: Constraint[] = [];
      context.parseConditionsArray(p, set, constraints, context.head, value);
      if (constraints.length)
        set.and(c_or(constraints));
    },
    $and: (context, p, set, value) => {
      let constraints: Constraint[] = [];
      context.parseConditionsArray(p, set, constraints, context.head, value);
      if (constraints.length)
        set.and(c_and(constraints));
    },
    $elementOf: (context, p, set, value) => {
      let sub = context.parseSet(p, value, `${set._name}.$elementOf`);
      if (!set.tryToMerge(sub)) // compatible
        throw new Error(`cannot elementOf between incompatible sets`);
    },
    $instanceOf: (context, p, set, value) => {
      set.addType({ type: ConstraintType.InstanceOf, value: context.aspect(value) });
    },
    $is: (context, p, set, value) => {
      set.addType({ type: ConstraintType.Is, value: context.aspect(value) });
    },
    $union: (context, p, set, value) => {
      p.pushArray();
      let subs = value.map((v, i) => context.parseSet(p.setArrayKey(i), v, `${set._name}.$union[${i}]`));
      p.popArray();
      set.addType({ type: ConstraintType.Union, value: new Set(subs) });
    },
    $unionForAlln: (context, p, set, value) => {
      let m = typeof value === "string" ? value.match(/^=(\w+)\(\s*n\s*\)$/) : null;
      if (!m)
        throw new Error(`$unionForAlln must be a reference to a recursive set definition`);
      let letter = m[1];
      let u_n_name = `${letter}(n)=`;
      let s = new ParseStack(p, { ...context.head.original, [u_n_name]: {} }, context.head.parent);
      let c = context.derive(s);
      let u_n = c.createSet(`${letter}(n)`);
      s.resolved.set(u_n_name, u_n);
      let u_0 = c.resolve(p, `${letter}(0)`, c.head);
      u_n.typeConstraints.push({ type: ConstraintType.Recursion, value: u_n });
      u_n.typeConstraints.push(...u_0.typeConstraints);
      let u_np1 = c.resolve(p, `${letter}(n + 1)`, c.head);
      set.addType({ type: ConstraintType.UnionForAlln, value: [u_0, u_n, u_np1] });
    },
    $intersection: (context, p, set, value) => {
      p.pushArray();
      value.forEach((v, i) => {
        let sub = context.parseSet(p.setArrayKey(i), v, `${set._name}.$intersection[${i}]`);
        if (!set.tryToMerge(sub)) // must be compatible
          throw new Error(`cannot intersect between incompatible sets`);
      });
      p.popArray()
    },
    $diff: (context, p, set, value) => {
      if (!Array.isArray(value) || value.length !== 2)
        return p.diagnostic({ is: "error", msg: `diff value must be an array of 2 object set` });
      p.pushArray();
      let add = context.parseSet(p.setArrayKey(0), value[0], `${set._name}.$diff+`);
      let del = context.parseSet(p.setArrayKey(1), value[1], `${set._name}.$diff-`);
      p.popArray()
      set.and(c_subin(set.sub(add), Aspect.attribute_id));
      set.and(c_subnin(set.sub(del), Aspect.attribute_id));
    },
    $in: (context, p, set, value) => {
      if (Array.isArray(value))
        in_value_on_set(context, p, set, value, ConstraintType.In);
      else {
        let sub = context.parseSet(p, value, `${set._name}.$in`);
        if (!set.tryToMerge(sub)) // must be compatible
          return p.diagnostic({ is: "error", msg: `cannot intersect between incompatible sets` });
      }
    },
    $nin: (context, p, set, value) => {
      if (Array.isArray(value))
        in_value_on_set(context, p, set, value, ConstraintType.NotIn);
      else {
        let sub = context.parseSet(p, value, `${set._name}.$nin`);
        set.and(c_subnin(set.sub(sub), Aspect.attribute_id));
      }
    },
    $out: (context, p, set, value) => {
      throw new Error(`$out is managed in ParseContext`);
    },
    $text: (context, p, set, value) => {
      if (typeof value !== "string")
        throw new Error(`$text value must be a string`);
      if (value) // No constraint on empty string
        set.and(c_value(ConstraintType.Text, set._name, Aspect.attribute_id, value));
    },
  } as { [K in keyof Element]: OperatorOnSet<Element[K]>; };

  enum OperatorKind {
    a_op_b,
    A_op_b,
    a_op_B,
    A_op_B,
    a_op_v,
    set_op,
  }
  type OperatorValidation = (at: PathReporter, left_var: VarPath, right_var: VarPath | undefined, right_fixed: any) => boolean;

  function in_value_on_set(context: ParseContext, at: PathReporter, set: DataSourceInternal.ObjectSet, value: any[], type: ConstraintBetweenAnyValueAndFixedValue) {
    let ok = true;
    at.pushArray();
    for (let [i, v] of value.entries()) {
      if (!(v instanceof VersionedObject)) {
        at.setArrayKey(i).diagnostic({ is: "error", msg: `only versioned object are allowed here` });
        ok = false;
      }
    }
    at.popArray();
    let attr = ok && context.aspectAttribute(at, set, undefined);
    if (attr)
      set.and(c_value(ConstraintType.In, set._name, attr, value));
  }

  function validate_var_is_undefined(at: PathReporter, v: VarPath, side: string): boolean {
    at.diagnostic({ is: "error", msg: `${side} operand must be a fixed value` });
    return false;
  }
  function validate_var_is_value(at: PathReporter, v: VarPath, side: string): boolean {
    let ret = v.attribute.isMonoValue();
    if (!ret)
      at.diagnostic({ is: "error", msg: `${side} operand must be a single value, ${JSON.stringify(v.attribute.type)} was found` });
    return ret;
  }
  function validate_var_is_set(at: PathReporter, v: VarPath, side: string): boolean {
    let ret = v.attribute.isMultValue();
    if (!ret)
      at.diagnostic({ is: "error", msg: `${side} operand must be a set of values, ${JSON.stringify(v.attribute.type)} was found` });
    return ret;
  }
  function validate_fixed_is_value(at: PathReporter, fixed: any): boolean {
    let ret = fixed === undefined || !(fixed instanceof Array || fixed instanceof Set);
    if (!ret)
      at.diagnostic({ is: "error", msg: `right operand must be a single value,  ${Object.prototype.toString.call(fixed)} was found` });
    return ret;
  }
  function validate_fixed_is_set(at: PathReporter, fixed: any): boolean {
    let ret = fixed === undefined || fixed instanceof Array || fixed instanceof Set;
    if (!ret)
      at.diagnostic({ is: "error", msg: `right operand must be a set of values, ${Object.prototype.toString.call(fixed)} was found` });
    return ret;
  }
  function validate_are_comparable(at: PathReporter, a: Aspect.Type, b: Aspect.Type) {
    let ret = Aspect.Type.areComparable(a, b);
    if (!ret) {
      at.diagnostic({ is: "error",
        msg: `operands are incompatible, ${a} !== ${b}`
      });
    }
    return ret;
  }
  function subtype(a: Aspect.Type) : Aspect.Type {
    return (a as any).type; // TODO: better typings
  }
  const a_op_b: OperatorValidation = function a_op_b(at, left_var, right_var, right_fixed) {
    if (left_var.attribute === Aspect.attribute_id && !right_fixed)
      at.diagnostic({ is: "error", msg: `right operand must be defined for _id` });
    return validate_var_is_value(at, left_var, 'left')
      && right_var
      ? validate_var_is_value(at, right_var, 'right') && validate_are_comparable(at, left_var.attribute.type, right_var.attribute.type)
      : validate_fixed_is_value(at, right_fixed);
  };
  const A_op_b: OperatorValidation = function a_op_b(at, left_var, right_var, right_fixed) {
    return validate_var_is_set(at, left_var, 'left')
      && right_var
      ? validate_var_is_value(at, right_var, 'right') && validate_are_comparable(at, subtype(left_var.attribute.type), right_var.attribute.type)
      : validate_fixed_is_value(at, right_fixed);
  };
  const a_op_B: OperatorValidation = function a_op_b(at, left_var, right_var, right_fixed) {
    return validate_var_is_value(at, left_var, 'left')
      && right_var
      ? validate_var_is_set(at, right_var, 'right') && validate_are_comparable(at, left_var.attribute.type, subtype(right_var.attribute.type))
      : validate_fixed_is_set(at, right_fixed);
  };
  const A_op_B: OperatorValidation = function a_op_b(at, left_var, right_var, right_fixed) {
    return validate_var_is_set(at, left_var, 'left')
      && right_var
      ? validate_var_is_set(at, right_var, 'right') && validate_are_comparable(at, left_var.attribute.type, right_var.attribute.type)
      : validate_fixed_is_set(at, right_fixed);
  };
  const a_op_v: OperatorValidation = function a_op_b(at, left_var, right_var, right_fixed) {
    let ret = validate_var_is_value(at, left_var, 'left')
      && right_var
      ? validate_var_is_undefined(at, right_var, 'right')
      : validate_fixed_is_value(at, right_fixed);
    return ret;
  };
  const set_op: OperatorValidation = function a_op_b(at, left_var, right_var, right_fixed) {
    at.diagnostic({ is: "error", msg: `only operators on attributes are allowed here` });
    return false;
  };
  type OperatorDesc = { is: OperatorValidation, type: ConstraintType };
  const operators: { [op: string]: OperatorDesc } = {
    // a operator b
    $eq:  { is: a_op_b, type: ConstraintType.Equal              },
    $neq: { is: a_op_b, type: ConstraintType.NotEqual           },
    $gt:  { is: a_op_b, type: ConstraintType.GreaterThan        },
    $gte: { is: a_op_b, type: ConstraintType.GreaterThanOrEqual },
    $lt:  { is: a_op_b, type: ConstraintType.LessThan           },
    $lte: { is: a_op_b, type: ConstraintType.LessThanOrEqual    },

    // A operator b
    $contains:    { is: A_op_b, type: ConstraintType.Contains      },
    $ncontains:   { is: A_op_b, type: ConstraintType.NotContains   },

    // a operator B
    $in:          { is: a_op_B, type: ConstraintType.In            },
    $nin:         { is: a_op_B, type: ConstraintType.NotIn         },

    // A operator B
    $intersects:  { is: A_op_B, type: ConstraintType.Intersects    },
    $nintersects: { is: A_op_B, type: ConstraintType.NotIntersects },
    $subset:      { is: A_op_B, type: ConstraintType.SubSet        },
    $nsubset:     { is: A_op_B, type: ConstraintType.NotSubSet     },
    $superset:    { is: A_op_B, type: ConstraintType.SuperSet      },
    $nsuperset:   { is: A_op_B, type: ConstraintType.NotSuperSet   },
    $sameset:     { is: A_op_B, type: ConstraintType.SameSet       },
    $nsameset:    { is: A_op_B, type: ConstraintType.NotSameSet    },

    // a operator value
    $text:   { is: a_op_v, type: ConstraintType.Text   },
    $exists: { is: a_op_v, type: ConstraintType.Exists },

    // set operators
    $instanceOf:   { is: set_op, type: ConstraintType.InstanceOf   },
    $is:           { is: set_op, type: ConstraintType.Is           },
    $union:        { is: set_op, type: ConstraintType.Union        },
    $unionForAlln: { is: set_op, type: ConstraintType.UnionForAlln },
    $or:           { is: set_op, type: ConstraintType.Or           },
    $and:          { is: set_op, type: ConstraintType.And          },
  };

  function isResult(result: RequestDefinition): result is ResultDefinition {
    return (result as ResultDefinition).name !== undefined;
  }

  class ParseStack {
    parent: ParseStack | undefined;
    at: PathReporter;
    resolved: Map<string, ObjectSet>; // Pre-resolved sets
    original: any; // Original object
    constructor(at: PathReporter, original, parent: ParseStack | undefined) {
      this.parent = parent;
      this.resolved = new Map();
      this.original = original;
      this.at = at;
    }
  }
  type VarPath = { set: ObjectSet, variable: string, attribute: Aspect.InstalledAttribute };
  class ParseContext {
    constructor(
      public head: ParseStack,
      public cc: ControlCenter,
    ) {}

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
    push(at: PathReporter, original: any) {
      this.head = new ParseStack(at.copy(), original, this.head);
    }
    pop() {
      if (!this.head.parent)
        throw new Error(`cannot pop stack`);
      this.head = this.head.parent;
    }

    resolve(at: PathReporter, reference: string, end: ParseStack | undefined = undefined) : ObjectSet {
      let key = `${reference}=`;
      let v: ObjectSet | undefined;
      let s: ParseStack | undefined = this.head;
      for (; !v && s; s = s.parent) {
        let o = s.original[key];
        if (o) {
          v = s.resolved.get(key);
          if (!v) {
            let c = this.derive(s);
            v = c.parseSet(s.at, o, reference);
            s.resolved.set(key, v);
          }
        }
        if (s === end)
          break;
      }
      if (!v) {
        at.diagnostic({ is: "error", msg: `no object set with the name ${key} found` });
        v = this.createSet(key);
      }
      return v;
    }

    createSet(name: string): ObjectSet {
      let set = new ObjectSet(name);
      return set;
    }

    resolveSet(at: PathReporter, reference: string) : ObjectSet {
      let parts = reference.split(':');
      let set = this.resolve(at, parts[0]);
      if (parts.length > 1) {
        let k = set._name;
        let vars: [string, ObjectSet, Constraint | undefined][] = [];
        let fattr = this.resolveAttribute(at, set, parts, k, 1, parts.length, (k, s, c) => {
          vars.push([k, s, c]);
        });
        if (!fattr)
          return this.createSet(reference);
        let fset = fattr.set;
        fset.setVariable(k, set);
        for (let [k, s, c] of vars) {
          fset.setVariable(k, s);
          fset.and(c);
        }
        set = fset;
      }
      return set;
    }

    resolveElement(at: PathReporter, reference: string, set: ObjectSet, end: ParseStack | undefined) : VarPath | undefined {
      let parts = reference.split('.');
      let k = parts[0];
      let variable = set.variable(k);
      if (!variable) {
        let sub = this.resolve(at, k, end);
        variable = sub.clone(k);
        set.setVariable(k, variable);
      }
      return this.resolveAttribute(at, variable, parts, k, 1);
    }

    aspectAttribute(at: PathReporter, set: ObjectSet, name: string | undefined): Aspect.InstalledAttribute| undefined {
      if (name === "_id")
        return Aspect.attribute_id;

      let attr: Aspect.InstalledAttribute | undefined = undefined;
      let n = 0;
      let mult = false;
      const setAttr = (aspect: Aspect.Installed, name: string | undefined) => {
        let a = name ? (aspect.attributes.get(name) || DataSourceScope.parse_virtual_attribute(at, aspect, name)) : aspect.attribute_ref;
        if (a) {
          if (attr && !DataSourceScope.attribute_name_type_are_equals(a, attr)) {
            if (!mult)
              at.diagnostic({ is: "error", msg: `attribute ${name} refer to multiple aspect attributes` });
            mult = true;
          }
          attr = a;
        }
      };

      const recurse = (set: ObjectSet) => {
        for (let c_self of set.typeConstraints) {
          if (c_self.type === ConstraintType.InstanceOf || c_self.type === ConstraintType.Is) {
            n++;
            setAttr(c_self.value, name);
          }
          else if (c_self.type === ConstraintType.Union) {
            for (let u of c_self.value)
              recurse(u);
          }
          else if (c_self.type === ConstraintType.UnionForAlln) {
            recurse(c_self.value[0]);
          }
        }
      }

      recurse(set);
      if (n === 0) {
        for (let aspect of this.aspects())
          setAttr(aspect, name);
      }
      if (!attr)
        at.diagnostic({ is: "error", msg: `attribute ${name} not found` });
      return attr;
    }

    resolveAttribute(at: PathReporter, set: ObjectSet, parts: string[], k: string = set._name, start: number = 0, last = parts.length - 1, decl?: (k: string, s: ObjectSet, c?: Constraint) => void) : VarPath | undefined {
      if (!decl) {
        decl = (k, s, c) => {
          set.setVariable(k, s);
          set.and(c);
        };
      }
      let i = start;
      for (; i < last; i++) { // >.attr1<.attr2
        k += `.${parts[i]}`;
        let s = set.variable(k);
        if (!s) {
          s = this.createSet(k);
          let attr = this.aspectAttribute(at, set, parts[i]);
          if (attr) {
            let aspect = attr.containedVersionedObjectIfAlone();
            if (aspect) {
              s.addType({ type: ConstraintType.InstanceOf, value: aspect });
              decl(k, s, c_var(ConstraintType.Equal, set._name, attr, k, Aspect.attribute_id));
            }
            else {
              at.diagnostic({ is: "error", msg: `invalid constraint attribute type ${attr.type} on ${parts[i]}` });
            }
          }
        }
        set = s;
      }
      let attr = this.aspectAttribute(at, set, i < parts.length ? parts[i] : undefined);
      return attr ? { set: set, variable: k, attribute: attr  } : undefined;
    }

    parseSet(at: PathReporter, v: Instance<ObjectSetDefinition>, name: string, set?: ObjectSet) : ObjectSet {
      if (typeof v === "string") {
        if (!v.startsWith("=")) {
          at.diagnostic({ is: "error", msg: `an object set definition or reference was expected` });
          return this.createSet("bad reference");
        }
        return this.resolveSet(at, v.substring(1));
      }
      this.push(at, v);


      let nout = v["$out"];
      if (nout) {
        at.push('.$out');
        if (!nout.startsWith("=") && nout.indexOf(".") !== -1) {
          at.diagnostic({ is: "error", msg: `an object set definition or reference was expected` });
          return this.createSet("bad $out");
        }
        nout = nout.substring(1);
        set = this.resolve(at, nout);
        at.pop();
      }
      else {
        set = set || this.createSet(name);
      }

      at.push('.', '');
      for (let key in v) {
        if (key.startsWith('$') && key !== "$out") {
          // key is an operator
          at.set(key);
          let op_on_set = operatorsOnSet[key];
          if (!op_on_set) {
            let msg = operators[key] ? `only operators on set are allowed here` : `unknown operator`;
            at.diagnostic({ is: "error", msg: msg });
          }
          else
            op_on_set(this, at, set, v[key]);
        }
      }
      at.pop(2);

      this.parseConditions(at, set, set.constraints, this.head, v);

      this.pop();
      return set;
    }

    parseConditionsArray(at: PathReporter, set: ObjectSet, constraints: Constraint[], end: ParseStack | undefined, c: ConstraintDefinition[]) {
      at.pushArray();
      for (let [i, conditions] of c.entries())
        this.parseConditions(at.setArrayKey(i), set, constraints, this.head, conditions);
      at.popArray();
    }

    parseConditions(at: PathReporter, set: ObjectSet, constraints: Constraint[], end: ParseStack | undefined, conditions: ConstraintDefinition) {
      at.push('.', '');
      for (let key in conditions) {
        if (!key.startsWith('$')) {
          at.set(key);
          if (key.startsWith('=$')) {
            //virtual attributes
            let a = this.resolveAttribute(at, set, [key.substring(1)]);
            if (a)
              this.parseRightConditions(at, set, constraints, end, a, conditions[key]);
          }
          else if (key.startsWith('=')) {
            // only elements are allowed here ( ie. =element_name(.attribute)* )
            let a = this.resolveElement(at, key.substring(1), set, end);
            if (a)
              this.parseRightConditions(at, set, constraints, end, a, conditions[key]);
          }
          else if (!key.endsWith('=')) {
            // key is an attribute path
            let a = this.resolveAttribute(at, set, key.split('.'));
            if (a)
              this.parseRightConditions(at, set, constraints, end, a, conditions[key]);
          }
        }
      }
      at.pop(2);
    }

    parseRightConditions(at: PathReporter, set: ObjectSet, constraints: Constraint[], end: ParseStack | undefined, left: VarPath, conditions: any) {
      if (conditions && typeof conditions === "object") {
        if (conditions instanceof VersionedObject) {
          constraints.push(c_value(ConstraintType.Equal, left.variable, left.attribute, conditions));
        }
        else {
          this.push(at, conditions);
          at.push('.', '');
          for (var key in conditions) {
            at.set(key);
            if (!key.startsWith(`$`))
              at.diagnostic({ is: "error", msg: `an operator was expected` });
            else {
              let v = conditions[key];
              let op = operators[key];
              if (!op)
                at.diagnostic({ is: "error", msg: `unknown operator` });
              else if (typeof v === "string" && v.startsWith('=')) {
                let right = this.resolveElement(at, v.substring(1), set, end);
                if (right && op.is(at, left, right, undefined))
                  constraints.push(c_var(op.type as any, left.variable, left.attribute, right.variable, right.attribute));
              }
              else {
                if (op.is(at, left, undefined, v))
                  constraints.push(c_value(op.type as any, left.variable, left.attribute, v));
              }
            }
          }
          at.pop(2);
          this.pop();
        }
      }
      else if (typeof conditions === "string" && conditions.startsWith('=')) {
        let right = this.resolveElement(at, conditions.substring(1), set, end);
        if (right)
          constraints.push(c_var(ConstraintType.Equal, left.variable, left.attribute, right.variable, right.attribute));
      }
      else {
        constraints.push(c_value(ConstraintType.Equal, left.variable, left.attribute, conditions));
      }
    }
  }

  function parseResult(context: ParseContext, at: PathReporter, result: ResultDefinition) {
    context.push(at, result);
    at.push('.where');
    let set = context.parseSet(at, result.where, result.name);
    at.pop();
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

  export function resolveScopeForObjects(unsafe_scope: Scope, cc: ControlCenter, objects: Iterable<VersionedObject>) : ResolvedScope {
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

  export function parseRequest(request: RequestDefinition, cc: ControlCenter) : Result<ObjectSet[]> {
    let at = new PathReporter(new Reporter());
    let context = new ParseContext(new ParseStack(at, request, undefined), cc);
    let sets: ObjectSet[] = [];
    if (isResult(request))
      sets.push(parseResult(context, at, request));
    else {
      at.push('results').pushArray();
      request.results.forEach((result, i) => {
        sets.push(parseResult(context, at.setArrayKey(i), result));
      });
    }
    return Result.fromReporterAndValue(at.reporter, sets);
  }

  export function applyWhere(where: ObjectSetDefinition, objects: VersionedObject[], cc: ControlCenter) : Result<VersionedObject[]> {
    let at = new PathReporter(new Reporter());
    let context = new ParseContext(new ParseStack(at, where, undefined), cc);
    let set = context.parseSet(at, where, "where");
    let sctx = new FilterContext(objects, versionedObjectMapper);
    return Result.fromReporterAndValue(at.reporter, sctx.solveSorted(set));
  }

  export function applyRequest(request: RequestDefinition, objects: VersionedObject[], cc: ControlCenter) : Result<{ [s: string]: VersionedObject[] }> {
    let req = parseRequest(request, cc);
    return Result.fromResultWithMappedValue(req, (sets) => {
      let map = applySets(req.value(), objects, true);
      let ret = {};
      map.forEach((objs, set) => {
        ret[set.name] = objs;
      });
      return ret;
    });
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
}
