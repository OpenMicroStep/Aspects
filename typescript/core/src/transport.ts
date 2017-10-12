import {ControlCenter, NotificationCenter, Identifier, VersionedObject, VersionedObjectConstructor, VersionedObjectManager, DataSource, InMemoryDataSource} from './core';

export namespace Transport {

export interface Encoder {
  encode(s: any): any;
}
export interface FlatEncoder extends Encoder {
  encode(s: any, keepAttributes?: boolean): any;
  ccc: ControlCenterContext;
  encodedVo: Set<VersionedObject>;
}
export interface FlatDecoder extends Decoder {
  ccc: ControlCenterContext;
  ccAllowed: Set<VersionedObject> | undefined;
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
  { is: "Date",
    canEncode(e, s) { return s instanceof Date; },
    canDecode(d, s) { return s && s.__is__ === this.is; },
    encode(e, s) {
      return { __is__: this.is, v: s.getTime() };
    },
    decode(d, s) {
      return new Date(s.v);
    },
  } as ObjectFlatCoding<Date, { __is__: "Date", v: number }>,
  { is: "VersionedObject",
    canEncode(e, s) { return s instanceof VersionedObject },
    encode(e, s) {
      let r: any;
      let m = s.manager();
      m = (m as any)._manager || m; // bypass UnregisteredVersionedObjectManager
      let id = m.id()
      if (VersionedObjectManager.isLocalId(id))
        throw new Error(`reference to locally defined object ${id}`);
      r = { __is__: "VersionedObject", is: m.name(), id: m.id() };
      return r;
    },
    canDecode(d, s) { return s && s.__is__ === this.is },
    decode(d, s) {
      let id = s.id;
      if (VersionedObjectManager.isLocalId(id))
        throw new Error(`reference to locally defined object ${id}`);
      let vo = d.ccc.find(id);
      if (!vo) {
        vo = d.ccc.create(s.is);
        vo.manager().setId(s.id);
        if (d.ccAllowed)
          d.ccAllowed.add(vo);
      }
      else if (d.ccAllowed && !d.ccAllowed.has(vo))
        throw new Error(`reference to reserved cc object ${id}`);
      return vo;
    },
  } as ObjectFlatCoding<VersionedObject, { __is__: "VersionedObject", is: string, id: Identifier }>,
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

type EncodedBinary = { __is__: "Binary", data:  any[] };

declare class Buffer {
  [s: number]: number;
  length: number;
}
if (typeof Buffer !== "undefined") { // nodejs
  jsonEncoders.push({ is: "Binary",
    canEncode(e, s) { return s instanceof Buffer },
    canDecode(d, s) { return s && s.__is__ === "Binary" },
    encode(e, s) {
      let r: any[] = [];
      for (var i = 0; i < s.length; i++) {
        r.push(e.encode(s[i]));
      }
      return { __is__: "Binary", data: r};
    },
    decode(d, s) {
      let r: any = [] ;
       for (let v of s.data)
        r.push(d.decode(v));
      return r;
    },
  } as ObjectFlatCoding<Buffer,  EncodedBinary>)
}

if (typeof Uint8Array !== "undefined") { //JS
    jsonEncoders.push({ is: "Binary",
    canEncode(e, s) { return s instanceof Uint8Array },
    canDecode(d, s) { return s && s.__is__ === "Binary" },
    encode(e, s) {
      let r: any[] = [] ;
      for (let v of s)
        r.push(e.encode(v));
      return { __is__: "Binary", data:r  };
    },
    decode(d, s) {
      let r: any = [] ;
       for (let v of s.data)
        r.push(d.decode(v));
      return r;
    },
  } as ObjectFlatCoding<Uint8Array,  EncodedBinary>)
}


export abstract class FlatCoder<T> {
  private encoderByCstor = new Map<Function, ObjectFlatCoding<any, any>>();
  private encoderByName: Map<string, ObjectFlatCoding<any, any>>;
  private encodersWithoutName: ObjectFlatCoding<any, any>[];
  constructor(
    private encoders: ObjectFlatCoding<any, any>[] = jsonEncoders
  ) {
    this.encoderByName = new Map(encoders.filter(e => e.is).map<[string, ObjectFlatCoding<any, any>]>(e => [e.is!, e]));
    this.encodersWithoutName = encoders.filter(e => !e.is);
  }

  abstract encode(value: any) : T;
  abstract decode(value: T) : any;

  async encode_transport_decode(ccc: ControlCenterContext, encodeMe: any, transport: (encodedMe: T) => Promise<T>) : Promise<any> {
    let encodedMe = this.encodeWithCC(encodeMe, ccc);
    let decodeMe = await transport(this.encode(encodedMe));
    let decodedMe = this.decodeWithCC(this.decode(decodeMe), ccc, undefined);
    return decodedMe;
  }

  async decode_handle_encode(ccc: ControlCenterContext, decodeMe: T, handle: (decodedMe: any) => Promise<any>) : Promise<T> {
    let decodedMe = this.decodeWithCC(this.decode(decodeMe), ccc, new Set());
    let encodeMe = await handle(decodedMe);
    let encodedMe = this.encodeWithCC(encodeMe, ccc);
    return this.encode(encodedMe);
  }

  protected encodeWithCC(s: any, ccc: ControlCenterContext) {
    const self = this;
    const encoder: FlatEncoder = {
      ccc: ccc,
      encodedVo: new Set(),
      encode(s: any, keepAttributes?: boolean): any {
        let r = s;
        if (typeof s === "object") {
          if (s === null)
            return s;
          let enc = s.constructor && self.encoderByCstor.get(s.constructor);
          if (!enc) {
            for (enc of self.encoders) {
              if (enc.canEncode(this, s)) break
              else enc = undefined;
            }
            if(!enc)
              throw new Error(`cannot encode ${s.constructor.name}`);
            if (s.constructor)
              self.encoderByCstor.set(s.constructor, enc);
          }
          r = enc.encode(this, s);
        }
        else if (typeof s === "function" && typeof s === "symbol") {
          throw new Error(`cannot encode ${typeof s}`);
        }
        return r;
      }
    }
    return encoder.encode(s);
  }
  protected decodeWithCC(s: any, ccc: ControlCenterContext, ccAllowed: Set<VersionedObject> | undefined) {
    const self = this;
    const decoder: FlatDecoder = {
      ccc: ccc,
      ccAllowed: ccAllowed,
      decode(s: any): any {
        if (s && typeof s === "object") {
          if (s.__is__) {
            let enc = self.encoderByName.get(s.__is__)
            if (!enc) throw new Error(`cannot decode ${s.__is__}`);
            return enc.decode(this, s);
          }
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
