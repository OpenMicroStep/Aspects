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

export interface VersionedObjectConstructorCache extends VersionedObjectConstructor {
  aspect: Aspect.Installed;
}

function nameClass<T extends { new(...args): any }>(name: string, parent: string, cls: T) : T {
  (cls as any).displayName = name;
  (cls as any).toString = function toCustomNameString(this: Function) {
    return `class ${name} extends ${parent} {}`;
  };
  Object.defineProperty(cls, "name", { value: name, configurable: true });
  return cls;
}

const voAttributes = new Map<string, Aspect.InstalledAttribute>();
voAttributes.set("_id", Aspect.attribute_id);
voAttributes.set("_version", Aspect.attribute_version);

export class AspectSelection {
  /** @internal */ _classes: { name: string, aspect: string, cstor: VersionedObjectConstructor }[];
  constructor(classes: { name: string, aspect: string, cstor: VersionedObjectConstructor }[]) {
    let uniq = new Set<string>();
    for (let { name } of classes) {
      if (uniq.has(name))
        throw new Error(`an aspect with class name ${name} already exists`);
      uniq.add(name);
    }
    this._classes = classes.slice(0);
  }

  classes(): Iterable<Readonly<{ name: string, aspect: string, cstor: VersionedObjectConstructor }>> {
    return this._classes;
  }
}
export class AspectConfiguration {
  private readonly _aspects = new Map<string, VersionedObjectConstructorCache>();
  private readonly _cachedCategories = new Map<string, Map<string, Aspect.InstalledMethod>>();
  /** @internal */ readonly _initDefaultContext: ((ccc: ControlCenterContext) => { [name: string]: VersionedObject }) | undefined;
  constructor(options: {
    selection: AspectSelection,
    farTransports?: { transport: FarTransport, classes: string[], farCategories: string[] }[],
    defaultFarTransport?: FarTransport,
    initDefaultContext?: (ccc: ControlCenterContext) => { [name: string]: VersionedObject },
  })
  constructor(selection: AspectSelection)
  constructor(options: AspectSelection | {
    selection: AspectSelection,
    farTransports?: { transport: FarTransport, classes: string[], farCategories: string[] }[],
    defaultFarTransport?: FarTransport,
    initDefaultContext?: (ccc: ControlCenterContext) => { [name: string]: VersionedObject },
  }) {
    if (options instanceof AspectSelection)
      options = { selection: options };
    let { selection, farTransports, defaultFarTransport,initDefaultContext } = options;

    this._initDefaultContext = initDefaultContext;

    for (let { name, aspect, cstor } of selection.classes()) {
      let aspect_cstor = this._aspects.get(name);
      if (aspect_cstor)
        throw new Error(`an aspect with class name ${name} already exists`);

      aspect_cstor = nameClass(`${name}:${aspect}`, `${name}`, class CachedAspect extends cstor {
        static aspect = new Aspect.Installed(
          name,
          aspect,
          cstor.definition.version,
          cstor.definition.is_sub_object === true,
          cstor,
        );
      });
      this._aspects.set(name, aspect_cstor);
    }

    let installed_attributes = new Set<VersionedObjectConstructorCache>();
    let pending_relations: [Aspect.Installed, Aspect.InstalledAttribute, string][] = [];
    for (let { name, aspect, cstor } of selection.classes()) {
      let aspect_cstor = this._aspects.get(name)!;

      let categories = aspect_cstor.aspect.categories as Set<string>;
      let aspect_def = cstor.definition.aspects.find(a => a.name === aspect);
      if (!aspect_def)
        throw new Error(`aspect ${aspect} not found in ${name} definition`);
      aspect_def.categories.forEach(c => {
        categories.add(c);
        this.installLocalCategoryCache(this.cachedCategory(name, c, cstor), aspect_cstor!, cstor);
      });
      aspect_def.farCategories.forEach(category_name => {
        categories.add(category_name);
        let ft = farTransports && farTransports.find(t => t.farCategories.indexOf(category_name) !== -1 && t.classes.indexOf(name) !== -1);
        let t = ft && ft.transport;
        if (!t)
          t = defaultFarTransport;
        if (!t)
          throw new Error(`no far transport on ${category_name} for ${name}`);
        this.installFarCategoryCache(this.cachedCategory(name, category_name, cstor), aspect_cstor!, cstor, t);
      });

      this.install_attributes(aspect_cstor, installed_attributes, pending_relations);
    }
    this.install_attribute_relations(pending_relations);
  }

  cstor(classname: string, categories: string[]) {
    let cstor = this._aspects.get(classname);
    if (!cstor)
      throw new Error(`cannot create ${classname}: no aspect found`);
    for (let category of categories)
      if (!cstor.aspect.categories.has(category))
        throw new Error(`cannot create ${classname}: category ${category} is missing in aspect ${cstor.aspect.aspect}`);
    return cstor;
  }

  create<T extends VersionedObject>(cc: ControlCenter, classname: string, categories: string[], ...args: any[]) : T {
    let cstor = this.cstor(classname, categories);
    return new cstor(cc, ...args) as T;
  }

  aspect(classname: string) : Aspect.Installed | undefined {
    let cstor = this._aspects.get(classname);
    return cstor ? cstor.aspect : undefined;
  }

  aspectChecked(classname: string) : Aspect.Installed {
    let cstor = this._aspects.get(classname);
    if (!cstor)
      throw new Error(`cannot find aspect ${classname}`);
    return cstor.aspect;
  }

  *aspects(): IterableIterator<Aspect.Installed> {
    for (let cstor of this._aspects.values())
      yield cstor.aspect;
  }

  installPublicTransport(transport: PublicTransport, on: VersionedObjectConstructor, categories: string[]) {
    for (let categoryName of categories) {
      this.buildCategoryCache(categoryName, on).forEach(method => {
        if (method.transport) { // far method
          transport.installMethod(on, method as Aspect.InstalledFarMethod);
        }
      });
    }
  }

  private cachedCategory(name: string, category: string, from: VersionedObjectConstructor): Map<string, Aspect.InstalledMethod> {
    let key = JSON.stringify([name, category]);
    let tmp = this._cachedCategories.get(key);
    if (!tmp) {
      this._cachedCategories.set(key, tmp = this.buildCategoryCache(category, from));
    }
    return tmp;
  }

  private buildMethodList(categoryName: string, from: VersionedObjectConstructor, map = new Map<string, Aspect.Method>()) : ['far' | 'local' | undefined, Map<string, Aspect.Method>] {
    let r: ['far' | 'local' | undefined, Map<string, Aspect.Method>];
    r = from.parent ? this.buildMethodList(categoryName, from.parent, map) : [undefined, map];
    let definition = from.definition;
    let category = (definition.categories || []).find(cel => cel.name === categoryName) || (definition.farCategories || []).find(cel => cel.name === categoryName);
    if (category) {
      let type = r[0];
      if (type === undefined)
        r[0] = type = category.is === "farCategory" ? 'far' : 'local';
      else if ((type === 'far') !== (category.is === "farCategory"))
        throw new Error(`category '${category.name}' is already defined as ${type} by subclasses`);
      category.methods.forEach(method => { map.set(method.name, method); });
    }
    return r;
  }

  private buildCategoryCache(categoryName: string, from: VersionedObjectConstructor): Map<string, Aspect.InstalledMethod> {
    let ret = new Map<string, Aspect.InstalledMethod>();
    let list = this.buildMethodList(categoryName, from);
    let isFar = list[0] === "far";
    list[1].forEach(method => {
      let farMethod = Object.assign({}, method, {
        argumentValidators: method.argumentTypes.map(t => this.createValidator(false, t)),
        returnValidator: method.returnType.type !== "void" ? this.createValidator(false, method.returnType) : undefined,
        transport: isFar ? Aspect.farTransportStub : undefined
      });
      ret.set(method.name, farMethod);
    });
    return ret;
  }

  private installLocalCategoryCache(cache: Map<string, Aspect.InstalledMethod>, aspect_cstor: VersionedObjectConstructorCache, cstor: VersionedObjectConstructor) {
    cache.forEach((local_method, category_name) => {
      let localImpl = cstor.prototype[local_method.name];
      if (!(local_method.name in cstor.prototype))
        throw new Error(`local method ${local_method.name} is missing for category ${category_name} in ${cstor.name}`);
      if (typeof localImpl !== "function")
        throw new Error(`implementation of local method ${local_method.name} must be a function, got ${typeof localImpl}`);
      if (local_method.transport) {
        (aspect_cstor.aspect.farMethods as Map<string, Aspect.InstalledMethod>).set(category_name, Object.assign({}, local_method, {
          transport: {
            remoteCall(ctx, to: VersionedObject, method: string, args: any[]): Promise<any> {
              return fastSafeCall(ctx, localImpl, to, args[0]);
            }
          } as FarTransport
        }));
        this.installCanFarInvokable(aspect_cstor, local_method.name);
      }
      else {
        if (localImpl.length !== local_method.argumentTypes.length && localImpl.name)
          throw new Error(`arguments count in implementation of local method ${local_method.name} doesn't match interface definition: ${localImpl.length} !== ${local_method.argumentTypes.length}`);
        aspect_cstor.prototype[local_method.name] = localImpl; // TODO: protect localImpl;
      }
    });
  }

  private installFarCategoryCache(cache: Map<string, Aspect.InstalledMethod>, aspect_cstor: VersionedObjectConstructorCache, cstor: VersionedObjectConstructor, transport: FarTransport) {
    cache.forEach((far_method, method_name) => {
      if (!far_method.transport)
        throw new Error(`${far_method.name} is not a far method`);
      (aspect_cstor.aspect.farMethods as Map<string, Aspect.InstalledMethod>).set(method_name, Object.assign({}, far_method as Aspect.InstalledFarMethod, { transport: transport }));
      this.installCanFarInvokable(aspect_cstor, method_name);
    });
  }

  private installCanFarInvokable(aspect_cstor: VersionedObjectConstructorCache, method_name: string) {
    Object.defineProperty(aspect_cstor.prototype, method_name, {
      enumerable: false,
      configurable: false,
      get() {
        return { to: this, method: method_name };
      },
    });
  }

  private install_attributes(
    aspect_cstor: VersionedObjectConstructorCache,
    installed_attributes: Set<VersionedObjectConstructorCache>,
    pending_relations: [Aspect.Installed, Aspect.InstalledAttribute, string][]
  ) {
    if (!installed_attributes.has(aspect_cstor)) {
      let attributes = aspect_cstor.aspect.attributes;
      let attributes_by_index = aspect_cstor.aspect.attributes_by_index;
      let cstor: VersionedObjectConstructor | undefined = aspect_cstor.aspect.implementation;
      let will_install: VersionedObjectConstructor[] = [];
      while (cstor && cstor !== VersionedObject) {
        will_install.unshift(cstor);
        cstor = cstor.parent;
      }
      for (cstor of will_install) {
        for (let attribute of cstor.definition.attributes || []) {
          const data = this.install_attribute(aspect_cstor, attribute, attributes_by_index.length, pending_relations);
          (attributes_by_index as Aspect.InstalledAttribute[]).push(data);
          (attributes as Map<string, Aspect.InstalledAttribute>).set(data.name, data);
        }
      }
      installed_attributes.add(aspect_cstor);
    }
  }

  private install_attribute(
    aspect_cstor: VersionedObjectConstructorCache,
    attribute_definition: Aspect.Attribute,
    index: number,
    pending_relations: [Aspect.Installed, Aspect.InstalledAttribute, string][]
  ) {
    let contains_types = Aspect.typeToAspectNames(attribute_definition.type);
    let cstor = typeToInstalledAttributeCstor(attribute_definition.type);
    const attribute = new cstor(
      attribute_definition.name as keyof VersionedObject,
      index,
      attribute_definition.type,
      attribute_definition.validator || this.createValidator(true, attribute_definition.type),
      undefined,
      contains_types.length > 0,
      attribute_definition.is_sub_object === true,
    );
    for (let name of contains_types) {
      let sub_aspect_cstor = this._aspects.get(name);
      if (!sub_aspect_cstor)
        throw new Error(`attribute ${aspect_cstor.aspect.classname}.${attribute.name} requires class ${name} to work`);
      let sub_aspect = sub_aspect_cstor.aspect;
      if (attribute.is_sub_object && !sub_aspect.is_sub_object)
        throw new Error(`attribute ${aspect_cstor.aspect.classname}.${attribute.name} is marked as sub object while ${name} is not`);
      (sub_aspect.references as Aspect.Reference[]).push({ class: aspect_cstor.aspect, attribute: attribute });
    }

    Object.defineProperty(aspect_cstor.prototype, attribute.name, {
      enumerable: true,
      get(this: VersionedObject) {
        return this.__manager.attributeValueFast(attribute);
      },
      set(this: VersionedObject, value) {
        let manager = this.__manager;
        value = validateValue(value, new PathReporter(new Reporter(), manager._aspect.classname, manager.id(), '.', attribute.name), attribute.validator, manager);
        manager.setAttributeValueFast(attribute, value);
      }
    });

    if (attribute_definition.relation)
      pending_relations.push([aspect_cstor.aspect, attribute, attribute_definition.relation]);
    return attribute;
  }

  private install_attribute_relations(pending_relations: [Aspect.Installed, Aspect.InstalledAttribute, string][]) {
    for (let [aspect, attribute, relation] of pending_relations) {
      let contains_types = Aspect.typeToAspectNames(attribute.type);
      if (contains_types.length !== 1)
        throw new Error(`attribute ${aspect.classname}.${attribute.name} type of a relation must be a class, an array of classes or a set of classes`);
      let relation_aspect = this._aspects.get(contains_types[0])!.aspect;
      let relation_attribute = relation_aspect.attributes.get(relation);
      if (!relation_attribute)
        throw new Error(`attribute ${aspect.classname}.${attribute.name} contains a relation to an unknown attribute ${relation_aspect.classname}.${relation}`);
      (attribute.relation as Aspect.Reference) = { class: relation_aspect, attribute: relation_attribute };
    }
    for (let [aspect, attribute] of pending_relations) {
      let relation_aspect = attribute.relation!.class;
      let relation_attribute = attribute.relation!.attribute;
      if (!relation_attribute.relation)
        throw new Error(`relation ${aspect.classname}.${attribute.name} - ${relation_aspect.classname}.${relation_attribute.name} is not bidirectional`);
      if (relation_attribute.relation.class !== aspect)
        throw new Error(`relation ${aspect.classname}.${attribute.name} - ${relation_aspect.classname}.${relation_attribute.name} is type incoherent`);
      if (relation_attribute.relation.attribute !== attribute)
        throw new Error(`relation ${aspect.classname}.${attribute.name} - ${relation_aspect.classname}.${relation_attribute.name} is attribute incoherent`);
    }
  }

  private arrayValidator(forAttribute: boolean, lvl: number, itemType: Aspect.Type, min: number, max: number | '*') : Aspect.TypeValidator {
    let validateItem = this.createValidator(forAttribute, itemType, lvl + 1);
    return { validate: function validateArray(at: PathReporter, value: any) {
      if (Array.isArray(value)) {
        if (forAttribute)
          value = [...value];
        return validate(at, value, validateItem, min, max);
      }
      else
        at.diagnostic({ is: "warning", msg: `attribute must be an array`});
      return undefined;
    }};
  }
  private setValidator(forAttribute: boolean, lvl: number, itemType: Aspect.Type, min: number, max: number | '*') : Aspect.TypeValidator {
    let validateItem = this.createValidator(forAttribute, itemType, lvl + 1);
    return { validate: function validateSet(at: PathReporter, value: any) {
      if (value instanceof Set) {
        if (forAttribute)
          value = new Set(value);
        return validate(at, value, validateItem, min, max);
      }
      else
        at.diagnostic({ is: "warning", msg: `attribute must be a set`});
      return undefined;
    }};
  }
  private propertiesValidator(forAttribute: boolean, lvl: number, properties:  { [s: string]: Aspect.Type }) : Aspect.TypeValidator {
    let extensions: V.Extensions<any, VersionedObjectManager> = {};
    let objectForKeyValidator: Aspect.TypeValidator = V.validateAnyToUndefined;
    for (let k in properties) {
      if (k === '*')
        objectForKeyValidator = this.createValidator(forAttribute, properties[k], lvl + 1);
      else
        extensions[k] = this.createValidator(forAttribute, properties[k], lvl + 1);
    }
    return V.objectValidator(extensions, objectForKeyValidator) as Aspect.TypeValidator;
  }
  private createValidator(forAttribute: boolean, type: Aspect.Type, lvl = 0) : Aspect.TypeValidator {
    if (forAttribute && lvl > 0 && type.type !== "primitive" && type.type !== "class" && type.type !== "or")
      throw new Error(`cannot create deep type validator for attribute`);
    switch (type.type) {
      case "primitive": return forAttribute && lvl === 0 ? Validation.primitiveLevel0Validators[type.name] : Validation.primitiveValidators[type.name];
      case "class": return forAttribute ? Validation.classValidator(type.name, forAttribute && lvl === 0) : V.validateAny;
      case "array": return this.arrayValidator(forAttribute, lvl, type.itemType, type.min, type.max);
      case "set": return this.setValidator(forAttribute, lvl, type.itemType, type.min, type.max);
      case "dictionary": return this.propertiesValidator(forAttribute, lvl, type.properties);
      case "or": return V.oneOf(...type.types.map(t => this.createValidator(forAttribute, t, lvl)));
    }
    throw new Error(`cannot create ${type.type} type validator`);
  }
}

function findReferences(type: Aspect.Type, apply: (ref: string) => void) {
  switch (type.type) {
    case 'array': findReferences(type.itemType, apply); break;
    case 'set': findReferences(type.itemType, apply); break;
    case 'class': apply(type.name); break;
    case 'dictionary': Object.keys(type.properties).forEach(k => findReferences(type.properties[k], apply)); break;
  }
}

function validate(
  at: PathReporter,
  collection: any, validateItem: Aspect.TypeValidator,
  min: number, max: number | '*'
) {
  at.pushArray();
  if (collection.size < min)
    at.diagnostic({ is: "warning", msg: `attribute must contains at least ${min} elements`});
  if (max !== '*' && collection.size > max)
    at.diagnostic({ is: "warning", msg: `attribute must contains at most ${max} elements`});
  let i = 0;
  collection.forEach((v) => validateItem.validate(at.setArrayKey(i++), v));
  at.popArray();
  return collection;
}
function validateValue(value, at: PathReporter, validator: Aspect.TypeValidator): any;
function validateValue(value, at: PathReporter, validator: Aspect.AttributeTypeValidator, manager: VersionedObjectManager): any;
function validateValue(value, at: PathReporter, validator: Aspect.AttributeTypeValidator, manager?: VersionedObjectManager) {
  value = validator.validate(at, value, manager!);
  if (at.reporter.diagnostics.length > 0)
    throw new Error(`attribute ${at} value is invalid: ${JSON.stringify(at.reporter.diagnostics, null, 2)}`);
  return value;
}

function fastSafeCall(ctx: Aspect.FarContext, farImpl: Aspect.FarImplementation<VersionedObject, any, any>, self, arg0): Promise<any> {
  try {
    return Promise.resolve(farImpl.call(self, ctx, arg0));
  } catch (e) {
    return Promise.reject(e);
  }
}

function typeToInstalledAttributeCstor(type: Aspect.Type) {
  if (Aspect.typeIsArrayValue(type))
    return Aspect.InstalledArrayAttribute;
  if (Aspect.typeIsSetValue(type))
    return Aspect.InstalledSetAttribute;
  return Aspect.InstalledMonoAttribute;
}
