import {controlCenter, ControlCenter, VersionedObject, DataSource} from '@microstep/aspects';
import * as interfaces from '../generated/aspects.interfaces';
import {Person} from './person';

export const DemoApp = interfaces.DemoApp;
export type DemoApp = interfaces.DemoApp;
DemoApp.category('core', {
   dataSource() { return this._dataSource; }
});
DemoApp.category('public', {
    giveMeANumber(): number {
        return Math.random();
    },
    pass(value) {
        return value;
    },
    p0(): Person {
        let p0 = new Person();
        p0._id = 0;
        p0._firstName = "Linus";
        p0._lastName = "git";
        p0.manager().setVersion(0);
        return p0.manager().snapshot();
    },
    arr_p0_1(): Person[] {
        let p0 = new Person();
        p0._id = 0;
        p0._firstName = "Linus";
        p0._lastName = "Torvalds";
        p0.manager().setVersion(1);
        return [p0];
    }
});
