## class DataSource

La classe DataSource est typiquement un objet avec un aspect client et un aspect server.
Sous-classable.

### attributes

### category initServer

#### setQueries(queries: DataSourceQueries): void
#### setSafeValidators(validators: SafeValidators): void

### category local

Traitements faisable en local, c'est à dire sans accéder à la base de données.

#### filter(objects: [0, *, VersionedObject], conditions: dictionary): [0, *, VersionedObject]
Filtre un ensemble d'objets d'après les conditions données.

### farCategory client

Point d'entrée coté client pour l'utilisation de DataSource, ces méthodes implémentent des vérifications locales autour des appels distants (farCategory server)

#### query(q: dictionary): { * :[0, *, VersionedObject]}

#### load(l: {objects: [0, *, VersionedObject], scope: [0, *, string]}): [0, *, VersionedObject]

#### save(objects: [0, *, VersionedObject]): [0, *, VersionedObject]

### farCategory server

Partie accessible depuis l'exterieur de la DataSource

#### distantQuery(q: { id: string, *: any }): { * :[0, *, VersionedObject]}

#### distantLoad(l: {objects: [0, *, VersionedObject], scope: [0, *, string]}): [0, *, VersionedObject]

#### distantSave(objects: [0, *, VersionedObject]): [0, *, VersionedObject]

### farCategory safe

Partie accessible depuis le serveur qui implemente toutes les vérifications relatives à la cohérence et aux droits

#### safeQuery(q: dictionary): { * :[0, *, VersionedObject]}
query permet de récupérer des objets en posant une question et de les ramener en spécifiant les attributs à ramener pour chaque classe d'objets.
Ex: ramener les Person dont le nom commence par A, en ramenant juste le nom.

#### safeLoad(l: {objects: [0, *, VersionedObject], scope: [0, *, string]}): [0, *, VersionedObject]
Retourne un ensemble d'objets sous forme de dico avec pour clé les identifiants.
Pas de profondeur, quand la valeur est un objet la valeur retournée est juste l'identifiant.

#### safeSave(objects: [0, *, VersionedObject]): [0, *, VersionedObject]
Enregistre la liste d'objets fournis et renvoie les objets modifiés (nouvelle version courante ou conflits).

Appelle `implSave` pour réaliser effectivement l'enregistrement sur la liste filtré d'objets qui ont effectivement des modifications.

### farCategory raw

Accès direct aux méthodes de base sans __aucune vérification de droit ni de cohérence__.
A utiliser le plus rarement possible, jamais si possible.

#### rawQuery(query: dictionary): { * :[0, *, VersionedObject]}

> __Attention__: `rawQuery` n'effectue aucune vérification de droits sur les objets à charger (contrairement à `rawQuery`). A utiliser en connaissance de causes.

#### rawLoad(l: { objects: [0, *, VersionedObject], scope: [0, *, string] }): [0, *, VersionedObject]

> __Attention__: `rawLoad` n'effectue aucune vérification de droits sur les objets à charger (contrairement à `safeLoad`). A utiliser en connaissance de causes.

#### rawSave(objects: [0, *, VersionedObject]): [0, *, VersionedObject]
Enregistre la liste d'objets fournis et renvoie les objets modifiés (nouvelle version courante ou conflits).

> __Attention__: `rawSave` n'effectue aucune vérification de cohérence et de droits sur les objets à sauver (contrairement à `safeSave`). A utiliser en connaissance de causes.

Appelle `implSave` pour réaliser effectivement l'enregistrement sur la liste filtré d'objets qui ont effectivement des modifications.

### farCategory implementation

Méthodes à implémenter par les dataSources.

#### implBeginTransaction(): DataSourceTransaction

Démarre une transaction

#### implLock(a: { tr: DataSourceTransaction, on: [0, *, string] }): void

Vérouille la datasource sur le tuple `on`. Tant que `implEndTransaction` n'a pas été appelée et que l'application tourne, personne ne peut prendre le véroux si le tuple `on`.

#### implQuery(a: { tr: DataSourceOptionalTransaction, sets: [0, *, ObjectSet] }): { * :[0, *, VersionedObject]}

Effectue une requête et retourne le résultat

#### implLoad(a: { tr: DataSourceOptionalTransaction, objects: [0, *, VersionedObject], scope: [0, *, string] }): [0, *, VersionedObject]

Charge les attributs de `objects` et retourne les objets.

#### implSave(a: { tr: DataSourceTransaction, objects: <0, *, VersionedObject> }): void

Enregistre la liste d'objets fournis et retourne la forme en base des objets.
Tous les objets ont des modifications en attentes.

Les valeurs locales en attente d'enregistrement sont passé en valeurs version courante que si tous les objets sont sauvés avec succès.
En cas de conflits, rien n'est sauvé et les informations sur les conflits sont passés aux objets.

#### implEndTransaction(a: { tr: DataSourceTransaction, commit: boolean }): void

Valide une transaction si `commit` est vrai, sinon annule la transaction.


### aspect client
#### categories: local client
#### farCategories: server

### aspect server
#### categories: local server safe raw implementation initServer
