import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager} from '@microstep/aspects';
import {SequelizeDataSource, SequelizeDataSourceImpl} from '@microstep/aspects.sequelize';
import {assert} from 'chai';
import {createTests} from '../../core/tst/datasource.impl.spec';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import * as Sequelize from 'sequelize';
export const name = "SequelizeDataSource";
export const tests =
  createTests(function createControlCenter() {
    let cc = new ControlCenter();
    let C = Car.installAspect(cc, 'test1');
    let P = People.installAspect(cc, 'test1');
    let DB = SequelizeDataSource.installAspect(cc, "server");
    let db = new DB();
    let sequelize = new Sequelize("sqlite://test.sqlite");
    (db as any).sequelize = sequelize;
    return {
      Car: C,
      People: P,
      db: db
    }
  })
;
