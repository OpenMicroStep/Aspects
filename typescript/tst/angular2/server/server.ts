import {ControlCenter, VersionedObject, VersionedObjectConstructor, DataSource, Aspect, installPublicTransport, registerQuery, InvocationState} from '@openmicrostep/aspects';
import {SequelizeDataSource, SqlMaker, Pool, SqliteDBConnector, loadSqlMappers} from '@openmicrostep/aspects.sql';
import {ExpressTransport} from '@openmicrostep/aspects.express';
import {Person, DemoApp} from '../shared/index';
import * as express from 'express';
var sqlite3 = require('sqlite3').verbose();
require('source-map-support').install();

const mappers = loadSqlMappers({
  "Person=": { 
    is: "sql-mapped-object",
    fromDbKey: id => `${id}:Person`,
    toDbKey: id => +id.split(':')[0],
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
        { is: "sql-mapped-attribute", name: "_firstName" , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "firstname" }] },
        { is: "sql-mapped-attribute", name: "_lastName"  , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "lastname"  }] },
        { is: "sql-mapped-attribute", name: "_birthDate" , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "birthDate" }], fromDb: v => new Date(v), toDb: d => d.getTime() },
    ]
  }
});
const pool = new Pool(SqliteDBConnector.provider(sqlite3, ':memory:'));
pool.scoped(async db => {
  await db.unsafeRun({ sql: 'CREATE TABLE `Version` (`id` INTEGER PRIMARY KEY, `type` VARCHAR(255), `version` INTEGER)', bind: [] });
  await db.unsafeRun({ sql: 'CREATE TABLE `Resource` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `idVersion` INTEGER REFERENCES `Version` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT, `name` VARCHAR(255))', bind: [] });
  await db.unsafeRun({ sql: 'CREATE TABLE `People` (`id` INTEGER PRIMARY KEY REFERENCES `Resource` (`id`), `firstname` VARCHAR(255), `lastname` VARCHAR(255), `birthDate` DATETIME)', bind: [] });
});

registerQuery("allpersons", (query) => {
  return {
    name: 'persons',
    where: { $instanceOf: Person }, 
    scope: ['_firstName', '_lastName']
  }
});

const router = express.Router();
const transport = new ExpressTransport(router, (cstor, id) => {
  const controlCenter = new ControlCenter();
  const DemoAppServer = DemoApp.installAspect(controlCenter, "server");
  const PersonServer = Person.installAspect(controlCenter, "server");
  const dataSource = new (SequelizeDataSource.installAspect(controlCenter, "server"))();
  const demoapp: DemoApp = new DemoAppServer();
  let mdb = dataSource as any;
  mdb.mappers = mappers;
  mdb.pool = pool;
  mdb.maker = new SqlMaker();

  demoapp.manager().setId('__root');
  dataSource.manager().setId('__dataSource');
  if (id === demoapp.id())
      return Promise.resolve(demoapp);
  if (id === dataSource.id())
      return Promise.resolve(dataSource);
  let [name, dbid] = id.toString().split(':');
  return dataSource.farPromise('safeQuery', { name: "q", where: { _id: dbid, $instanceof: mdb.models.get("name").cstor } })
    .then((envelop) => {
      if (envelop.state() === InvocationState.Terminated)
        return Promise.resolve(envelop.result()["q"][0]);
      return Promise.reject('not found')
    });
});

installPublicTransport(transport, DataSource, ["server_"]);
installPublicTransport(transport, DemoApp, ["far"]);
installPublicTransport(transport, Person, ["calculation"]);

const app = express();
app.use('/', express.static(__dirname + "/../../../../openms.aspects.angular/node_modules/app/"));
app.use('/', router);
app.listen(8080);
