Centre de contrôle (ControlCenter)
==================================

Les concepts proposés par __aspects__ sont organisés autour du centre de contrôle.
Celui-ci permet de gérer:

 - l'ensemble accessible d'entités et d'attributs, le chargement et les usages de ceux-ci
 - les liasons entre centres de contrôles distants.
 - les évenements relatifs aux entités (création/destruction/maj/conflit/modification)

Definitions
-----------

Forme structuré permettant de définir le typage:

```
Type primaires: 'integer' | 'decimal' | 'date' | 'localdate' | 'string' | 'array' | 'dictionary' | 'identifier'
Tableau: [min, max, type definition]
Dictionnaire: {nom de la clé: type definition}
```

Forme structuré décrit sous la forme de typage définit précédement:

```
{
    name: string
    version: integer ??
    attributes: [0, '*', {
        name: string,
        type: type definition
    }]
    categories: [0, '*', {
        name: string,
        methods: [0, '*', {
            name: string,
            argumentTypes: [0, '*', type definition]
            returnType: type definition
        }]
    }]
}
```

Forme structuré au format documentation:

```md
## class Nom_de_l_entité
### attributs
#### nom_de_l_attribut: type definition
### category nom_de_la_categorie [liste de tags]
### nom_de_la_méthode(argument0: type definition, ...): type definition
```

Méthodes
--------

### Liens entre implémentation et centre de contrôle

#### associate(implementation, classname: string, version: number): void

Associe l'entité nommée `classname` et à la version `version` accessible par ce Cdc avec l'implémentation fournie.
Pour les langages disposant d'espace de noms (JavaScript, C#, C++, Java, ...) c'est la seule approche possible,
pour les langages sans espace de nom voir `autoAssociate()`

#### autoAssociate(): void [optional]

Associe toutes les entitiés accessible par ce Cdc avec les implémentation accessible.
Disponible uniquement dans les langages sans espace de noms (Objective-C, ...).

### Initialisation des implémentations

TBD

