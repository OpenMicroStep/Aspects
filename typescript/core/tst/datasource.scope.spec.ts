import {ControlCenter, DataSourceInternal, VersionedObject, AspectConfiguration} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

const cc = new ControlCenter(new AspectConfiguration([
  Resource.Aspects.test1,
  Car.Aspects.test1,
  People.Aspects.test1,
]));


function parseScope(unsafe_scope: DataSourceInternal.Scope | string[]): any {
  let scope = DataSourceInternal.parseScope(unsafe_scope, function *(type){
    if (type !== '_')
      yield cc.aspectChecked(type);
    else
      yield* cc.installedAspects();
  });
  let ret = {};
  for (let t in scope.scope) {
    let tv = scope.scope[t];
    let rv = ret[t] = {};
    for (let p in tv)
      rv[p] = [...tv[p]];
  }
  return { scope: ret, sort: scope.sort };
}

function aspect_attr(type: string, attr: string) {
  let r =  cc.aspectChecked(type).attributes.get(attr);
  if (!r)
    throw new Error(`attribute ${attr} not found on ${type}`);
  return r;
}

function scope_111() {
  let r = parseScope({
    Resource: {
      '.': ['_name']
    }
  });
  assert.deepEqual<any>(r.scope, {
    Resource: {
      '.': [aspect_attr("Resource", '_name')]
    }
  });
  assert.deepEqual<any>(r.sort, []);
}

function scope_alias() {
  let r = parseScope(['_name']);
  assert.deepEqual<any>(r.scope, {
    People: {
      '.': [aspect_attr("People", '_name')]
    },
    Resource: {
      '.': [aspect_attr("Resource", '_name')]
    },
    Car: {
      '.': [aspect_attr("Car", '_name')]
    }
  });
  assert.deepEqual<any>(r.sort, []);
}

function scope_A11_113_111() {
  let r = parseScope({
    _: { ".": ['_name'] },
    People: {
      '.': ['_firstname', '_lastname', '_cars'],
    },
    Car: {
      '_cars.': ['_owner'],
    },
  });
  assert.deepEqual<any>(r.scope, {
    People: {
      ".": [aspect_attr("People", "_name"), aspect_attr("People", "_firstname"), aspect_attr("People", "_lastname"), aspect_attr("People", "_cars")],
    },
    Resource: {
      ".": [aspect_attr("Resource", "_name")],
    },
    Car: {
      ".": [aspect_attr("People", "_name")],
      "_cars.": [aspect_attr("Car", "_owner")]
    }
  });
  assert.deepEqual<any>(r.sort, []);
}

function scope_1A1_121() {
  let r = parseScope({
    People: {
      '_': ['_cars'],
    },
    Car: {
      '_cars.': ['_owner'],
    },
  });
  assert.deepEqual<any>(r.scope, {
    People: {
      ".": [aspect_attr("People", "_cars")],
      "_cars._owner.": [aspect_attr("People", "_cars")],
    },
    Car: {
      "_cars.": [aspect_attr("Car", "_owner")],
    },
  });
  assert.deepEqual<any>(r.sort, []);
}

function scope_1A1_1A1() {
  let r = parseScope({
    People: {
      '_': ['_cars'],
    },
    Car: {
      '_': ['_owner'],
    },
  });
  assert.deepEqual<any>(r.scope, {
    People: {
      "_": [aspect_attr("People", "_cars")],
      ".": [aspect_attr("People", "_cars")],
      "_owner.": [aspect_attr("People", "_cars")],
      "_cars._owner.": [aspect_attr("People", "_cars")],
    },
    Car: {
      "_": [aspect_attr("Car", "_owner")],
      ".": [aspect_attr("Car", "_owner")],
      "_cars.": [aspect_attr("Car", "_owner")],
      "_owner._cars.": [aspect_attr("Car", "_owner")],
    },
  });
  assert.deepEqual<any>(r.sort, []);
}

function scope_1A1_1A1_nocycle() {
  let r = parseScope({
    People: {
      '_': ['_cars'],
    },
    Car: {
      '_': ['_name'],
    },
  });
  assert.deepEqual<any>(r.scope, {
    People: {
      ".": [aspect_attr("People", "_cars")],
    },
    Car: {
      ".": [aspect_attr("Car", "_name")],
      "_cars.": [aspect_attr("Car", "_name")],
    },
  });
  assert.deepEqual<any>(r.sort, []);
}

function scope_on_bad_attribute() {
  assert.throw(() => {
    parseScope({
      Car: {
        '.': ['_cars']
      },
    });
  }, `'_cars' requested but not found for 'Car'`);
}

function sort_111() {
  let r = parseScope({
    Resource: {
      '.': ['+_name']
    }
  });
  assert.deepEqual<any>(r.scope, {
    Resource: {
      '.': [aspect_attr("Resource", '_name')]
    }
  });
  assert.deepEqual<any>(r.sort, [
    { asc: true, path: [aspect_attr("Resource", '_name')] }
  ]);
}

function sort_112() {
  let r = parseScope({
    People: {
      '.': ['+_name', '+#_firstname']
    }
  });
  assert.deepEqual<any>(r.scope, {
    People: {
      '.': [aspect_attr("People", '_name')]
    }
  });
  assert.deepEqual<any>(r.sort, [
    { asc: true, path: [aspect_attr("People", '_name')] },
    { asc: true, path: [aspect_attr("People", '_firstname')] },
  ]);
}

function sort_112_112() {
  let r = parseScope({
    Car: {
      '.': ['+_name', '+_owner']
    },
    People: {
      '_owner.': ['+_name', '-#_firstname']
    }
  });
  assert.deepEqual<any>(r.scope, {
    Car: {
      '.': [aspect_attr("Car", '_name'), aspect_attr("Car", '_owner')]
    },
    People: {
      '_owner.': [aspect_attr("People", '_name')]
    },
  });
  assert.deepEqual<any>(r.sort, [
    { asc: true , path: [aspect_attr("Car", '_name')] },
    { asc: true , path: [aspect_attr("Car", '_owner'), aspect_attr("People", '_name')] },
    { asc: false, path: [aspect_attr("Car", '_owner'), aspect_attr("People", '_firstname')] },
  ]);
}

function sort_211() {
  let r = parseScope({
    Car: {
      '.': ['+_name']
    },
    People: {
      '.': ['+_name']
    }
  });
  assert.deepEqual<any>(r.scope, {
    Car: {
      '.': [aspect_attr("Car", '_name')]
    },
    People: {
      '.': [aspect_attr("People", '_name')]
    },
  });
  assert.deepEqual<any>(r.sort, [
    { asc: true , path: [aspect_attr("Car", '_name')] },
  ]);
}

function sort_on__() {
  assert.throw(() => {
    parseScope({
      Car: {
        '_': ['+_name']
      },
    });
  }, `sort is forbidden on '_' paths`);
}

function sort_on_sub() {
  assert.throw(() => {
    parseScope({
      Car: {
        '.': ['_owner']
      },
      People: {
        '_owner.': ['+_name']
      },
    });
  }, `sort is forbidden on '_owner.' path`);
}

function sort_on_mult() {
  assert.throw(() => {
    parseScope({
      People: {
        '.': ['+_cars']
      },
    });
  }, `cannot sort on '_cars' (multiple values)`);
}

function sort_compatible() {
  let r = parseScope({
    People: {
      '.': ['+_name']
    },
    Car: {
      '.': ['+_name']
    },
  });
  assert.deepEqual<any>(r.scope, {
    Car: {
      '.': [aspect_attr("Car", '_name')]
    },
    People: {
      '.': [aspect_attr("People", '_name')]
    },
  });
  assert.deepEqual<any>(r.sort, [
    { asc: true , path: [aspect_attr("Car", '_name')] },
  ]);
}

function sort_incompatible() {
  assert.throw(() => {
    parseScope({
      People: {
        '.': ['+_firstname']
      },
      Car: {
        '.': ['+_name']
      },
    });
  }, `incompatible sorts`);
  assert.throw(() => {
    parseScope({
      People: {
        '.': ['+_name', '+_lastname']
      },
      Car: {
        '.': ['+_name']
      },
    });
  }, `incompatible sort count`);
}

export const tests = { name: 'DataSource.parseScope', tests: [
  scope_111,
  scope_alias,
  scope_A11_113_111,
  scope_1A1_121,
  scope_1A1_1A1,
  scope_1A1_1A1_nocycle,
  scope_on_bad_attribute,
  sort_111,
  sort_112,
  sort_112_112,
  sort_211,
  sort_on__,
  sort_on_sub,
  sort_on_mult,
  sort_compatible,
  sort_incompatible,
]};
