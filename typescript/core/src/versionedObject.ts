import {
  ControlCenter, areEquals, Identifier, Invocation, Result, Aspect, addIsEqualSupport,
  ImmutableMap, ImmutableList, AComponent,
  SafePostLoad, SafePreSave, SafePostSave,
} from './core';
import { Flux } from '@openmicrostep/async';
import { Reporter, Diagnostic, AttributePath } from '@openmicrostep/msbuildsystem.shared';

/*
{
  modified_sub_count: 15 // [0, 32768[
  is_modified: 1
  is_saved: 1
  is_pending_deletion: 1
  is_outdated: 1
  outdated_sub_count: 13 // [0, 8192[
}
 */
const SAVED            = 0x00010000;
const PENDING_DELETION = 0x00020000;
const FLAGS_MASK       = 0x00030000;
const MODIFIED_DIRECT  = 0x00008000;
const OUTDATED_DIRECT  = 0x00040000;
const HAS_VALUE        = 0x0003FFFF;
const MODIFIED_MASK    = 0x0000FFFF;
const OUTDATED_MASK    = 0xFFFC0000;

function _set_delta(flags: number, delta: number, flag: number) {
  if (delta > 0)
    return flags | flag;
  if (delta < 0)
    return flags & ~flag;
  return flags;
}
function _modified_sub_count(flags: number): number {
  return flags & 0x00007FFF;
}
function _modified_sub_delta(flags: number, delta: number) {
  return flags + delta;
}
function _outdated_sub_count(flags: number): number {
  return flags >> 19;
}
function _outdated_sub_delta(flags: number, count: number) {
  return (flags & 0x0007FFFF) + (count << 19);
}

const NO_POSITION = -1;
const ANY_POSITION = 0;

export type InternalAttributeData = {
  flags   : number,
  modified: any,
  saved   : any,
  outdated: any,
};

/** returns +1 if passed parameter is true, -1 otherwise */
function bool2delta(positive: boolean) : -1 | 1 {
  return positive ? +1 : -1;
}

type ParentObject = {
  manager: VersionedObjectManager,
  attribute: Aspect.InstalledAttribute,
  saved_position: number, // -1/0 for set, -1/idx for array
  modified_position: number, // -1/0 for set, -1/idx for array
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

const DeletedVersion = Number.MAX_SAFE_INTEGER;
const UndefinedVersion = Number.MAX_SAFE_INTEGER - 1;
export class VersionedObjectManager<T extends VersionedObject = VersionedObject> {
  static DeletedVersion = DeletedVersion;
  static UndefinedVersion = UndefinedVersion;
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

  /** @internal */ _flags: number;
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
  isModified()   { return (this._flags & MODIFIED_MASK) > 0; }
  isInConflict() { return (this._flags & OUTDATED_MASK) > 0; }
  isPendingDeletion() { return (this._flags & PENDING_DELETION) > 0; }
  isDeleted() { return this.version() === DeletedVersion; }

  isAttributeSaved(attribute_name: string)      { return this.isAttributeSavedFast(this._aspect.checkedAttribute(attribute_name)); }
  isAttributeModified(attribute_name: string)   { return this.isAttributeModifiedFast(this._aspect.checkedAttribute(attribute_name)); }
  isAttributeInConflict(attribute_name: string) { return this.isAttributeInConflictFast(this._aspect.checkedAttribute(attribute_name)); }

  isAttributeSavedFast(attribute: Aspect.InstalledAttribute)      { return (this._attribute_data[attribute.index].flags & SAVED) > 0; }
  isAttributeModifiedFast(attribute: Aspect.InstalledAttribute)   { return (this._attribute_data[attribute.index].flags & MODIFIED_MASK) > 0; }
  isAttributeInConflictFast(attribute: Aspect.InstalledAttribute) { return (this._attribute_data[attribute.index].flags & OUTDATED_MASK) > 0; }

  hasAttributeValue(attribute_name: string ): boolean;
  hasAttributeValue(attribute_name: VersionedObjectManager.AttributeNames<T>): boolean;
  hasAttributeValue(attribute_name: VersionedObjectManager.AttributeNames<T>): boolean {
    return this.hasAttributeValueFast(this._aspect.checkedAttribute(attribute_name));
  }

  hasAttributeValueFast(attribute: Aspect.InstalledAttribute) {
    return (this._attribute_data[attribute.index].flags & HAS_VALUE) > 0 || this.isNew();
  }

  // Values
  attributeValue(attribute_name: string) : any;
  attributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) : T[K];
  attributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) : T[K] {
    return this.attributeValueFast(this._aspect.checkedAttribute(attribute_name));
  }

  attributeValueFast(attribute: Aspect.InstalledAttribute): any {
    let data = this._attribute_data[attribute.index];
    if (data.flags & MODIFIED_MASK)
      return data.modified;
    if (data.flags & SAVED)
      return data.saved;
    if (this.isNew())
      return this._missingValue(attribute);
    throw new Error(`attribute '${this.classname()}.${attribute.name}' is not loaded`);
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
    throw new Error(`attribute '${this.classname()}.${attribute.name}' is not loaded`);
  }

  outdatedAttributeValue(attribute_name: string) : any;
  outdatedAttributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) : T[K];
  outdatedAttributeValue<K extends VersionedObjectManager.AttributeNames<T>>(attribute_name: K) : T[K] {
    return this.outdatedAttributeValueFast(this._aspect.checkedAttribute(attribute_name));
  }

  outdatedAttributeValueFast(attribute: Aspect.InstalledAttribute) : any {
    let data = this._attribute_data[attribute.index];
    if (data.flags & OUTDATED_MASK)
      return data.outdated;
    throw new Error(`attribute '${this.classname()}.${attribute.name}' is not in conflict`);
  }

  *attributes() {
    for (let idx = 2; idx <  this._attribute_data.length; idx++)
      yield this._aspect.attributes_by_index[idx];
  }

  *modifiedAttributes() {
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      if (data.flags & MODIFIED_MASK)
        yield { attribute: this._aspect.attributes_by_index[idx], modified: data.modified };
    }
  }

  *outdatedAttributes() {
    for (let idx = 2; idx < this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      if (data.flags & OUTDATED_MASK) {
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
    if (data.flags & OUTDATED_MASK) {
      if (attribute.is_sub_object) {
        for (let sub_object of attribute.traverseValue<VersionedObject>(data.saved)) {
          sub_object.manager().resolveAllOutdatedAttributes();
        }
      }
      if (data.flags & OUTDATED_DIRECT)
        this._apply_attribute_outdated_delta(data, -1, 0, false, undefined);
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
      this._unloadAttributeData(attribute, data);
    }
  }

  unloadAllAttributes() {
    for (let idx = 2; idx < this._attribute_data.length; idx++) {
      let attribute = this._aspect.attributes_by_index[idx];
      let data = this._attribute_data[idx];
      this._unloadAttributeData(attribute, data);
    }
  }

  setPendingDeletion(will_delete: boolean) {
    if (VersionedObjectManager.isLocalId(this.id()))
      throw new Error(`cannot set pending deletion on locally identified objects`);
    if (this.isSubObject())
      throw new Error(`cannot set pending deletion on sub-objects, change the parent attribute directly`);
    if (this.isDeleted())
      throw new Error(`cannot set pending deletion on a deleted object`);
    if (will_delete)
      this._flags |= PENDING_DELETION;
    else
      this._flags &= ~PENDING_DELETION;
  }

  setSavedIdVersion(id: Identifier, version: number) {
    this._setId(id);
    if (this.isInConflict())
      throw new Error(`version can't be set on a conflicted object`);
    if (this.isDeleted())
      throw new Error(`version can't be set on a deleted object`);
    if (!this._setSpecialVersion(version)) {
      let is_new = this.isNew();
      if (this.isModified() || is_new) {
        for (let idx = 2; idx <  this._attribute_data.length; idx++) {
          let data = this._attribute_data[idx];
          if (data.flags & MODIFIED_MASK) {
            let attribute = this._aspect.attributes_by_index[idx];
            this._setAttributeSavedValue(attribute, data, data.modified);
          }
          else if (is_new) {
            let attribute = this._aspect.attributes_by_index[idx];
            this._setAttributeSavedValue(attribute, data, this._missingValue(attribute));
          }
        }
      }
    }
    this._applyVersion(version);
  }

  computeMissingAttributes(snapshot: VersionedObjectSnapshot): string[] {
    let missings: string[] = [];
    let this_version = this.version();
    let snapshot_version = snapshot.version();
    if (this_version !== snapshot_version && snapshot_version !== UndefinedVersion && this_version !== UndefinedVersion) {
      for (let idx = 2; idx <  this._attribute_data.length; idx++) {
        let data = this._attribute_data[idx];
        if (data.flags > 0) {
          let attribute = this._aspect.attributes_by_index[idx];
          if (!snapshot.hasAttributeValueFast(attribute))
            missings.push(attribute.name);
        }
      }
    }
    return missings;
  }

  mergeSavedAttributes(snapshot: VersionedObjectSnapshot) {
    // _attributes_ can't be trusted, so we need to validate _attributes_ keys and types
    this._setId(snapshot.id());
    let ret = { changes: <string[]>[], conflicts: <string[]>[], missings: <string[]>[] };
    let version = snapshot.version();
    if (!this._setSpecialVersion(version)) {
      let reporter = new Reporter();
      let path = new AttributePath(this.classname(), '{id=', this.id(), '}.', '');
      for (let idx = 2; idx < this._attribute_data.length; idx++) {
        let data = this._attribute_data[idx];
        let attribute = this._aspect.attributes_by_index[idx];
        let merge_data = snapshot._attributes[idx];
        let data_is_saved = (data.flags & SAVED) > 0;
        path.set(attribute.name);
        if (merge_data) {
          let merge_value = merge_data.value;
          attribute.validator.validate(reporter, path, merge_value, this);
          if (attribute.contains_vo) {
            for (let [position, sub_object] of attribute.traverseValueOrdered<VersionedObject>(merge_value)) {
              let sub_object_manager = sub_object.manager();
              this._assert_same_cc(sub_object_manager);
              if (attribute.is_sub_object)
                this._sub_object_init(sub_object_manager, attribute)
            }
          }

          let data_saved_same = data_is_saved && areEquals(data.saved, merge_value);
          if (!data_saved_same) {
            if (data_is_saved && (data.flags & MODIFIED_DIRECT) && !areEquals(data.modified, merge_value) && !(data.flags & OUTDATED_DIRECT)) {
              ret.conflicts.push(attribute.name);
              this._apply_attribute_outdated_delta(data, +1, 0, true, data.saved);
            }
            else if ((data.flags & OUTDATED_DIRECT) && areEquals(data.outdated, merge_value)) {
              this._apply_attribute_outdated_delta(data, -1, 0, false, undefined);
            }
            ret.changes.push(attribute.name);
            this._setAttributeSavedValue(attribute, data, merge_value);
          }
        }
        else if (data.flags && version !== this.version()) {
          this._unloadAttributeData(attribute, data); // quite a big deal...
          ret.missings.push(attribute.name);
        }
      }
      if (reporter.failed)
        throw new Error(JSON.stringify(reporter.diagnostics, null, 2));
    }

    this._applyVersion(version);
    return ret;
  }

  private _setId(id: Identifier) {
    if (VersionedObjectManager.isLocalId(id))
      throw new Error(`cannot change identifier to a local identifier`);
    let current_id = this.id();
    if (current_id === id)
      return;
    if (!VersionedObjectManager.isLocalId(current_id))
      throw new Error(`id can't be modified once assigned (not local)`);
    this._controlCenter._changeObjectId(this._object, current_id, id);
    this._attribute_data[0].saved = id; // local -> real id (ie. object _id attribute got loaded)
  }

  private _setSpecialVersion(version: number): boolean {
    if (version === DeletedVersion) {
      this._setDeleted();
      return true;
    }
    else if (version === UndefinedVersion) {
      return true;
    }
    else if (version >= 0) {
      return false;
    }
    else {
      throw new Error(`version must be >= 0`);
    }
  }

  private _applyVersion(version: number) {
    let data = this._attribute_data[1];
    if (version !== UndefinedVersion || this.isNew()) {
      data.saved = version;
      this._flags |= SAVED;
    }
  }

  private _setAttributeSavedValue(attribute: Aspect.InstalledAttribute, data: InternalAttributeData, merge_value: any) {
    let delta = -_modified_sub_count(data.flags);
    if (attribute.is_sub_object) {
      let one_if_modified = (data.flags & MODIFIED_DIRECT) ? 1 : 0;
      // clear saved positions
      for (let sub_object of attribute.traverseValue<VersionedObject>(data.saved)) {
        let pdata = sub_object.manager()._parent;
        if (pdata)
          pdata.saved_position = NO_POSITION;
      }
      // set new saved positions
      for (let [position, sub_object] of attribute.traverseValueOrdered<VersionedObject>(merge_value)) {
        let pdata = sub_object.manager()._parent!;
        pdata.saved_position = position;
        pdata.modified_position = position;
        delta += one_if_modified; // "del" object
      }
      // update modified positions
      for (let [position, sub_object] of attribute.traverseValueOrdered<VersionedObject>(data.modified)) {
        let sub_object_manager = sub_object.manager();
        let pdata = sub_object_manager._parent!;
        delta += +sub_object_manager.isModified() + bool2delta(pdata.saved_position !== position);
        pdata.modified_position = position;
      }
    }
    this._apply_attribute_modified_delta(data, areEquals(data.modified, merge_value) ? -1 : 0, delta, false, undefined);
    data.saved = merge_value;
    data.flags |= SAVED;
  }

  // Others
  filter_anonymize(attribute_name: string, value: any)  : void;
  filter_anonymize<K extends keyof T>(attribute_name: K, value: T[K]) : void;
  filter_anonymize<K extends keyof T>(attribute_name: K, value: T[K]) {
    let attribute = this._aspect.checkedAttribute(attribute_name);
    let data = this._attribute_data[attribute.index];
    if (this.isAttributeModifiedFast(attribute))
      data.modified = value;
    if (this.isAttributeSavedFast(attribute))
      data.saved = value;
    if (this.isAttributeInConflictFast(attribute))
      data.outdated = value;
  }

  private *_sub_objects(attribute: Aspect.InstalledAttribute, data: InternalAttributeData) {
    if (data.flags & MODIFIED_DIRECT)
      yield* attribute.traverseValue<VersionedObject>(data.modified);
    if (data.flags & SAVED)
      yield* attribute.traverseValue<VersionedObject>(data.saved);
    if (data.flags & OUTDATED_MASK)
      yield* attribute.traverseValue<VersionedObject>(data.outdated);
  }

  private _setDeleted() {
    for (let idx = 2; idx < this._attribute_data.length; idx++) {
      let attribute = this._aspect.attributes_by_index[idx];
      let data = this._attribute_data[idx];
      if (attribute.is_sub_object) {
        for (let sub_object of this._sub_objects(attribute, data)) {
          let manager = sub_object.manager();
          manager._setDeleted();
          manager._parent!.modified_position = NO_POSITION;
          manager._parent!.saved_position = NO_POSITION;
        }
      }
      if (data.flags & MODIFIED_MASK) {
        this._apply_attribute_outdated_delta(data, +1, 0, true, data.modified);
        this._apply_attribute_modified_delta(data, -1, -_modified_sub_count(data.flags), false, undefined);
      }
      data.flags &= ~SAVED;
      data.saved = undefined;
    }
    this._flags &= ~PENDING_DELETION;
  }

  private _unloadAttributeData(attribute: Aspect.InstalledAttribute, data: InternalAttributeData) {
    if (attribute.is_sub_object) {
      for (let sub_object of this._sub_objects(attribute, data)) {
        let manager = sub_object.manager();
        manager._parent!.modified_position = NO_POSITION;
        manager._parent!.saved_position = NO_POSITION;
        manager.unloadAllAttributes();
      }
    }
    this._apply_attribute_modified_delta(data, -1, -_modified_sub_count(data.flags), false, undefined);
    this._apply_attribute_outdated_delta(data, -1, -_outdated_sub_count(data.flags), false, undefined);
    data.flags &= ~SAVED;
    data.saved = undefined;
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
    if (data.flags & MODIFIED_MASK) {
      if (data.flags & SAVED) {
        if (data.flags & MODIFIED_DIRECT)
          this.setAttributeValueFast(attribute, data.saved);
        if (attribute.is_sub_object) {
          for (let sub_object of attribute.traverseValue<VersionedObject>(data.saved)) {
            sub_object.manager().clearAllModifiedAttributes();
          }
        }
      }
      else {
        if (attribute.is_sub_object) {
          for (let sub_object of attribute.traverseValue<VersionedObject>(data.modified)) {
            sub_object.manager().clearAllModifiedAttributes();
          }
        }
        if (data.flags & MODIFIED_DIRECT)
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
    let isModified = (data.flags & MODIFIED_DIRECT) > 0;
    if (!isSaved && !this.isNew())
      throw new Error(`attribute '${this.classname()}.${attribute.name}' is not loaded`);
    if (isSaved && areEquals(data.saved, value)) {
      if ((data.flags & MODIFIED_DIRECT)) {
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

    if (hasChanged) {
      this._updateAttribute(attribute, data, delta, value, oldValue, is_relation);
      if ((data.flags & OUTDATED_DIRECT) && areEquals(value, data.outdated)) {
        this._apply_attribute_outdated_delta(data, -1, 0, false, undefined);
      }
    }
  }

  private _updateAttribute(attribute: Aspect.InstalledAttribute, data: InternalAttributeData, delta: -1 | 0 | 1, value, oldValue, is_relation: boolean) {
    let sub_delta = 0;
    if (attribute.contains_vo && !is_relation) {
      let diffs = attribute.diffValue<VersionedObject>(value, oldValue);
      for (let [position, sub_object] of diffs) {
        let sub_object_manager = sub_object.manager();
        let is_add = position !== NO_POSITION;
        this._assert_same_cc(sub_object_manager);
        if (attribute.is_sub_object) {
          let pdata = this._sub_object_init(sub_object_manager, attribute);
          if (is_add) {
            if (pdata.modified_position !== NO_POSITION)
              throw new Error(`a sub object is only assignable to one parent/attribute (duplication detected in the same attribute)`);
            sub_delta += +sub_object_manager.isModified() + bool2delta(pdata.saved_position !== position);
          }
          else {
            sub_delta += -sub_object_manager.isModified() - bool2delta(pdata.modified_position !== pdata.saved_position);
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
    this._apply_attribute_modified_delta(data, delta, sub_delta, true, value);
  }

  private _sub_object_init(sub_object_manager: VersionedObjectManager, attribute: Aspect.InstalledAttribute) {
    if (!sub_object_manager._parent) {
      sub_object_manager._parent = {
        manager: this,
        attribute: attribute,
        saved_position: NO_POSITION,
        modified_position: NO_POSITION,
      };
    }
    else if (sub_object_manager._parent.manager !== this || sub_object_manager._parent.attribute !== attribute)
      throw new Error(`a sub object is only assignable to one parent/attribute`);
    return sub_object_manager._parent;
  }

  private _apply_attribute_modified_delta(data: InternalAttributeData, is_modified: number, delta: number, has_value: boolean, value) {
    let prev_modified = (data.flags & MODIFIED_MASK) > 0;
    data.flags = _modified_sub_delta(_set_delta(data.flags, is_modified, MODIFIED_DIRECT), delta);
    let next_modified = (data.flags & MODIFIED_MASK) > 0;
    if (!next_modified)
      data.modified = undefined;
    else if (has_value)
      data.modified = value;
    if (prev_modified !== next_modified)
      this._apply_object_modified_delta(bool2delta(next_modified));
  }

  private _apply_object_modified_delta(delta: number) {
    let prev_modified = (this._flags & MODIFIED_MASK) > 0;
    this._flags = _modified_sub_delta(this._flags, delta);
    let next_modified = (this._flags & MODIFIED_MASK) > 0;
    let parent = this._parent;
    if (parent && parent.modified_position !== NO_POSITION && prev_modified !== next_modified) {
      let pdata = parent.manager._attribute_data[parent.attribute.index];
      let pvalue = parent.manager.attributeValueFast(parent.attribute);
      parent.manager._apply_attribute_modified_delta(pdata, 0, bool2delta(next_modified), true, pvalue);
    }
  }

  private _apply_attribute_outdated_delta(data: InternalAttributeData, is_outdated: number, delta: number, has_value: boolean, value: any) {
    let prev_outdated = (data.flags & OUTDATED_MASK) > 0;
    data.flags = _outdated_sub_delta(_set_delta(data.flags, is_outdated, OUTDATED_DIRECT), delta);
    let next_outdated = (data.flags & OUTDATED_MASK) > 0;
    if (!next_outdated)
      data.outdated = undefined;
    else if (has_value)
      data.outdated = value;
    if (prev_outdated !== next_outdated)
      this._apply_object_outdated_delta(bool2delta(next_outdated));
  }

  private _apply_object_outdated_delta(delta: number) {
    let prev_outdated = (this._flags & OUTDATED_MASK) > 0;
    this._flags = _outdated_sub_delta(this._flags, delta);
    let next_outdated = (this._flags & OUTDATED_MASK) > 0;
    let parent = this._parent;
    if (parent && parent.modified_position !== NO_POSITION && prev_outdated !== next_outdated) {
      let pdata = parent.manager._attribute_data[parent.attribute.index];
      let pvalue = parent.manager.attributeValueFast(parent.attribute);
      parent.manager._apply_attribute_outdated_delta(pdata, 0, bool2delta(next_outdated), true, pvalue);
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
