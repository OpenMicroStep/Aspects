Source de données (DataSource)
==============================

Les contraintes posés par le centre de contrôle sur la gestion des entités pousse à toujours manipuler des grappes d'objets.
Il est donc important de disposer d'outils pour créer, rechercher, mettre à jour et supprimer des parties de ces grappes d'objets.

Ce concept de source de données a donc pour objectif

## Définition des limites d'un ensemble

Tout ensemble est décrit à partir d'un object racine.
On définit alors pour chaque clé que l'on souhaite conserver soit :

 - un entier positif qui correspond à la profondeur de parcours. 
   Pour les types primaires la profondeur de parcours est limité à 1.
   Pour les entités cela définit la profondeur maximal du parcours.
 - une sous définition des limites de ce sous ensemble

## Définition des contraintes d'une recherche

A la manière de __mongodb__ ou encore de __sequelize__, les contraintes de recherches sont définies sous une forme structuré.
On reprend toujours l'approche dictionnaire dont:

 - la clé correspond soit: 
  - au chemin à parcourir pour accéder à la valeur
  - si elle commence pas '$', c'est un opérateur de recherche
 - la valeur correspond soit: 
  - directement à la valeur recherché
  - à une sous contrainte de recherche

Les opérateurs de recherches génériques sont:

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

