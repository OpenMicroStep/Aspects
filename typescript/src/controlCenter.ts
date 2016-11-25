import * as Ajv from 'ajv';
import {FarTransport, PublicTransport, AObject} from './core';
const ajv = new Ajv();

export type Identifier = string | number;

export interface FarTransport {
  remoteCall<T>(controlCenter: ControlCenter, to: AObject, method: string, args: any[]): Promise<T>;
}
export interface PublicTransport {
  register(controlCenter: ControlCenter, aspect: ControlCenter.Aspect, localMethod: ControlCenter.Method, localImpl: (...args) => Promise<any>);
}

export class ControlCenter {
  objectsManager = new Map<Identifier, AObject>();

  install(aspect: ControlCenter.Aspect, implementation: ControlCenter.Implementation, bridges: ControlCenter.Bridge[]) {
    this.installLocalCategories(aspect.categories, aspect.definition, implementation);
    let remainings = new Set(aspect.farCategories);
    bridges.forEach(bridge => {
      if (bridge.client.aspect === aspect.name) {
        bridge.categories.forEach(c => {
          if (!remainings.delete(c))
            throw new Error(`category '${c}' is either already installed or not a far category`);
        });
        this.installFarCategories(bridge.categories, bridge.client.transport, aspect, implementation);
      }
      else if (bridge.server.aspect === aspect.name) {
        bridge.categories.forEach(c => {
          if (aspect.categories.indexOf(c) === -1)
            throw new Error(`category '${c}' is not implemented`);
        });
        this.installPublicCategories(bridge.categories, bridge.server.transport, aspect, implementation);
      }
    });
  }

  mergeEntities<T>(entities: T) {
    return entities;
  }

  protected installLocalCategories(localCategories: string[], definition: ControlCenter.Definition, implementation: ControlCenter.Implementation) {
    let prototype = implementation.prototype;
    let localMethods = methodsInCategories(localCategories, definition);
    localMethods.forEach((localMethod) => {
      let localImpl = localImplInPrototype(prototype, localMethod);
      protectLocalImpl(prototype, localMethod, localImpl);
    });
  }

  protected installFarCategories(farCategories: string[], transport: FarTransport, aspect: ControlCenter.Aspect, implementation: ControlCenter.Implementation) {
    let prototype = implementation.prototype;
    let farMethods = methodsInCategories(farCategories, aspect.definition);
    let controlCenter = this;
    farMethods.forEach((farMethod) => {
      protectFarImpl(prototype, farMethod, function(this: AObject, ...args) {
        return transport.remoteCall(controlCenter, this, farMethod.name, args);
      });
    });
  }

  protected installPublicCategories(publicCategories: string[], transport: PublicTransport, aspect: ControlCenter.Aspect, implementation: ControlCenter.Implementation) {
    let prototype = implementation.prototype;
    let publicMethods = methodsInCategories(publicCategories, aspect.definition);
    publicMethods.forEach((publicMethod) => {
      let publicImpl = localImplInPrototype(prototype, publicMethod);
      transport.register(this, aspect, publicMethod, protectFarImpl(prototype, publicMethod, publicImpl));
    });
  }

  createValidator(type: ControlCenter.Type) : ControlCenter.TypeValidator {
    // TODO: provide simple and shared validators for primitive types or cache validators
    return <ControlCenter.TypeValidator>ajv.compile(convertTypeToJsonSchema(type));
  }
}

export namespace ControlCenter {
  export type Aspect = {
    name: string;
    version: number;
    categories: string[];
    farCategories: string[];
    definition: Definition;
  };
  export type Bridge = {
    categories: string[];
    client: { aspect: string, transport: FarTransport };
    server: { aspect: string, transport: PublicTransport };
  }
  export type Definition = {
    name: string;
    version: number;
    attributes: Attribute[];
    categories: Category[];
  }
  export type Attribute = {
    name: string;
    type: Type;
    classifiedType: PrimaryType | 'entity';
    validator: TypeValidator;
  };
  export type Category = {
    name: string;
    methods: Method[];
  };
  export type Method = { 
    name: string;
    argumentTypes: Type[];
    argumentValidators: TypeValidator[];
    returnType: Type;
    returnValidator: TypeValidator;
    extensions: Extension[];
  };
  export type PrimaryType = 'integer' | 'decimal' | 'date' | 'localdate' | 'string' | 'array' | 'dictionary' | 'identifier';
  export type Type = PrimaryType | string | [number, number | '*', any /*Type*/] | {[s: string]: Type};
  export type TypeValidator = ((value) => boolean) & { errors: any[] };
  export type Implementation = { new (...args) };
  export type Extension = never;

  export function isAObjectType(attr: Attribute) {
    return attr.classifiedType === "entity";
  }
}

function protectLocalImpl(prototype, localMethod: ControlCenter.Method, localImpl: (...args) => any) {
  let argumentValidators = localMethod.argumentValidators;
  let returnValidator = localMethod.returnValidator;
  return prototype[localMethod.name] = function(this) {
    for (var i = 0, len = argumentValidators.length; i < len; i++)
      if (!argumentValidators[i](arguments[i]))
        throw new Error(`argument ${i} is invalid`);
    var ret = localImpl.apply(this, arguments);
    if (!returnValidator(ret))
      throw new Error(`return value is invalid`);
    return ret;
  };
}

function protectFarImpl(prototype, farMethod: ControlCenter.Method, farImpl: (...args) => Promise<any>) {
    let argumentValidators = farMethod.argumentValidators;
    let returnValidator = farMethod.returnValidator;
    return prototype[farMethod.name] = function(this, ...args) {
      for (var i = 0, len = argumentValidators.length; i < len; i++)
        if (!argumentValidators[i](args[i]))
          return Promise.reject(`argument ${i} is invalid`);
      return farImpl.apply(this, args).then(function(ret) {
        return returnValidator(ret) ? Promise.resolve(ret) : Promise.reject(`return value is invalid`);
      });
    };
}

function localImplInPrototype(prototype, localMethod: ControlCenter.Method) {
  let localImpl = <(...args) => any>prototype[localMethod.name];
  if (typeof localImpl !== "function")
    throw new Error(`implementation of local method ${localMethod.name} must be a function, got ${typeof localImpl}`);
  if (localImpl.length !== localMethod.argumentTypes.length) 
    throw new Error(`arguments count in implementation of local method ${localMethod.name} doesn't match interface definition`);
  return localImpl;
}

function methodsInCategories(categories: string[], definition: ControlCenter.Definition): ControlCenter.Method[] {
  return (<ControlCenter.Method[]>[]).concat(...definition.categories.filter(c => categories.indexOf(c.name) !== -1).map(c => c.methods));
}

function convertTypeToJsonSchema(type: ControlCenter.Type): any {
  if (typeof type === "string") {
    switch(type) {
      case 'integer':    return { type: "integer"   };
      case 'decimal':    return { type: "number"    };
      case 'date':       return { type: "date"      };
      case 'localdate':  return { type: "localdate" };
      case 'string':     return { type: "string"    };
      case 'array':      return { type: "array"     };
      case 'dictionary': return { type: "object"    };
      case 'identifier': return { type: "string"    };
      default: throw new Error(`unsupported type: ${type}`);
    }
  }
  else if (Array.isArray(type)) {
    return { 
      type: "array",
      minItems: type[0],
      maxItems: type[1] !== "*" ? type[1] : undefined,
      items: convertTypeToJsonSchema(type[2])
    };
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
