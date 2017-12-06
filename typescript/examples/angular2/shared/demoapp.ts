import {ControlCenter, VersionedObject, DataSource} from '@openmicrostep/aspects';
import {Person, DemoApp} from './index';

DemoApp.category('core', <DemoApp.ImplCategories.core<DemoApp>>{
   dataSource() { return this._dataSource; }
});
DemoApp.category('far', <DemoApp.ImplCategories.far<DemoApp>>{
  giveMeANumber(): number {
    return Math.random();
  },
  pass({}, value) {
    return value;
  },
  p0({ context: { ccc }}): Person {
    let p0 = ccc.create<Person.Categories.core>("Person", ['core']);
    p0._firstName = "Linus";
    p0._lastName = "git";
    p0.manager().setSavedIdVersion(0, 0);
    return p0;
  },
  arr_p0_1({ context: { ccc }}): Person[] {
    let p0 = ccc.create<Person.Categories.core>("Person", ['core']);
    p0._firstName = "Linus";
    p0._lastName = "Torvalds";
    p0.manager().setSavedIdVersion(0, 1);
    return [p0];
  }
});
