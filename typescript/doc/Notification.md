## class AObject

La classe AObject est la classe mère dont hérite tous les objets à aspects.

Les classes de ces objets sont décrites sous forme de fichiers .interface.md.  

Un tel fichier contient les attributs de l'objet, les méthodes classées en catégories et les aspects.

Exemple:

```
## class Person

### attributes
#### _firstName: string
#### _lastName:  string
#### _birthDate: date

### category core [ts, objc]
#### firstName() : string
#### lastName()  : string
#### fullName()  : string
#### birthDate() : date

### category calculation [objc]
#### age()       : integer

### aspect server
#### categories: core, calculation

### aspect client
#### categories: core
#### farCategories: calculation
```

Si l'on se place du point de vue d'un aspect particulier (ex: client) l'objet dispose en local des méthodes incluses dans les catégories de l'aspect.  

Il peut aussi utiliser les méthodes des catégories indiquées en farCategories mais leur utilisation se fait alors comme indiqué ci-après.
 
Tout d'abort, une méthode d'une catégorie lointaine est une méthode tout-à-fait classique et qui s'utilise en local normalement. Elle n'a cependant qu'un seul argument mais qui peut être un dictionnaire.

	result= object.method(arg);

Lorsqu'elle est utilisée à distance, le retour est **asynchrone**, donc pour récupérer le résultat il faut utiliser une technique asynchrone proposée par le centre de contrôle (cc).

Première possibilité: le callback avec la fonction `far`:

	cc.far(object, method, arg, (object, result)=>{…});

Deuxième possibilité via `farEvent`:

	identifiant de la requête= cc.farEvent(object, method, arg, 'event'); 

Lors du retour, l'évènement `event` est publié sur l'objet `object` avec en information l'identifiant de la requête et le résultat (éventuellement partiel). Pour le recevoir, il faut s'etre déclaré comme observateur dans le centre de notification (nc).

	nc.addObserver(this, method, object, 'event')

	method(notification) // {object, évent, info}

Troisième possibilité via farAsync:  
TODO: voir ce qui sera le plus pratique.

	cc.farAsync(pool, object, method, arg); // le résultat est dans pool.context.result
	cc.farAsync(pool, object, method, arg, 'res'); // le résultat est dans pool.context.res

TODO: Pour les réceptions partielles: 

Versions:

Lorsqu'un objet est récupéré, il existe dans une version donnée. Si on modifie la valeur d'un attribut en local, c'est cette valeur qui devient la valeur courante et quand l'objet sera sauvé la valeur localoe deviendra la valeur de la nouvelle version.

Il est cependant toujours possible de connaître la valeur de référence de la version en utilisant la méthode:

	methode

Lorsqu'une nouvelle version de l'objet est reçu, il y a conflit si la nouvelle valeur n'est ni celle de l'ancienne version ni celle modifiée localement (quelqu'un d'autre a modifié la valeur). Dans ce cas, une notification est levée.

### attributes

#### _id: Identifier
L'identifiant de l'objet.

#### _entity: Entity | null
???

#### _controlCenter: AControlCenter
Le CdC qui gère cet objet.

#### _definition: AControlCenter.Definition;
??? Définition de la classe et plus précisément de l'aspect courant de la classe => du coup `aspect` ?

#### _observers: Set<AObserver>;
A priori non => dans le centre de notification

##### _localAttributes: AAttributes
Les attributs et les valeurs qui ont été modifiées localement.
Une valeur locale est toujours différente de la valeur de la version.
Si la valeur est supprimée, elle est à null.

##### _version: number
La version de référence.

##### _versionAttributes: AAttributes
Les attributs et les valeurs de la version de référence.

##### _oldVersion: number
Uniquement en cas de conflit. C'est la version que l'on avait précédemment.

##### _oldVersionAttributes: AAttributes
Uniquement en cas de conflit. C'est la version que l'on avait précédemment.

manque si l'objet a été chargé partiellement ou non: un attribut particuler du style `_isPartial` ?
 
### category core [ts]
#### firstName() : string;
