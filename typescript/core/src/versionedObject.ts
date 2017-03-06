import {ControlCenter, Identifier, areEquals, Invocation, Invokable, Aspect, createAspect, addIsEqualSupport, addReplaceInGraphSupport, replaceInGraph} from './core';
import { Flux } from '@microstep/async';
import {MSTE} from '@microstep/mstools';

export type VersionedObjectAttributes<T extends VersionedObject> = Map<keyof T, any>;
export class VersionedObjectManager<T extends VersionedObject> {
  static NoVersion = -1;
  static DeletedVersion = -2;
  static NextVersion = Number.MAX_SAFE_INTEGER; // 2^56 version should be more than enought
  static SafeMode = true;
  static LocalIdCounter = 0;
  static isLocalId(id: Identifier) {
    return typeof id === "string" && id.startsWith("_localid:");
  }

  _id: Identifier;
  _controlCenter: ControlCenter;
  _aspect: Aspect.Installed;

  _localAttributes: VersionedObjectAttributes<T>;
  _version: number;
  _versionAttributes: VersionedObjectAttributes<T>;
  _oldVersion: number;
  _oldVersionAttributes: VersionedObjectAttributes<T>;

  constructor(controlCenter: ControlCenter, aspect: Aspect.Installed) {
    this._controlCenter = controlCenter;
    this._id = `_localid:${++VersionedObjectManager.LocalIdCounter}`;
    this._localAttributes = new Map();
    this._version = VersionedObjectManager.NoVersion;
    this._versionAttributes = new Map();
    this._oldVersion = VersionedObjectManager.NoVersion;
    this._oldVersionAttributes = new Map();
    this._aspect = aspect;
  }

  id()     : Identifier { return this._id; }
  version(): number { return this._localAttributes.size > 0 ? VersionedObjectManager.NextVersion : this._version; }
  controlCenter() { return this._controlCenter; }
  name() { return this._aspect.name; }
  aspect() { return this._aspect; }

  setId(id: Identifier) {
    if (this._id === id)
      return;
    if (VersionedObjectManager.isLocalId(id))
      throw new Error(`cannot change identifier to a local identifier`);
    if (!VersionedObjectManager.isLocalId(this._id)) 
      throw new Error(`id can't be modified once assigned (not local)`);
    this._controlCenter.changeObjectId(this._id, id);
    this._id = id; // local -> real id (ie. object _id attribute got loaded)
  }

  setVersion(version: number) {
    this._localAttributes.forEach((v, k) => this._versionAttributes.set(k, v));
    this._localAttributes.clear();
    this._version = version;
  }

  private assertHasAttribute(attribute: string): keyof T {
    if (VersionedObjectManager.SafeMode && !this._aspect.attributes.get(attribute))
      throw new Error(`attribute ${attribute} doesn't exitst in ${this.name()}`);
    return attribute as keyof T;
  }

  initWithMSTEDictionary(d) {
    this._id = d._id;
    this._version = d._version;
    for (var k in d._localAttributes)
      this._localAttributes.set(this.assertHasAttribute(k), d._localAttributes[k]);
    for (var k in d._versionAttributes)
      this._versionAttributes.set(this.assertHasAttribute(k), d._versionAttributes[k]);
  }

  hasChanges() {
    return this._localAttributes.size > 0;
  }

  diff() : VersionedObjectSnapshot<T> {
    let ret = new VersionedObjectSnapshot(this);
    this._localAttributes.forEach((v, k) => {
      ret._localAttributes[k] = v;
      if (this._versionAttributes.has(k))
        ret._versionAttributes[k] = this._versionAttributes.get(k);
    });
    return ret;
  }

  snapshot() : VersionedObjectSnapshot<T> {
    let ret = new VersionedObjectSnapshot(this);
    this._versionAttributes.forEach((v, k) => ret._versionAttributes[k] = v);
    this._localAttributes.forEach((v, k) => ret._localAttributes[k] = v);
    return ret;
  }

  hasAttributeValue<K extends keyof T>(attribute: K) : boolean {
    return attribute === '_id' || attribute === '_version' || this._localAttributes.has(attribute) || this._versionAttributes.has(attribute);
  }
  
  attributeValue<K extends keyof T>(attribute: K) : T[K] {
    if (this._localAttributes.has(attribute))
      return this._localAttributes.get(attribute);
    if (this._versionAttributes.has(attribute))
      return this._versionAttributes.get(attribute);
    if (this._oldVersionAttributes.has(attribute))
      throw new Error(`attribute '${attribute}' is unaccessible due to version change`);
    throw new Error(`attribute '${attribute}' is unaccessible and never was`);
  }

  setAttributeValue<K extends keyof T>(attribute: K, value: T[K]) {
    if (areEquals(this._versionAttributes.get(attribute), value)) {
      this._localAttributes.delete(attribute);
    }
    else if (!areEquals(this._localAttributes.get(attribute), value)) {
      this._localAttributes.set(attribute, value);
    }
  }

  versionAttributeValue<K extends keyof T>(attribute: K) : T[K] {
    if (this._versionAttributes.has(attribute))
      return this._versionAttributes.get(attribute);
    throw new Error(`attribute '${attribute}' is unaccessible and never was`);
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

export class VersionedObject implements MSTE.Decodable {
  static extends<T extends VersionedObjectConstructor<VersionedObject>>(cstor: VersionedObjectConstructor<VersionedObject>, definition: any): T {
    return <any>class VersionedObjectExtended extends cstor {
      static parent = cstor;
      static definition = definition;
      static displayName = `base ${definition.name}`;
      static category(name: string, implementation: any, on?: VersionedObjectConstructor<VersionedObject>) {
        on = on || this;
        Object.keys(implementation).forEach(k => this.prototype[k] = implementation[k]);
      }
      static installAspect(on: ControlCenter, name: string): { new(): VersionedObject } {
        return createAspect(on, name, this);
      }
      static __c() {}
      static __i() {}
    }
  }
  static cluster<P extends VersionedObjectConstructor<VersionedObject>>(cstor: { new(manager: VersionedObjectManager<VersionedObject>): VersionedObject }, parent: P): P {
    let c = cstor as any;
    c.parent = parent;
    c.definition = Object.assign({}, parent.definition, { name: cstor.name });
    c.installAspect = function(this: VersionedObjectConstructor<VersionedObject>, on: ControlCenter, name: string) : { new(): VersionedObject } {
      return createAspect(on, name, this);
    };
    return cstor as P;
  }

  static parent = undefined;

  static definition: Aspect.Definition = {
    name: "VersionedObject",
    version: 0,
    attributes: [],
    categories: [],
    farCategories: [],
    aspects: []
  };

  __manager: VersionedObjectManager<this>;
  readonly _id: Identifier;  // virtual attribute handled by the manager
  readonly _version: number; // virtual attribute handled by the manager

  constructor(manager: VersionedObjectManager<any>) {
    this.__manager = manager; // this will fill _id and _version attributes
  }

  initWithMSTEDictionary(d) {
    this.manager().initWithMSTEDictionary(d);
  }

  encodeToMSTE(encoder: MSTE.Encoder) {
    // unless specified, only _id and _version are encoded
    // see manager().snapshot() and manager().diff() for variants
    this.manager().snapshot().encodeToMSTE(encoder); // TODO: remove this implementation with the correct one as soon as possible
  }

  id()     : Identifier { return this.__manager._id; }
  version(): number { return this.__manager._version; }
  manager(): VersionedObjectManager<this> { return this.__manager; }
  controlCenter(): ControlCenter { return this.__manager._controlCenter; }

  farCallback<O extends VersionedObject, R>(this: O, method: string, argument: any, callback: (envelop: Invocation<O, R>) => void) {
    new Invocation(this, method, argument).farCallback(callback);
  }
  farEvent<O extends VersionedObject>(this: O, method: string, argument: any, eventName: string, onObject?: Object) {
    new Invocation(this, method, argument).farEvent(eventName, onObject);
  }
  farPromise<O extends VersionedObject, R>(this: O, method: string, argument: any) : Promise<Invocation<O, R>> {
    return new Invocation(this, method, argument).farPromise();
  }
  farAsync<O extends VersionedObject, R>(this: O, method: string, argument: any) : (flux: Flux<{ envelop: Invocation<O, R> }>) => void {
    let invocation = new Invocation(this, method, argument);
    return (flux: Flux<{ envelop: Invocation<O, R> }>) => {
      invocation.farAsync(flux);
    };
  }
}
Object.defineProperty(VersionedObject.prototype, '_id', {
  enumerable: true,
  get(this: VersionedObject) { return this.__manager._id; },
});
Object.defineProperty(VersionedObject.prototype, '_version', {
  enumerable: true,
  get(this: VersionedObject) { return this.__manager._version; },
});

export class VersionedObjectSnapshot<T extends VersionedObject> {
  __cls: string;
  _id: Identifier;
  _version: number;
  _localAttributes: { [s: string]: any };
  _versionAttributes: { [s: string]: any };

  constructor(o: VersionedObjectManager<T>) {
    Object.defineProperty(this, '__cls', {
      enumerable: false, value: o.name()
    });
    this._version = o.version();
    this._id = o.id();
    this._localAttributes = {};
    this._versionAttributes = {};
  }
  encodeToMSTE(encoder /*: MSTE.Encoder*/) {
    encoder.encodeDictionary(this, this.__cls);
  }
}

function isEqualVersionedObject(this: VersionedObject, other, level?: number) {
  return other === this;
}
addIsEqualSupport(VersionedObject, isEqualVersionedObject);

function VersionedObject_replaceInGraph(this: VersionedObject, replacer: (object) => any, done: Set<any>) {
  let manager = this.manager();
  manager._localAttributes.forEach((v,k) => {
    let v2 = replaceInGraph(v, replacer, done);
    if (v2 !== v)
        manager._localAttributes.set(k, v2);
  });
  manager._versionAttributes.forEach((v,k) => {
    let v2 = replaceInGraph(v, replacer, done);
    if (v2 !== v)
        manager._versionAttributes.set(k, v2);
  });
}
addReplaceInGraphSupport(VersionedObject, VersionedObject_replaceInGraph);

export interface VersionedObjectConstructor<C extends VersionedObject> {
    new(manager: VersionedObjectManager<C>): C;
    definition: Aspect.Definition;
    parent?: VersionedObjectConstructor<VersionedObject>;
}