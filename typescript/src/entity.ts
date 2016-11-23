import {ControlCenter, Identifier, areEquals} from './index';

export type EntityAttributes = Map<string, any>;
export enum EntityEvent {
  Creation,
  Destruction,
  RemoteUpdate,
  LocalUpdate,
  Conflict
}
export type EntityObserver = (entity: Entity, event: EntityEvent, changes: string[], conflicts: string[], missings: string[]) => void;
export class EntityControl {
  static NoVersion = -1;
  static NextVersion = Number.MAX_SAFE_INTEGER; // 2^56 version should be more than enought
  static SafeMode = true;

  _id: Identifier;
  _entity: Entity | null;
  _controlCenter: ControlCenter;
  _definition: ControlCenter.Definition;
  _observers: Set<EntityObserver>;
  _currentAttributes: EntityAttributes;
  _baseVersion: number;
  _baseAttributes: EntityAttributes;
  _remoteVersion: number;
  _remoteAttributes: EntityAttributes;

  constructor(controlCenter: ControlCenter, definition: ControlCenter.Definition, id: Identifier, attributes: Map<string, any>, version: number) {
    this._controlCenter = controlCenter;
    this._definition = definition;
    this._observers = new Set();
    this._id = id;
    this._baseVersion = EntityControl.NoVersion;
    this._baseAttributes = new Map<string, any>();
    this._remoteVersion = version;
    this._remoteAttributes = attributes;
    this._currentAttributes = new Map<string, any>();
    this._entity = null;
  }

  init(entity: Entity) {
    this._entity = entity;
    for (let attr of this._definition.attributes) {
      Object.defineProperty(entity, attr.name, {
        writable: true,
        enumerable: true,
        get: () => {
          if (ControlCenter.isEntityType(attr))
          return this.attributeValue(attr.name);
        },
        set: (value) => {
          if (EntityControl.SafeMode && !attr.validator(value))
            throw new Error(`attribute value is invalid`);
          this.setAttributeValue(attr.name, value);
        }
      });
    }
  }

  id()     : Identifier { return this._id; }
  version(): number { return this._currentAttributes.size > 0 ? EntityControl.NextVersion : this._remoteVersion; }
  definition() { return this._definition; }

  addObserver(observer: EntityObserver) {
    this._observers.add(observer);
    this._controlCenter.entityManager.set(this._id, this._entity!);
  }

  removeObserver(observer: EntityObserver) {
    this._observers.delete(observer);
    if (this._observers.size === 0)
      this._controlCenter.entityManager.delete(this._id);
  }

  isInUse(): boolean {
    return this._observers.size > 0;
  }
  
  attributeValue(attribute: string) {
    if (this._currentAttributes.has(attribute))
      return this._currentAttributes.get(attribute);
    if (this._remoteAttributes.has(attribute))
      return this._remoteAttributes.get(attribute);
    if (this._baseAttributes.has(attribute))
      throw new Error(`attribute '${attribute}' is unaccessible due to version change`);
    throw new Error(`attribute '${attribute}' is unaccessible and never was`);
  }

  setAttributeValue(attribute: string, value) {
    if (areEquals(this._remoteAttributes.get(attribute), value)) {
      this._currentAttributes.delete(attribute);
    }
    else if (!areEquals(this._currentAttributes.get(attribute), value)) {
      this._currentAttributes.set(attribute, value);
    }
  }

  setRemoteAttributes(attributes: Map<string, any>, version: number) {
    let ret = { changes: <string[]>[], conflicts: <string[]>[], missings: <string[]>[] };
    if (version === this._remoteVersion) {
      if (EntityControl.SafeMode) {
        for (var k of attributes.keys())
          if (this._remoteAttributes.has(k) && !areEquals(this._remoteAttributes.get(k), attributes.get(k)))
            ret.conflicts.push(k);
      }
      Object.assign(this._remoteAttributes, attributes);
    }
    else {
      this._baseVersion = this._remoteVersion;
      this._baseAttributes = this._remoteAttributes;
      this._remoteAttributes = attributes;
      for (var k of this._remoteAttributes.keys()) {
        if (!this._baseAttributes.has(k) || !areEquals(this._baseAttributes.get(k), attributes.get(k)))
          ret.changes.push(k);
        if (this._currentAttributes.has(k)) {
          if (areEquals(this._currentAttributes.get(k), this._remoteAttributes.get(k)))
            this._currentAttributes.delete(k);
          else if (!areEquals(this._baseAttributes.get(k), this._remoteAttributes.get(k)))
            ret.conflicts.push(k);
        }
      }
      for (var k of this._baseAttributes.keys()) {
        if (!this._remoteAttributes.has(k))
          ret.missings.push(k);
      }
    }
    return ret;
  }
}

export class Entity {
  __control: EntityControl;

  constructor(control: EntityControl) {
    this.__control = control;
    this.__control.init(this);
  }

  id()     : Identifier { return this.__control.id();      }
  version(): number     { return this.__control.version(); }
}
