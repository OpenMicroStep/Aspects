import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent }  from './app.component';
import { PersonComponent }  from './person.component';
import { ListComponent }  from './list.component';
import { InputComponent }  from './input.component';
import { SearchListComponent }  from './search.component';

@NgModule({
  imports: [ BrowserModule ],
  declarations: [ AppComponent, PersonComponent, ListComponent, InputComponent, SearchListComponent ],
  bootstrap: [ AppComponent ]
})
export class AppModule { }
