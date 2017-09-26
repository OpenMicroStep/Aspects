## class AControlCenter

La classe AControlCenter

### Internal attributes

#### `_notificationCenter: NotificationCenter`
Current notification center (once set at creation time, this value never changes)

#### `_objects: Map<Identifier, { object: VersionedObject, components: Set<AComponent> }>`
Map of registered object identifiers and for each one the set of registered components

#### `_components: Set<AComponent>`
Set of registered components

#### `_configuration: AspectConfiguration`
Aspect configuration associated with this control center

### Events

#### `notificationCenter()`
Notification center, handle event observation and dispatch.

### Registration

#### `registerComponent(component: AComponent)`
Register _component_ with this controlCenter.

#### `unregisterComponent(component: AComponent)`
Unregister _component_ with this controlCenter.  
If there is any registered object to _component_, the registration is removed.  
If there is any invocation in progress for _component_, the invocation is discarded.

#### `registerObject(component: AComponent, object: VersionedObject)`
Register _object_ to _component_, allowing _component_ to manipulate it until the component or the objet is unregistered.

#### `registerObjects(component: AComponent, objects: array)`
Register _objects_ to _component_, allowing _component_ to manipulate them until the component or the objet is unregistered.

#### `unregisterObjects(component: AComponent, objects: array)`
Unregister _objects_ of _component_.  
Observers by _component_ on _objects_ are removed.  
If there is any invocation in progress on one of _objects_, the invocation is discarded.

#### `unregisterObject(component: AComponent, object: VersionedObject)`
Unregister _object_ of _component_.  
Observers by _component_ on _object_ are removed.  
If there is any invocation in progress on _object_, the invocation is discarded.

#### `swapObjects(component: AComponent, oldObjects: array, newObjects: array)`
Unregister _oldObjects_ from _component_, then register _newObjects_ to _component_.

#### `swapObjects(component: AComponent, oldObject?: array, newObject?: array)`
Unregister _oldObject_ from _component_ if _oldObject_ is not undefined, then register _newObject_ to _component_  if _newObject_ is not undefined.

#### `find(id: Identifier) : VersionedObject`
Returns the registered object that as the given _id_ if any.

#### `componentObjects(component: AComponent) : <0, *, VersionedObject>`
Returns the set of objects registered to _component_.

### Object creation

#### `configuration(): AspectConfiguration`
Returns the current aspect configuration.

#### `aspect(classname: string): Aspect.InstallAspect | undefined`
Get an installed aspect from its classname or undefined if not found.

#### `aspectChecked(classname: string): Aspect.InstallAspect`
Get an installed aspect from its classname.

__!__: throws if __classname__ doesn't exists in the current configuration.

#### `aspectFactory<T extends VersionedObject>(classname: string, categories: string[]) : Aspect.Factory<T>`
Returns a method that will create a new versionned object of class _classname_ attached to __cc__ each time it's called.

__!__: throws in the following cases:

  - __classname__ doesn't exists in this configuration
  - the installed aspect of __classname__ doesn't have all the requested categories

#### `installedAspects(): IterableIterator<Aspect.Installed>`
Returns the list of installed aspects (ie: classname, aspect, attributes, methods, categories, implementation).

#### `create(classname: string, categories: [0, *, string])`
Create and returns a new object of _classname_ that responds to _categories_.

__!__: throws if __classname__ doesn't exists in the current configuration.

#### `findOrCreate(id: Identifier, classname: string, categories: [0, *, string]) : VersionedObject`
Returns the registered object that as the given _id_ if any.  
Otherwise, create and returns a new object of _classname_ that responds to _categories_ with _id_ as identifier.

__!__: throws if __classname__ doesn't exists in the current configuration.

### Internals

#### `changeObjectId(oldId: Identifier, newId: Identifier)`
Change an object identifier

#### `mergeObject(object: VersionedObject)`
Merge _object_ into the current set of registered objects (ie: attribute merging)
