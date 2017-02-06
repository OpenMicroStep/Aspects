declare global {
  interface Object {
    isEqual(other, level?: number);
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

function isEqualArray<T>(this: Array<T>, other, level?: number) {
  if (other instanceof Array && this.length === other.length) {
    if (typeof level === "number")
      level--;
    for (var i = 0, l = this.length; i < l; i++)
      if (!this[i].isEqual(other[i], level))
        return false;
    return true;
  }
  return true;
}

function isEqualDate<T>(this: Date, other, level?: number) {
  return other instanceof Date && this.getTime() === other.getTime();
}

function isStrictEqual(this, other) {
  return this === other;
}

addIsEqualSupport(Object, isEqualObject);
addIsEqualSupport(Array, isEqualArray);
addIsEqualSupport(Date, isEqualDate);

export function addIsEqualSupport<T>(clazz: { new (...args): T }, impl: (this: T, other, level?: number) => boolean) {
  if (!clazz.prototype.isEqual)
    Object.defineProperty(clazz.prototype, 'isEqual', {
        enumerable: false,
        configurable: true,
        writable: true,
        value: impl
    });
}

export function areEquals(a: Object, b: Object) {
  return !a || !b ? a === b : a.isEqual(b);
}
