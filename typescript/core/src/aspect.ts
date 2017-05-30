import { ControlCenter, VersionedObject, VersionedObjectManager, VersionedObjectConstructor, Invocation, InvocationState } from './core';
import {Async, Flux} from '@openmicrostep/async';
import * as Ajv from 'ajv';

export interface FarTransport {
  remoteCall<T>(to: VersionedObject, method: string, args: any[]): Promise<T>;
}

export interface PublicTransport {
  installMethod(cstor: VersionedObjectConstructor<VersionedObject>, method: Aspect.InstalledFarMethod);
}

const ajv = new Ajv();

export interface Aspect {
  is: string;
  name: string;
  categories: string[];
  farCategories: string[];
};
export namespace Aspect {
  export const farTransportStub = {
    remoteCall<T>(to: VersionedObject, method: string, args: any[]): Promise<T> {
      return Promise.reject(`transport not installed`);
    }
  }
  export const localTransport = {
    remoteCall<T>(to: VersionedObject, method: string, args: any[]): Promise<T> {
      return fastSafeCall(to[method], to, args[0]);
    }
  }

  export type PrimaryType = 'integer' | 'decimal' | 'date' | 'localdate' | 'string' | 'array' | 'dictionary' | 'identifier' | 'any' | 'object';
  export type Type =
    { is: 'type', type: 'void' } |
    { is: 'type', type: 'primitive', name: PrimaryType } |
    { is: 'type', type: 'class', name: string } |
    { is: 'type', type: 'array', itemType: Type, min: number, max: number | "*" } |
    { is: 'type', type: 'set', itemType: Type , min: number, max: number | "*"} |
    { is: 'type', type: 'dictionary', properties: { [s: string]: Type } };
  export type TypeValidator = ((value) => boolean) & { errors: any[] };
  export interface Definition {
    name: string;
    version: number;
    attributes: Attribute[];
    categories: Category[];
    farCategories: Category[];
    aspects: Aspect[];
  }
  export interface Attribute {
    is: string;
    name: string;
    type: Type;
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
    returnValidator: TypeValidator;
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
    versionedObject: string | undefined;
    validator: TypeValidator;
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

const IdValidator = Object.assign(function IdValidator(value) : boolean {
  return typeof value === "string" || typeof value === "number";
}, { errors: [] });
const VersionValidator = Object.assign(function VersionValidator(value) : boolean {
  return typeof value === "number";
}, { errors: [] });

voAttributes.attributes.set("_id", {
  name: "_id",
  type: { is: "type", type: "primitive", name: "any" as Aspect.PrimaryType },
  versionedObject: undefined,
  validator: IdValidator,
  relation: undefined,
});
voAttributes.attributes.set("_version", {
  name: "_version",
  type: { is: "type", type: "primitive", name: "number" as Aspect.PrimaryType },
  versionedObject: undefined,
  validator: VersionValidator,
  relation: undefined,
});
export class AspectCache {
  private readonly cachedAspects = new Map<string, VersionedObjectConstructorCache>();
  private readonly cachedCategories = new Map<string, Map<string, Aspect.InstalledMethod>>();

  createAspect(on: ControlCenter, name: string, implementation: VersionedObjectConstructor<VersionedObject>) : Aspect.Constructor {
    let tmp = this.cachedAspect(name, implementation);
    let aspect = tmp.aspect;
    let cstor = class InstalledAspect extends tmp {
      constructor() {
        super(new VersionedObjectManager(on, aspect))
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
    let category = definition.categories.find(cel => cel.name === categoryName) || definition.farCategories.find(cel => cel.name === categoryName);
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
        argumentValidators: method.argumentTypes.map(t => createValidator(t)),
        returnValidator: createValidator(method.returnType),
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
      name: attribute.name,
      validator: createValidator(attribute.type),
      versionedObject: attribute.type.type === "class" ? attribute.type.name : undefined,
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
        if (VersionedObjectManager.SafeMode && !data.validator(value))
          throw new Error(`attribute value is invalid`);
        if (value && data.versionedObject)
          value = this.__manager._controlCenter.registeredObject(value.id()) || value; // value will be merged later
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
      from.definition.attributes.forEach(attribute => {
        const data = this.installAttribute(from, attribute);
        ret!.attributes.set(data.name, data);
      });
      installedAttributesOnImpl.set(from.definition.name, ret);
    }
    if (!ret.impls.has(from)) {
      ret.impls.add(from);
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

function createValidator(type: Aspect.Type) : Aspect.TypeValidator {
  // TODO: provide simple and shared validators for primitive types or cache validators
  let jsonSchema = convertTypeToJsonSchema(type);
  return <Aspect.TypeValidator>ajv.compile(jsonSchema);
}

function protectLocalImpl(localImpl: (...args) => any, argumentValidators: Aspect.TypeValidator[], returnValidator: Aspect.TypeValidator) {
  return function protectedLocalImpl(this) {
    for (var i = 0, len = argumentValidators.length; i < len; i++)
      if (!argumentValidators[i](arguments[i]))
        throw new Error(`argument ${i} is invalid`);
    var ret = localImpl.apply(this, arguments);
    if (!returnValidator(ret))
      throw new Error(`return value is invalid`);
    return ret;
  }
}

function fastSafeCallMap(ret): Promise<any> {
    if (ret instanceof Invocation)
      ret = ret.state() === InvocationState.Terminated ? Promise.resolve(ret.result()) : Promise.reject(ret.error());
    else if (!(ret instanceof Promise))
      ret = Promise.resolve(ret);
    return ret;
}
function fastSafeCall0(impl: Function, self) : Promise<any> {
  try {
    return fastSafeCallMap(impl.call(self));
  } catch(e) {
    return Promise.reject(e);
  }
}

function fastSafeCall1(impl: Function, self, arg0) : Promise<any> {
  try {
    return fastSafeCallMap(impl.call(self, arg0));
  } catch(e) {
    return Promise.reject(e);
  }
}
function fastSafeCall(farImpl: Function, self, arg0): Promise<any> {
  let ret: Promise<any>;
  if (farImpl.length === 0) {
    ret = fastSafeCall0(farImpl, self);
  }
  else if (farImpl.length === 1) {
    ret = fastSafeCall1(farImpl, self, arg0);
  }
  else {
    ret = new Promise((resolve) => {
      Async.run({ result: undefined }, [
        (p) => { farImpl.call(self, p, arg0); },
        (p) => { resolve(p.context.result); p.continue(); }
      ]);
    });
  }
  return ret;
}

function protectPublicImpl(prototype, farMethod: Aspect.InstalledMethod, farImpl: Function) : (this, arg0) => Promise<any> {
    let argumentValidators = farMethod.argumentValidators;
    let returnValidator = farMethod.returnValidator;
    return function(this, arg0) {
      if (argumentValidators[0] && !argumentValidators[0](arg0))
        return Promise.reject(`argument is invalid`);
      let ret: Promise<any> = fastSafeCall(farImpl, this, arg0);
      return ret.then(function(ret) {
        return (!returnValidator || returnValidator(ret)) ? Promise.resolve(ret) : Promise.reject(`return value is invalid`);
      });
    };
}

function convertTypeToJsonSchema(type: Aspect.Type): any { 
  switch (type.type) {
    case 'primitive':
      switch (type.name) {
        case 'integer':    return { type: "integer"   };
        case 'decimal':    return { type: "number"    };
        case 'date':       return { instanceof: "Date" };
        case 'localdate':  return { type: "localdate" };
        case 'string':     return { type: "string"    };
        case 'array':      return { type: "array"     };
        case 'dictionary': return { type: "object"    };
        case 'object':     return { type: "object"    };
        case 'identifier': return { type: "string"    };
      }
      // console.warn(`unsupported primitive type: ${type.name}`);
      return {};
    case 'class':
    case 'set':
      return {}; // TODO
    case 'array': {
      let ret: any = {
        type: "array",
        items: convertTypeToJsonSchema(type.itemType)
      };
      if (typeof type.min === "number")
        ret.minItems = type.min;
      if (typeof type.max === "number")
        ret.maxItems = type.max;
      return ret;
    }
    case 'dictionary': {
      let properties = {};
      let patternProperties = {};
      let required: string[] = [];
      Object.keys(type.properties).forEach(k => {
        let schema = convertTypeToJsonSchema(type.properties[k]);
        if (k !== '*') {
          properties[k] = schema;
          required.push(k);
        }
        else {
          patternProperties["^[a-z0-9]+$"] = schema;
        }
      });
      return {
        type: "object",
        properties: properties,
        patternProperties: patternProperties,
        required: required.length ? required : undefined
      };
    }
    default:
      throw new Error(`unsupported type: ${(type as any).type }`);
  }
}
