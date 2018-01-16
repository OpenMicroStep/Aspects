import { Reporter, PathReporter } from '@openmicrostep/msbuildsystem.shared';
import { DataSource,  Aspect, Identifier, VersionedObject, VersionedObjectConstructor, DataSourceInternal, VersionedObjectManager, ControlCenterContext, VersionedObjectSnapshot, AspectConfiguration, Result } from './core';
import { ResolvedScope } from './datasource.scope';

export enum Mode {
  Encode,
  Decode,
  Validate
}

export abstract class Type<Value = Type.Value, Data = Type.Data>{
  code(mode: Mode, at: PathReporter, ctx: Type.Context | undefined, value: any): any | undefined {
    switch (mode) {
      case Mode.Encode: return this.encode(at, ctx!, value);
      case Mode.Decode: return this.decode(at, ctx!, value);
      case Mode.Validate: this.validate(at, value);
    }
  }
  encode(at: PathReporter, ctx: Type.Context, value: Type.Value): Type.Data | undefined {
    if (this.canEncode(value))
      return this._encode(at, ctx, value);
    at.diagnostic({ is: "error", msg: `cannot encode ${this._describe(value)}` });
    return undefined;
  }
  decode(at: PathReporter, ctx: Type.Context, data: Type.Data): Type.Value | undefined {
    let ret: Type.Value | undefined = undefined;
    let s = at.reporter.snapshot();
    if (this.canDecode(data)) {
      ret = this._decode(at, ctx, data);
      if (!at.reporter.hasChanged(s))
        this.validate(at, ret);
    }
    else {
      at.diagnostic({ is: "error", msg: `cannot decode ${this._describe(data)}` });
    }
    return ret;
  }

  async finalizeDecode(ctx: Type.Context, dataSource: DataSource.Categories.server) {
    if (ctx.missings_grouped && ctx.missings_grouped.size) {
      let missings_grouped = ctx.missings_grouped;
      ctx.missings_grouped = undefined;
      await Promise.all([...missings_grouped.values()]
        .map(g => ctx.ccc.farPromise(dataSource.distantLoad, { objects: g.objects, scope: g.attributes })));
    }
  }

  /** @internal */
  abstract _encode(at: PathReporter, ctx: Type.Context, value: Value): Data;
  /** @internal */
  abstract _decode(at: PathReporter, ctx: Type.Context, data: Data): Value | undefined;
  abstract canEncode(value: Type.Value): value is Value;
  abstract canDecode(data: Type.Data): data is Data;
  abstract validate(at: PathReporter, value: Type.Value);
  /** @internal */
  *classnames(): IterableIterator<string> {}
  /** @internal */
  attribute_cstor(): typeof Aspect.InstalledMonoAttribute | typeof Aspect.InstalledSetAttribute | typeof Aspect.InstalledArrayAttribute {
    return Aspect.InstalledMonoAttribute;
  }

  static areEquals(type_a: Type, type_b: Type): boolean {
    return type_a === type_b || (type_a.constructor === type_b.constructor && type_a.signature() === type_b.signature());
  }

  static areComparable(type_a: Type, type_b: Type): boolean {
    if (type_a === type_b)
      return true;
    return type_a.isComparableTo(type_b);
  }
  /** @internal */
  isComparableTo(other: Type): boolean {
    if (this.constructor === other.constructor)
      return this.signature() === other.signature();
    if (other instanceof Type.OrType)
      return other.isComparableTo(this);
    return false;
  }
  abstract signature(): string;

  toString() {
    return this.signature();
  }

  asPrimitive(): string | undefined { return undefined; }

  protected _describe(value: Type.Value) {
    let type = typeof value;
    if (type === "object" && value && typeof value.constructor === "function") {
      type = value.constructor.name;
    }
    return type;
  }
}
export namespace Type {
  export enum ModeLocation {
    Parameter,
    Return,
  }

  export class Context {
    constructor(
      public ccc: ControlCenterContext,
      public location: ModeLocation,
    ) {}
    scope_path: string = "";
    scope: ResolvedScope | undefined = undefined;
    encodedWithLocalId = new Map<Identifier, [VersionedObject, ClassType.DataAttribute[]]>();
    decodedWithLocalId = new Map<VersionedObject, Identifier>();
    missings_grouped: Map<string, { aspect: string, objects: VersionedObject[], attributes: string[] }> | undefined = new Map();
    missings_by_vo = new Map<VersionedObject, Mergeable>();
  }
  export type Mergeable = { vo: VersionedObject, snapshot: VersionedObjectSnapshot };
}
export namespace Type {
  export type Value = any;
  export type Data = any;
  export type Properties = Map<string, Type>;
}

export namespace Type {
  abstract class DirectType<T> extends Type<T, T> {
    canDecode(data: Type.Data): data is T {
      return this.canEncode(data);
    }
    _encode(at: PathReporter, ctx: Type.Context, value: T): T {
      return value;
    }
    _decode(at: PathReporter, ctx: Type.Context, data: T): T {
      return data;
    }
    signature() {
      return this.asPrimitive();
    }
    abstract asPrimitive(): string;
  }

  //integer
  class IntegerType extends DirectType<number> {
    canEncode(value: Type.Value): value is number {
      return typeof value === "number" && Number.isInteger(value);
    }
    validate(at: PathReporter, value: Type.Value) {
      if (!this.canEncode(value))
        at.diagnostic({ is: "error", msg: `must be an integer, got ${this._describe(value)}` });
    }

    asPrimitive() {
      return "integer";
    }
  }
  //decimal
  class DecimalType extends DirectType<number> {
    canEncode(value: Type.Value): value is number {
      return typeof value === "number" && Number.isFinite(value);
    }
    validate(at: PathReporter, value: Type.Value) {
      if (!this.canEncode(value))
        at.diagnostic({ is: "error", msg: `must be a decimal, got ${this._describe(value)}` });
    }

    asPrimitive() {
      return "decimal";
    }
  }
  //string
  class StringType extends DirectType<string> {
    canEncode(value: Type.Value): value is string {
      return typeof value === "string";
    }
    validate(at: PathReporter, value: Type.Value) {
      if (!this.canEncode(value))
        at.diagnostic({ is: "error", msg: `must be a string, got ${this._describe(value)}` });
    }
    asPrimitive() {
      return "string";
    }
  }

  //boolean
  class BooleanType extends DirectType<boolean> {
    canEncode(value: Type.Value): value is boolean {
      return typeof value === "boolean";
    }
    validate(at: PathReporter, value: Type.Value) {
      if (!this.canEncode(value))
        at.diagnostic({ is: "error", msg: `must be a boolean, got ${this._describe(value)}` });
    }
    asPrimitive() {
      return "boolean";
    }
  }

  function is_identifier(value: any): value is Identifier {
    return (
      (typeof value === "string" && value.length > 0) ||
      (typeof value === "number" && Number.isInteger(value))
    )
  }

  //identifier
  class IdentifierType extends DirectType<Identifier> {
    canEncode(value: Type.Value): value is Identifier {
      return is_identifier(value);
    }
    validate(at: PathReporter, value: Type.Value) {
      if (!this.canEncode(value))
        at.diagnostic({ is: "warning", msg: `an identifier must be a string or a number, got ${this._describe(value)}` });
    }
    asPrimitive() {
      return "id";
    }
  }

  //version
  class VersionType extends IntegerType {
  }

  //date
  export class DateType extends Type<Date, number> {
    canEncode(value: Type.Value): value is Date {
      return value instanceof Date;
    }
    canDecode(data: Type.Data): data is number {
      return typeof data === "number" && Number.isInteger(data);
    }
    _encode(at: PathReporter, ctx: Type.Context, value: Date): number {
      return value.getTime()
    }
    _decode(at: PathReporter, ctx: Type.Context, data: number): Date {
      return new Date(data);
    }
    validate(at: PathReporter, value: Type.Value) {
      if (!(value instanceof Date))
        at.diagnostic({ is: "error", msg: `must be a Date, got ${this._describe(value)}` });
    }
    signature() {
      return "date";
    }
  }
  // result
  export namespace ResultType {
    export type Value = Result;
    export type Data = { is: "result", v: any[] };
  }
  export class ResultType extends Type<ResultType.Value, ResultType.Data> {
    constructor(public type: Type) { super(); }
    canEncode(value: Type.Value): value is ResultType.Value {
      return value instanceof Result;
    }
    canDecode(data: Type.Data): data is ResultType.Data {
      return data instanceof Object && data.is === "result" && Array.isArray(data.v);
    }
    _encode(at: PathReporter, ctx: Type.Context, value: ResultType.Value): ResultType.Data {
      let items = value.items().map(item => {
        if (item.is === "value")
          item = { is: "value", value: this.type.encode(at, ctx, item.value) };
        return item;
      });
      return { is: "result", v: items }
    }
    _decode(at: PathReporter, ctx: Type.Context, data: ResultType.Data): ResultType.Value {
      let items = data.v.map(item => {
        if (item.is === "value")
          item = { is: "value", value: this.type.decode(at, ctx, item.value) };
        return item;
      });
      return new Result(items);
    }
    validate(at: PathReporter, value: Type.Value) {
      if (!this.canEncode(value))
        at.diagnostic({ is: "error", msg: `must be a Result, got ${this._describe(value)}` });
      else {
        at.pushArray()
        for (let [i, item] of value.items().entries()) {
          if (item.is === "value")
            this.type.validate(at.setArrayKey(i), item.value);
        }
        at.popArray();
      }
    }
    signature() {
      return "Result";
    }
  }

  //binary
  declare class Buffer {
    static from(data: number[]): Buffer;
    [s: number]: number;
    length: number;
  }
  const binary = (function(): {
    is_binary(value: any): boolean;
    from(data: number[]): ArrayLike<number>;
  } {
    if (typeof Buffer !== "undefined") {
      return {
        is_binary(value: any) { return value instanceof Buffer; },
        from(data: number[]) { return Buffer.from(data); }
      }
    }
    else if (typeof Uint8Array !== "undefined") {
      return {
        is_binary(value: any) { return value instanceof Uint8Array; },
        from(data: number[]) { return new Uint8Array(data); }
      }
    }
    else {
      return {
        is_binary(value: any) { return Array.isArray(value) && value.every(v => Number.isInteger(v) && 0 <= v && v <= 255); },
        from(data: number[]) { return data; }
      }
    }
  }) ();
  export namespace BinaryType {
    export type Value = ArrayLike<number>;
    export type Data = { is: "binary", v: number[] };
  }
  export class BinaryType extends Type<BinaryType.Value, BinaryType.Data> {
    canEncode(value: Type.Value): value is BinaryType.Value {
      return binary.is_binary(value);
    }
    canDecode(data: Type.Data): data is BinaryType.Data {
      return data instanceof Object && data.is === "binary" && Array.isArray(data.v);
    }
    _encode(at: PathReporter, ctx: Type.Context, value: BinaryType.Value): BinaryType.Data {
      return { is: "binary", v: Array.from(value) };
    }
    _decode(at: PathReporter, ctx: Type.Context, data: BinaryType.Data): BinaryType.Value {
      return binary.from(data.v);
    }
    validate(at: PathReporter, value: Type.Value) {
      if (!this.canEncode(value))
        at.diagnostic({ is: "error", msg: `must be a binary, got ${this._describe(value)}` });
    }
    signature() {
      return "binary";
    }
  }

  export abstract class ListType<Value, Data> extends Type<Value, Type.Data> {
    constructor(
      public min: number,
      public max: number,
      public type: Type
    ) { super(); }

    /** @internal */
    classnames(): IterableIterator<string> {
      return this.type.classnames();
    }
    /** @internal */
    isComparableTo(other: Type): boolean {
      return other.constructor === this.constructor && this.type.isComparableTo((other as ListType<any, any>).type);
    }
  }

  //array
  export class ArrayType extends ListType<Type.Value[], Type.Data[]> {
    canEncode(value: Type.Value): value is Type.Value[] {
      return value instanceof Array;
    }
    canDecode(data: Type.Data): data is Type.Data[] {
      return data instanceof Array;
    }

    private _code(mode: Mode, at: PathReporter, ctx: Type.Context | undefined, value: any[]) {
      let ret = new Array(value.length);
      at.pushArray();
      for (let [i, v] of value.entries()) {
        ret[i] = this.type.code(mode, at.setArrayKey(i), ctx, v);
      }
      at.popArray();
      return ret;
    }

    _encode(at: PathReporter, ctx: Type.Context, value: Type.Value[]): Type.Data[] {
      return this._code(Mode.Encode, at, ctx, value);
    }

    _decode(at: PathReporter, ctx: Type.Context, data: Type.Data[]): Type.Value[] {
      return this._code(Mode.Decode, at, ctx, data);
    }
    validate(at: PathReporter, value: Type.Value) {
      if (!Array.isArray(value)) {
        at.diagnostic({ is: "error", msg: `must be an array` });
      }
      else {
        if ((value.length < this.min) || (value.length > this.max))
          at.diagnostic({ is: "error", msg: `length in not in range [${this.min}, ${this.max}], got ${value.length}` });
        at.pushArray();
        for (let i = this.min; i < value.length && i < this.max; i++) {
          this.type.validate(at.setArrayKey(i), value[i]);
        }
        at.popArray();
      }
    }
    /** @internal */
    attribute_cstor() {
      return Aspect.InstalledArrayAttribute;
    }
    signature() {
      return `[${this.min}, ${this.max === ArrayType.INFINITE ? '*' : this.max}, ${this.type.toString()}]`;
    }
  }
  export namespace ArrayType {
    export const INFINITE = Number.MAX_SAFE_INTEGER;
  }

  //set
  export namespace SetType {
    export type Value = Set<Type.Value>;
    export type Data = { is: "set", v: Type.Data[] };
  }
  export class SetType extends ListType<SetType.Value, SetType.Data> {
    canEncode(value: Type.Value): value is SetType.Value {
      return value instanceof Set;
    }
    canDecode(data: Type.Data): data is SetType.Data {
      return data instanceof Object && data.is === "set" && data.v instanceof Array;
    }

    _encode(at: PathReporter, ctx: Type.Context, value: SetType.Value): SetType.Data {
      let ret = [] as any[];
      at.pushArray();
      for (let v of value) {
        ret.push(this.type.encode(at, ctx, v));
      }
      at.popArray();
      return { is: "set", v: ret };
    }
    _decode(at: PathReporter, ctx: Type.Context, data: SetType.Data): SetType.Value {
      return new Set(data.v.map(v => this.decode(at, ctx, v)));
    }
    validate(at: PathReporter, value: Type.Value) {
      if (!(value instanceof Set)) {
        at.diagnostic({ is: "error", msg: `must be a set` });
      }
      else {
        if ((value.size < this.min) || (value.size > this.max))
          at.diagnostic({ is: "error", msg: `length in not in range [${this.min}, ${this.max}], got ${value.size}` });

        at.pushArray();
        for (let v of value)
          this.type.validate(at, v);
        at.popArray();
      }
    }
    /** @internal */
    attribute_cstor() {
      return Aspect.InstalledSetAttribute;
    }
    signature() {
      return `<${this.min}, ${this.max === SetType.INFINITE ? '*' : this.max}, ${this.type.toString()}>`;
    }
  }
  export namespace SetType {
    export const INFINITE = Number.MAX_SAFE_INTEGER;
  }


  //dict
  export namespace DictionaryType {
    export type Value = { [s: string]: Type.Value };
    export type Data = { is: "dict", v: { [s: string]: Type.Data } };
  }
  export class DictionaryType extends Type<DictionaryType.Value, DictionaryType.Data> {
    constructor(
      public properties: Type.Properties,// { [s: string]: Type }
      public otherKeysType: Type | undefined,
    ) { super(); }

    canEncode(value: Type.Value): value is DictionaryType.Value {
      return value instanceof Object && value.constructor === Object;
    }
    canDecode(data: Type.Data): data is DictionaryType.Data {
      return data instanceof Object && data.is === "dict" && data.v instanceof Object;
    }
    private _code(mode: Mode, at: PathReporter, ctx: Type.Context | undefined, value) {
      let ret = {};
      at.pushArray();
      for (let [k, v] of Object.entries(value)) {
        let k_type = this.properties.get(k) || this.otherKeysType;
        if (!k_type)
          at.diagnostic({ is: "warning", msg: `propertie ${k} not allowed` });
        else
          ret[k] = k_type.code(mode, at.setArrayKey(k), ctx, v);
      }
      at.popArray();
      return ret;
    }

    _encode(at: PathReporter, ctx: Type.Context, value: DictionaryType.Value): DictionaryType.Data {
      return { is: "dict", v: this._code(Mode.Encode, at, ctx, value) };
    }

    _decode(at: PathReporter, ctx: Type.Context, data: DictionaryType.Data): DictionaryType.Value {
      return this._code(Mode.Decode, at, ctx, data.v);
    }

    validate(at: PathReporter, value: Type.Value) {
      if (!this.canEncode(value))
        at.diagnostic({ is: "warning", msg: `must be a dictionary, got ${this._describe(value)}` });

      this._code(Mode.Validate, at, undefined, value);
    }
    /** @internal */
    *classnames(): IterableIterator<string> {
      for (let t of this.properties.values())
        yield* t.classnames();
      if (this.otherKeysType)
        yield* this.otherKeysType.classnames();
    }
    signature() {
      let props = [...this.properties.entries()].map(([k, v]) => `${k}: ${v.toString()}`).sort();
      if (this.otherKeysType)
        props.push(`*: ${this.otherKeysType.toString()}`);
      return `{${props.join(', ')}}`;
    }
  }

  const MODIFIED = 1;
  const SAVED = 2;
  const METADATA = 4;
  const PENDING_DELETION = 8;

  const IDX_FLAGS = 0;
  const IDX_MODIFIED = 1;
  const IDX_SAVED = 2;
  const IDX_METADATA = 2;

  const NO_VALUE = 0;

  //nom d'une classe
  export namespace ClassType {
    export type Value = VersionedObject;
    export type Data = { is: "vo", cls: string, v: Identifier | (DataAttribute[]) };
    export type DataAttribute = ([/** flags */ number, /** modified */ Type.Data, /** saved */ Type.Data] | 0);
  }
  export class VersionedObjectType extends Type<ClassType.Value, ClassType.Data> {
    constructor(
      public classname: string,
      public cstor: Function,
      public scope?: ResolvedScope,
    ) { super(); }
    canEncode(value: Type.Value): value is ClassType.Value {
      return value instanceof this.cstor;
    }
    canDecode(data: Type.Data): data is ClassType.Data {
      return data instanceof Object &&
        data.is === "vo" &&
        typeof data.cls === "string" &&
        (is_identifier(data.id) || Array.isArray(data.v));
    }
    _encode(at: PathReporter, ctx: Type.Context, vo: ClassType.Value): ClassType.Data {
      let m = vo.manager();
      let id = m.id();
      let ret: ClassType.Data = { is: "vo", cls: m.classname(), v: id };
      let push_scope = this._push_scope(ctx);
      if (ctx.scope) {
        let found = ctx.encodedWithLocalId.get(id);
        let is_new = !found;
        if (!found) {
          let attributes = new Array(m.aspect().attributes_by_index.length) ;
          ctx.encodedWithLocalId.set(id, found = [vo, attributes]);
        }
        let attributes = found[1];
        let scope = ctx.scope.attributes(m.classname(), ctx.scope_path);
        let modified_id = ctx.decodedWithLocalId.get(vo) || id;
        if (is_new) {
          let pending_deletion = m.isPendingDeletion() ? PENDING_DELETION : 0;
          attributes[0] = [MODIFIED | SAVED | pending_deletion, modified_id, id];
          attributes[1] = [SAVED, NO_VALUE, m.version()];
        }

        let attributes_by_index = m.aspect().attributes_by_index;
        for (let i = 2; i < attributes_by_index.length; i++) {
          if (!is_new && attributes[i])
            continue;

          let attribute = attributes_by_index[i];
          let v: ClassType.DataAttribute = NO_VALUE;
          if (scope.has(attribute)) {
            let scope_path = ctx.scope_path;
            ctx.scope_path = `${scope_path}${attribute.name}.`;
            let flags = 0;
            let vm: any = NO_VALUE, vs: any = NO_VALUE;
            if (m.isAttributeModifiedFast(attribute)) {
              flags |= MODIFIED;
              vm = attribute.type.encode(at, ctx, m.attributeValueFast(attribute));
            }
            if (m.isAttributeSavedFast(attribute)) {
              flags |= SAVED;
              vs = attribute.type.encode(at, ctx, m.savedAttributeValueFast(attribute));
            }
            if (flags > 0)
              v = [flags, vm, vs];
            ctx.scope_path = scope_path;
          }
          attributes[i] = v;
        }
        if (is_new)
          ret.v = attributes;
      }

      this._pop_scope(ctx, push_scope);

      return ret;
    }

    private _push_scope(ctx: Type.Context) {
      let push_scope = !!this.scope && !ctx.scope;
      if (push_scope) {
        ctx.scope = this.scope;
        ctx.scope_path = '.';
      }
      return push_scope;
    }

    private _pop_scope(ctx: Type.Context, push_scope: boolean) {
      if (push_scope) {
        ctx.scope = undefined;
        ctx.scope_path = '.';
      }
    }

    _decode(at: PathReporter, ctx: Type.Context, data: ClassType.Data): ClassType.Value | undefined {
      let push_scope = this._push_scope(ctx);
      let vo: VersionedObject | undefined = undefined;
      let allow_modified = ctx.location === Type.ModeLocation.Parameter;
      if (Array.isArray(data.v)) {
        if (!ctx.scope) {
          at.diagnostic({ is: "error", msg: "unexpected versioned object with data" });
        }
        else {
          let attributes = data.v;
          let v_0 = attributes[0]!;
          let real_id = v_0[IDX_SAVED];
          let local_id = v_0[IDX_MODIFIED];
          let is_local = VersionedObjectManager.isLocalId(real_id);

          // Phase 1: findOrCreate in ccc
          let found = ctx.encodedWithLocalId.get(local_id);
          vo = found ? found[0] : undefined;
          if (!vo && !is_local) {
            vo = ctx.ccc.find(real_id);
            if (vo && allow_modified) {
              at.diagnostic({ is: "error", msg: "reference to existing before decode object is not allow in this context" });
              return undefined;
            }
          }
          if (!vo) {
            vo = ctx.ccc.create(data.cls);
            if (!is_local)
              vo.manager().setSavedIdVersion(real_id, VersionedObjectManager.UndefinedVersion);
            else if (ctx.location === Type.ModeLocation.Parameter) {
              ctx.encodedWithLocalId.set(real_id, [vo, attributes]);
              ctx.decodedWithLocalId.set(vo, real_id);
            }
            else {
              at.diagnostic({ is: "error", msg: `reference to locally defined object ${local_id}` });
              return undefined;
            }
          }
          else {
            ctx.encodedWithLocalId.set(real_id, [vo, attributes]);
          }
          if (v_0[IDX_FLAGS] & PENDING_DELETION)
            vo.manager().setPendingDeletion(true);

          // Phase 2: merge attributes
          let m = vo.manager();
          let scope = ctx.scope.attributes(m.classname(), ctx.scope_path);
          if (!is_local) {
            let aspect = m.aspect();
            let attributes_by_index = aspect.attributes_by_index;
            let mergeable = ctx.missings_by_vo.get(vo);
            let snapshot = mergeable ? mergeable.snapshot : new VersionedObjectSnapshot(m.aspect(), real_id);
            for (let attribute of m.attributes()) {
              let v = attributes[attribute.index];
              if (v && (v[IDX_FLAGS] & SAVED))
                snapshot.setAttributeValueFast(attribute, attribute.type.decode(at, ctx, v[IDX_SAVED]));
            }
            let missings = m.computeMissingAttributes(snapshot);
            if (!allow_modified && ctx.missings_grouped && missings.length) {
              let k = m.classname() + ':' + missings.sort().join(',');
              let g = ctx.missings_grouped!.get(k);
              let mergeable = { vo, snapshot };
              if (!g)
                ctx.missings_grouped!.set(k, g = { aspect: m.classname(), objects: [], attributes: missings });
              g.objects.push(vo);
              ctx.missings_by_vo.set(vo, mergeable);
            }
            else {
              m.mergeSavedAttributes(snapshot);
              if (allow_modified) {
                for (let attribute of m.attributes()) {
                  let v = attributes[attribute.index];
                  if (v && (v[IDX_FLAGS] & MODIFIED))
                    m.setAttributeValueFast(attribute, attribute.type.decode(at, ctx, v[IDX_MODIFIED]));
                }
              }
            }
          }
        }
      }
      else {
        let found = ctx.encodedWithLocalId.get(data.v);
        vo = found ? found[0] : ctx.ccc.findOrCreate(data.v, data.is);
      }
      this._pop_scope(ctx, push_scope);

      return vo;
    }

    validate(at: PathReporter, value: Type.Value) {
      if (!(value instanceof this.cstor)) {
        at.diagnostic({ is: "warning", msg: `attribute must be a ${this.classname}, got ${this._describe(value)}` });
      }
    }
    /** @internal */
    *classnames(): IterableIterator<string> {
      yield this.classname;
    }
    signature() {
      return this.classname;
    }
  }

  class AnyVersionedObjectType extends VersionedObjectType {
    constructor() {
      super("VersionedObject", VersionedObject);
    }
    /** @internal */
    *classnames(): IterableIterator<string> {
      // We don't care about the base class VersionedObject
    }
  }

  //Or
  export class OrType extends Type<any, any> {
    constructor(
      public oneOf: Type[],
    ) { super(); }
    canEncode(value: Type.Value): value is ClassType.Value {
      return true;
    }
    canDecode(data: Type.Data): data is ClassType.Data {
      return true;
    }
    _encode(at: PathReporter, ctx, value: Type.Value): Type.Data {
      for (let type of this.oneOf) {
        if (type.canEncode(value)) {
          return type._encode(at, ctx, value);
        }
      }
      at.diagnostic({ is: "error", msg: `no valid encoder found for ${this._describe(value)}` })
    }
    _decode(at: PathReporter, ctx, data: Type.Data): Type.Value {
      for (let type of this.oneOf) {
        if (type.canDecode(data)) {
          return type._decode(at, ctx, data);
        }
      }
      at.diagnostic({ is: "error", msg: `no valid decoder found for ${this._describe(data)}` })
    }
    validate(at: PathReporter, value: Type.Value) {
      for (let type of this.oneOf) {
        if (type.canEncode(value)) {
          return type.validate(at,value);
        }
      }
      at.diagnostic({ is: "error", msg: `no valid type found for ${this._describe(value)}` })
    }
    /** @internal */
    isComparableTo(other: Type): boolean {
      for (let type of this.oneOf)
        if (type.isComparableTo(other))
          return true;
      return false;
    }
    /** @internal */
    *classnames(): IterableIterator<string> {
      for (let t of this.oneOf)
        yield* t.classnames();
    }
    signature() {
      return `(${this.oneOf.map(t => t.toString()).sort().join(' | ')})`;
    }
  }

  //any
  class AnyType extends OrType {
    constructor() {
      super([]);
      this.oneOf.push(
        undefinedType,
        booleanType,
        decimalType,
        stringType,
        binaryType,
        anyVersionedObjectType,
        new ResultType(this),
        new ArrayType(0, ArrayType.INFINITE, this),
        new SetType(0, SetType.INFINITE, this),
        new DictionaryType(new Map(), this),
      );
    }
    /** @internal */
    isComparableTo(other: Type): boolean {
      return Type.areEquals(this, other);
    }
    validate(at: PathReporter, value: Type.Value) {
    }
    toString() {
      return `any`;
    }
  }

  //undefined
  export class UndefinedType extends Type<undefined, null> {
    canEncode(value: Type.Value): value is undefined {
      return value === undefined;
    }
    canDecode(data: Type.Data): data is null {
      return data === null;
    }
    _encode(at: PathReporter, ctx, value: undefined): null {
      return null;
    }
    _decode(at: PathReporter, ctx, data: null): undefined {
      return undefined;
    }
    validate(at: PathReporter, value: Type.Value) {
      if (value !== undefined)
        at.diagnostic({ is: "error", msg: `must be undefined, got ${this._describe(value)}` });
    }
    /** @internal */
    isComparableTo(other: Type): boolean {
      return false;
    }
    signature() {
      return `undefined`;
    }
  }

  // void
  class VoidType extends Type<never, never> {
    canEncode(value: Type.Value): value is never {
      return false;
    }
    canDecode(data: Type.Data): data is never {
      return false;
    }
    _encode(at: PathReporter, ctx, value: undefined): never {
      throw new Error("VoidType._encode shouldn't be called");
    }
    _decode(at: PathReporter, ctx, data: null): never {
      throw new Error("VoidType._decode shouldn't be called");
    }
    validate(at: PathReporter, value: Type.Value) {
      at.diagnostic({ is: "error", msg: `must not exists, got ${this._describe(value)}` });
    }
    /** @internal */
    isComparableTo(other: Type): boolean {
      return false;
    }
    signature() {
      return `void`;
    }
  }

  //virtual
  export namespace VirtualType {
    export type Value = any;
    export type Data = any;
  }
  export class VirtualType extends Type<VirtualType.Value, VirtualType.Data> {
    constructor (
      public type:Type,
      public metadata: {
        operator: string,
        sort: { asc: boolean, attribute: Aspect.InstalledAttribute } [],
        group_by: Aspect.InstalledAttribute[]
      }
    ){
      super();
    }

    canEncode(value: Type.Value): value is VirtualType.Value {
      return this.type.canEncode(value);
    }
    canDecode(data: Type.Data): data is VirtualType.Data {
      return this.type.canDecode(data);
    }
    _encode(at: PathReporter, ctx, value: VirtualType.Value): VirtualType.Data {
      return this.type.encode(at,ctx,value);
    }
    _decode(at: PathReporter, ctx, data: VirtualType.Data): VirtualType.Value {
      return this.type.decode(at, ctx, data);
    }
    validate(at: PathReporter, value: Type.Value) {
      this.type.validate(at,value);
    }
    signature() {
      return `virtual`;
    }
  }

  export const voidType: Type<never, never> = new VoidType();
  export const undefinedType: Type<undefined, null> = new UndefinedType();
  export const booleanType: Type<boolean, boolean> = new BooleanType();
  export const decimalType: Type<number, number> = new DecimalType();
  export const integerType: Type<number, number> = new IntegerType();
  export const identifierType: Type<Identifier, Identifier> = new IdentifierType();
  export const versionType: Type<number, number> = new VersionType();
  export const dateType: Type<Date, number> = new DateType();
  export const stringType: Type<string, string> = new StringType();
  export const binaryType = new BinaryType();
  export const anyVersionedObjectType: Type<VersionedObject, any> = new AnyVersionedObjectType();
  export const anyType: Type = new AnyType();
  export const resultType = new ResultType(anyType);
  export const arrayType = new ArrayType(0, ArrayType.INFINITE, anyType);
  export const setType = new SetType(0, SetType.INFINITE, anyType);
  export const dictionaryType = new DictionaryType(new Map(), anyType);
}
