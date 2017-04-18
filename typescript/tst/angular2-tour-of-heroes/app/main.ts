import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import * as aspects from '@openmicrostep/aspects';
import { XHRTransport } from '@openmicrostep/aspects.xhr';
import { AppModule } from './app.module';
import {Heroe, MonApp} from '../shared/index';

export const controlCenter: aspects.ControlCenter = aspects.controlCenter;
controlCenter.installAspect("client", aspects.DataSource.definition, aspects.DataSource);
controlCenter.installAspect("client", MonApp.definition, MonApp);
controlCenter.installAspect("client", Heroe.definition, Heroe);
controlCenter.installBridge({ farTransport: new XHRTransport() });
platformBrowserDynamic().bootstrapModule(AppModule);

export const app: MonApp = new MonApp();
app._id = '__root';
app._version = 0;
export const dataSource: aspects.DataSource = new aspects.DataSource();
dataSource._id = '__dataSource';
dataSource._version = 0;