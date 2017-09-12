import {controlCenter, ControlCenter, VersionedObject} from '@openmicrostep/aspects';
import * as interfaces from '../generated/aspects.interfaces';
export const Heroe = interfaces.Heroe;
export type Heroe = interfaces.Heroe;

Heroe.category('core', {
  name() : string { return this._name },
  alias() : string { return this._alias },
  powers() : string[] { return this._powers }
});
