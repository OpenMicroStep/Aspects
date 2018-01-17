## class Person
Description de la classe

### attributes
#### _firstName: string
#### _lastName:  string
#### _birthDate: date
#### _mother: Person
#### _father: Person
#### _cats: [0, *, Cat]
_relation_: `_owner`

### queries

#### _sons: [0, *, Person]
Les enfants de cette personne

    {
      "instanceOf": "Person",
      "$or": [
        { "_father": { "$eq": "=self" } },
        { "_mother": { "$eq": "=self" } }
      ]
    }

### category core [ts, objc]
#### firstName() : string
#### lastName()  : string
#### fullName()  : string
#### birthDate() : date

### farCategory calculation [objc]
#### age()       : integer

## class Cat
### attributes
#### _owner: Person
_relation_: `_cats`
