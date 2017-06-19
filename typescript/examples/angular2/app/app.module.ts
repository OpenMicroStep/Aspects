import { NgModule }      from '@angular/core';
import { FormsModule }      from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent }  from './app.component';
import { PersonComponent }  from './person.component';
import { PersonListComponent }  from './person-list.component';
import { InputComponent }  from './input.component';

@NgModule({
  imports: [ BrowserModule, FormsModule ],
  declarations: [ AppComponent, PersonComponent, PersonListComponent, InputComponent ],
  bootstrap: [ AppComponent ]
})
export class AppModule { }
