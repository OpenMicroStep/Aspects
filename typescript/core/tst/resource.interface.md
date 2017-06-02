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
