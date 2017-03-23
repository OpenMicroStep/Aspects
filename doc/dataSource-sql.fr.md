Application d'une source de données à une base SQL
==================================================

On cherche uniquement a mapper une base de données existante sur un model Aspects.

#### Points à considerer sur un modèle SQL:

 - correspondances entre les noms d'attributs et les noms des colonnes
 - correspondances entre le type des attributes et les types des colonnes
 - relations _n,n_ / _1,n_ / _1,1_
 - valeurs par défaut et _NULL_
 - action sur la suppression et gestion des usages
 - génération de l'ID des objets
 - stockage des classes
   - table
   - document
   - modèle objet pur via des tables (ID,Caractéristique,Valeur)

## Définition du mappage SQL

La définition du mappage SQL vers Aspects se fait via 3 éléments: 

 - sql-mapped-object: définition des attributs de l'objet Aspect ()
 - sql-mapped-attribute: mappage d'un attribut Aspect vers SQL
 - sql-storage: mappage depuis l'id d'un objet aspect vers un dictionnaire attributs/valeurs (ex: une table, un document, ...)

Les attributs multi-valuées sont automatiquement détectés via le typage de l'objet Aspect et implique que storage est résolu comme étant une liste de documents.

L'ensemble des relations entre les objets est maintenue automatiquement par la DataSource (pour tous les objets) et le ControlCenter (pour les objets chargés)

```ts
{
  is: "sql-mapped-object"
  name: "Aspect class name"
  attributes: SqlMappedAttribute[]
},
{
  is: "sql-mapped-attribute",
  storage: SqlStorage, // référence vers la source de données (document, table, ...)
  path: string, // chemin au sein de la source de données vers la valeur de l'attribute
  mapToStorage?: (objectValue) => storageValue, // mappage de la valeur aspect vers la valeur en base
  mapFromStorage?: (storageValue) => objectValue, // mappage depuis la valeur en base vers la valeur aspect
  where?: Query // si type === "query", la requête DataSource à effectuer. L'élément "=::self::" est prédéfini comme étant l'objet Aspect sur lequel porte la recherche
  onDelete?: "restrict" | "cascade" | "setnull" | "setdefault" | (versionedObjectToBeDeleted) => Identifier | undefined
},
{
  is: "sql-storage",
  type: "table" | "document" | "object", // type de la source de données (document, table, obi, ...)
  idGenerator?: "auto" | "UUID" | (db, versionedObject) => Promise<Identifier>, // méthode de génération de l'identifiant Aspect
  // ↓ si type === "table" | "document" ↓
  toStorageKey?: (versionnedObject) => object
  fromStorageKey?: (object) => Identifier
  keyPath?: { table: string, columns: { [column: string]: string } }[], // chemin depuis l'objet Aspect vers la source de données (ie. les tables a parcourir depuis la key vers la source de données
  // ↑                     ↑
  path?: string; // si type === "document", chemin vers la colonne qui contient le document
}
```

## Exemples

### Famille avec version dans une table à part

```ts
class Person
  _firstName: string
  _lastName: string
  _mother: Person
  _father: Person
  _sons: Person[]

"VersionStorage=": {
  is: "sql-storage",
  type: "table",
  fromStoragePrimaryKey(object) { return `${object.myid}:{object.mytype}` },
  toStoragePrimaryKey(versionnedObject) { let [id, type] = versionedObject.id().split(':'); return { myid: id, mytype: type }; },
  keyPath: [
    { table: "AllVersions", columns: { "id": "myid", "type": "mytype"} }
  ]
},
"Person=": { is: "sql-mapped-object
  attributes: ["=_version", "=_firstName", "=_lastName", "=_mother", "=_father", "=_sons"],
  "PersonStorage=": {
    is: "sql-storage",
    type: "table",
    keyPath: { table: "Person", columns: { "id": "_id" } }
    idGenerator: "autoincrement"
  },
  "_version=": {
    is: "sql-mapped-attribute",
    storage: "=VersionStorage",
    path: "version"
  },
  "_firstName=": {
    is: "sql-mapped-attribute",
    storage: "=PersonStorage",
    path: "firstName"
  },
  "_lastName=": {
    is: "sql-mapped-attribute",
    storage: "=PersonStorage",
    path: "lastName"
  },
  "_mother=": {
    is: "sql-mapped-attribute",
    storage: "=PersonStorage",
    path: "mother"
  },
  "_father=": {
    is: "sql-mapped-attribute",
    storage: "=PersonStorage",
    path: "father"
  },
  "_sons=": {
    is: "sql-mapped-attribute",
    where: {
      $instanceOf: Person,
      $or: [
        { _father: { $eq: "=self" } }, 
        { _mother: { $eq: "=self" } },
      ]
    }
  }
}
```


### Person & Cats (1:n)

```ts
class Person
  _firstName: string
  _lastName: string
  _cats: Cat[]

class Cat
  _name: string
  _owner: Person

"Person=": { is: "sql-mapped-object
  attributes: ["=_version", "=_firstName", "=_lastName", "=_cats"],
  "PersonStorage=": {
    is: "sql-storage",
    type: "table",
    keyPath: { table: "Person", columns: { "id": "_id" } },
    idGenerator: "autoincrement",
  },
  "_version="  : { is: "sql-mapped-attribute", storage: "=PersonStorage", path: "version"   },
  "_firstName=": { is: "sql-mapped-attribute", storage: "=PersonStorage", path: "firstName" },
  "_lastName=" : { is: "sql-mapped-attribute", storage: "=PersonStorage", path: "lastName"  },
  "_cats="     : { is: "sql-mapped-attribute", where: { $instanceOf: Cat, _owner: { $eq: "=self" } } },
}
"Cat=": { is: "sql-mapped-object
  attributes: ["=_version", "=_name", "=_owner"],
  "CatStorage=": {
    is: "sql-storage",
    type: "table",
    keyPath: { table: "Cat", columns: { "id": "_id" } },
    idGenerator: "autoincrement"
  },
  "_version=" : { is: "sql-mapped-attribute", storage: "=CatStorage", path: "version" },
  "_name="    : { is: "sql-mapped-attribute", storage: "=CatStorage", path: "name"    },
  "_owner="   : { is: "sql-mapped-attribute", storage: "=CatStorage", path: "owner"   },
}
```

### Person & Cats (n:n)

```ts
class Person
  _firstName: string
  _lastName: string
  _cats: Cat[]

class Cat
  _name: string
  _owners: Person[]

"Cat2PersonStorage=": {
  is: "sql-storage",
  type: "table",
  keyPath: { table: "CatPerson", columns: { "cat": "_id" } }
},
"Person2CatStorage=": {
  is: "sql-storage",
  type: "table",
  keyPath: { table: "CatPerson", columns: { "owner": "_id" } }
},
"Person=": { is: "sql-mapped-object
  attributes: ["=_version", "=_firstName", "=_lastName", "=_cats"],
  "PersonStorage=": {
    is: "sql-storage",
    type: "table",
    keyPath: { table: "Person", columns: { "id": "_id" } },
    idGenerator: "autoincrement",
  },
  "_version="  : { is: "sql-mapped-attribute", storage: "=PersonStorage"    , path: "version"   },
  "_firstName=": { is: "sql-mapped-attribute", storage: "=PersonStorage"    , path: "firstName" },
  "_lastName=" : { is: "sql-mapped-attribute", storage: "=PersonStorage"    , path: "lastName"  },
  "_cats="     : { is: "sql-mapped-attribute", storage: "=Person2CatStorage", path: "cat"       },
}
"Cat=": { is: "sql-mapped-object
  attributes: ["=_version", "=_name", "=_owner"],
  "CatStorage=": {
    is: "sql-storage",
    type: "table",
    keyPath: { table: "Cat", columns: { "id": "_id" } },
    idGenerator: "autoincrement"
  },
  "_version=" : { is: "sql-mapped-attribute", storage: "=CatStorage"       , path: "version" },
  "_name="    : { is: "sql-mapped-attribute", storage: "=CatStorage"       , path: "name"    },
  "_owners="  : { is: "sql-mapped-attribute", storage: "=Cat2PersonStorage", path: "owner"   },
}
```
