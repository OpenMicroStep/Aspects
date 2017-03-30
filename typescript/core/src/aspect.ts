import { ControlCenter, VersionedObject, VersionedObjectManager, VersionedObjectConstructor, Invocation, InvocationState } from './core';
import {Async, Flux} from '@microstep/async';
import * as Ajv from 'ajv';

export interface FarTransport {
  remoteCall<T>(to: VersionedObject, method: string, args: any[]): Promise<T>;
}

export interface PublicTransport {
  installMethod(cstor: VersionedObjectConstructor<VersionedObject>, method: Aspect.InstalledFarMethod);
}

const ajv = new Ajv();

export function createAspect(on: ControlCenter, name: string, implementation: VersionedObjectConstructor<VersionedObject>) : Aspect.Constructor {
  let tmp = cachedAspect(name, implementation);
  let aspect = tmp.aspect;
  let cstor = class InstalledAspect extends tmp {
    constructor() {
      super(new VersionedObjectManager(on, aspect));
    }
    static displayName = `${aspect.name}[${aspect.aspect}]`;
    static aspect = aspect;
  };
  on._aspects.set(aspect.name, cstor);
  return nameClass(`${aspect.name}:${aspect.aspect}`, (tmp as any).displayName || tmp.name, cstor);
}


export function installPublicTransport(transport: PublicTransport, on: VersionedObjectConstructor<VersionedObject>, categories: string[]) {
  for (let categoryName of categories) {
    buildCategoryCache(categoryName, on).forEach(method => {
      if (method.transport) { // far method
        transport.installMethod(on, method as Aspect.InstalledFarMethod);
      }
    });
  }
}

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
    versionedObject: string | undefined,
    validator: TypeValidator;
    relation: Reference | undefined
  };
  export interface Installed {
    name: string;
    aspect: string;
    version: number;
    references: Reference[];
    categories: Set<string>;
    attributes: Map<string, InstalledAttribute>;
    farMethods: Map<string, InstalledFarMethod>;
  };
  export interface Constructor {
    new(): VersionedObject;
    aspect: Aspect.Installed;
  }
}

interface VersionedObjectConstructorCache extends VersionedObjectConstructor<VersionedObject> {
   aspect: Aspect.Installed;
}
const installedAttributesOnImpl = new Map<VersionedObjectConstructor<VersionedObject>, Map<string, Aspect.InstalledAttribute>>();
const cachedAspects = new Map<string, VersionedObjectConstructorCache>();
const cachedCategories = new Map<string, Map<string, Aspect.InstalledMethod>>();

function nameClass<T extends { new(...args): any }>(name: string, parent: string, cls: T) : T {
  (cls as any).displayName = name;
  (cls as any).toString = function toCustomNameString(this: Function) {
    return `class ${name} extends ${parent} {}`;
  };
  Object.defineProperty(cls, "name", { value: name, configurable: true });
  return cls;
}

function cachedAspect(name: string, implementation: VersionedObjectConstructor<VersionedObject>) : VersionedObjectConstructorCache {
  let key = JSON.stringify([implementation.definition.name, implementation.definition.version, name]);
  let tmp = cachedAspects.get(key);
  if (!tmp) {
    tmp = nameClass(`CACHED:${implementation.definition.name}:${name}`, `${implementation.definition.name}`, class CachedAspect extends implementation {
      static aspect: Aspect.Installed = {
        name: implementation.definition.name,
        version: implementation.definition.version,
        aspect: name,
        references: [],
        categories: new Set(),
        attributes: installAttributes(implementation),
        farMethods: new Map()
      };
    });
    installAspect(name, tmp, implementation);
    cachedAspects.set(key, tmp);
  }
  return tmp;
}

function cachedCategory(categoryName: string, from: VersionedObjectConstructor<VersionedObject>) {
  let key = JSON.stringify([from.definition.name, categoryName]);
  let tmp = cachedCategories.get(key);
  if (!tmp) {
    cachedCategories.set(key, tmp = buildCategoryCache(categoryName, from));
  }
  return tmp;
}

function buildMethodList(categoryName: string, from: VersionedObjectConstructor<VersionedObject>, map = new Map<string, Aspect.Method>()) : ['far' | 'local' | undefined, Map<string, Aspect.Method>] {
  let r: ['far' | 'local' | undefined, Map<string, Aspect.Method>];
  r = from.parent ? buildMethodList(categoryName, from.parent, map) : [undefined, map];
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
function buildCategoryCache(categoryName: string, from: VersionedObjectConstructor<VersionedObject>): Map<string, Aspect.InstalledMethod> {
  let ret = new Map<string, Aspect.InstalledMethod>();
  let list = buildMethodList(categoryName, from);
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
function installCategoryCache(cache: Map<string, Aspect.InstalledMethod>, on: VersionedObjectConstructorCache, from: VersionedObjectConstructor<VersionedObject>, local: boolean) {
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
function installAttributes(from: VersionedObjectConstructor<VersionedObject>): Map<string, Aspect.InstalledAttribute> {
  let attributes = installedAttributesOnImpl.get(from);
  if (!attributes) {
    attributes = from.parent ? new Map(installAttributes(from.parent)) : new Map();
    from.definition.attributes.forEach(attribute => {
      let isVersionedObject = attribute.type.type === "class";
      let validator = createValidator(attribute.type);
      let name = attribute.name;
      let relation: Aspect.Reference | undefined = undefined;
      if (attribute.relation) {
        if (attribute.type.type !== "class")
          throw new Error(`attribute type of a relation must be a class`);
        relation = { class: attribute.type.name, attribute: attribute.relation };
      }
      if (attribute.type.type === "class") {
        let aspect = cachedAspects.get(attribute.name);
        aspect && aspect.aspect.references.push({ class: from.definition.name, attribute: attribute.name });
      }
      Object.defineProperty(from.prototype, name, {
        enumerable: true,
        get(this: VersionedObject) { return this.__manager.attributeValue(name as keyof VersionedObject) },
        set(this: VersionedObject, value) {
          if (VersionedObjectManager.SafeMode && !validator(value))
            throw new Error(`attribute value is invalid`);
          if (isVersionedObject)
            value = this.__manager._controlCenter.registeredObject(value.id()) || value; // value will be merged later
          this.__manager.setAttributeValue(name as keyof VersionedObject, value);
        }
      });
      attributes!.set(name, {
        name: attribute.name,
        validator: validator,
        versionedObject: isVersionedObject ? attribute.name : undefined,
        type: attribute.type,
        relation: relation
      });
    });
    installedAttributesOnImpl.set(from, attributes);
  }
  return attributes;
}
function installAspect(aspectName: string, on: VersionedObjectConstructorCache, from: VersionedObjectConstructor<VersionedObject>) {
  function assertFound<T>(what: string, where: string, name: string, c: T | undefined) : T {
    if (!c)
      throw new Error(`${what} ${name} not found in ${where}`);
    return c;
  }

  let aspect = assertFound('aspect', from.definition.name, aspectName, from.definition.aspects.find(a => a.name === aspectName));
  let farMethods = on.aspect.farMethods;
  let categories = on.aspect.categories;
  aspect.categories.forEach(c => { categories.add(c); installCategoryCache(cachedCategory(c, from), on, from, true); });
  aspect.farCategories.forEach(c => { categories.add(c); installCategoryCache(cachedCategory(c, from), on, from, false); });
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
