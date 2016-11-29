import { Component, ViewChildren, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import {PersonComponent} from './person.component';
import {controlCenter} from './main';
import {Person} from '../shared/index';
import {Notification, Invocation, DataSource} from '@microstep/aspects';

@Component({
    selector: 'person-list',
    template: 
`
    <input type="text" ([value])="query" />
    <ul>
        <li *ngFor="let p of persons" (click)="selected(p)">{{ p.fullName() }}</li>
    </ul>
`
})
export class PersonListComponent implements AfterViewInit, OnDestroy {
    persons: Person[];
    _query: string;

    get query() {
        return this._query;
    }
    set query(value) {
        this._query = value;
        //controlCenter.farEvent(dataSource.query('Person', { $text: { $search: value } }, ['_firstName', '_lastName']), 'queryResults', this);
    }
    
    ngAfterViewInit() {
        
    }

    ngOnDestroy() {
        controlCenter.notificationCenter().removeObserver(this);
    }
    selected(p: Person) {
        controlCenter.notificationCenter().postNotification({
            name: "select",
            object: this,
            info: { selected: p }
        });
    }
    queryResults(invocation: Invocation<DataSource, Person[]>) {
        this.persons = invocation.result();
    }
}
