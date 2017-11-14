import {
  ControlCenter, areEquals, Identifier, Invocation, Result, Aspect, addIsEqualSupport,
  ImmutableMap, ImmutableList, AComponent,
  SafePostLoad, SafePreSave, SafePostSave,
} from './core';
import { Flux } from '@openmicrostep/async';
import { Reporter, Diagnostic, AttributePath } from '@openmicrostep/msbuildsystem.shared';

function diff<T>(type: Aspect.Type, newV: any, oldV: any) : { add: T[], del: T[] } {
  let ret = { add: [] as T[], del: [] as T[] };
  switch (type.type) {
    case 'set':
      if (newV) for (let n of newV)
        if (!oldV || !oldV.has(n))
          ret.add.push(n);
      if (oldV) for (let o of oldV)
        if (!newV || !newV.has(o))
          ret.del.push(o);
      break;
    case 'class':
    case 'or':
      if (oldV !== newV) {
        if (oldV) ret.del.push(oldV);
        if (newV) ret.add.push(newV);
      }
      break;
    default: throw new Error(`unsupported relation type ${type.type}`);
  }

  return ret;
}

export class VersionedObjectManager<T extends VersionedObject = VersionedObject> {
  static UndefinedVersion = -3;
  static NoVersion = -1;
  static DeletedVersion = -2;
  static NextVersion = Number.MAX_SAFE_INTEGER; // 2^56 version should be more than enought
  static SafeMode = true;
  static LocalIdCounter = 0;
  static isLocalId(id: Identifier) {
    return typeof id === "string" && id.startsWith("_localid:");
  }

  /** @internal */ _id: Identifier;
  /** @internal */ _controlCenter: ControlCenter;
  /** @internal */ _aspect: Aspect.Installed;
  /** @internal */ _object: T;
  /** @internal */ _parent_manager: VersionedObjectManager | undefined;
  /** @internal */ _components: Set<object>;

  /** @internal */ _modified_attributes: VersionedObjectManager.Attributes<T>;
  /** @internal */ _saved_version: number;
  /** @internal */ _saved_attributes: VersionedObjectManager.Attributes<T>;
  /** @internal */ _outdated_version: number;
  /** @internal */ _outdated_attributes: VersionedObjectManager.Attributes<T>;

  constructor(controlCenter: ControlCenter, object: T) {
    this._controlCenter = controlCenter;
    this._components = new Set();
    this._id = `_localid:${++VersionedObjectManager.LocalIdCounter}`;
    this._modified_attributes = new Map();
    this._saved_version = VersionedObjectManager.NoVersion;
    this._saved_attributes = new Map();
    this._outdated_version = VersionedObjectManager.NoVersion;
    this._outdated_attributes = new Map();
    this._aspect = (object.constructor as any).aspect;
    this._object = object;
    this._parent_manager = undefined;
  }

  // Environment
  id()     : Identifier { return this._id; }
  version(): number { return this._modified_attributes.size > 0 ? VersionedObjectManager.NextVersion : this._saved_version; }
  object() { return this._object; }
  rootObject() {
    if (!this.isSubObject())
      return this._object;
    else if (this._parent_manager)
      return this._parent_manager.rootObject();
    throw new Error(`cannot find root object of sub object, the sub object is not linked to any parent object`);
  }
  controlCenter() { return this._controlCenter; }
  isRegistered() { return this._components.size > 0; }

  // Definition
  classname() { return this._aspect.classname; }
  aspect() { return this._aspect; }
  isSubObject() { return this._aspect.is_sub_object; }

  // Modified attributes
  isModified(scope?: string[]) : boolean;
  isModified(scope?: (keyof T)[]) : boolean;
  isModified(scope?: (keyof T)[]) {
    if (this._modified_attributes.size === 0)
      return false;
    return scope ? scope.some(attribute => this._modified_attributes.has(attribute)) : true;
  }
  modifiedAttributes(): VersionedObjectManager.ROAttributes<T> { return this._modified_attributes; }

  clear(scope?: string[]) : void;
  clear(scope?: (keyof T)[]) : void;
  clear(scope?: (keyof T)[]) {
    if (!scope)
      this._modified_attributes.clear();
    else
      scope.forEach(attribute => this._modified_attributes.delete(attribute));
  }

  // Saved attributes
  savedVersion(): number { return this._saved_version; }
  savedAttributes(): VersionedObjectManager.ROAttributes<T> { return this._saved_attributes; }

  savedAttributeValue(attribute: string) : any;
  savedAttributeValue<K extends keyof T>(attribute: K) : T[K];
  savedAttributeValue<K extends keyof T>(attribute: K) : T[K] {
    if (this._saved_attributes.has(attribute))
      return this._saved_attributes.get(attribute);
    return this._couldBeMissingValue(attribute);
  }

  // Live attributes
  state(): VersionedObjectManager.State {
    if (this._saved_version === VersionedObjectManager.NoVersion)
      return VersionedObjectManager.State.NEW;
    if (this._saved_version === VersionedObjectManager.DeletedVersion)
      return VersionedObjectManager.State.DELETED;
    if (this._outdated_attributes.size > 0)
      return VersionedObjectManager.State.INCONFLICT;
    if (this._modified_attributes.size > 0)
      return VersionedObjectManager.State.MODIFIED;
    return VersionedObjectManager.State.UNCHANGED;
  }

  attributeState(attribute: string) : VersionedObjectManager.AttributeState;
  attributeState(attribute: keyof T) : VersionedObjectManager.AttributeState;
  attributeState(attribute: keyof T) : VersionedObjectManager.AttributeState {
    if (this._modified_attributes.has(attribute))
      return VersionedObjectManager.AttributeState.MODIFIED;
    if (this._saved_version === VersionedObjectManager.NoVersion)
      return VersionedObjectManager.AttributeState.NEW;
    if (this._saved_attributes.has(attribute))
      return VersionedObjectManager.AttributeState.UNCHANGED;
    if (attribute === '_id' || attribute === '_version')
      return VersionedObjectManager.AttributeState.UNCHANGED;
    if (this._outdated_attributes.has(attribute))
      return VersionedObjectManager.AttributeState.INCONFLICT;
    return VersionedObjectManager.AttributeState.NOTLOADED;
  }

  hasAttributeValue(attributes: string) : boolean;
  hasAttributeValue(attributes: keyof T) : boolean;
  hasAttributeValue(attribute: keyof T) : boolean {
    return attribute === '_id'
        || attribute === '_version'
        || this._modified_attributes.has(attribute)
        || this._saved_attributes.has(attribute)
        || (this._saved_version === VersionedObjectManager.NoVersion && this._aspect.attributes.has(attribute));
  }

  hasEveryAttributesValue(attributes: string[]) : boolean;
  hasEveryAttributesValue(attributes: (keyof T)[]) : boolean;
  hasEveryAttributesValue(attributes: (keyof T)[]) : boolean {
    return attributes.every(attribute => this.hasAttributeValue(attribute));
  }

  attributeValue(attribute: string) : any;
  attributeValue<K extends keyof T>(attribute: K) : T[K];
  attributeValue<K extends keyof T>(attribute: K) : T[K] {
    if (this._modified_attributes.has(attribute))
      return this._modified_attributes.get(attribute);
    if (this._saved_attributes.has(attribute))
      return this._saved_attributes.get(attribute);
    if (attribute === "_id")
      return this.id();
    if (attribute === "_version")
      return this.version();
    if (this._outdated_attributes.has(attribute))
      throw new Error(`attribute '${this.classname()}.${attribute}' is unaccessible due to version change`);
    return this._couldBeMissingValue(attribute);
  }

  validateAttributeValue(attribute: string, value: any): Diagnostic[] {
    let reporter = new Reporter();
    let a = this._aspect.attributes.get(attribute);
    let path = new AttributePath(this.classname(), '{id=', this.id(), '}.', attribute);
    if (!a)
      path.diagnostic(reporter, { is: "error", msg: `attribute doesn't exists` });
    else
      a.validator.validate(reporter, path, value, this);
    return reporter.diagnostics;
  }

  setAttributeValue<K extends keyof T>(attribute: K, value: T[K]) {
    this.setAttributeValueFast(attribute, value, this._attribute_data(attribute));
  }

  setAttributeValueFast<K extends keyof T>(attribute: K, value: T[K], data: Aspect.InstalledAttribute) {
    let hasChanged = false;
    let isNew = this.state() === VersionedObjectManager.State.NEW;
    let oldValue;
    let hasVersionAttribute = this._saved_attributes.has(attribute);
    let hasLocalAttribute = this._modified_attributes.has(attribute);
    if (!hasVersionAttribute && !isNew)
      throw new Error(`attribute '${this.classname()}.${attribute}' is unaccessible and never was`);
    if (hasVersionAttribute && areEquals(this._saved_attributes.get(attribute), value)) {
      if (data.relation || data.contains_vo)
        oldValue = this._modified_attributes.get(attribute);
      hasChanged = this._modified_attributes.delete(attribute);
    }
    else if (!hasLocalAttribute || !areEquals(this._modified_attributes.get(attribute), value)) {
      if (hasLocalAttribute)
        oldValue = this._modified_attributes.get(attribute);
      else if (hasVersionAttribute)
        oldValue = this._saved_attributes.get(attribute);
      this._modified_attributes.set(attribute, value);
      hasChanged = true;
    }
    if (hasChanged && data.contains_vo) {
      let { add, del } = diff<VersionedObject>(data.type, value, oldValue);
      let is_add = true;
      let ai = 0, di = 0;
      while ((is_add = ai < add.length) || di < del.length) {
        let sub_object = is_add ? add[ai++] : del[di++];
        let sub_object_manager = sub_object.manager();
        this._check_sub_object(sub_object_manager, is_add, data);
        if (data.relation) {
          let relation_name = data.relation.attribute.name;
          let relation_type = data.relation.attribute.type;
          if (sub_object_manager.hasAttributeValue(relation_name)) {
            let v = sub_object[relation_name];
            switch (relation_type.type) {
              case 'set':   v = new Set<VersionedObject>(v); v[is_add ? 'add' : 'delete'](this._object); break;
              case 'class': v = is_add ? this._object : undefined; break;
              default: throw new Error(`unsupported relation destination type ${relation_type.type}`);
            }
            sub_object[relation_name] = v;
          }
          else if (is_add && sub_object_manager.state() === VersionedObjectManager.State.NEW) {
            switch (relation_type.type) {
              case 'set':   sub_object[relation_name] = (new Set<VersionedObject>()).add(this._object); break;
              case 'class': sub_object[relation_name] = this._object; break;
              default: throw new Error(`unsupported relation destination type ${relation_type.type}`);
            }
          }
        }
      }
    }
  }

  // Management
  unload(scope?: string[]) : void;
  unload(scope?: (keyof T)[]) : void;
  unload(scope?: (keyof T)[]) {
    if (!scope) {
      this._modified_attributes.clear();
      this._saved_attributes.clear();
      this._outdated_attributes.clear();
    }
    else {
      scope.forEach(attribute => {
        this._modified_attributes.delete(attribute);
        this._saved_attributes.delete(attribute);
        this._outdated_attributes.delete(attribute);
      });
    }
  }

  delete() {
    // TODO: add a shitload of checks
    this._modified_attributes.clear();
    this._saved_version = VersionedObjectManager.DeletedVersion;
  }

  setId(id: Identifier) {
    if (this._id === id)
      return;
    if (VersionedObjectManager.isLocalId(id))
      throw new Error(`cannot change identifier to a local identifier`);
    if (!VersionedObjectManager.isLocalId(this._id))
      throw new Error(`id can't be modified once assigned (not local)`);
    this._controlCenter._changeObjectId(this._object, this._id, id);
    this._id = id; // local -> real id (ie. object _id attribute got loaded)
    if (this._saved_version === VersionedObjectManager.NoVersion)
      this._saved_version = VersionedObjectManager.UndefinedVersion;
  }

  setVersion(version: number) {
    if (VersionedObjectManager.isLocalId(this._id))
      throw new Error(`version can't be set on a locally identifier object`);
    this._modified_attributes.forEach((v, k) => this._saved_attributes.set(k, v));
    this._modified_attributes.clear();
    this._saved_version = version;
  }

  computeMissingAttributes(attributes: Map<keyof T, any>) {
    let missings: string[] = [];
    for (let k of this._saved_attributes.keys()) {
      if (!attributes.has(k))
        missings.push(k);
    }
    return missings;
  }

  mergeSavedAttributes(attributes: Map<keyof T, any>, version: number) {
    // _attributes_ can't be trusted, so we need to validate _attributes_ keys and types
    let ret = { changes: <string[]>[], conflicts: <string[]>[], missings: <string[]>[] };
    let reporter = new Reporter();
    let path = new AttributePath(this.classname(), '{id=', this.id(), '}.', '');
    for (let [k, v] of attributes) {
      let a = this._aspect.attributes.get(k);
      path.set(k);
      if (!a)
        path.diagnostic(reporter, { is: "error", msg: `attribute doesn't exists` });
      else {
        let s = reporter.snapshot();
        a.validator.validate(reporter, path, v, this);
        if (!reporter.failed) { // v is valid
          if (a.contains_vo) {
            switch (a.type.type) { // validate sub objects
              case 'set':
              case 'array':
                for (let vi of v as VersionedObject[])
                  this._check_sub_object(vi.manager(), true, a);
                break;
              case 'class':
                if (v)
                  this._check_sub_object(v.manager(), true, a);
                break;
            }
            // TODO: check relations ? (do the other side of the relation is uptodate ?)
          }
          if (version === this._saved_version) {
            if (this._saved_attributes.has(k) && !areEquals(this._saved_attributes.get(k), v))
              ret.conflicts.push(k);
            this._saved_attributes.set(k, v);
          }
          else if (version > this._saved_version) {
            if (!this._saved_attributes.has(k) || !areEquals(this._saved_attributes.get(k), v))
              ret.changes.push(k);
            if (this._modified_attributes.has(k)) {
              if (areEquals(this._modified_attributes.get(k), v))
                this._modified_attributes.delete(k);
              else if (!areEquals(this._saved_attributes.get(k), v))
                ret.conflicts.push(k);
            }
          }
        }
      }
    }
    if (reporter.failed)
      throw new Error(JSON.stringify(reporter.diagnostics, null, 2));
    if (version > this._saved_version) {
      this._saved_version = version;
      this._saved_attributes = attributes;
      this._outdated_version = this._saved_version;
      this._outdated_attributes = this._saved_attributes;
      for (let k of this._outdated_attributes.keys()) {
        if (!this._saved_attributes.has(k))
          ret.missings.push(k);
      }
    }
    return ret;
  }

  fillNewObjectMissingValues() {
    for (let attribute of this._aspect.attributes.values()) {
      if (attribute.name !== '_id' && attribute.name !== '_version' && !this._modified_attributes.has(attribute.name as keyof T))
        this._modified_attributes.set(attribute.name as keyof T, this._missingValue(attribute));
    }
  }

  // Others
  filter_anonymize(key: string, value: any)  : void;
  filter_anonymize<K extends keyof T>(key: K, value: T[K]) : void;
  filter_anonymize<K extends keyof T>(key: K, value: T[K]) {
    if (this._modified_attributes.has(key))
      this._modified_attributes.set(key, value);
    if (this._saved_attributes.has(key))
      this._saved_attributes.set(key, value);
  }

  private _attribute_data(attribute: string) {
    let a = this._aspect.attributes.get(attribute);
    if (!a)
      throw new Error(`attribute '${this.classname()}.${attribute}' doesn't exists on ${this.classname()}`);
    return a;
  }

  private _couldBeMissingValue(attribute: string) {
    let a = this._attribute_data(attribute);
    if (this.state() === VersionedObjectManager.State.NEW)
      return this._missingValue(a);
    throw new Error(`attribute '${this.classname()}.${attribute}' is unaccessible and never was`);
  }

  private _missingValue(attribute: Aspect.InstalledAttribute) {
    if (attribute.type.type === "array")
      return [];
    if (attribute.type.type === "set")
      return new Set();
    return undefined;
  }

  private _check_sub_object(sub_object_manager: VersionedObjectManager, is_add: boolean, attribute: Aspect.InstalledAttribute) {
    if (sub_object_manager.controlCenter() !== this.controlCenter())
      throw new Error(`you can't mix objects of different control centers`);
    if (attribute.is_sub_object) {
      if (is_add && sub_object_manager.isSubObject()) {
        if (!sub_object_manager._parent_manager)
          sub_object_manager._parent_manager = this;
        else if (sub_object_manager._parent_manager !== this)
          throw new Error(`you can't move sub objects to another parent`);
      }
    }
  }
}
export namespace VersionedObjectManager {
  export enum State {
    NEW,
    UNCHANGED,
    MODIFIED,
    INCONFLICT,
    DELETED,
  };
  export enum AttributeState {
    NEW,
    UNCHANGED,
    MODIFIED,
    INCONFLICT,
    NOTLOADED
  };
  export type Attributes<T extends VersionedObject> = Map<keyof T, T[keyof T]>;
  export type ROAttributes<T extends VersionedObject> = ImmutableMap<keyof T, T[keyof T]>;

  function push(into: Set<VersionedObject>, o: Array<VersionedObject> | Set<VersionedObject> | VersionedObject) {
    if (o instanceof VersionedObject)
      into.add(o);
    else {
      for (let so of o)
        into.add(so);
    }
  }
  export function objectsInScope(objects: VersionedObject[], scope: string[]) : VersionedObject[] {
    let s = new Set<VersionedObject>();
    for (let o of objects) {
      let m = o.manager();
      s.add(o);
      for (let attribute of scope) {
        push(s, m.attributeValue(attribute));
        push(s, m.savedAttributeValue(attribute));
      }
    }
    return [...s];
  }
  /** @internal */
  export function UnregisteredVersionedObjectManager<T extends VersionedObject>(this: any, manager: VersionedObjectManager<T>) {
    this._id = manager.id();
  }
  function throw_is_dead_error(this: any) {
    throw new Error(`this object (${this._id}) was totally unregistered and thus is considered DEAD !`);
  }
  for (let k of Object.getOwnPropertyNames(VersionedObjectManager.prototype)) {
    let prop = { ...Object.getOwnPropertyDescriptor(VersionedObjectManager.prototype, k)! };
    prop.value = throw_is_dead_error;
    Object.defineProperty(UnregisteredVersionedObjectManager.prototype, k, prop);
  }
}
export class VersionedObject {
  static extends<T extends VersionedObjectConstructor<VersionedObject>>(cstor: VersionedObjectConstructor<VersionedObject>, definition: any): T {
    return <any>class VersionedObjectExtended extends cstor {
      static parent = cstor;
      static definition = definition;
      static displayName = `base ${definition.name}`;
    };
  }

  static parent: VersionedObjectConstructor | undefined = undefined;

  static definition: Aspect.Definition = {
    is: "class",
    name: "VersionedObject",
    version: 0,
    is_sub_object: false,
    attributes: [],
    categories: [{
      is: "category",
      name: "validation",
      methods: [
        { is: "method",
          name: "validate",
          argumentTypes: [{ is: "type", type: "class", name: "Reporter"} as Aspect.Type],
          returnType: { is: "type", type: "void" } as Aspect.Type,
        },
      ]
    }],
    farCategories: [],
    aspects: []
  };

  static readonly category: VersionedObject.Categories = function category(this: typeof VersionedObject, name: string, implementation) {
    Object.keys(implementation).forEach(k => this.prototype[k] = implementation[k]);
  };

  /** @internal */ __manager: VersionedObjectManager<this>;
  /** @internal */ readonly _id: Identifier;  // virtual attribute handled by the manager
  /** @internal */ readonly _version: number; // virtual attribute handled by the manager

  constructor(cc: ControlCenter) {
    this.__manager = new VersionedObjectManager(cc, this); // this will fill _id and _version attributes
  }

  id()     : Identifier { return this.__manager.id(); }
  version(): number { return this.__manager.version(); }
  manager(): VersionedObjectManager<this> { return this.__manager; }
  controlCenter(): ControlCenter { return this.__manager.controlCenter(); }

  static __c(name: string): any {}
  static __i<T extends VersionedObject>(name: string): any {}
}

Object.defineProperty(VersionedObject, "category", {
  value: function category(this: typeof VersionedObject, name: string, implementation) {
    Object.keys(implementation).forEach(k => this.prototype[k] = implementation[k]);
  }
});

VersionedObject.category('validation', {
  validate(reporter: Reporter): void {}
});

Object.defineProperty(VersionedObject.prototype, '_id', {
  enumerable: true,
  get(this: VersionedObject) { return this.__manager.id(); },
});
Object.defineProperty(VersionedObject.prototype, '_version', {
  enumerable: true,
  get(this: VersionedObject) { return this.__manager.version(); },
});

function isEqualVersionedObject(this: VersionedObject, other, level?: number) {
  return other === this;
}
addIsEqualSupport(VersionedObject as any, isEqualVersionedObject);

export interface VersionedObjectConstructor<C extends VersionedObject = VersionedObject> {
  new(cc: ControlCenter, ...args): C;
  definition: Aspect.Definition;
  parent?: VersionedObjectConstructor<VersionedObject>;

  category(name: 'validation', implementation: VersionedObject.ImplCategories.validation);
  category(name: string, implementation: {});
}

export declare namespace VersionedObject {
  export function __VersionedObject_c(n: string): {};
  export function __VersionedObject_i(n: string): {};
}
export namespace VersionedObject {
  export interface Categories<C extends VersionedObject = VersionedObject> {
    (name: 'validation', implementation: VersionedObject.ImplCategories.validation<C>): void;
  }
  export namespace Categories {
    export type validation = VersionedObject & {
      validate(reporter: Reporter): void;
    }
  }
  export namespace ImplCategories {
    export type validation<C extends VersionedObject = VersionedObject> = {
      validate: (this: C, reporter: Reporter) => void;
    }
  }
}
