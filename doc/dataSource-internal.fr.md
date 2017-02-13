Source de données (structure des données)
=========================================

L'écriture des requêtes sur les sources de données est dans un format utile pour l'utilisateur. 
Ce format est cependant inadaptée à la génération des routines nécéssaires à leurs réalisation.

Afin de simplifier l'implémentation des différentes dataSource, un format intermédiaire est proposé dans ce document.

Ce format utilise 2 types d'objets:

 - ensemble (`ObjectSet`)
  - des contraintes de type (instanceOf, memberOf, in, union, elementOf)
  - une liste de contraintes
  - si nommé, c'est un ensemble qui sera dans le dictionnaire de sortie
  - si nommé, un ordre de recherche peut être définit
  - si nommé, un ensemble d'attributs sortant
 - contrainte (`Constraint`)
  - operateur
  - entre la valeur d'un attribut ou l'objet
  - et une autre valeur
    - fixe (`ConstraintOnValue`)
    - définit dans un autre ensemble (`ConstraintBetweenSet`)

## Algorithme

L'algorithme est récursif avec détection de cycle et ne va manipuler que les ensembles finaux.
Cela implique d'analyser les contraintes plusieurs fois en cas de réutilisation mais limite le nombre d'allocation nécéssaire.
Pour ce faire, l'analyse part des objets finaux et remonte toutes les dépendances.
Si la dépendance est déjà résolu alors on utilise ce résultat (ie. un ensemble).


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
      $or: [
        { "=g1._startingDate": { $gt: "=g2._endingDate"   } }    
        { "=g1._endingDate"  : { $lt: "=g2._startingDate" } }
      ],
      $and: [
          
      ]
      "=g1._startingDate": { $gt: "=g2._endingDate"   }, // la date de fin de g2 est contraint à être avant la date de début de g
      "=g1._endingDate"  : { $lt: "=g2._startingDate" }, // la date de début de g2 est contraint à être après la date de fin de g
      $out: "=g1"
    },
    results: [
      { name: "conflicts", where: "=conflicts", scope: ['_startingDate', '_endingDate', '_resource'] },
      { name: "resources", where: "=conflicts:_resource", scope: [...] },
    ]
}
```


Sera transformé en 4 ensembles et 7 contraintes (TX et CX):

```ts
G=  Ensemble([instanceOf Gap     ], [])

g2= Ensemble([elementOf G (T1)   ], [_resource, _startingDate, _endingDate  ])
                                     C1 ==      C2   >         C3   <        
g1= Ensemble([elementOf G (T2)   ], [_resource, _endingDate  , _startingDate], name= "conflicts", scope: ['_startingDate', '_endingDate', '_resource'])
                                     C5 ==
r = Ensemble([instanceOf Resource], [_id      ], name= "resources", scope: [...])
```

Des méthodes de simplification seront mises à disposition des datasources pour simplier les ensembles en fonction de profils d'optimisations.

Cette forme est facilement utilisable pour transformation en SQL:

```sql
SELECT g1._id, g1._version, g1._startingDate, g1._endingDate,
       r._id , r._version , ...
FROM Gap g1, Gap g2, Resource r
WHERE     g1._resource = g2._resource 
  AND g1._startingDate > g2._endingDate
  AND   g1._endingDate < g2._startingDate
  AND     g1._resource = r._id
```
