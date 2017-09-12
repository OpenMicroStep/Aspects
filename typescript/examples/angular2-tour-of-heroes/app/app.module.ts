import { NgModule }      from '@angular/core';
import { FormsModule }      from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent }  from './app.component';
import { HeroDetailComponent }  from './heroDetail.component';
import { ListeHerosComponent }  from './listeHeros.component';
import { DashboardComponent }  from './dashboard.component';

import { AppRoutingModule }     from './app-routing.module';

@NgModule({
  imports: [ BrowserModule, FormsModule, AppRoutingModule ],
  declarations: [ AppComponent, HeroDetailComponent, ListeHerosComponent, DashboardComponent ],
  bootstrap: [ AppComponent ]
})
export class AppModule { }
