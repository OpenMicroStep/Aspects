import {ControlCenter, AspectConfiguration, InMemoryDataSource, DataSource} from '@openmicrostep/aspects';
import {assert} from 'chai';
import {createTests} from './datasource.impl.spec';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

export const tests = { name: 'InMemoryDataSource', tests:
  createTests(function createControlCenter(flux) {
    let cfg = new AspectConfiguration([
      Car.Aspects.test1,
      People.Aspects.test1,
      InMemoryDataSource.Aspects.server,
    ]);
    let cc = new ControlCenter(cfg);
    let ds = new InMemoryDataSource.DataStore();
    let db = InMemoryDataSource.Aspects.server.create(cc, ds);
    Object.assign(flux.context, {
      Car: Car.Aspects.test1.factory(cc),
      People: People.Aspects.test1.factory(cc),
      db: db,
      cc: cc
    });
    flux.continue();
  })
};
