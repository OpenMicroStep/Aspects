import {Resource} from '../../../generated/aspects.interfaces';

Resource.category('local', <Resource.ImplCategories.local<Resource>>{
    name() { return this._name; }
});
