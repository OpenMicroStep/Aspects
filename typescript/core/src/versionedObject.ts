import {
  ControlCenter, areEquals, Identifier, Invocation, Result, Aspect, addIsEqualSupport,
  ImmutableMap, ImmutableList, AComponent,
  SafePostLoad, SafePreSave, SafePostSave,
} from './core';
import { Flux } from '@openmicrostep/async';
import { Reporter, Diagnostic, AttributePath } from '@openmicrostep/msbuildsystem.shared';
import traverse = Aspect.traverse;

// 16bits for modified, 2bits for flags, 14bits for outdated
const SAVED       = 0x00010000;
const WILL_DELETE = 0x00020000;
const FLAGS_MASK  = 0x00030000;

function _modified_get(flags: number): number {
  return flags & 0x0000FFFF; // 16bits
}
function _outdated_get(flags: number): number {
  return flags >>> 18; // 14bits
}
function _modified_set(flags: number, count: number) {
  // assert 0 <= count < 32768;
  return (flags & 0xFFFF0000) | count;
}
function _outdated_set(flags: number, count: number) {
  // assert 0 <= count < 32768
  return (flags & 0x0003FFFF) | (count << 18);
}

const NO_POSITION = -1;
const ANY_POSITION = 0;

export type InternalAttributeData = {
  flags   : number, // 16bits for modified, 2bits for flags, 14bits for outdated
  modified: any,
  saved   : any,
  outdated: any,
};

export function *traverseOrdered<T>(type: Aspect.Type, v: any) : IterableIterator<[number, T]> {
  if (v) {
    switch (type.type) {
      case 'array':
        yield* v.entries();
        break;
      case 'set':
        for (let n of v)
          yield [ANY_POSITION, n];
        break;
      case 'class':
      case 'or':
        yield [0, v];
        break;
      default: throw new Error(`unsupported traverse type ${type.type}`);
    }
  }
}

function diffOrdered<T>(type: Aspect.Type, newV: any, oldV: any) {
  let ret: [number | -1, T][] = [];
  switch (type.type) {
    case 'array':
      if (oldV) {
        for (let [idx, o] of (oldV as any[]).entries()) {
          if (!newV || newV[idx] !== o)
            ret.push([NO_POSITION, o]);
        }
      }
      if (newV) {
        for (let [idx, n] of (newV as any[]).entries()) {
          if (!oldV || oldV[idx] !== n)
            ret.push([idx, n]);
        }
      }
      break;
    case 'set':
      if (oldV) for (let o of oldV)
        if (!newV || !newV.has(o))
          ret.push([NO_POSITION, o]);
      if (newV) for (let n of newV)
        if (!oldV || !oldV.has(n))
          ret.push([ANY_POSITION, n]);
      break;
    case 'primitive':
    case 'class':
    case 'or':
      if (oldV !== newV) {
        if (oldV) ret.push([NO_POSITION, oldV]);
        if (newV) ret.push([0, newV]);
      }
      break;
    default: throw new Error(`unsupported diff type ${type.type}`);
  }

  return ret;
}

/** returns +1 if passed parameter is true, -1 otherwise */
function bool2delta(positive: boolean) : -1 | 1 {
  return positive ? +1 : -1;
}

type ParentObject = {
  manager: VersionedObjectManager,
  attribute: Aspect.InstalledAttribute,
  saved_position: number, // -1/0 for set, -1/idx for array
  modified_position: number, // -1/0 for set, -1/idx for array
  outdated_position: number, // -1/0 for set, -1/idx for array
}

export class VersionedObjectSnapshot {
  /** @internal */ _attributes: ({ value: any } | undefined)[];

  constructor(aspect: Aspect.Installed, id: Identifier) {
    this._attributes = new Array(aspect.attributes_by_index.length);
    this._attributes[0] = { value: id };
  }

  id(): Identifier {
    return this._attributes[0]!.value;
  }

  version(): number {
    let d = this._attributes[1];
    if (!d)
      throw new Error(`no version in this snapshot`);
    return d.value;
  }

  setAttributeValueFast(attribute: Aspect.InstalledAttribute, value) {
    this._attributes[attribute.index] = { value: value };
  }

  hasAttributeValueFast(attribute: Aspect.InstalledAttribute): boolean {
    return this._attributes[attribute.index] !== undefined;
  }

  attributeValueFast(attribute: Aspect.InstalledAttribute): any {
    let d = this._attributes[attribute.index];
    return d && d.value;
  }
}

export class VersionedObjectManager<T extends VersionedObject = VersionedObject> {
  static UndefinedVersion = -2;
  static NoVersion = -1;
  static SafeMode = true;
  static LocalIdCounter = 0;
  static isLocalId(id: Identifier) {
    return typeof id === "string" && id.startsWith("_localid:");
  }

  /** @internal */ _controlCenter: ControlCenter;
  /** @internal */ _aspect: Aspect.Installed;
  /** @internal */ _object: T;
  /** @internal */ _parent: ParentObject | undefined;
  /** @internal */ _components: Set<object>;

  /** @internal */ _flags: number; // 16bits for modified, 2bits for flags, 14bits for outdated
  /** @internal */ _attribute_data: InternalAttributeData[];

  constructor(controlCenter: ControlCenter, object: T) {
    this._controlCenter = controlCenter;
    this._components = new Set();
    this._flags = 0;
    this._aspect = (object.constructor as any).aspect;
    this._object = object;
    this._parent = undefined;
    let len = this._aspect.attributes_by_index.length;
    this._attribute_data = new Array(len);
    this._attribute_data[0] = { // _id
      flags   : SAVED,
      modified: undefined,
      saved   : `_localid:${++VersionedObjectManager.LocalIdCounter}`,
      outdated: undefined,
    };
    this._attribute_data[1] = { // _version
      flags   : SAVED,
      modified: undefined,
      saved   : VersionedObjectManager.NoVersion,
      outdated: undefined,
    };
    for (let idx = 2; idx < len; idx++) {
      this._attribute_data[idx] = {
        flags   : 0,
        modified: undefined,
        saved   : undefined,
        outdated: undefined,
      }
    }
  }

  // Environment
  id()     : Identifier { return this._attribute_data[0].saved; }
  version(): number { return this._attribute_data[1].saved; }
  object() { return this._object; }
  rootObject(): VersionedObject {
    if (!this.isSubObject())
      return this._object;
    else if (this._parent)
      return this._parent.manager.rootObject();
    throw new Error(`cannot find root object of sub object, the sub object is not linked to any parent object`);
  }
  controlCenter() { return this._controlCenter; }

  // Definition
  classname() { return this._aspect.classname; }
  aspect() { return this._aspect; }
  isSubObject() { return this._aspect.is_sub_object; }

  // State
  isSaved()      { return (this._flags & SAVED) > 0; }
  isNew()        { return (this._flags & FLAGS_MASK) === 0; }
  isModified()   { return _modified_get(this._flags) > 0; }
  isInConflict() { return _outdated_get(this._flags) > 0; }
  isPendingDeletion() { return (this._flags & WILL_DELETE) > 0; }

  isAttributeSaved(attribute_name: string)      { return this.isAttributeSavedFast(this._aspect.checkedAttribute(attribute_name)); }
  isAttributeModified(attribute_name: string)   { return this.isAttributeModifiedFast(this._aspect.checkedAttribute(attribute_name)); }
  isAttributeInConflict(attribute_name: string) { return this.isAttributeInConflictFast(this._aspect.checkedAttribute(attribute_name)); }

  isAttributeSavedFast(attribute: Aspect.InstalledAttribute)      { return (this._attribute_data[attribute.index].flags & SAVED) > 0; }
  isAttributeModifiedFast(attribute: Aspect.InstalledAttribute)   { return _modified_get(this._attribute_data[attribute.index].flags) > 0; }
  isAttributeInConflictFast(attribute: Aspect.InstalledAttribute) { return _outdated_get(this._attribute_data[attribute.index].flags) > 0; }

  hasAttributeValue(attribute_name: string ): boolean;
  hasAttributeValue(attribute_name: VersionedObjectManager.AttributeNames<T>): boolean;
  hasAttributeValue(attribute_name: VersionedObjectManager.AttributeNames<T>): boolean {
    return this.hasAttributeValueFast(this._aspect.checkedAttribute(attribute_name));
  }

  hasAttributeValueFast(attribute: Aspect.InstalledAttribute) {
    return this._attribute_data[attribute.index].flags > 0 || this.isNew();
  }

  // Values
  attributeValue(attribute_name: string) : any;
  attributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) : T[K];
  attributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) : T[K] {
    return this.attributeValueFast(this._aspect.checkedAttribute(attribute_name));
  }

  attributeValueFast(attribute: Aspect.InstalledAttribute): any {
    let data = this._attribute_data[attribute.index];
    if (_modified_get(data.flags))
      return data.modified;
    if (data.flags & SAVED)
      return data.saved;
    if (this.isNew())
      return this._missingValue(attribute);
    if (_outdated_get(data.flags))
      throw new Error(`attribute '${this.classname()}.${attribute.name}' is unaccessible due to version change`);
    throw new Error(`attribute '${this.classname()}.${attribute.name}' is unaccessible and never was`);
  }

  savedAttributeValue(attribute_name: string) : any;
  savedAttributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) : T[K];
  savedAttributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) : T[K] {
    return this.savedAttributeValueFast(this._aspect.checkedAttribute(attribute_name));
  }

  savedAttributeValueFast(attribute: Aspect.InstalledAttribute) : any {
    let data = this._attribute_data[attribute.index];
    if (data.flags & SAVED)
      return data.saved;
    if (this.isNew())
      return this._missingValue(attribute);
    throw new Error(`attribute '${this.classname()}.${attribute.name}' is unaccessible and never was`);
  }

  outdatedAttributeValue(attribute_name: string) : any;
  outdatedAttributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) : T[K];
  outdatedAttributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) : T[K] {
    return this.outdatedAttributeValueFast(this._aspect.checkedAttribute(attribute_name));
  }

  outdatedAttributeValueFast(attribute: Aspect.InstalledAttribute) : any {
    let data = this._attribute_data[attribute.index];
    if (_outdated_get(data.flags))
      return data.outdated;
    throw new Error(`attribute '${this.classname()}.${attribute.name}' is not in conflict`);
  }

  *modifiedAttributes() {
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      if (_modified_get(data.flags)) {
        yield { attribute: this._aspect.attributes_by_index[idx], modified: data.modified };
      }
    }
  }

  *outdatedAttributes() {
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      if (_outdated_get(data.flags)) {
        yield { attribute: this._aspect.attributes_by_index[idx], outdated: data.outdated };
      }
    }
  }

  validateAttributeValue(attribute_name: string, value: any): Diagnostic[] {
    let reporter = new Reporter();
    let attribute = this._aspect.attributes.get(attribute_name);
    let path = new AttributePath(this.classname(), '{id=', this.id(), '}.', attribute_name);
    if (!attribute)
      path.diagnostic(reporter, { is: "error", msg: `attribute doesn't exists` });
    else
      attribute.validator.validate(reporter, path, value, this);
    return reporter.diagnostics;
  }


  // Management
  setAttributeValue(attribute_name: string, value: any);
  setAttributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K, value: T[K]);
  setAttributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K, value: T[K]) {
    this.setAttributeValueFast(this._aspect.checkedAttribute(attribute_name), value);
  }

  setAttributeValueFast(attribute: Aspect.InstalledAttribute, value) {
    this._setAttributeValueFast(attribute, value, false);
  }

  resolveOutdatedAttribute(attribute_name: string) {
    this.resolveOutdatedAttributeFast(this._aspect.checkedAttribute(attribute_name));
  }

  resolveOutdatedAttributeFast(attribute: Aspect.InstalledAttribute) {
    let data = this._attribute_data[attribute.index];
    if (_outdated_get(data.flags)) {
      if (attribute.is_sub_object) {
        for (let sub_object of traverse<VersionedObject>(attribute.type, data.saved)) {
          sub_object.manager().resolveAllOutdatedAttributes();
        }
      }
      this._apply_attribute_outdated_delta(data, -1);
    }
  }

  resolveAllOutdatedAttributes() {
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let attribute = this._aspect.attributes_by_index[idx];
      this.resolveOutdatedAttributeFast(attribute);
    }
  }

  clearModifiedAttribute(attribute_name: string);
  clearModifiedAttribute<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K);
  clearModifiedAttribute<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) {
    this.clearModifiedAttributeFast(this._aspect.checkedAttribute(attribute_name));
  }

  clearModifiedAttributeFast(attribute: Aspect.InstalledAttribute) {
    if (attribute.index >= 2) {
      let data = this._attribute_data[attribute.index];
      this._clearModifiedAttribute(attribute, data);
    }
  }

  clearAllModifiedAttributes() : void {
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      let attribute = this._aspect.attributes_by_index[idx];
      this._clearModifiedAttribute(attribute, data);
    }
  }

  unloadAttribute(attribute_name: string) {
    this.unloadAttributeFast(this._aspect.checkedAttribute(attribute_name));
  }

  unloadAttributeFast(attribute: Aspect.InstalledAttribute) {
    if (attribute.index >= 2) {
      let data = this._attribute_data[attribute.index];
      this._unloadAttributeData(data);
    }
  }

  unloadAllAttributes() {
    for (let idx = 2; idx < this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      this._unloadAttributeData(data);
    }
  }

  setPendingDeletion(will_delete: boolean) {
    if (this.isSubObject())
      throw new Error(`${this.classname()}{id=${this.id()}}.setPendingDeletion(): forbidden on subobject, change the parent attribute directly`);
    if (will_delete)
      this._flags |= WILL_DELETE;
    else
      this._flags &= ~WILL_DELETE;
  }

  setId(id: Identifier) {
    let current_id = this.id();
    if (current_id === id)
      return;
    if (VersionedObjectManager.isLocalId(id))
      throw new Error(`cannot change identifier to a local identifier`);
    if (!VersionedObjectManager.isLocalId(current_id))
      throw new Error(`id can't be modified once assigned (not local)`);
    this._controlCenter._changeObjectId(this._object, current_id, id);
    this._attribute_data[0].saved = id; // local -> real id (ie. object _id attribute got loaded)
    if (this._attribute_data[1].saved === VersionedObjectManager.NoVersion)
      this._attribute_data[1].saved = VersionedObjectManager.UndefinedVersion;
    this._flags |= SAVED;
  }

  setVersion(version: number) {
    if (this.isNew())
      throw new Error(`version can't be set on a locally identifier object`);
    if (this.isInConflict())
      throw new Error(`version can't be set on a conflicted object`);
    if (this.isModified()) {
      for (let idx = 2; idx <  this._attribute_data.length; idx++) {
        let data = this._attribute_data[idx];
        if (_modified_get(data.flags)) {
          let attribute = this._aspect.attributes_by_index[idx];
          let merge_value = data.modified;
          this._setAttributeSavedValue(attribute, data, merge_value);
          data.saved = merge_value;
          data.flags |= SAVED;
        }
      }
    }
    this._attribute_data[1].saved = version;
  }

  computeMissingAttributes(snapshot: VersionedObjectSnapshot) {
    let missings: string[] = [];
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      if (data.flags > 0) {
        let attribute = this._aspect.attributes_by_index[idx];
        if (!snapshot.hasAttributeValueFast(attribute))
          missings.push(attribute.name);
      }
    }
    return missings;
  }

  mergeSavedAttributes(snapshot: VersionedObjectSnapshot) {
    // _attributes_ can't be trusted, so we need to validate _attributes_ keys and types
    let ret = { changes: <string[]>[], conflicts: <string[]>[], missings: <string[]>[] };
    let reporter = new Reporter();
    let path = new AttributePath(this.classname(), '{id=', this.id(), '}.', '');
    let version = snapshot.version();
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      let attribute = this._aspect.attributes_by_index[idx];
      let merge_data = snapshot._attributes[idx];
      let data_is_saved = (data.flags & SAVED) > 0;
      path.set(attribute.name);
      if (merge_data) {
        let merge_value = merge_data.value;
        attribute.validator.validate(reporter, path, merge_value, this);
        if (attribute.contains_vo) {
          for (let [position, sub_object] of traverseOrdered<VersionedObject>(attribute.type, merge_value)) {
            let sub_object_manager = sub_object.manager();
            this._assert_same_cc(sub_object_manager);
            if (attribute.is_sub_object)
              this._sub_object_init(sub_object_manager, attribute)
          }
        }

        let data_saved_same = data_is_saved && areEquals(data.saved, merge_value);
        if (version === this.version()) {
          if (data_is_saved && !data_saved_same) // this should not happen
            this._push_conflict(ret.conflicts, attribute.name, data);
        }
        else {
          if (!data_is_saved || !data_saved_same)
            ret.changes.push(attribute.name);
          if (_modified_get(data.flags))
            this._setAttributeSavedValue(attribute, data, merge_value);
          if (data_is_saved && !data_saved_same && _modified_get(data.flags))
            this._push_conflict(ret.conflicts, attribute.name, data);
        }
        data.saved = merge_value;
        data.flags |= SAVED;
      }
      else if (data.flags && !merge_data && version !== this.version()) {
        if (attribute.is_sub_object && data_is_saved) {
          for (let [position, sub_object] of traverseOrdered<VersionedObject>(attribute.type, data.saved)) {
            let sub_object_manager = sub_object.manager();
            sub_object_manager._parent!.saved_position = NO_POSITION;
          }
        }
        data.saved = undefined;
        data.flags &= ~SAVED;
        ret.missings.push(attribute.name);
      }
    }
    this._attribute_data[1].saved = version;
    if (reporter.failed)
      throw new Error(JSON.stringify(reporter.diagnostics, null, 2));
    return ret;
  }

  private _setAttributeSavedValue(attribute: Aspect.InstalledAttribute, data: InternalAttributeData, merge_value: any) {
    let delta = -_modified_get(data.flags);
    if (!areEquals(data.modified, merge_value))
      delta++;
    if (attribute.is_sub_object) {
      // clear saved positions
      for (let sub_object of traverse<VersionedObject>(attribute.type, data.saved)) {
        let pdata = sub_object.manager()._parent!;
        pdata.saved_position = NO_POSITION;
      }
      // set new saved positions
      for (let [position, sub_object] of traverseOrdered<VersionedObject>(attribute.type, merge_value)) {
        let pdata = sub_object.manager()._parent!;
        pdata.saved_position = position;
        pdata.modified_position = position;
        delta++; // "del" object
      }
      // update modified positions
      for (let [position, sub_object] of traverseOrdered<VersionedObject>(attribute.type, data.modified)) {
        let sub_object_manager = sub_object.manager();
        let pdata = sub_object_manager._parent!;
        delta += +sub_object_manager.isModified() + bool2delta(pdata.saved_position !== position);
        pdata.modified_position = position;
      }
    }
    if (this._apply_attribute_modified_delta(data, delta) === 0)
      data.modified = undefined;
  }

  private _push_conflict(conflicts: string[], attribute: string, data: InternalAttributeData) {
    conflicts.push(attribute);
    if (!_outdated_get(data.flags)) {
      this._apply_attribute_outdated_delta(data, +1);
      data.outdated = data.saved;
    }
  }

  fillNewObjectMissingValues() {
    if (this.isNew()) {
      for (let idx = 2; idx <  this._attribute_data.length; idx++) {
        let data = this._attribute_data[idx];
        if (data.flags === 0) {
          let attribute = this._aspect.attributes_by_index[idx];
          this.setAttributeValueFast(attribute, this._missingValue(attribute));
        }
      }
    }
  }

  // Others
  filter_anonymize(attribute_name: string, value: any)  : void;
  filter_anonymize<K extends keyof T>(attribute_name: K, value: T[K]) : void;
  filter_anonymize<K extends keyof T>(attribute_name: K, value: T[K]) {
    let data = this._attribute_data[this._aspect.checkedAttribute(attribute_name).index];
    if (_modified_get(data.flags))
      data.modified = value;
    if (data.flags & SAVED)
      data.saved = value;
    if (_outdated_get(data.flags))
      data.outdated = value;
  }

  private _unloadAttributeData(data: InternalAttributeData) {
    this._apply_attribute_modified_delta(data, -_modified_get(data.flags));
    this._apply_attribute_outdated_delta(data, -_outdated_get(data.flags));
    data.flags = 0;
    data.modified = undefined;
    data.saved = undefined;
    data.outdated = undefined;
  }

  private _missingValue(attribute: Aspect.InstalledAttribute) {
    if (attribute.type.type === "array")
      return [];
    if (attribute.type.type === "set")
      return new Set();
    return undefined;
  }

  private _assert_same_cc(sub_object_manager: VersionedObjectManager) {
    if (sub_object_manager.controlCenter() !== this.controlCenter())
      throw new Error(`you can't mix objects of different control centers`);
  }

  private _clearModifiedAttribute(attribute: Aspect.InstalledAttribute, data: InternalAttributeData) {
    let modified = _modified_get(data.flags);
    if (modified) {
      if (data.flags & SAVED) {
        this.setAttributeValueFast(attribute, data.saved);
        if (attribute.is_sub_object) {
          for (let sub_object of traverse<VersionedObject>(attribute.type, data.saved)) {
            sub_object.manager().clearAllModifiedAttributes();
          }
        }
      }
      else {
        this._updateAttribute(attribute, data, -1, undefined, data.modified, false);
      }
    }
  }

  private _setAttributeValueFast(attribute: Aspect.InstalledAttribute, value, is_relation) {
    let hasChanged = false;
    let delta: 0 | 1 | -1 = 0;
    let oldValue;
    let data = this._attribute_data[attribute.index];
    let isSaved = (data.flags & SAVED) === SAVED;
    let isModified = _modified_get(data.flags) > 0;
    if (!isSaved && !this.isNew())
      throw new Error(`attribute '${this.classname()}.${attribute.name}' is unaccessible and never was`);
    if (isSaved && areEquals(data.saved, value)) {
      if (isModified) {
        oldValue = data.modified;
        delta = -1;
        hasChanged = true;
      }
    }
    else if (!isModified || !areEquals(data.modified, value)) {
      if (isModified)
        oldValue = data.modified;
      else {
        delta = +1;
        oldValue = data.saved;
      }
      hasChanged = true;
    }

    if (hasChanged)
      this._updateAttribute(attribute, data, delta, value, oldValue, is_relation);
  }

  private _updateAttribute(attribute: Aspect.InstalledAttribute, data: InternalAttributeData, delta: -1 | 0 | 1, value, oldValue, is_relation: boolean) {
    if (attribute.contains_vo && !is_relation) {
      let diffs = diffOrdered<VersionedObject>(attribute.type, value, oldValue);
      for (let [position, sub_object] of diffs) {
        let sub_object_manager = sub_object.manager();
        let is_add = position !== NO_POSITION;
        this._assert_same_cc(sub_object_manager);
        if (attribute.is_sub_object) {
          let pdata = this._sub_object_init(sub_object_manager, attribute);
          if (is_add) {
            if (pdata.modified_position !== NO_POSITION)
              throw new Error(`a sub object is only assignable to one parent/attribute (duplication detected in the same attribute)`);
            delta += +sub_object_manager.isModified() + bool2delta(pdata.saved_position !== position);
          }
          else {
            delta += -sub_object_manager.isModified() - bool2delta(pdata.modified_position !== pdata.saved_position);
          }
          pdata.modified_position = position;
        }
        else if (attribute.relation) {
          let relation = attribute.relation.attribute;
          if (sub_object_manager.hasAttributeValueFast(relation)) {
            let v = sub_object_manager.attributeValueFast(relation);
            switch (relation.type.type) {
              case 'set':   v = new Set<VersionedObject>(v); v[is_add ? 'add' : 'delete'](this._object); break;
              case 'class': v = is_add ? this._object : undefined; break;
              default: throw new Error(`unsupported relation destination type ${relation.type.type}`);
            }
            sub_object_manager._setAttributeValueFast(relation, v, true);
          }
        }
      }
    }
    if (this._apply_attribute_modified_delta(data, delta) === 0)
      data.modified = undefined;
    else
      data.modified = value;
  }

  private _sub_object_init(sub_object_manager: VersionedObjectManager, attribute: Aspect.InstalledAttribute) {
    if (!sub_object_manager._parent) {
      sub_object_manager._parent = {
        manager: this,
        attribute: attribute,
        saved_position: NO_POSITION,
        modified_position: NO_POSITION,
        outdated_position: NO_POSITION,
      };
    }
    else if (sub_object_manager._parent.manager !== this || sub_object_manager._parent.attribute !== attribute)
      throw new Error(`a sub object is only assignable to one parent/attribute`);
    return sub_object_manager._parent;
  }

  private _apply_attribute_modified_delta(data: InternalAttributeData, delta: number) {
    let previous_value = _modified_get(data.flags);
    let new_value = previous_value + delta;
    data.flags = _modified_set(data.flags, new_value);
    if ((previous_value === 0) !== (new_value === 0))
      this._apply_object_modified_delta(bool2delta(new_value > 0));
    return new_value;
  }

  private _apply_object_modified_delta(delta: number) {
    let previous_value = _modified_get(this._flags);
    let new_value = previous_value + delta;
    this._flags = _modified_set(this._flags, new_value);
    if (this._parent && (previous_value === 0) !== (new_value === 0)) {
      let pm = this._parent.manager;
      let pa = this._parent.attribute;
      let pdata = pm._attribute_data[pa.index];
      let pprevious_value = _modified_get(pdata.flags);
      let pnew_value = pm._apply_attribute_modified_delta(pdata, delta);
      if (pnew_value === 0)
        pdata.modified = undefined;
      else if (pprevious_value === 0) // assert (pdata.flags & saved) > 0
        pdata.modified = pdata.saved;
    }
  }

  private _apply_attribute_outdated_delta(data: InternalAttributeData, delta: number) {
    let previous_value = _outdated_get(data.flags);
    let new_value = previous_value + delta;
    data.flags = _outdated_set(data.flags, new_value);
    if ((previous_value === 0) !== (new_value === 0))
      this._apply_object_outdated_delta(bool2delta(new_value > 0));
    return new_value;
  }

  private _apply_object_outdated_delta(delta: number) {
    let previous_value = _outdated_get(this._flags);
    let new_value = previous_value + delta;
    this._flags = _outdated_set(this._flags, new_value);
    if (this._parent && (previous_value === 0) !== (new_value === 0)) {
      let pm = this._parent.manager;
      let pa = this._parent.attribute;
      let pdata = pm._attribute_data[pa.index];
      let pprevious_value = _outdated_get(pdata.flags);
      let pnew_value = pm._apply_attribute_outdated_delta(pdata, delta);
      if (pnew_value === 0)
        pdata.outdated = undefined;
      else if (pprevious_value === 0) // assert (pdata.flags & saved) > 0
        pdata.outdated = pdata.saved;
    }
  }
}
export namespace VersionedObjectManager {
  export namespace _ {
    export type Bool = 'true' | 'false'

    export type Not<X extends Bool> = {
        true: 'false',
        false: 'true'
    }[X]

    export type HaveIntersection<S1 extends string, S2 extends string> = (
        { [K in S1]: 'true' } &
        { [key: string]: 'false' }
    )[S2]

    export type IsNeverWorker<S extends string> = (
        { [K in S]: 'false' } &
        { [key: string]: 'true' }
    )[S]

    // Worker needed because of https://github.com/Microsoft/TypeScript/issues/18118
    export type IsNever<T extends string> = Not<HaveIntersection<IsNeverWorker<T>, 'false'>>

    export type IsFunction<T> = IsNever<keyof T>

    export type NonFunctionProps<T> = {
        [K in keyof T]: {
            'false': K,
            'true': never
        }[IsFunction<T[K]>]
    }[keyof T]  | '_id' | '_version' // leak __manager in core
  }

  export type AttributeNames<T extends VersionedObject> = _.NonFunctionProps<T>;
  export type ROAttributes<T extends VersionedObject> = ImmutableMap<AttributeNames<T>, T[AttributeNames<T>]>;

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
