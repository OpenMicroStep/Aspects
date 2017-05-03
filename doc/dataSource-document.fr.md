Application d'une source de données à une base documentaire
==================================================

### Points à considerer sur un modèle documentaire:

 - correspondances entre les noms d'attributs et leurs chemins au sein d'un document
 - correspondances entre le type des attributes et les valeurs effective
 - absence de transaction
 - dependances vis à vis de l'objet racine et relations_n,n_ / _1,n_ / _1,1_
 - valeurs par défaut et non existance
 - action sur la suppression et gestion des usages
 - génération de l'ID des objets

## Définition du mappage Document

La définition du mappage Document vers Aspects se fait via 2 éléments: 

 - `doc-mapped-object`: définition du mappage d'un objet Aspect
   - `name`: le nom de l'objet Aspect à mapper
   - `collection`: le nom de la collection qui contient le document
   - `attributes`: liste d'attributs à mapper (_id et _version compris)
   - `fromDbKey?: (id) => id`, fonction de transformation de l'id Aspect vers l'id en base pour l'ensemble des attributs,
   - `toDbKey?: (id) => id`, fonction de transformation de l'id en base vers l'id Aspect pour l'ensemble des attributs,
 - `doc-mapped-attribute`: mappage d'un attribut Aspect vers Document
   - `name`: le nom de l'attribut Aspect à mapper
   - `path`: chemin vers la valeur (`[]` signifie pour tout valeur de ce tableau, `.` permet de définir le parcours)
   - `fromDb?: (value) => value`, fonction de transformation de la valeur Aspect vers la valeur en base pour cet attribut,
   - `toDb?: (value) => value`, fonction de transformation de la valeur en base vers la valeur Aspect pour cet attribut,

### Person & Cats (1:n)

```ts
class Person
  _firstName: string
  _lastName: string
  _cats: Cat[]

class Cat
  _name: string
  _owner: Person

"Person=": { is: "doc-mapped-object",
  collection: "Person",
  attributes: [
    { is: "doc-mapped-attribute", name: "_id"       , path: "id"        },
    { is: "doc-mapped-attribute", name: "_version"  , path: "version"   },
    { is: "doc-mapped-attribute", name: "_firstname", path: "firstname" },
    { is: "doc-mapped-attribute", name: "_lastname" , path: "lastname"  },
    { is: "doc-mapped-attribute", name: "_cats"     , path: "cats[].id" },
  ],
},
"Cat=": { is: "doc-mapped-object",
  collection: "Person",
  attributes: [
    { is: "doc-mapped-attribute", name: "_id"     , path: "cats[].id"      },
    { is: "doc-mapped-attribute", name: "_version", path: "cats[].version" },
    { is: "doc-mapped-attribute", name: "_name"   , path: "cats[].name"    },
    { is: "doc-mapped-attribute", name: "_owner"  , path: "id"             },
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

"Person=": { is: "doc-mapped-object",
  collection: "Person",
  attributes: [
    { is: "doc-mapped-attribute", name: "_id"       , path: "id"        },
    { is: "doc-mapped-attribute", name: "_version"  , path: "version"   },
    { is: "doc-mapped-attribute", name: "_firstname", path: "firstname" },
    { is: "doc-mapped-attribute", name: "_lastname" , path: "lastname"  },
    { is: "doc-mapped-attribute", name: "_cats"     , path: "cats[]"    },
  ],
},
"Cat=": { is: "doc-mapped-object",
  collection: "Cat",
  attributes: [
    { is: "doc-mapped-attribute", name: "_id"     , path: "id"       },
    { is: "doc-mapped-attribute", name: "_version", path: "version"  },
    { is: "doc-mapped-attribute", name: "_name"   , path: "name"     },
    { is: "doc-mapped-attribute", name: "_owners" , path: "owners[]" },
  ],
}
```
