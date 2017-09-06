# DataSource Internals

## class ObjectSet

An _ObjectSet_ is the internal representation of a query set. 
A graph of _ObjectSet_ is constructed from the query by _ParseContext_.

### Attributes

#### _name: string
The internal name.

#### typeConstraints: ConstraintOnType[]
A set of constraints that define the type of the object set. By reading it, one can determines the set of possible output aspects for the set.

#### name: string
The output name.

#### scope: ResolvedScope
The requested output scope.

#### constraints: Constraint[]
A set of constraint tree.

#### variables?: Map<string, ObjectSet>
A map of variable, the key beeing the variable name of the _ObjectSet_ referenced by constraints. Even if _variables_ is _undefined_, we consider the variable named by the _ObjectSet_ internal name always defined to itself.

#### subs?: Map<string, ObjectSet>
A map of variable, the key beeing the variable name of the _ObjectSet_ referenced by sub constraints.

### Compatible Aspects & Attributes

#### attributesAndCompatibleAspects(cc: ControlCenter) : { compatibleAspects: Set<Aspect.Installed>, attributes: Map<string, Aspect.InstalledAttribute> }
Returns the set of compatibles aspects and attributes required to resolve this _ObjectSet_.

#### aspectAttribute(name: string): Aspect.InstalledAttribute 
Returns the aspect attribute named _name_. The attribute is found by testing attributes available on types. If there is a conflict an exception is raised.

### Variables methods

#### hasVariable(name: string): boolean
Returns if this set has variable _name_. A set has always its internal name (__name_) as variable.

#### setVariable(name: string, set: ObjectSet): void
Define a new variable named _name_ that reference _set_.
If a variable with _name_ already exists an exception is raised.

#### variable(name: string): ObjectSet | undefined
Returns the set referenced by the variable _name_.

#### sub(sub: ObjectSet): string
Define a new sub set named by its internal name and returns the variable name.

#### clone(name: string): ObjectSet
Clone the _ObjectSet_ by copying attributes, mapping constraints, variables, subs to the new name.

### Constraints methods

#### addType(c_with: ConstraintOnType): void
Add a type constraint

#### and(constraint?: Constraint) : void
Add a constraint.

#### tryToMerge(other: ObjectSet) : boolean
Try to merge this _ObjectSet_ with _other_.
The merge will only succeed if _other_ types are compatible with this _ObjectSet_ types.

#### constraint(): Constraint
Returns the constraint tree.