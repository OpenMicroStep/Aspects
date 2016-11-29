import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { ControlCenter, AObject, Invocation } from '@microstep/aspects';
import { XHRTransport } from '@microstep/aspects.xhr';
import { AppModule } from './app.module';
import {Person, DemoApp, interfaces} from '../shared/index';

const controlCenter = new ControlCenter();
AObject.createManager = controlCenter.managerFactory();
const transport = new XHRTransport();

controlCenter.install(controlCenter.aspect(interfaces, "DemoApp", "client"), DemoApp, [{
    categories: ["public"],
    server: { aspect: "server" },
    client: { aspect: "client", transport: transport }
}]);
controlCenter.install(controlCenter.aspect(interfaces, "Person", "client"), Person, []);

platformBrowserDynamic().bootstrapModule(AppModule);

export const app = new DemoApp();
app._id = 0;
app._version = 0;

controlCenter
    .farPromise(<Invocation<DemoApp, number>><any>app.giveMeANumber())
    .then(n => console.info(n.result()));


controlCenter
    .farPromise(<Invocation<DemoApp, number>><any>app.pass({ date: new Date() }))
    .then(n => console.info(n.result()));


controlCenter
    .farPromise(<Invocation<DemoApp, number>><any>app.p0())
    .then(n => console.info(n.result()));
