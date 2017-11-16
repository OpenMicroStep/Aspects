Application d'une source de données à une base documentaire
==================================================

### Points à considerer sur un modèle documentaire:

 - correspondances entre les noms d'attributs et leurs chemins au sein d'un document
 - correspondances entre le type des attributes et les valeurs effective
 - absence de transaction, l'ordre d'insertion est important
 - dependances vis à vis de l'objet racine et relations_n,n_ / _1,n_ / _1,1_
 - valeurs par défaut et non existance
 - action sur la suppression et gestion des usages
 - génération de l'ID des objets

## Définition du mappage Document

La définition du mappage Document vers Aspects se fait en partant de la forme du document.

 - `doc`: définition du mappage d'un Document
   - `name`: le nom de l'objet Aspect à mapper
 - `doc-attribute`: mappage d'un attribut Document vers Aspect
   - `name`: le nom de l'attribut Aspect à mapper
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


"Person=": { is: "doc",
  id       : { is: "attribute", name: "_id"        },
  version  : { is: "attribute", name: "_version"   },
  firstname: { is: "attribute", name: "_firstname" },
  lastname : { is: "attribute", name: "_lastname"  },
  cats     : ["=Cat"],
},
"Cat=": { is: "doc",
  id       : { is: "doc-attribute", name: "_id"        },
  version  : { is: "doc-attribute", name: "_version"   },
  firstname: { is: "doc-attribute", name: "_firstname" },
  name     : { is: "doc-attribute", name: "_name"      },
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

"Person=": { is: "doc",
  id       : { is: "doc-attribute", name: "_id"        },
  version  : { is: "doc-attribute", name: "_version"   },
  firstname: { is: "doc-attribute", name: "_firstname" },
  lastname : { is: "doc-attribute", name: "_lastname"  },
  firstname: { is: "doc-attribute", name: "_firstname" },
  cats:      { is: "doc-attribute", name: "_cats"      },
},
"Cat=": { is: "doc",
  id       : { is: "doc-attribute", name: "_id"        },
  version  : { is: "doc-attribute", name: "_version"   },
  firstname: { is: "doc-attribute", name: "_firstname" },
  name     : { is: "doc-attribute", name: "_name"      },
  owners   : { is: "doc-attribute", name: "_owners"    },
}
```
