import {ControlCenter, VersionedObject} from '@microstep/aspects';
import {Person} from './aspects.generated.interfaces';

Person.category('core', {
  firstName() : string { return this._firstName; },
  lastName()  : string { return this._lastName; },
  fullName()  : string { return `${this._firstName} ${this._lastName}`; },
  birthDate() : Date   { return this._birthDate; },
});
Person.category('calculation', {
  age()       : number { return new Date().getFullYear() - this._birthDate.getFullYear(); }
});
