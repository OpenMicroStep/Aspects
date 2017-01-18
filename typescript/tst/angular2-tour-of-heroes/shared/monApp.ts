import {controlCenter, ControlCenter, VersionedObject, DataSource} from '@microstep/aspects';
import * as interfaces from '../generated/aspects.interfaces';

export const MonApp = interfaces.MonApp;
export type MonApp = interfaces.MonApp;
MonApp.category('core', {
   dataSource() { return this._dataSource; }
});
