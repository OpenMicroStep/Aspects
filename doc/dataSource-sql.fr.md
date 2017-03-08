Application d'une source de données à une base SQL
==================================================

#### Objectifs:
 
 - si le modèle SQL est simpe, sa définition doit être possible directement dans la documentation;
 - si le modèle SQL est complexe, sa définition doit permettre de le décrire dans un format compréhensible;

#### Points à considerer sur un modèle SQL:

 - correspondances entre les noms d'attributs et les noms des colonnes
 - correspondances entre le type des attributes et les types des colonnes
 - relations _n,n_ / _1,n_ / _1,1_
 - clés étrangères
 - valeurs par défaut et _NULL_
 - définitions des indexes
 - génération de l'ID des objets
 - stockage des classes
   - document
   - 1 classe = 1 table (création de relations 1:1 pour l'héritage)
   - fusion (une table qui contient tous les attributs des sous-classes)
   - hybride (un mélange entre les précédents modes)
   - modèle objet pur via des tables (ID,Caractéristique,Valeur)

## Définition du mappage SQL

```ts
{
  is: "sql-mapped-object"
  attributes: SqlMappedAttribute[]
},
{
  is: "sql-mapped-attribute",
  type: "column" | "query" | "relation", 
  storage: SqlStorage,
  path: string,
  mapToStorage?: (objectValue) => storageValue,
  mapFromStorage?: (storageValue) => objectValue,
  where?: Query
  onDelete?: "restrict" | "cascade" | "setnull" | "setdefault" | (versionedObjectToBeDeleted) => Identifier | undefined
},
{
  is: "sql-storage",
  type: "table" | "document" | "object",
  idGenerator?: "auto" | "UUID" | (db, versionedObject) => any | ...,
  idColumn?:  string
  typeColumn?: string
  toStoragePrimaryKey?: (versionnedObject) => object
  table?: string
  documentPath?: string
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
  dbTable: "AllVersions",
  idColumn: "id",
  typeColumn: "type",
  idGenerator: "autoincrement"
},
"VersionStorage=": {
  is: "sql-storage",
  type: "table",
  dbTable: "AllVersions",
  toStoragePrimaryKey: (versionnedObject) => {
    let [id, type] = versionnedObject.id().split(':');
    return { id: id, type: type };
  }
},
"Person=": { is: "sql-mapped-object
  attributes: ["=_version", "=_firstName", "=_lastName", "=_mother", "=_father", "=_sons"],
  "PersonStorage=": {
    is: "sql-storage",
    type: "table",
    idColumn: "id",
    idGenerator: "autoincrement"
  },
  "_version=": {
    is: "sql-mapped-attribute",
    type: "column",
    storage: "=VersionStorage",
    path: "version"
  },
  "_firstName=": {
    is: "sql-mapped-attribute",
    type: "column",
    storage: "=PersonStorage",
    path: "firstName"
  },
  "_lastName=": {
    is: "sql-mapped-attribute",
    type: "column",
    storage: "=PersonStorage",
    path: "lastName"
  },
  "_mother=": {
    is: "sql-mapped-attribute",
    type: "relation",
    storage: "=PersonStorage",
    path: "mother"
  },
  "_father=": {
    is: "sql-mapped-attribute",
    type: "relation",
    storage: "=PersonStorage",
    path: "father"
  },
  "_sons=": {
    is: "sql-mapped-attribute",
    type: "query",
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


### Person & Chats

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
    idColumn: "id",
    idGenerator: "autoincrement"
  },
  "_version=": {
    is: "sql-mapped-attribute",
    type: "column",
    storage: "=PersonStorage",
    path: "version"
  },
  "_firstName=": {
    is: "sql-mapped-attribute",
    type: "column",
    storage: "=PersonStorage",
    path: "firstName"
  },
  "_lastName=": {
    is: "sql-mapped-attribute",
    type: "column",
    storage: "=PersonStorage",
    path: "lastName"
  },
  "_sons=": {
    is: "sql-mapped-attribute",
    type: "relation",
    path: "_owner"
  }
}
"Cat=": { is: "sql-mapped-object
  attributes: ["=_version", "=_name", "=_owner"],
  "CatStorage=": {
    is: "sql-storage",
    type: "table",
    idColumn: "id",
    idGenerator: "autoincrement"
  },
  "_version=": {
    is: "sql-mapped-attribute",
    type: "column",
    storage: "=CatStorage",
    path: "version"
  },
  "_name=": {
    is: "sql-mapped-attribute",
    type: "column",
    storage: "=CatStorage",
    path: "name"
  },
  "_owner=": {
    is: "sql-mapped-attribute",
    type: "column",
    storage: "=CatStorage",
    path: "owner"
  }
}
```

