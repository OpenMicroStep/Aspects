## class AControlCenter

La classe AControlCenter

### attributes

### category component [ts]

#### registerObjects(component: AComponent, objects:array, method: string, events:array)
Déclare au CdC qu'un composant utilise un objet ou un ensemble d'objets.  
En même temps, si `method` non null et `events` non null et non vide, cela enregistre le composant comme observateur des événements sur les objects.  
Donc lorqu'un événement de events survient sur l'un des objets, la méthode désignée est appellée.  
Pour s'enregistrer sur tous les événements, on peut utiliser la constante `AObject.AllEvents`.

#### unregisterObjects(conmponent: AComponent, objects:array)
Signale au CdC que les objets ne sont plus utilisés par le composant et supprime ce dernier comme observateur sur les objets. 

#### notificationCenter()
Le centre de notification du CdC à partir duquel on peut enregistrer un observateur.

### category dataSource

#### defaultDataSource()
#### setDefaultDataSource()

