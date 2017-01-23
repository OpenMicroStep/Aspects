## Event

Au lieu d'être simplement une chaine de caractère, un évenement est un symbole qui doit être déclaré pour pouvoir être utilisé.

Cela permet :

 - d'associer des informations liées au typages et donc de faire des vérifications à la compilation sur l'usage de cet évenement
 - d'empêcher les conflits sur le nommage des évenements

Exemple de déclaration d'évènement:

```ts
const myAppEvents = {
    "personSelected": new Event<AppComponent,{ selected: Person }>("personSelected"),
    "queryResults": new Event<PersonListComponent,{ invocation: Invocation<DataSource, Person[]> }>("personSelected"),
}
```



## Notification

Une notification est tout simplement la publication d'un évenement emit par un objet et auquel il est possible d'attache des informations complémentaires.

### keys

#### name: string
Un nom d'événement

#### object: object
Un objet

#### info: any
Un dictionnaire d'informations suplémentaire ou un objet

## class NotificationCenter

Permet d'observer soit un événement, soit un objet soit un événement sur un objet.
 
### category observer [ts]
Management des observateurs

#### addObserver(observer:object, method:string, name:string, anObject:object)
Enregistre l'observateur sur le nom de l'événement `name` et sur l'objet `anObject` (ou seulement l'un des deux).

Lorsqu'un événement correspondant survient, une notification est envoyée à l'observateur avec la méthode `method`.

#### removeObserver(observer:object)
Retire l'observateur de toutes ces observations.

#### removeObserver(observer,name,object)
Retire l'observateur de toutes les observations correspondantes.  
Si `name` et `object` sont null, retire toutes les observations de l'observateur.  
Si `name` est null, retire tous les événements relatifs à `object`.  
Si `object` est null, retire tous les événements `name`.  
Si `name` et `object` sont non null, retire juste l'observation de l'événement `name` sur `object`.

### category post [ts]
Posting Notifications

#### postNotification(notification)
Poste une notification ce qui a pour effet de prévenir les observateurs.  
La notification est un objet {name: aName, object: anObject, info: aDict} où info est optionnelle.
