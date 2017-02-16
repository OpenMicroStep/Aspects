import {FarTransport, VersionedObject, ControlCenter} from '@microstep/aspects';
import { MSTE } from '@microstep/mstools';

export class XHRTransport implements FarTransport {
  remoteCall<T>(controlCenter: ControlCenter, to: VersionedObject, method: string, args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
        var isVoid = args.length === 0;
        var xhr = new XMLHttpRequest();
        xhr.open(isVoid ? "GET" : "POST", this.httpUrl(to, method), true);
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4) {
                if (xhr.status >= 200 && xhr.status < 300) 
                    resolve(this.decode(controlCenter, xhr.responseText));
                else
                    reject(this.decode(controlCenter, xhr.responseText));
            }
        }
        if (!isVoid) {
            xhr.setRequestHeader('Content-Type', 'application/json+mste');
            xhr.send(this.encode(args[0]));
        }
        else
            xhr.send();
    });
  }

  httpMethod(to: VersionedObject, method: string) {
      return "GET";
  }

  httpUrl(to: VersionedObject, method: string) {
      let def = to.manager().aspect();
      return `${def.version}/${def.name}/${to.id()}/${method}`;
  }

  encode(value): any {
    return MSTE.stringify(value);
  }

  decode(controlCenter: ControlCenter, value): any {
    let classes = {}
    controlCenter._aspects.forEach((a, n) => classes[n] = a);
    let ret = MSTE.parse(value, { classes: classes });
    let objects = new Map<VersionedObject, VersionedObject>();
    let replacer = (object) => {
        if (object instanceof VersionedObject) {
            let found = objects.get(object);
            if (!found) {
                found = controlCenter.mergeObject(object);
                objects.set(object, found);
            }
            return found;
        }
        return object;
    }
    return replaceInGraph(ret, replacer, new Set());
  }
}

declare global {
  interface Object {
    replaceInGraph(replacer: (object) => any, done: Set<any>);
  }
}

function VersionedObject_replaceInGraph(this: VersionedObject, replacer: (object) => any, done: Set<any>) {
  let manager = this.manager();
  manager._localAttributes.forEach((v,k) => {
    let v2 = v.replaceInGraph(replacer, done);
    if (v2 !== v)
        manager._localAttributes.set(k, v2);
  });
  manager._versionAttributes.forEach((v,k) => {
    let v2 = v.replaceInGraph(replacer, done);
    if (v2 !== v)
        manager._versionAttributes.set(k, v2);
  });
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
  if (!clazz.prototype.isEqual)
    Object.defineProperty(clazz.prototype, 'replaceInGraph', {
        enumerable: false,
        configurable: true,
        writable: true,
        value: impl
    });
}

addReplaceInGraphSupport(Object, Object_replaceInGraph);
addReplaceInGraphSupport(Array, Array_replaceInGraph);
addReplaceInGraphSupport(VersionedObject, VersionedObject_replaceInGraph);

export function replaceInGraph(value, replacer: (object) => any, done: Set<any>): any {
    if (done.has(value)) return;
    done.add(value);
    value = replacer(value);
    value.replaceInGraph(replacer, done);
    return value;
}
