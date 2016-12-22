import {controlCenter, ControlCenter, VersionedObject} from '@microstep/aspects';
import * as interfaces from '../generated/aspects.interfaces';
export const Person = interfaces.Person;
export type Person = interfaces.Person;
Person.category('core', {
  firstName() : string { return this._firstName; },
  lastName()  : string { return this._lastName; },
  fullName()  : string { return `${this._firstName} ${this._lastName}`; },
  birthDate() : Date   { return this._birthDate; },
});
Person.category('calculation', {
  age()       : number { return new Date().getFullYear() - this._birthDate.getFullYear(); }
});
