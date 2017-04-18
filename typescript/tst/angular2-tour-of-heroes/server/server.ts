import {controlCenter, ControlCenter, VersionedObject, DataSource, Conditions, Scope} from '@openmicrostep/aspects';
import {ExpressTransport} from '@openmicrostep/aspects.express';
import {SequelizeDataSource} from '@openmicrostep/aspects.sequelize';
import {Heroe, MonApp} from '../shared/index';
import * as express from 'express';
require('source-map-support').install();

const router = express.Router();
const transport = new ExpressTransport(router, (aspect, id) => {
    if (id === monApp.id())
        return Promise.resolve(monApp);
    if (id === dataSource.id())
        return Promise.resolve(dataSource);
    return Promise.reject('not found');
});

class HardCodedDataSource extends DataSource {
  protected _query({conditions, scope}: {conditions: Conditions, scope?: Scope}): VersionedObject[] {
    //console.info("query", conditions, scope, this.filter(allObjects, conditions));
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

controlCenter.installAspect("server", MonApp.definition, MonApp);
controlCenter.installAspect("server", Heroe.definition, Heroe);
controlCenter.installAspect("server", DataSource.definition, HardCodedDataSource);
controlCenter.installBridge({ publicTransport: transport });

//////
const app = express();
app.use(express.static(__dirname + "/../../../../logitud.typescript.angular/debug/"));
app.use('/app/app', router);
app.listen(8080);

export const monApp: MonApp = new MonApp();
monApp._id = '__root';
monApp._version = 0;

var allObjects = <VersionedObject[]>[];
const dataSource = new HardCodedDataSource();
dataSource._id = '__dataSource';
dataSource._version = 0;

allObjects.push((() => {
    let p = new Heroe();
    p._id = 1;
    p._version = 0;
    p._name = 'Batman';
    p._alias = 'Bruce Wayne';
    p._powers = [];
    return p;
})());
allObjects.push((() => {
    let p = new Heroe();
    p._id = 2;
    p._version = 0;
    p._name = 'Superman';
    p._alias = 'Clark Kent';
    p._powers = ['Méga fort', 'Vol'];
    return p;
})());
allObjects.push((() => {
    let p = new Heroe();
    p._id = 3;
    p._version = 0;
    p._name = 'Flash';
    p._alias = 'Barry Alen';
    p._powers = ['Super rapide'];
    return p;
})());
allObjects.push((() => {
    let p = new Heroe();
    p._id = 4;
    p._version = 0;
    p._name = 'Green arrow';
    p._alias = 'Oliver Queen';
    p._powers = [];
    return p;
})());
allObjects.push((() => {
    let p = new Heroe();
    p._id = 5;
    p._version = 0;
    p._name = 'Nightwing';
    p._alias = 'Dick Grayson';
    p._powers = [];
    return p;
})());
