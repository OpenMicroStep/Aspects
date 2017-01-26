Source de données (structure des données)
=========================================

L'écriture des requêtes sur les sources de données est dans un format utile pour l'utilisateur. 
Ce format est cependant inadaptée à la génération des routines nécéssaires à leurs réalisation.

Afin de simplifier l'implémentation des différentes dataSource, un format intermédiaire est proposé dans ce document.

Ce format utilise 2 types d'objets:

 - ensemble
  - une liste de contraintes
  - si nommé, c'est un ensemble qui sera dans le dictionnaire de sortie
  - si nommé, un ordre de recherche peut être définit
  - si nommé, un ensemble d'attributs sortant
 - contrainte


## Algorithme

L'algorithme est récursif avec détection de cycle et ne va manipuler que les ensembles finaux.
Cela implique d'analyser les contraintes plusieurs fois en cas de réutilisation mais limite le nombre d'allocation nécéssaire.
Pour ce faire, l'analyse part des objets finaux.

WIP

## Exemples

Par exemple, la requête:

```ts
// Toutes les créneaux en conflits (par resource) et leurs resources
{
    "G=": { $instanceOf: "Gap" },
    "conflicts=": {
      "g1=": { $elementOf: "=G" },
      "g2=": { $elementOf: "=G" },
      "=g1._resource"    : { $eq: "=g2._resource" },
      "=g1._startingDate": { $gt: "=g2._endingDate"   }, // la date de fin de g2 est contraint à être avant la date de début de g
      "=g1._endingDate"  : { $lt: "=g2._startingDate" }, // la date de début de g2 est contraint à être après la date de fin de g
      $out: ["=g1"]
    },
    results: [
      { name: "conflicts", where: "=conflicts", scope: ['_startingDate', '_endingDate', '_resource'] },
      { name: "resources", where: "=conflicts:_resource", scope: [...] },
    ]
}
```


Sera transformé en 3 ensembles et 5 contraintes:

```ts
g2= Ensemble([_resource, _startingDate, _endingDate  , instanceOf Gap])
              C1 ==      C2   >         C3   <         C4
g1= Ensemble([_resource, _endingDate  , _startingDate, instanceOf Gap], name= "conflicts", scope: ['_startingDate', '_endingDate', '_resource'])
              C5 ==
r = Ensemble([_id      ], name= "resources", scope: [...])
```

Cette forme est facilement utilisable pour transformation en SQL:

```sql
SELECT g1._id, g1._version, g1._startingDate, g1_endingDate,
       r._id , r._version , ...
FROM Gap g1, Gap g2, Resource r
WHERE     g1._resource = g2._resource 
  AND g1._startingDate > g2._endingDate
  AND   g1._endingDate < g2._startingDate
  AND     g1._resource = r._id
```

Pas à pas cela donne:

``` 
Analyse de results[0]
Soit e1 l'ensemble { name: "conflicts", where: ..., scope: ['_startingDate', '_endingDate', '_resource'] } 
  Analyse de conflicts=
  Soit g1=e1 après lecture la propriété $out
    Analyse de G= (g1 of =G)
      Ajout de la contrainte (instanceOf Gap) sur e1
    Analyse de G= (g2 of =G)
      Soit e2 l'ensemble {[instanceOf Gap]}
    Ajout de la contrainte (g1._resource = g2._resource )
    Ajout de la contrainte (g1._startingDate > g2._endingDate)
    Ajout de la contrainte (g1._endingDate < g2._startingDate)
Soit e2 l'ensemble { name: "resources", where: "=conflicts:_resource", scope: [...] }
    Ajout de la contrainte (g1._resource = e2._id)
```