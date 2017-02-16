import {FarTransport, PublicTransport, VersionedObject, VersionedObjectManager, VersionedObjectConstructor, NotificationCenter, Invocation, InvocationState, DataSource, Aspect} from './core';

export type Identifier = string | number;
export type FarImplementation<P extends VersionedObject, A, R> = ((this: P, arg: A) => R | Promise<R | Invocation<P, R>>);

export interface AComponent {

}

function tmpLoad(o, k) {
  return typeof k === 'string' && (k=k.substring(1)) ? Object.assign({ name: k }, o[`${k}=`]) : k;
}

export class ControlCenter {
  _notificationCenter = new NotificationCenter();
  _objects = new Map<Identifier, { object: VersionedObject, components: Set<AComponent> }>();
  _components = new Set<AComponent>();
  _aspects = new Map<string, Aspect.Constructor>();

  constructor() {}
  /// events
  notificationCenter() { return this._notificationCenter; }

  /// category component
  registeredObject(id: Identifier) : VersionedObject | undefined {
    let o = this._objects.get(id);
    return o ? o.object : undefined;
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

  registerObjects(component: AComponent, objects: VersionedObject[], method?: string, events?: string[]) {
    if (!this._components.has(component))
      throw new Error(`you must register the component with 'addComponent' before registering objects`);
    const notificationCenter = this.notificationCenter();
    objects.forEach(o => {
      let id = o.id();
      let i = this._objects;
      let d = i.get(id);
      if (method)
        (<(string | undefined)[]>(events || [undefined])).forEach(event => notificationCenter.addObserver(component, method, event, o));
      if (!d)
        i.set(id, d = { object: o, components: new Set() });
      if (d.object !== o)
        throw new Error(`a different object with the same id (${id}) is already registered`);
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
  aspect(name: string) {
    return this._aspects.get(name);
  }

  create<T extends VersionedObject>(cstor: VersionedObjectConstructor<VersionedObject>, categories: string[]) : T {
    let aspectCstor = this.aspect(cstor.definition.name);
    if (!aspectCstor)
      throw new Error(`cannot create ${cstor.definition.name}: no aspect found`);
    for (let category of categories)
      if (!aspectCstor.aspect.categories.has(category))
        throw new Error(`cannot create ${cstor.definition.name}: category ${category} is missing in aspect ${aspectCstor.aspect.aspect}`);
    return new aspectCstor() as T;
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
    let o = this.registeredObject(object.id());
    if (o && o !== object)
      o.manager().mergeWithRemote(m);
    return o || object;
  }
}
