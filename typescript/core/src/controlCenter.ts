import {
  VersionedObject, VersionedObjectManager, NotificationCenter, Result, Invocation,
  Aspect, AspectConfiguration, ImmutableSet
} from './core';

export type Identifier = string | number;

export interface AComponent {

}
export class ControlCenterContext {
  /** @internal */ _objects = new Set<VersionedObject>();
  /** @internal */ _cc: ControlCenter;
  /** @internal */ _component: AComponent | undefined;

  /** @internal */ constructor (cc: ControlCenter, component: AComponent) {
    this._cc = cc;
    this._component = component;
  }

  destroy() {
    if (!this._component)
      throw new Error(`this ControlCenterContext is already destroyed`);
    for (let object of this._objects) {
      let m = object.manager();
      if (!m._components.delete(this._component))
        throw new Error(`control center '_components' is corrupted`);
      if (m._components.size === 0) {
        if (!this._cc._objects.delete(object.id()))
          throw new Error(`control center '_objects' is corrupted`);
        object.__manager = new VersionedObjectManager.UnregisteredVersionedObjectManager(m);
      }
    }
    this._cc._components.delete(this._component);
  }

  controlCenter(): ControlCenter {
    return this._cc;
  }

  create<T extends VersionedObject>(classname: string, categories: string[] = [], ...args) : T {
    return this.registerObject(this._cc.configuration().create(this._cc, classname, categories, ...args));
  }

  find(id: Identifier) : VersionedObject | undefined {
    return this.registerObject(this._cc._objects.get(id));
  }

  findChecked(id: Identifier) : VersionedObject {
    let vo = this.find(id);
    if (!vo)
      throw new Error(`cannot find object with id ${id}`);
    return vo;
  }

  findOrCreate<T extends VersionedObject>(id: Identifier, classname: string, categories: string[] = []) : T {
    let vo = this.find(id);
    if (!vo) {
      vo = this.create<T>(classname, categories);
      vo.manager().setId(id);
    }
    return vo as T;
  }

  registerObject<T extends VersionedObject>(object: T) : T;
  registerObject<T extends VersionedObject>(object: T | undefined) : T | undefined;
  registerObject<T extends VersionedObject>(object: T | undefined) : T | undefined {
    if (!this._component)
      throw new Error(`this ControlCenterContext is already destroyed`);
    if (object) {
      if (object.controlCenter() !== this._cc)
        throw new Error(`you can't register an object that is associated with another control center`);
      let id = object.id();
      let d = this._cc._objects.get(id);
      if (!d)
        this._cc._objects.set(id, d = object);
      if (d !== object)
        throw new Error(`a different object with the same id (${id}) is already registered`);
      this._objects.add(object);
      d.manager()._components.add(this._component);
    }
    return object;
  }

  registerObjects<T extends VersionedObject>(objects: T[]): T[] {
    for (let object of objects)
      this.registerObject(object);
    return objects;
  }

  unregisterObject(object: VersionedObject) : void {
    if (!this._component)
      throw new Error(`this ControlCenterContext is already destroyed`);
    let id = object.id();
    if (!this._cc._objects.get(id))
      throw new Error(`cannot unregister an object that is not registered`);
    let m = object.manager();
    if (!m._components.delete(this._component))
      throw new Error(`cannot unregister an object that is not registered by the given component`);
    if (!this._objects.delete(object))
      throw new Error(`control center '_components' is corrupted`);
    if (m._components.size === 0) {
      if (!this._cc._objects.delete(id))
        throw new Error(`control center '_objects' is corrupted`);
      object.__manager = new VersionedObjectManager.UnregisteredVersionedObjectManager(m);
    }
  }

  unregisterObjects(objects: VersionedObject[]) {
    for (let object of objects)
      this.unregisterObject(object);
  }

  swapObjects<T extends VersionedObject>(oldObjects: T[], newObjects: T[]) : T[] {
    this.unregisterObjects(oldObjects);
    this.registerObjects(newObjects);
    return newObjects;
  }

  swapObject<T extends VersionedObject>(oldObject: T | undefined, newObject: T) : T;
  swapObject<T extends VersionedObject>(oldObject: T | undefined, newObject: T | undefined) : T | undefined;
  swapObject<T extends VersionedObject>(oldObject: T | undefined, newObject: T | undefined) : T | undefined {
    this.swapObjects(oldObject ? [oldObject] : [], newObject ? [newObject] : []);
    return newObject;
  }

  componentObjects() : ImmutableSet<VersionedObject> {
    return this._objects;
  }

  farPromise<A0, R>(invokable: Aspect.Invokable<A0, R>, a0: A0) : Promise<Result<R>> {
    return Invocation.farPromise<A0, R>(this, invokable, a0);
  }
}

export class ControlCenter {
  /** @internal */ readonly _notificationCenter = new NotificationCenter();
  /** @internal */ readonly _objects = new Map<Identifier, VersionedObject>();
  /** @internal */ readonly _components = new Map<AComponent, ControlCenterContext>();
  /** @internal */ readonly _configuration: AspectConfiguration;
  /** @internal */ readonly _defaultContext: { [name: string]: VersionedObject };

  constructor(configuration: AspectConfiguration) {
    this._configuration = configuration;

    if ( this._configuration._initDefaultContext) {
      let ccc = new ControlCenterContext(this, this);
      this._defaultContext = this._configuration._initDefaultContext(ccc);
    } else {
      this._defaultContext = {};
    }

  }

  defaultContext() {
    return  this._defaultContext;
  }


  /// events
  notificationCenter() { return this._notificationCenter; }

  /// category registration
  safe<T>(work: (ccc: ControlCenterContext) => T) : T;
  safe<T>(work: (ccc: ControlCenterContext) => Promise<T>): Promise<T>;
  safe<T>(work: (ccc: ControlCenterContext) => Promise<T> | T): Promise<T> | T {
    let ccc = new ControlCenterContext(this, {});
    try {
      let r = work(ccc);
      if (r instanceof Promise) {
        r = r.then(
          (res) => { ccc.destroy(); return Promise.resolve(res); },
          (err) => { ccc.destroy(); return Promise.reject(err); }
        );
      }
      else {
        ccc.destroy();
      }
      return r;
    }
    catch (e) {
      ccc.destroy();
      throw e;
    }
  }

  registerComponent(component: AComponent) : ControlCenterContext {
    let ccc = this._components.get(component);
    if (!ccc)
      this._components.set(component, ccc = new ControlCenterContext(this, component));
    return ccc;
  }

  ccc(component: AComponent) {
    let ccc = this._components.get(component);
    if (!ccc)
      throw new Error(`you must register the component with 'registerComponent' before working with it`);
    return ccc;
  }

  unregisterComponent(component: AComponent) {
    this.ccc(component).destroy();
  }

  componentObjects(component: AComponent) : ImmutableSet<VersionedObject> {
    return this.ccc(component).componentObjects();
  }

  isRegistered(component: AComponent, object: VersionedObject): boolean {
    let ccc = this._components.get(component);
    return ccc ? ccc._objects.has(object) : false;
  }

  /// category creation
  aspect(classname: string) : Aspect.Installed | undefined {
    return this._configuration.aspect(classname);
  }
  aspectChecked(classname: string) : Aspect.Installed {
    return this._configuration.aspectChecked(classname);
  }
  installedAspects() : IterableIterator<Aspect.Installed> {
    return this._configuration.aspects();
  }

  /// category cache
  configuration() {
    return this._configuration;
  }

  /** @internal */
  _changeObjectId(object: VersionedObject, old_id: Identifier, new_id: Identifier) {
    if (!this._objects.delete(old_id))
      throw new Error(`an object with id ${old_id} should be registered`);
    if (this._objects.has(new_id))
      throw new Error(`a different object with the same id (${new_id}) is already registered`);
    this._objects.set(new_id, object);
  }
}
