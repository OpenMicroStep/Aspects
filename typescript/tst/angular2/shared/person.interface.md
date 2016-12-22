## class Person
Description de la classe

### attributes
#### _firstName: string;
#### _lastName:  string;
#### _birthDate: date;

### category core [ts, objc]
#### firstName() : string;
#### lastName()  : string;
#### fullName()  : string;
#### birthDate() : date;

### farCategory calculation [objc]
#### age()       : integer;

### aspect server
#### categories: core, calculation

### aspect client
#### categories: core
#### farCategories: calculation
