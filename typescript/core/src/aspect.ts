import { ControlCenter, VersionedObject, VersionedObjectManager, VersionedObjectConstructor, Invocation, InvocationState } from './core';
import {Async, Flux} from '@microstep/async';
import * as Ajv from 'ajv';

export interface FarTransport {
  remoteCall<T>(controlCenter: ControlCenter, to: VersionedObject, method: string, args: any[]): Promise<T>;
}

export interface PublicTransport {
  register(controlCenter: ControlCenter, aspect: Aspect.Installed, localMethod: Aspect.Method, localImpl: (...args) => Promise<any>);
}

const ajv = new Ajv();
const classifiedTypes = new Set(['any', 'integer', 'decimal', 'date', 'localdate', 'string', 'array', 'dictionary', 'identifier', 'object']);
function classifiedType(type: Aspect.Type): Aspect.PrimaryType | 'entity' {
  if (typeof type === 'object') {
    if (Array.isArray(type))
      return 'array';
    else
      return 'dictionary';
  }
  else if (typeof type === 'string') {
      return <Aspect.PrimaryType | 'entity'>(classifiedTypes.has(type) ? type : 'entity');
  }
  return 'object';
}

export function createAspect(on: ControlCenter, name: string, implementation: VersionedObjectConstructor<VersionedObject>) : { new(): VersionedObject } {
  let tmp = cachedAspect(name, implementation);
  let aspect = tmp.aspect;
  return class InstalledAspect extends tmp {
    constructor() {
      super(new VersionedObjectManager(on, aspect));
    }
  };
}

export interface Aspect {
  is: string;
  name: string;
  categories: string[];
  farCategories: string[];
};
export namespace Aspect {
  export type PrimaryType = 'integer' | 'decimal' | 'date' | 'localdate' | 'string' | 'array' | 'dictionary' | 'identifier' | 'any' | 'object';
  export type Type = PrimaryType | string | any[] | {[s: string]: any};
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
  };
  export interface InstalledFarMethod extends InstalledMethod {
    transport: FarTransport;
  };
  export interface InstalledAttribute {
    name: string;
    type: Type;
    validator: TypeValidator;
  };
  export interface Installed {
    name: string;
    aspect: string;
    version: number;
    attributes: InstalledAttribute[];
    farMethods: Map<string, InstalledFarMethod>;
  };
}

const farTransportStub = {
  remoteCall<T>(controlCenter: ControlCenter, to: VersionedObject, method: string, args: any[]): Promise<T> {
    return Promise.reject(`transport not installed`);
  }
}
const localTransport = {
  remoteCall<T>(controlCenter: ControlCenter, to: VersionedObject, method: string, args: any[]): Promise<T> {
    return fastSafeCall(to[method], to, args[0]);
  }
}

interface VersionedObjectConstructorCache extends VersionedObjectConstructor<VersionedObject> {
   aspect: Aspect.Installed;
}
const installedAttributesOnImpl = new Map<VersionedObjectConstructor<VersionedObject>, Aspect.InstalledAttribute[]>();
const cachedAspects = new Map<string, VersionedObjectConstructorCache>();
const cachedCategories = new Map<string, Map<string, Function | Aspect.InstalledFarMethod>>();

function cachedAspect(name: string, implementation: VersionedObjectConstructor<VersionedObject>) : VersionedObjectConstructorCache {
  let key = JSON.stringify([implementation.definition.name, implementation.definition.version, name]);
  let tmp = cachedAspects.get(key);
  if (!tmp) {
    tmp = class CachedAspect extends implementation {
      static aspect: Aspect.Installed = {
        name: implementation.definition.name,
        version: implementation.definition.version,
        aspect: name,
        attributes: installAttributes(implementation),
        farMethods: new Map()
      };
    };
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
      type = category.is === "farCategory" ? 'far' : 'local';
    else if ((type === 'far') !== (category.is === "farCategory"))
      throw new Error(`category '${category.name}' is already defined as ${type} by subclasses`);
    category.methods.forEach(method => { map.set(method.name, method); });
  }
  return r;
}
function buildCategoryCache(categoryName: string, from: VersionedObjectConstructor<VersionedObject>): Map<string, Function | Aspect.InstalledFarMethod> {
  let ret = new Map<string, Function | Aspect.InstalledFarMethod>();
  let list = buildMethodList(categoryName, from);
  let isFar = list[0] === "far";
  list[1].forEach(method => {
    if (isFar) {
      let farMethod = Object.assign({}, method, {
        argumentValidators: method.argumentTypes.map(t => createValidator(t)),
        returnValidator: createValidator(method.returnType),
        transport: farTransportStub
      });
      ret.set(method.name, farMethod)
    }
    else {
      let argumentValidators = method.argumentTypes.map(t => createValidator(t));
      let returnValidator = createValidator(method.returnType);
      let localImpl = from.prototype[method.name];
      if (typeof localImpl !== "function")
        throw new Error(`implementation of local method ${method.name} must be a function, got ${typeof localImpl}`);
      if (localImpl.length !== method.argumentTypes.length && localImpl.name) 
        throw new Error(`arguments count in implementation of local method ${method.name} doesn't match interface definition: ${localImpl.length} !== ${method.argumentTypes.length}`);
      ret.set(method.name, localImpl); //protectLocalImpl(localImpl, argumentValidators, returnValidator));
    }
  });
  return ret;
}
function installCategoryCache(cache: Map<string, Function | Aspect.InstalledFarMethod>, on: VersionedObjectConstructorCache, allowLocal: boolean) {
  cache.forEach((i, m) => {
    if (typeof i === "function") {
      if (allowLocal)
        on.prototype[m] = i;
      else
        throw new Error(`method ${m}`)
    }
    else
      on.aspect.farMethods.set(m, i);
  })
}
function installAttributes(from: VersionedObjectConstructor<VersionedObject>): Aspect.InstalledAttribute[] {
  let attributes = installedAttributesOnImpl.get(from);
  if (!attributes) {
    attributes = from.parent ? installAttributes(from.parent).slice(0) : [];
    from.definition.attributes.forEach(attribute => {
      let isEntity = classifiedType(attribute.type) === "entity";
      let validator = createValidator(attribute.type);
      let name = attribute.name;
      Object.defineProperty(from.prototype, name, {
        enumerable: true,
        get(this: VersionedObject) { return this.__manager.attributeValue(name) },
        set(this: VersionedObject, value) {
          if (VersionedObjectManager.SafeMode && !validator(value))
            throw new Error(`attribute value is invalid`);
          if (isEntity)
            value = this.__manager._controlCenter.registeredObject(value.id()) || value; // value will be merged later
          this.__manager.setAttributeValue(name, value);
        }
      });
      attributes!.push({
        name: attribute.name,
        validator: validator,
        type: attribute.type
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
  function install(from: VersionedObjectConstructor<VersionedObject>) {
    if (from.parent)
      install(from.parent);

    let definition = from.definition;
    aspect.categories.forEach(c => installCategoryCache(cachedCategory(c, from), on, true));
    aspect.farCategories.forEach(c => installCategoryCache(cachedCategory(c, from), on, false));
  }

  let aspect = assertFound('aspect', from.definition.name, aspectName, from.definition.aspects.find(a => a.name === aspectName));
  let farMethods = on.aspect.farMethods;
  
  install(from);
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
  if (typeof type === "string") {
    switch(type) {
      case 'any':        return { };
      case 'integer':    return { type: "integer"   };
      case 'decimal':    return { type: "number"    };
      case 'date':       return { instanceof: "Date" };
      case 'localdate':  return { type: "localdate" };
      case 'string':     return { type: "string"    };
      case 'array':      return { type: "array"     };
      case 'dictionary': return { type: "object"    };
      case 'object':     return { type: "object"    };
      case 'identifier': return { type: "string"    };
      default: return { }; // TODO: throw new Error(`unsupported type: ${type}`);
    }
  }
  else if (Array.isArray(type)) {
    let ret: any = {
      type: "array",
      items: convertTypeToJsonSchema(type[2])
    };
    if (type[0])
      ret.minItems = parseInt(type[0]);
    if (type[1] !== '*')
      ret.maxItems = parseInt(type[1]);
    return ret;
  }
  else if (typeof type === "object") {
    let properties = {};
    let required = Object.keys(type);
    required.forEach(k => properties[k] = convertTypeToJsonSchema(type[k]));
    return {
      type: "object",
      properties: properties,
      required: required
    };
  }
  throw new Error(`unsupported type: ${type}`);
}
