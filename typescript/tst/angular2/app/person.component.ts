import { Component, ViewChild } from '@angular/core';
import {Person} from '../shared/index';
import {controlCenter} from './main';
import {Invocation, DataSource} from '@microstep/aspects';
@Component({
    selector: 'person',
    template: `
<form>
    <div><label>First name</label><input [value]="this.loadedPerson!.firstName()" /></div>
    <div><label>Last name</label><input [value]="this.loadedPerson!.lastName()" /></div>
</form>
`
})
export class PersonComponent {
    loadedPerson: Person;

    setPerson(p: Person) {
        // controlCenter.farEvent(dataSource.load([p]), 'personLoaded', this);
    }
    personLoaded(invocation: Invocation<DataSource, Person>) {
        this.loadedPerson = invocation.result();
    }
}
