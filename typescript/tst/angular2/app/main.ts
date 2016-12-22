import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import * as aspects from '@microstep/aspects';
import { XHRTransport } from '@microstep/aspects.xhr';
import { AppModule } from './app.module';
import {Person, DemoApp} from '../shared/index';

export const controlCenter: aspects.ControlCenter = aspects.controlCenter;
controlCenter.installAspect("client", aspects.DataSource.definition, aspects.DataSource);
controlCenter.installAspect("client", DemoApp.definition, DemoApp);
controlCenter.installAspect("client", Person.definition, Person);
controlCenter.installBridge({ farTransport: new XHRTransport() });
platformBrowserDynamic().bootstrapModule(AppModule);

export const app: DemoApp = new DemoApp();
app._id = '__root';
app._version = 0;
export const dataSource: aspects.DataSource = new aspects.DataSource();
dataSource._id = '__dataSource';
dataSource._version = 0;

app
    .farPromise('giveMeANumber', void 0)
    .then(n => console.info(n.result()));


app
    .farPromise('pass', { date: new Date() })
    .then(n => console.info(n.result()));

app
    .farPromise('p0', void 0)
    .then(n => console.info(n.result()));
