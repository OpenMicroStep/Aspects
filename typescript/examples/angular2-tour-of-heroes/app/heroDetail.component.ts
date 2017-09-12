import { Component, ViewChild, AfterViewInit, OnDestroy, Inject } from '@angular/core';
import { ActivatedRoute, Params } from '@angular/router';
import { Location }               from '@angular/common';
import 'rxjs/add/operator/switchMap';
import {Heroe} from '../shared/index';
import {controlCenter, dataSource} from './main';
import {Invocation, DataSource, Notification} from '@openmicrostep/aspects';
@Component({
  selector: 'heroDetail',
  template: `
        <form *ngIf="this.selectedHero">
          <h2>{{ this.selectedHero.name() }}</h2>
          <div class="form-group"><label>Nom</label><input class="form-control" readonly [value]="this.selectedHero.name()" /></div>
          <div class="form-group"><label>Identit&eacute; secrète</label><input class="form-control" readonly [value]="this.selectedHero.alias()"/></div>
          <div class="form-group"><label>Pouvoirs</label>
            <div class="col-md-12" *ngIf="this.selectedHero.powers() && this.selectedHero.powers().length > 0">
              <table class="table table-striped table-hover">
                <tr *ngFor="let p of selectedHero.powers()"><td>{{p}}</td></tr>
              </table>
            </div>
            <div *ngIf="!this.selectedHero.powers() || this.selectedHero.powers().length == 0">Aucun pouvoir.</div>
          </div>
        </form>
        <button class="btn btn-default" type="button" (click)="goBack()">Retour</button>
`
})
export class HeroDetailComponent implements AfterViewInit, OnDestroy {
  private selectedHero : Heroe;
  private idParam : number = -1;

  constructor(public route: ActivatedRoute, public location: Location) {}

  goBack(): void {
    this.location.back();
  }

  heroSelected(notification: Notification) {
    this.selectedHero = notification.info.invocation.result().filter(elt => elt.id() == this.idParam)[0];//[0];
  }

  ngAfterViewInit() {
    controlCenter.registerComponent(this);
    controlCenter.notificationCenter().addObserver(this, 'heroSelected', 'heroSelected', this);

    this.route.params
        .subscribe((params: Params) => {
          this.idParam = +params['id'];/////
          dataSource.farEvent('query', {
          conditions:{ _id: +params['id'] },
          scope: [ ]
        }, 'heroSelected', this);
        });
  }

  ngOnDestroy() {
    controlCenter.notificationCenter().removeObserver(this);
    controlCenter.unregisterComponent(this);
  }
}
