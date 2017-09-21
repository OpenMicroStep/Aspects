import {
  ControlCenter,
  Identifier, VersionedObject, VersionedObjectManager
} from './core';

export type EncodedVersionedObjects = EncodedVersionedObject[];
export type EncodedValue = null | string | number | boolean |
  { is: "vo", v: [string, Identifier] } |
  { is: "set", v: EncodedValue[] } |
  { is: "obj", v: { [s: string]: EncodedValue } } |
  any[];
export type EncodedVersionedObject = {
  is: string,
  real_id: Identifier,
  local_id: Identifier,
  version: number,
  local_attributes: { [s: string]: EncodedValue },
  version_attributes: { [s: string]: EncodedValue }
};
export class VersionedObjectCoder {
  private _encodedVersionedObjects: EncodedVersionedObjects | undefined = [];
  private encodedWithLocalId = new Map<Identifier, VersionedObject>();
  private decodedWithLocalId = new Map<VersionedObject, Identifier>();

  encode(vo: VersionedObject): void {
    let id = vo.id();
    if (!this.encodedWithLocalId.has(id)) {
      this.encodedWithLocalId.set(id, vo);
      let m = vo.manager().evenIfUnregistered();
      let r: EncodedVersionedObject = {
        is: m.name(),
        real_id: id,
        local_id: this.decodedWithLocalId.get(vo) || id,
        version: m.versionVersion(),
        local_attributes: {},
        version_attributes: {},
      };
      m.versionAttributes().forEach((v, k) => r.version_attributes[k] = this._encodeValue(v));
      m.localAttributes().forEach((v, k) => r.local_attributes[k] = this._encodeValue(v));
      if (this._encodedVersionedObjects)
        this._encodedVersionedObjects.push(r);
      else
        throw new Error(`you can't call encode after takeEncodedVersionedObjects`);
    }
  }

  private _encodeValue(value: any): EncodedValue {
    if (value === undefined || value === null)
      return null;
    if (value instanceof VersionedObject) {
      let m = value.manager().evenIfUnregistered();
      return { is: "vo", v: [m.name(), m.id()] };
    }
    else if (value instanceof Set) {
      let r: any[] = [];
      for (let v of value)
        r.push(this._encodeValue(v));
      return { is: "set", v: r };
    }
    else if (value instanceof Array) {
      let r: any[] = [];
      for (let v of value)
        r.push(this._encodeValue(v));
      return r;
    }
    else if (typeof value === "object") {
      if (value.constructor !== Object)
        throw new Error(`cannot encode non std objects ${value.constructor && value.constructor.name}`);
      let r = {};
      for (let k in value)
        r[k] = this._encodeValue(value[k]);
      return { is: "obj", v: r };
    }
    else if (typeof value === "function" || typeof value === "symbol") {
      throw new Error(`cannot encode non std objects ${typeof value}`);
    }
    return value; // primitive type
  }

  takeEncodedVersionedObjects(): EncodedVersionedObjects {
    let objects = this._encodedVersionedObjects;
    this._encodedVersionedObjects = undefined;
    if (objects)
      return objects;
    throw new Error(`you can't call takeEncodedVersionedObjects twice`);
  }

  private _decodeValue(cc: ControlCenter, value: EncodedValue): any {
    if (value === undefined || value === null)
      return undefined;
    if (typeof value === "object") {
      if (value instanceof Array) {
        let r: any[] = [];
        for (let v of value)
          r.push(this._decodeValue(cc, v));
        return r;
      }
      else {
        switch (value.is) {
          case 'vo': {
            let [name, id] = value.v;
            let vo = cc.find(id);
            if (!vo) {
              vo = cc.create(name);
              vo.manager().setId(id);
            }
            return vo;
          }
          case 'set': {
            let r = new Set();
            for (let v of value.v)
              r.add(this._decodeValue(cc, v));
            return r;
          }
          case 'obj': {
            let r = {};
            let o = value.v;
            for (let k in o)
              r[k] = this._decodeValue(cc, o[k]);
            return r;
          }
        }
      }
    }

    return value;
  }

  decodeEncodedVersionedObjects(cc: ControlCenter, data: EncodedVersionedObjects, allow_decode_unknown_local_id: boolean): VersionedObject[] {
    let ret: VersionedObject[] = [];
    for (let s of data) {
      let l = this.encodedWithLocalId.get(s.local_id);
      let is_local = VersionedObjectManager.isLocalId(s.local_id);
      if (!l && !is_local)
        l = cc.find(s.local_id);
      if (!l) {
        l = cc.create(s.is);
        if (!is_local)
          l.manager().setId(s.real_id);
        else if (allow_decode_unknown_local_id) {
          this.decodedWithLocalId.set(l, s.local_id);
          s.real_id = l.id();
        }
        else
          throw new Error(`reference to locally defined object ${s.local_id}`);
        cc.registerObject(this, l);
      }
      else {
        l.manager().setId(s.real_id);
      }
    }
    for (let s of data) {
      let r = cc.findChecked(s.real_id);
      let m = r.manager();
      let ra = new Map<keyof VersionedObject, any>();
      for (let k of Object.keys(s.version_attributes))
        ra.set(k as keyof VersionedObject, this._decodeValue(cc, s.version_attributes[k]));
      m.mergeWithRemoteAttributes(ra, s.version);
      for (let k of Object.keys(s.local_attributes))
        m.setAttributeValue(k as keyof VersionedObject, this._decodeValue(cc, s.local_attributes[k]));
      ret.push(r);
    }
    return ret;
  }
}
