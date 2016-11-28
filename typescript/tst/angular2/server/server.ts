import {ControlCenter, AObject} from '@microstep/aspects';
import {ExpressTransport} from '@microstep/aspects.express';
import {Person} from '../shared/person';
import * as express from 'express';
const personInterface = require('./person.interface.json');
const demoappInterface = require('./demoapp.interface.json');

const controlCenter = new ControlCenter();
const app = express();
const transport = new ExpressTransport(app, (aspect, id) => {
    return Promise.reject('not implemented')
});
controlCenter.install(ControlCenter.aspect(demoappInterface, "server"), DemoApp, [{
    categories: ["person"],
    server: { aspect: "server", transport: transport },
    client: { aspect: "client" }
}]);
controlCenter.install(ControlCenter.aspect(personInterface, "server"), Person, []);
app.listen(8080);
class DemoApp {

}