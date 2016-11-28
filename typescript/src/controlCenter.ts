import * as Ajv from 'ajv';
import {Async, Flux} from '@microstep/async';
import {FarTransport, PublicTransport, AObject, AObjectManager, NotificationCenter, Invocation} from './core';
const ajv = new Ajv();

export type Identifier = string | number;

export interface AComponent {

}

export interface FarTransport {
  remoteCall<T>(controlCenter: ControlCenter, to: AObject, method: string, args: any[]): Promise<T>;
}
export interface PublicTransport {
  register(controlCenter: ControlCenter, aspect: ControlCenter.Aspect, localMethod: ControlCenter.Method, localImpl: (...args) => Promise<any>);
}

export class ControlCenter {
  _notificationCenter = new NotificationCenter();
  _objects = new Map<ControlCenter.Aspect, Map<Identifier, { object: AObject, components: AComponent[] }>>();
  _aspects = new Map<ControlCenter.Implementation, ControlCenter.Aspect>();

  static aspect(interfaceDefinition, aspect: string) : ControlCenter.Aspect {
    return null!;
  }

  farCallback<I extends Invocation<any, any>>(call: I, callback: (invocation: I) => void) {
    call.invoke(callback);
  }
  farPromise<I extends Invocation<any, any>>(call: I) : Promise<I> {
    return new Promise((resolve) => { this.farCallback(call, resolve); })
  }
  farAsync<I extends Invocation<any, any>>(flux: Flux<{ envelop: I }>, call: I) {
    this.farCallback(call, (invocation) => {
      flux.context.envelop = invocation;
      flux.continue();
    });
  }

  managerFactory() {
    return (object: AObject) => {
      return new AObjectManager(this, object);
    }
  }

  getAspect(implementation: ControlCenter.Implementation) : ControlCenter.Aspect {
    return this._aspects.get(implementation)!;
  }

  getObject(aspect: ControlCenter.Aspect, id: Identifier) : AObject | null {
    let o = this._objectsInAspect(aspect).get(id);
    return o ? o.object : null;
  }

  mergeObject(object: AObject) {
    let m = object.manager();
    let o = this.getObject(m.aspect(), object.id());
    if (o && o !== object)
      o.manager().setRemote(m);
    return o || object;
  }

  _objectsInAspect(aspect: ControlCenter.Aspect) {
    let i = this._objects.get(aspect);
    if (!i)
      i = new Map();
    return i;
  }

  registerObjects(component: AComponent, objects: AObject[], method: string | null = null, events: string[] | null = null) {
    objects.forEach(o => {
      let id = o.id();
      let i = this._objectsInAspect(o.manager().aspect());
      let d = i.get(id);
      if (!d)
        i.set(id, d = { object: o, components: [] });
      d.components.push(component);
    });
  }

  unregisterObjects(component: AComponent, objects: AObject[]) {
    objects.forEach(o => {
      let i = this._objectsInAspect(o.manager().aspect());
      let d = i.get(o.id());
      if (!d)
        throw new Error(`cannot unregister an object that is not registered`);
      let idx = d.components.indexOf(component);
      if (idx === -1)
        throw new Error(`cannot unregister an object that is not registered by the given component`);
      if (d.components.length === 1)
        i.delete(o.id());
      else
        d.components.splice(idx, 1);
    });
  }

  notificationCenter() { return this._notificationCenter; }

  install(aspect: ControlCenter.Aspect, implementation: ControlCenter.Implementation, bridges: ControlCenter.Bridge[]) {
    this.installLocalCategories(aspect.categories, aspect.definition, implementation);
    let remainings = new Set(aspect.farCategories);
    bridges.forEach(bridge => {
      if (bridge.client.aspect === aspect.name && bridge.client.transport) {
        bridge.categories.forEach(c => {
          if (!remainings.delete(c))
            throw new Error(`category '${c}' is either already installed or not a far category`);
        });
        this.installFarCategories(bridge.categories, bridge.client.transport, aspect, implementation);
      }
      else if (bridge.server.aspect === aspect.name && bridge.server.transport) {
        bridge.categories.forEach(c => {
          if (aspect.categories.indexOf(c) === -1)
            throw new Error(`category '${c}' is not implemented`);
        });
        this.installPublicCategories(bridge.categories, bridge.server.transport, aspect, implementation);
      }
    });
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
      return prototype[farMethod.name] = function(this: AObject, ...args) {
        return new Invocation(this, farMethod, args[0], (arg, result) => {
          transport.remoteCall(controlCenter, this, farMethod.name, [arg])
            .then((ret) => result(null, ret))
            .catch((err) => result(err))
        });
      };
    });
  }

  protected installPublicCategories(publicCategories: string[], transport: PublicTransport, aspect: ControlCenter.Aspect, implementation: ControlCenter.Implementation) {
    let prototype = implementation.prototype;
    let publicMethods = methodsInCategories(publicCategories, aspect.definition);
    publicMethods.forEach((publicMethod) => {
      let publicImpl = localImplInPrototype(prototype, publicMethod);
      transport.register(this, aspect, publicMethod, protectPublicImpl(prototype, publicMethod, publicImpl));
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
    client: { aspect: string, transport?: FarTransport };
    server: { aspect: string, transport?: PublicTransport };
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

function fastSafeCall(impl: Function, self, arg0) : Promise<any> {
  try {
    let ret = impl.call(self, arg0);
    if (!(ret instanceof Promise))
      ret = Promise.resolve(ret);
    return ret;
  } catch(e) {
    return Promise.reject(e);
  }
}

function protectPublicImpl(prototype, farMethod: ControlCenter.Method, farImpl: Function) : (this, arg0) => Promise<any> {
    let argumentValidators = farMethod.argumentValidators;
    let returnValidator = farMethod.returnValidator;
    return prototype[farMethod.name] = function(this, arg0) {
      if (!argumentValidators[0](arg0))
        return Promise.reject(`argument is invalid`);
      let ret: Promise<any>;
      if (farImpl.length === 1) {
        ret = fastSafeCall(farImpl, this, arg0);
      }
      else {
        ret = new Promise((resolve) => {
          Async.run({ result: undefined }, [
            (p) => { farImpl.call(this, p, arg0); },
            (p) => { resolve(p.context.result); p.continue(); }
          ]);
        });
      }

      return ret.then(function(ret) {
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
