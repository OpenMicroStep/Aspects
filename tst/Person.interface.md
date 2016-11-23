## class Person
Description de la classe

### attributs
#### _firstName: string;
#### _lastName:  string;
#### _birthDate: date;

### category core [ts, objc]
#### firstName() : string;
#### lastName()  : string;
#### fullName()  : string;
#### birthDate() : date;

### category calculation [objc]
#### age()       : integer;

### aspect server
#### categories: core, calculation

### aspect client
#### categories: core
#### farCategories: calculation
