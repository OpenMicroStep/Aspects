Source de données (DataSource)
==============================

TODO: design update API (update = create / delete / update)

Les contraintes posés par le centre de contrôle sur la gestion des entités pousse à toujours manipuler des grappes d'objets.
Il est donc important de disposer d'outils pour créer, rechercher, mettre à jour et supprimer des parties de ces grappes d'objets.

La sécurité autour des sources de données est un point très important, on va donc chercher à minimiser les risques au maximum:

 - le client ne doit JAMAIS être considéré comme fiable,
 - la vérification des droits et la cohérence doit TOUJOURS être fait coté serveur
 - les requêtes ne peuvent être considérées comme sécurisées que si elles sont générées coté serveur
 - utilisation forcé des requêtes paramétriques (pas d'injection de données dans une requête SQL par exemple, ...)
 - si certaines requêtes sont "lente" alors un mécanisme de protection doit être mis en place pour limiter le nombre de tentative par client/server/...

## Vocabulaire

On nomme __proposition__ toute demande de modification d'un ensemble de données (création, suppréssion, modification).
On nomme __opération__ toute demande de modification ou de lecture d'un ensemble de données.

## Intégrité et sécurité des données

Une source de données à pour responsabilité de gérer:

 - l'intégrité des données: l'application de modifications résultent toujours en un modèle cohérent
 - la sécurité des données: restriction en fonction des droits de la session des possibilités de lecture et de modifications

Ainsi, pour tout échange de données (lecture, création, modification, suppression) l'ensemble des objets manipulés est passé à une fonction de validation.

Dans le cas d'une lecture, l'ensemble de données en partance sont validé avant envoi, 
il est donc uniquement nécéssaire de valider les droits d'accès sur ces objets.
L'origine des données étant considérée intègre.
Cette validation est faite après la récupération des données qui sont déjà préfiltrée par la requête.

Dans le cas d'une modification, les droits s'appliquant sont vérifiés avant la vérification de la cohérence des modifications.


### Intégrité des données (Cohérence)

Vérifier l'intégrité des données, c'est à dire la cohérence de l'ensemble est une tâche qui nécéssite de valider tous les propositions.

Cette validation porte sur l'ensemble de la proposition.

La vérification de cohérence des données ne devrait JAMAIS modifier la proposition. 
Son rôle se limite à accepter ou refuser une proposition.

```ts
AManager.validateIntegrity(objects: VersionedObject[])
```

### Application des droits

Comme pour l'intégrité des données une fonction de validation va vérifier les droits par rapport à l'opération en cours sur les objets concernés de la session en cours.

De même, cette validation porte sur l'ensemble des objets concernés et son rôle se limite à accepter ou à refuser l'opération.


```ts
AManager.validateRights(session: Session, objects: VersionedObject[], action: 'query' | 'update')
```



### Gestion des requêtes

Comme les requêtes ne peuvent être crée que du coté serveur (fiable), celle-ci sont répértoriés par un gestionnaire de requêtes.

Coté client (non fiable), il n'est donc pas possible de saisir une requête directement.
Il faut systématique passer par la création d'un objet contenant l'identifiant de la requête et les paramètres associés.


```ts
dataSource.farEvent('query', R.allPersons()); // < C'est pas terrible
R.farEvent('allPersons', {}, ...); // Mieux non ?
```

## Définition d'une recherche

Exemples:

```ts
// Requête simple (tous les Vincent)
dataSource.query({
  where: { _firstname: "Vincent" },
  sort: [ '_firstname ASC', '_lastname ASC'], // ou mongodb style { _firstname: 1, _lastname: 1 } ou autre ?
  scope: ['_firstname', '_lastname'],
})
```

```ts
// Requête multiple (toutes les personnes et leurs chats)
dataSource.query({
    "persons=": {
      sort: { _firstname: 'ASC', _lastname: 'ASC' } // js garanti l'ordre des clés
      scope: ['_firstname'], // un attribut virtuels _cats ?
    }
    "cats=": {
      where: { '_owner': { $in: '=persons' } },
      scope: ['_cuteness' ]
    }
});
```

```ts
// Requête multiple (toutes les personnes qui ont des chats et leurs chats)
dataSource.query({
    "cats=": {
      where: { '_owner': { $class: 'Person' } },
      scope: ['_cuteness', '_owner']
    },
    "persons=": {
      where: { '_id': { $in: '=cats : _owner' } },
      sort: { _firstname: 'ASC', _lastname: 'ASC' } // js garanti l'ordre des clés
      scope: ['_firstname'], // un attribut virtuels _cats ?
    }
});
```

### Contraintes de recherche

A la manière de __mongodb__ ou encore de __sequelize__, les contraintes de recherches sont définies sous une forme structuré.
On reprend toujours l'approche dictionnaire dont:

 - la clé correspond soit: 
  - au chemin à parcourir pour accéder à la valeur
  - si elle commence pas '$', c'est un opérateur de recherche
 - la valeur correspond soit: 
  - directement à la valeur recherché
  - à une sous contrainte de recherche

### Tri du résultat

Mongodb style ? https://docs.mongodb.com/manual/reference/method/cursor.sort/

### Opérateurs de comparaisons

#### Egal à `$eq: <value>`
#### N'est pas égal à `$ne: <value>`
#### Plus grand que `$gt: <value>`
#### Plus grand ou égal à `$gte: <value>`
#### Plus petit que `$lt: <value>`
#### Plus petit ou égal à `$lte: <value>`
#### Est une valeur de la liste `$in: [<value>, ...]`
#### N'est pas une valeur de la liste `$nin: [<value>, ...]`

### Opérateurs logiques

#### ET logique `$and: [<sous contrainte de recherche>, ...]`
#### OU logique `$or: [<sous contrainte de recherche>, ...]`
#### Négation `$not: <sous contrainte de recherche>`

### Opérateurs de forme

#### Existance `$exists: <YES | NO>` 
#### Type `$type: <définition d'un type>`

### Opérateurs textuels

#### Fulltext search `$text: { $search: <string value> }`