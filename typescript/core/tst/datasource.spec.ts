import {ControlCenter, DataSource, DataSourceInternal, VersionedObject} from '@microstep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import ConstraintType = DataSourceInternal.ConstraintType;

function resources_sets(): DataSourceInternal.ObjectSet[] {
  let resources = new DataSourceInternal.ObjectSet();
  resources.name = "resources";
  resources.scope = ["_name"];
  resources.sort = ["+_name"];
  new DataSourceInternal.ConstraintOnType(ConstraintType.InstanceOf, resources, Resource);
  new DataSourceInternal.ConstraintOnValue(ConstraintType.Equal, resources, "_name", "Test");
  return [resources];
}
function simple_resources() {
  let sets = DataSourceInternal.parseRequest({
    name: "resources",
    where: { $instanceOf: Resource, _name: "Test" },
    sort: [ '+_name'],
    scope: ['_name'],
  });
  sets.forEach(s => assert.instanceOf(s, DataSourceInternal.ObjectSet));
  assert.deepEqual(sets, resources_sets());
}

function multi_resources() {
  let sets = DataSourceInternal.parseRequest({
    results: [{
      name: "resources",
      where: { $instanceOf: Resource, _name: "Test" },
      sort: [ '+_name'],
      scope: ['_name']
    }]
  });
  sets.forEach(s => assert.instanceOf(s, DataSourceInternal.ObjectSet));
  assert.deepEqual(sets, resources_sets());
}
function set_resources() {
  let sets = DataSourceInternal.parseRequest({
    "resources=": { $instanceOf: Resource, _name: "Test" },
    results: [{
      name: "resources",
      where: "=resources",
      sort: [ '+_name'],
      scope: ['_name']
    }]
  });
  sets.forEach(s => assert.instanceOf(s, DataSourceInternal.ObjectSet));
  assert.deepEqual(sets, resources_sets());
}


function persons_and_their_cars_sets(): DataSourceInternal.ObjectSet[] {
  let union = new DataSourceInternal.ObjectSet();
  let cars = new DataSourceInternal.ObjectSet();
  let c = cars;
  let C = new DataSourceInternal.ObjectSet();
  let p = new DataSourceInternal.ObjectSet();
  let persons = new DataSourceInternal.ObjectSet();
  new DataSourceInternal.ConstraintOnType(ConstraintType.InstanceOf, C, Car);
  new DataSourceInternal.ConstraintOnType(ConstraintType.ElementOf, c, C);
  new DataSourceInternal.ConstraintOnType(ConstraintType.InstanceOf, persons, People);
  new DataSourceInternal.ConstraintOnType(ConstraintType.ElementOf, p, persons);
  new DataSourceInternal.ConstraintBetweenSet(ConstraintType.Equal, c, "_owner", p, undefined);
  union.name = "union";
  union.scope = ['_firstname', '_lastname', '_owner', '_cars'];
  new DataSourceInternal.ConstraintOnType(ConstraintType.Union, union, [cars, persons]);
  return [union, cars, C, p, persons];
}
function persons_and_their_cars_sets_simplified(): DataSourceInternal.ObjectSet[] {
  let union = new DataSourceInternal.ObjectSet();
  let cars = new DataSourceInternal.ObjectSet();
  let persons = new DataSourceInternal.ObjectSet();
  new DataSourceInternal.ConstraintOnType(ConstraintType.InstanceOf, cars, Car);
  new DataSourceInternal.ConstraintOnType(ConstraintType.InstanceOf, persons, People);
  new DataSourceInternal.ConstraintBetweenSet(ConstraintType.Equal, cars, "_owner", persons, undefined);
  union.name = "union";
  union.scope = ['_firstname', '_lastname', '_owner', '_cars'];
  new DataSourceInternal.ConstraintOnType(ConstraintType.Union, union, [cars, persons]);
  return [union, cars, persons];
}
function persons_and_their_cars() {
  let sets = DataSourceInternal.parseRequest({
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
  let expected = persons_and_their_cars_sets();
  sets.forEach(s => assert.instanceOf(s, DataSourceInternal.ObjectSet));
  assert.deepEqual(sets, expected);
}


function persons_with_cars_and_their_cars_sets(): DataSourceInternal.ObjectSet[] {
  let cars = new DataSourceInternal.ObjectSet();
  let c = cars;
  let C = new DataSourceInternal.ObjectSet();
  let p = new DataSourceInternal.ObjectSet();
  let P = new DataSourceInternal.ObjectSet();
  let persons = new DataSourceInternal.ObjectSet();
  let C_owner = new DataSourceInternal.ObjectSet();
  new DataSourceInternal.ConstraintOnType(ConstraintType.InstanceOf, C, Car);
  new DataSourceInternal.ConstraintOnType(ConstraintType.ElementOf, c, C);
  new DataSourceInternal.ConstraintOnType(ConstraintType.InstanceOf, P, People);
  new DataSourceInternal.ConstraintOnType(ConstraintType.In, persons, P);
  new DataSourceInternal.ConstraintBetweenSet(ConstraintType.Equal, C_owner, undefined, C, "_owner");
  new DataSourceInternal.ConstraintOnType(ConstraintType.In, persons, C_owner);
  new DataSourceInternal.ConstraintOnType(ConstraintType.ElementOf, p, persons);
  new DataSourceInternal.ConstraintBetweenSet(ConstraintType.Equal, c, "_owner", p, undefined);
  cars.name = "cars";
  cars.scope = ['_firstname', '_lastname', '_cars'];
  persons.name = "persons";
  persons.scope = ['_owner'];
  return [cars, C, p, persons, P, C_owner];
}
function persons_with_cars_and_their_cars() {
  let sets = DataSourceInternal.parseRequest({
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
  });
  let expected = persons_with_cars_and_their_cars_sets();
  sets.forEach(s => assert.instanceOf(s, DataSourceInternal.ObjectSet));
  assert.deepEqual(sets, expected);
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
    });
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
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: Car }, objects), objects.slice(0, 3));
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: Car, _name: "Renault" }, objects), objects.slice(0, 2));
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: People }, objects), objects.slice(3, 5));
  assert.deepEqual(DataSourceInternal.applyWhere({ $instanceOf: People, _firstname: "Lisa" }, objects), objects.slice(3, 4));
}

function applyRequest() {
  let objects = makeObjects();
  assert.deepEqual(DataSourceInternal.applyRequest(
    { name: "cars", where: { $instanceOf: Car } }, objects), 
    { cars: objects.slice(0, 3) });
  assert.deepEqual(DataSourceInternal.applyRequest(
    { name: "Renaults", where: { $instanceOf: Car, _name: "Renault" } }, objects), 
    { Renaults: objects.slice(0, 2) });
  assert.deepEqual(DataSourceInternal.applyRequest(
    { 
      "cars=": { $instanceOf: Car },
      "renaults=": { _name: "Renault", $in: "=cars" },
      results: [
        { name: "renaults", where: "=renaults" },
        { name: "cars", where: "=cars" }
      ]
    }, objects), 
    { renaults: objects.slice(0, 2), cars: objects.slice(0, 3) });
}

export const tests = { name: 'DataSource', tests: [
  simple_resources,
  multi_resources,
  set_resources,
  persons_and_their_cars,
  persons_with_cars_and_their_cars,
  applyWhere,
  applyRequest,
  persons_with_cars_and_their_cars_1k
]};
