import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { ControlCenter, DataSource, Aspect } from '@microstep/aspects';
import { XHRTransport } from '@microstep/aspects.xhr';
import { AppModule } from './app.module';
import {Person, DemoApp} from '../shared/index';

export const controlCenter = new ControlCenter();
export const DemoAppClient = DemoApp.installAspect(controlCenter, "client");
export const PersonClient = Person.installAspect(controlCenter, "client");
export const dataSource = new (DataSource.installAspect(controlCenter, "client"))();
export const app = new DemoAppClient();
const xhr = new XHRTransport();
controlCenter._aspects.forEach(cstor => {
    cstor.aspect.farMethods.forEach(method => {
        if (method.transport === Aspect.farTransportStub)
            method.transport = xhr;
    });
});
platformBrowserDynamic().bootstrapModule(AppModule);

app.manager().setId('__root');
dataSource.manager().setId('__dataSource');

app
    .farPromise('giveMeANumber', void 0)
    .then(n => console.info(n.result()));


app
    .farPromise('pass', { date: new Date() })
    .then(n => console.info(n.result()));

app
    .farPromise('p0', void 0)
    .then(n => console.info(n.result()));
