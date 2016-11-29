import {ControlCenter, AObject} from '@microstep/aspects';
import {ExpressTransport} from '@microstep/aspects.express';
import {Person, DemoApp, interfaces} from '../shared/index';
import * as express from 'express';
require('source-map-support').install();

const controlCenter = new ControlCenter();
AObject.createManager = controlCenter.managerFactory();

const router = express.Router();
const transport = new ExpressTransport(router, (aspect, id) => {
    if (aspect.definition.name === "DemoApp" && id === 0)
        return Promise.resolve(demoapp);
    return Promise.reject('not found');
});

controlCenter.install(controlCenter.aspect(interfaces, "DemoApp", "server"), DemoApp, [{
    categories: ["public"],
    server: { aspect: "server", transport: transport },
    client: { aspect: "client" }
}]);
controlCenter.install(controlCenter.aspect(interfaces, "Person", "server"), Person, []);

const app = express();
app.use(express.static('app'));
app.use('/app', router);
app.listen(8080);

export const demoapp = new DemoApp();
