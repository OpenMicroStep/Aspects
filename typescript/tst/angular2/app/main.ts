import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { ControlCenter, VersionedObject, Invocation, DataSource } from '@microstep/aspects';
import { XHRTransport } from '@microstep/aspects.xhr';
import { AppModule } from './app.module';
import {Person, DemoApp, interfaces} from '../shared/index';

export const controlCenter = new ControlCenter();
VersionedObject.createManager = controlCenter.managerFactory();
const transport = new XHRTransport();

controlCenter.install(controlCenter.loadAspect(interfaces, "DemoApp", "client"), DemoApp, [{
    categories: ["public"],
    server: { aspect: "server" },
    client: { aspect: "client", transport: transport }
}]);
controlCenter.install(controlCenter.loadAspect(interfaces, "Person", "client"), Person, []);
controlCenter.install(controlCenter.loadAspect(interfaces, "DataSource", "client"), DataSource, [{
    categories: ["protected"],
    server: { aspect: "server" },
    client: { aspect: "client", transport: transport }
}]);

platformBrowserDynamic().bootstrapModule(AppModule);

export const app = new DemoApp();
app._id = '__root';
app._version = 0;
export const dataSource = new DataSource();
dataSource._id = '__dataSource';
dataSource._version = 0;

controlCenter
    .farPromise(<Invocation<DemoApp, number>><any>app.giveMeANumber())
    .then(n => console.info(n.result()));


controlCenter
    .farPromise(<Invocation<DemoApp, number>><any>app.pass({ date: new Date() }))
    .then(n => console.info(n.result()));

controlCenter
    .farPromise(<Invocation<DemoApp, number>><any>app.p0())
    .then(n => console.info(n.result()));
