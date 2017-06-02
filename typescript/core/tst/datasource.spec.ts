import {ControlCenter, DataSource, DataSourceInternal, VersionedObject, AspectCache, Aspect} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import {tests as tests_memory} from './datasource.memory.spec';
import ConstraintType = DataSourceInternal.ConstraintType;

const cache = new AspectCache();
let aspects = {
  Resource: cache.cachedAspect("test1", Resource).aspect,
  Car     : cache.cachedAspect("test1", Car     ).aspect,
  People  : cache.cachedAspect("test1", People  ).aspect,
}
function findAspect(name: string): Aspect.Installed {
  return aspects[name];
}

function serialize(s, map = new Map()) {
  let r = s;
  if (typeof s === "object") {
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
  /*else if (typeof s === "function") {
    r = s.aspect ? s.aspect.name : s.name;
  }*/
  return r;
}

function parseRequest(req) {
  let sets = DataSourceInternal.parseRequest(req, findAspect);
  return sets.map(s => serialize(s));
}

function simple_resources() {
  let sets = parseRequest({
    name: "resources",
    where: { $instanceOf: Resource, _name: "Test" },
    sort: [ '+_name'],
    scope: ['_name'],
  });
  assert.deepEqual<any>(sets, [
    {
      _name: "resources",
      type: ConstraintType.InstanceOf,
      aspect: "Resource",
      constraints: [
        { type: ConstraintType.Equal, attribute: "_name", value: "Test" },
      ],
      subs: undefined,
      variables: undefined,
      name: "resources",
      sort: [ '+_name'],
      scope: ['_name'],
    }
  ]);
}

function multi_resources() {
  let sets = parseRequest({
    results: [{
      name: "resources",
      where: { $instanceOf: Resource, _name: "Test" },
      sort: [ '+_name'],
      scope: ['_name']
    }]
  });
  assert.deepEqual<any>(sets, [
    {
      _name: "resources",
      type: ConstraintType.InstanceOf,
      aspect: "Resource",
      constraints: [
        { type: ConstraintType.Equal, attribute: "_name", value: "Test" },
      ],
      subs: undefined,
      variables: undefined,
      name: "resources",
      sort: [ '+_name'],
      scope: ['_name'],
    }
  ]);
}
function set_resources() {
  let sets = parseRequest({
    "resources=": { $instanceOf: Resource, _name: { $eq: "Test" } },
    results: [{
      name: "resources",
      where: "=resources",
      sort: [ '+_name'],
      scope: ['_name']
    }]
  });
  assert.deepEqual<any>(sets, [
    {
      _name: "resources",
      type: ConstraintType.InstanceOf,
      aspect: "Resource",
      constraints: [
        { type: ConstraintType.Equal, attribute: "_name", value: "Test" },
      ],
      subs: undefined,
      variables: undefined,
      name: "resources",
      sort: [ '+_name'],
      scope: ['_name'],
    }
  ]);
}

function set_persons1_p() {
  let p: any = {
    _name: "p",
    type: ConstraintType.InstanceOf,
    aspect: "People",
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
    ],
    subs: undefined,
    variables: [],
    name: "peoples1",
    scope: ['_firstname', '_lastname'],
    sort: undefined,
  }
  let c: any = {
    _name: "c",
    type: ConstraintType.InstanceOf,
    aspect: "Car",
    constraints: [],
    subs: undefined,
    variables: undefined,
    name: undefined,
    scope: undefined,
    sort: undefined,
  }
  p.variables.push(["p", p]);
  p.variables.push(["c", c]);
  return p;
}

function set_persons2_C_owner() {
  let persons2_C_owner: any = {
    _name: "persons2",
    type: ConstraintType.InstanceOf,
    aspect: "People",
    constraints: [
      { type: ConstraintType.And, prefix: "C._owner.", value: [
        { type: ConstraintType.Equal, leftVariable: "C", leftAttribute: "_owner", rightVariable: "C._owner", rightAttribute: "_id" },
      ] },
    ],
    subs: undefined,
    variables: [],
    name: "peoples2",
    scope: ['_firstname', '_lastname', '_birthDate'],
    sort: undefined,
  }
  let persons2_C: any = {
    _name: "C",
    type: ConstraintType.InstanceOf,
    aspect: "Car",
    subs: undefined,
    constraints: [],
    variables: undefined,
    name: undefined, scope: undefined, sort: undefined,
  };
  persons2_C_owner.variables.push(["C._owner.C", persons2_C]);
  persons2_C_owner.variables.push(["C._owner.C._owner", persons2_C_owner]);
  return persons2_C_owner;
}
function persons_with_cars() {
  let sets = parseRequest({
    "C=": { $instanceOf: Car },
    "P=": { $instanceOf: People },
    "persons1=": {
      $out: "=p",
      "p=": { $elementOf: "=P" },
      "c=": { $elementOf: "=C" },
      "=c._owner": { $eq: "=p" },
    },
    name: "peoples1",
    where: "=persons1",
    scope: ['_firstname', '_lastname'],
  });
  let p = set_persons1_p();
  assert.deepEqual<any>(sets, [p]);
}

function persons_and_their_cars() {
  let sets = parseRequest({
    "C=": { $instanceOf: Car },                             // Soit C l'ensemble des objets Car
    "persons=": { $instanceOf: People },                    // Soit persons l'ensemble des objets People
    "cars=": {
      "c=": { $elementOf: "=C" },
      "p=": { $elementOf: "=persons" },
      "=c._owner": { $eq: "=p" },
      $out: "=c"
    },
    name: "union",
    where: { $union: ["=cars", "=persons"] },
    scope: ['_firstname', '_lastname', '_owner', '_cars'],
  });
  let persons: any = {
    _name: "persons",
    type: ConstraintType.InstanceOf,
    aspect: "People",
    constraints: [],
    subs: undefined,
    variables: undefined,
    name: undefined,
    scope: undefined,
    sort: undefined,
  }
  let p: any = {
    _name: "p",
    type: ConstraintType.InstanceOf,
    aspect: "People",
    constraints: [],
    subs: undefined,
    variables: undefined,
    name: undefined,
    scope: undefined,
    sort: undefined,
  }
  let c: any = {
    _name: "c",
    type: ConstraintType.InstanceOf,
    aspect: "Car",
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
    ],
    subs: undefined,
    variables: [],
    name: undefined,
    scope: undefined,
    sort: undefined,
  }
  c.variables.push(["c", c]);
  c.variables.push(["p", p]);

  assert.deepEqual<any>(sets, [
    {
      _name: "union",
      type: ConstraintType.UnionOf,
      aspect: [c, persons],
      constraints: [],
      subs: undefined,
      variables: undefined,
      name: "union",
      scope: ['_firstname', '_lastname', '_owner', '_cars'],
      sort: undefined,
    }
  ]);
}

function persons_with_cars_intersection() {
  let sets = parseRequest({
    // Soit P l'ensemble des objets People
    "P=": { $instanceOf: People },
    // Soit C l'ensemble des objets Car
    "C=": { $instanceOf: Car },
    // Soit persons les objets p de P tel que pour c dans C il existe c._owner = p
    "persons2=": { $intersection: ["=P", "=C:_owner"] },
    results: [
      { name: "peoples2", where: "=persons2", scope: ['_firstname', '_lastname', '_birthDate'] },
    ]
  });
  let persons2_C_owner = set_persons2_C_owner();
  assert.deepEqual<any>(sets, [persons2_C_owner]);
}

function persons_with_cars_and_their_cars() {
  let sets = parseRequest({
    // Soit P l'ensemble des objets People
    "P=": { $instanceOf: People },
    // Soit C l'ensemble des objets Car
    "C=": { $instanceOf: Car },
    // Soit persons les objets p de P tel que pour c dans C il existe c._owner = p
    "persons=": { $intersection: ["=P", "=C:_owner"] },
    // Soit cars les objets c de C tel que pour p dans P il existe c._owner = p
    "cars=":    {
      "c=": { $elementOf: "=C" },
      "p=": { $elementOf: "=persons" },
      "=c._owner": { $eq: "=p" },
      $out: "=c"
    },
    results: [
      { name: "cars"   , where: "=cars"   , scope: ['_owner']                           },
      { name: "persons", where: "=persons", scope: ['_firstname', '_lastname', '_cars'] },
    ]
  });
  let C_owner: any = {
    _name: "persons",
    type: ConstraintType.InstanceOf,
    aspect: "People",
    constraints: [
      { type: ConstraintType.And, prefix: "C._owner.", value: [
        { type: ConstraintType.Equal, leftVariable: "C", leftAttribute: "_owner", rightVariable: "C._owner", rightAttribute: "_id" },
      ] },
    ],
    subs: undefined,
    variables: [],
    name: "persons",
    scope: ['_firstname', '_lastname', '_cars'],
    sort: undefined,
  }
  let C: any = {
    _name: "C",
    type: ConstraintType.InstanceOf,
    aspect: "Car",
    subs: undefined,
    constraints: [],
    variables: undefined,
    name: undefined,
    scope: undefined,
    sort: undefined,
  };
  C_owner.variables.push(["C._owner.C", C]);
  C_owner.variables.push(["C._owner.C._owner", C_owner]);

  let p: any = {
    _name: "p",
    type: ConstraintType.InstanceOf,
    aspect: "People",
    constraints: [
      { type: ConstraintType.And, prefix: "persons.", value: [
        { type: ConstraintType.And, prefix: "C._owner.", value: [
          { type: ConstraintType.Equal, leftVariable: "C", leftAttribute: "_owner", rightVariable: "C._owner", rightAttribute: "_id" },
        ] },
      ] },
    ],
    subs: undefined,
    variables: [],
    name: undefined,
    scope: undefined,
    sort: undefined,
  }
  p.variables.push(["persons.C._owner.C", C]);
  p.variables.push(["persons.C._owner.C._owner", p]);

  let c: any = {
    _name: "c",
    type: ConstraintType.InstanceOf,
    aspect: "Car",
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
    ],
    subs: undefined,
    variables: [],
    name: "cars",
    scope: ['_owner'],
    sort: undefined,
  }
  c.variables.push(["c", c]);
  c.variables.push(["p", p]);

  assert.deepEqual<any>(sets, [c, C_owner]);
}

function set_cars2_c() {
  let cars2_persons1_p: any = {
    _name: "p",
    type: ConstraintType.InstanceOf,
    aspect: "People",
    constraints: [
      { type: ConstraintType.And, prefix: "p.", value: [
        { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
      ]},
    ],
    subs: undefined,
    variables: [],
    name: undefined, scope: undefined, sort: undefined,
  }
  let cars2_persons1_c: any = {
    _name: "c",
    type: ConstraintType.InstanceOf,
    aspect: "Car",
    constraints: [],
    subs: undefined,
    variables: undefined,
    name: undefined, scope: undefined, sort: undefined,
  }
  cars2_persons1_p.variables.push(["p.p", cars2_persons1_p]);
  cars2_persons1_p.variables.push(["p.c", cars2_persons1_c]);

  let cars2_c: any = {
    _name: "c",
    type: ConstraintType.InstanceOf,
    aspect: "Car",
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
    ],
    subs: undefined,
    variables: [],
    name: "cars2",
    scope: ['_name', '_owner', '_model'],
    sort: undefined,
  }
  cars2_c.variables.push(["c", cars2_c]);
  cars2_c.variables.push(["p", cars2_persons1_p]);
  return cars2_c;
}
function persons_cars_sub() {
  let sets = parseRequest({
    "C=": { $instanceOf: Car },
    "P=": { $instanceOf: People },
    "persons1=": {
      $out: "=p",
      "p=": { $elementOf: "=P" },
      "c=": { $elementOf: "=C" },
      "=c._owner": { $eq: "=p" },
    },
    "cars2=": {
      $out: "=c",
      "p=": { $elementOf: "=persons1" },
      "c=": { $elementOf: "=C" },
      "=c._owner": { $eq: "=p" },
    },
    results: [
      { name: "cars2", where: "=cars2", scope: ['_name', '_owner', '_model']             },
    ]
  });
  let cars2_c = set_cars2_c();
  assert.deepEqual<any>(sets, [cars2_c]);
}
function persons_mixed() {
  let sets = parseRequest({
    "C=": { $instanceOf: Car },
    "P=": { $instanceOf: People },
    "persons1=": {
      $out: "=p",
      "p=": { $elementOf: "=P" },
      "c=": { $elementOf: "=C" },
      "=c._owner": { $eq: "=p" },
    },
    "persons2=": { $intersection: ["=C:_owner", "=P"] },
    "cars1=": {
      $out: "=c",
      "p=": { $elementOf: "=P" },
      "c=": { $elementOf: "=C" },
      "=c._owner": { $eq: "=p" },
    },
    "cars2=": {
      $out: "=c",
      "p=": { $elementOf: "=persons1" },
      "c=": { $elementOf: "=C" },
      "=c._owner": { $eq: "=p" },
    },
    results: [
      { name: "peoples1", where: "=persons1", scope: ['_firstname', '_lastname'] },
      { name: "peoples2", where: "=persons2", scope: ['_firstname', '_lastname', '_birthDate'] },
      { name: "cars1"   , where: "=cars1"   , scope: ['_name', '_owner']             },
      { name: "cars2"   , where: "=cars2"   , scope: ['_name', '_owner', '_model']             },
    ]
  });

  // persons1
  let persons1_p = set_persons1_p();
  let persons2_C_owner = set_persons2_C_owner();

  // cars1
  let cars1_p: any = {
    _name: "p",
    type: ConstraintType.InstanceOf,
    aspect: "People",
    constraints: [],
    subs: undefined,
    variables: undefined,
    name: undefined, scope: undefined, sort: undefined,
  }
  let cars1_c: any = {
    _name: "c",
    type: ConstraintType.InstanceOf,
    aspect: "Car",
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
    ],
    subs: undefined,
    variables: [],
    name: "cars1",
    scope: ['_name', '_owner'],
    sort: undefined,
  }
  cars1_c.variables.push(["c", cars1_c]);
  cars1_c.variables.push(["p", cars1_p]);

  // cars2
  let cars2_c = set_cars2_c();
  assert.deepEqual<any>(sets, [persons1_p, persons2_C_owner, cars1_c, cars2_c]);
}

function persons_with_cars_and_their_cars_1k() { // about 170ms
  let i = 1e4;
  while (i-- > 0) {
    DataSourceInternal.parseRequest({
      // Soit P l'ensemble des objets People
      "P=": { $instanceOf: People },
      // Soit C l'ensemble des objets Car
      "C=": { $instanceOf: Car },
      // Soit persons les objets p de P tel que pour c dans C il existe c._owner = p
      "persons=": { $intersection: ["=P", "=C:_owner"] },
      // Soit cars les objets c de C tel que pour p dans P il existe c._owner = p
      "cars=":    {
        "c=": { $elementOf: "=C" },
        "p=": { $elementOf: "=persons" },
        "=c._owner": { $eq: "=p" },
        $out: "=c"
      },
      results: [
        { name: "cars", where: "=cars", scope: ['_firstname', '_lastname', '_cars'] },
        { name: "persons", where: "=persons", scope: ['_owner'] },
      ]
    }, findAspect);
  }
}

function makeObjects() {
  let cc = new ControlCenter();
  let C = Car.installAspect(cc, 'test1');
  let P = People.installAspect(cc, 'test1');
  let objects: VersionedObject[] = [];
  objects.push(Object.assign(new C(), { _name: "Renault", _model: "Clio 3" }));
  objects.push(Object.assign(new C(), { _name: "Renault", _model: "Clio 2" }));
  objects.push(Object.assign(new C(), { _name: "Peugeot", _model: "3008 DKR" }));
  objects.push(Object.assign(new P(), { _name: "Lisa Simpsons", _firstname: "Lisa", _lastname: "Simpsons" }));
  objects.push(Object.assign(new P(), { _name: "Bart Simpsons", _firstname: "Bart", _lastname: "Simpsons" }));
  return objects;
}
function applyWhere() {
  let objects = makeObjects();
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: Car }, objects, findAspect), objects.slice(0, 3));
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: Car, _name: "Renault" }, objects, findAspect), objects.slice(0, 2));
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: People }, objects, findAspect), objects.slice(3, 5));
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: People, _firstname: "Lisa" }, objects, findAspect), objects.slice(3, 4));
}

function applyRequest() {
  let objects = makeObjects();
  assert.deepEqual(DataSourceInternal.applyRequest(
    { name: "cars", where: { $instanceOf: Car } }, objects, findAspect), 
    { cars: objects.slice(0, 3) });
  assert.deepEqual(DataSourceInternal.applyRequest(
    { name: "Renaults", where: { $instanceOf: Car, _name: "Renault" } }, objects, findAspect), 
    { Renaults: objects.slice(0, 2) });
  assert.deepEqual(DataSourceInternal.applyRequest(
    { 
      "cars=": { $instanceOf: Car },
      "renaults=": { _name: "Renault", $in: "=cars" },
      results: [
        { name: "renaults", where: "=renaults" },
        { name: "cars", where: "=cars" }
      ]
    }, objects, findAspect), 
    { renaults: objects.slice(0, 2), cars: objects.slice(0, 3) });
}

export const tests = { name: 'DataSource', tests: [
  { name: "objectset", tests: [
    simple_resources,
    multi_resources,
    set_resources,
    persons_with_cars,
    persons_with_cars_intersection,
    persons_and_their_cars,
    persons_with_cars_and_their_cars,
    persons_cars_sub,
    persons_mixed,
  ]},
  applyWhere,
  applyRequest,
  { name: "perfs", tests: [
    persons_with_cars_and_their_cars_1k,
  ]},
  tests_memory,
]};