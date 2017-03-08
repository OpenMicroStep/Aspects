Source de données (DataSource)
==============================

Les contraintes posés par le centre de contrôle sur la gestion des entités pousse à toujours manipuler des grappes d'objets.
Il est donc important de disposer d'outils pour créer, rechercher, mettre à jour et supprimer des parties de ces grappes d'objets.

La sécurité autour des sources de données est un point très important, on va donc chercher à minimiser les risques au maximum:

 - le client ne doit JAMAIS être considéré comme fiable,
 - la vérification des droits et la cohérence doit TOUJOURS être fait coté serveur
 - les requêtes ne peuvent être considérées comme sécurisées que si elles sont générées coté serveur
 - les droits à considérer sont ceux s'appliquant sur les données (le droit _imprimer_ est donc sans intérêt par example)

## Vocabulaire

On nomme __proposition__ toute demande de modification d'un ensemble de données (création, suppréssion, modification).   
On nomme __opération__ toute demande de modification ou de lecture d'un ensemble de données.

## Intégrité et sécurité des données

Une source de données à pour responsabilité de gérer:

 - l'intégrité des données: l'application de modifications résultent toujours en un modèle cohérent
 - la sécurité des données: restriction en fonction des droits de la session des possibilités de lecture et de modifications

Ainsi, pour tout échange de données (lecture, création, modification, suppression) l'ensemble des objets manipulés est passé à une fonction de validation.

Dans le cas d'une lecture:
 
 - recherche de la définition de la requête
 - execution de la requête
 - en mode debug: vérification de la cohérence
 - vérification des droits sur le résultat (opération 'query')

Dans le cas d'une modification:

 - vérification des droits (opération 'update')
 - vérification de la cohérence des modifications
 - application des modifications
 - en mode debug: vérification de la cohérence 
 - vérification des droits sur le résultat (opération 'query')


### Cohérence des données

Vérifier la cohérence des données est une tâche qui nécéssite de valider toute proposition.

Cette validation porte sur l'ensemble de la proposition.

La vérification de cohérence des données ne devrait JAMAIS modifier la proposition.
Son rôle se limite à accepter ou refuser une proposition.

L'implémentation par défaut vérifie la cohérence via les étapes suivantes:

 - pour chaque classe, la fonction `attributesToLoad(for: 'consistency'): string[]` fourni la liste des attributs à pré-charger
 - pour l'ensemble des objets, l'ensemble des attributs demandés sont chargés
 - pour chaque objet, la fonction `validateConsistency(reporter: Reporter): boolean` valide ou non la cohérence
 - pour chaque objet, une fonction `validatorsForGraphConsistency(): Validator[] | undefined` 
   fourni la liste des validateurs de graphes qui vont vérifier la cohérence entre les objets
 - pour chaque validateur de graphe trouvé, celui-ci est appelée avec en paramètre le rapporteur et la liste des objets qu'il doit valider.
   Il valide ou non la cohérence.

La fonction gérant tout le système de cohérence à pour signature: `validateConsistency(objects: VersionedObject[]): boolean`


### Application des droits

Comme pour l'intégrité des données une fonction de validation va vérifier les droits par rapport à l'opération en cours sur les objets concernés de la session en cours.

De même, cette validation porte sur l'ensemble des objets concernés et son rôle se limite à accepter ou à refuser l'opération.

La fonction gérant tout le système de droits à pour signature: `validateRights(reporter: Reporter, session: Session, objects: VersionedObject[], operation: 'query' | 'update'): boolean`

L'implémentation par défaut vérifie les droits via les étapes suivantes:

 - pour chaque classe, la fonction `attributesToLoad(for: 'rights'): string[]` fourni la liste des attributs à pré-charger
 - pour l'ensemble des objets, l'ensemble des attributs demandés sont chargés
 - pour chaque objet, la fonction `validateRights(reporter: Reporter, session: Session): boolean` valide ou non les droits
 - pour chaque objet, une fonction `validatorsForGraphRights(operation: 'query' | 'update'): Validator[] | undefined` 
   fourni la liste des validateurs de graphes qui vont vérifier les droits entre les objets
 - pour chaque validateur de graphe trouvé, celui-ci est appelée avec en paramètre:
   - le rapporteur
   - la session
   - la liste des objets qu'il doit valider
   - le type d'opération (`query` ou `update`)

### Gestion des requêtes

Comme les requêtes ne peuvent être crée que du coté serveur (fiable), celle-ci sont répértoriés par un gestionnaire de requêtes.

Coté client (non fiable), il n'est donc pas possible de saisir une requête directement.
Il faut systématique passer par la création d'un objet contenant l'identifiant de la requête et les paramètres associés.

```ts
dataSource.farEvent('query', R.allPersons());
```

## Définition d'une recherche

Une recherche à pour sortie un dictionnaire dont les clés sont définit dans la requête et les valeurs associées sont des listes d'objets.

Il y a 3 façons de définir la sortie:

 - Simple: le dictionaire racine définit directement la sortie (une unique clé et l'ensemble d'objets associé)
 - Multiple: la clé '_result_' contient une liste d'objet définissant la sortie

Pour chaque objet définissant la sortie on a:

 - `name`: le nom de clé qui sera utilisé pour la sortie
 - `where`: les contraintes à appliquer
 - `sort`: si définit comment les données sont triés
 - `scope`: les attributs à chargés

### Contraintes de recherche

A la manière de __mongodb__ ou encore de __sequelize__, les contraintes de recherches sont définies sous une forme structuré.
En plus des requêtes _simples_ possibles via la syntaxe __mongodb__, deux concepts: __ensemble__ et __élément__, sont disponible pour permettre l'écriture de requêtes bien plus puissante.

Un __ensemble__ se définit par son nom et les contraintes qui permettent de définir la liste d'objet qu'il représente.
Par le fait qu'un ensemble est nommé, celui-ci est réutilisable pour définir des contraintes sur d'autres ensembles.
A chaque fois que l'on définit des contraintes, celles-ci définissent en fait un ensemble.
Lors de la définition d'un ensemble nommée avec des contraintes sur des éléments, la propriété `$out` doit-être utilisé pour définir la liste des objets qui forment l'ensemble.   
_Syntaxe_:

  - Pour nommée un _ensemble_, il suffit que la clé associé à sa définition se termine par le caractère `=`. 
  - De même, pour utiliser un ensemble, il suffit que la valeur commence par le caratère `=` suivi du nom de l'ensemble.
  - Lorsque l'on référence un ensemble, le nom de celui-ci peut-être suivi de `:` puis du nom d'un attribut présent sur les éléments de cet ensemble.
    Cela signifie alors toutes les valeurs de cet attribut pour tous les éléments de cet ensemble.

Un __élément__ se définit par son nom et les contraintes qui permettent de définir la liste d'objet qui seront les valeurs successives qu'il représente.
Par le fait qu'un élément est nommé, celui-ci est réutilisable pour définir des contraintes sur d'autres ensembles.   
_Syntaxe_:

  - Pour nommée un _élément_, il faut que la clé associé à sa définition se termine par le caractère `=` 
    et que la définition contienne la clé `$elementOf` qui aura pour valeur un _ensemble_.
  - De même, pour utiliser un élément, il suffit que la valeur commence par le caratère `=` suivi du nom de l'élément.
  - Lorsque l'on référence un élément, le nom de celui-ci peut-être suivi de `.` puis du nom d'un attribut présent sur l'élément.
    Cela signifie alors la valeur de cet attribut pour cet élément.

La différence entre __ensemble__ et __élément__ est qu'un ensemble est une liste d'objet tandis qu'un élément sera chaque valeur d'une liste d'objet, comprendre: _pour chaque élément d'un ensemble_.
Ainsi, lorsque d'un ensemble est définit par un ou plusieurs éléments: ce sont toutes les combinaisons possibles de ces éléments (par rapport aux ensembles qu'ils représentent) qui valident les contraintes posées sur ces éléments, avec la propriété `$out` qui permet de prendre parmis l'ensemble de ces combinaisons valides, les valeurs d'un des éléments.

__Attention__: Toutes les comparaisons sur les chaînes de caractères (tri, `$eq`, `$neq`, `$lt`, ...) sont insensibles à la casse et suivent la spécification _Unicode Collation Algorithm_.
Donc `"abc": { $eq: "ABC" }` est vrai.

Définition d'un ensemble:

  - un dictionnaire dont chaque couple clé, valeur correspond à une contrainte supplémentaire (__AND__).   
    Pour chaque clé, le contenu peut être:
    - si elle commence pas `$`, c'est un opérateur
    - si elle commence par `=`, c'est l'ensemble ou l'élément correspondant
    - si elle termine par `=`, c'est un ensemble d'objets
    - sinon, c'est le chemin à parcourir pour accéder à la valeur
  - `=` suivi du nom d'un ensemble ou d'un élément, c'est l'ensemble ou l'élément correspondant
  - directement à la valeur recherché

#### Opérateurs sur les ensembles

Les opérateurs sur les ensembles permettent à partir d'ensembles de définir de nouveaux ensembles.

 - Union `$union: [<ensemble>, ...] => <ensemble A U B>`: l'ensemble des objets des ensembles de la liste;
 - Intersection `$intersection: [<ensemble>, ...] => <ensemble A & B>`: l'ensemble des objets commun aux ensembles de la liste;
 - Différence `$diff: [<ensemble A>, <ensemble B>] => <ensemble A / B>`: l'ensemble des objets de l'ensemble A qui ne sont pas présent dans l'ensemble B

#### Opérateurs sur les valeurs

Les opérateurs sur les valeurs permettent de définir des contraintes.

 - Existance `$exists: <YES | NO>`: pour un attribut, c'est l'existance de cette attribut, pour un ensemble c'est le fait que celui-ci soit vide ou non;
 - Classe `$instanceOf: <type>`: uniquement les objets qui sont une instance de cette classe.
 - Classe `$memberOf: <type>`: uniquement les objets qui ont pour classe;


 - Egal à `$eq: <value>`
 - N'est pas égal à `$ne: <value>`
 - Plus grand que `$gt: <nombre | date | string>`
 - Plus grand ou égal à `$gte: <nombre | date | string>`
 - Plus petit que `$lt: <nombre | date | string>`
 - Plus petit ou égal à `$lte: <nombre | date | string>`


 - Est une valeur de la liste `$in: [<value>, ...]`
 - N'est pas une valeur de la liste `$nin: [<value>, ...]`


 - Fulltext search `$text: { $search: <string value>, ...options }`

### Tri du résultat

La définition du tri se fait par un tableau dont les valeurs sont les attributs sur lequel porte le tri.
Chaque attribut peut être préfixé par `+` ou `-` pour définit que le tri est respectivement __croissant__ ou __décroissant__.
Le comportant par défaut est un tri __croissant__.
La priorité du tri est définit par l'ordre des éléments dans le tableau, du plus prioritaire au moins prioritaire.

## Exemples:

### Cohérence et droits

```ts
Cat.category('db', {
  validateConsistency(reporter: Reporter) {
    super.validateConsistency(reporter: Reporter); // default implementation will validate types
    let manager = this.manager();
    if (manager.isModified('_color') || manager.isModified('_name'))
      if (this.color() === this.name())
        reporter.diagnostic({ type: 'error', msg:`name and color can't be the same value` });
  }
});
registerGraphConsistencyValidator(function validateCatColorByOwner(f: Flux<{ reporter: Reporter }>, objects: (Cat | Person)[]) {
  dataSource.query({
    "O=": objects,
    "AC=": { $instanceOf: "Cat" },
    "AP=": { $instanceOf: "Person" },
    "C=" : { $intersection: ["=O", "=AC"] },
    "P=" : { $intersection: ["=O", "=AP"] },
    "cats=": {
      "c=": { $elementOf: "=C" },
      "p=": { $elementOf: "=AP" },
      "=c._owner": { $eq: "=p" },
      $out: "=c"
    },
    "persons=": { $intersection: ["=cats:_owner", "=AP"] }
    result: [{
        name: "cats",
        where: ["=C", "=PC"],
        scope: ["_color", "_owner"]
      },
      {
        name: "persons",
        where: "=persons",
        scope: ["_age"]
      }]
  }, (invocation) => {
    if (invocation.sucess()) {
      let cats = invocation.result().cats;
      for (let cat of cats) {
        let m = o.manager();
        if (o.color() === 'pink' && o.owner().age() < 18)
          f.context.reporter.diagnostic({ type: 'error', msg:`cat color can't be the same value` });
      }
    }
    else {
      f.context.reporter.diagnostic({ type: 'error', msg:`unable to load objects` });
    }
    f.continue();
  });
}, [
  { class: Cat   , when: (cat   : Cat   ) => {
    let m = cat.manager();
    return m.isModified('_color') && (m.attributeValue('_color') === 'pink' || m.versionAttributeValue('_color') === 'pink');
  }},
  { class: Person, when: (person: Person) => {
    let m = person.manager();
    if (!m.isModified('_age')) return false;
    let isMajor = m.attributeValue('_age') >= 18;
    let wasMajor = m.versionAttributeValue('_age') >= 18;
    return isMajor != wasMajor;
  }},
  { class: Person, when: (person: Person) => person.age() === 'pink' }
]);
```


### Requêtes

```js
// Tous les Vincent
{
  name: "person",
  where: { _firstname: "Vincent" },
  sort: [ '+_firstname', '+_lastname'],
  scope: ['_firstname', '_lastname'],
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
    { name: "cats", where: "=cats", scope: ['_firstname', '_lastname', '_cats'] },
    { name: "persons", where: "=persons", scope: ['_owner'] },
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
      { name: "cats", where: "=cats", scope: ['_firstname', '_lastname', '_cats'] },
      { name: "persons", where: "=persons", scope: ['_owner'] },
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
      { name: "persons", where: "=persons", scope: ['_owner'] },
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
      { name: "persons", where: "=persons", scope: ['_owner'] },
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
      { name: "conflicts", where: "=conflicts", scope: ['_startingDate', '_endingDate', '_resource'] },
      { name: "resources", where: "=conflicts:_resource", scope: [...] },
    ]
}
```