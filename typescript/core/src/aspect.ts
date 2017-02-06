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

interface VersionedObjectConstructorCache extends VersionedObjectConstructor<VersionedObject> {
   aspect: Aspect.Installed;
}
const cachedAspects = new Map<string, VersionedObjectConstructorCache>();
export function createAspect(on: ControlCenter, name: string, implementation: VersionedObjectConstructor<VersionedObject>) : { new(): VersionedObject } {
  let key = JSON.stringify([implementation.definition.name, implementation.definition.version, name]);
  let tmp = cachedAspects.get(key);
  if (!tmp) {
    tmp = class extends implementation {
      static aspect: Aspect.Installed; 
    };
    tmp.aspect = installAspect(name, on, tmp, implementation);
    cachedAspects.set(key, tmp);
  }
  let aspect = tmp.aspect;
  return class extends tmp {
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

function installAspect(aspect: string, cc: ControlCenter, on: VersionedObjectConstructor<VersionedObject>, from: VersionedObjectConstructor<VersionedObject>) : Aspect.Installed {
  let definition = from.definition;
  let aspectEl = from.definition.aspects.find(a => a.name === aspect);
  let farMethods = new Map<string, Aspect.InstalledFarMethod>();
  if (!aspectEl)
    throw new Error(`aspect ${aspect} not found in ${definition.name}`);
  function assertFound<T>(name: string, c: T | undefined) : T {
    if (!c)
      throw new Error(`category ${name} not found in ${definition.name}`);
    return c;
  }

  // Install getter/setter forwarding to the manager
  Object.defineProperty(on.prototype, '_id', {
    enumerable: true,
    get(this: VersionedObject) { return this.__manager._id; },
    set(this: VersionedObject, value) {
      if (this.__manager._id === value)
        return;
      if (VersionedObjectManager.isLocalId(value))
        throw new Error(`cannot change identifier to a local identifier`);
      if (!VersionedObjectManager.isLocalId(this.__manager._id)) 
        throw new Error(`id can't be modified once assigned (not local)`);
      this.__manager._id = value; // local -> real id (ie. object _id attribute got loaded)
    }
  });
  Object.defineProperty(on.prototype, '_version', {
    enumerable: true,
    get(this: VersionedObject) { return this.__manager._version; },
    set(this: VersionedObject, value) {
      if (this.__manager._version !== VersionedObjectManager.NoVersion)
        throw new Error(`Cannot change object version directly`); 
      this.__manager._version = value; 
    }
  });
  let attributes = definition.attributes.map(attribute => {
    let isEntity = classifiedType(attribute.type) === "entity";
    let validator = createValidator(attribute.type);
    let name = attribute.name;
    Object.defineProperty(on.prototype, name, {
      enumerable: true,
      get(this: VersionedObject) { return this.__manager.attributeValue(name) },
      set(this: VersionedObject, value) {
        if (VersionedObjectManager.SafeMode && !validator(value))
          throw new Error(`attribute value is invalid`);
        if (isEntity)
          value = cc.registeredObject(value.id()) || value; // value will be merged later
        this.__manager.setAttributeValue(name, value);
      }
    });
    return {
      name: attribute.name,
      validator: validator,
      type: attribute.type
    };
  });
  
  // Install local impl protections
  aspectEl.categories
  .map(c => assertFound(c, definition.categories.find(cel => cel.name === c) || definition.farCategories.find(cel => cel.name === c)))
  .forEach(c => {
    c.methods.forEach(m => {
      let ret = Object.assign({}, m, {
        argumentValidators: m.argumentTypes.map(t => createValidator(t)),
        returnValidator: createValidator(m.returnType),
        transport: localTransport
      });
      if (c.is === 'farCategory') {
        farMethods.set(m.name, ret);
      }
      else {
        let localImpl = localImplInPrototype(from.prototype, m);
        protectLocalImpl(on.prototype, ret, localImpl);
      }
    });
  });

  // Install far impl protections
  aspectEl.farCategories
  .map(c => assertFound(`far:${c}`, definition.farCategories.find(cel => cel.name === c)))
  .forEach(c => {
    c.methods.forEach(m => {
      let ret = Object.assign({}, m, {
        argumentValidators: m.argumentTypes.map(t => createValidator(t)),
        returnValidator: createValidator(m.returnType),
        transport: farTransportStub
      });
      farMethods.set(m.name, ret)
    });
  });

  return {
    name: definition.name,
    version: definition.version,
    aspect: aspect,
    attributes: attributes,
    farMethods: farMethods
  };
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

function protectLocalImpl(prototype, localMethod: Aspect.InstalledMethod, localImpl: (...args) => any) {
  let argumentValidators = localMethod.argumentValidators;
  let returnValidator = localMethod.returnValidator;
  let protectedImpl = function protectedLocalImpl(this) {
      for (var i = 0, len = argumentValidators.length; i < len; i++)
        if (!argumentValidators[i](arguments[i]))
          throw new Error(`argument ${i} is invalid`);
      var ret = localImpl.apply(this, arguments);
      if (!returnValidator(ret))
        throw new Error(`return value is invalid`);
      return ret;
    }
  return prototype[localMethod.name] = protectedImpl;
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

function localImplInPrototype(prototype, localMethod: Aspect.Method) {
  let localImpl = <(...args) => any>prototype[localMethod.name];
  if (typeof localImpl !== "function")
    throw new Error(`implementation of local method ${localMethod.name} must be a function, got ${typeof localImpl}`);
  if (localImpl.length !== localMethod.argumentTypes.length && localImpl.name) 
    throw new Error(`arguments count in implementation of local method ${localMethod.name} doesn't match interface definition: ${localImpl.length} !== ${localMethod.argumentTypes.length}`);
  return localImpl;
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
