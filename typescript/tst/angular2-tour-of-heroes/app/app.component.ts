import { Component, ViewChildren, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { HeroDetailComponent } from './heroDetail.component';
import { ListeHerosComponent } from './listeHeros.component';
import {controlCenter, dataSource} from './main';
import {Heroe} from '../shared/index';
import {Notification, Invocation, DataSource} from '@microstep/aspects';

@Component({
    selector: 'my-app',
    template: 
        `
        <div class="container">
            <div class="row">
                <h1>{{title}}</h1>
            </div>
            <nav class="navbar" style="font-size:20px;">
                <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
                <a routerLink="/heroes" routerLinkActive="active">Heroes</a>
            </nav>
            <router-outlet></router-outlet>
        </div>
        `
})
export class AppComponent implements AfterViewInit, OnDestroy {
    private title = 'Tour of Heroes';
    
/*    @ViewChild(HeroDetailComponent) heroDetailComponent: HeroDetailComponent;
    @ViewChild(ListeHerosComponent) listeHerosComponent: ListeHerosComponent;*/

    ngAfterViewInit() {
        controlCenter.registerComponent(this);/*
        controlCenter.notificationCenter().addObserver(this, 'heroSelected', 'selectHero', this.listeHerosComponent);*/
    }

    ngOnDestroy() {
        /*controlCenter.notificationCenter().removeObserver(this);*/
        controlCenter.unregisterComponent(this);
    }

/*    heroSelected(notification: Notification) {
        this.heroDetailComponent.setHero(notification.info.selected);
    }*/
}
