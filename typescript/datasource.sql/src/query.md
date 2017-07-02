# SqlQuery

Generate from an ObjectSet an optimized sql query.

When a query is too complex to be supported by the current database, the concerned query is resolved and the result is transformed to SQL to allow the rest of the query to execute as expected.

## The recursive query problem

Most SQL databases nowadays support the [SQL 1999: Common Table Expression](https://en.wikipedia.org/wiki/Hierarchical_and_recursive_queries_in_SQL#Common_table_expression) syntax in their latest version:

 - SQLite since 3.8.3
 - PostgresSql since 8.4
 - MariaDB since 10.2
 - SQL Server
 - MySQL will in version 8
 - Oracle since 11g R2

Let's consider the following object:

```md
## class Person
### attributes
#### _father: Person
#### _mother: Person
```

And the following recursive set:

```js
{
  $unionForAlln: "=U(n)",
  "U(0)=": { $instanceOf: "Person", _firstname: "Lisa", _lastname: "Simpson" },
  "U(n + 1)=": {
    $out: "=p",
    "s=": { $elementOf: "=U(n)" },
    "p=": { $elementOf: { $instanceOf: "Person" } },
    $or: [
      { "=p": { $eq: "=s._mother" } },
      { "=p": { $eq: "=s._father" } },
    ]
  }
}
```

By using _Common Table Expression_ we do:

```sql
WITH RECURSIVE Un(_id) AS (
  SELECT _id FROM Person WHERE Person._firstname = "Lisa" AND Person._lastname = "Simpson" # U_0
UNION
  SELECT _id FROM Person, Un WHERE Person._mother = Un._id OR Person._father = Un._id # U_n+1
)
SELECT * FROM Un;
```
Postgres require recursive CTE queries to have the `RECURSIVE` keyword after `WITH`.
Oracle requires the `RECURSIVE` keyword to _NOT_ be there.

With MySQL < 8.0 see https://planet.mysql.com/entry/?id=599259


For Oracle before the version 11g R2  we do:

```sql
SELECT _id FROM Person
START WITH Person._firstname = "Lisa" AND Person._lastname = "Simpson"
CONNECT BY NOCYCLE Person._mother = PRIOR Person._id OR Person._father = PRIOR Person._id
```

The `WITH` syntax is much easier to work with than `CONNECT` for building ObjectSet recursive query with complex subqueries. For example, building the initial set of value could requires other tables, but the iteration doesn't, making the join garbage for the rest of the query, with a high risk of altering the result. 

If other tables are required to load attributes, it's easier to generate the right JOIN.
But if the recursion occurs on totally different tables 

```sql
WITH RECURSIVE Un(_id) AS (
  SELECT P._id, P1._name 
  FROM Person P, P1
  WHERE P._firstname = "Lisa" AND P._lastname = "Simpson"
    AND P1._id = P._id
UNION
  SELECT P._id, P1._name
  FROM Person P, P1, Un 
  WHERE P._mother = Un._id OR P._father = Un._id
    AND P1._id = P._id
)
SELECT * FROM Un;

SELECT P._id, P1._name FROM Person P, P1
WHERE P1._id = P._id
START WITH P._firstname = "Lisa" AND P._lastname = "Simpson"
CONNECT BY NOCYCLE P._mother = PRIOR P._id OR P._father = PRIOR P._id
```

```sql
WITH RECURSIVE Un(_id) AS (
  SELECT P._id, P1._name
  FROM Person P, P1, P2
  WHERE P._firstname = "Lisa" AND P._lastname = "Simpson"
    AND P1._id = P._id
    AND P2._id = P._id AND P2._external = 10
UNION
  SELECT P._id, P1._name
  FROM Person P, P1, Un 
  WHERE P._mother = Un._id OR P._father = Un._id
    AND P1._id = P._id
)
SELECT * FROM Un;

SELECT P._id, P1._name FROM Person P, P1
WHERE P1._id = P._id
START WITH P._firstname = "Lisa" AND P._lastname = "Simpson" AND (SELECT _external FROM P2 WHERE P2._id = P._id) = 10
CONNECT BY NOCYCLE P._mother = PRIOR P._id OR P._father = PRIOR P._id

SELECT DISTINCT P._id, P1._name FROM Person P, P1
LEFT OUTER JOIN P2 ON P2._id = P._id
WHERE P1._id = P._id
START WITH P._firstname = "Lisa" AND P._lastname = "Simpson" AND P2._external = 10
CONNECT BY NOCYCLE P._mother = PRIOR P._id OR P._father = PRIOR P._id

# Notice the required addition of DISTINCT, the _left join_ can multiply the expected result set by __A LOT__ 
# and we can't tell oracle, to NOT DO this JOIN in the connect
```
### Attributes

#### `variables: Set<SqlQuery<SharedContext>>`
Set of query this query variables requires

#### `variables: Set<SqlQuery<SharedContext>>`
Map each sub query to the table alias and required scope

### Methods

#### `build(ctx: SharedContext, set: ObjectSet): void`

Handle the construction of the query that anwsers the requested `set`.

 1. Convert the type constraints to a FROM clause
 2. Handle constraints (variable & value)


### Attributes

#### `tables: Map<string, string>`
Map the path to an sql path for each variable to the corresponding table alias

The key is the concatenation of for each sql path:

 1. the name of the value column or the name of variable if it's the first sql path
 2. the name of the table
 3. the name of the key column

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

# class SqlMappedQuery

### Attributes

#### `tables: Map<string, string>`
Map the path to an sql path for each variable to the corresponding table alias

The key is the concatenation of for each sql path:

 1. the name of the value column or the name of variable if it's the first sql path
 2. the name of the table
 3. the name of the key column

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



#### `addConstraintOnType(set: ObjectSet, constraint: DataSourceInternal.ConstraintOnType) : SequelizeQuery`

Try to mutate this query if _constraint_ is compatible with the current one (ie. see _setMapper_) or create the compatible (sub) query.

