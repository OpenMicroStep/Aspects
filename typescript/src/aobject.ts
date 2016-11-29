import {ControlCenter, Identifier, areEquals} from './core';
import {MSTE} from '@microstep/mstools';

export type AObjectAttributes = Map<string, any>;
export class AObjectManager<AObject> {
  static NoVersion = -1;
  static NextVersion = Number.MAX_SAFE_INTEGER; // 2^56 version should be more than enought
  static SafeMode = true;
  static LocalIdCounter = 0;
  static isLocalId(id: Identifier) {
    return typeof id === "string" && id.startsWith("_localid:");
  }

  _id: Identifier;
  _object: AObject | null;
  _controlCenter: ControlCenter;
  _aspect: ControlCenter.Aspect;
  _localAttributes: AObjectAttributes;
  _oldVersion: number;
  _oldVersionAttributes: AObjectAttributes;
  _version: number;
  _versionAttributes: AObjectAttributes;

  constructor(controlCenter: ControlCenter, object: AObject) {
    this._controlCenter = controlCenter;
    this._aspect = controlCenter.getAspect(<ControlCenter.Implementation>object.constructor);
    this._id = `_localid:${++AObjectManager.LocalIdCounter}`;
    this._oldVersion = AObjectManager.NoVersion;
    this._oldVersionAttributes = new Map<string, any>();
    this._version = AObjectManager.NoVersion;
    this._versionAttributes = new Map<string, any>();
    this._localAttributes = new Map<string, any>();
    this._object = object;

    Object.defineProperty(object, '_id', {
      enumerable: true,
      get: () => { return this._id; },
      set: (value) => {
        if (AObjectManager.isLocalId(value))
          throw new Error(`cannot change identifier to a local identifier`);
        if (!AObjectManager.isLocalId(this._id)) 
          throw new Error(`cannot real identifier to another identifier`);
        this._id = value; // local -> real id (ie. object _id attribute got loaded)
      }
    });
    Object.defineProperty(object, '_version', {
      enumerable: true,
      get: () => { return this._version; },
      set: (value) => {
        if (this._version !== AObjectManager.NoVersion)
          throw new Error(`Cannot change object version directly`); 
        this._version = value; 
      }
    });
    for (let attr of this._aspect.definition.attributes) {
      Object.defineProperty(object, attr.name, {
        enumerable: true,
        get: () => {
          return this.attributeValue(attr.name);
        },
        set: (value) => {
          if (AObjectManager.SafeMode && !attr.validator(value))
            throw new Error(`attribute value is invalid`);
          if (ControlCenter.isAObjectType(attr))
            value = controlCenter.getObject(this._aspect, value.id()) || value; // value will be merged later
          this.setAttributeValue(attr.name, value);
        }
      });
    }
  }

  id()     : Identifier { return this._id; }
  version(): number { return this._localAttributes.size > 0 ? AObjectManager.NextVersion : this._version; }
  definition() { return this._aspect.definition; }
  aspect() { return this._aspect; }

  _snapshot(isDiff: boolean) : AObject { // TODO: find a better typing
    let ret = new AObjectSnapshot(this.definition().name);
    ret._id = this.id();
    ret._version= this.version();
    if (!isDiff)
      this._versionAttributes.forEach((v, k) => ret[k] = v);
    this._localAttributes.forEach((v, k) => ret[k] = v);
    return <AObject><any>ret;
  }

  diff() : AObject {
    return this._snapshot(true);
  }

  snapshot() : AObject {
    return this._snapshot(false);
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

  setVersion(version: number) {
    this._localAttributes.forEach((v, k) => this._versionAttributes.set(k, v));
    this._localAttributes.clear();
    this._version = version;
  }

  setRemote(manager: AObjectManager<AObject>) {
    this.setRemoteAttributes(manager._versionAttributes, manager._version);
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

var constructedObjects: AObject[] | null = null;
export class AObject {
  static createManager: <T extends AObject>(object: T) => AObjectManager<T>;

  static willConstructObjects(constructor: () => void, createManager?: <T extends AObject>(object: T) => AObjectManager<T>) {
    let cm = AObject.createManager;
    let ret = constructedObjects = [];
    AObject.createManager = createManager || cm;
    constructor();
    constructedObjects = null;
    AObject.createManager = cm;
    return ret;
  }

  __manager: AObjectManager<this>;
  _id: Identifier;
  _version: number;

  constructor() {
    this.__manager = AObject.createManager(this); // this will fill _id and _version attributes
    if (constructedObjects)
      constructedObjects.push(this);
  }

  id()     : Identifier { return this._id; }
  version(): number { return this._version; }
  manager(): AObjectManager<this> { return this.__manager; }

  encodeToMSTE(encoder /*: MSTE.Encoder*/) {
    // unless specified, only _id and _version are encoded
    // see manager().snapshot() and manager().diff() for variants
    encoder.encodeDictionary({ _id: this._id, _version: this._version }, this.manager().definition().name);
  }
}

class AObjectSnapshot {
  __cls: string;
  _id: Identifier;
  _version: number;
  [s: string]: any;

  constructor(cls: string) {
    Object.defineProperty(this, '__cls', {
      enumerable: false, value: cls
    });
  }
  encodeToMSTE(encoder /*: MSTE.Encoder*/) {
    encoder.encodeDictionary(this, this.__cls);
  }
}
