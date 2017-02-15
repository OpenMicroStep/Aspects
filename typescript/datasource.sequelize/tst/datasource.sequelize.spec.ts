import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager} from '@microstep/aspects';
import {SequelizeDataSource, SequelizeDataSourceImpl} from '@microstep/aspects.sequelize';
import {assert} from 'chai';
import {createTests} from '../../core/tst/datasource.impl.spec';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import * as Sequelize from 'sequelize';
export const name = "SequelizeDataSource";
let sequelize;
process.on('unhandledRejection', (reason, promise) => { throw reason });
export const tests = 
[
  { name: "sqlite", tests: createTests(function createSqliteControlCenter(flux) {
    let cc = new ControlCenter();
    let C = Car.installAspect(cc, 'test1');
    let P = People.installAspect(cc, 'test1');
    let DB = SequelizeDataSource.installAspect(cc, "server");
    let db = new DB();
    let sequelize = new Sequelize("sqlite://test.sqlite", {
      logging: () => {}
    });
    let sPeople = sequelize.define('People', {
      _id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      _version: Sequelize.INTEGER,
      _name: Sequelize.STRING,
      _firstname: Sequelize.STRING,
      _lastname: Sequelize.STRING,
      _birthDate: Sequelize.DATE
    });
    let sCar = sequelize.define('Car', {
      _id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      _version: Sequelize.INTEGER,
      _name: Sequelize.STRING,
      _model: Sequelize.STRING
    });
    let mdb = db as any;
    mdb.models.set("Car", { model: sCar, cstor: C });
    mdb.models.set("People", { model: sPeople, cstor: P });
    mdb.sequelize = sequelize;
    Object.assign(flux.context, {
      Car: C,
      People: P,
      db: db,
      cc: cc
    });
    sequelize.sync({ force: true }).then(() => flux.continue());
  }) }
];
