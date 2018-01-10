import {
  ControlCenter, ControlCenterContext, VersionedObject, VersionedObjectManager, VersionedObjectConstructor,
  Validation, Result,
  ImmutableList, ImmutableMap, ImmutableSet
} from './core';
import {Reporter, PathReporter, Validate as V} from '@openmicrostep/msbuildsystem.shared';

export interface FarTransport {
  remoteCall(ctx: Aspect.FarContext, to: VersionedObject, method: string, args: any[]): Promise<any>;
}

export interface PublicTransport {
  installMethod(cstor: VersionedObjectConstructor, method: Aspect.InstalledFarMethod);
}

export const NO_POSITION = -1;
export const ANY_POSITION = 0;

export interface Aspect {
  is: string;
  name: string;
  categories: string[];
  farCategories: string[];
};
export namespace Aspect {
  export type FarContext = { context: { ccc: ControlCenterContext, [s: string]: VersionedObject | ControlCenterContext} };
  export const farTransportStub: FarTransport = {
    remoteCall(ctx: FarContext, to: VersionedObject, method: string, args: any[]): Promise<any> {
      return Promise.reject(new Error(`transport not installed`));
    }
  };

  function type_is_or(type: Type, v: (type: Type) => boolean) : boolean {
    if (type.type === "or") {
      for (let t of type.types) {
        if (!v(t))
          return false;
      }
      return type.types.length > 0;
    }
    return false;
  }
  export function typeIsSingleValue(type: Type) : boolean {
    if (type.type === "class" || type.type === "primitive" || type.type === "virtual")
      return true;
    return type_is_or(type, typeIsSingleValue);
  }
  export function typeIsMultValue(type: Type) : boolean {
    if (type.type === "set" || type.type === "array")
      return true;
    return type_is_or(type, typeIsMultValue);
  }
  export function typeIsArrayValue(type: Type) : boolean {
    if (type.type === "array")
      return true;
    return type_is_or(type, typeIsArrayValue);
  }
  export function typeIsSetValue(type: Type) : boolean {
    if (type.type === "set")
      return true;
    return type_is_or(type, typeIsArrayValue);
  }

  export function typeIsClass(type: Type) : boolean {
    if (type.type === "class")
      return true;

    if (type.type === "array" || type.type === "set")
      return typeIsClass(type.itemType);
    return type_is_or(type, typeIsClass);
  }

  export function typeToAspectNames(type: Type) : string[] {
    if (type.type === "class")
      return [type.name];

    if (type.type === "array" || type.type === "set")
      return typeToAspectNames(type.itemType);

    if (type.type === "or") {
      let ret: string[] = [];
      for (let t of type.types) {
        if (t.type !== "class")
          return [];
        ret.push(t.name);
      }
      return ret;
    }

    return [];
  }

  export function typeToString(a: Aspect.Type) {
    switch (a.type) {
      case 'class':
      case 'primitive':
        return `${a.type}:${a.name}`;
      case 'set':
        return `<${typeToString(a.itemType)}>`;
      case 'array':
        return `[${typeToString(a.itemType)}]`;
      case 'or':
        return `(${a.types.map(t => typeToString(t)).join(',')})`;
      case 'dictionary':
        return `{${Object.keys(a.properties).map(k => `${k}=${typeToString(a.properties[k])}`).join(',')})`;
    }
    return 'void';
  }

  export function typesAreComparable(a: Type, b: Type) : boolean {
    if (a === b)
      return true;
    if (b.type === 'or') {
      for (let bi of b.types)
        if (typesAreComparable(a, bi))
          return true;
      return false;
    }
    switch (a.type) {
      case 'array':
        return b.type === 'array' && typesAreComparable(a.itemType, b.itemType);
      case 'set':
        return b.type === 'set' && typesAreComparable(a.itemType, b.itemType);
      case 'class':
        return b.type === 'class' && a.name === b.name;
      case 'primitive':
        return b.type === 'primitive' && a.name === b.name;
      case 'dictionary':
        return typesAreEquals(a, b);
      case 'or':
        for (let ai of a.types)
          if (typesAreComparable(ai, b))
            return true;
        return false;
    }
    return false;
  }

  function typesCompare(a: Type, b: Type): number {
    if (a.type < b.type)
      return -1;
    if (a.type < b.type)
      return +1;
    switch (a.type) {
      case 'set':
      case 'array':
        return typesCompare(a.itemType, (b as TypeArray | TypeSet).itemType);
      case 'class':
      case 'primitive':
        if (a.name < (b as TypeClass | TypePrimitive).name)
          return -1;
        if (a.name > (b as TypeClass | TypePrimitive).name)
          return +1;
        return 0;
      case 'dictionary':
        throw new Error('typesCompare is not implemented for dictionary');
      case 'or': {
        var i = 0;
        while (i < a.types.length && i < (b as TypeOr).types.length) {
          let ret = typesCompare(a.types[i], (b as TypeOr).types[i]);
          if (ret !== 0)
            return ret;
          i++;
        }
        if (i < a.types.length)
          return -1;
        if (i < (b as TypeOr).types.length)
          return +1;
        return 0;
      }
    }
    return 0;
  }

  export function typesAreEquals(a: Type, b: Type) : boolean {
    return typesCompare(a, b) === 0;
  }

  export function disabled_aspect<T extends VersionedObject>(name: string, aspect: string, impl: string) : Aspect.FastConfiguration<T> {
    function throw_disabled(): any {
      throw new Error(`aspect ${aspect} is disabled for ${name} with ${impl} implementation`);
    }
    return {
      get name() { return throw_disabled(); },
      get aspect() { return throw_disabled(); },
      get cstor() { return throw_disabled(); },
      get categories() { return throw_disabled(); },
      create: throw_disabled,
    };
  }

  export type PrimaryType = 'integer' | 'decimal' | 'date' | 'localdate' | 'string' | 'array' | 'dictionary' | 'identifier' | 'any' | 'object' | 'boolean';
  export type TypeVoid = { is: 'type', type: 'void' };
  export type TypePrimitive = { is: 'type', type: 'primitive', name: PrimaryType };
  export type TypeClass = { is: 'type', type: 'class', name: string };
  export type TypeArray = { is: 'type', type: 'array', itemType: Type, min: number, max: number | "*" };
  export type TypeSet = { is: 'type', type: 'set', itemType: Type, min: number, max: number | "*" };
  export type TypeDictionary = { is: 'type', type: 'dictionary', properties: { [s: string]: Type } };
  export type TypeOr = { is: 'type', type: 'or', types: Type[] }
  export type TypeVirtual = { is: 'type', type: 'virtual', operator: string, sort: { asc: boolean, attribute: Aspect.InstalledAttribute }[], group_by: InstalledAttribute[] };
  export type Type = TypeVoid | TypePrimitive | TypeClass | TypeArray | TypeSet | TypeDictionary | TypeOr | TypeVirtual;

  export type TypeValidator = V.Validator0<any>;
  export type AttributeTypeValidator = V.Validator<any, VersionedObjectManager<VersionedObject>>;
  export interface Definition {
    is: string;
    name: string;
    version: number;
    is_sub_object?: boolean;
    queries?: never[];
    attributes?: Attribute[];
    categories?: Category[];
    farCategories?: Category[];
    aspects: Aspect[];
  }
  export namespace Definition {
  }
  export interface Attribute {
    is: string;
    name: string;
    type: Type;
    validator?: AttributeTypeValidator;
    relation?: string;
    is_sub_object?: boolean;
  };
  export interface Category {
    is: string;
    name: string;
    methods: Method[];
  };
  export interface Method {
    is: string;
    name: string;
    argumentTypes: Type[];
    returnType: Type;
  };
  export interface InstalledMethod extends Method {
    argumentValidators: TypeValidator[];
    returnValidator: TypeValidator | undefined;
    transport: FarTransport | undefined;
  };
  export interface InstalledFarMethod extends InstalledMethod {
    transport: FarTransport;
  };
  export interface Reference {
    class: Installed;
    attribute: InstalledAttribute;
  };
  export abstract class InstalledAttribute {
    constructor(
      public readonly name: string,
      public readonly index: number,
      public readonly type: Type,
      public readonly validator: AttributeTypeValidator,
      public readonly relation: Reference | undefined = undefined,
      public readonly contains_vo: boolean = false,
      public readonly is_sub_object: boolean = false,
    ) {}

    abstract defaultValue(): any;
    abstract isMonoValue(): boolean;
    abstract isMultValue(): boolean;
    abstract isArrayValue(): boolean;
    abstract isSetValue(): boolean;
    abstract isVirtualValue(): boolean;
    abstract traverseValueOrdered<T>(value: any): IterableIterator<[number, T]>;
    abstract traverseValue<T>(value: any): IterableIterator<T>;
    abstract diffValue<T>(newV: any, oldV: any): IterableIterator<[number, T]>;
    abstract subobjectChanges<T extends VersionedObject>(newV: any, oldV: any): IterableIterator<[-1 | 0 | 1, T]>;
  }

  export function create_virtual_attribute(name: string, type: TypeVirtual) : Aspect.InstalledAttribute {
    return new InstalledVirtualAttribute(name, -1, type, V.validateAny);
  }

  export class InstalledMonoAttribute extends InstalledAttribute {
    defaultValue(): any { return undefined; }
    isMonoValue(): boolean { return true; }
    isMultValue(): boolean { return false; }
    isArrayValue(): boolean { return false; }
    isSetValue(): boolean { return false; }
    isVirtualValue(): boolean { return false; }

    *traverseValueOrdered<T>(value: any): IterableIterator<[number, T]> {
      if (value !== undefined)
        yield [0, value];
    }

    *traverseValue<T>(value: any): IterableIterator<T> {
      if (value !== undefined)
        yield value;
    }

    *diffValue<T>(newV: any, oldV: any): IterableIterator<[number, T]> {
      if (oldV !== newV) {
        if (oldV !== undefined) yield [NO_POSITION, oldV];
        if (newV !== undefined) yield [0, newV];
      }
    }

    *subobjectChanges<T extends VersionedObject>(newV: T, oldV: T): IterableIterator<[-1 | 0 | 1, T]> {
      if (oldV !== newV) {
        if (oldV !== undefined) yield [-1, oldV];
        if (newV !== undefined) yield [1, newV];
      }
      else if (newV && newV.manager().isModified()) {
        yield [0, newV];
      }
    }
  }

  export class InstalledVirtualAttribute extends InstalledMonoAttribute {
    isVirtualValue(): boolean { return true; }
  }

  export class InstalledArrayAttribute extends InstalledAttribute {
    defaultValue(): any[] { return []; }
    isMonoValue(): boolean { return false; }
    isMultValue(): boolean { return true; }
    isArrayValue(): boolean { return true; }
    isSetValue(): boolean { return false; }
    isVirtualValue(): boolean { return false; }

    *traverseValueOrdered<T>(value: any[] | undefined): IterableIterator<[number, T]> {
      if (value)
        yield* value.entries();
    }

    *traverseValue<T>(value: any[] | undefined): IterableIterator<T> {
      if (value)
        yield* value;
    }

    *diffValue<T>(newV: any[] | undefined, oldV: any[] | undefined): IterableIterator<[number, T]> {
      if (oldV) {
        for (let [idx, o] of oldV.entries()) {
          if (!newV || newV[idx] !== o)
            yield [NO_POSITION, o];
        }
      }
      if (newV) {
        for (let [idx, n] of newV.entries()) {
          if (!oldV || oldV[idx] !== n)
            yield [idx, n];
        }
      }
    }

    *subobjectChanges<T extends VersionedObject>(newV: T[], oldV: T[]): IterableIterator<[-1 | 0 | 1, T]> {
      if (oldV) {
        for (let [idx, sub_object] of oldV.entries()) {
          if (!newV || newV[idx] !== sub_object)
            yield [-1, sub_object];
        }
      }
      if (newV) {
        for (let [idx, sub_object] of newV.entries()) {
          if (!oldV || oldV[idx] !== sub_object)
            yield [1, sub_object];
          else if (sub_object.manager().isModified())
            yield [0, sub_object];
        }
      }
    }
  }

  export class InstalledSetAttribute extends InstalledAttribute {
    defaultValue(): Set<any> { return new Set<any>(); }
    isMonoValue(): boolean { return false; }
    isMultValue(): boolean { return true; }
    isArrayValue(): boolean { return false; }
    isSetValue(): boolean { return true; }
    isVirtualValue(): boolean { return false; }

    *traverseValueOrdered<T>(value: Set<any> | undefined): IterableIterator<[number, T]> {
      if (value)
        for (let n of value)
          yield [ANY_POSITION, n];
    }

    *traverseValue<T>(value: Set<any> | undefined): IterableIterator<T> {
      if (value)
        for (let n of value)
          yield n;
    }

    *diffValue<T>(newV: Set<any> | undefined, oldV: Set<any> | undefined): IterableIterator<[number, T]> {
      if (oldV) for (let o of oldV)
        if (!newV || !newV.has(o))
          yield [NO_POSITION, o];
      if (newV) for (let n of newV)
        if (!oldV || !oldV.has(n))
          yield [ANY_POSITION, n];
    }

    *subobjectChanges<T extends VersionedObject>(newV: Set<T>, oldV: Set<T>): IterableIterator<[-1 | 0 | 1, T]> {
      if (oldV) for (let o of oldV) {
        if (!newV || !newV.has(o))
          yield [-1, o];
      }
      if (newV) for (let n of newV) {
        if (!oldV || !oldV.has(n))
          yield [1, n];
        else if (n.manager().isModified())
          yield [0, n];
      }
    }
  }

  const voAttributes = new Map<string, Aspect.InstalledAttribute>();
  voAttributes.set("_id", Aspect.attribute_id);
  voAttributes.set("_version", Aspect.attribute_version);

  export class Installed {
    readonly classname: string;
    readonly aspect: string;
    readonly version: number;
    readonly is_sub_object: boolean;
    readonly references: ImmutableList<Reference>;
    readonly categories: ImmutableSet<string>;
    readonly attribute_ref: InstalledAttribute;
    readonly attributes: ImmutableMap<string, InstalledAttribute>;
    readonly attributes_by_index: ImmutableList<InstalledAttribute>;
    readonly farMethods: ImmutableMap<string, InstalledFarMethod>;
    readonly implementation: VersionedObjectConstructor;

    /** @internal */ virtual_attributes: Map<string, InstalledAttribute>;

    /** @internal */ constructor(classname: string, aspect: string, version: number, is_sub_object: boolean, implementation: VersionedObjectConstructor) {
      this.classname = classname;
      this.version = version;
      this.aspect = aspect;
      this.is_sub_object = is_sub_object;
      this.references = [];
      this.categories = new Set();
      this.attribute_ref = new Aspect.InstalledMonoAttribute(
        "_id",
        0,
        { is: "type", type: "class", name: classname },
        Validation.validateId,
        undefined,
      );
      this.attributes = new Map(voAttributes);
      this.virtual_attributes = new Map();
      this.attributes_by_index = [Aspect.attribute_id, Aspect.attribute_version];
      this.farMethods = new Map();
      this.implementation = implementation;
    }

    checkedAttribute(attribute_name: string): InstalledAttribute {
      let attribute = this.attributes.get(attribute_name);
      if (!attribute)
        throw new Error(`attribute '${this.classname}.${attribute_name}' doesn't exists`);
      return attribute;
    }
  };
  export interface Factory<T extends VersionedObject> {
    (...args): T;
    new(...args): T;
  }

  export type Configuration = {
    name: string,
    aspect: string,
    cstor: VersionedObjectConstructor,
  }
  export type FastConfiguration<
    T extends VersionedObject = VersionedObject
  > = Configuration & {
    categories: string[],
    create(ccc: ControlCenterContext, ...args) : T,
  }
  export type Invokable<A0, R> = { to: VersionedObject, method: string, _check?: { _a0: A0, _r: R } };
  export type FarImplementation<P extends VersionedObject, A, R> = ((this: P, ctx: FarContext, arg: A) => R | Result<R> | Promise<R | Result<R>>);

  export const attribute_id = new Aspect.InstalledMonoAttribute(
    "_id",
    0,
    { is: "type", type: "primitive", name: "identifier" as Aspect.PrimaryType },
    Validation.validateId,
    undefined,
  );
  export const attribute_version = new Aspect.InstalledMonoAttribute(
    "_version",
    1,
    { is: "type", type: "primitive", name: "number" as Aspect.PrimaryType },
    Validation.validateVersion,
    undefined,
  );
}
