import {
  ControlCenterContext,
  Identifier, VersionedObject, VersionedObjectManager,
  DataSource, Result
} from './core';

export type EncodedVersionedObjects = EncodedVersionedObject[];
export type EncodedValue = null | string | number | boolean |
  { is: "vo", v: [string, Identifier] } |
  { is: "set", v: EncodedValue[] } |
  { is: "date", v: string } |
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
      let m = vo.manager();
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
      let m = value.manager();
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
    else if (value instanceof Date) {
      return { is: "date", v: value.toISOString() };
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

  private _decodeValue(ccc: ControlCenterContext, value: EncodedValue): any {
    if (value === undefined || value === null)
      return undefined;
    if (typeof value === "object") {
      if (value instanceof Array) {
        let r: any[] = [];
        for (let v of value)
          r.push(this._decodeValue(ccc, v));
        return r;
      }
      else {
        switch (value.is) {
          case 'vo': {
            let [name, id] = value.v;
            let vo = this.encodedWithLocalId.get(id) || ccc.find(id);
            if (!vo) {
              vo = ccc.create(name);
              if (VersionedObjectManager.isLocalId(id))
                throw new Error(`reference to an unknown locally defined object ${value.v}`);
              vo.manager().setId(id);
            }
            return vo;
          }
          case 'set': {
            let r = new Set();
            for (let v of value.v)
              r.add(this._decodeValue(ccc, v));
            return r;
          }
          case 'date': {
            return new Date(value.v);
          }
          case 'obj': {
            let r = {};
            let o = value.v;
            for (let k in o)
              r[k] = this._decodeValue(ccc, o[k]);
            return r;
          }
        }
      }
    }

    return value;
  }

  decodeEncodedVersionedObjectsWithModifiedValues(
    ccc: ControlCenterContext,
    data: EncodedVersionedObjects,
  ): VersionedObject[] {
    let ret: VersionedObject[] = [];
    this._decodePhase1(ccc, data, true);
    for (let s of data) {
      let vo = ccc.findChecked(s.real_id);
      let m = vo.manager();
      let saved_attributes = new Map<keyof VersionedObject, any>();
      for (let k of Object.keys(s.version_attributes))
        saved_attributes.set(k as keyof VersionedObject, this._decodeValue(ccc, s.version_attributes[k]));
      m.mergeWithRemoteAttributes(saved_attributes, s.version);
      for (let k of Object.keys(s.local_attributes))
        m.setAttributeValue(k as keyof VersionedObject, this._decodeValue(ccc, s.local_attributes[k]));
      ret.push(vo);
    }
    return ret;
  }

  async decodeEncodedVersionedObjectsClient(
    ccc: ControlCenterContext,
    data: EncodedVersionedObjects,
    dataSource: DataSource.Categories.server
  ): Promise<VersionedObject[]> {
    let ret: VersionedObject[] = [];
    this._decodePhase1(ccc, data, false);
    let missings_grouped = new Map<string, { aspect: string, objects: VersionedObject[], attributes: string[] }>();
    let missings_by_vo = new Map<VersionedObject, Mergeable>();
    for (let s of data) {
      let vo = ccc.findChecked(s.real_id);
      let m = vo.manager();
      let attributes = new Map<keyof VersionedObject, any>();
      for (let k of Object.keys(s.version_attributes))
        attributes.set(k as keyof VersionedObject, this._decodeValue(ccc, s.version_attributes[k]));
      let missings = m.computeMissingAttributes(attributes);
      if (missings.length) {
        let k = m.name() + ':' + missings.sort().join(',');
        let g = missings_grouped.get(k);
        let mergeable = { vo, version: s.version, attributes };
        if (!g)
          missings_grouped.set(k, g = { aspect: m.name(), objects: [], attributes: missings });
        g.objects.push(vo);
        missings_by_vo.set(vo, mergeable);
      }
      else {
        m.mergeWithRemoteAttributes(attributes, s.version);
      }
      ret.push(vo);
    }
    if (missings_grouped.size) {
      await dataSource.controlCenter().safe(async ccc => Promise.all([...missings_grouped.values()].map(async g => {
        let res = await ccc.farPromise(dataSource.distantLoad, { objects: g.objects, scope: g.attributes });
        let missing_data = res.value();
        this._decodePhase1(ccc, missing_data, false);
        for (let s of missing_data) {
          let vo = ccc.findChecked(s.real_id);
          let mergeable = missings_by_vo.get(vo) || {
            vo: vo,
            version: s.version,
            attributes:  new Map<keyof VersionedObject, any>()
          };
          for (let k of Object.keys(s.version_attributes))
            mergeable.attributes.set(k as keyof VersionedObject, this._decodeValue(ccc, s.version_attributes[k]));
        }
      })));
      for (let [vo, mergeable] of missings_by_vo) {
        vo.manager().mergeWithRemoteAttributes(mergeable.attributes, mergeable.version);
      }
    }
    return ret;
  }

  private _decodePhase1(ccc: ControlCenterContext, data: EncodedVersionedObjects, allow_unknown_local_id: boolean) {
    for (let s of data) {
      let is_local = VersionedObjectManager.isLocalId(s.real_id);
      let l = this.encodedWithLocalId.get(s.local_id);
      if (!l && !is_local)
        l = ccc.find(s.real_id);
      if (!l) {
        l = ccc.create(s.is);
        if (!is_local)
          l.manager().setId(s.real_id);
        else if (allow_unknown_local_id) {
          this.encodedWithLocalId.set(s.real_id, l);
          this.decodedWithLocalId.set(l, s.real_id);
          s.real_id = l.id();
        }
        else
          throw new Error(`reference to locally defined object ${s.local_id}`);
      }
      else if (!is_local)
        l.manager().setId(s.real_id);
      else {
        this.encodedWithLocalId.set(s.real_id, l);
        s.real_id = l.id();
      }
    }
  }
}
export type Mergeable = { vo: VersionedObject, version: number, attributes: Map<keyof VersionedObject, any> };

