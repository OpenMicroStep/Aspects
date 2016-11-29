import { Component } from '@angular/core';

@Component({
    selector: 'person',
    template: `
<form>
    <div><label>First name</label><input /></div>
    <div><label>Last name</label><input /></div>
</form>
`
})
export class PersonComponent { }
