export const StdDefinition = `
ENT // ENT-ENT
_id: 1
system name: ENT
pattern:
  Gab
  _id: 1002
  characteristic: system name
  cardinality: one
  mandatory: 1
  _end:
pattern:
  Gab
  _id: 1004
  characteristic: pattern
  cardinality: multi
//  subobject: 1
  _end:
_end:

ENT // ENT-Car
_id: 3
system name: Car
pattern:
  Gab
  _id: 1032
  characteristic: system name
  cardinality: one
  mandatory: 1
  _end:
pattern:
  Gab
  _id: 1034
  characteristic: type
  cardinality: one
  mandatory: 1
  _end:
pattern:
  Gab
  _id: 1036
  characteristic: domain entity
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1038
  characteristic: domain list
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1046
  characteristic: unique
  cardinality: one
  _end:
_end:

ENT // ENT-Typ
_id: 5
system name: Typ
pattern:
  Gab
  _id: 1052
  characteristic: system name
  cardinality: one
  mandatory: 1
  _end:
pattern:
  Gab
  _id: 1054
  characteristic: table
  cardinality: one
  _end:
_end:

ENT // ENT-Gab
_id: 7
system name: Gab
pattern:
  Gab
  _id: 1072
  characteristic: characteristic
  cardinality: one
  mandatory: 1
  _end:
pattern:
  Gab
  _id: 1074
  characteristic: cardinality
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1076
  characteristic: mandatory
  cardinality: one
  _end:
//pattern:
//  Gab
//  _id: 1078
//  characteristic: subobject
//  cardinality: one
//  _end:
_end:

ENT // ENT-Lst
_id: 15
system name: Lst
pattern:
  Gab
  _id: 1152
  characteristic: system name
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1154
  characteristic: element entity
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1156
  characteristic: element
  cardinality: multi
  _end:
_end:

ENT // ENT-Element
_id: 23
system name: Element
pattern:
  Gab
  _id: 1232
  characteristic: system name
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1234
  characteristic: order
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1236
  characteristic: label
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1238
  characteristic: parameter
  cardinality: multi
//  subobject: 1
  _end:
_end:

ENT // ENT-Parameter
_id: 25
system name: Parameter
pattern:
  Gab
  _id: 1252
  characteristic: entity
  _end:
pattern:
  Gab
  _id: 1254
  characteristic: label
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1256
  characteristic: string
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1260
  characteristic: int
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1262
  characteristic: bool
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1266
  characteristic: gmt
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1268
  characteristic: date
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1270
  characteristic: date & time
  cardinality: one
  _end:
pattern:
  Gab
  _id: 1272
  characteristic: duration
  cardinality: one
  _end:
_end:

Car
_id: 101
system name: entity
type: ID
domain entity: ENT
_end:

Car
_id: 102
system name: system name
type: STR
unique: 1
_end:

Car
_id: 103
system name: characteristic
type: ID
domain entity: Car
_end:

Car
_id: 105
system name: type
type: ID
domain entity: Typ
_end:

Car
_id: 106
system name: table
type: STR
_end:

Car
_id: 107
system name: pattern
type: SID
domain entity: Gab
_end:

Car
_id: 109
system name: domain entity
type: ID
domain entity: ENT
_end:

Car
_id: 110
system name: domain list
type: ID
domain entity: Lst
_end:

Car
_id: 115
system name: cardinality
type: ID
domain list: the cardinalities
_end:

Car
_id: 153
system name: element entity
type: ID
domain entity: ENT
_end:

Car
_id: 155
system name: element
type: ID
_end:

Car
_id: 231
system name: order
type: INT
_end:

Car
_id: 232
system name: label
type: STR
_end:

Car
_id: 241
system name: disabled
type: BOOL
_end:

Car
_id: 243
system name: mandatory
type: BOOL
_end:

Car
_id: 245
system name: unique
type: BOOL
_end:

Car
_id: 401
system name: next oid
type: INT
_end:

Car
_id: 501
system name: parameter
type: SID
domain entity: Parameter
_end:

Car
_id: 511
system name: string
type: STR
_end:

Car
_id: 521
system name: int
type: INT
_end:

Car
_id: 523
system name: bool
type: BOOL
_end:

Car
_id: 531
system name: gmt
type: GMT
_end:

Car
_id: 533
system name: date
type: DAT
_end:

Car
_id: 535
system name: date & time
type: DTM
_end:

Car
_id: 537
system name: duration
type: DUR
_end:

Typ
_id: 2001
system name: ID
_end:

Typ
_id: 2003
system name: SID
table: ID
_end:

Typ
_id: 2021
system name: STR
_end:

Typ
_id: 2041
system name: INT
_end:

Typ
_id: 2043
system name: BOOL
table: INT
_end:

Typ
_id: 2051
system name: GMT
table: INT
_end:

Typ
_id: 2053
system name: DAT
table: INT
_end:

Typ
_id: 2055
system name: DTM
table: INT
_end:

Typ
_id: 2057
system name: DUR
table: INT
_end:

Lst
_id: 2101
system name: the cardinalities
element entity: Element
element: one
element: multi
_end:

Element
_id: 2111
system name: one
order: 20
_end:

Element
_id: 2121
system name: multi
order: 40
_end:

Element
_id: 3000
system name: non
order: 0
_end:

Element
_id: 3025
system name: standby
order: 25
_end:

Element
_id: 3100
system name: oui
order: 100
_end:

Element
_id: 9000
system name: database
next oid: 500001
parameter:
  Parameter
  _id: 9010
  label: obi version
  int: 1
  _end:
_end:
`;
