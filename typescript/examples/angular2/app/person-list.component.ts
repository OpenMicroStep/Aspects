import { Component, ViewChildren, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import {PersonComponent} from './person.component';
import {controlCenter, dataSource} from './main';
import {Person} from '../shared/index';
import {Notification, Invocation, DataSource} from '@openmicrostep/aspects';

@Component({
    selector: 'person-list',
    template:
`
    <div class="input-group input-group-lg">
        <span class="input-group-addon" id="sizing-addon1"><span class="glyphicon glyphicon-search" aria-hidden="true"></span></span>
        <input type="text" class="form-control" placeholder="Rechercher" aria-describedby="sizing-addon1" [(ngModel)]="query">
    </div>
    <ul class="list-group" style="
  overflow-x: hidden;
  height: 600px;
  border: 1px solid #ccc;
  border-radius: 5px;
  overflow-y: scroll;">
        <li class="list-group-item" *ngFor="let p of persons" (click)="selected(p)">{{ p.fullName() }}</li>
    </ul>
`
})
export class PersonListComponent implements AfterViewInit, OnDestroy {
    persons: Person.Aspects.client[] = [];
    _query: string = "";

    get query() {
        return this._query;
    }
    set query(value) {
        this._query = value;
        Invocation.farEvent(dataSource.query, { id: "allpersons", text: value }, 'queryResults', this);
    }

    ngAfterViewInit() {
        controlCenter.registerComponent(this);
        controlCenter.notificationCenter().addObserver(this, 'queryResults', 'queryResults', this);
    }

    ngOnDestroy() {
        controlCenter.notificationCenter().removeObserver(this);
        controlCenter.unregisterComponent(this);
    }
    selected(p: Person.Aspects.client) {
        controlCenter.notificationCenter().postNotification({
            name: "select",
            object: this,
            info: { selected: p }
        });
    }
    queryResults(notification: Notification) {
        let persons = notification.info.invocation.result().persons;
        this.persons = controlCenter.ccc(this).swapObjects(this.persons, persons);
    }
}
