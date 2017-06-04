declare global {
  interface Object {
    isEqual(other);
  }
}

function isEqualObject(this: Object, other) {
  if (this === other)
    return true;
  if (this.constructor === Object && other.constructor === Object) {
    // both are dictionaries
    let thisKeys = Object.keys(this);
    let otherKeys = Object.keys(other);
    if (thisKeys.length === otherKeys.length && thisKeys.sort().isEqual(otherKeys.sort())) {
      for (var k of thisKeys)
        if (!this[k].isEqual(other[k]))
          return false;
      return true;
    }
  }
  return false;
}

function isEqualArray<T>(this: Array<T>, other) {
  if (other instanceof Array && this.length === other.length) {
    for (var i = 0, l = this.length; i < l; i++)
      if (!this[i].isEqual(other[i]))
        return false;
    return true;
  }
  return false;
}
function isEqualSet<T>(this: Set<T>, other) {
  if (other instanceof Set && this.size === other.size) {
    for (let v of this)
      if (!other.has(v))
        return false;
    return true;
  }
  return false;
}

function isEqualDate(this: Date, other) {
  return other instanceof Date && this.getTime() === other.getTime();
}

function isStrictEqual(this, other) {
  return this === other;
}

addIsEqualSupport(Object, isEqualObject);
addIsEqualSupport(Array, isEqualArray);
addIsEqualSupport(Set, isEqualSet);
addIsEqualSupport(Date, isEqualDate);

export function addIsEqualSupport<T>(clazz: { new (...args): T }, impl: (this: T, other, level?: number) => boolean) {
  if (!clazz.prototype.hasOwnProperty('isEqual'))
    Object.defineProperty(clazz.prototype, 'isEqual', {
        enumerable: false,
        configurable: true,
        writable: true,
        value: impl
    });
}

export function areEquals(a, b) {
  return a === b || (!a || !b ? false : a.isEqual(b));
}
