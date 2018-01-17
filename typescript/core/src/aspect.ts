import {
  ControlCenter, ControlCenterContext, VersionedObject, VersionedObjectManager, VersionedObjectConstructor,
  Result, DataSource,
  ImmutableList, ImmutableMap, ImmutableSet, DataSourceInternal, AspectConfiguration
} from './core';
import * as T from './aspect.type';
import {Reporter, PathReporter, Validate as V} from '@openmicrostep/msbuildsystem.shared';

export interface FarTransport {
  manual_coding?: boolean;
  remoteCall(ctx: Aspect.FarContext, to: VersionedObject, farMethod: Aspect.InstalledFarMethod, args: any[]): Promise<any>;
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
  export import Type = T.Type;
  export import VirtualType = Type.VirtualType;
  export type FarContext = { context: { ccc: ControlCenterContext, defaultDataSource?: DataSource.Categories.Public, [name: string]: VersionedObject | ControlCenterContext | undefined } };
  export const farTransportStub: FarTransport = {
    manual_coding: false,
    remoteCall(ctx, to, method, args) {
      return Promise.reject(new Error(`transport not installed`));
    },
  };

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

  export interface Definition {
    is: string;
    name: string;
    version: number;
    is_sub_object?: boolean;
    queries?: never[];
    attributes?: Definition.Attribute[];
    categories?: Definition.Category[];
    farCategories?: Definition.Category[];
    aspects: Aspect[];
  }
  export namespace Definition {
    export type PrimaryType = 'integer' | 'decimal' | 'date' | 'localdate' | 'string' | 'array' | 'dictionary' | 'identifier' | 'any' | 'boolean' | 'undefined' | 'binary';
    export type TypeVoid = { is: 'type', type: 'void' };
    export type TypePrimitive = { is: 'type', type: 'primitive', name: PrimaryType };
    export type TypeClass = { is: 'type', type: 'class', name: string, scopes?: Scope[] };
    export type TypeArray = { is: 'type', type: 'array', itemType: Type, min: number, max: number | "*" };
    export type TypeSet = { is: 'type', type: 'set', itemType: Type, min: number, max: number | "*" };
    export type TypeDictionary = { is: 'type', type: 'dictionary', properties: { [s: string]: Type } };
    export type TypeOr = { is: 'type', type: 'or', types: Type[] }
    export type Type = TypeVoid | TypePrimitive | TypeClass | TypeArray | TypeSet | TypeDictionary | TypeOr;
    export type Scope = { is: 'scope', name: string, scope?: DataSourceInternal.Scope };

    export interface Attribute {
      is: string;
      name: string;
      type: Type;
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
  }

  export interface InstalledMethod {
    name: string;
    argumentTypes: Type[];
    returnType: Type | undefined;
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
      public readonly relation: Reference | undefined = undefined,
      public readonly contained_aspects: ImmutableSet<Aspect.Installed> = new Set(),
      public readonly is_sub_object: boolean = false,
    ) {}

    abstract defaultValue(): any;
    containsVersionedObject(): boolean {
      return this.contained_aspects.size > 0;
    }
    containedVersionedObjectIfAlone(): Aspect.Installed | undefined {
      return this.contained_aspects.size === 1 ? this.contained_aspects.values().next().value : undefined;
    }
    isMonoVersionedObjectValue(): boolean {
      return this.isMonoValue() && this.contained_aspects.size > 0;
    }
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

  export function create_virtual_attribute(name: string, type: Type.VirtualType) : Aspect.InstalledAttribute {
    return new InstalledVirtualAttribute(name, -1, type);
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

  export const attribute_id = new Aspect.InstalledMonoAttribute(
    "_id",
    0,
    Type.identifierType,
  );
  export const attribute_version = new Aspect.InstalledMonoAttribute(
    "_version",
    1,
    Type.versionType,
  );

  const voAttributes = new Map<string, Aspect.InstalledAttribute>();
  voAttributes.set("_id", attribute_id);
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
        new Type.VersionedObjectType(classname, implementation),
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
}
