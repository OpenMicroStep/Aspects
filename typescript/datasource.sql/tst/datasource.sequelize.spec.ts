import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager} from '@openmicrostep/aspects';
import {SequelizeDataSource, SequelizeDataSourceImpl, SqlMappedObject, SqlMappedAttribute, SequelizeDBConnector, loadSqlMappers} from '@openmicrostep/aspects.sql';
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
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        version: Sequelize.INTEGER,
        name: Sequelize.STRING,
      }),
      People: sequelize.define('People', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: false },
        firstname: Sequelize.STRING,
        lastname: Sequelize.STRING,
        birthDate: Sequelize.DATE
      }),
      Car: sequelize.define('Car', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: false },
        model: Sequelize.STRING
      }),
      Drivers: sequelize.define('Drivers', {}),
    };
    models.Car.belongsToMany(models.People, { as: 'drivers', through: models.Drivers, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    models.People.belongsToMany(models.Car, { as: 'drivenCars', through: models.Drivers, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    models.Car.belongsTo(models.Resource, { as: 'Resource', foreignKey: 'id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    models.People.belongsTo(models.Resource, {  foreignKey: 'id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    models.Resource.hasMany(models.People, {  foreignKey: 'id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    models.Car.belongsTo(models.People, { foreignKey: 'owner', onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });

    const mappers = loadSqlMappers({
      "People=": { 
        is: "sql-mapped-object",
        inserts: [
          { is: "sql-insert", name: "V", table: "Version" , values: [{ is: "sql-value", name: "id"       , type: "autoincrement" }, 
                                                                     { is: "sql-value", name: "type"     , type: "value", value: "Resource" }] },
          { is: "sql-insert", name: "R", table: "Resource", values: [{ is: "sql-value", name: "id"       , type: "autoincrement" }, 
                                                                     { is: "sql-value", name: "idVersion", type: "ref", insert: "=V", value: "id" }] },
          { is: "sql-insert", name: "P", table: "People"  , values: [{ is: "sql-value", name: "id"       , type: "ref", insert: "=R", value: "id" }] },
        ],
        attributes: [
            { is: "sql-mapped-attribute", name: "_id"        , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "id"        }] },
            { is: "sql-mapped-attribute", name: "_version"   , insert: "=V", path: [{ is: "sql-path", table: "Resource", key: "id"    , value: "idVersion" }, { is: "sql-path", table: "Version", key: "id", where: { type: "Resource" }, value: "version" }] },
            { is: "sql-mapped-attribute", name: "_name"      , insert: "=R", path: [{ is: "sql-path", table: "Resource", key: "id"    , value: "name"      }] },
            { is: "sql-mapped-attribute", name: "_firstname" , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "firstname" }] },
            { is: "sql-mapped-attribute", name: "_lastname"  , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "lastname"  }] },
            { is: "sql-mapped-attribute", name: "_birthDate" , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "birthDate" }], fromDB: v => new Date(v), toDb: d => d.getTime() },
            { is: "sql-mapped-attribute", name: "_cars"                    , path: [{ is: "sql-path", table: "Car"     , key: "owner" , value: "id"        }] },
            { is: "sql-mapped-attribute", name: "_drivenCars"              , path: [{ is: "sql-path", table: "Drivers" , key: "people", value: "car"       }] },
        ]
      },
      "Car=": { 
        is: "sql-mapped-object",
        inserts: [
          { is: "sql-insert", name: "V", table: "Version" , values: [{ is: "sql-value", name: "id"       , type: "autoincrement" }, 
                                                                     { is: "sql-value", name: "type"     , type: "value", value: "Resource" }] },
          { is: "sql-insert", name: "R", table: "Resource", values: [{ is: "sql-value", name: "id"       , type: "autoincrement" }, 
                                                                     { is: "sql-value", name: "idVersion", type: "ref", insert: "=V", value: "id" }] },
          { is: "sql-insert", name: "C", table: "Car"     , values: [{ is: "sql-value", name: "id"       , type: "ref", insert: "=R", value: "id" }] },
        ],
        attributes: [
            { is: "sql-mapped-attribute", name: "_id"        , insert: "=C", path: [{ is: "sql-path", table: "Car"     , key: "id"    , value: "id"        }] },
            { is: "sql-mapped-attribute", name: "_version"   , insert: "=V", path: [{ is: "sql-path", table: "Resource", key: "id"    , value: "idVersion" }, { is: "sql-path", table: "Version", key: "id", where: { type: "Resource" }, value: "version" }] },
            { is: "sql-mapped-attribute", name: "_name"      , insert: "=R", path: [{ is: "sql-path", table: "Resource", key: "id"    , value: "name"      }] },
            { is: "sql-mapped-attribute", name: "_model"     , insert: "=C", path: [{ is: "sql-path", table: "Car"     , key: "id"    , value: "model"     }] },
        ]
      }
    });

    let cc = new ControlCenter();
    let C = Car.installAspect(cc, 'test1');
    let P = People.installAspect(cc, 'test1');
    let DB = SequelizeDataSource.installAspect(cc, "server");
    let db = new DB();
    let mdb = db as any;
    mdb.mappers = mappers;
    mdb.connector = new SequelizeDBConnector(sequelize);
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