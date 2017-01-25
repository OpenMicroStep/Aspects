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
La logique autour de la définition des contraintes est basé sur le concept des ensembles.
A partir des opérations mathématiques élémentaires sur les ensembles (union, intersection, filtre) il est possible de composer des requêtes très complexes facilement.
C'est l'implémentation de la datasource qui est chargée d'interpréter ces contraintes pour définir la meilleur façon de parvenir au résultat demandé.

La définition des ensembles reprend le concept des éléments pour définir les relations.
Un ensemble est donc définit par une clé terminant par `=`.
De même pour référencer un ensemble on utilise `=` suivi du nom de l'ensemble.
Comme pour les éléments, l'utilisation de `:` permet d'accéder aux relations et attributs des objets de l'ensemble.

Les contraintes définis entre les ensembles portent sur les objets de ces ensembles de tel façon que 
l'évaluation d'un ensemble de contrainte permettant de définir un nouvel ensemble ce fera en considérant toute les combinaisons d'objets des ensembles concerner.
La validation des contraintes doit donc être considérer comme s'appliquant sur les combinaisons et non pas sur l'intersection des ensembles.
Cette différence permet l'écriture de requête complexe simplement (voir les exemples plus loin).

C'est à dire que les contraintes `dans C, C:_owner = P` qui porte sur la relation owner entre `C` et `P` signifie:

> Soit `c` de `C` et `p` de `P`, on considère l'ensemble des combinaisons de `(c, p)` possible   
> `c._owner` est contraint à la valeur `p`   
> Le nouvel ensemble est composé des objets `c` de `C` qui valide la contrainte

Définition d'un ensemble:

  - un tableau d'ensembles dont le résultat sera l'union des ensembles
  - un dictionnaire dont chaque couple clé, valeur correspond à une contrainte supplémentaire (__AND__).   
    Pour chaque clé, le contenu peut être:
    - le chemin à parcourir pour accéder à la valeur
    - si elle commence pas `$`, c'est un opérateur
    - si elle commence par `=`, c'est l'ensemble correspondant (définit avec `=` à la fin)
    - si elle termine par `=`, c'est un ensemble d'objets
  - si la valeur commence par `=`, c'est l'ensemble correspondant (définit avec `=` à la fin)
  - directement à la valeur recherché

#### Opérateurs sur les ensembles

 - ET logique `$and: [<ensemble>, ...]`
 - OU logique `$or: [<ensemble>, ...]`
 - Négation `$not: <ensemble>`
 - Contrainte d'intersection `$eq: <ensemble>`
 - Contrainte de soustraction `$neq: <ensemble>`
 - Est une valeur de l'ensemble `$in: [<ensemble>, ...]`
 - N'est pas une valeur de l'ensemble `$nin: [<ensemble>, ...]`
 - L'ensemble est non vide ou vide `$exists: <YES | NO>`

#### Opérateurs sur les valeurs

 - Egal à `$eq: <value>`
 - N'est pas égal à `$ne: <value>`
 - Plus grand que `$gt: <nombre | date>`
 - Plus grand ou égal à `$gte: <nombre | date>`
 - Plus petit que `$lt: <nombre | date>`
 - Plus petit ou égal à `$lte: <nombre | date>`
 - Est une valeur de la liste `$in: [<value>, ...]`
 - N'est pas une valeur de la liste `$nin: [<value>, ...]`
 - Fulltext search `$text: { $search: <string value> }`
 - Existance `$exists: <YES | NO>`
 - Classe `$class: <définition d'un type>`

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
    "AC=": { $class: "Cat" },
    "AP=": { $class: "Person" },
    "C=" : { $in: "=O", $class: "Cat" },
    "P=" : { $in: "=O", $class: "Person" },
    "cats=": { $in: "=AC", "=A:_owner": "=P" },
    "persons=": { $in: "=AP", "=cats:_owner": "=AP" }
    result: [{
      name: "cats",
      where: ["=C", "=PC"],
      scope: ["_color", "_owner"]
    },
    {
      name: "persons",
      where: "=persons",
      scope: ["_age"]
    }
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

```ts
// Tous les Vincent
dataSource.query({
  name: "person",
  where: { _firstname: "Vincent" },
  sort: [ '+_firstname', '+_lastname'],
  scope: ['_firstname', '_lastname'],
})

// Toutes les personnes et leurs chats dans 2 listes séparées
dataSource.query({
  "C=": { $class: "Cat" },                             // Soit C l'ensemble des objets "Cat"
  "persons=": { $class: "Person" },                    // Soit persons l'ensemble des objets "Person"
  "cats=":    { $in: "=C", "=C:_owner": "=persons" },  // Soit cats tel que pour tout objet de C, _owner est dans l'ensemble persons
  // or
  "cats=":    { $in: "=C", "=persons": "=C:_owner" },  // Soit cats tel que pour tout objet de C, _owner est dans l'ensemble persons
  results: [
    { name: "cats", where: "=cats", scope: ['_firstname', '_lastname', '_cats'] },
    { name: "persons", where: "=persons", scope: ['_owner'] },
  ]
});

// Toutes les personnes et leurs chats dans une même liste
dataSource.query({
  "C=": { $class: "Cat" },                             // Soit C l'ensemble des objets "Cat"
  "persons=": { $class: "Person" },                    // Soit persons l'ensemble des objets "Person"
  "cats=":    { $in: "=C", "=C:_owner": "=persons" },  // Soit cats tel que pour tout objet de C, _owner est dans l'ensemble persons
  where: ["=cats", "=persons"],
  scope: ['_firstname', '_lastname', '_owner', '_cats'],
});

// Toutes les personnes qui ont des chats et leurs chats
dataSource.query({
    // Soit P l'ensemble des objets "Person"
    "P=": { $class: "Person" },
    // Soit C l'ensemble des objets "Cat"
    "C=": { $class: "Cat" },
    // Soit persons les objets p de P tel que pour c dans C il existe c._owner = p
    "persons=": { $in: "=P", "=P": "=C:_owner" },
    // Soit cats les objets c de C tel que pour p dans P il existe c._owner = p
    "cats=":    { $in: "=C", "=P": "=C:_owner" },
    results: [
      { name: "cats", where: "=cats", scope: ['_firstname', '_lastname', '_cats'] },
      { name: "persons", where: "=persons", scope: ['_owner'] },
    ]
});

// Toutes les personnes qui ont des chats rose
{
    // Soit P l'ensemble des objets "Person"
    "P=": { $class: "Person" },
    // Soit C l'ensemble des objets "Cat" qui sont rose
    "C=": { $class: "Cat", color: "pink" },
    // Soit persons les objets p de P tel que p est contraint à être le propriétaire d'un chat
    "persons=": { in: "=P", "=P": "=C:_owner" },
    results: [
      { name: "persons", where: "=persons", scope: ['_owner'] },
    ]
}

// Toutes les créneaux en conflits (par resource) et leurs resources
{
    // Soit G l'ensemble des objets "Gap" (ensemble des créneaux)
    "G=": { $class: "Gap" },
    // Soit G2 l'ensemble des objets "Gap" (ensemble des créneaux)
    "G2=": { $class: "Gap" },
    // Soit R l'ensemble des objets "Resource" (ensemble des résources)
    "R=": { $class: "Resource" },
    "conflicts=": { 
      $in: "=G",             // les objets g de G tel que
      "=G:_resource": "=R",  // g._resource à pour resource r un objet de R
      "=G2:_resource": "=R", // les objets g2 de G2 tel que g2._resource à pour resource r un objet de R
      // r est une resource de g et g2
      "=G:_startingDate": { $gt: "=G2:_endingDate"   }, // la date de fin de g2 est contraint à être avant la date de début de g
      "=G:_endingDate"  : { $lt: "=G2:_startingDate" }, // la date de début de g2 est contraint à être après la date de fin de g
      // g2 est en intersection avec g
    },
    "resources=": {
      $in: "=R",                   // les objets r de R tel que
      "=conflicts:_resource": "=R" // les objets c de conflicts tel que c._resource à pour resource r
    },
    results: [
      { name: "conflicts", where: "=conflicts", scope: ['_startingDate', '_endingDate', '_resource'] },
      { name: "resources", where: "=resources", scope: [...] },
    ]
}
```