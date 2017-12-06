import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { ControlCenter, DataSource, AspectConfiguration, AspectSelection, VersionedObjectManager } from '@openmicrostep/aspects';
import { XHRTransport } from '@openmicrostep/aspects.xhr';
import { AppModule } from './app.module';
import {Person, DemoApp} from '../shared/index';

const xhr = new XHRTransport();
const cfg = new AspectConfiguration({
  selection: new AspectSelection([
    DemoApp.Aspects.client,
    Person.Aspects.client,
    DataSource.Aspects.client,
  ]),
  defaultFarTransport: xhr
});
export const controlCenter = new ControlCenter(cfg);
const ccc = controlCenter.registerComponent({});
export const dataSource = DataSource.Aspects.client.create(ccc);
export const app = DemoApp.Aspects.client.create(ccc);
platformBrowserDynamic().bootstrapModule(AppModule);

app.manager().setSavedIdVersion('__root', VersionedObjectManager.UndefinedVersion);
dataSource.manager().setSavedIdVersion('__dataSource', VersionedObjectManager.UndefinedVersion);

ccc
  .farPromise(app.giveMeANumber, void 0)
  .then(n => console.info(n.value()));


ccc
  .farPromise(app.pass, { date: new Date() })
  .then(n => console.info(n.value()));

ccc
  .farPromise(app.p0, void 0)
  .then(n => console.info(n.value()));
