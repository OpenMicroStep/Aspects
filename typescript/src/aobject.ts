import {ControlCenter, Identifier, areEquals} from './core';

export type AObjectAttributes = Map<string, any>;
export enum AObjectEvent {
  Creation,
  Destruction,
  RemoteUpdate,
  LocalUpdate,
  Conflict
}
export type AObjectObserver = (object: AObject, event: AObjectEvent, changes: string[], conflicts: string[], missings: string[]) => void;
export class AObjectManager {
  static NoVersion = -1;
  static NextVersion = Number.MAX_SAFE_INTEGER; // 2^56 version should be more than enought
  static SafeMode = true;

  _id: Identifier;
  _object: AObject | null;
  _controlCenter: ControlCenter;
  _aspect: ControlCenter.Aspect;
  _observers: Set<AObjectObserver>;
  _localAttributes: AObjectAttributes;
  _oldVersion: number;
  _oldVersionAttributes: AObjectAttributes;
  _version: number;
  _versionAttributes: AObjectAttributes;

  constructor(controlCenter: ControlCenter, aspect: ControlCenter.Aspect, id: Identifier, attributes: Map<string, any>, version: number) {
    this._controlCenter = controlCenter;
    this._aspect = aspect;
    this._observers = new Set();
    this._id = id;
    this._oldVersion = AObjectManager.NoVersion;
    this._oldVersionAttributes = new Map<string, any>();
    this._version = version;
    this._versionAttributes = attributes;
    this._localAttributes = new Map<string, any>();
    this._object = null;
  }

  init(object: AObject) {
    this._object = object;
    for (let attr of this._aspect.definition.attributes) {
      Object.defineProperty(object, attr.name, {
        writable: true,
        enumerable: true,
        get: () => {
          if (ControlCenter.isAObjectType(attr))
            return this._controlCenter.objectsManager.get(this.attributeValue(attr.name));
          return this.attributeValue(attr.name);
        },
        set: (value) => {
          if (AObjectManager.SafeMode && !attr.validator(value))
            throw new Error(`attribute value is invalid`);
          if (ControlCenter.isAObjectType(attr))
            value = value.id();
          this.setAttributeValue(attr.name, value);
        }
      });
    }
  }

  id()     : Identifier { return this._id; }
  version(): number { return this._localAttributes.size > 0 ? AObjectManager.NextVersion : this._version; }
  definition() { return this._aspect.definition; }

  diff() : { [s: string]: any } {
    let ret = { _id: this.id(), _version: this.version() };
    this._localAttributes.forEach((v, k) => ret[k] = v);
    return ret;
  }

  snapshot() : { [s: string]: any } {
    let ret = { _id: this.id(), _version: this.version() };
    this._versionAttributes.forEach((v, k) => ret[k] = v);
    this._localAttributes.forEach((v, k) => ret[k] = v);
    return ret;
  }

  addObserver(observer: AObjectObserver) {
    this._observers.add(observer);
    this._controlCenter.objectsManager.set(this._id, this._object!);
  }

  removeObserver(observer: AObjectObserver) {
    this._observers.delete(observer);
    if (this._observers.size === 0)
      this._controlCenter.objectsManager.delete(this._id);
  }

  isInUse(): boolean {
    return this._observers.size > 0;
  }
  
  attributeValue(attribute: string) {
    if (this._localAttributes.has(attribute))
      return this._localAttributes.get(attribute);
    if (this._versionAttributes.has(attribute))
      return this._versionAttributes.get(attribute);
    if (this._oldVersionAttributes.has(attribute))
      throw new Error(`attribute '${attribute}' is unaccessible due to version change`);
    throw new Error(`attribute '${attribute}' is unaccessible and never was`);
  }

  versionAttributeValue(attribute: string) {
    if (this._versionAttributes.has(attribute))
      return this._versionAttributes.get(attribute);
    throw new Error(`attribute '${attribute}' is unaccessible and never was`);
  }

  setAttributeValue(attribute: string, value) {
    if (areEquals(this._versionAttributes.get(attribute), value)) {
      this._localAttributes.delete(attribute);
    }
    else if (!areEquals(this._localAttributes.get(attribute), value)) {
      this._localAttributes.set(attribute, value);
    }
  }

  setRemoteAttributes(attributes: Map<string, any>, version: number) {
    let ret = { changes: <string[]>[], conflicts: <string[]>[], missings: <string[]>[] };
    if (version === this._version) {
      if (AObjectManager.SafeMode) {
        for (var k of attributes.keys())
          if (this._versionAttributes.has(k) && !areEquals(this._versionAttributes.get(k), attributes.get(k)))
            ret.conflicts.push(k);
      }
      Object.assign(this._versionAttributes, attributes);
    }
    else {
      this._oldVersion = this._version;
      this._oldVersionAttributes = this._versionAttributes;
      this._versionAttributes = attributes;
      for (var k of this._versionAttributes.keys()) {
        if (!this._oldVersionAttributes.has(k) || !areEquals(this._oldVersionAttributes.get(k), attributes.get(k)))
          ret.changes.push(k);
        if (this._localAttributes.has(k)) {
          if (areEquals(this._localAttributes.get(k), this._versionAttributes.get(k)))
            this._localAttributes.delete(k);
          else if (!areEquals(this._oldVersionAttributes.get(k), this._versionAttributes.get(k)))
            ret.conflicts.push(k);
        }
      }
      for (var k of this._oldVersionAttributes.keys()) {
        if (!this._versionAttributes.has(k))
          ret.missings.push(k);
      }
    }
    return ret;
  }
}

export class AObject {
  __manager: AObjectManager;

  constructor(control: AObjectManager) {
    this.__manager = control;
    this.__manager.init(this);
  }

  id()     : Identifier { return this.__manager.id();      }
  version(): number     { return this.__manager.version(); }
  manager(): AObjectManager { return this.__manager; }
}