import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager} from '@openmicrostep/aspects';
import {SqlDataSource, SqlMappedObject, SqlMappedAttribute, DBConnector, loadSqlMappers, SqliteDBConnectorFactory} from '@openmicrostep/aspects.sql';
import {assert} from 'chai';
import {createTests} from '../../core/tst/datasource.impl.spec';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
var sqlite3 = require('sqlite3').verbose();

function fromDbKeyPeople(id) { return `${id}:People`; }
function fromDbKeyCar(id)    { return `${id}:Car`   ; }
function toDBKey(id) { return +id.split(':')[0]; }

export const name = "SqlDataSource";
export const tests = 
[
  { name: "sqlite", tests: createTests(function createSqliteControlCenter(flux) {
    const mappers = loadSqlMappers({
      "People=": { 
        is: "sql-mapped-object",
        fromDbKey: (id) => `${id}:People`,
        toDbKey: toDBKey,
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
            { is: "sql-mapped-attribute", name: "_birthDate" , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "birthDate" }], fromDb: v => new Date(v), toDb: d => d.getTime() },
            { is: "sql-mapped-attribute", name: "_cars"                    , path: [{ is: "sql-path", table: "Car"     , key: "owner" , value: "id"        }] },
            { is: "sql-mapped-attribute", name: "_drivenCars"              , path: [{ is: "sql-path", table: "Drivers" , key: "people", value: "car"       }] },
        ]
      },
      "Car=": { 
        is: "sql-mapped-object",
        fromDbKey: (id) => `${id}:Car`,
        toDbKey: toDBKey,
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
            { is: "sql-mapped-attribute", name: "_owner"     , insert: "=C", path: [{ is: "sql-path", table: "Car"     , key: "id"    , value: "owner"     }] },
        ]
      }
    });
    const connector = SqliteDBConnectorFactory(sqlite3, { filename: ':memory:' }, { max: 1 });

    let cc = new ControlCenter();
    let C = Car.installAspect(cc, 'test1');
    let P = People.installAspect(cc, 'test1');
    let DB = SqlDataSource.installAspect(cc, "server");
    let db = new DB();
    let mdb = db as any;
    mdb.mappers = mappers;
    mdb.connector = connector;
    mdb.maker = connector.maker;
    Object.assign(flux.context, {
      Car: C,
      People: P,
      db: db,
      cc: cc
    });
    (async db => {
      console.info("init");
      await db.unsafeRun({ sql: 'CREATE TABLE `Version` (`id` INTEGER PRIMARY KEY, `type` VARCHAR(255), `version` INTEGER)', bind: [] });
      await db.unsafeRun({ sql: 'CREATE TABLE `Resource` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `idVersion` INTEGER REFERENCES `Version` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT, `name` VARCHAR(255))', bind: [] });
      await db.unsafeRun({ sql: 'CREATE TABLE `People` (`id` INTEGER PRIMARY KEY REFERENCES `Resource` (`id`), `firstname` VARCHAR(255), `lastname` VARCHAR(255), `birthDate` DATETIME)', bind: [] });
      await db.unsafeRun({ sql: 'CREATE TABLE `Car` (`id` INTEGER PRIMARY KEY REFERENCES `Resource` (`id`), `model` VARCHAR(255), `owner` INTEGER REFERENCES `People` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT)', bind: [] });
      flux.continue();
    })(connector).catch(err => console.info(err));
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