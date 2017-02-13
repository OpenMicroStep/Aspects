# Class ParseContext

#### `parseSet(v: Instance<ObjectSetDefinition>, set?: ObjectSet, elements?: Map<string, ObjectSet>, out?: string) : ObjectSet`

Parse the set defined by `v` and return it. `v` can be a reference to a set.
To prevent creating useless sets, the `set`, `elements` and `out` parameters allow to continue the construction of a previously created set.

#### `parseCondition(set: ObjectSet, elements: Map<string, ObjectSet>, out: string | undefined, key: string, value: Instance<ObjectSetDefinition>): void`

Parse a condition definition:

 - if key starts with `$`, the condition is an operator on the current set
 - if key starts with `=`, the referenced element is the left side of operators described by the corresponding value
 - if key is a path to an attribute, this attribute is the left side of operators described by the corresponding value

#### `parseConditions(set: ObjectSet, elements: Map<string, ObjectSet>, attribute: string | undefined, conditions: Value | ConstraintDefinition): void`

Parse and add conditions on the object set attribute.
Conditions is an object where each key are an operator that define a constraint.
If the value associated with the constraint is a string starting with `=`, then the list of accepted operators is reduced between set operators.
Otherwise it's an operator on a fixed value.

