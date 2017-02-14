import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager} from '@microstep/aspects';
import {assert} from 'chai';
import {createTests} from './datasource.impl.spec';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

export const tests = { name: 'InMemoryDataSource', tests: 
  createTests(function createControlCenter() {
    let cc = new ControlCenter();
    let C = Car.installAspect(cc, 'test1');
    let P = People.installAspect(cc, 'test1');
    let DB = InMemoryDataSource.installAspect(cc, "server");
    let db = new DB();

    return {
      Car: C,
      People: P,
      db: db
    }
  })
};
