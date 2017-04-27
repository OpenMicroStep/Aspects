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

function isEqualDate(this: Date, other, level?: number) {
  return other instanceof Date && this.getTime() === other.getTime();
}

function isStrictEqual(this, other) {
  return this === other;
}

addIsEqualSupport(Object, isEqualObject);
addIsEqualSupport(Array, isEqualArray);
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


declare global {
  interface Object {
    replaceInGraph(replacer: (object) => any, done: Set<any>);
  }
}

function Object_replaceInGraph(this: Object, replacer: (object) => any, done: Set<any>) {
  if (typeof this === "object") {
    let thisKeys = Object.keys(this);
    for (let key of thisKeys) {
        this[key] = replaceInGraph(this[key], replacer, done);
    }
  }
}
function Array_replaceInGraph<T>(this: Array<T>, replacer: (object) => any, done: Set<any>) { 
  for (var i = 0, l = this.length; i < l; i++) {
    this[i] = replaceInGraph(this[i], replacer, done);
  }
}


export function addReplaceInGraphSupport<T>(clazz: { new (...args): T }, impl: (replacer: (object) => any, done: Set<any>) => void) {
  if (!clazz.prototype.hasOwnProperty('replaceInGraph'))
    Object.defineProperty(clazz.prototype, 'replaceInGraph', {
        enumerable: false,
        configurable: true,
        writable: true,
        value: impl
    });
}

addReplaceInGraphSupport(Object, Object_replaceInGraph);
addReplaceInGraphSupport(Array, Array_replaceInGraph);

export function replaceInGraph(value, replacer: (object) => any, done: Set<any>): any {
  if (value && typeof value === "object") {
    if (done.has(value)) return;
    done.add(value);
    value = replacer(value);
    value.replaceInGraph(replacer, done);
  }
  return value;
}
