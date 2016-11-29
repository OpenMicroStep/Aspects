## class DataSource

La classe DataSource est typiquement un objet avec un aspect client et un aspect server.
Sous-classable.

### attributes

### farCategory far [ts]
Méthodes à implémenter quelque soit la dataSource.

#### query(objectClass: string, conditions: dico, scope: [0, *, string]): [0, *, AObject]
query permet de récupérer des objets en posant une question et de les ramener en spécifiant les attributs à ramener pour chaque classe d'objets.
Ex: ramener les Person dont le nom commence par A, en ramenant juste le nom.

#### load(objects: [0, *, AObject], scope: [0, *, string]): [0, *, AObject]
Retourne un ensemble d'objets sous forme de dico avec pour clé les identifiants.
Pas de profondeur, quand la valeur est un objet la valeur retournée est juste l'identifiant.

#### save(objects: [0, *, AObject]): boolean
Sauve un ensemble d'objets et retourne null si la sauvegarde n'a pas marché et sinon un dico des objets complet dans leur nouvelle version.

### aspect client
#### farCategories: far

### aspect db
#### categories: far
