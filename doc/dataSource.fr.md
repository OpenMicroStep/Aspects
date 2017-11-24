Source de données (DataSource)
==============================

Les contraintes posés par le centre de contrôle sur la gestion des entités pousse à toujours manipuler des grappes d'objets.
Il est donc important de disposer d'outils pour créer, rechercher, mettre à jour et supprimer des parties de ces grappes d'objets.

La sécurité autour des sources de données est un point très important, on va donc chercher à minimiser les risques au maximum:

 - le client ne doit JAMAIS être considéré comme fiable,
 - la vérification des droits et la cohérence doit TOUJOURS être fait coté serveur
 - les requêtes ne peuvent être considérées comme sécurisées que si elles sont générées coté serveur
 - les droits à considérer sont ceux s'appliquant sur les données (le droit _imprimer_ est donc sans intérêt par exemple)

## Intégrité et sécurité des données

Une source de données à pour responsabilité de gérer:

 - l'intégrité des données: l'application de modifications résultent toujours en un modèle cohérent
 - la sécurité des données: restriction en fonction des droits de la session des possibilités de lecture et de modifications

Ainsi, pour tout échange de données (lecture, création, modification, suppression) l'ensemble des objets manipulés est validé.

Dans le cas d'une lecture:
 
 - recherche de la définition de la requête
 - execution de la requête
 - vérification des droits et de la cohérence sur le résultat

Dans le cas d'une modification:

 - vérification des droits et de la cohérence avant modifications
 - application des modifications
 - vérification des droits et de la cohérence après modifications

A tout objet est associé une fonction de validation (`validate`) qui a uniquement pour rôle la validation de l'objet et non de son entourage. Cela permet d'effectuer les vérifications simples de cohérence. Cette fonction est toujours appelée par la datasource lors d'un _save_.

En plus de cette simple validation, à datasource est attaché un ensemble de validateurs.
Ainsi, pour chaque classe, il est possible de définir trois ensemble de validateurs:

  - `safe_post_load`: vérification des droits et de la cohérence sur le résultat
  - `safe_pre_save`: vérification des droits et de la cohérence avant modifications
  - `safe_post_save`: vérification des droits et de la cohérence après modifications

Chaque validateur a pour rôle de créer un __contexte de validation__ valide jusqu'a l'appel à `finalize` sur celui-ci.
Sur cet objet la fonction `for_each` sera appelée pour tous les objets à vérifier.

Un __contexte de validation__ est créer pour chaque validateur différent, il est donc possible d'accumuler des informations pour l'ensemble des objets partageant le même validateur jusqu'à la finalisation du contexte.

La finalisation du contexte de validation est la seule étape asynchrone du processus.

Pour tout problème, un validateur peut reporter les diagnostics. 
En cas de problème, l'operation _query_, _load_ ou _save_ est abandonées.

### Gestion des requêtes

Comme les requêtes ne peuvent être crée que du coté serveur (fiable), celle-ci sont répértoriés par un gestionnaire de requêtes.

Coté client (non fiable), il n'est donc pas possible de saisir une requête directement.
Il faut systématique passer par la création d'un objet contenant l'identifiant de la requête et les paramètres associés.

```ts
ccc.farPromise(datasource.query, { id: "allpersons", ...parameters });
```

## Définition d'une recherche

Une recherche à pour sortie un dictionnaire dont les clés sont définit dans la requête et les valeurs associées sont des listes d'objets.

Il y a 2 façons de définir la sortie:

 - Simple: le dictionaire racine définit directement la sortie (une unique clé et l'ensemble d'objets associé)
 - Multiple: la clé '_result_' contient une liste d'objet définissant la sortie

Pour chaque objet définissant la sortie on a:

 - `name`: le nom de clé qui sera utilisé pour la sortie
 - `where`: les contraintes à appliquer
 - `scope`: les attributs à chargés et si définit l'ordre des objets

Exemples:

```js
// Requête "simple":
{
  name: "result name",
  where: { $is: "Person" },
}
// Résultat:
=> { "result name": Person[] }
```

```js
// Requête "multiple":
{
  result: [
    { 
      name: "a",
      where: { $is: "Person" } 
    },
    { 
      name: "b",
      where: { $is: "Cat" } 
    },
  ]
}
// Résultat:
=> { "a": Person[], "b": Cat[] }
```

### Contraintes de recherche

Les contraintes de recherche sont définit à l'aide d'opérations sur les ensembles.

Un __ensemble__ est définisable de plusieurs façons:

 - par contraintes
 - par parcours d'attributs des éléments d'un ensemble
 - par construction
 - par récursion

Pour nommée un _ensemble_, il suffit que la clé associé à sa définition se termine par le caractère `=`.
Cet _ensemble_ est alors référencable via `=` suivi du nom de l'ensemble. Cette référence peut-être suivi de `:` puis du nom d'un attribut présent sur les éléments de cet ensemble.
Cela signifie alors:

> _tous les éléments de cet attribut pour tous les éléments de cet ensemble_

#### Définition par parcours d'attributs des éléments d'un ensemble

C'est un raccourci de la définition par construction permettant de créer un ensemble qui contient l'ensemble des éléments présents dans les attributs des éléments d'un autre ensemble.

La syntaxe est la suivante: `=ensemble[:attribut]*`

#### Définition par contraintes

C'est la forme la plus simple, à la manière de __mongodb__ ou encore de __sequelize__, les contraintes de recherches sont définies par des opérateurs s'appliquant sur les attributs.

C'est un dictionnaire dont chaque couple clé, valeur correspond à une contrainte supplémentaire (__AND__).   
Pour chaque clé, le contenu peut être:

  - si elle commence pas `$`, c'est un opérateur
  - sinon, c'est le chemin à parcourir pour accéder à la valeur


#### Définition par construction

La définition par construction permet de poser des contraintes entre _élements_ d'_ensembles_ afin de construire un nouvel _ensemble_ contenant les _éléments_ validant les contraintes posés. 

Par exemple sous forme mathématiques, celui ce traduit par: `{x ∈ X | tel que pour tout y ∈ Y, x.a = y.a }`

Cette forme utilise une syntaxe étendu de la définition par contraintes et s'active par présence de la propriété `$out`.
Cette propriété doit référencer l'_élément_ à utiliser pour définir l'ensemble final ex: `$out: "=x"`.

Tout élément est définit par son nom et l'ensemble qui le contient (ex: `"x=": { $elementOf: "=X" }`).

A partir des éléments il est possible d'accéder aux valeurs des attributs: (ex: `=x.a`)

Il est alors possible de poser des contraintes entres valeurs, commme pour la définition par contraintes (ex: `"=x.a": { $eq: "=y.a" }`).

Ainsi si l'on reprend l'exemple précédent, on obtient: 

```js
{
  $out: "=x",
  "x=": { $elementOf: "=X" },
  "y=": { $elementOf: "=Y" },
  "=x.a": { $eq: "=y.a" },
}
```

#### Définition par récursion

Afin de répondre au probléme de la définition d'un ensemble par recursion, on part à nouveau de la définition mathématiques: 

    U(0) = X
    U(n + 1) = { y ∈ Y | tel que pour tout x ∈ U(n), y.parent = x }
    E = U(0) ⋃ U(1) ⋃ ... ⋃ U(n) pour n tel que U(n) = U(n+1) ≠ U(n-1)

et de la même façon on le définit pour datasource:

```js
{
  $unionForAlln: "=U(n)",
  "U(0)=": "=X",
  "U(n + 1)=": {
    $out: "=y",
    "x=": { $elementOf: "=U(n)" },
    "y=": { $elementOf: "=Y" },
    "=y.parent": { $eq: "=x" },
  }
}
```

#### Opérateurs de constructions

Les opérateurs sur les ensembles permettent à partir d'ensembles de définir de nouveaux ensembles.

 - Union `$union: [<ensemble>, ...] => <ensemble A ⋃ B>`: l'ensemble des objets des ensembles de la liste;
 - Intersection `$intersection: [<ensemble>, ...] => <ensemble A ⋂ B>`: l'ensemble des objets commun aux ensembles de la liste;
 - Différence `$substract: [<ensemble A>, <ensemble B>] => <ensemble A - B>`: l'ensemble des objets de l'ensemble A qui ne sont pas présent dans l'ensemble B

#### Opérateurs de contraintes

Les opérateurs de contraintes sont regroupés en fonction des types des valeurs à gauche et à droite de l'opérateur.

On appelle:

 - __variable__, une valeur qui provient de l'attribut d'un objet sur un ensemble,
 - __constante__, une valeur qui provient directement de la requête.
 - __mono-variable__, une variable représentant une unique valeur (ex: un nombre, une chaîne de caractère, mais pas un tableau),
 - __mono-constante__, une constante représentant une unique valeur (ex: un nombre, une chaîne de caractère, mais pas un tableau),
 - __mult-variable__, une variable représentant un ensemble de valeurs (ex: un tableau de nombres),
 - __mult-constante__, une constante représentant un ensemble de valeurs (ex: un tableau de nombres),

_opérateurs structurels_ (`$op: [...]`):

Il existe deux opérateurs structurels permettant de structurer les contraintes: __$or__ et __$and__.
La valeur associé est un ensemble de définition de contraintes.

Exemple:

{ $is: "Person", $or: [{ _name: { $eq: "A" }, { _name: { $eq: "B" }] }`

_opérateur_ __mono-constante__ ( `$op: k` ) :

| opérateur _k_   | valeurs de _k_  |                                                            | 
|-----------------|-----------------|------------------------------------------------------------|
| $is  _k_        | string / classe | l'objet est de classe _k_                                  |
| $instanceOf _k_ | string / classe | l'objet est de classe _k_ ou d'une des sous-classes de _k_ |
| $text _k_       | string          | l'objet contient dans l'un de ses attributs le texte _k_   |

__mono-variable__ _opérateur_ __mono-constante__ ( `a: { $op: k }` ) :

| _a_ opérateur _k_ | valeurs de _k_ |                                 |
|-------------------|----------------|---------------------------------|
| _a_ $exists _k_   | true / false   | _a_ possède ou non une valeur   |
| _a_ $text _k_     | string         | _a_ contient le texte _k_       |


__mono-variable__ _opérateur_ __mono-variable__/__mono-constante__ ( `a: { $op: b }` ) :

| _a_ opérateur _b_ |           |                                 |
|-------------------|-----------|---------------------------------|
| _a_ $eq  _b_      | _a_ = _b_ | _a_ est égal à _b_              |
| _a_ $neq _b_      | _a_ ≠ _b_ | _a_ est différent de _b_        |
| _a_ $gt  _b_      | _a_ > _b_ | _a_ est supérieur à _b_         |
| _a_ $gte _b_      | _a_ ≥ _b_ | _a_ est supérieur ou égal à _b_ |
| _a_ $lt  _b_      | _a_ < _b_ | _a_ est inférieur à _b_         |
| _a_ $lte _b_      | _a_ ≤ _b_ | _a_ est inférieur ou égal à _b_ |


__mult-variable__ _opérateur_ __mono-variable__/__mono-constante__ ( `A: { $op: b }` ) :

| _A_ opérateur _b_  |           |                                              |
|--------------------|-----------|----------------------------------------------|
| _A_ $contains  _b_ | _b_ ∈ _A_ | l'ensemble _A_ contient la valeur _b_        |
| _A_ $ncontains _b_ | _b_ ∉ _A_ | l'ensemble _A_ ne contient pas la valeur _b_ |


__mono-variable__ _opérateur_ __mult-variable__/__mult-constante__ ( `a: { $op: B }` ) :

| _a_ opérateur _B_ |           |                                             |
|-------------------|-----------|---------------------------------------------|
| _a_ $in  _B_      | _a_ ∈ _B_ | la valeur _a_ est dans l'ensemble _B_       |
| _a_ $nin _B_      | _a_ ∉ _B_ | la valeur _a_ n'est pas dans l'ensemble _B_ |


__mult-variable__ _opérateur_ __mult-variable__/__mult-constante__ ( `a: { $op: B }` ) :

| _a_ opérateur _B_    |               |                                                                    |
|----------------------|---------------|--------------------------------------------------------------------|
| _A_ $intersects  _B_ | _A_ ∩ _B_ ≠ 0 | l'ensemble _A_ et l'ensemble _B_ ont au moins une valeur en commun |
| _A_ $nintersects _B_ | _A_ ∩ _B_ = 0 | l'ensemble _A_ et l'ensemble _B_ n'ont aucune valeur en commun     |
| _A_ $subset      _B_ | _A_ ⊆ _B_     | l'ensemble _A_ est contenu en totalité dans l'ensemble _B_         |
| _A_ $superset    _B_ | _A_ ⊇ _B_     | l'ensemble _A_ contient la totalité de l'ensemble _B_              |
| _A_ $nsubset     _B_ | _A_ ⊈ _B_     | l'ensemble _A_ n'est pas contenu en totalité dans l'ensemble _B_   |
| _A_ $nsuperset   _B_ | _A_ ⊉ _B_     | l'ensemble _A_ ne pas contient la totalité de l'ensemble _B_       |
| _A_ $sameset     _B_ | _A_ = _B_     | l'ensemble _A_ à les mêmes valeurs que l'ensemble _B_              |
| _A_ $nsameset    _B_ | _A_ ≠ _B_     | l'ensemble _A_ n'à pas les mêmes valeurs que l'ensemble _B_        |
 
__Attention__: Toutes les comparaisons sur les chaînes de caractères (tri, `$eq`, `$neq`, `$lt`, ...) sont insensibles à la casse et suivent la spécification _Unicode Collation Algorithm_.
Donc `"abc": { $eq: "ABC" }` est vrai.


### Scope des objets trouvées

Pour l'ensemble des objets trouvées, on définit l'ensemble d'informations (_scope_) à charger pour chaque objet.

Le scope se définit par rapport au type des objets et au chemin nécéssaire pour accéder à un objet.
A chaque couple type/chemin est associé un ensemble d'attributs à charger.

On définit ainsi:

 - `*`: tous les attributs possibles
 - `_`: tous les chemins/types
 - `.`: le chemin d'accès aux objets de premier niveau, soit les objets trouvées par la recherche
 - `x.`: le chemin d'accès aux objets de second niveau via l'attribut _x_.
 - `x.y.`: le chemin d'accès aux objets de troisième niveau via l'attribute _x_ puis _y_ et ainsi de suite.

Cette définition accepte autant de niveaux que nécéssaire.
Si l'on souhaite uniquement charger des attributs de 1er niveau, il est possible de donner uniquement la liste des attributs possibles.

Format:

```js
{
  $type {
    $chemin : $attributs,
    ...
  },
  ...
}
```

### Tri du résultat

La définition du tri se fait via le scope, cela permet d'utiliser une notion objet pour trier les objets.  
Il suffit de préfixer un attribut par `+` ou `-` pour définir que le tri est respectivement __croissant__ ou __décroissant__.  
La priorité du tri est définit par l'ordre des éléments dans le tableau, du plus prioritaire au moins prioritaire à partir du chemin `.`.  
Si un attribut est utile uniquement pour le tri, il est possible d'ajouter `#` après `+` ou `-`, l'attribut ne sera alors pas chargé au sein de l'objet.

## Exemples:

### Requêtes

```js
// Tous les Vincent
{
  name: "person",
  where: { _firstname: "Vincent" },
  scope: { Person: { '.': ['+_firstname', '+_lastname'] } },
}
{
  name: "person",
  where: { _firstname: "Vincent" },
  scope: { _: { _: ['+_firstname', '+_lastname'] } },
}
{
  name: "person",
  where: { _firstname: "Vincent" },
  scope: ['+_firstname', '+_lastname'],
}

// Toutes les personnes et leurs chats dans 2 listes séparées
{
  "C=": { $instanceOf: "Cat" },                             // Soit C l'ensemble des objets "Cat"
  "persons=": { $instanceOf: "Person" },                    // Soit persons l'ensemble des objets "Person"
  "cats=": {
    // L'ensemble des chats c qui ont un propriétaire: {c ∈ C / ∃ p ∈ P tq c.owner=p}
    $out: "=c"
    "c=": { $elementOf: "=C" },
    "p=": { $elementOf: "=persons" },
    "=c._owner": { $eq: "=p" },
  },
  results: [
    { name: "cats", where: "=cats", scope:['_owner'] },
    { name: "persons", where: "=persons", scope: ['_firstname', '_lastname', '_cats'] },
  ]
}

// Toutes les personnes et leurs chats dans une même liste
{
  "C=": { $instanceOf: "Cat" },                             // Soit C l'ensemble des objets "Cat"
  "persons=": { $instanceOf: "Person" },                    // Soit persons l'ensemble des objets "Person"
  "cats=": {
    // L'ensemble des chats c qui ont un propriétaire: {c ∈ C / ∃ p ∈ P tq c.owner=p}
    $out: "=c",
    "c=": { $elementOf: "=C" },
    "p=": { $elementOf: "=persons" },
    "=c._owner": { $eq: "=p" },
  },
  where: { $union: ["=cats", "=persons"] }
  scope: ['_firstname', '_lastname', '_owner', '_cats'],
}

// Toutes les personnes qui ont des chats et leurs chats
{
    // Soit P l'ensemble des objets "Person"
    "P=": { $instanceOf: "Person" },
    // Soit C l'ensemble des objets "Cat"
    "C=": { $instanceOf: "Cat" },
    // L'ensemble des personnes qui sont propriétaire d'un chat: {P ∩ { c.owner / c ∈ C } }
    "persons=": { $intersection: ["=P", "=C:_owner"] },
    // L'ensemble des chats c qui ont un propriétaire parmi l'ensemble des personnes qui sont propriétaire d'un chat:
    // {c ∈ C / ∃ p ∈ persons tq c.owner=p}
    "cats=":    {
      "c=": { $elementOf: "=C" },
      "p=": { $elementOf: "=persons" },
      "=c._owner": { $eq: "=p" },
      $out: "=c"
    },
    results: [
      { name: "cats", where: "=cats", scope:['_owner'] },
      { name: "persons", where: "=persons", scope: ['_firstname', '_lastname', '_cats'] },
    ]
}

// Toutes les personnes qui ont des chats rose
{
    // Soit P l'ensemble des objets "Person"
    "P=": { $instanceOf: "Person" },
    // Soit C l'ensemble des objets "Cat" qui sont rose
    "C=": { $instanceOf: "Cat", color: "pink" },
    // L'ensemble des personnes qui ont un chat rose: {p ∈ P / ∃ c ∈ C tq c.owner=p}
    "persons=": {
      "c=": { $elementOf: "=C" },
      "p=": { $elementOf: "=P" },
      "=c._owner": { $eq: "=p" },
      $out: "=p"
    },
    "persons=": { $intersection: ["=C:_owner", "=P"] },
    results: [
      { name: "persons", where: "=persons", scope: {
        Person: { '.': ['_firstname', '_lastname', '_cats'] },
        Cat { '_cats.': ['_name', '_owner'] },
      }},
    ]
}

// Toutes les personnes dont tous les chats sont roses
{
    // Soit P l'ensemble des objets "Person"
    "P=": { $instanceOf: "Person" },
    // Soit C l'ensemble des objets "Cat"
    "C=": { $instanceOf: "Cat" },
    // L'ensemble des personnes dont tous les chats sont roses: 
    // {p ∈ P / (∃ c ∈ C tq c.owner=p) et (∄ c ∈ C tq c.owner=p et c.color != rose) }
    // {p ∈ P / (∃ c ∈ C tq c.owner=p) et (∀ c ∈ C tq c.owner=p, c.color == 'rose') }
    // FROM P WHERE NOT EXISTS(SELECT _id FROM C WHERE P._id = C._owner AND C.color != 'rose')
    // FROM P WHERE ALL(SELECT color FROM C WHERE P._id = C._owner) = 'rose'
    // FROM P WHERE (SELECT MIN(color = 'rose') FROM C WHERE P._id = C._owner) = 1
    // FROM P, (SELECT _owner, MIN(color = 'rose') allpink FROM C GROUP BY _owner) CM WHERE P._id = CM._owner AND CM.allpink = 1
    "persons=": {
      "c=": { $elementOf: "=C" },
      "p=": { $elementOf: "=P" },
      "=c._owner": { $eq: "=p" },
      $nin: { 
        $instanceOf: "Cat", 
        _owner: { $eq: "=p" },
        color: { $ne: "pink" }
      },
      $out: "=p"
    },
    "persons=": { $intersection: ["=C:_owner", "=P"] },
    results: [
      { name: "persons", where: "=persons", scope: ['_firstname', '_lastname'] },
    ]
}

// Toutes les créneaux en conflits (par resource) et leurs resources
// On suppose ici qu'un gap n'a qu'une ressource.
// Sinon, il faudrait tester g1._resources ∩ g2._resources ≠ ∅
{
    // Soit G l'ensemble des objets "Gap" (ensemble des créneaux)
    "G=": { $instanceOf: "Gap" },
    // Soit R l'ensemble des objets "Resource" (ensemble des résources)
    "R=": { $instanceOf: "Resource" },
    "conflicts=": {
      // L'ensemble des conflits:
      // {g1 ∈ G | ∃ g2 ∈ G tq
      //    g1 ≠ g2 et
      //    g1._resource=g2._resource et
      //    g1._startingDate < g2._endingDate et
      //    g2._startingDate < g1._endingDate }
      $out: ["=g1"]
      "g1=": { $elementOf: "=G" },
      "g2=": { $elementOf: "=G" },
      "=g1": { $ne: "=g2" },
      "=g1._resource"    : { $eq: "=g2._resource" },
      "=g1._startingDate": { $lt: "=g2._endingDate"},
      "=g2._startingDate": { $lt: "=g1._endingDate"},
    },
    results: [
      { name: "conflicts", where: "=conflicts", scope: {
        Gap: {
          '.': ['_startingDate', '_endingDate', '_resource'],
        },
        Resource {
          '_resource.': ['*'],
        }
      }}
    ]
}
```
