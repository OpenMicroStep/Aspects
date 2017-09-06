import {ControlCenter, areEquals, Identifier, Invocation, Invokable, Aspect, addIsEqualSupport, ImmutableMap, AComponent} from './core';
import { Flux } from '@openmicrostep/async';
import { Reporter, Diagnostic } from '@openmicrostep/msbuildsystem.shared';

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
  /** @internal */ _components: Set<object>;

  /** @internal */ _localAttributes: VersionedObjectManager.Attributes<T>;
  /** @internal */ _version: number;
  /** @internal */ _versionAttributes: VersionedObjectManager.Attributes<T>;
  /** @internal */ _oldVersion: number;
  /** @internal */ _oldVersionAttributes: VersionedObjectManager.Attributes<T>;

  constructor(controlCenter: ControlCenter, aspect: Aspect.Installed) {
    this._controlCenter = controlCenter;
    this._components = new Set();
    this._id = `_localid:${++VersionedObjectManager.LocalIdCounter}`;
    this._localAttributes = new Map();
    this._version = VersionedObjectManager.NoVersion;
    this._versionAttributes = new Map();
    this._oldVersion = VersionedObjectManager.NoVersion;
    this._oldVersionAttributes = new Map();
    this._aspect = aspect;
    this._object = undefined!;
  }

  id()     : Identifier { return this._id; }
  controlCenter() { return this._controlCenter; }
  name() { return this._aspect.name; }
  aspect() { return this._aspect; }

  isRegistered() { return this._components.size > 0; }

  /** @internal */ registerComponent(component: AComponent) {
    this._components.add(component);
  }

  hasChanges(scope?: string[]) : boolean;
  hasChanges(scope?: (keyof T)[]) : boolean;
  hasChanges(scope?: (keyof T)[]) { 
    if (this._localAttributes.size === 0)
      return false;
    return scope ? scope.some(attribute => this._localAttributes.has(attribute)) : true;
  }
  localVersion(): number { return this._localAttributes.size > 0 ? VersionedObjectManager.NextVersion : this._version; }
  localAttributes(): VersionedObjectManager.ROAttributes<T> { return this._localAttributes; }
  
  clear(scope?: string[]) : void;
  clear(scope?: (keyof T)[]) : void;
  clear(scope?: (keyof T)[]) { 
    if (!scope)
      this._localAttributes.clear(); 
    else
      scope.forEach(attribute => this._localAttributes.delete(attribute));
  }

  unload(scope?: string[]) : void;
  unload(scope?: (keyof T)[]) : void;
  unload(scope?: (keyof T)[]) { 
    if (!scope) {
      this._localAttributes.clear();
      this._versionAttributes.clear();
    }
    else {
      scope.forEach(attribute => {
        this._localAttributes.delete(attribute);
        this._versionAttributes.delete(attribute);
      });
    }
  }
  
  versionVersion(): number { return this._version; }
  versionAttributes(): VersionedObjectManager.ROAttributes<T> { return this._versionAttributes; }

  state(): VersionedObjectManager.State {
    if (this._version === VersionedObjectManager.NoVersion)
      return VersionedObjectManager.State.NEW;
    if (this._version === VersionedObjectManager.DeletedVersion)
      return VersionedObjectManager.State.DELETED;
    if (this._localAttributes.size > 0)
      return VersionedObjectManager.State.MODIFIED;
    return VersionedObjectManager.State.UNCHANGED;
    // TODO INCONFLICT
  }

  attributeState(attribute: string) : VersionedObjectManager.AttributeState;
  attributeState(attribute: keyof T) : VersionedObjectManager.AttributeState;
  attributeState(attribute: keyof T) : VersionedObjectManager.AttributeState {
    if (this._localAttributes.has(attribute))
      return VersionedObjectManager.AttributeState.MODIFIED;
    if (this._versionAttributes.has(attribute))
      return VersionedObjectManager.AttributeState.UNCHANGED;
    if (this._version === VersionedObjectManager.NoVersion)
      return VersionedObjectManager.AttributeState.NEW;
    if (attribute === '_id' || attribute === '_version')
      return VersionedObjectManager.AttributeState.UNCHANGED;
    return VersionedObjectManager.AttributeState.NOTLOADED;
    // TODO INCONFLICT
  }
  
  hasAttributeValue(attributes: string) : boolean;
  hasAttributeValue(attributes: keyof T) : boolean;
  hasAttributeValue(attribute: keyof T) : boolean {
    return attribute === '_id' 
        || attribute === '_version' 
        || this._localAttributes.has(attribute) 
        || this._versionAttributes.has(attribute)
        || (this._version === VersionedObjectManager.NoVersion && this._aspect.attributes.has(attribute));
  }

  hasAttributeValues(attributes: string[]) : boolean;
  hasAttributeValues(attributes: (keyof T)[]) : boolean;
  hasAttributeValues(attributes: (keyof T)[]) : boolean {
    return attributes.every(attribute => this.hasAttributeValue(attribute));
  }

  attributeValue(attribute: string) : any;
  attributeValue<K extends keyof T>(attribute: K) : T[K];
  attributeValue<K extends keyof T>(attribute: K) : T[K] {
    if (this._localAttributes.has(attribute))
      return this._localAttributes.get(attribute);
    if (this._versionAttributes.has(attribute))
      return this._versionAttributes.get(attribute);
    if (attribute === "_id")
      return this.id();
    if (attribute === "_version")
      return this.localVersion();
    if (this._oldVersionAttributes.has(attribute))
      throw new Error(`attribute '${attribute}' is unaccessible due to version change`);
    return this.couldBeMissingValue(attribute);
  }

  versionAttributeValue(attribute: string) : any;
  versionAttributeValue<K extends keyof T>(attribute: K) : T[K];
  versionAttributeValue<K extends keyof T>(attribute: K) : T[K] {
    if (this._versionAttributes.has(attribute))
      return this._versionAttributes.get(attribute);
    return this.couldBeMissingValue(attribute);
  }

  private couldBeMissingValue(attribute: string) {
    let a = this._aspect.attributes.get(attribute);
    if (!a)
      throw new Error(`attribute '${attribute}' doesn't exists on ${this.name()}`);
    if (this.state() === VersionedObjectManager.State.NEW)
      return this.missingValue(a);
    throw new Error(`attribute '${attribute}' is unaccessible and never was`);
  }

  delete() {
    this._localAttributes.clear();
    this._version = VersionedObjectManager.DeletedVersion;
  }
  
  setId(id: Identifier) {
    if (this._id === id)
      return;
    if (VersionedObjectManager.isLocalId(id))
      throw new Error(`cannot change identifier to a local identifier`);
    if (!VersionedObjectManager.isLocalId(this._id)) 
      throw new Error(`id can't be modified once assigned (not local)`);
    this._controlCenter.changeObjectId(this._id, id);
    this._id = id; // local -> real id (ie. object _id attribute got loaded)
    if (this._version === VersionedObjectManager.NoVersion)
      this._version = VersionedObjectManager.UndefinedVersion;
  }

  setVersion(version: number) {
    if (VersionedObjectManager.isLocalId(this._id)) 
      throw new Error(`version can't be set on a locally identifier object`);
    this._localAttributes.forEach((v, k) => this._versionAttributes.set(k, v));
    this._localAttributes.clear();
    this._version = version;
  }

  setNewObjectMissingValues() {
    for (let attribute of this._aspect.attributes.values()) {
      if (attribute.name !== '_id' && attribute.name !== '_version' && !this._localAttributes.has(attribute.name as keyof T))
        this._localAttributes.set(attribute.name as keyof T, this.missingValue(attribute));
    }
  }

  private missingValue(attribute: Aspect.InstalledAttribute) {
    if (attribute.type.type === "array")
      return [];
    if (attribute.type.type === "set")
      return new Set();
    return undefined;
  }

  setAttributeValue<K extends keyof T>(attribute: K, value: T[K]) {
    this.setAttributeValueFast(attribute, value, this._aspect.attributes.get(attribute)!);
  }

  setAttributeValueFast<K extends keyof T>(attribute: K, value: T[K], data: Aspect.InstalledAttribute) {
    let hasChanged = false;
    let isNew = this.state() === VersionedObjectManager.State.NEW;
    let oldValue;
    let hasVersionAttribute = this._versionAttributes.has(attribute);
    let hasLocalAttribute = this._localAttributes.has(attribute);
    if (!hasVersionAttribute && !isNew)
      throw new Error(`attribute '${attribute}' is unaccessible and never was`);
    if (hasVersionAttribute && areEquals(this._versionAttributes.get(attribute), value)) {
      if (data.relation)
        oldValue = this._localAttributes.get(attribute);
      hasChanged = this._localAttributes.delete(attribute);
    }
    else if (!hasLocalAttribute || !areEquals(this._localAttributes.get(attribute), value)) {
      if (hasLocalAttribute)
        oldValue = this._localAttributes.get(attribute);
      else if (hasVersionAttribute)
        oldValue = this._versionAttributes.get(attribute);
      this._localAttributes.set(attribute, value);
      hasChanged = true;
    }
    if (hasChanged && data.relation) {
      let { add: sadd, del: sdel } = diff<VersionedObject>(data.type, value, oldValue);
      let otype = this.controlCenter().aspectChecked(data.relation.class).attributes.get(data.relation.attribute)!.type;
      let add = true;
      let ai = 0, di = 0;
      while ((add = ai < sadd.length) || di < sdel.length) {
        let other = add ? sadd[ai++] : sdel[di++];
        let other_manager = other.manager();
        if (other_manager.controlCenter() !== this.controlCenter())
          throw new Error(`you can't mix objects of different control centers`);
        if (other_manager.hasAttributeValue(data.relation.attribute)) {
          let v = other[data.relation.attribute];
          switch (otype.type) {
            case 'set':   v = new Set<VersionedObject>(v); v[add ? 'add' : 'delete'](this._object); break;
            case 'class': v = add ? this._object : undefined; break;
            default: throw new Error(`unsupported relation destination type ${otype.type}`);
          }
          other[data.relation.attribute] = v;
        }
        else if (add && other_manager.state() === VersionedObjectManager.State.NEW) {
          let v = other[data.relation.attribute];
          switch (otype.type) {
            case 'set':   other[data.relation.attribute] = (new Set<VersionedObject>()).add(this._object); break;
            case 'class': other[data.relation.attribute] = this._object; break;
            default: throw new Error(`unsupported relation destination type ${otype.type}`);
          }
        }
      }
    }
  }

  mergeWithRemote(manager: VersionedObjectManager<T>) {
    this.mergeWithRemoteAttributes(manager._versionAttributes, manager._version);
  }
  mergeWithRemoteAttributes(attributes: Map<keyof T, any>, version: number) {
    let ret = { changes: <string[]>[], conflicts: <string[]>[], missings: <string[]>[] };
    if (version === this._version) {
      if (VersionedObjectManager.SafeMode) {
        for (let k of attributes.keys())
          if (this._versionAttributes.has(k) && !areEquals(this._versionAttributes.get(k), attributes.get(k)))
            ret.conflicts.push(k);
      }
      attributes.forEach((v, k) => this._versionAttributes.set(k, v));
    }
    else if (version > this._version) {
      this._version = version;
      this._oldVersion = this._version;
      this._oldVersionAttributes = this._versionAttributes;
      this._versionAttributes = attributes;
      for (let k of this._versionAttributes.keys()) {
        if (!this._oldVersionAttributes.has(k) || !areEquals(this._oldVersionAttributes.get(k), attributes.get(k)))
          ret.changes.push(k);
        if (this._localAttributes.has(k)) {
          if (areEquals(this._localAttributes.get(k), this._versionAttributes.get(k)))
            this._localAttributes.delete(k);
          else if (!areEquals(this._oldVersionAttributes.get(k), this._versionAttributes.get(k)))
            ret.conflicts.push(k);
        }
      }
      for (let k of this._oldVersionAttributes.keys()) {
        if (!this._versionAttributes.has(k))
          ret.missings.push(k);
      }
    }
    return ret;
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
        push(s, m.versionAttributeValue(attribute));
      }
    }
    return [...s];
  }
  /** @internal */ 
  export function UnregisteredVersionedObjectManager<T extends VersionedObject>(this: any, manager: VersionedObjectManager<T>) {
    this._manager = manager;
  }
  function isRegisteredCheck(this: any) { 
    throw new Error(`you must register this object (${this.id()}) before using it`); 
  }
  for (let k of Object.getOwnPropertyNames(VersionedObjectManager.prototype)) {
    let prop = { ...Object.getOwnPropertyDescriptor(VersionedObjectManager.prototype, k) };
    prop.value = isRegisteredCheck;
    Object.defineProperty(UnregisteredVersionedObjectManager.prototype, k, prop);
  }
  UnregisteredVersionedObjectManager.prototype.id = function() { 
    return this._manager.id();
  }
  UnregisteredVersionedObjectManager.prototype.controlCenter = function() { 
    return this._manager.controlCenter();
  }
  UnregisteredVersionedObjectManager.prototype.aspect = function() { 
    return this._manager.aspect();
  }
  UnregisteredVersionedObjectManager.prototype.name = function() { 
    return this._manager.name();
  }
  UnregisteredVersionedObjectManager.prototype.registerComponent = function(component: AComponent) {
    this._manager._object.__manager = this._manager;
    this._manager.registerComponent(component);
  }
}
export class VersionedObject {
  static extends<T extends VersionedObjectConstructor<VersionedObject>>(cstor: VersionedObjectConstructor<VersionedObject>, definition: any): T {
    return <any>class VersionedObjectExtended extends cstor {
      static parent = cstor;
      static definition = definition;
      static displayName = `base ${definition.name}`;
      static installAspect(cc: ControlCenter, name: string): { new(): VersionedObject } {
        return cc.cache().createAspect(cc, name, this);
      }
    }
  }

  static parent: VersionedObjectConstructor | undefined = undefined;

  static definition: Aspect.Definition = {
    is: "class",
    name: "VersionedObject",
    version: 0,
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

  constructor(manager: VersionedObjectManager<any>) {
    this.__manager = manager; // this will fill _id and _version attributes
  }

  id()     : Identifier { return this.__manager.id(); }
  version(): number { return this.__manager.localVersion(); }
  manager(): VersionedObjectManager<this> { return this.__manager; }
  controlCenter(): ControlCenter { return this.__manager.controlCenter(); }

  farCallback<O extends VersionedObject, R>(this: O, method: never, argument: any, callback: (envelop: Invocation<R>) => void) {
    Invocation.farCallback(this, method, argument, callback);
  }
  farEvent<O extends VersionedObject>(this: O, method: never, argument: any, eventName: string, onObject?: Object) {
    Invocation.farEvent(this, method, argument, eventName, onObject);
  }
  farPromise<O extends VersionedObject, R>(this: O, method: never, argument: any) : Promise<Invocation<R>> {
    return Invocation.farPromise(this, method, argument, );
  }
  farAsync<O extends VersionedObject, R>(this: O, method: never, argument: any) : (flux: Flux<{ envelop: Invocation<R> }>) => void {
    return (flux: Flux<{ envelop: Invocation<R> }>) => {
      Invocation.farAsync(flux, this, method, argument);
    };
  }

  static __c(name: string): any {}
  static __i<T extends VersionedObject>(name: string): any {}
}

Object.defineProperty(VersionedObject, "category", {
  value: function category(this: typeof VersionedObject, name: string, implementation) {
    Object.keys(implementation).forEach(k => this.prototype[k] = implementation[k]);
  }
});
Object.defineProperty(VersionedObject, "installAspect", {
  value: function installAspect(this: typeof VersionedObject, on: ControlCenter, name: string): { new(): VersionedObject } {
    return on.cache().createAspect(on, name, this);
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
  get(this: VersionedObject) { return this.__manager.localVersion(); },
});

function isEqualVersionedObject(this: VersionedObject, other, level?: number) {
  return other === this;
}
addIsEqualSupport(VersionedObject, isEqualVersionedObject);

export interface VersionedObjectConstructor<C extends VersionedObject = VersionedObject> {
  new(manager: VersionedObjectManager<C>, ...args): C;
  definition: Aspect.Definition;
  parent?: VersionedObjectConstructor<VersionedObject>;

  category(name: 'validation', implementation: VersionedObject.ImplCategories.validation);
  category(name: string, implementation: {});
}

export declare namespace VersionedObject {
  function __VersionedObject_c(n: string): {};
  function __VersionedObject_i(n: string): {};
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
