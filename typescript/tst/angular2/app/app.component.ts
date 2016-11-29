import { Component, ViewChildren, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import {PersonComponent} from './person.component';
import {PersonListComponent} from './person-list.component';
import {controlCenter} from './main';
import {Person} from '../shared/index';
import {Notification} from '@microstep/aspects';

@Component({
    selector: 'my-app',
    template: 
`
    <h1>My First Angular 2 App</h1>
    <person-list></person-list>
    <person></person>
`
})
export class AppComponent implements AfterViewInit, OnDestroy {
    @ViewChild('person') personComponent: PersonComponent;
    @ViewChild('person-list') personListComponent: PersonListComponent;

    ngAfterViewInit() {
        controlCenter.notificationCenter().addObserver(this, 'personSelected', 'select', this.personListComponent);
    }

    ngOnDestroy() {
        controlCenter.notificationCenter().removeObserver(this);
    }

    personSelected(notification: Notification) {
        this.personComponent.setPerson(notification.info.selected);
    }
}
