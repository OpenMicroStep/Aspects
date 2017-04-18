import {ControlCenter, VersionedObject, VersionedObjectConstructor, DataSource, Aspect, installPublicTransport, registerQuery, InvocationState} from '@openmicrostep/aspects';
import {SequelizeDataSource} from '@openmicrostep/aspects.sequelize';
import {ExpressTransport} from '@openmicrostep/aspects.express';
import {Person, DemoApp} from '../shared/index';
import * as express from 'express';
import * as Sequelize from 'sequelize';
require('source-map-support').install();

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
  let sequelize = new Sequelize("sqlite://test.sqlite", {});
  let sPerson = sequelize.define('Person', {
    _id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    _version: Sequelize.INTEGER,
    _firstName: Sequelize.STRING,
    _lastName: Sequelize.STRING,
    _birthDate: Sequelize.DATE
  });
  sequelize.sync({ })/*.then(() => {
    sPerson.create({ _firstName: "Henri", _lastName: "King of the north", _birthDate: new Date() });
  });*/
  let mdb = dataSource as any;
  mdb.models.set("Person", { model: sPerson, cstor: PersonServer });
  mdb.sequelize = sequelize;

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
app.use(express.static(__dirname + "/../../../../logitud.typescript.angular/debug/"));
app.use('/app/app', router);
app.listen(8080);
