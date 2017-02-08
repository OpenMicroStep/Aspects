import {Resource, Car, People} from '../../../generated/aspects.interfaces';

Resource.category('local', <Resource.ImplCategories.local<Resource>>{
    name() { return this._name; }
});

Car.category('local', <Car.ImplCategories.local<Car>>{
    name() { return `${this._name} - ${this._model}` },
    model() { return this._model; }
});

People.category('local', <People.ImplCategories.local<People>>{
    birthDate() { return new Date(); }
});
