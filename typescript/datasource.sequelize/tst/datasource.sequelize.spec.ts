import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager} from '@openmicrostep/aspects';
import {SequelizeDataSource, SequelizeDataSourceImpl, SqlStorage, SqlMappedObject, SqlMappedAttribute} from '@openmicrostep/aspects.sequelize';
import {assert} from 'chai';
import {createTests} from '../../core/tst/datasource.impl.spec';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import * as Sequelize from 'sequelize';
export const name = "SequelizeDataSource";
let sequelize;
export const tests = 
[
  { name: "sqlite", tests: createTests(function createSqliteControlCenter(flux) {
    let sequelize = new Sequelize("sqlite://test.sqlite", {
      //logging: () => {}
    });
    const models = {
      Resource: sequelize.define('Resource', {
        _id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        _version: Sequelize.INTEGER,
        _name: Sequelize.STRING,
      }),
      People: sequelize.define('People', {
        _id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: false },
        _firstname: Sequelize.STRING,
        _lastname: Sequelize.STRING,
        _birthDate: Sequelize.DATE
      }),
      Car: sequelize.define('Car', {
        _id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: false },
        _model: Sequelize.STRING
      }),
      Drivers: sequelize.define('Drivers', {}),
    };
    models.Car.belongsToMany(models.People, { as: '_drivers', through: models.Drivers, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    models.People.belongsToMany(models.Car, { as: '_drivenCars', through: models.Drivers, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    models.Car.belongsTo(models.Resource, { as: 'Resource', foreignKey: '_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    models.People.belongsTo(models.Resource, {  foreignKey: '_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    models.Resource.hasMany(models.People, {  foreignKey: '_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    models.Car.belongsTo(models.People, { foreignKey: '_owner', onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });

    const storages = {
      Resource         : new SqlStorage({ keyPath: [{ model: models.Resource, fromColumns: ["_id"      ] } ] }),
      People           : new SqlStorage({ keyPath: [{ model: models.People  , fromColumns: ["_id"      ] } ] }),
      Car              : new SqlStorage({ keyPath: [{ model: models.Car     , fromColumns: ["_id"      ] } ] }),
      DriversFromCar   : new SqlStorage({ keyPath: [{ model: models.Drivers , fromColumns: ["car_id"   ] } ] }),
      CarFromPeople    : new SqlStorage({ keyPath: [{ model: models.Car     , fromColumns: ["_owner"   ] } ] }),
      DriversFromPeople: new SqlStorage({ keyPath: [{ model: models.Drivers , fromColumns: ["people_id"] } ] }),
    }
    const mappers = {
      People: new SqlMappedObject({ interface: People, select: storages.People, insert: storages.Resource, attributes: [
        new SqlMappedAttribute({ storage: storages.Resource         , name: "_version"   , path: ["_version"]   }),
        new SqlMappedAttribute({ storage: storages.Resource         , name: "_name"      , path: ["_name"]      }),
        new SqlMappedAttribute({ storage: storages.People           , name: "_firstname" , path: ["_firstname"] }),
        new SqlMappedAttribute({ storage: storages.People           , name: "_lastname"  , path: ["_lastname"]  }),
        new SqlMappedAttribute({ storage: storages.People           , name: "_birthDate" , path: ["_birthDate"] }),
        new SqlMappedAttribute({ storage: storages.CarFromPeople    , name: "_cars"      , path: ["_owner"]     }),
        new SqlMappedAttribute({ storage: storages.DriversFromPeople, name: "_drivenCars", path: ["people_id"]  }),
      ]}),
      Car: new SqlMappedObject({ interface: Car, select: storages.Car, insert: storages.Resource, attributes: [
        new SqlMappedAttribute({ storage: storages.Resource      , name: "_version", path: ["_version"] }),
        new SqlMappedAttribute({ storage: storages.Resource      , name: "_name"   , path: ["_name"]    }),
        new SqlMappedAttribute({ storage: storages.Car           , name: "_model"  , path: ["_model"]   }),
        new SqlMappedAttribute({ storage: storages.Car           , name: "_owner"  , path: ["_owner"]   }),
        new SqlMappedAttribute({ storage: storages.DriversFromCar, name: "_drivers", path: ["car_id"]   }),
      ]}),
    };

    let cc = new ControlCenter();
    let C = Car.installAspect(cc, 'test1');
    let P = People.installAspect(cc, 'test1');
    let DB = SequelizeDataSource.installAspect(cc, "server");
    let db = new DB();
    let mdb = db as any;
    mdb.mappers = mappers;
    mdb.sequelize = sequelize;
    Object.assign(flux.context, {
      Car: C,
      People: P,
      db: db,
      cc: cc
    });
    sequelize.sync({ force: true })
      .then(() => flux.continue())
      .catch((err) => console.info(err));
  }) }
];

/*
where: { instanceOf: People }
scope: ['_name', '_firstname', '_lastname', '_cars']

SELECT R._id, P._name, P._firstname, P._lastname FROM People P, Resource R WHERE P._id = R._id
  SELECT _id FROM Car WHERE _owner IN (...)
OR
  SELECT _id FROM Car WHERE _owner NOT NULL
  then fuse

// SELECT P.(...), R.(...) FROM People P, Resource R WHERE 

*/