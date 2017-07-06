import { 
  ControlCenter, VersionedObject, VersionedObjectManager, VersionedObjectConstructor, Invocation, InvocationState, Identifier, DataSourceInternal,
  ImmutableSet, ImmutableList, ImmutableMap,
  Validation,
} from './core';
import {Async, Flux} from '@openmicrostep/async';
import {Reporter, AttributeTypes, AttributePath} from '@openmicrostep/msbuildsystem.shared';

export interface FarTransport {
  remoteCall(to: VersionedObject, method: string, args: any[]): Promise<any>;
}

export interface PublicTransport {
  installMethod(cstor: VersionedObjectConstructor<VersionedObject>, method: Aspect.InstalledFarMethod);
}

export interface Aspect {
  is: string;
  name: string;
  categories: string[];
  farCategories: string[];
};
export namespace Aspect {
  export const farTransportStub = {
    remoteCall(to: VersionedObject, method: string, args: any[]): Promise<any> {
      return Promise.reject(`transport not installed`);
    }
  }
  export const localTransport = {
    remoteCall(to: VersionedObject, method: string, args: any[]): Promise<any> {
      let impl = to[method];
      if (typeof impl === "function")
        return fastSafeCall(to[method], to, args[0]);
      return Promise.reject(`method ${method} not found on ${to.manager().name()}`);
    }
  }

  export function typeToAspectNames(type: Type) : string[] {
    if (type.type === "class")
      return [type.name];
      
    if(type.type === "array" || type.type === "set")
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
    class: string
    attribute: string
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
    implementation: VersionedObjectConstructor<VersionedObject>;
  };
  export interface Constructor {
    new(): VersionedObject;
    aspect: Aspect.Installed;
  }
}

export interface VersionedObjectConstructorCache extends VersionedObjectConstructor<VersionedObject> {
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
  impls: Set<VersionedObjectConstructor<VersionedObject>>
}>();
const voAttributes = {
  attributes: new Map<string, Aspect.InstalledAttribute>(),
  references: [],
  impls: new Set<VersionedObjectConstructor<VersionedObject>>([VersionedObject]),
};
installedAttributesOnImpl.set(VersionedObject.definition.name, voAttributes)

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
export class AspectCache {
  private readonly cachedAspects = new Map<string, VersionedObjectConstructorCache>();
  private readonly cachedCategories = new Map<string, Map<string, Aspect.InstalledMethod>>();

  createAspect(on: ControlCenter, name: string, implementation: VersionedObjectConstructor<VersionedObject>) : Aspect.Constructor {
    let tmp = this.cachedAspect(name, implementation);
    let aspect = tmp.aspect;
    let cstor = class InstalledAspect extends tmp {
      constructor(...args) {
        super(new VersionedObjectManager(on, aspect), ...args);
        this.__manager._object = this;
      }
      static displayName = `${aspect.name}[${aspect.aspect}]`;
      static aspect = aspect;
    };
    on._aspects.set(aspect.name, cstor);
    return nameClass(`${aspect.name}:${aspect.aspect}`, (tmp as any).displayName || tmp.name, cstor);
  }

  mutateCache(from: VersionedObjectConstructor<VersionedObject>, definition: { attributesToAdd: Aspect.Attribute[], attributesToRemove: Aspect.Attribute[] }) {
    let attr = installedAttributesOnImpl.get(from.definition.name);
    if (!attr)
      throw new Error(`cannot extends a non installed aspect`);
    
    definition.attributesToAdd.forEach(attribute => {
      const data = this.installAttribute(from, attribute);
      attr!.impls.forEach(impl => this.installAttributeData(impl, data));
      attr!.attributes.set(data.name, data);
    });
    definition.attributesToRemove.forEach(attribute => {
      const data = attr!.attributes.get(attribute.name);
      if (data) {
        attr!.impls.forEach(impl => this.uninstallAttribute(impl, data));
        attr!.attributes.delete(attribute.name);
      }
    });
  }

  installPublicTransport(transport: PublicTransport, on: VersionedObjectConstructor<VersionedObject>, categories: string[]) {
    for (let categoryName of categories) {
      this.buildCategoryCache(categoryName, on).forEach(method => {
        if (method.transport) { // far method
          transport.installMethod(on, method as Aspect.InstalledFarMethod);
        }
      });
    }
  }
  cachedAspect(name: string, implementation: VersionedObjectConstructor<VersionedObject>) : VersionedObjectConstructorCache {
    let key = JSON.stringify([implementation.definition.name, implementation.definition.version, name]);
    let tmp = this.cachedAspects.get(key);
    if (!tmp) {
      let attrs = this.installAttributes(implementation);
      tmp = nameClass(`CACHED:${implementation.definition.name}:${name}`, `${implementation.definition.name}`, class CachedAspect extends implementation {
        static aspect: Aspect.Installed = {
          name: implementation.definition.name,
          version: implementation.definition.version,
          aspect: name,
          references: attrs.references,
          categories: new Set(),
          attributes: attrs.attributes,
          farMethods: new Map(),
          implementation: implementation,
        };
      });
      this.installAspect(name, tmp, implementation);
      this.cachedAspects.set(key, tmp);
    }
    return tmp;
  }

  private cachedCategory(categoryName: string, from: VersionedObjectConstructor<VersionedObject>) {
    let key = JSON.stringify([from.definition.name, categoryName]);
    let tmp = this.cachedCategories.get(key);
    if (!tmp) {
      this.cachedCategories.set(key, tmp = this.buildCategoryCache(categoryName, from));
    }
    return tmp;
  }

  private buildMethodList(categoryName: string, from: VersionedObjectConstructor<VersionedObject>, map = new Map<string, Aspect.Method>()) : ['far' | 'local' | undefined, Map<string, Aspect.Method>] {
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
  private buildCategoryCache(categoryName: string, from: VersionedObjectConstructor<VersionedObject>): Map<string, Aspect.InstalledMethod> {
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
  private installCategoryCache(cache: Map<string, Aspect.InstalledMethod>, on: VersionedObjectConstructorCache, from: VersionedObjectConstructor<VersionedObject>, local: boolean) {
    cache.forEach((i, m) => {
      if (local) {
        if (i.transport) {
          on.aspect.farMethods.set(m, Object.assign({}, i, { transport: Aspect.localTransport }));
        }
        else {
          let localImpl = from.prototype[i.name];
          if (typeof localImpl !== "function")
            throw new Error(`implementation of local method ${i.name} must be a function, got ${typeof localImpl}`);
          if (localImpl.length !== i.argumentTypes.length && localImpl.name) 
            throw new Error(`arguments count in implementation of local method ${i.name} doesn't match interface definition: ${localImpl.length} !== ${i.argumentTypes.length}`);
            on.prototype[i.name] = localImpl; // TODO: protect localImpl;
        }
      }
      else if (i.transport) {
        on.aspect.farMethods.set(m, Object.assign({}, i as Aspect.InstalledFarMethod));
      }
      else {
        throw new Error(`${i.name} is not a far method`);
      }
    });
  }

  
  private uninstallAttribute(from: VersionedObjectConstructor<VersionedObject>, data: Aspect.InstalledAttribute) {
    findReferences(data.type, (ref) => {
      let attr = installedAttributesOnImpl.get(ref);
      let refs = attr && attr.references;
      let idx: number;
      while (refs && (idx = refs.findIndex(r => r.class === from.definition.name && r.attribute === data.name)) !== -1)
        refs.splice(idx, 1);
    });
    Object.defineProperty(from.prototype, data.name, {
      enumerable: true,
      get(this: VersionedObject) { throw new Error(`attribute value is removed`); },
      set(this: VersionedObject, value) { throw new Error(`attribute value is removed`); }
    });
  }
  private installAttribute(from: VersionedObjectConstructor<VersionedObject>, attribute: Aspect.Attribute) {
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
      attr && attr.references.push({ class: from.definition.name, attribute: attribute.name });
    });
    return data;
  }
  private installAttributeData(from: VersionedObjectConstructor<VersionedObject>, data: Aspect.InstalledAttribute) {
    Object.defineProperty(from.prototype, data.name, {
      enumerable: true,
      get(this: VersionedObject) { return this.__manager.attributeValue(data.name as keyof VersionedObject) },
      set(this: VersionedObject, value) {
        let manager = this.manager();
        value = validateValue(value, new AttributePath(manager.aspect().name, manager.id(), '.', data.name), data.validator, manager);
        this.__manager.setAttributeValueFast(data.name as keyof VersionedObject, value, data);
      }
    });
    return data;
  }
  private installAttributes(from: VersionedObjectConstructor<VersionedObject>): { references: Aspect.Reference[], attributes: Map<string, Aspect.InstalledAttribute> } {
    let ret = installedAttributesOnImpl.get(from.definition.name);
    if (!ret) {
      ret = { 
        attributes: from.parent ? new Map(this.installAttributes(from.parent).attributes) : new Map(), 
        references: [],
        impls: new Set<VersionedObjectConstructor<VersionedObject>>(),
      };
      from.definition.attributes && from.definition.attributes.forEach(attribute => {
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
  private installAspect(aspectName: string, on: VersionedObjectConstructorCache, from: VersionedObjectConstructor<VersionedObject>) {
    function assertFound<T>(what: string, where: string, name: string, c: T | undefined) : T {
      if (!c)
        throw new Error(`${what} ${name} not found in ${where}`);
      return c;
    }

    let aspect = assertFound('aspect', from.definition.name, aspectName, from.definition.aspects.find(a => a.name === aspectName));
    let farMethods = on.aspect.farMethods;
    let categories = on.aspect.categories;
    aspect.categories.forEach(c => { categories.add(c); this.installCategoryCache(this.cachedCategory(c, from), on, from, true); });
    aspect.farCategories.forEach(c => { categories.add(c); this.installCategoryCache(this.cachedCategory(c, from), on, from, false); });
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
/*
function installPublicMethod(cc: ControlCenter, aspect: Aspect.Installed, publicMethod: Aspect.InstalledFarMethod, transport: PublicTransport) {
  let prototype = aspect.implementation.prototype;
  let publicImpl = localImplInPrototype(prototype, publicMethod);
  transport.register(cc, aspect, publicMethod, protectPublicImpl(prototype, publicMethod, publicImpl));
}*/
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
function protectLocalImpl(localImpl: (...args) => any, argumentValidators: Aspect.TypeValidator[], returnValidator: Aspect.TypeValidator) {
  let path = new AttributePath(localImpl.name, ":", "");
  return function protectedLocalImpl(this) {
    for (var i = 0, len = argumentValidators.length; i < len; i++)
      validateValue(arguments[i], path.set(i), argumentValidators[i]);
    var ret = localImpl.apply(this, arguments);
    ret = validateValue(ret, path.set("ret"), returnValidator);
    return ret;
  }
}

function fastSafeCall(farImpl: Function, self, arg0): Promise<any> {
  try {
    if (farImpl.length === 0) return Promise.resolve(farImpl.call(self));
    else if (farImpl.length === 1) return Promise.resolve(farImpl.call(self, arg0));
    else {
      return new Promise((resolve) => {
        Async.run({ result: undefined }, [
          (p) => { farImpl.call(self, p, arg0); },
          (p) => { resolve(p.context.result); p.continue(); }
        ]);
      });
    }
  } catch(e) {
    return Promise.reject(e);
  }
}

function protectPublicImpl(prototype, farMethod: Aspect.InstalledMethod, farImpl: Function) : (this, arg0) => Promise<any> {
  let path = new AttributePath(farMethod.name, ":", "");
  let argumentValidators = farMethod.argumentValidators;
  let returnValidator = farMethod.returnValidator;
  return function(this, arg0) {
    if (argumentValidators[0])
      validateValue(arg0, path.set(0), argumentValidators[0]);
    let ret: Promise<any> = fastSafeCall(farImpl, this, arg0);
    return ret.then(function(ret) {
      ret = returnValidator ? validateValue(ret, path.set("ret"), returnValidator) : ret;
      return ret;
    });
  }
}
