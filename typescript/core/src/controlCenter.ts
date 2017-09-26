import {
  FarTransport, VersionedObject, VersionedObjectManager, VersionedObjectConstructor, NotificationCenter, Result, DataSource,
  Aspect, AspectConfiguration, ImmutableSet,
} from './core';

export type Identifier = string | number;
export type FarImplementation<P extends VersionedObject, A, R> = ((this: P, arg: A) => R | Result<R> | Promise<R | Result<R>>);

export interface AComponent {

}

export class ControlCenter {
  /** @internal */ readonly _notificationCenter = new NotificationCenter();
  /** @internal */ readonly _objects = new Map<Identifier, VersionedObject>();
  /** @internal */ readonly _components = new Map<AComponent, Set<VersionedObject>>();
  /** @internal */ readonly _configuration: AspectConfiguration;

  constructor(configuration: AspectConfiguration) {
    this._configuration = configuration;
  }

  /// events
  notificationCenter() { return this._notificationCenter; }

  /// category registration
  registerComponent(component: AComponent) {
    if (!this._components.has(component))
      this._components.set(component, new Set());
  }

  unregisterComponent(component: AComponent) {
    let objects = this._components.get(component);
    if (!objects)
      throw new Error(`cannot remove unregistered component`);
    for (let object of objects) {
      let m = object.manager();
      if (!m._components.delete(component))
        throw new Error(`control center '_components' is corrupted`);
      if (m._components.size === 0) {
        if (!this._objects.delete(object.id()))
          throw new Error(`control center '_objects' is corrupted`);
        object.__manager = new VersionedObjectManager.UnregisteredVersionedObjectManager(m);
      }
    }
    this._components.delete(component);
  }

  private _component_objects(component: AComponent) {
    let component_objects = this._components.get(component);
    if (!component_objects)
      throw new Error(`you must register the component with 'registerComponent' before working with it`);
    return component_objects;
  }

  private _registerObject(component: AComponent, component_objects: Set<VersionedObject>, object: VersionedObject) {
    if (object.controlCenter() !== this)
      throw new Error(`you can't register an object that is associated with another control center`);
    let id = object.id();
    let d = this._objects.get(id);
    if (!d)
      this._objects.set(id, d = object);
    if (d !== object)
      throw new Error(`a different object with the same id (${id}) is already registered`);
    component_objects.add(object);
    d.manager().registerComponent(component);
  }

  private _unregisterObject(component: AComponent, component_objects: Set<VersionedObject>, object: VersionedObject) {
    let id = object.id();
    if (!this._objects.get(id))
      throw new Error(`cannot unregister an object that is not registered`);
    let m = object.manager();
    if (!m._components.delete(component))
      throw new Error(`cannot unregister an object that is not registered by the given component`);
    if (!component_objects.delete(object))
      throw new Error(`control center '_components' is corrupted`);
    if (m._components.size === 0) {
      if (!this._objects.delete(id))
        throw new Error(`control center '_objects' is corrupted`);
      object.__manager = new VersionedObjectManager.UnregisteredVersionedObjectManager(m);
    }
  }

  isRegistered(component: AComponent, object: VersionedObject): boolean {
    let component_objects = this._components.get(component);
    return component_objects ? component_objects.has(object) : false;
  }

  registerObject(component: AComponent, object: VersionedObject) {
    this._registerObject(component, this._component_objects(component), object);
  }

  registerObjects(component: AComponent, objects: VersionedObject[]) {
    let component_objects = this._component_objects(component);
    for (let object of objects)
      this._registerObject(component, component_objects, object);
  }

  unregisterObject(component: AComponent, object: VersionedObject) {
    this._unregisterObject(component, this._component_objects(component), object);
  }

  unregisterObjects(component: AComponent, objects: VersionedObject[]) {
    let component_objects = this._component_objects(component);
    for (let object of objects)
      this._unregisterObject(component, component_objects, object);
  }

  swapObjects<T extends VersionedObject>(component: AComponent, oldObjects: T[], newObjects: T[]) : T[] {
    this.unregisterObjects(component, oldObjects);
    this.registerObjects(component, newObjects);
    return newObjects;
  }

  swapObject<T extends VersionedObject>(component: AComponent, oldObject: T | undefined, newObject: T) : T;
  swapObject<T extends VersionedObject>(component: AComponent, oldObject: T | undefined, newObject: T | undefined) : T | undefined;
  swapObject<T extends VersionedObject>(component: AComponent, oldObject: T | undefined, newObject: T | undefined) : T | undefined {
    this.swapObjects(component, oldObject ? [oldObject] : [], newObject ? [newObject] : []);
    return newObject;
  }

  find(id: Identifier) : VersionedObject | undefined {
    return this._objects.get(id);
  }

  findChecked(id: Identifier) : VersionedObject {
    let vo = this._objects.get(id);
    if (!vo)
      throw new Error(`cannot find object with id ${id}`);
    return vo;
  }

  componentObjects(component: AComponent) : ImmutableSet<VersionedObject> {
    return this._component_objects(component);
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

  aspectFactory<T extends VersionedObject>(classname: string, categories: string[] = []) : Aspect.Factory<T> {
    return this._configuration.aspectFactory<T>(this, classname, categories);
  }

  create<T extends VersionedObject>(classname: string, categories: string[] = [], ...args) : T {
    return this._configuration.create<T>(this, classname, categories, ...args);
  }

  findOrCreate<T extends VersionedObject>(id: Identifier, classname: string, categories: string[] = []) : T {
    let vo = this._objects.get(id);
    if (!vo) {
      vo = this.create<T>(classname, categories);
      vo.manager().setId(id);
    }
    return vo as T;
  }

  /// category cache
  configuration() {
    return this._configuration;
  }

  changeObjectId(oldId: Identifier, newId: Identifier) {
    let o = this._objects.get(oldId);
    if (o !== undefined) {
      this._objects.delete(oldId);
      if (this._objects.has(newId))
        throw new Error(`a different object with the same id (${newId}) is already registered`);
      this._objects.set(newId, o);
    }
  }

  mergeObject(object: VersionedObject) {
    let m = object.manager();
    let o = this.find(object.id());
    if (o && o !== object)
      o.manager().mergeWithRemote(m);
    return o || object;
  }
}
