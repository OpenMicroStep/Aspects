import * as Ajv from 'ajv';
import {Async, Flux} from '@microstep/async';
import {FarTransport, PublicTransport, VersionedObject, VersionedObjectManager, NotificationCenter, Invocation, InvocationState, DataSource} from './core';

const classifiedTypes = ['any', 'integer', 'decimal', 'date', 'localdate', 'string', 'array', 'dictionary', 'identifier', 'object'];
function classifiedType(type: ControlCenter.Type): ControlCenter.PrimaryType | 'entity' {
  if (typeof type === 'object') {
    if (Array.isArray(type))
      return 'array';
    else
      return 'dictionary';
  }
  else if (typeof type === 'string') {
    if (classifiedTypes.indexOf(type) !== -1)
      return <ControlCenter.PrimaryType | 'entity'>type;
  }
  return 'object';
}
export type Identifier = string | number;
export type FarImplementation<P extends VersionedObject, A, R> = ((this: P, arg: A) => R | Promise<R | Invocation<P, R>>);

export interface AComponent {

}

export interface FarTransport {
  remoteCall<T>(controlCenter: ControlCenter, to: VersionedObject, method: string, args: any[]): Promise<T>;
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
  installAspect(aspect: string, definition: ControlCenter.Definition, implementation: ControlCenter.Implementation) {
    let farMethods = new Map<string, ControlCenter.InstalledFarMethod>();
    let aspectEl = definition.aspects.find(a => a.name === aspect);
    function assertFound<T>(name: string, c: T) {
      if (!c)
        throw new Error(`category ${name} not found in ${definition.name}`);
      return c;
    }
    if (!aspectEl)
      throw new Error(`aspect ${aspect} not found in ${definition.name}`);
    let a: ControlCenter.InstalledAspect = {
      name: definition.name,
      version: definition.version,
      aspect: aspect,
      implementation: implementation,
      attributes: definition.attributes.map(a => Object.assign({}, a, { 
        classifiedType: classifiedType(a.type),
        validator: this.createValidator(a.type)
      })),
      farCategories: aspectEl.farCategories
        .map(c => assertFound(`far:${c}`, definition.farCategories.find(cel => cel.name === c)))
        .map((c: ControlCenter.Category) => ({ 
          is: c.is,
          name: c.name, 
          methods: c.methods.map(m => {
            let ret = Object.assign({}, m, {
              argumentValidators: m.argumentTypes.map(t => this.createValidator(t)),
              returnValidator: this.createValidator(m.returnType),
              transport: farTransportStub
            });
            farMethods.set(m.name, ret)
            return ret;
          })
        })),
      categories: aspectEl.categories
        .map(c => assertFound(c, definition.categories.find(cel => cel.name === c) || definition.farCategories.find(cel => cel.name === c)))
        .map((c: ControlCenter.Category) => ({
          is: c.is,
          name: c.name, 
          methods: c.methods.map(m => {
            let ret = Object.assign({}, m, {
              argumentValidators: m.argumentTypes.map(t => this.createValidator(t)),
              returnValidator: this.createValidator(m.returnType),
              transport: localTransport
            });
            farMethods.set(m.name, ret)
            return ret;
          })
      })),
      farMethods: farMethods
    };
    this._aspectsByImpl.set(implementation, a);
    this._aspectsByName.set(a.name, a);
    this.installLocalCategories(a); // TODO: enable only in debug mode
  }

  installBridges(bridges: ControlCenter.Bridge[]) {
    bridges.forEach(bridge => this.installBridge(bridge));
  }

  installBridge(bridge: ControlCenter.Bridge) {
    this._aspectsByName.forEach(aspect => {
      let installBridgeOnCategory = (farCategory: ControlCenter.InstalledFarCategory) => {
        if (farCategory.is !== 'farCategory')
          return;
        farCategory.methods.forEach(farMethod => {
          if (!bridge.filter || bridge.filter(aspect, farCategory, farMethod)) {
            if (bridge.farTransport)
              farMethod.transport = bridge.farTransport;
            if (bridge.publicTransport)
              this.installPublicMethod(aspect, farMethod, bridge.publicTransport);
          }
        });
      }
      aspect.categories.forEach(installBridgeOnCategory);
      aspect.farCategories.forEach(installBridgeOnCategory);
    });
  }

  protected installLocalCategories(aspect: ControlCenter.InstalledAspect) {
    let prototype = aspect.implementation.prototype;
    aspect.categories.forEach(category => {
      if (category.is !== 'category')
        return;
      category.methods.forEach(method => {
        let localImpl = localImplInPrototype(prototype, method);
        protectLocalImpl(prototype, method, localImpl);
      });
    });
  }

  protected installPublicMethod(aspect: ControlCenter.InstalledAspect, publicMethod: ControlCenter.InstalledFarMethod, transport: PublicTransport) {
    let prototype = aspect.implementation.prototype;
    let publicImpl = localImplInPrototype(prototype, publicMethod);
    transport.register(this, aspect, publicMethod, protectPublicImpl(prototype, publicMethod, publicImpl));
  }

  // TODO: refactor init
  /*
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
  }*/

  createValidator(type: ControlCenter.Type) : ControlCenter.TypeValidator {
    // TODO: provide simple and shared validators for primitive types or cache validators
    let jsonSchema = convertTypeToJsonSchema(type);
    return <ControlCenter.TypeValidator>this._ajv.compile(jsonSchema);
  }
}

export const controlCenter = new ControlCenter();

export namespace ControlCenter {
  export interface Aspect {
    is: string;
    name: string;
    categories: string[];
    farCategories: string[];
  };
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
  export interface InstalledAspect {
    name: string;
    aspect: string;
    version: number;
    attributes: InstalledAttribute[];
    categories: InstalledFarCategory[];
    farCategories: InstalledFarCategory[];
    farMethods: Map<string, InstalledFarMethod>;
    implementation: Implementation;
  };
  export interface InstalledFarCategory extends Category {
    methods: InstalledFarMethod[];
  };
  export interface InstalledMethod extends Method {
    argumentValidators: TypeValidator[];
    returnValidator: TypeValidator;
  };
  export interface InstalledFarMethod extends InstalledMethod {
    transport: FarTransport;
  };

  export interface InstalledAttribute extends Attribute {
    classifiedType: PrimaryType | 'entity';
    validator: TypeValidator;
  };
  export interface Bridge {
    filter?: (aspect: InstalledAspect, category: InstalledFarCategory, method: InstalledFarMethod) => boolean;
    farTransport?: FarTransport;
    publicTransport?: PublicTransport;
  }
  export type PrimaryType = 'integer' | 'decimal' | 'date' | 'localdate' | 'string' | 'array' | 'dictionary' | 'identifier' | 'any' | 'object';
  export type Type = PrimaryType | string | any[] | {[s: string]: any};
  export type TypeValidator = ((value) => boolean) & { errors: any[] };
  export type Implementation = { new (...args) };

  export function isVersionedObjectType(attr: InstalledAttribute) {
    return attr.classifiedType === "entity";
  }
}

function protectLocalImpl(prototype, localMethod: ControlCenter.InstalledMethod, localImpl: (...args) => any) {
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

function protectPublicImpl(prototype, farMethod: ControlCenter.InstalledMethod, farImpl: Function) : (this, arg0) => Promise<any> {
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

function localImplInPrototype(prototype, localMethod: ControlCenter.Method) {
  let localImpl = <(...args) => any>prototype[localMethod.name];
  if (typeof localImpl !== "function")
    throw new Error(`implementation of local method ${localMethod.name} must be a function, got ${typeof localImpl}`);
  if (localImpl.length !== localMethod.argumentTypes.length && localImpl.name) 
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
