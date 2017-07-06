import {ControlCenter, NotificationCenter, Identifier, VersionedObject, VersionedObjectConstructor, VersionedObjectManager, DataSource, InMemoryDataSource, Invocation, InvocationState} from './core';

export namespace Transport {

export interface Encoder {
  encode(s: any): any;
}
export interface FlatEncoder extends Encoder {
  encode(s: any, keepAttributes?: boolean): any;
  cc: ControlCenter;
  encodedVo: Set<VersionedObject>;
  remoteId(vo: VersionedObject): Identifier;
}
export interface FlatDecoder extends Decoder {
  cc: ControlCenter;
  ccAllowed: Set<VersionedObject> | undefined;
  decodedObjectsById: Map<Identifier, VersionedObject>;
  decodedObjectsToRemoteId: Map<VersionedObject, Identifier> | undefined;
  component: {};
}
export interface Decoder {
  decode(s: any): any;
}
export interface ObjectCoding<I, O, E extends Encoder, D extends Decoder> {
  is: string | undefined,
  canEncode(e: E, s) : s is I,
  encode(e: E, s: I): O,
  canDecode(d: D, s) : s is O,
  decode(d: D, s: O): I,
};
export type ObjectFlatCoding<I, O> = ObjectCoding<I, O, FlatEncoder, FlatDecoder>;

const jsonEncoders: ObjectCoding<any, any, FlatEncoder, FlatDecoder>[]= [
  { is: "Map",
    canEncode(e, s) { return s instanceof Map },
    encode(e, s) {
      let r: any = { __is__: "Map", entries: [] };
      for (let [k, v] of s)
        r.entries.push([e.encode(k), e.encode(v)]);
      return r;
    },
    canDecode(d, s) { return s && s.__is__ === this.is },
    decode(d, s) {
      let r = new Map();
      for (let [k, v] of s.entries)
        r.set(d.decode(k), d.decode(v));
      return r;
    },
  } as ObjectFlatCoding<Map<any, any>, { __is__: "Map", entries: [any, any][] }>,
  { is: "Set",
    canEncode(e, s) { return s instanceof Set },
    encode(e, s) {
      let r: any = { __is__: "Set", entries: [] };
      for (let v of s)
        r.entries.push(e.encode(v));
      return r;
    },
    canDecode(d, s) { return s && s.__is__ === this.is },
    decode(d, s) {
      let r = new Set();
      for (let v of s.entries)
        r.add(d.decode(v));
      return r;
    },
  } as ObjectFlatCoding<Set<any>, { __is__: "Set", entries: any[] }>,
  { is: "VersionedObject",
    canEncode(e, s) { return s instanceof VersionedObject },
    encode(e, s) {
      let r: any;
      let m = s.manager();
      r = { __is__: "VersionedObject", _id: m.id(), _rid: e.remoteId(s), __cls: m.name() };
      if (!e.encodedVo.has(s)) {
        e.encodedVo.add(s);
        r._version = m.versionVersion();
        r._localAttributes = {};
        r._versionAttributes = {}
        m.versionAttributes().forEach((v, k) => r._versionAttributes[k] = v !== undefined ? e.encode(v, false) : null);
        m.localAttributes().forEach((v, k) => r._localAttributes[k] = v !== undefined ? e.encode(v, false) : null);
      }
      return r;
    },
    canDecode(d, s) { return s && s.__is__ === this.is },
    decode(d, s) {
      let id = s._rid;
      let isLocalId = VersionedObjectManager.isLocalId(id);
      let r = d.decodedObjectsById.get(id);
      if (!r && !isLocalId) {
        r = d.cc.registeredObject(id);
        if (r && d.ccAllowed && !d.ccAllowed.has(r))
          throw new Error(`reference to reserved cc object ${id}`);
      }
      if (!r) {
        let cstor = d.cc.aspect(s.__cls);
        if (!cstor)
          throw new Error(`aspect ${s.__cls} not found`);
        r = new cstor();
        d.cc.registerObjects(d.component, [r]);
        if (d.ccAllowed)
          d.ccAllowed.add(r);
      }
      let m = r.manager()
      if (!VersionedObjectManager.isLocalId(s._id))
        m.setId(s._id);
      d.decodedObjectsById.set(id, r);
      if (d.decodedObjectsToRemoteId)
        d.decodedObjectsToRemoteId.set(r, id);
      if (typeof s._versionAttributes === "object" && typeof s._version === "number" && s._version !== VersionedObjectManager.NoVersion) {
        let ra = new Map<keyof VersionedObject, any>();
        for (let k in s._versionAttributes) {
          let v = s._versionAttributes[k];
          ra.set(k as keyof VersionedObject, v !== null ? d.decode(v) : undefined);
        }
        m.mergeWithRemoteAttributes(ra, s._version);
      }
      if (typeof s._localAttributes === "object" && typeof s._version === "number") {
        for (let k in s._localAttributes) {
          let v = s._localAttributes[k];
          m.setAttributeValue(k as keyof VersionedObject, v !== null ? d.decode(v) : undefined);
        }
      }
      return r;
    },
  } as ObjectFlatCoding<VersionedObject, { __is__: "VersionedObject", __cls: string, _id: Identifier, _rid: Identifier, _version?: number, _versionAttributes?: object, _localAttributes?: object }>,
  { is: undefined,
    canEncode(e, s) { return s.constructor === Object },
    canDecode(d, s) { return s.constructor === Object },
    encode(e, s) {
      let k, v, r= {};
      for (k in s) {
        if (k.startsWith("__is__"))
          k = "__is__\\" + k.substring(6);
        v = s[k];
        r[k] = e.encode(v);
      }
      return r;
    },
    decode(d, s) {
      let r: any = {};
      let k, v;
      for (k in s) {
        if (k.startsWith("__is__\\"))
          k = "__is__" + k.substring(7);
        v = s[k];
        r[k] = d.decode(v);
      }
      return r;
    }
  } as ObjectFlatCoding<object, object>,
  { is: undefined,
    canEncode(e, s) { return Array.isArray(s) },
    canDecode(d, s) { return Array.isArray(s) },
    encode(e, s) {
      let r: any[] = [] ;
      for (let v of s)
        r.push(e.encode(v));
      return r;
    },
    decode(d, s) {
      return s.map(v => d.decode(v));
    },
  } as ObjectFlatCoding<any[], any[]>,
];

export abstract class FlatCoder<T> {
  private encoderByCstor = new Map<Function, ObjectFlatCoding<any, any>>();
  private encoderByName: Map<string, ObjectFlatCoding<any, any>>;
  private encodersWithoutName: ObjectFlatCoding<any, any>[];
  constructor(private encoders: ObjectFlatCoding<any, any>[] = jsonEncoders) {
    this.encoderByName = new Map(encoders.filter(e => e.is).map<[string, ObjectFlatCoding<any, any>]>(e => [e.is!, e]));
    this.encodersWithoutName = encoders.filter(e => !e.is);
  }

  abstract encode(value: any) : T;
  abstract decode(value: T) : any;

  async encode_transport_decode(cc: ControlCenter, encodeMe: any, transport: (encodedMe: T) => Promise<T>) : Promise<any> {
    let component = {};
    cc.registerComponent(component);
    let encodedWithLocalId = new Map<Identifier, VersionedObject>();
    let encodedMe = this.encodeWithCC(encodeMe, cc, vo => {
      let id = vo.id();
      encodedWithLocalId.set(id, vo);
      return id;
    });
    let decodeMe = await transport(this.encode(encodedMe));
    let decodedMe = this.decodeWithCC(this.decode(decodeMe), cc, component, undefined, undefined, encodedWithLocalId);
    cc.unregisterComponent(component);
    return decodedMe;
  }

  async decode_handle_encode(cc: ControlCenter, decodeMe: T, handle: (decodedMe: any) => Promise<any>) : Promise<T> {
    let component = {};
    cc.registerComponent(component);
    let decodedWithLocalId = new Map<VersionedObject, Identifier>();
    let decodedMe = this.decodeWithCC(this.decode(decodeMe), cc, component, new Set(), decodedWithLocalId);
    let encodeMe = await handle(decodedMe);
    let encodedMe = this.encodeWithCC(encodeMe, cc, vo => decodedWithLocalId.get(vo) || vo.id());
    cc.unregisterComponent(component);
    return this.encode(encodedMe);
  }

  protected encodeWithCC(s: any, cc: ControlCenter, remoteId: (vo: VersionedObject) => Identifier = vo => vo.id()) {
    const self = this;
    const encoder: FlatEncoder = {
      cc: cc,
      encodedVo: new Set(),
      remoteId: remoteId,
      encode(s: any, keepAttributes?: boolean): any {
        let r = s;
        if (typeof s === "object") {
          let enc = s.constructor && self.encoderByCstor.get(s.constructor);
          if (!enc) {
            for (enc of self.encoders) {
              if (enc.canEncode(this, s))
                break;
            }
            if(!enc)
              throw new Error(`cannot encode ${s.constructor.name}`);
            if (s.constructor)
              self.encoderByCstor.set(s.constructor, enc);
          }
          r = enc.encode(this, s);
        }
        else if (typeof s === "function") {
          throw new Error(`cannot encode function`);
        }
        return r;
      }
    }
    return encoder.encode(s);
  }
  protected decodeWithCC(s: any, cc: ControlCenter, component: {}, ccAllowed?: Set<VersionedObject>,
    decodedObjectsToRemoteId?: Map<VersionedObject, Identifier>,
    decodedObjectsById = new Map<Identifier, VersionedObject>(),
  ) {
    const self = this;
    const decoder: FlatDecoder = {
      cc: cc,
      ccAllowed: ccAllowed,
      component: component,
      decodedObjectsById: decodedObjectsById,
      decodedObjectsToRemoteId: decodedObjectsToRemoteId,
      decode(s: any): any {
        if (s && typeof s === "object") {
          if (s.__is__)
            return self.encoderByName.get(s.__is__)!.decode(this, s);
          for (let enc of self.encodersWithoutName)
            if (enc.canDecode(this, s))
              return enc.decode(this, s);
          throw new Error(`cannot decode ${s}`);
        }
        return s;
      }
    }
    return decoder.decode(s);
  }
}

export class JSONCoder extends FlatCoder<string> {
  encode(value: any) : string {
    return JSON.stringify(value);
  }
  decode(value: string) : any {
    return value === undefined ? undefined : JSON.parse(value);
  }
}

}// namespace Transport
