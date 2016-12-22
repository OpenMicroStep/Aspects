## class DemoApp
Description de la classe

### attributes
#### _dataSource: DataSource;
#### _lastName:  string;
#### _birthDate: date;

### category core [ts]
#### dataSource() : DataSource;

### farCategory public [ts]
#### giveMeANumber(): decimal
#### pass(arg0: any): any
#### p0(): Person
#### arr_p0_1():  [0, *, Person]

### aspect server
#### categories: core, public

### aspect client
#### categories: core
#### farCategories: public
