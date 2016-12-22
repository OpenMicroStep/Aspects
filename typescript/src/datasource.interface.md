## class DataSource

La classe DataSource est typiquement un objet avec un aspect client et un aspect server.
Sous-classable.

### attributes

### category core [ts]
#### filter(objects: [0, *, VersionedObject], conditions: dictionary): [0, *, VersionedObject]

### farCategory db [ts]
#### query(q: {conditions: dictionary, scope: [0, *, string]}): [0, *, VersionedObject]
query permet de récupérer des objets en posant une question et de les ramener en spécifiant les attributs à ramener pour chaque classe d'objets.
Ex: ramener les Person dont le nom commence par A, en ramenant juste le nom.

#### load(l: {objects: [0, *, VersionedObject], scope: [0, *, string]}): [0, *, VersionedObject]
Retourne un ensemble d'objets sous forme de dico avec pour clé les identifiants.
Pas de profondeur, quand la valeur est un objet la valeur retournée est juste l'identifiant.

#### save(objects: [0, *, VersionedObject]): [0, *, VersionedObject]
Sauve un ensemble d'objets et retourne null si la sauvegarde n'a pas marché et sinon un dico des objets complet dans leur nouvelle version.

### farCategory transport [ts]
Méthodes à implémenter quelque soit la dataSource.

#### _query(q: { conditions: dictionary, scope: [0, *, string] }): [0, *, VersionedObject]
#### _load(l: { objects: [0, *, VersionedObject], scope: [0, *, string] }): [0, *, VersionedObject]
#### _save(objects: [0, *, VersionedObject]): [0, *, VersionedObject]

### aspect client
#### categories: core db
#### farCategories: transport

### aspect server
#### categories: core db transport
