import {ControlCenter, Identifier, areEquals, Invocation, Invokable, Aspect, createAspect, addIsEqualSupport, addReplaceInGraphSupport, replaceInGraph} from './core';
import { Flux } from '@microstep/async';
import {MSTE} from '@microstep/mstools';
import * as Immutable from 'immutable';

export interface ImmutableObject<T> extends Immutable.Collection.Keyed<keyof T, T[keyof T]> {
    /**
     * Returns a new Map also containing the new key, value pair. If an equivalent
     * key already exists in this Map, it will be replaced.
     */
    set<K extends keyof T>(key: K, value: T): ImmutableObject<T>;

    /**
     * Returns a new Map which excludes this `key`.
     *
     * Note: `delete` cannot be safely used in IE8, but is provided to mirror
     * the ES6 collection API.
     * @alias remove
     */
    delete<K extends keyof T>(key: K): ImmutableObject<T>;
    remove<K extends keyof T>(key: K): ImmutableObject<T>;

    /**
     * Returns a new Map containing no keys or values.
     */
    clear(): ImmutableObject<T>;

    /**
     * Returns a new Map having updated the value at this `key` with the return
     * value of calling `updater` with the existing value, or `notSetValue` if
     * the key was not set. If called with only a single argument, `updater` is
     * called with the Map itself.
     *
     * Equivalent to: `map.set(key, updater(map.get(key, notSetValue)))`.
     */
    update<K extends keyof T>(updater: (value: Map<K, T[K]>) => ImmutableObject<T>): ImmutableObject<T>;
    update<K extends keyof T>(key: K, updater: (value: T[K]) => T[K]): ImmutableObject<T>;
    update<K extends keyof T>(key: K, notSetValue: T[K], updater: (value: T[K]) => T[K]): ImmutableObject<T>;

    /**
     * Returns a new Map resulting from merging the provided Iterables
     * (or JS objects) into this Map. In other words, this takes each entry of
     * each iterable and sets it on this Map.
     *
     * If any of the values provided to `merge` are not Iterable (would return
     * false for `Immutable.Iterable.isIterable`) then they are deeply converted
     * via `Immutable.fromJS` before being merged. However, if the value is an
     * Iterable but includes non-iterable JS objects or arrays, those nested
     * values will be preserved.
     *
     *     var x = Immutable.Map({a: 10, b: 20, c: 30});
     *     var y = Immutable.Map({b: 40, a: 50, d: 60});
     *     x.merge(y) // { a: 50, b: 40, c: 30, d: 60 }
     *     y.merge(x) // { b: 20, a: 10, d: 60, c: 30 }
     *
     */
    merge(...iterables: Immutable.Iterable<keyof T, T[keyof T]>[]): ImmutableObject<T>;
    merge(...iterables: {[key: string]: T[keyof T]}[]): ImmutableObject<T>;

    /**
     * Like `merge()`, `mergeWith()` returns a new Map resulting from merging
     * the provided Iterables (or JS objects) into this Map, but uses the
     * `merger` function for dealing with conflicts.
     *
     *     var x = Immutable.Map({a: 10, b: 20, c: 30});
     *     var y = Immutable.Map({b: 40, a: 50, d: 60});
     *     x.mergeWith((prev, next) => prev / next, y) // { a: 0.2, b: 0.5, c: 30, d: 60 }
     *     y.mergeWith((prev, next) => prev / next, x) // { b: 2, a: 5, d: 60, c: 30 }
     *
     */
    mergeWith(
      merger: (previous?: T[keyof T], next?: T[keyof T], key?: keyof T) => T[keyof T],
      ...iterables: Immutable.Iterable<keyof T, T[keyof T]>[]
    ): ImmutableObject<T>;
    mergeWith(
      merger: (previous?: T[keyof T], next?: T[keyof T], key?: keyof T) => T[keyof T],
      ...iterables: {[key: string]: T[keyof T]}[]
    ): Map<string, T[keyof T]>;

    /**
     * Like `merge()`, but when two Iterables conflict, it merges them as well,
     * recursing deeply through the nested data.
     *
     *     var x = Immutable.fromJS({a: { x: 10, y: 10 }, b: { x: 20, y: 50 } });
     *     var y = Immutable.fromJS({a: { x: 2 }, b: { y: 5 }, c: { z: 3 } });
     *     x.mergeDeep(y) // {a: { x: 2, y: 10 }, b: { x: 20, y: 5 }, c: { z: 3 } }
     *
     */
    mergeDeep(...iterables: Immutable.Iterable<keyof T, T[keyof T]>[]): ImmutableObject<T>;
    mergeDeep(...iterables: {[key: string]: T[keyof T]}[]): Map<string, T[keyof T]>;

    /**
     * Like `mergeDeep()`, but when two non-Iterables conflict, it uses the
     * `merger` function to determine the resulting value.
     *
     *     var x = Immutable.fromJS({a: { x: 10, y: 10 }, b: { x: 20, y: 50 } });
     *     var y = Immutable.fromJS({a: { x: 2 }, b: { y: 5 }, c: { z: 3 } });
     *     x.mergeDeepWith((prev, next) => prev / next, y)
     *     // {a: { x: 5, y: 10 }, b: { x: 20, y: 10 }, c: { z: 3 } }
     *
     */
    mergeDeepWith(
      merger: (previous?: T[keyof T], next?: T[keyof T], key?: keyof T) => T[keyof T],
      ...iterables: Immutable.Iterable<keyof T, T[keyof T]>[]
    ): ImmutableObject<T>;
    mergeDeepWith(
      merger: (previous?: T[keyof T], next?: T[keyof T], key?: keyof T) => T[keyof T],
      ...iterables: {[key: string]: T[keyof T]}[]
    ): Map<string, T[keyof T]>;


    // Deep persistent changes

    /**
     * Returns a new Map having set `value` at this `keyPath`. If any keys in
     * `keyPath` do not exist, a new immutable Map will be created at that key.
     */
    setIn(keyPath: Array<any>, value: any): ImmutableObject<T>;
    setIn(KeyPath: Immutable.Iterable<any, any>, value: any): ImmutableObject<T>;

    /**
     * Returns a new Map having removed the value at this `keyPath`. If any keys
     * in `keyPath` do not exist, no change will occur.
     *
     * @alias removeIn
     */
    deleteIn(keyPath: Array<any>): ImmutableObject<T>;
    deleteIn(keyPath: Immutable.Iterable<any, any>): ImmutableObject<T>;
    removeIn(keyPath: Array<any>): ImmutableObject<T>;
    removeIn(keyPath: Immutable.Iterable<any, any>): ImmutableObject<T>;

    /**
     * Returns a new Map having applied the `updater` to the entry found at the
     * keyPath.
     *
     * If any keys in `keyPath` do not exist, new Immutable `Map`s will
     * be created at those keys. If the `keyPath` does not already contain a
     * value, the `updater` function will be called with `notSetValue`, if
     * provided, otherwise `undefined`.
     *
     *     var data = Immutable.fromJS({ a: { b: { c: 10 } } });
     *     data = data.updateIn(['a', 'b', 'c'], val => val * 2);
     *     // { a: { b: { c: 20 } } }
     *
     * If the `updater` function returns the same value it was called with, then
     * no change will occur. This is still true if `notSetValue` is provided.
     *
     *     var data1 = Immutable.fromJS({ a: { b: { c: 10 } } });
     *     data2 = data1.updateIn(['x', 'y', 'z'], 100, val => val);
     *     assert(data2 === data1);
     *
     */
    updateIn(
      keyPath: Array<any>,
      updater: (value: any) => any
    ): ImmutableObject<T>;
    updateIn(
      keyPath: Array<any>,
      notSetValue: any,
      updater: (value: any) => any
    ): ImmutableObject<T>;
    updateIn(
      keyPath: Immutable.Iterable<any, any>,
      updater: (value: any) => any
    ): ImmutableObject<T>;
    updateIn(
      keyPath: Immutable.Iterable<any, any>,
      notSetValue: any,
      updater: (value: any) => any
    ): ImmutableObject<T>;

    /**
     * A combination of `updateIn` and `merge`, returning a new Map, but
     * performing the merge at a point arrived at by following the keyPath.
     * In other words, these two lines are equivalent:
     *
     *     x.updateIn(['a', 'b', 'c'], abc => abc.merge(y));
     *     x.mergeIn(['a', 'b', 'c'], y);
     *
     */
    mergeIn(
      keyPath: Immutable.Iterable<any, any>,
      ...iterables: Immutable.Iterable<keyof T, T[keyof T]>[]
    ): ImmutableObject<T>;
    mergeIn(
      keyPath: Array<any>,
      ...iterables: Immutable.Iterable<keyof T, T[keyof T]>[]
    ): ImmutableObject<T>;
    mergeIn(
      keyPath: Array<any>,
      ...iterables: {[key: string]: T[keyof T]}[]
    ): Map<string, T[keyof T]>;

    /**
     * A combination of `updateIn` and `mergeDeep`, returning a new Map, but
     * performing the deep merge at a point arrived at by following the keyPath.
     * In other words, these two lines are equivalent:
     *
     *     x.updateIn(['a', 'b', 'c'], abc => abc.mergeDeep(y));
     *     x.mergeDeepIn(['a', 'b', 'c'], y);
     *
     */
    mergeDeepIn(
      keyPath: Immutable.Iterable<any, any>,
      ...iterables: Immutable.Iterable<keyof T, T[keyof T]>[]
    ): ImmutableObject<T>;
    mergeDeepIn(
      keyPath: Array<any>,
      ...iterables: Immutable.Iterable<keyof T, T[keyof T]>[]
    ): ImmutableObject<T>;
    mergeDeepIn(
      keyPath: Array<any>,
      ...iterables: {[key: string]: T[keyof T]}[]
    ): Map<string, T[keyof T]>;


    // Transient changes

    /**
     * Every time you call one of the above functions, a new immutable Map is
     * created. If a pure function calls a number of these to produce a final
     * return value, then a penalty on performance and memory has been paid by
     * creating all of the intermediate immutable Maps.
     *
     * If you need to apply a series of mutations to produce a new immutable
     * Map, `withMutations()` creates a temporary mutable copy of the Map which
     * can apply mutations in a highly performant manner. In fact, this is
     * exactly how complex mutations like `merge` are done.
     *
     * As an example, this results in the creation of 2, not 4, new Maps:
     *
     *     var map1 = Immutable.Map();
     *     var map2 = map1.withMutations(map => {
     *       map.set('a', 1).set('b', 2).set('c', 3);
     *     });
     *     assert(map1.size === 0);
     *     assert(map2.size === 3);
     *
     * Note: Not all methods can be used on a mutable collection or within
     * `withMutations`! Only `set` and `merge` may be used mutatively.
     *
     */
    withMutations(mutator: (mutable: ImmutableObject<T>) => any): ImmutableObject<T>;

    /**
     * Another way to avoid creation of intermediate Immutable maps is to create
     * a mutable copy of this collection. Mutable copies *always* return `this`,
     * and thus shouldn't be used for equality. Your function should never return
     * a mutable copy of a collection, only use it internally to create a new
     * collection. If possible, use `withMutations` as it provides an easier to
     * use API.
     *
     * Note: if the collection is already mutable, `asMutable` returns itself.
     *
     * Note: Not all methods can be used on a mutable collection or within
     * `withMutations`! Only `set` and `merge` may be used mutatively.
     */
    asMutable(): ImmutableObject<T>;

    /**
     * The yin to `asMutable`'s yang. Because it applies to mutable collections,
     * this operation is *mutable* and returns itself. Once performed, the mutable
     * copy has become immutable and can be safely returned from a function.
     */
    asImmutable(): ImmutableObject<T>;
  }

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
  _object: T;

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
    this._object = undefined!;
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
    this.setAttributeValueFast(attribute, value, this._aspect.attributes.get(attribute)!);
  }

  setAttributeValueFast<K extends keyof T>(attribute: K, value: T[K], data: Aspect.InstalledAttribute) {
    let hasChanged = false;

    let oldValue;
    if (this._versionAttributes.has(attribute) && Immutable.is(this._versionAttributes.get(attribute), value)) {
      if (data.relation)
        oldValue = this._localAttributes.get(attribute);
      hasChanged = this._localAttributes.delete(attribute);
    }
    else if (!this._localAttributes.has(attribute) || !Immutable.is(this._localAttributes.get(attribute), value)) {
      if (this._localAttributes.has(attribute))
        oldValue = this._localAttributes.get(attribute);
      if (this._versionAttributes.has(attribute))
        oldValue = this._versionAttributes.get(attribute);
      this._localAttributes.set(attribute, value);
      hasChanged = true;
    }
    if (hasChanged && data.relation) {
      let { add: sadd, del: sdel } = diff<VersionedObject>(data.type, value, oldValue);
      let otype = this.controlCenter().aspect(data.relation.class)!.aspect.attributes.get(data.relation.attribute)!.type;
      let add = true;
      let ai = 0, di = 0;
      while ((add = ai < sadd.length) || di < sdel.length) {
        let other = add ? sadd[ai++] : sdel[di++];
        if (other.manager().hasAttributeValue(data.relation.attribute as keyof VersionedObject)) {
          let v = other[data.relation.attribute];
          switch (otype.type) {
            case 'set':   v = (v as Immutable.Set<VersionedObject>)[add ? 'add' : 'delete'](this._object); break;
            case 'class': v = add ? this._object : undefined; break;
            default: throw new Error(`unsupported relation destination type ${otype.type}`);
          }
          other[data.relation.attribute] = v;
        }
      }
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