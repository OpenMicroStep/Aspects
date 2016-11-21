import {ControlCenter, Entity} from '@logitud/aspects';

export class Person extends Entity {
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
  parent()    : Person { return this._parent; }
}
ControlCenter.associate("Person", Person);
