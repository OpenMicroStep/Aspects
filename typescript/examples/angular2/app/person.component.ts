import { Component, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import {Person} from '../shared/index';
import {controlCenter, dataSource} from './main';
import {Invocation, DataSource, Notification} from '@openmicrostep/aspects';
@Component({
  selector: 'person',
  template: `
<form *ngIf="this.loadedPerson">
  <h2>{{ this.loadedPerson.fullName() }}</h2>
  <div class="form-group"><label>First name</label><input class="form-control" readonly [value]="this.loadedPerson.firstName()" /></div>
  <div class="form-group"><label>Last name</label><input class="form-control" readonly [value]="this.loadedPerson.lastName()" /></div>
  <div class="form-group"><label>Birthdate</label><input class="form-control" readonly [value]="this.loadedPerson.birthDate()" /></div>
  <div class="form-group"><label>Age</label><input class="form-control" readonly [value]="this.loadedPerson.age()" /></div>
</form>
<div *ngIf="!this.loadedPerson">
  <div class="alert alert-info" role="alert">Sélectionner une personne dans la liste.</div>
</div>
`
})
export class PersonComponent implements AfterViewInit, OnDestroy {
  loadedPerson: Person.Aspects.client;

  ngAfterViewInit() {
    controlCenter.registerComponent(this);
    controlCenter.notificationCenter().addObserver(this, 'personLoaded', 'personLoaded', this);
  }

  ngOnDestroy() {
    controlCenter.notificationCenter().removeObserver(this);
    controlCenter.unregisterComponent(this);
  }

  setPerson(p: Person.Aspects.client) {
    controlCenter.ccc(this).registerObject(p);
    Invocation.farEvent(dataSource.load, { objects: [p], scope: ['_firstName', '_lastName', '_birthDate'] }, 'personLoaded', this);
  }
  personLoaded(notification: Notification) {
    this.loadedPerson = notification.info.invocation.result()[0];
  }
}
