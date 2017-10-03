import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { ControlCenter, DataSource, AspectConfiguration } from '@openmicrostep/aspects';
import { XHRTransport } from '@openmicrostep/aspects.xhr';
import { AppModule } from './app.module';
import {Person, DemoApp} from '../shared/index';

const xhr = new XHRTransport();
const cfg = new AspectConfiguration([
  DemoApp.Aspects.client,
  Person.Aspects.client,
  DataSource.Aspects.client,
], xhr);
export const controlCenter = new ControlCenter(cfg);
export const dataSource = DataSource.Aspects.client.create(controlCenter);
export const app = DemoApp.Aspects.client.create(controlCenter);
platformBrowserDynamic().bootstrapModule(AppModule);

app.manager().setId('__root');
dataSource.manager().setId('__dataSource');

app
  .farPromise('giveMeANumber', void 0)
  .then(n => console.info(n.value()));


app
  .farPromise('pass', { date: new Date() })
  .then(n => console.info(n.value()));

app
  .farPromise('p0', void 0)
  .then(n => console.info(n.value()));
