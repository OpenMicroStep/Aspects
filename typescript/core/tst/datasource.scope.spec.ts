import {ControlCenter, DataSource, DataSourceInternal, VersionedObject, AspectCache, Aspect} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import ConstraintType = DataSourceInternal.ConstraintType;
import ObjectSet = DataSourceInternal.ObjectSet;

const cache = new AspectCache();
const cc = new ControlCenter(cache);
Resource.installAspect(cc, "test1");
Car.installAspect(cc, "test1");
People.installAspect(cc, "test1");

function serialize(s, map = new Map()) {
  let r = s;
  if (s && typeof s === "object") {
    r = map.get(s);
    if (!r) {
      if (s instanceof VersionedObject)
        s = `VersionedObject{${s.manager().aspect().name}/${s.id()}}`;
      if (s instanceof Map)
        s = [...s.entries()];
      if (s instanceof Set)
        s = [...s];
      if (Array.isArray(s)) {
        map.set(s, r = []);
        s.forEach(e => r.push(serialize(e, map)));
      }
      else if (s.aspect && s.name && s.attributes)
        map.set(s, r = { aspect: s.aspect, name: s.name });
      else {
        let k, v;
        map.set(s, r = {});
        for (k in s) {
          v = s[k];
          r[k] = serialize(v, map);
        }
        if (r.aspect && typeof r.aspect.name === "string")
          r.aspect = r.aspect.name;
        if (typeof r.leftAttribute === "object")
          r.leftAttribute = r.leftAttribute.name;
        if (typeof r.rightAttribute === "object")
          r.rightAttribute = r.rightAttribute.name;
        if (typeof r.attribute === "object")
          r.attribute = r.attribute.name;
      }
    }
  }
  return r;
}

function parseScope(unsafe_scope: DataSourceInternal.Scope | string[]) {
  return serialize(DataSourceInternal.parseScope(unsafe_scope, function *(type){
    if (type !== '_')
      yield cc.aspectChecked(type);
    else
      yield* cc.installedAspects();
  }));
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
      "_": [aspect_attr("People", "_cars")],
      ".": [aspect_attr("People", "_cars")],
      "_cars._owner.": [aspect_attr("People", "_cars")],
    },
    Car: {
      "_cars.": [aspect_attr("Car", "_owner")],
    },
  });
  assert.deepEqual<any>(r.sort, []);
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

export const tests = { name: 'DataSource.parseScope', tests: [
  scope_111,
  scope_alias,
  scope_A11_113_111,
  scope_1A1_121,
  sort_111,
  sort_112,
  sort_112_112,
  sort_211,
]};
