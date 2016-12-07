import {ControlCenter, VersionedObject} from '@logitud/aspects';

// server side
export class Person extends VersionedObject {
  _version:   number;
  _firstName: string;
  _lastName:  string;
  _birthDate: Date;
  _parent: Person;

  firstName() : string { return this._firstName; }
  lastName()  : string { return this._lastName; }
  fullName()  : string { return `${this._firstName} ${this._lastName}`; }
  birthDate() : Date   { return this._birthDate; }
  age()       : number { return new Date().getFullYear() - this._birthDate.getFullYear(); }
}
