import { Component, ViewChildren, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import {PersonComponent} from './person.component';
import {PersonListComponent} from './person-list.component';
import {controlCenter} from './main';
import {Notification} from '@openmicrostep/aspects';

@Component({
    selector: 'my-app',
    template:
`
<div class="container">
  <div class="row">
    <h1>My First Angular 2 App</h1>
  </div>
  <div class="row">
    <div class="col-md-4"><person-list></person-list></div>
    <div class="col-md-6"><person></person></div>
  </div>
</div>
`
})
export class AppComponent implements AfterViewInit, OnDestroy {
    @ViewChild(PersonComponent) personComponent: PersonComponent;
    @ViewChild(PersonListComponent) personListComponent: PersonListComponent;

    ngAfterViewInit() {
        controlCenter.registerComponent(this);
        controlCenter.notificationCenter().addObserver(this, 'personSelected', 'select', this.personListComponent);
    }

    ngOnDestroy() {
        controlCenter.notificationCenter().removeObserver(this);
        controlCenter.unregisterComponent(this);
    }

    personSelected(notification: Notification) {
        this.personComponent.setPerson(notification.info.selected);
    }
}
