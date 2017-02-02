## class DataSource

La classe DataSource est typiquement un objet avec un aspect client et un aspect server.
Sous-classable.

### attributes

### category local

Traitements faisable en local, c'est à dire sans accéder à la base de données.

#### filter(objects: [0, *, VersionedObject], conditions: dictionary): [0, *, VersionedObject]
Filtre un ensemble d'objets d'après les conditions données.

### farCategory client_

Point d'entrée coté client pour l'utilisation de DataSource, ces méthodes implémentent des vérifications locales autour des appels distants (farCategory server_)

#### query(q: dictionary): { * :[0, *, VersionedObject]}

#### load(l: {objects: [0, *, VersionedObject], scope: [0, *, string]}): [0, *, VersionedObject]

#### save(objects: [0, *, VersionedObject]): [0, *, VersionedObject]

### farCategory server_

Partie accessible depuis l'exterieur de la DataSource

#### distantQuery(q: dictionary): { * :[0, *, VersionedObject]}

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
Sauve un ensemble d'objets et retourne null si la sauvegarde n'a pas marché et sinon un dico des objets complet dans leur nouvelle version.

### farCategory raw

Accès direct aux méthodes de base sans aucune vérification de droit ni de cohérence.
A utiliser le plus rarement possible, jamais si possible.

#### rawQuery(query: dictionary): { * :[0, *, VersionedObject]}
#### rawLoad(l: { objects: [0, *, VersionedObject], scope: [0, *, string] }): [0, *, VersionedObject]
#### rawSave(objects: [0, *, VersionedObject]): [0, *, VersionedObject]

### farCategory implementation

Méthodes à implémenter par les dataSources.

#### implQuery(sets: [0, *, ObjectSet]): { * :[0, *, VersionedObject]}
#### implLoad(l: { objects: [0, *, VersionedObject], scope: [0, *, string] }): [0, *, VersionedObject]
#### implSave(objects: [0, *, VersionedObject]): [0, *, VersionedObject]

### aspect client
#### categories: local client_
#### farCategories: server_

### aspect server
#### categories: local server_ safe raw

### aspect impl
#### categories: implementation
