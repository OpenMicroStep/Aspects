import * as Ajv from 'ajv';
import {Async, Flux} from '@microstep/async';
import {FarTransport, PublicTransport, VersionedObject, VersionedObjectManager, NotificationCenter, Invocation, InvocationState, DataSource} from './core';

const classifiedTypes = ['any', 'integer', 'decimal', 'date', 'localdate', 'string', 'array', 'dictionary', 'identifier', 'object'];
function classifiedType(type: string) {
  if (classifiedTypes.indexOf(type) !== -1)
    return type;
  else if (type.startsWith('['))
    return 'array';
  else if (type.startsWith('{'))
    return 'dictionary';
  return 'object';
}
export type Identifier = string | number;

export interface AComponent {

}

export interface FarTransport {
  remoteCall<T>(controlCenter: ControlCenter, to: VersionedObject, method: string, args: any[]): Promise<T>;
}
export interface PublicTransport {
  register(controlCenter: ControlCenter, aspect: ControlCenter.InstalledAspect, localMethod: ControlCenter.Method, localImpl: (...args) => Promise<any>);
}

function tmpLoad(o, k) {
  return typeof k === 'string' && (k=k.substring(1)) ? Object.assign({ name: k }, o[`${k}=`]) : k;
}

export class ControlCenter {
  _notificationCenter = new NotificationCenter();
  _objects = new Map<Identifier, { object: VersionedObject, components: Set<AComponent> }>();
  _aspectsByImpl = new Map<ControlCenter.Implementation, ControlCenter.InstalledAspect>();
  _aspectsByName = new Map<string, ControlCenter.InstalledAspect>();
  _components = new Set<AComponent>();
  _ajv = new Ajv();

  constructor() {}
  /// events
  notificationCenter() { return this._notificationCenter; }

  /// category component
  registeredObject(id: Identifier) : VersionedObject | null {
    let o = this._objects.get(id);
    return o ? o.object : null;
  }
  
  registeredObjects(component: AComponent) : VersionedObject[] {
    let ret = <VersionedObject[]>[];
    this._objects.forEach((o, k) => {
      if (o.components.has(component))
        ret.push(o.object);
    });
    return ret;
  }

  registerComponent(component: AComponent) {
    this._components.add(component);
  }

  unregisterComponent(component: AComponent) {
    if (!this._components.delete(component))
      throw new Error(`cannot remove unregistered component`);
    this._objects.forEach((o, k) => {
      if (o.components.delete(component)) {
        if (o.components.size === 0)
          this._objects.delete(k);
      }
    });
  }

  registerObjects(component: AComponent, objects: VersionedObject[], method: string | null = null, events: string[] | null = null) {
    if (!this._components.has(component))
      throw new Error(`you must register the component with 'addComponent' before registering objects`);
    const notificationCenter = this.notificationCenter();
    objects.forEach(o => {
      let id = o.id();
      let i = this._objects;
      let d = i.get(id);
      if (method)
        (<(string | null)[]>(events || [null])).forEach(event => notificationCenter.addObserver(component, method, event, o));
      if (!d)
        i.set(id, d = { object: o, components: new Set() });
      d.components.add(component);
    });
  }

  unregisterObjects(component: AComponent, objects: VersionedObject[]) {
    objects.forEach(o => {
      let i = this._objects;
      let d = i.get(o.id());
      if (!d)
        throw new Error(`cannot unregister an object that is not registered`);
      if (!d.components.delete(component))
        throw new Error(`cannot unregister an object that is not registered by the given component`);
      if (d.components.size === 0)
        i.delete(o.id());
    });
  }

  /// category VersionedObject

  managerFactory() {
    return (object: VersionedObject) => {
      return new VersionedObjectManager(this, object);
    }
  }

  aspect(implementation: ControlCenter.Implementation) : ControlCenter.InstalledAspect {
    let r = this._aspectsByImpl.get(implementation);
    if (r)
      return r;
    throw new Error(`Cannot find aspect attached to implementation '${implementation.name}'`);
  }

  mergeObject(object: VersionedObject) {
    let m = object.manager();
    let o = this.registeredObject(object.id());
    if (o && o !== object)
      o.manager().mergeWithRemote(m);
    return o || object;
  }

  /// category init
  // TODO: refactor init
  loadAspect(interfaceDefinition, classname: string, aspect: string) : ControlCenter.Aspect {
    let rawDef = interfaceDefinition[`${classname}=`];
    let definition: ControlCenter.Definition = {
      name: classname,
      version: 0,
      attributes: (rawDef.attributes || [])
        .map(k => tmpLoad(rawDef, k))
        .map(a => Object.assign(a, {
          classifiedType: classifiedType(a.type),
          validator: this.createValidator(a.type)
        })),
      categories: (<string[]>[]).concat(rawDef.categories || [], rawDef.farCategories || [])
        .map(k => tmpLoad(rawDef, k))
        .map(c => Object.assign(c, { 
          methods: (c.methods || [])
            .map(m => tmpLoad(c, m))
            .map(m => Object.assign(m, {
              argumentTypes: m.type.arguments,
              argumentValidators: m.type.arguments.map(t => this.createValidator(t)),
              returnType: m.type.return,
              returnValidator: this.createValidator(m.type.return),
            })) 
        })),
    };
    let aspects = (rawDef.aspects || [])
      .map(k => tmpLoad(rawDef, k))
      .filter(a => a.name === aspect);
    return {
      name: aspect,
      version: 0,
      definition: definition,
      categories: aspects.length ? (aspects[0].categories || []).map(k => k.replace(/^=/, '')) : [],
      farCategories: aspects.length ? (aspects[0].farCategories || []).map(k => k.replace(/^=/, '')) : []
    };
  }

  install(aspect: ControlCenter.Aspect, implementation: ControlCenter.Implementation, bridges: ControlCenter.Bridge[]) {
    let a: ControlCenter.InstalledAspect = {
      name: aspect.definition.name,
      aspect: aspect.name,
      version: aspect.definition.version,
      categories: aspect.categories,
      farCategories: aspect.farCategories,
      attributes: aspect.definition.attributes, // TODO: add categories on attributes
      implementation: implementation,
      farMethods: [],
      methods: []
    }
    this._aspectsByImpl.set(implementation, a);
    this._aspectsByName.set(aspect.definition.name, a);
    let remainings = new Set(aspect.farCategories);
    bridges.forEach(bridge => {
      if (bridge.client.aspect === aspect.name && bridge.client.transport) {
        bridge.categories.forEach(c => {
          if (!remainings.delete(c))
            throw new Error(`category '${c}' is either already installed or not a far category`);
        });
        this.installFarCategories(bridge.categories, bridge.client.transport, aspect.definition, a);
      }
      else if (bridge.server.aspect === aspect.name && bridge.server.transport) {
        bridge.categories.forEach(c => {
          if (aspect.categories.indexOf(c) === -1)
            throw new Error(`category '${c}' is not implemented: ${aspect.categories.join(', ')}`);
        });
        this.installPublicCategories(bridge.categories, bridge.server.transport, aspect.definition, a);
      }
    });
    this.installLocalCategories(aspect.categories, aspect.definition, a);
  }

  protected installLocalCategories(localCategories: string[], definition: ControlCenter.Definition, i: ControlCenter.InstalledAspect) {
    let prototype = i.implementation.prototype;
    let localMethods = methodsInCategories(localCategories, definition);
    localMethods.forEach((localMethod) => {
      let localImpl = localImplInPrototype(prototype, localMethod);
      protectLocalImpl(prototype, localMethod, localImpl);
    });
    i.methods.push(...localMethods);
  }

  protected installFarCategories(farCategories: string[], transport: FarTransport, definition: ControlCenter.Definition, i: ControlCenter.InstalledAspect) {
    let farMethods = methodsInCategories(farCategories, definition);
    let controlCenter = this;
    farMethods.forEach((farMethod) => {
      i.farMethods.push(Object.assign({ transport: transport }, farMethod));
    });
  }

  protected installPublicCategories(publicCategories: string[], transport: PublicTransport, definition: ControlCenter.Definition, i: ControlCenter.InstalledAspect) {
    let prototype = i.implementation.prototype;
    let publicMethods = methodsInCategories(publicCategories, definition);
    publicMethods.forEach((publicMethod) => {
      let publicImpl = localImplInPrototype(prototype, publicMethod);
      transport.register(this, i, publicMethod, protectPublicImpl(prototype, publicMethod, publicImpl));
    });
  }

  createValidator(type: ControlCenter.Type) : ControlCenter.TypeValidator {
    // TODO: provide simple and shared validators for primitive types or cache validators
    let jsonSchema = convertTypeToJsonSchema(type);
    return <ControlCenter.TypeValidator>this._ajv.compile(jsonSchema);
  }
}

export namespace ControlCenter {
  export type InstalledAspect = {
    name: string;
    aspect: string;
    version: number;
    categories: string[];
    farCategories: string[];
    attributes: Attribute[];
    methods: Method[];
    farMethods: (Method & { transport: FarTransport })[];
    implementation: Implementation
  };
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
  };
  export type PrimaryType = 'integer' | 'decimal' | 'date' | 'localdate' | 'string' | 'array' | 'dictionary' | 'identifier' | 'any' | 'object';
  export type Type = PrimaryType | string | [number, number | '*', any /*Type*/] | {[s: string]: Type};
  export type TypeValidator = ((value) => boolean) & { errors: any[] };
  export type Implementation = { new (...args) };

  export function isVersionedObjectType(attr: Attribute) {
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

function protectPublicImpl(prototype, farMethod: ControlCenter.Method, farImpl: Function) : (this, arg0) => Promise<any> {
    let argumentValidators = farMethod.argumentValidators;
    let returnValidator = farMethod.returnValidator;
    return function(this, arg0) {
      if (argumentValidators[0] && !argumentValidators[0](arg0))
        return Promise.reject(`argument is invalid`);
      let ret: Promise<any>;
      if (farImpl.length === 0) {
        ret = fastSafeCall0(farImpl, this);
      }
      else if (farImpl.length === 1) {
        ret = fastSafeCall1(farImpl, this, arg0);
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
        return (!returnValidator || returnValidator(ret)) ? Promise.resolve(ret) : Promise.reject(`return value is invalid`);
      });
    };
}

function localImplInPrototype(prototype, localMethod: ControlCenter.Method) {
  let localImpl = <(...args) => any>prototype[localMethod.name];
  if (typeof localImpl !== "function")
    throw new Error(`implementation of local method ${localMethod.name} must be a function, got ${typeof localImpl}`);
  if (localImpl.length !== localMethod.argumentTypes.length) 
    throw new Error(`arguments count in implementation of local method ${localMethod.name} doesn't match interface definition: ${localImpl.length} !== ${localMethod.argumentTypes.length}`);
  return localImpl;
}

function methodsInCategories(categories: string[], definition: ControlCenter.Definition): ControlCenter.Method[] {
  return (<ControlCenter.Method[]>[]).concat(...definition.categories.filter(c => categories.indexOf(c.name) !== -1).map(c => c.methods));
}

function convertTypeToJsonSchema(type: ControlCenter.Type): any {
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
