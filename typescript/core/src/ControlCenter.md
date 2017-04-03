## class AControlCenter

La classe AControlCenter

### Attributes

#### _notificationCenter: NotificationCenter
Current notification center (once set at creation time, this value never changes)

#### _objects: Map<Identifier, { object: VersionedObject, components: Set<AComponent> }>
Map of registered object identifiers and for each one the set of registered components

#### _components: Set<AComponent>
Set of registered components

#### _aspects: Map<string, Aspect.Constructor>
Map of aspect by classname to the generated final class implementation.

### Events

#### notificationCenter()
Le centre de notification du CdC à partir duquel on peut enregistrer un observateur.

### Components

#### registerComponent(component: AComponent)
Register _component_ with this controlCenter.

#### unregisterComponent(component: AComponent)
Unregister _component_ with this controlCenter, any object registration to _component_ is also removed.

#### registerObjects(component: AComponent, objects:array, method: string, events:array)
Déclare au CdC qu'un composant utilise un objet ou un ensemble d'objets.  
En même temps, si `method` non null et `events` non null et non vide, cela enregistre le composant comme observateur des événements sur les objects.  
Donc lorqu'un événement de events survient sur l'un des objets, la méthode désignée est appellée.  
Pour s'enregistrer sur tous les événements, on peut utiliser la constante `VersionedObject.AllEvents`.

#### unregisterObjects(component: AComponent, objects:array)
Signale au CdC que les objets ne sont plus utilisés par le composant et supprime ce dernier comme observateur sur les objets. 

### Object creation

#### aspect(name: string)
Get final implementation of an installed aspect from its classname

#### create<T extends VersionedObject>(cstor: VersionedObjectConstructor<VersionedObject>, categories: string[])
Instantiate an object that has at least the set of required categories

### Internals

#### changeObjectId(oldId: Identifier, newId: Identifier)
Change an object identifier

#### mergeObject(object: VersionedObject)
Merge _object_ into the current set of registered objects (ie: attribute merging)
