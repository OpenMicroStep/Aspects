import { Component, ViewChild, AfterViewInit, OnDestroy, Inject, forwardRef } from '@angular/core';
import { Router } from '@angular/router';
import {Heroe} from '../shared/index';
import {controlCenter, dataSource} from './main';
import {Invocation, DataSource, Notification} from '@microstep/aspects';
@Component({
    selector: 'listeHeros',
    template: `
    <h3 style="text-align:center;">My Heroes</h3>
    <div class="input-group input-group-lg">
        <span class="input-group-addon" id="sizing-addon1"><span class="glyphicon glyphicon-search" aria-hidden="true"></span></span>
        <input type="text" class="form-control" placeholder="Rechercher" aria-describedby="sizing-addon1" [(ngModel)]="query">
    </div>
    <div class="alert alert-danger" *ngIf="(!this.heroes || this.heroes.length == 0) && this.query.length > 0">aucun élément ne correspond à la recherche.</div>
    <div *ngIf="this.heroes.length > 0">
        <ul class="list-group" 
            style="overflow-x: hidden;
                    max-height: 400px;
                    border: 1px solid #ccc;
                    border-radius: 5px;
                    overflow-y: auto;
                    cursor: pointer;">
            <li class="list-group-item" *ngFor="let h of heroes" (click)="selected(h)">{{ h.name() }}</li>
        </ul>
    </div>
    <div *ngIf="this.selectedHero">
        <h2>Best hero is {{ this.selectedHero.name() }}</h2>
        <button class="btn btn-default" type="button" (click)="gotoDetails()">details</button>
    </div>
`
})
export class ListeHerosComponent implements AfterViewInit, OnDestroy {
    private heroes: Heroe[] = [];
    private selectedHero: Heroe;
    private _query: string = "";

    constructor(public router: Router) {}

    get query() {
        return this._query;
    }
    set query(value) {
            this._query = value;
            dataSource.farEvent('query', { 
                conditions:{ $text: { $search: value } }, 
                scope: ['_nom']
            }, 'queryResults', this);
    }

    gotoDetails(): void {
        this.router.navigate(['/detail', this.selectedHero.id()]);
    }

    ngAfterViewInit() {
        controlCenter.registerComponent(this);
        controlCenter.notificationCenter().addObserver(this, 'queryResults', 'queryResults', this);
    }

    ngOnDestroy() {
        controlCenter.notificationCenter().removeObserver(this);
        controlCenter.unregisterComponent(this);
    }

    queryResults(notification: Notification) {
        let heroes = notification.info.invocation.result();
        controlCenter.unregisterObjects(this, this.heroes);
        this.heroes = heroes;
        controlCenter.registerObjects(this, this.heroes);
    }

    selected(h: Heroe) {
        this.selectedHero = h;
        /*controlCenter.notificationCenter().postNotification({
            name: "selectHero",
            object: this,
            info: { selected: h }
        });*/
    }
}
