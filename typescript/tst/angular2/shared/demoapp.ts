import {ControlCenter, VersionedObject, DataSource} from '@openmicrostep/aspects';
import {Person, DemoApp} from './index';

DemoApp.category('core', {
   dataSource() { return this._dataSource; }
});
DemoApp.category('far', <DemoApp.ImplCategories.far<DemoApp>>{
    giveMeANumber(): number {
        return Math.random();
    },
    pass(value) {
        return value;
    },
    p0(): Person {
        let p0 = this.controlCenter().create<Person.Categories.core>(Person, ['core']);
        p0.manager().setId(0);
        p0._firstName = "Linus";
        p0._lastName = "git";
        p0.manager().setVersion(0);
        return p0;
    },
    arr_p0_1(): Person[] {
        let p0 = this.controlCenter().create<Person.Categories.core>(Person, ['core']);
        p0.manager().setId(0);
        p0._firstName = "Linus";
        p0._lastName = "Torvalds";
        p0.manager().setVersion(1);
        return [p0];
    }
});
