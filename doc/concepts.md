# Aspects

## Résumé

**Aspects** est un ensemble de concepts à partir desquels seront construits des interfaces graphiques des produits Logitud. 
Ces concepts sont indépendants des médias finaux (web ou mobile notamment) et indépendants des outils qui seront utilisés pour réaliser les composants d'interfaces finaux. 
Par contre, ils donnent des contraintes que devront respecter ces composants.

Le pluriel veut souligner qu'un même objet n'est pas vue exactement de la même manière selon que l'on se place du point de vue d'un client ou d'un serveur et donc qu'il faut prendre en compte tous ces aspects.

## <a name="☝︎"></a>Sommaire

[Objets et interfaces](#Objets)  
[Aspects et catégories](#Aspects)  
[Centre de contrôle](#CdC)  

## <a name="Objets"></a>Objets et interfaces [☝︎](#☝︎)

Les objets utilisés dans une application peuvent apparaître dans différents langages. 
Aujourd'hui, pour permettre l'utilisation d'un seul langage coté client et serveur, on écrira en TypeScript, qui est un surensemble typé du javascript.

La classe d'un objet aura une représentation, nommée *interface*, dans chacun des langages. 
On disposera par exemple d'une interface objective-c (.h) pour l'utilisation de l'objet coté serveur et d'une interface javascript (.ts) pour l'utilisation de l'objet dans un client web.

Ces interfaces seront rassemblées dans un même fichier .interfaces. 
Et c'est le build qui construira automatiquement ces fichiers. La description des interfaces est donnée ci-dessous.

**Ex:** class Personne en obj-c et ts
	
```objc
@interface Person : NSObject 
{
@private
  MSString *_firstName, *_lastName;
  MSDate *_birthDate;
}

- (MSString*)firstName;
- (MSString*)lastName;
- (MSString*)fullName; // first last
- (MSDate*)birthDate;
- (int)age;

@end
```

```ts
export class Person {
  _firstName: string;
  _lastName:  string;
  _birthDate: date;

  firstName() : string;
  lastName()  : string;
  fullName()  : string;
  birthDate() : date;
  age()       : integer;
}
```

*ts* ne permet pas cependant de séparer l'interface de l'implémentation.

Au lieu de cela, on écrira les interfaces dans un fichier indépendant du langage, qui est formalisé et qui s'écrit sous la forme d'une documentation pour encourager tout un chacun à décrire le plus possible les objets construits.

Voici à quoi ressemble les interfaces de Person rassemblés dans un même fichier `Person.interface.md` :

```md
## class Person
Description de la classe

### attributs
#### _firstName: string;
#### _lastName:  string;
#### _birthDate: date;

### category core [ts, objc]
#### firstName() : string;
#### lastName()  : string;
#### fullName()  : string;
#### birthDate() : date;

### category calculation [objc]
#### age()       : integer;
```

Dans l'exmeple ci-dessus, on a 3 mots clés qui sont `class`, `attributs` et `category`.

Toute méthode doit faire partie d'une catégorie. Chaque catégorie doit être implémentée dans les langages spécifiés pour cette catégorie.

En `ts` on séparera dans l'implémentation les catégories par des lignes de commentaire comme ci dessous:

~~~
/// category xxx
~~~

### Description des types

Le type est soit un type primaire, soit un type décrit.

- integer
- decimal
- date
- localdate
- string
- array
- map
- identifier
- object
- nom d'un classe

Si on veut décrire le type plus finement on ajoutera la cardinalité et la constitution éventuelle du type si c'est un tableau ou un dictionnaire.

Cardinalité:  min:max (`*` si max infini). Exemples:

- `0:1` 0 ou 1 (défaut)
- `1:1` 1 et un seul
- `0:*` 0 ou plus
- `0:4` de 0 à 4
- `5:7` de 5 à 7

### signature des méthodes

Pour les méthodes des catégories lointaines, on vérifiera les types des arguments et du résultat en fonction de la déclaration de la méthode.


~~~
### category calculation [objc]
  age(void)    : integer;
  labels(void) : {first-last:string, last-first:string, names:[2, string]},
  mess(dict)   : {*:{_key:identifier, nom:string, prénom:string}},

[2, string]: un array de 2 strings
dict: pas d'autre verif que c'est un dico
~~~

## <a name="Aspects"></a>Aspects et catégories [☝︎](#☝︎)

Un objet n'est en général pas le même selon qu'on le regarde du point de vue d'un serveur ou d'un client. En général, il y a une partie centrale qui est commune aux deux environnements (notre catégorie `core` dans l'exemple précédent). Mais certaines méthodes ne vont s'exécuter que du coté serveur (`calculation` dans notre exemple).

Un aspect représente alors l'objet selon un point de vue particulier. Dès lors, décrire un aspect `server` et un aspect `client` revient à énumérer les catégories qui seront effectivement présentes dans chacun des environnements.

~~~
### aspect server
#### category: core, calculation

### aspect client
#### category: core
#### farCategory: calculation
~~~

Les méthodes de `calculation` ne s'exécutent pas au niveau du client mais au niveau du serveur. Par contre, le client y a accès si la catégorie est signalée comme `farCategory` (catégorie lointaine).

Restriction des méthodes pour les catégories lointaines. Un seul arg qui peut être un dico. Vérification des types en profondeur.

Une telle méthode n'a qu'un argument en entrée, qui est typé, et dont le type est vérifié coté serveur avant l'exécution de la méthode. De même, le type du résultat sera vérifié coté client avant d'être délivré. Le niveau de vérification dépend de la précision du typage.

Ici, on n'a donné que deux aspects à l'objet Person mais il peut exister plus d'aspects aussi bien client que serveur. Supposons par exemple que l'on ait un serveur carto qui implémente certaines méthodes regroupées dans une catégorie `carto`. Alors l'aspect ``server-carto` contiendra les catégories `core`et `carto`et cette dernière partie pourra être incluse comme `farCategory` du client.

~~~
Person       core calculation      carto

server       core calculation
server-carto core                  carto
client       core calculation(far) carto(far)
~~~

Pour introduire les aspects, nous avons parlé de clients et de serveurs mais de manière plus générale, un aspect est simplement la description d'un environnement qui exécute un certain nombre de catégories et qui peut accéder à d'autres catégories implémentées sur d'autres environnements.

La seule restriction est qu'une catégorie qui apparait dans au moins un aspect comme lointaine (`far`) ne doit appartenir en tant que catégorie qu'à un et un seul aspect. (Peut évoluer dans le futur.)

Futur: un aspect peut déclarer explicitement ses attributs s'il veut en restreindre la liste ?

## validation (Futur ?)

Est-ce qu'on valide au niveau de la classe ou au niveau d'un aspect ? Ou encore les deux avec surcherge pour l'aspect ?

Pour chaque attribut (éventuellement au niveau d'un aspect), on précise en plus de son type, s'il est requis et sa validité.

~~~
### attributs
#### _firstName: string;  required:true; valid:{min-length:4};
#### _firstName: string;  cardinality:1:1; valid:{min-length:4}; // ??
#### _someInt:   integer; required:true; valid:{min:12, max:15};
~~~

`required` est la même chose qu'une cardinalité `1:-` ?

`valid`regroupe selon le type des vérifications classiques du genre min, max, min-length.

En plus de cela, on peut déclarer

~~~
validation: isValid, // nom + prénom + age > 18
validationAttributs:[firstName, lastName, birthdate],
~~~

## Persistence DataSource

Un objet persistent contient toujours un attribut *_id* et un attribut *_version* qui sont toujours transmis avec l'objet. Par contre, certains messages pourront renvoyer des objets partiels (avec seulement quelques attributs renseignés), principalement pour constituer des listes. Dans ce cas l'objet sera signalé comme chargé partiellement (*_partial:true*).

L'objet DataSource exporte plusieurs méthodes via une catégotie lointaine permettant de récupérer des données en posant des questions, de récupérer des objets complets à partir d'in identifiant ou de sauver ces objets.

## <a name="CdC"></a>Centre de contrôle [☝︎](#☝︎)

Toute application cliente est organisée autour d'un centre de contrôle permettant:

- de gérer les objets au sein du client
- de gérer les objets et les méthodes lointaines entre le client et le serveur
- d'organiser les comportements des composants d'interface pour rendre ces derniers les plus indépendants possibles des outils utilisés (angular, react...)

Un CdC nommé `x` sait prendre en compte tous les objets déclarant un aspect nommé `x`.

Les méthodes déclarées dans les catégories de l'aspect sont directement accessibles.

Les méthodes déclarées dans les catégories lointaines sont exécutées sur un serveur qui les implémente.

### attributs

Le label est le nom de l'attribut. Seuls les labels réellement utilisés par le CdC doivent être repris.

On peut rajouter des éléments de validation par ex min, max. Et si l'attribut est requis pour que l'objet puisse exister.


### validation

En plus de cette validation portant sur chaque attribut, on peut donner explicitement la liste des attributs nécessaires à la validation d'un objet (`validationAttributs`). Si cette propriété existe, tous les attributs de la liste doivent être valides.

On peut aussi fournir une méthode de validation. Dans ce cas, c'est elle seule qui décide de la validité de l'objet. Si présents, les éléments de la liste `validationAttributs` servent uniquement d'informations pour colorer les attributs requis (par exemple les mettre en premier et signaler par une `*` le caractère obligatoire).

### méthodes

### messages

### messages de l'application (une clase CdC ?)

On sait toujours:

- lever un objet dont on connait l'id
- lever des listes standards d'objets (partiels), comme la liste des personnes, la liste des objets d'un attribut (ex: des enfants) et inversement, remonter un lien (ex: la liste des parents d'une personne donnée même si on ne dispose que d'un lien `enfants`).
- enregistrer un objet, une grappe.

## Contexte

Un dict de tous les objets avec en clé les id, avec la classe, la version de référence de l'objet et pour tous les attributs la valeur de référence et la valeur modifiée.

De plus pour tous les objets, on connait les composants qui les utilisent (ie tous les composants déclarent les objets qu'ils utilisent (et les attributs dont ils ont besoins).

On retient de plus si l'objet est levé en entier ou partiellement.

## Composant

Tout composant interagit en permanence avec le CdC pour obtenir des informations sur un attribut (type, obligatoire...), une valeur, pour informer du changement d'une valeur.

Un composant ne retient pas les valeurs mais seulement les _id des objets utilisés. Lorsqu'une valeur est modifiée, le composant doit en informer le CdC qui a tout moment peut lui fournir la valeur de référence (celle reçue par la DataSource) et la valeur modifiée.

Lorsqu'une valeur est sauvée, l'objet est rechargé intégralement (sans profondeur) et la valeur modifiée devient donc la valeur de référence (si la modification a bien été acceptée).

Dans la suite on parlera de différents composants communs:

- Q: un champs de recherche
- L: une liste (par exemple une liste de personnes)
- F: une fiche
- A: un bouton pour ajouter un élément (par exemple une nouvelle personne)

Il déclare les objets qu'il utilise, les actions qu'il a sur d'autres composants, les objets qu'il utilise.

Evénement= composant? action? value?

Un composant publie des événements:

- une sélection dans une liste

Un composant déclare les événements dont il veut être prévenu:

- entité personne a été créée (pour mettre à jour la liste des personnes)
- un attribut a changé
- le champs d'un composant particulier a changé (qd Q change, L change)

Un composant déclare sa fin de vie ou l'état à sauver pour snapshot  
=> le CdC a un contexte de composant.

**Ex:**

Le composant Q commence par publier toute modification de son champs de recherche.

Le composant L s'inscrit sur cette modification (événement portant sur la modification du composant Q).  
*==> Il charge alors sa liste avec des objets partiels via une demande au CdC. En réponse, il obtient une liste d'objets partiels. Il prévient alors le CdC de l'utilisation de tous ces objets. (S'il avait déjà une liste d'objets, le composant a prévenu le CdC qu'il ne les utilisait plus.)*  
Le composant L publie un événement lors de toute sélection.

Le composant F s'inscrit sur la sélection de L.  
*==> Il prévient le CdC de son utilisation de l'objet sélectionné (en signalant aussi qu'il n'utilise plus le précédent) et lui demande le chargement complet de l'objet.*  
Il s'inscrit aussi sur la l'action de A (ajout) pour proposer une fiche vierge.  
F prévient en permanence le CdC de tout changement et peut publier un événement de modification. Il peut aussi demander au CdC l'enregistrement persistent de l'objet et publier un événement de validation lorsque l'objet est bien enregistré.

A peut s'inscrire sur toute modification de F pour empêcher par exemple tout ajout si la fiche est en cours de modification.  
*==> A peut par exemple demander à F si la fiche est modifiée pour rendre disabled le bouton.*

Enfin, L peut s'inscrire sur la validation de F (si on sépare modification et validation) pour se mettre éventuellement à jour.

Les actions vues au travers de cet exemple sont:

- modification (Q, F)
- sélection (L)
- nouveau/action? (A)
- validation (F)

## Thèmes

une couleur (noire)

## session et restauration de contexte

## Pour l'exemple:

Composants:

- Q: Champs de recherche
- L: Liste de personnes + sélection
- A: Ajout
- F: Fiche (lecture / modification)

- Auth
- Menu / Sous-menu
- Bureau

