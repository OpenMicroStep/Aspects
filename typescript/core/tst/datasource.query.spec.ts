import {ControlCenter, DataSourceInternal, VersionedObject, AspectConfiguration, AspectSelection} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import ConstraintType = DataSourceInternal.ConstraintType;
import ObjectSet = DataSourceInternal.ObjectSet;

const cc = new ControlCenter(new AspectConfiguration(new AspectSelection([
  Resource.Aspects.test1,
  Car.Aspects.test1,
  People.Aspects.test1,
])));

function aspect_attr(type: string, attr: string) {
  let r =  cc.aspectChecked(type).attributes.get(attr);
  if (!r)
    throw new Error(`attribute ${attr} not found on ${type}`);
  return r;
}

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
      else if ("contains_vo" in s)
        map.set(s, r = s);
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

function parseRequest(req) {
  let sets = DataSourceInternal.parseRequest(req, cc);
  return sets.map(s => serialize(s));
}

function resources_sets() {
  return [
    Object.assign(new ObjectSet("resources"), {
      typeConstraints: [
        { type: ConstraintType.InstanceOf, value: { name: "Resource", aspect: "test1" } },
      ],
      constraints: [
        { type: ConstraintType.Equal, leftVariable: "resources", leftAttribute: "_name", value: "Test" },
      ],
      name: "resources",
      sort: [],
      scope: {
        Resource: {
          ".": [aspect_attr("Resource", "_name")],
        }
      },
    })
  ];
}

function simple_resources() {
  let sets = parseRequest({
    name: "resources",
    where: { $instanceOf: Resource, _name: "Test" },
    scope: ['_name'],
  });
  assert.deepEqual<any>(sets, resources_sets());
}

function multi_resources() {
  let sets = parseRequest({
    results: [{
      name: "resources",
      where: { $instanceOf: Resource, _name: "Test" },
      scope: ['_name']
    }]
  });
  assert.deepEqual<any>(sets, resources_sets());
}
function set_resources() {
  let sets = parseRequest({
    "resources=": { $instanceOf: Resource, _name: { $eq: "Test" } },
    results: [{
      name: "resources",
      where: "=resources",
      scope: ['_name']
    }]
  });
  assert.deepEqual<any>(sets, resources_sets());
}
function ind1_resources() {
  let sets = parseRequest({
    "resources0=": { $instanceOf: Resource, _name: { $eq: "Test" } },
    "resources1=": {
      $out: "=r",
      "r=": { $elementOf: "=resources0" },
    },
    results: [{
      name: "resources",
      where: "=resources1",
      scope: ['_name']
    }]
  });
  let r = Object.assign(new ObjectSet("r"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Resource", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "resources0", leftAttribute: "_name", value: "Test" },
    ],
    variables: [] as [string, ObjectSet][],
    name: "resources",
    sort: [],
    scope: {
      Resource: {
        ".": [aspect_attr("Resource", "_name")],
      }
    },
  });
  r.variables.push(["resources0", r]);
  assert.deepEqual<any>(sets, [r]);
}
function ind2_resources() {
  let sets = parseRequest({
    "resources0=": { $instanceOf: Resource, _name: { $eq: "Test" } },
    "resources1=": {
      $out: "=r0",
      "r0=": { $elementOf: "=resources0" },
      "r1=": { $elementOf: "=resources0" },
      "=r0._name": "=r1._name",
    },
    results: [{
      name: "resources",
      where: "=resources1",
      scope: {
        Resource: {
          ".": ["_name"],
        }
      },
    }]
  });
  let r1 = Object.assign(new ObjectSet("r1"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Resource", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "resources0", leftAttribute: "_name", value: "Test" },
    ],
    variables: [] as [string, ObjectSet][],
  });
  let r0 = Object.assign(new ObjectSet("r0"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Resource", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "resources0", leftAttribute: "_name", value: "Test" },
      { type: ConstraintType.Equal, leftVariable: "r0", leftAttribute: "_name", rightVariable: "r1", rightAttribute: "_name" },
    ],
    variables: [] as [string, ObjectSet][],
    name: "resources",
    sort: [],
    scope: {
      Resource: {
        ".": [aspect_attr("Resource", "_name")],
      }
    },
  });
  r1.variables.push(["resources0", r1]);
  r0.variables.push(["resources0", r0]);
  r0.variables.push(["r1", r1]);
  assert.deepEqual<any>(sets, [r0]);
}
function or_and() {
  let sets = parseRequest({
    "resources=": { $instanceOf: "Resource", $or: [{ _name: { $eq: "Test1" } }, { _name: { $eq: "Test2" } }] },
    results: [{
      name: "resources",
      where: "=resources",
      scope: ['_name']
    }]
  });
  assert.deepEqual(sets, [
    Object.assign(new ObjectSet("resources"), {
      typeConstraints: [
        { type: ConstraintType.InstanceOf, value: { name: "Resource", aspect: "test1" } },
      ],
      constraints: [
        { type: ConstraintType.Or, prefix: "", value: [
          { type: ConstraintType.Equal, leftVariable: "resources", leftAttribute: "_name", value: "Test1" },
          { type: ConstraintType.Equal, leftVariable: "resources", leftAttribute: "_name", value: "Test2" },
        ]}
      ],
      name: "resources",
      sort: [],
      scope: {
        Resource: {
          ".": [aspect_attr("Resource", "_name")],
        }
      },
    })
  ]);
}
function no_instanceof_all() {
  let sets = parseRequest({
    "resources=": { _name: { $eq: "Test" } },
    results: [{
      name: "resources",
      where: "=resources",
      scope: ['_name']
    }]
  });
  assert.deepEqual(sets, [
    Object.assign(new ObjectSet("resources"), {
      typeConstraints: [],
      constraints: [
        { type: ConstraintType.Equal, leftVariable: "resources", leftAttribute: "_name", value: "Test" },
      ],
      name: "resources",
      sort: [],
      scope: {
        Car: {
          ".": [aspect_attr("Car", "_name")],
        },
        People: {
          ".": [aspect_attr("People", "_name")],
        },
        Resource: {
          ".": [aspect_attr("Resource", "_name")],
        },
      },
    })
  ]);
}
function no_instanceof_where_model() {
  let sets = parseRequest({
    "resources=": { _model: { $eq: "Test" } },
    results: [{
      name: "resources",
      where: "=resources",
      scope: ['_name']
    }]
  });
  assert.deepEqual(sets, [
    Object.assign(new ObjectSet("resources"), {
      typeConstraints: [],
      constraints: [
        { type: ConstraintType.Equal, leftVariable: "resources", leftAttribute: "_model", value: "Test" },
      ],
      name: "resources",
      sort: [],
      scope: {
        Car: {
          ".": [aspect_attr("Car", "_name")],
        },
      },
    })
  ]);
}
function no_instanceof_scope_model() {
  assert.throw(() => parseRequest({
    "resources=": { _name: { $eq: "Test" } },
    results: [{
      name: "resources",
      where: "=resources",
      scope: ['_model']
    }]
  }), `'_model' requested but not found for 'Resource'`);
}

function recursion() {
  let sets = parseRequest({
    "X=": { $instanceOf: "Resource", _id: 0 },
    "Y=": { $instanceOf: "Resource" },
    "resources=": {
      $unionForAlln: "=U(n)",
      "U(0)=": "=X",
      "U(n + 1)=": {
        $out: "=y",
        "x=": { $elementOf: "=U(n)" },
        "y=": { $elementOf: "=Y" },
        "=y.parent": { $eq: "=x" },
      }
    },
    results: [{
      name: "resources",
      where: "=resources",
      scope: ['_name']
    }]
  });
  let u_0 = Object.assign(new ObjectSet("X"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Resource", aspect: "test1" } }
    ],
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "X", leftAttribute: "_id", value: 0 },
    ],
  });
  let u_n = Object.assign(new ObjectSet("U(n)"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Resource", aspect: "test1" } }
    ],
  });
  u_n.typeConstraints.unshift({ type: ConstraintType.Recursion, value: u_n });
  let u_np1: any = Object.assign(new ObjectSet("y"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Resource", aspect: "test1" } }
    ],
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "y", leftAttribute: "parent", rightVariable: "x", rightAttribute: "_id" },
    ],
    variables: [],
  });
  let x = Object.assign(new ObjectSet("x"), {
    typeConstraints: [
      { type: ConstraintType.Recursion, value: u_n },
      { type: ConstraintType.InstanceOf, value: { name: "Resource", aspect: "test1" } }
    ],
  });
  u_np1.variables.push(["x", x]);
  assert.deepEqual(sets, [
    Object.assign(new ObjectSet("resources"), {
      typeConstraints: [
        { type: ConstraintType.UnionOfAlln, value: [u_0, u_n, u_np1] }
      ],
      constraints: [],
      name: "resources",
      sort: [],
      scope: {
        Resource: {
          ".": [aspect_attr("Resource", "_name")],
        }
      },
    })
  ]);
}

function set_persons1_p() {
  let p: any = Object.assign(new ObjectSet("p"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "People", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
    ],
    variables: [],
    name: "peoples1",
    sort: [],
    scope: {
      People: {
        ".": [aspect_attr("People", "_firstname"), aspect_attr("People", "_lastname")],
      }
    },
  });
  let c: any = Object.assign(new ObjectSet("c"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Car", aspect: "test1" } },
    ],
  });
  p.variables.push(["c", c]);
  return p;
}

function set_persons2_C_owner() {
  let persons2_C_owner: any = Object.assign(new ObjectSet("persons2"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "People", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.And, prefix: "C._owner.", value: [
        { type: ConstraintType.Equal, leftVariable: "C", leftAttribute: "_owner", rightVariable: "C._owner", rightAttribute: "_id" },
      ] },
    ],
    variables: [],
    name: "peoples2",
    sort: [],
    scope: {
      People: {
        ".": [aspect_attr("People", "_firstname"), aspect_attr("People", "_lastname"), aspect_attr("People", "_birthDate")],
      },
    }
  });
  let persons2_C: any = Object.assign(new ObjectSet("C"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Car", aspect: "test1" } },
    ],
  });
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
    scope: {
      _: { ".": ['_name'] },
      People: {
        '.': ['_firstname', '_lastname', '_cars'],
      },
      Car: {
        '_cars.': ['_owner'],
      },
    },
  });
  let persons: any = Object.assign(new ObjectSet("persons"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "People", aspect: "test1" } },
    ],
  });
  let p: any = Object.assign(new ObjectSet("p"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "People", aspect: "test1" } },
    ],
  });
  let c: any = Object.assign(new ObjectSet("c"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Car", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
    ],
    variables: [],
  });
  c.variables.push(["p", p]);

  assert.deepEqual<any>(sets, [
    Object.assign(new ObjectSet("union"), {
      typeConstraints: [
        { type: ConstraintType.UnionOf, value: [c, persons] },
      ],
      name: "union",
      sort: [],
      scope: {
        People: {
          ".": [aspect_attr("People", "_name"), aspect_attr("People", "_firstname"), aspect_attr("People", "_lastname"), aspect_attr("People", "_cars")],
        },
        Car: {
          ".": [aspect_attr("People", "_name")],
          "_cars.": [aspect_attr("Car", "_owner")]
        }
      }
    })
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
  let C_owner: any = Object.assign(new ObjectSet("persons"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "People", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.And, prefix: "C._owner.", value: [
        { type: ConstraintType.Equal, leftVariable: "C", leftAttribute: "_owner", rightVariable: "C._owner", rightAttribute: "_id" },
      ] },
    ],
    variables: [],
    name: "persons",
    sort: [],
    scope: {
      People: {
        ".": [aspect_attr("People", "_firstname"), aspect_attr("People", "_lastname"), aspect_attr("People", "_cars")],
      },
    },
  });
  let C: any = Object.assign(new ObjectSet("C"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Car", aspect: "test1" } },
    ],
  });
  C_owner.variables.push(["C._owner.C", C]);
  C_owner.variables.push(["C._owner.C._owner", C_owner]);

  let p: any = Object.assign(new ObjectSet("p"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "People", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.And, prefix: "persons.", value: [
        { type: ConstraintType.And, prefix: "C._owner.", value: [
          { type: ConstraintType.Equal, leftVariable: "C", leftAttribute: "_owner", rightVariable: "C._owner", rightAttribute: "_id" },
        ] },
      ] },
    ],
    variables: [],
  });
  p.variables.push(["persons.C._owner.C", C]);
  p.variables.push(["persons.C._owner.C._owner", p]);
  p.variables.push(["persons.persons", p]);

  let c: any = Object.assign(new ObjectSet("c"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Car", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
    ],
    variables: [],
    name: "cars",
    sort: [],
    scope: {
      Car: {
        ".": [aspect_attr("Car", "_owner")]
      },
    },
  });
  c.variables.push(["p", p]);

  assert.deepEqual<any>(sets, [c, C_owner]);
}

function set_cars2_c() {
  let cars2_persons1_p: any = Object.assign(new ObjectSet("p"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "People", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.And, prefix: "p.", value: [
        { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
      ]},
    ],
    variables: []
  });
  let cars2_persons1_c: any = Object.assign(new ObjectSet("c"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Car", aspect: "test1" } },
    ],
  });
  cars2_persons1_p.variables.push(["p.c", cars2_persons1_c]);
  cars2_persons1_p.variables.push(["p.p", cars2_persons1_p]);

  let cars2_c: any = Object.assign(new ObjectSet("c"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Car", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
    ],
    variables: [],
    name: "cars2",
    sort: [],
    scope: {
      Car: {
        ".": [aspect_attr("Car", "_name"), aspect_attr("Car", "_owner"), aspect_attr("Car", "_model")],
      },
    },
  });
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
  let cars1_p: any = Object.assign(new ObjectSet("p"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "People", aspect: "test1" } },
    ],
  });
  let cars1_c: any = Object.assign(new ObjectSet("c"), {
    typeConstraints: [
      { type: ConstraintType.InstanceOf, value: { name: "Car", aspect: "test1" } },
    ],
    constraints: [
      { type: ConstraintType.Equal, leftVariable: "c", leftAttribute: "_owner", rightVariable: "p", rightAttribute: "_id" },
    ],
    variables: [],
    name: "cars1",
    sort: [],
    scope: {
      Car: {
        ".": [aspect_attr("Car", "_name"), aspect_attr("Car", "_owner")]
      }
    },
  });
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
        { name: "cars", where: "=cars", scope: ['_owner'] },
        { name: "persons", where: "=persons", scope: ['_firstname', '_lastname', '_cars'] },
      ]
    }, cc);
  }
}

function makeObjects() {
  let cc = new ControlCenter(new AspectConfiguration(new AspectSelection([
    Car.Aspects.test1,
    People.Aspects.test1,
  ])));
  let C = Car.Aspects.test1.factory(cc);
  let P = People.Aspects.test1.factory(cc);
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
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: Car }, objects, cc), objects.slice(0, 3));
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: Car, _name: "Renault" }, objects, cc), objects.slice(0, 2));
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: People }, objects, cc), objects.slice(3, 5));
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: People, _firstname: "Lisa" }, objects, cc), objects.slice(3, 4));
}

function applyRequest() {
  let objects = makeObjects();
  assert.deepEqual(DataSourceInternal.applyRequest(
    { name: "cars", where: { $instanceOf: Car } }, objects, cc),
    { cars: objects.slice(0, 3) });
  assert.deepEqual(DataSourceInternal.applyRequest(
    { name: "Renaults", where: { $instanceOf: Car, _name: "Renault" } }, objects, cc),
    { Renaults: objects.slice(0, 2) });
  assert.deepEqual(DataSourceInternal.applyRequest(
    {
      "cars=": { $instanceOf: Car },
      "renaults=": { _name: "Renault", $in: "=cars" },
      results: [
        { name: "renaults", where: "=renaults" },
        { name: "cars", where: "=cars" }
      ]
    }, objects, cc),
    { renaults: objects.slice(0, 2), cars: objects.slice(0, 3) });
}

export const tests = { name: 'DataSource.request', tests: [
  { name: "parseRequest", tests: [
    simple_resources,
    multi_resources,
    set_resources,
    ind1_resources,
    ind2_resources,
    or_and,
    no_instanceof_all,
    no_instanceof_where_model,
    no_instanceof_scope_model,
    recursion,
    persons_with_cars,
    persons_with_cars_intersection,
    persons_and_their_cars,
    persons_with_cars_and_their_cars,
    persons_cars_sub,
    persons_mixed,
    { name: "perfs", tests: [
      persons_with_cars_and_their_cars_1k,
    ]},
  ]},
  applyWhere,
  applyRequest,
]};
