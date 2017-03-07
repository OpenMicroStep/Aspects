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

## Définition du modèle SQL

```ts
{
  is: "sql-storage",
  type: "document" | "object" | "bigtable" | "1:1",
  idGenerator: "autoincrement" | "UUID" | ...,
  attributes: [... sql-attributes],
  indexes: [...sql-index],
  relations: [...sql-relation]
  // si bigtable ou 1:1 ou document
  table: string,
  // si document
  column?: string,
},
{
  is: "sql-attribute",
  name: string,
  column: string,
  type: 'string' | 'text' | 'binary' | 'integer' | 'decimal' | 'date' | 'boolean' | 'float' | 'double' ,
  map?: (dbValue) => objectValue,
  nullable: boolean
},
{
  is: "sql-index",
  columns: string[],
  type: 'unique' | 'primary' | 'index'
},
{
  is: "sql-relation",
  name: string
  type: "1:1" | "1:n" | "n:n"
  fromAttribute: string,
  toStorage: string,
  toAttribute: string,
},
```

## Génération du modèle SQL

La définition du modèle est effectué hierarchiquement, c'est à dire que:

 - les paramètres définits sur la classe mère s'appliquent aux classes enfants
 - les attributs hérites des paramètres s'appliquant sur la classe considéré

