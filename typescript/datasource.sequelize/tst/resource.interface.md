## class Resource
### attributes
#### _name: string
### category local
#### name(): string
### aspect test1
#### categories: local

## class Car: Resource
### attributes
#### _model: string
#### _owner: People
### category local
#### model(): string
#### owner(): People
### aspect test1
#### categories: local

## class People: Resource
### attributes
#### _firstname: string
#### _lastname: string
#### _cars: [0, *, Car]
#### _birthDate: date
### category local
#### birthDate(): date
### aspect test1
#### categories: local
