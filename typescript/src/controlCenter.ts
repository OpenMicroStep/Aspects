import * as Ajv from 'ajv';
import {FarTransport, PublicTransport, Entity} from './index';
const ajv = new Ajv();

export type Identifier = string | number;

export interface FarTransport {
  remoteCall<T>(controlCenter: ControlCenter, to: Entity, method: string, args: any[]): Promise<T>;
}
export interface PublicTransport {
  register(controlCenter: ControlCenter, definition: ControlCenter.Definition, localMethod: ControlCenter.Method, localImpl: (...args) => Promise<any>);
}
export interface EntityManager {
  get(id: Identifier): Promise<Entity>;
  set(id: Identifier, entity: Entity);
  delete(id: Identifier);
}

export class ControlCenter {
  entityManager: EntityManager;

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  install(options: {
    definition: ControlCenter.Definition,
    implementation: ControlCenter.Implementation,
    local: { categories: string[] }, 
    far?: { categories: string[], transport: FarTransport }
    public?: { categories: string[], transport: PublicTransport }
  }) {
    this.installLocalCategories(options.local.categories, options.definition, options.implementation);
    if (options.far)
      this.installFarCategories(options.far.categories, options.far.transport, options.definition, options.implementation);
    if (options.public)
      this.installPublicCategories(options.public.categories, options.public.transport, options.definition, options.implementation);
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

  protected installFarCategories(farCategories: string[], transport: FarTransport, definition: ControlCenter.Definition, implementation: ControlCenter.Implementation) {
    let prototype = implementation.prototype;
    let farMethods = methodsInCategories(farCategories, definition);
    let controlCenter = this;
    farMethods.forEach((farMethod) => {
      protectFarImpl(prototype, farMethod, function(this: Entity, ...args) {
        return transport.remoteCall(controlCenter, this, farMethod.name, args);
      });
    });
  }

  protected installPublicCategories(publicCategories: string[], transport: PublicTransport, definition: ControlCenter.Definition, implementation: ControlCenter.Implementation) {
    let prototype = implementation.prototype;
    let publicMethods = methodsInCategories(publicCategories, definition);
    publicMethods.forEach((publicMethod) => {
      let publicImpl = localImplInPrototype(prototype, publicMethod);
      transport.register(this, definition, publicMethod, protectFarImpl(prototype, publicMethod, publicImpl));
    });
  }

  createValidator(type: ControlCenter.Type) : ControlCenter.TypeValidator {
    // TODO: provide simple and shared validators for primitive types or cache validators
    return ajv.compile(convertTypeToJsonSchema(type));
  }
}

export namespace ControlCenter {
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
  export type TypeValidator = ((value) => boolean) & { errors: string[] };
  export type Implementation = { new (...args) };
  export type Extension = never;

  export function isEntityType(attr: Attribute) {
    return attr.classifiedType === "entity";
  }
}

function protectLocalImpl(prototype, localMethod: ControlCenter.Method, localImpl: (...args) => any) {
  let argumentValidators = localMethod.argumentValidators;
  let returnValidator = localMethod.returnValidator;
  return prototype[localMethod.name] = function() {
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
    return prototype[farMethod.name] = function(...args) {
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
