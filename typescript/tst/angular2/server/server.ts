import {controlCenter, ControlCenter, VersionedObject, DataSource, Conditions, Scope} from '@microstep/aspects';
import {ExpressTransport} from '@microstep/aspects.express';
import {SequelizeDataSource} from '@microstep/aspects.sequelize';
import {Person, DemoApp} from '../shared/index';
import * as express from 'express';
require('source-map-support').install();

const router = express.Router();
const transport = new ExpressTransport(router, (aspect, id) => {
    if (id === demoapp.id())
        return Promise.resolve(demoapp);
    if (id === dataSource.id())
        return Promise.resolve(dataSource);
    return Promise.reject('not found');
});

class HardCodedDataSource extends DataSource {
  protected _query({conditions, scope}: {conditions: Conditions, scope?: Scope}): VersionedObject[] {
    console.info("query", conditions, scope);
    return this.filter(allObjects, conditions).map(o => o.manager().snapshot()); //  TODO use scope
  }
  protected _load({objects, scope}: {objects: VersionedObject[], scope?: Scope}): VersionedObject[] {
    let ret = <VersionedObject[]>[];
    objects.forEach((o) => {
      ret.push(...allObjects.filter(dbo => dbo._id === o._id));
    });
    return ret.map(o => o.manager().snapshot()); //  TODO use scope
  }
  protected _save(objects: VersionedObject[]): VersionedObject[] {
      return [];
  }
}

controlCenter.installAspect("server", DemoApp.definition, DemoApp);
controlCenter.installAspect("server", Person.definition, Person);
controlCenter.installAspect("server", DataSource.definition, HardCodedDataSource);
controlCenter.installBridge({ publicTransport: transport });

//////
const app = express();
app.use(express.static(__dirname + "/../../../../logitud.typescript.angular/debug/"));
app.use('/app/app', router);
app.listen(8080);

export const demoapp: DemoApp = new DemoApp();
demoapp._id = '__root';
demoapp._version = 0;

var allObjects = <VersionedObject[]>[];
const dataSource = new HardCodedDataSource();
dataSource._id = '__dataSource';
dataSource._version = 0;

allObjects.push((() => {
    let p = new Person();
    p._id = 'person:1';
    p._version = 0;
    p._firstName = 'Vincent';
    p._lastName = 'Rouillé';
    p._birthDate = new Date(1991, 8, 29, 7, 30, 0, 0);
    return p;
})());
allObjects.push((() => {
    let p = new Person();
    p._id = 'person:2';
    p._version = 0;
    p._firstName = 'Eric';
    p._lastName = 'Baradat';
    p._birthDate = new Date(1978, 5, 6, 7, 30, 0, 0);
    return p;
})());
allObjects.push((() => {
    let p = new Person();
    p._id = 'person:3';
    p._version = 0;
    p._firstName = 'Paul';
    p._lastName = 'Dupond';
    p._birthDate = new Date(1980, 6, 6, 7, 30, 0, 0);
    return p;
})());
allObjects.push((() => {
    let p = new Person();
    p._id = 'person:4';
    p._version = 0;
    p._firstName = 'Pierre';
    p._lastName = 'Paul Jacques';
    p._birthDate = new Date(1982, 6, 6, 7, 30, 0, 0);
    return p;
})());
