import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager} from '@openmicrostep/aspects';
import {assert} from 'chai';
import {createTests} from './datasource.impl.spec';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

export const tests = { name: 'InMemoryDataSource', tests: 
  createTests(function createControlCenter(flux) {
    let cc = new ControlCenter();
    let C = Car.installAspect(cc, 'test1');
    let P = People.installAspect(cc, 'test1');
    let DB = InMemoryDataSource.installAspect(cc, "server");
    let db = new DB();
    Object.assign(flux.context, {
      Car: C,
      People: P,
      db: db,
      cc: cc
    });
    flux.continue();
  })
};
