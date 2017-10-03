import {
  ControlCenter, VersionedObject, VersionedObjectManager, VersionedObjectConstructor,
  Validation,
} from './core';
import {Async} from '@openmicrostep/async';
import {Reporter, AttributeTypes, AttributePath} from '@openmicrostep/msbuildsystem.shared';

export interface FarTransport {
  remoteCall(to: VersionedObject, method: string, args: any[]): Promise<any>;
}

export interface PublicTransport {
  installMethod(cstor: VersionedObjectConstructor, method: Aspect.InstalledFarMethod);
}

export interface Aspect {
  is: string;
  name: string;
  categories: string[];
  farCategories: string[];
};
export namespace Aspect {
  export const farTransportStub: FarTransport = {
    remoteCall(to: VersionedObject, method: string, args: any[]): Promise<any> {
      return Promise.reject(`transport not installed`);
    }
  };

  export const localTransport: FarTransport = {
    remoteCall(to: VersionedObject, method: string, args: any[]): Promise<any> {
      let impl = to[method];
      if (typeof impl === "function")
        return fastSafeCall(to[method], to, args[0]);
      return Promise.reject(`method ${method} not found on ${to.manager().name()}`);
    }
  };

  export function typeIsClass(type: Type) : boolean {
    if (type.type === "class")
      return true;

    if (type.type === "array" || type.type === "set")
      return typeIsClass(type.itemType);

    if (type.type === "or") {
      for (let t of type.types) {
        if (t.type !== "class")
          return false;
      }
      return type.types.length > 0;
    }

    return false;
  }

  export function typeIsMultiple(type: Type) : boolean {
    return type.type === "array" || type.type === "set";
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
      factory: throw_disabled,
    };
  }

  export type PrimaryType = 'integer' | 'decimal' | 'date' | 'localdate' | 'string' | 'array' | 'dictionary' | 'identifier' | 'any' | 'object' | 'boolean';
  export type TypeVoid       =  { is: 'type', type: 'void' };
  export type TypePrimitive  =  { is: 'type', type: 'primitive', name: PrimaryType };
  export type TypeClass      =  { is: 'type', type: 'class', name: string };
  export type TypeArray      =  { is: 'type', type: 'array', itemType: Type, min: number, max: number | "*" };
  export type TypeSet        =  { is: 'type', type: 'set', itemType: Type , min: number, max: number | "*"};
  export type TypeDictionary =  { is: 'type', type: 'dictionary', properties: { [s: string]: Type } };
  export type TypeOr         =  { is: 'type', type: 'or', types: Type[] }
  export type Type = TypeVoid | TypePrimitive | TypeClass | TypeArray | TypeSet | TypeDictionary | TypeOr ;
  export type TypeValidator = AttributeTypes.Validator0<any>;
  export type AttributeTypeValidator = AttributeTypes.Validator<any, VersionedObjectManager<VersionedObject>>;
  export interface Definition {
    is: string;
    name: string;
    version: number;
    queries?: never[];
    attributes?: Attribute[];
    categories?: Category[];
    farCategories?: Category[];
    aspects: Aspect[];
  }
  export interface Attribute {
    is: string;
    name: string;
    type: Type;
    validator?: AttributeTypeValidator;
    relation?: string;
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
    class: string;
    attribute: string;
  };
  export interface InstalledAttribute {
    name: string;
    type: Type;
    validator: AttributeTypeValidator;
    relation: Reference | undefined;
  };
  export interface Installed {
    name: string;
    aspect: string;
    version: number;
    references: Reference[];
    categories: Set<string>;
    attributes: Map<string, InstalledAttribute>;
    farMethods: Map<string, InstalledFarMethod>;
    implementation: VersionedObjectConstructor;
  };
  export interface Factory<T extends VersionedObject> {
    (...args): T;
    new(...args): T;
  }

  export type Configuration = {
    name: string,
    aspect: string,
    cstor: VersionedObjectConstructor,
    farTransports?: { transport: FarTransport, categories: string[] }[]
  }
  export type FastConfiguration<
    T extends VersionedObject = VersionedObject
  > = Configuration & {
    categories: string[],
    create(cc: ControlCenter, ...args) : T,
    factory(cc: ControlCenter) : Factory<T>,
  }
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


const installedAttributesOnImpl = new Map<string, {
  attributes: Map<string, Aspect.InstalledAttribute>;
  references: Aspect.Reference[];
  impls: Set<VersionedObjectConstructor>
}>();
const voAttributes = {
  attributes: new Map<string, Aspect.InstalledAttribute>(),
  references: [],
  impls: new Set<VersionedObjectConstructor>([VersionedObject]),
};
installedAttributesOnImpl.set(VersionedObject.definition.name, voAttributes);

voAttributes.attributes.set("_id", {
  name: "_id",
  type: { is: "type", type: "primitive", name: "any" as Aspect.PrimaryType },
  validator: Validation.validateId,
  relation: undefined,
});
voAttributes.attributes.set("_version", {
  name: "_version",
  type: { is: "type", type: "primitive", name: "number" as Aspect.PrimaryType },
  validator: Validation.validateVersion,
  relation: undefined,
});

export class AspectConfiguration {
  private readonly _aspects = new Map<string, VersionedObjectConstructorCache>();
  private readonly _cachedCategories = new Map<string, Map<string, Aspect.InstalledMethod>>();

  constructor(classes: Aspect.Configuration[], defaultFarTransport?: FarTransport) {
    for (let { name, aspect, cstor, farTransports } of classes) {
      let aspect_cstor = this._aspects.get(name);
      if (aspect_cstor)
        throw new Error(`an aspect with class name ${name} already exists`);

      let attrs = this.installAttributes(cstor);
      aspect_cstor = nameClass(`${name}:${aspect}`, `${name}`, class CachedAspect extends cstor {
        static aspect: Aspect.Installed = {
          name: name,
          version: cstor.definition.version,
          aspect: aspect,
          references: attrs.references,
          categories: new Set(),
          attributes: attrs.attributes,
          farMethods: new Map(),
          implementation: cstor,
        };
      });
      let categories = aspect_cstor.aspect.categories;
      let aspect_def = cstor.definition.aspects.find(a => a.name === aspect);
      if (!aspect_def)
        throw new Error(`aspect ${aspect} not found in ${name} definition`);
      aspect_def.categories.forEach(c => {
        categories.add(c);
        this.installLocalCategoryCache(this.cachedCategory(name, c, cstor), aspect_cstor!, cstor);
      });
      aspect_def.farCategories.forEach(category_name => {
        categories.add(category_name);
        let ft = farTransports && farTransports.find(t => t.categories.indexOf(category_name) !== -1);
        let t = ft && ft.transport;
        if (!t)
          t = defaultFarTransport;
        if (!t)
          throw new Error(`no far transport on ${category_name} for ${name}`);
        this.installFarCategoryCache(this.cachedCategory(name, category_name, cstor), aspect_cstor!, cstor, t);
      });
      this._aspects.set(name, aspect_cstor);
    }
  }

  private _cstor(classname: string, categories: string[]) {
    let cstor = this._aspects.get(classname);
    if (!cstor)
      throw new Error(`cannot create ${classname}: no aspect found`);
    for (let category of categories)
      if (!cstor.aspect.categories.has(category))
        throw new Error(`cannot create ${classname}: category ${category} is missing in aspect ${cstor.aspect.aspect}`);
    return cstor;
  }

  create<T extends VersionedObject>(cc: ControlCenter, classname: string, categories: string[], ...args: any[]) : T {
    let cstor = this._cstor(classname, categories);
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

  aspectFactory<T extends VersionedObject>(cc: ControlCenter, classname: string, categories: string[]) : Aspect.Factory<T> {
    let cstor = this._cstor(classname, categories);
    return function factory (...args) {
      return new cstor!(cc, ...args);
    } as any;
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
      if (local_method.transport) {
        aspect_cstor.aspect.farMethods.set(category_name, Object.assign({}, local_method, { transport: Aspect.localTransport }));
      }
      else {
        let localImpl = cstor.prototype[local_method.name];
        if (typeof localImpl !== "function")
          throw new Error(`implementation of local method ${local_method.name} must be a function, got ${typeof localImpl}`);
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
      aspect_cstor.aspect.farMethods.set(method_name, Object.assign({}, far_method as Aspect.InstalledFarMethod, { transport: transport }));
    });
  }

  private installAttribute(from: VersionedObjectConstructor, attribute: Aspect.Attribute) {
    const data: Aspect.InstalledAttribute = {
      name: attribute.name as keyof VersionedObject,
      validator: attribute.validator || this.createValidator(true, attribute.type),
      type: attribute.type,
      relation: undefined
    };
    if (attribute.relation) {
      if (attribute.type.type === "class")
        data.relation = { class: attribute.type.name, attribute: attribute.relation };
      else if ((attribute.type.type === "array" || attribute.type.type === "set") && attribute.type.itemType.type === "class")
        data.relation = { class: attribute.type.itemType.name, attribute: attribute.relation };
      else
        throw new Error(`attribute type of a relation must be a class, an array of classes or a set of classes`);
    }
    findReferences(attribute.type, (ref) => {
      let attr = installedAttributesOnImpl.get(ref);
      if (attr) attr.references.push({ class: from.definition.name, attribute: attribute.name });
    });
    return data;
  }

  private installAttributeData(from: VersionedObjectConstructor, data: Aspect.InstalledAttribute) {
    Object.defineProperty(from.prototype, data.name, {
      enumerable: true,
      get(this: VersionedObject) { return this.__manager.attributeValue(data.name as keyof VersionedObject); },
      set(this: VersionedObject, value) {
        let manager = this.manager();
        value = validateValue(value, new AttributePath(manager.aspect().name, manager.id(), '.', data.name), data.validator, manager);
        this.__manager.setAttributeValueFast(data.name as keyof VersionedObject, value, data);
      }
    });
    return data;
  }

  private installAttributes(from: VersionedObjectConstructor): { references: Aspect.Reference[], attributes: Map<string, Aspect.InstalledAttribute> } {
    let ret = installedAttributesOnImpl.get(from.definition.name);
    if (!ret) {
      ret = {
        attributes: from.parent ? new Map(this.installAttributes(from.parent).attributes) : new Map(),
        references: [],
        impls: new Set<VersionedObjectConstructor>(),
      };
      if (from.definition.attributes) from.definition.attributes.forEach(attribute => {
        const data = this.installAttribute(from, attribute);
        ret!.attributes.set(data.name, data);
      });
      installedAttributesOnImpl.set(from.definition.name, ret);
    }
    if (!ret.impls.has(from)) {
      ret.impls.add(from);
      if (from !== VersionedObject)
        ret.attributes.forEach(data => this.installAttributeData(from, data));
    }
    return ret;
  }

  private arrayValidator(forAttribute: boolean, lvl: number, itemType: Aspect.Type, min: number, max: number | '*') : Aspect.TypeValidator {
    let validateItem = this.createValidator(forAttribute, itemType, lvl + 1);
    return { validate: function validateArray(reporter: Reporter, path: AttributePath, value: any) {
      if (Array.isArray(value)) {
        if (forAttribute)
          value = [...value];
        return validate(reporter, path, value, validateItem, min, max);
      }
      else
        path.diagnostic(reporter, { type: "warning", msg: `attribute must be an array`});
      return undefined;
    }};
  }
  private setValidator(forAttribute: boolean, lvl: number, itemType: Aspect.Type, min: number, max: number | '*') : Aspect.TypeValidator {
    let validateItem = this.createValidator(forAttribute, itemType, lvl + 1);
    return { validate: function validateSet(reporter: Reporter, path: AttributePath, value: any) {
      if (value instanceof Set) {
        if (forAttribute)
          value = new Set(value);
        return validate(reporter, path, value, validateItem, min, max);
      }
      else
        path.diagnostic(reporter, { type: "warning", msg: `attribute must be a set`});
      return undefined;
    }};
  }
  private propertiesValidator(forAttribute: boolean, lvl: number, properties:  { [s: string]: Aspect.Type }) : Aspect.TypeValidator {
    let extensions: AttributeTypes.Extensions<any, VersionedObjectManager> = {};
    let objectForKeyValidator: Aspect.TypeValidator = AttributeTypes.validateAnyToUndefined;
    for (let k in properties) {
      if (k === '*')
        objectForKeyValidator = this.createValidator(forAttribute, properties[k], lvl + 1);
      else
        extensions[k] = this.createValidator(forAttribute, properties[k], lvl + 1);
    }
    return AttributeTypes.objectValidator(extensions, objectForKeyValidator);
  }
  private createValidator(forAttribute: boolean, type: Aspect.Type, lvl = 0) : Aspect.TypeValidator {
    if (forAttribute && lvl > 0 && type.type !== "primitive" && type.type !== "class" && type.type !== "or")
      throw new Error(`cannot create deep type validator for attribute`);
    switch (type.type) {
      case "primitive": return forAttribute && lvl === 0 ? Validation.primitiveLevel0Validators[type.name] : Validation.primitiveValidators[type.name];
      case "class": return forAttribute ? Validation.classValidator(type.name, forAttribute && lvl === 0) : AttributeTypes.validateAny;
      case "array": return this.arrayValidator(forAttribute, lvl, type.itemType, type.min, type.max);
      case "set": return this.setValidator(forAttribute, lvl, type.itemType, type.min, type.max);
      case "dictionary": return this.propertiesValidator(forAttribute, lvl, type.properties);
      case "or": return AttributeTypes.oneOf(...type.types.map(t => this.createValidator(forAttribute, t, lvl)));
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
  reporter: Reporter, path: AttributePath,
  collection: any, validateItem: Aspect.TypeValidator,
  min: number, max: number | '*'
) {
  path.pushArray();
  if (collection.size < min)
    path.diagnostic(reporter, { type: "warning", msg: `attribute must contains at least ${min} elements`});
  if (max !== '*' && collection.size > max)
    path.diagnostic(reporter, { type: "warning", msg: `attribute must contains at most ${max} elements`});
  let i = 0;
  collection.forEach((v) => validateItem.validate(reporter, path.setArrayKey(i++), v));
  path.popArray();
  return collection;
}
function validateValue(value, path: AttributePath, validator: Aspect.TypeValidator): any;
function validateValue(value, path: AttributePath, validator: Aspect.AttributeTypeValidator, manager: VersionedObjectManager): any;
function validateValue(value, path: AttributePath, validator: Aspect.AttributeTypeValidator, manager?: VersionedObjectManager) {
  let reporter = new Reporter();
  value = validator.validate(reporter, path, value, manager!);
  if (reporter.diagnostics.length > 0)
    throw new Error(`attribute ${path} value is invalid: ${JSON.stringify(reporter.diagnostics, null, 2)}`);
  return value;
}

function fastSafeCall(farImpl: Function, self, arg0): Promise<any> {
  try {
    if (farImpl.length === 0) return Promise.resolve(farImpl.call(self));
    else if (farImpl.length === 1) return Promise.resolve(farImpl.call(self, arg0));
    else {
      return new Promise((resolve) => {
        Async.run<{ result: any}>({ result: undefined }, [
          (p) => { farImpl.call(self, p, arg0); },
          (p) => { resolve(p.context.result); p.continue(); }
        ]);
      });
    }
  } catch (e) {
    return Promise.reject(e);
  }
}
