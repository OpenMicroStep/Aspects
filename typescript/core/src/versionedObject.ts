import {
  ControlCenter, areEquals, Identifier, Invocation, Result, Aspect, addIsEqualSupport,
  ImmutableMap, ImmutableList, AComponent,
  SafePostLoad, SafePreSave, SafePostSave,
} from './core';
import { Flux } from '@openmicrostep/async';
import { Reporter, Diagnostic, AttributePath } from '@openmicrostep/msbuildsystem.shared';
import traverse = Aspect.traverse;

const NEW = 0x1;
const INCONFLICT = 0x4;
const SAVED = 0x8;
const DELETED = 0x10;
const FLAGS_MASK = 0xFF;
const MODIFIED_OFFSET = 8; // 1 byte for flags, 3 bytes for modified counter

const NO_POSITION = -1;
const ANY_POSITION = 0;

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

function bool2delta(positive: boolean) : -1 | 1 {
  return positive ? +1 : -1;
}

type ParentObject = {
  manager: VersionedObjectManager,
  attribute: Aspect.InstalledAttribute,
  saved_position: number, // -1/0 for set, -1/idx for array
  modified_position: number, // -1/0 for set, -1/idx for array
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

  /** @internal */ _flags: VersionedObjectManager.Flags;
  /** @internal */ _attribute_data: VersionedObjectManager.InternalAttributeData[];

  constructor(controlCenter: ControlCenter, object: T) {
    this._controlCenter = controlCenter;
    this._components = new Set();
    this._flags = NEW;
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
  rootObject() {
    if (!this.isSubObject())
      return this._object;
    else if (this._parent)
      return this._parent.manager.rootObject();
    throw new Error(`cannot find root object of sub object, the sub object is not linked to any parent object`);
  }
  controlCenter() { return this._controlCenter; }

  *modifiedAttributes() {
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      if (data.flags >> MODIFIED_OFFSET) {
        yield { attribute: this._aspect.attributes_by_index[idx], modified: data.modified };
      }
    }
  }

  // Definition
  classname() { return this._aspect.classname; }
  aspect() { return this._aspect; }
  isSubObject() { return this._aspect.is_sub_object; }

  // Modified attributes
  isOneOfAttributesModified(scope: (keyof T)[]): boolean {
    return scope.some(attribute_name => this.isAttributeModified(attribute_name));
  }

  clearAllModifiedAttributes() : void {
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      let attribute = this._aspect.attributes_by_index[idx];
      this._clearModifiedAttribute(attribute, data);
    }
  }

  clearModifiedAttributes(attribute_names: string[]) {
    for (let attribute_name of attribute_names) {
      let attribute = this._checkedAttribute(attribute_name);
      if (attribute.index > 2) {
        let data = this._attribute_data[attribute.index];
        this._clearModifiedAttribute(attribute, data);
      }
    }
  }

  // Saved attributes
  savedAttributeValue(attribute_name: string) : any;
  savedAttributeValue<K extends keyof T>(attribute_name: K) : T[K];
  savedAttributeValue<K extends keyof T>(attribute_name: K) : T[K] {
    return this.savedAttributeValueFast(this._checkedAttribute(attribute_name));
  }


  savedAttributeValueFast(attribute: Aspect.InstalledAttribute) : any {
    let data = this._attribute_data[attribute.index];
    if (data.flags & SAVED)
      return data.saved;
    if (this._flags & NEW)
      return this._missingValue(attribute);
    throw new Error(`attribute '${this.classname()}.${attribute.name}' is unaccessible and never was`);
  }

  // Live attributes
  isSaved()      { return (this._flags & SAVED) > 0;      }
  isNew()        { return (this._flags & NEW) > 0;        }
  isModified()   { return (this._flags >> MODIFIED_OFFSET) > 0; }
  isInConflict() { return (this._flags & INCONFLICT) > 0; }
  isDeleted()    { return (this._flags & DELETED) > 0;    }

  isAttributeSaved(attribute_name: string)      { return this.isAttributeSavedFast(this._checkedAttribute(attribute_name)); }
  isAttributeModified(attribute_name: string)   { return this.isAttributeModifiedFast(this._checkedAttribute(attribute_name)); }
  isAttributeInConflict(attribute_name: string) { return this.isAttributeInConflictFast(this._checkedAttribute(attribute_name)); }

  isAttributeSavedFast(attribute: Aspect.InstalledAttribute)      { return (this._attribute_data[attribute.index].flags & SAVED) > 0; }
  isAttributeModifiedFast(attribute: Aspect.InstalledAttribute)   { return (this._attribute_data[attribute.index].flags >> MODIFIED_OFFSET) > 0; }
  isAttributeInConflictFast(attribute: Aspect.InstalledAttribute) { return (this._attribute_data[attribute.index].flags & INCONFLICT) > 0; }

  hasAttributeValue(attribute_name: string ): boolean;
  hasAttributeValue(attribute_name: keyof T): boolean;
  hasAttributeValue(attribute_name: keyof T): boolean {
    return this.hasAttributeValueFast(this._checkedAttribute(attribute_name));
  }

  hasAttributeValueFast(attribute: Aspect.InstalledAttribute) {
    return this._attribute_data[attribute.index].flags > 0 || (this._flags & NEW) > 0;
  }

  hasEveryAttributesValue(attribute_names: string[]) : boolean;
  hasEveryAttributesValue(attribute_names: (keyof T)[]) : boolean;
  hasEveryAttributesValue(attribute_names: (keyof T)[]) : boolean {
    return attribute_names.every(attribute_name => this.hasAttributeValue(attribute_name));
  }

  attributeValue(attribute_name: string) : any;
  attributeValue<K extends keyof T>(attribute_name: K) : T[K];
  attributeValue<K extends keyof T>(attribute_name: K) : T[K] {
    return this.attributeValueFast(this._checkedAttribute(attribute_name));
  }

  attributeValueFast(attribute: Aspect.InstalledAttribute): any {
    let data = this._attribute_data[attribute.index];
    if (data.flags >> MODIFIED_OFFSET)
      return data.modified;
    if (data.flags & SAVED)
      return data.saved;
    if (this._flags & NEW)
      return this._missingValue(attribute);
    if (data.flags & INCONFLICT)
      throw new Error(`attribute '${this.classname()}.${attribute.name}' is unaccessible due to version change`);
    throw new Error(`attribute '${this.classname()}.${attribute.name}' is unaccessible and never was`);
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

  setAttributeValue<K extends keyof T>(attribute_name: K, value: T[K]) {
    this.setAttributeValueFast(this._checkedAttribute(attribute_name), value);
  }

  setAttributeValueFast(attribute: Aspect.InstalledAttribute, value) {
    this._setAttributeValueFast(attribute, value, false);
  }

  // Management
  unloadAttributes(attribute_names: string[]) {
    for (let attribute_name of attribute_names) {
      let attribute = this._checkedAttribute(attribute_name);
      if (attribute.index > 2) {
        let data = this._attribute_data[attribute.index];
        this._unloadAttributeData(data);
      }
    }
  }

  unload() {
    for (let idx = 2; idx < this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      this._unloadAttributeData(data);
    }
  }

  delete() {
    if (this.isSubObject())
      throw new Error(`${this.classname}{id=${this.id()}}.delete(): forbidden on subobject, change the parent attribute directly`);
    // TODO: remove or check any relation to this object or any of its subobject
    this._flags = DELETED;
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
    this._flags &= ~NEW;
  }

  setVersion(version: number) {
    if (this.isNew())
      throw new Error(`version can't be set on a locally identifier object`);
    if (this.isModified()) {
      for (let idx = 2; idx <  this._attribute_data.length; idx++) {
        let data = this._attribute_data[idx];
        if (data.flags >> MODIFIED_OFFSET) {
          let attribute = this._aspect.attributes_by_index[idx];
          let merge_value = data.modified;
          this._setAttributeSavedValue(attribute, data, merge_value);
          data.saved = merge_value;
          data.flags |= SAVED;
        }
      }
    }
    this._attribute_data[1].saved = version;
    this._flags |= SAVED;
  }

  mergeSavedAttributes(attributes: Map<string, any>, version: number) {
    let merge_attributes = new Array<{ value: any } | undefined>(this._attribute_data.length - 2);
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      let attribute = this._aspect.attributes_by_index[idx];
      merge_attributes[idx - 2] = attributes.has(attribute.name) ? { value: attributes.get(attribute.name) } : undefined;
    }
    return this.mergeSavedAttributesFast(merge_attributes, version);
  }

  computeMissingAttributesFast(merge_attributes: ({ value: any } | undefined)[]) {
    let missings: string[] = [];
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      if (data.flags > 0) {
        let attribute = this._aspect.attributes_by_index[idx];
        if (!merge_attributes[idx - 2])
          missings.push(attribute.name);
      }
    }
    return missings;
  }

  mergeSavedAttributesFast(merge_attributes: ({ value: any } | undefined)[], version: number) {
    // _attributes_ can't be trusted, so we need to validate _attributes_ keys and types
    let ret = { changes: <string[]>[], conflicts: <string[]>[], missings: <string[]>[] };
    let reporter = new Reporter();
    let path = new AttributePath(this.classname(), '{id=', this.id(), '}.', '');
    for (let idx = 2; idx <  this._attribute_data.length; idx++) {
      let data = this._attribute_data[idx];
      let attribute = this._aspect.attributes_by_index[idx];
      let merge_data = merge_attributes[idx - 2];
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

        let is_new_saved_value = data_is_saved && areEquals(data.saved, merge_value);
        if (version === this.version()) {
          if (data_is_saved && !is_new_saved_value) // this should not happen
            this._push_conflict(ret.conflicts, attribute.name, data);
        }
        else {
          if (!data_is_saved || !is_new_saved_value)
            ret.changes.push(attribute.name);
          let attribute_modified_counter = data.flags >> MODIFIED_OFFSET;
          if (attribute_modified_counter) {
            this._setAttributeSavedValue(attribute, data, merge_value);
            if (data_is_saved && !is_new_saved_value)
              this._push_conflict(ret.conflicts, attribute.name, data);
          }
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

  private _setAttributeSavedValue(attribute: Aspect.InstalledAttribute, data: VersionedObjectManager.InternalAttributeData, merge_value: any) {
    let delta = -(data.flags >> MODIFIED_OFFSET);
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
    if (this._apply_attribute_delta(data, delta) === 0)
      data.modified = undefined;
  }

  private _push_conflict(conflicts: string[], attribute: string, data: VersionedObjectManager.InternalAttributeData) {
    conflicts.push(attribute);
    if (!(data.flags & INCONFLICT)) {
      data.flags |= INCONFLICT;
      data.outdated = data.saved;
    }
  }

  fillNewObjectMissingValues() {
    if (this._flags & NEW) {
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
    let data = this._checkedAttributeData(attribute_name);
    if (data.flags >> MODIFIED_OFFSET)
      data.modified = value;
    if (data.flags & SAVED)
      data.saved = value;
    if (data.flags & INCONFLICT)
      data.outdated = value;
  }

  private _unloadAttributeData(data: VersionedObjectManager.InternalAttributeData) {
    data.flags = 0;
    data.modified = undefined;
    data.saved = undefined;
    data.outdated = undefined;
  }

  private _checkedAttribute(attribute_name: string) {
    let a = this._aspect.attributes.get(attribute_name);
    if (!a)
      throw new Error(`attribute '${this.classname()}.${attribute_name}' doesn't exists on ${this.classname()}`);
    return a;
  }

  private _checkedAttributeData(attribute_name: string) {
    return this._attribute_data[this._checkedAttribute(attribute_name).index];
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

  private _clearModifiedAttribute(attribute: Aspect.InstalledAttribute, data: VersionedObjectManager.InternalAttributeData) {
    this.setAttributeValueFast(attribute, data.saved);
    if (attribute.is_sub_object) {
      for (let sub_object of traverse<VersionedObject>(attribute.type, data.saved)) {
        sub_object.manager().clearAllModifiedAttributes();
      }
    }
  }

  private _setAttributeValueFast(attribute: Aspect.InstalledAttribute, value, is_relation) {
    let hasChanged = false;
    let delta: 0 | 1 | -1 = 0;
    let oldValue;
    let data = this._attribute_data[attribute.index];
    let isSaved = (data.flags & SAVED) === SAVED;
    let isModified = (data.flags >> MODIFIED_OFFSET) > 0;
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

  private _updateAttribute(attribute: Aspect.InstalledAttribute, data: VersionedObjectManager.InternalAttributeData, delta: -1 | 0 | 1, value, oldValue, is_relation: boolean) {
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
            delta += -sub_object_manager.isModified() + bool2delta(pdata.modified_position !== pdata.saved_position);
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
    if (this._apply_attribute_delta(data, delta) === 0)
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
      };
    }
    else if (sub_object_manager._parent.manager !== this || sub_object_manager._parent.attribute !== attribute)
      throw new Error(`a sub object is only assignable to one parent/attribute`);
    return sub_object_manager._parent;
  }

  private _apply_attribute_delta(data: VersionedObjectManager.InternalAttributeData, delta: number) {
    let previous_value = data.flags >> MODIFIED_OFFSET;
    data.flags += (delta << MODIFIED_OFFSET);
    let new_value = data.flags >> MODIFIED_OFFSET;
    if ((previous_value === 0) !== (new_value === 0))
      this._mark_modified(bool2delta(new_value > 0));
    return new_value;
  }

  private _mark_modified(changes: number) {
    let was_modified = (this._flags >> MODIFIED_OFFSET) > 0;
    this._flags += changes << MODIFIED_OFFSET;
    let is_modified = (this._flags >> MODIFIED_OFFSET) > 0;
    if (was_modified !== is_modified && this._parent) {
      let pm = this._parent.manager;
      let pa = this._parent.attribute;
      let pdata = pm._attribute_data[pa.index];
      pm._apply_attribute_delta(pdata, changes);
    }
  }
}
export namespace VersionedObjectManager {
  export enum Flags {
    NEW = 1,
    INCONFLICT = 4,
    SAVED = 8,
    DELETED = 16,
  };
  export enum AttributeFlags {
    INCONFLICT = 4,
    SAVED = 8,
  };

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

  export type AttributeName<T extends VersionedObject> = _.NonFunctionProps<T>;
  export type InternalAttributeData = {
    flags   : VersionedObjectManager.AttributeFlags,
    modified: any,
    saved   : any,
    outdated: any,
  };
  export type ROAttributes<T extends VersionedObject> = ImmutableMap<AttributeName<T>, T[AttributeName<T>]>;

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
