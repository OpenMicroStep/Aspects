import {ControlCenter, AspectConfiguration, InMemoryDataSource, AspectSelection} from '@openmicrostep/aspects';
import {assert} from 'chai';
import {createTests} from './datasource.impl.spec';
import {Resource, Car, People, Point, Polygon, RootObject} from '../../../generated/aspects.interfaces';

export const tests = { name: 'InMemoryDataSource', tests:
  createTests(function createControlCenter(flux) {
    let cfg = new AspectConfiguration(new AspectSelection([
      Car.Aspects.test1,
      People.Aspects.test1,
      Point.Aspects.test1,
      Polygon.Aspects.test1,
      RootObject.Aspects.test1,
      InMemoryDataSource.Aspects.server,
    ]));
    let cc = new ControlCenter(cfg);
    let ds = new InMemoryDataSource.DataStore();
    let ccc = cc.registerComponent({});
    let db = InMemoryDataSource.Aspects.server.create(ccc, ds);
    Object.assign(flux.context, {
      db: db,
      cc: cc
    });
    flux.continue();
  })
};
