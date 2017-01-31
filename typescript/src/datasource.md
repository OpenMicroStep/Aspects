# Class ParseContext

#### `parseConditions(set: ObjectSet, elements: Map<string, ObjectSet>, attribute: string, conditions: ConstraintDefinition) => void`

Parse and add conditions on the object set attribute.
Conditions is an object where each key are an operator that define a constraint.
If the value associated with the constraint is a string starting with `=`, then the list of accepted operators is reduced between set operators.
Otherwise it's an operator on a fixed value.

