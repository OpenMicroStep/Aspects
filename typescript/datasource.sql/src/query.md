# SequelizeQuery

### Attributes

#### `mapper?: SqlMappedObject`
Current mapper deduced from type constraints

#### `tables: Map<string, string>`
Map multiple SqlPath uniqid to the corresponding table alias

```
["table1","ref1"] -> A1
["table1","ref1"]"value1"["table2","ref2"]] -> A2
["table1","ref1"]"value1"["table2","ref2"]"value2"["table3","ref3"] -> A3
```

#### `path: { table: string, key: string }`
Table and id column names

#### `set: ObjectSet`
ObjectSet this query resolves

#### `subrequests: Map<SqlQuery, string>`
Map SqlQuery to the corresponding table alias

#### `from: SqlBinding[]`
List of subrequests sql+bindings with aliases

#### `fromConditions: SqlBinding[]`
List of conditions to join subrequests

#### `where: SqlBinding[]`
List of conditions

### Methods

#### `build(set: ObjectSet) : SequelizeQuery`

Try to mutate this query if _set_ is compatible with the current one (ie. see _addConstraintOnType_) or create the compatible (sub) query.
Returns the query that resolve _set_.

 1. apply type constraint and get the compatible query
 2. on the compatible query:
   1. set _path_ (the current table and id column)
   2. add remaining constraints to the query (value & between set)

#### `addConstraintOnType(set: ObjectSet, constraint: DataSourceInternal.ConstraintOnType) : SequelizeQuery`

Try to mutate this query if _constraint_ is compatible with the current one (ie. see _setMapper_) or create the compatible (sub) query.

