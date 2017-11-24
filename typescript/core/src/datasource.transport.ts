import {
  ControlCenterContext,
  Identifier, VersionedObject, VersionedObjectManager,
  DataSource, Result
} from './core';

export type EncodedVersionedObjects = EncodedVersionedObject[];
export type EncodedValue = null | string | number | boolean |
  { is: "vo", v: [string, Identifier] } |
  { is: "set", v?: EncodedValue[] } |
  { is: "date", v: string } |
  { is: "obj", v: { [s: string]: EncodedValue } } |
  any[];
const MODIFIED = 1;
const SAVED = 2;
const METADATA = 4;

const IDX_FLAGS = 0;
const IDX_MODIFIED = 1;
const IDX_SAVED = 2;
const IDX_METADATA = 2;

const NO_VALUE = 0;

export type EncodedVersionedAttribute = [/** flags */ number, /** modified */ EncodedValue, /** saved */ EncodedValue, /** metadata */ EncodedValue];
export type EncodedVersionedObject = {
  is: string,
  v: (EncodedVersionedAttribute | 0)[]
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
      let attributes = new Array(m.aspect().attributes_by_index.length);
      attributes[0] = [MODIFIED | SAVED, this.decodedWithLocalId.get(vo) || id, id];
      attributes[1] = [SAVED, NO_VALUE, m.version()];

      let r: EncodedVersionedObject = { is: m.classname(), v: attributes };

      let attributes_by_index = m.aspect().attributes_by_index;
      let last_encoded_idx = 1;
      for (let i = 2; i < attributes_by_index.length; i++) {
        let attribute = attributes_by_index[i];
        let flags = 0;
        let vm: any = NO_VALUE, vs: any = NO_VALUE;
        if (m.isAttributeModifiedFast(attribute)) {
          flags |= MODIFIED;
          vm = m.attributeValueFast(attribute);
        }
        if (m.isAttributeSavedFast(attribute)) {
          flags |= SAVED;
          vs = m.savedAttributeValueFast(attribute);
        }
        attributes[i] = flags > 0 ? [flags, this._encodeValue(vm, attribute.is_sub_object), this._encodeValue(vs, attribute.is_sub_object)] : NO_VALUE;
      }
      if (this._encodedVersionedObjects)
        this._encodedVersionedObjects.push(r);
      else
        throw new Error(`you can't call encode after takeEncodedVersionedObjects`);
    }
  }

  private _encodeValue(value: any, is_sub_object: boolean): EncodedValue {
    if (value === undefined || value === null)
      return null;
    if (value instanceof VersionedObject) {
      let m = value.manager();
      if (is_sub_object)
        this.encode(value);
      return { is: "vo", v: [m.classname(), m.id()] };
    }
    else if (value instanceof Set) {
      if (!value.size)
        return { is: "set" };
      let r: any[] = [];
      for (let v of value)
        r.push(this._encodeValue(v, is_sub_object));
      return { is: "set", v: r };
    }
    else if (value instanceof Array) {
      let r: any[] = [];
      for (let v of value)
        r.push(this._encodeValue(v, is_sub_object));
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
        r[k] = this._encodeValue(value[k], is_sub_object);
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
            if (value.v) for (let v of value.v)
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
    for (let { v: values } of data) {
      let vo = ccc.findChecked(values[0]![IDX_SAVED]);
      let m = vo.manager();
      let attributes_by_index = m.aspect().attributes_by_index;
      let merge_attributes = new Array<{ value: any } | undefined>(attributes_by_index.length - 2);
      for (let i = 2; i < attributes_by_index.length; i++) {
        let v = values[i];
        merge_attributes[i - 2] = undefined;
        if (v && v[IDX_FLAGS] & SAVED)
          merge_attributes[i - 2] = { value: this._decodeValue(ccc, v[IDX_SAVED]) };
      }
      m.mergeSavedAttributesFast(merge_attributes, values[1]![IDX_SAVED]);
      for (let i = 2; i < attributes_by_index.length; i++) {
        let v = values[i];
        if (v && v[IDX_FLAGS] & MODIFIED)
          m.setAttributeValueFast(attributes_by_index[i], this._decodeValue(ccc, v[IDX_MODIFIED]));
      }
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
    for (let { v: values } of data) {
      let vo = ccc.findChecked(values[0]![IDX_SAVED]);
      let m = vo.manager();
      let attributes_by_index = m.aspect().attributes_by_index;
      let merge_attributes = new Array<{ value: any } | undefined>(attributes_by_index.length - 2);
      for (let i = 2; i < attributes_by_index.length; i++) {
        let v = values[i];
        merge_attributes[i - 2] = undefined;
        if (v && v[IDX_FLAGS] & SAVED)
          merge_attributes[i - 2] = { value: this._decodeValue(ccc, v[IDX_SAVED]) };
      }
      let missings = m.computeMissingAttributesFast(merge_attributes);
      if (missings.length) {
        let k = m.classname() + ':' + missings.sort().join(',');
        let g = missings_grouped.get(k);
        let mergeable = { vo, version: values[1]![IDX_SAVED], merge_attributes };
        if (!g)
          missings_grouped.set(k, g = { aspect: m.classname(), objects: [], attributes: missings });
        g.objects.push(vo);
        missings_by_vo.set(vo, mergeable);
      }
      else {
        m.mergeSavedAttributesFast(merge_attributes, values[1]![IDX_SAVED]);
      }
      ret.push(vo);
    }
    if (missings_grouped.size) {
      await dataSource.controlCenter().safe(async ccc => Promise.all([...missings_grouped.values()].map(async g => {
        let res = await ccc.farPromise(dataSource.distantLoad, { objects: g.objects, scope: g.attributes });
        let missing_data = res.value();
        this._decodePhase1(ccc, missing_data, false);
        for (let { v: values } of missing_data) {
          let vo = ccc.findChecked(values[0]![IDX_SAVED]);
          let m = vo.manager();
          let attributes_by_index = m.aspect().attributes_by_index;
          let mergeable = missings_by_vo.get(vo);
          if (!mergeable) {
            mergeable = { vo, version: values[1]![IDX_SAVED], merge_attributes: new Array<{ value: any } | undefined>(attributes_by_index.length - 2) };
            for (let i = 2; i < attributes_by_index.length; i++)
              mergeable.merge_attributes[i - 2] = undefined;
          }
          let { merge_attributes } = mergeable;
          for (let i = 2; i < attributes_by_index.length; i++) {
            let v = values[i];
            if (v && v[IDX_FLAGS] & SAVED)
              merge_attributes[i - 2] = { value: this._decodeValue(ccc, v[IDX_SAVED]) };
          }
        }
      })));
      for (let [vo, mergeable] of missings_by_vo) {
        vo.manager().mergeSavedAttributesFast(mergeable.merge_attributes, mergeable.version);
      }
    }
    return ret;
  }

  private _decodePhase1(ccc: ControlCenterContext, data: EncodedVersionedObjects, allow_unknown_local_id: boolean) {
    for (let { is, v: values } of data) {
      let real_id = values[0]![IDX_SAVED];
      let local_id = values[0]![IDX_MODIFIED];
      let is_local = VersionedObjectManager.isLocalId(real_id);
      let l = this.encodedWithLocalId.get(local_id);
      if (!l && !is_local)
        l = ccc.find(real_id);
      if (!l) {
        l = ccc.create(is);
        if (!is_local)
          l.manager().setId(real_id);
        else if (allow_unknown_local_id) {
          this.encodedWithLocalId.set(real_id, l);
          this.decodedWithLocalId.set(l, real_id);
          values[0]![IDX_SAVED] = l.id();
        }
        else
          throw new Error(`reference to locally defined object ${local_id}`);
      }
      else if (!is_local)
        l.manager().setId(real_id);
      else {
        this.encodedWithLocalId.set(real_id, l);
        values[0]![IDX_SAVED] = l.id();
      }
    }
  }
}
export type Mergeable = { vo: VersionedObject, version: number, merge_attributes: ({ value: any } | undefined)[] };

