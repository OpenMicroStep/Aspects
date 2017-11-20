## class Resource
### attributes
#### _name: string
### category local
#### name(): string
### aspect test1
#### categories: local
### aspect c1
#### categories: local
### aspect s1
#### categories: local

## class Car: Resource
### attributes
#### _model: string
#### _owner: People
_relation_: `_cars`
#### _drivers: [0, *, People]
_relation_: `_drivenCars`
### category local
#### brand(): string
#### model(): string
#### owner(): People
### aspect test1
#### categories: local
### aspect c1
#### categories: local
### aspect s1
#### categories: local

## class People: Resource
### attributes
#### _firstname: string
#### _lastname: string
#### _father: People
_relation_: `_childrens_by_father`
#### _mother: People
_relation_: `_childrens_by_mother`
#### _childrens_by_father: [0, *, People]
_relation_: `_father`
#### _childrens_by_mother: [0, *, People]
_relation_: `_mother`
#### _cars: [0, *, Car]
_relation_: `_owner`
#### _drivenCars: [0, *, Car]
_relation_: `_drivers`
#### _birthDate: date
### category local
#### birthDate(): date
### aspect test1
#### categories: local
### aspect c1
#### categories: local
### aspect s1
#### categories: local

## class RootObject
### attributes
#### _p1: Point
_sub object_
#### _p2: Point
_sub object_
#### _p3: Point
_sub object_
#### _s0: Polygon
_sub object_
#### _s1: Polygon
_sub object_
### aspect test1
#### categories: 

## class Point
_sub object_
### attributes
#### _longitude: decimal
#### _latitude: decimal
#### _altitute: decimal
### aspect test1
#### categories: 

## class Polygon
_sub object_
### attributes
#### _points: [0, *, Point]
_sub object_
### aspect test1
#### categories: 
