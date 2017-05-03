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

La définition du mappage SQL vers Aspects se fait via 5 éléments: 

 - `sql-mapped-object`: définition du mappage d'un objet Aspect
   - `name`: le nom de l'objet Aspect à mapper
   - `attribute`: liste d'attributs à mapper (_id et _version compris)
   - `fromDbKey?: (id) => id`, fonction de transformation de l'id Aspect vers l'id en base pour l'ensemble des attributs,
   - `toDbKey?: (id) => id`, fonction de transformation de l'id en base vers l'id Aspect pour l'ensemble des attributs,
 - `sql-mapped-attribute`: mappage d'un attribut Aspect vers SQL
   - `name`: le nom de l'attribut Aspect à mapper
   - `insert`: reférence vers l'élément _sql-insert_ correspondant à l'insertion de la ligne qui contient la valeur
   - `path`: liste d'élément _sql-path_ définissant le chemin depuis l'identifiant jusqu'à la valeur
   - `fromDbKey?: (id) => id`, fonction de transformation de l'id Aspect vers l'id en base pour cet attribut,
   - `toDbKey?: (id) => id`, fonction de transformation de l'id en base vers l'id Aspect pour cet attribut,
   - `fromDb?: (value) => value`, fonction de transformation de la valeur Aspect vers la valeur en base pour cet attribut,
   - `toDb?: (value) => value`, fonction de transformation de la valeur en base vers la valeur Aspect pour cet attribut,
 - `sql-path`: chemin depuis un identifiant vers une valeur
   - `table`: nom de la table SQL
   - `key`: nom de la colonne à utiliser comme clé
   - `value`: nom de la colonne à utiliser comme valeur
   - `where?`: dictionnaire de contraintes à appliquer 
 - `sql-insert`: définition de l'insertion d'une ligne au sein d'une table (id, autoincrement, valeurs externes)
   - `table`: nom de la table SQL
   - `values`: liste d'élément _sql-value_ définissant les valeurs à insérer
 - `sql-value`: une valeur pour une colonne (autoincrement, reference, primitive)
   - `name`: nom de la colonne SQL pour la valeur
   - `type`: type de valeur _autoincrement_, _ref_, _value_
   - `value?`: 
     - si type vaut _value_, la valeur.
     - si type vaut _ref_, le nom de la colonne qui contient la valeur
   - `insert?`: si type vaut _ref_, reférence vers l'élément _sql-insert_ qui insert la colonne définit par _value_

Les attributs multi-valuées sont automatiquement détectés via le typage de l'objet Aspect.

## Exemples

### Famille avec version dans une table à part

```ts
class Person
  _firstName: string
  _lastName: string
  _mother: Person
  _father: Person

"Person=": { is: "sql-mapped-object",
  fromDbKey: id => `${id}:Person`,
  toDbKey: id => +id.split(':')[0],
  inserts: [
    { is: "sql-insert", name: "V", table: "Version", values: [{ is: "sql-value", name: "id"  , type: "autoincrement" }, 
                                                              { is: "sql-value", name: "type", type: "value", value: "Person" }] },
    { is: "sql-insert", name: "P", table: "Person" , values: [{ is: "sql-value", name: "id"  , type: "ref", insert: "=V", value: "id" }] },
  ],
  attributes: [
    { is: "sql-mapped-attribute", name: "_id"       , insert: "=P", path: [{ is: "sql-path", table: "People" , key: "id", value: "id"        }] },
    { is: "sql-mapped-attribute", name: "_version"  , insert: "=V", path: [{ is: "sql-path", table: "Version", key: "id", value: "version"   }] },
    { is: "sql-mapped-attribute", name: "_firstname", insert: "=P", path: [{ is: "sql-path", table: "People" , key: "id", value: "firstname" }] },
    { is: "sql-mapped-attribute", name: "_lastname" , insert: "=P", path: [{ is: "sql-path", table: "People" , key: "id", value: "lastname"  }] },
    { is: "sql-mapped-attribute", name: "_mother"   , insert: "=P", path: [{ is: "sql-path", table: "People" , key: "id", value: "mother"    }] },
    { is: "sql-mapped-attribute", name: "_father"   , insert: "=P", path: [{ is: "sql-path", table: "People" , key: "id", value: "father"    }] },
  ],
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

"Person=": { is: "sql-mapped-object",
  fromDbKey: (id) => `${id}:Person`,
  toDbKey: id => +id.split(':')[0],
  inserts: [
    { is: "sql-insert", name: "P", table: "Person" , values: [{ is: "sql-value", name: "id"  , type: "autoincrement" }] },
  ],
  attributes: [
    { is: "sql-mapped-attribute", name: "_id"       , insert: "=P", path: [{ is: "sql-path", table: "People", key: "id", value: "id"        }] },
    { is: "sql-mapped-attribute", name: "_version"  , insert: "=P", path: [{ is: "sql-path", table: "People", key: "id", value: "version"   }] },
    { is: "sql-mapped-attribute", name: "_firstname", insert: "=P", path: [{ is: "sql-path", table: "People", key: "id", value: "firstname" }] },
    { is: "sql-mapped-attribute", name: "_lastname" , insert: "=P", path: [{ is: "sql-path", table: "People", key: "id", value: "lastname"  }] },
    { is: "sql-mapped-attribute", name: "_cats"     ,             , path: [{ is: "sql-path", table: "Cat"   , key: "owner", value: "owner"  }] },
  ],
},
"Cat=": { is: "sql-mapped-object",
  fromDbKey: id => `${id}:Cat`,
  toDbKey: id => +id.split(':')[0],
  inserts: [
    { is: "sql-insert", name: "C", table: "Cat" , values: [{ is: "sql-value", name: "id"  , type: "autoincrement" }] },
  ],
  attributes: [
    { is: "sql-mapped-attribute", name: "_id"     , insert: "=C", path: [{ is: "sql-path", table: "Cat", key: "id", value: "id"      }] },
    { is: "sql-mapped-attribute", name: "_version", insert: "=C", path: [{ is: "sql-path", table: "Cat", key: "id", value: "version" }] },
    { is: "sql-mapped-attribute", name: "_name"   , insert: "=C", path: [{ is: "sql-path", table: "Cat", key: "id", value: "name"    }] },
    { is: "sql-mapped-attribute", name: "_owner"  , insert: "=C", path: [{ is: "sql-path", table: "Cat", key: "id", value: "owner"   }] },
  ],
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

"R=": { is: "sql-insert", table: "CatPerson", values: []  }
"Person=": { is: "sql-mapped-object",
  fromDbKey: (id) => `${id}:Person`,
  toDbKey: id => +id.split(':')[0],
  inserts: [
    { is: "sql-insert", name: "P", table: "Person", values: [{ is: "sql-value", name: "id"  , type: "autoincrement" }] },
  ],
  attributes: [
    { is: "sql-mapped-attribute", name: "_id"       , insert: "=P", path: [{ is: "sql-path", table: "People"   , key: "id", value: "id"        }] },
    { is: "sql-mapped-attribute", name: "_version"  , insert: "=P", path: [{ is: "sql-path", table: "People"   , key: "id", value: "version"   }] },
    { is: "sql-mapped-attribute", name: "_firstname", insert: "=P", path: [{ is: "sql-path", table: "People"   , key: "id", value: "firstname" }] },
    { is: "sql-mapped-attribute", name: "_lastname" , insert: "=P", path: [{ is: "sql-path", table: "People"   , key: "id", value: "lastname"  }] },
    { is: "sql-mapped-attribute", name: "_cats"     , insert: "=R", path: [{ is: "sql-path", table: "CatPerson", key: "owner", value: "cat"    }] },
  ],
},
"Cat=": { is: "sql-mapped-object",
  fromDbKey: id => `${id}:Cat`,
  toDbKey: id => +id.split(':')[0],
  inserts: [
    { is: "sql-insert", name: "C", table: "Cat", values: [{ is: "sql-value", name: "id"  , type: "autoincrement" }] },
  ],
  attributes: [
    { is: "sql-mapped-attribute", name: "_id"     , insert: "=C", path: [{ is: "sql-path", table: "Cat"      , key: "id", value: "id"      }] },
    { is: "sql-mapped-attribute", name: "_version", insert: "=C", path: [{ is: "sql-path", table: "Cat"      , key: "id", value: "version" }] },
    { is: "sql-mapped-attribute", name: "_name"   , insert: "=C", path: [{ is: "sql-path", table: "Cat"      , key: "id", value: "name"    }] },
    { is: "sql-mapped-attribute", name: "_owners" , insert: "=R", path: [{ is: "sql-path", table: "CatPerson", key: "cat", value: "owner"  }] },
  ],
}
```
