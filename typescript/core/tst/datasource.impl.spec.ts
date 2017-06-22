import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager, Aspect, ImmutableSet} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import ConstraintType = DataSourceInternal.ConstraintType;

interface Flux<T> {
  context: T;
  continue(): void;
}
type Context = { 
  Car: { new(): Car.Aspects.test1 }, 
  People: { new(): People.Aspects.test1 }, 
  db: DataSource.Aspects.server, 
  cc: ControlCenter,
  c0: Car.Aspects.test1,
  c1: Car.Aspects.test1,
  c2: Car.Aspects.test1,
  c3: Car.Aspects.test1,
  p0: People.Aspects.test1,
  p1: People.Aspects.test1,
  p2: People.Aspects.test1,
  component: {},
};

function init(flux: Flux<Context>) {
  let ctx = flux.context;
  let {Car, People, db, cc} = ctx;
  ctx.c0 = Object.assign(new Car(), { _name: "Renault", _model: "Clio 3" });
  ctx.c1 = Object.assign(new Car(), { _name: "Renault", _model: "Clio 2" });
  ctx.c2 = Object.assign(new Car(), { _name: "Peugeot", _model: "3008 DKR" });
  ctx.c3 = Object.assign(new Car(), { _name: "Peugeot", _model: "4008 DKR" });
  ctx.p0 = Object.assign(new People(), { _name: "Lisa Simpsons" , _firstname: "Lisa" , _lastname: "Simpsons", _birthDate: new Date()  });
  ctx.p1 = Object.assign(new People(), { _name: "Bart Simpsons" , _firstname: "Bart" , _lastname: "Simpsons", _birthDate: new Date(0) });
  ctx.p2 = Object.assign(new People(), { _name: "Homer Simpsons", _firstname: "Homer", _lastname: "Simpsons", _birthDate: new Date()  });
  ctx.component = {};
  cc.registerComponent(ctx.component);
  cc.registerObjects(ctx.component, [ctx.c0, ctx.c1, ctx.c2, ctx.c3, ctx.p0, ctx.p1, ctx.p2]);
  flux.continue();
}

function clean(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  cc.unregisterObjects(component, [c0, c1, c2, c3, p0, p1, p2]);
  cc.unregisterComponent(component);
  f.continue();
}

function save_c0(f: Flux<Context>) {
  let {Car, People, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  assert.equal(c0.version(), VersionedObjectManager.NextVersion);
  assert.equal(c0.manager().hasChanges(), true);
  db.farPromise('rawSave', [c0]).then((envelop) => {
    assert.sameMembers(envelop.result(), [c0]);
    assert.equal(c0.version(), 0);
    assert.equal(c0.manager().hasChanges(), false);
    f.continue();
  });
}
function save_c0_new_name(f: Flux<Context>) {
  let {Car, People, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  assert.equal(c0.manager().hasChanges(), false);
  c0._name = "ReNault";
  assert.equal(c0.manager().hasChanges(), true);
  db.farPromise('rawSave', [c0]).then((envelop) => {
    assert.sameMembers(envelop.result(), [c0]);
    assert.equal(c0.version(), 1);
    assert.equal(c0.manager().hasChanges(), false);
    f.continue();
  });
}
function save_c0_c1_c2(f: Flux<Context>) {
  let {Car, People, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawSave', [c0, c1, c2]).then((envelop) => {
    assert.sameMembers(envelop.result(), [c0, c1, c2]);
    assert.equal(c0.version(), 1);
    assert.equal(c1.version(), 0);
    assert.equal(c2.version(), 0);
    f.continue();
  });
}
function query_cars(f: Flux<Context>) {
  let {Car, People, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { name: "cars", where: { $instanceOf: Car } }).then((envelop) => {
    let res = envelop.result();
    assert.sameMembers(res['cars'], [c0, c1, c2]);
    f.continue();
  });
}
function query_peugeots(f: Flux<Context>) {
  let {Car, People, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { name: "cars", where: { $instanceOf: Car, _name: "Peugeot" } }).then((envelop) => {
    let res = envelop.result();
    assert.sameMembers(res['cars'], [c2]);
    let lc2 = res['cars'][0];
    assert.isNotTrue(lc2.manager().hasChanges());
    f.continue();
  });
}
function query_eq_peugeots(f: Flux<Context>) {
  let {Car, People, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { name: "cars", where: { $instanceOf: Car, _name: { $eq: "Peugeot" } } }).then((envelop) => {
    let res = envelop.result();
    assert.sameMembers(res['cars'], [c2]);
    let lc2 = res['cars'][0];
    assert.isNotTrue(lc2.manager().hasChanges());
    f.continue();
  });
}
function query_ne_peugeots(f: Flux<Context>) {
  let {Car, People, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { name: "cars", where: { $instanceOf: Car, _name: { $ne: "Peugeot" } } }).then((envelop) => {
    let res = envelop.result();
    assert.sameMembers(res['cars'], [c0, c1]);
    let lc2 = res['cars'][0];
    assert.isNotTrue(lc2.manager().hasChanges());
    f.continue();
  });
}
function query_in_c2(f: Flux<Context>) {
  let {Car, People, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { name: "cars", where: { $instanceOf: Car, $in: [c2] } }).then((envelop) => {
    assert.sameMembers(envelop.result()['cars'], [c2]);
    f.continue();
  });
};
function query_id_c2(f: Flux<Context>) {
  let {Car, People, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { name: "cars", where: { $instanceOf: Car, _id: c2.id() } }).then((envelop) => {
    assert.sameMembers(envelop.result()['cars'], [c2]);
    f.continue();
  });
}
function query_peoples(f: Flux<Context>) {
  let {Car, People, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { name: "peoples", where: { $instanceOf: People } }).then((envelop) => {
    assert.deepEqual(envelop.result(), {
      peoples: []
    });
    f.continue();
  });
}


function save_c0_c1_c2_c3_p0_p1_p2(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawSave', [c0, c1, c2, c3, p0, p1, p2]).then(envelop => { 
    assert.sameMembers(envelop.result(), [c0, c1, c2, c3, p0, p1, p2]);
    f.continue(); 
  });
}
function save_relation_c0p0_c1p0_c2p1(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  assert.equal(c0.manager().hasChanges(), false);
  assert.sameMembers([...p0._cars], []);
  c0._owner = p0;
  assert.sameMembers([...p0._cars], [c0]);
  assert.equal(c0.manager().hasChanges(), true);
  assert.equal(c1.manager().hasChanges(), false);
  c1._owner = p0;
  assert.sameMembers([...p0._cars], [c0, c1]);
  assert.equal(c1.manager().hasChanges(), true);
  c2._owner = p1;
  assert.sameMembers([...p1._cars], [c2]);

  db.farPromise('rawSave', [c0, c1, c2, p0, p1]).then((envelop) => {
    assert.sameMembers(envelop.result(), [c0, c1, c2, p0, p1]);
    assert.equal(c0.version(), 1);
    assert.equal(c0.manager().hasChanges(), false);
    assert.equal(c0._owner, p0);

    assert.equal(c1.version(), 1);
    assert.equal(c1.manager().hasChanges(), false);
    assert.equal(c1._owner, p0);
    f.continue();
  });
}
function query_cars_peoples(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  let c0_id = c0.id()
  let p0_id = p0.id()
  cc.unregisterObjects(component, [c0, p0]);
  db.farPromise('rawQuery', { results: [
    { name: "cars"   , where: { $instanceOf: Car   , _owner: p0, _id: c0_id }, scope: ['_name', '_owner', '_model']             },
    { name: "peoples", where: { $instanceOf: People            , _id: p0_id }, scope: ['_firstname', '_lastname', '_birthDate'] },
  ]}).then((envelop) => {
    let cars = envelop.result()['cars'];
    let peoples = envelop.result()['peoples'];
    assert.equal(cars.length, 1);
    assert.equal(peoples.length, 1);
    let lc0 = cars[0] as typeof c0;
    let lp0 = peoples[0] as typeof p0;
    assert.notEqual(lc0, c0, "objects where unregistered, the datasource should not return the same object");
    assert.notEqual(lp0, p0, "objects where unregistered, the datasource should not return the same object");
    assert.equal(lc0._name, c0._name);
    assert.equal(lc0._owner!.id(), c0._owner!.id());
    assert.equal(lc0._owner, lp0);
    assert.equal(lc0._model, c0._model);
    c0 = f.context.c0 = lc0;

    assert.equal(lp0._firstname, p0._firstname);
    assert.equal(lp0._lastname, p0._lastname);
    assert.equal(lp0._birthDate!.getTime(), p0._birthDate!.getTime());
    p0 = f.context.p0 = lp0;

    cc.registerObjects(component, [p0, c0]);
    f.continue();
  });
}

function query_cars_peoples_relation_in_scope(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  let c0_id = c0.id()
  let p0_id = p0.id()
  cc.unregisterObjects(component, [c0, p0]);
  db.farPromise('rawQuery', { results: [
    { name: "cars"   , where: { $instanceOf: Car   , _owner: p0, _id: c0_id }, scope: ['_name', '_owner', '_model']                      },
    { name: "peoples", where: { $instanceOf: People            , _id: p0_id }, scope: ['_firstname', '_lastname', '_birthDate', '_cars'] },
  ]}).then((envelop) => {
    let cars = envelop.result()['cars'];
    let peoples = envelop.result()['peoples'];
    assert.equal(cars.length, 1);
    assert.equal(peoples.length, 1);
    let lc0 = cars[0] as typeof c0;
    let lp0 = peoples[0] as typeof p0;
    assert.notEqual(lc0, c0, "objects where unregistered, the datasource should not return the same object");
    assert.notEqual(lp0, p0, "objects where unregistered, the datasource should not return the same object");
    assert.equal(lc0._name, c0._name);
    assert.equal(lc0._owner!.id(), c0._owner!.id());
    assert.equal(lc0._owner, lp0);
    assert.equal(lc0._model, c0._model);
    c0 = f.context.c0 = lc0;

    assert.equal(lp0._firstname, p0._firstname);
    assert.equal(lp0._lastname, p0._lastname);
    assert.equal(lp0._birthDate!.getTime(), p0._birthDate!.getTime());
    assert.sameMembers([...lp0._cars], [c0, c1]);
    p0 = f.context.p0 = lp0;

    cc.registerObjects(component, [p0, c0]);
    f.continue();
  });
}

function query_cars_peoples_constraint_on_relation(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  let c0_id = c0.id()
  let p0_id = p0.id()
  cc.unregisterObjects(component, [c0, p0]);
  db.farPromise('rawQuery', { results: [
    { name: "peoples", where: { $instanceOf: People, _cars: { $has: c0 } }, scope: ['_firstname', '_lastname', '_birthDate', '_cars'] },
  ]}).then((envelop) => {
    let peoples = envelop.result()['peoples'];
    assert.equal(peoples.length, 1);
    let lp0 = peoples[0] as typeof p0;
    assert.equal(lp0._cars.size, 2);
    let lc0 = [...lp0._cars].find(c => c.id() === c0.id()) as typeof c0;
    assert.notEqual(lc0, c0, "objects where unregistered, the datasource should not return the same object");
    assert.notEqual(lp0, p0, "objects where unregistered, the datasource should not return the same object");
    c0 = f.context.c0 = lc0;

    assert.equal(lp0._firstname, p0._firstname);
    assert.equal(lp0._lastname, p0._lastname);
    assert.equal(lp0._birthDate!.getTime(), p0._birthDate!.getTime());
    assert.sameMembers([...lp0._cars], [c0, c1]);
    p0 = f.context.p0 = lp0;

    cc.registerObjects(component, [p0, c0]);
    f.continue();
  });
}

function query_elementof(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { // All persons with a car and their cars
    "C=": { $instanceOf: Car },
    "P=": { $instanceOf: People },
    "persons1=": {
      $out: "=p",
      "p=": { $elementOf: "=P" },
      "c=": { $elementOf: "=C" },
      "=c._owner": { $eq: "=p" },
    },
    results: [
      { name: "peoples1", where: "=persons1", scope: ['_firstname', '_lastname', '_birthDate'] },
    ]
  }).then((envelop) => {
    let { peoples1 } = envelop.result();
    assert.sameMembers(peoples1, [p0, p1]);
    f.continue();
  });
}
function query_intersection(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { // All persons with a car and their cars
    "C=": { $instanceOf: Car },
    "P=": { $instanceOf: People },
    "persons2=": { $intersection: ["=C:_owner", "=P"] },
    results: [
      { name: "peoples2", where: "=persons2", scope: ['_firstname', '_lastname', '_birthDate'] },
    ]
  }).then((envelop) => {
    let { peoples2 } = envelop.result();
    assert.sameMembers(peoples2, [p0, p1]);
    f.continue();
  });
}
function query_elementof_sub(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { // All persons with a car and their cars
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
      { name: "cars2"   , where: "=cars2"   , scope: ['_name', '_owner', '_model']             },
    ]
  }).then((envelop) => {
    let { cars2 } = envelop.result();
    assert.sameMembers(cars2  , [c0, c1, c2]);
    f.continue();
  });
}
function query_elementof_intersection(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { // All persons with a car and their cars
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
      { name: "peoples1", where: "=persons1", scope: ['_firstname', '_lastname', '_birthDate'] },
      { name: "peoples2", where: "=persons2", scope: ['_firstname', '_lastname', '_birthDate'] },
      { name: "cars1"   , where: "=cars1"   , scope: ['_name', '_owner', '_model']             },
      { name: "cars2"   , where: "=cars2"   , scope: ['_name', '_owner', '_model']             },
    ]
  }).then((envelop) => {
    let { peoples1, peoples2, cars1, cars2 } = envelop.result();
    assert.sameMembers(peoples1, [p0, p1]);
    assert.sameMembers(peoples2, [p0, p1]);
    assert.sameMembers(cars1  , [c0, c1, c2]);
    assert.sameMembers(cars2  , [c0, c1, c2]);
    f.continue();
  });
}
function query_elementof_c1c2(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  db.farPromise('rawQuery', { // Cars where the owner has another car
    "C=": { $instanceOf: Car },
    "cars=": {
      $out: "=c1",
      "c1=": { $elementOf: "=C" },
      "c2=": { $elementOf: "=C" },
      "=c1._owner": { $eq: "=c2._owner" },
      "=c1": { $ne: "=c2" },
    },
    results: [
      { name: "cars", where: "=cars", scope: [] },
    ]
  }).then((envelop) => {
    let { cars } = envelop.result();
    assert.sameMembers(cars, [c0, c1]);
    f.continue();
  });
}

function select(vo: object, attr: string[]) {
  let ret = {};
  for (let a of attr)
    ret[a] = vo[a];
  return ret;
}
function deepEqual(a, b, attr: string[]) {
  assert.deepEqual(select(a, attr), select(b, attr));
}
async function load_mixed_attributes(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;

  c0.manager().unload();
  p0.manager().unload();

  let inv = await db.farPromise('safeLoad', { objects: [c0, p0], scope: ['_name', '_owner', '_model', '_firstname', '_lastname'] });
  assert.deepEqual(inv.diagnostics(), []);
  assert.isTrue(inv.hasResult());
  let u = inv.result();
  assert.sameMembers(u, [p0, c0]);
  deepEqual(c0, {_id: c0.id(), _name: "Renault", _model: "Clio 3", _owner: p0 }, ["_id", "_name", "_owner", "_model"]);
  deepEqual(p0, {_id: p0.id(), _firstname: "Lisa", _lastname: "Simpsons" }, ["_id", "_firstname", "_lastname"]);

  f.continue();
}
async function load_sub_attributes(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  c0.manager().unload();
  p0.manager().unload();

  let inv = await db.farPromise('safeLoad', { objects: [c0], scope: ['_name', '_owner', '_model', '_firstname', '_lastname', '_birthDate'] });
  assert.deepEqual(inv.diagnostics(), []);
  assert.isTrue(inv.hasResult());
  let u = inv.result();
  assert.sameMembers(u, [c0]);
  deepEqual(c0, {_id: c0.id(), _name: "Renault", _model: "Clio 3", _owner: p0 }, ["_id", "_name", "_owner", "_model"]);
  deepEqual(c0._owner, {_id: p0.id(), _firstname: "Lisa", _lastname: "Simpsons" }, ["_id", "_firstname", "_lastname"]);

  f.continue();
}

async function query_union_cars_peoples(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  cc.unregisterObjects(component, [c0, p0]);

  let inv = await db.farPromise('rawQuery', { 
    "cars=": { $instanceOf: Car, _id: c0.id() },
    "peoples=": { $instanceOf: People, _id: p0.id() },
    results: [
      { name: "u", where: { $union: ["=cars", "=peoples"] }, scope: ['_name', '_owner', '_model', '_firstname', '_lastname', '_birthDate'] },
    ]
  });
  assert.deepEqual(inv.diagnostics(), []);
  assert.isTrue(inv.hasResult());
  let u = inv.result()['u'];
  let lc0 = u.find(v => v instanceof Car) as typeof c0;
  let lp0 = u.find(v => v instanceof People);
  assert.equal(u.length, 2);
  deepEqual(lc0, {_id: c0.id(), _name: "Renault", _model: "Clio 3", _owner: lp0 }, ["_id", "_name", "_owner", "_model"]);
  deepEqual(lp0, {_id: p0.id(), _firstname: "Lisa", _lastname: "Simpsons" }, ["_id", "_firstname", "_lastname"]);
  
  cc.registerObjects(component, [c0, p0]);
  f.continue();
}
async function query_cars_sub_scope(f: Flux<Context>) {
  let {Car, People, db, cc, component, c0, c1, c2, c3, p0, p1, p2} = f.context;
  cc.unregisterObjects(component, [c0, p0]);

  let inv = await db.farPromise('rawQuery', {
    "cars=": { $instanceOf: Car, _id: c0.id() },
    results: [
      { name: "u", where: "=cars", scope: ['_name', '_owner', '_model', '_firstname', '_lastname', '_birthDate'] },
    ]
  });
  assert.deepEqual(inv.diagnostics(), []);
  assert.isTrue(inv.hasResult());
  let u = inv.result()['u'];
  let lc0 = u.find(v => v instanceof Car) as typeof c0;
  assert.equal(u.length, 1);
  deepEqual(lc0, {_id: c0.id(), _name: "Renault", _model: "Clio 3", _owner: lc0._owner }, ["_id", "_name", "_owner", "_model"]);
  deepEqual(lc0._owner, {_id: p0.id(), _firstname: "Lisa", _lastname: "Simpsons" }, ["_id", "_firstname", "_lastname"]);
  
  cc.registerObjects(component, [c0, p0]);
  f.continue();
}

function createWithCC(flux, nb) {
  let {Car, People, db, cc} = flux.context as Context;
  let objects: VersionedObject[] = [];
  for (var i = 0; i < nb; i++) {
    objects.push(Object.assign(new Car(), { _name: "Renault", _model: "Clio 3" }));
  }
  flux.context.objects = objects;
  flux.continue();
}
function insertWithCC(flux, nb) {
  let {db} = flux.context as Context;
  flux.setFirstElements([
    f => createWithCC(f, nb),
    f => {
      let objects: VersionedObject[] = f.context.objects;
      db.farPromise('rawSave', objects).then((envelop) => {
        assert.sameMembers(envelop.result(), objects);
        f.continue();
      });
    }
  ])
  flux.continue();
}
function insert1by1ParWithCC(flux, nb) {
  let {db} = flux.context as Context;
  flux.setFirstElements([
    f => createWithCC(f, nb),
    async f => {
      let objects: VersionedObject[] = f.context.objects;
      let results = await Promise.all(objects.map(o => db.farPromise('rawSave', [o]).then(e => e.result()[0])))
      assert.sameMembers(results, objects);
      f.continue();
    }
  ])
  flux.continue();
}
function insert1by1SeqWithCC(flux, nb) {
  let {db} = flux.context as Context;
  flux.setFirstElements([
    f => createWithCC(f, nb),
    f => {
      let objects: VersionedObject[] = f.context.objects;
      let results: VersionedObject[] = [];
      let i = 0;
      let doOne = (envelop?) => {
        if (envelop)
          results.push(envelop.result()[0]);
        if (i < objects.length) {
          let c = i++;
          db.farPromise('rawSave', [objects[c]]).then(doOne);
        }
        else {
          assert.sameMembers(results, objects);
          f.continue();
        }
      };
      doOne();
    }
  ])
  flux.continue();
}

export function createTests(createControlCenter: (flux) => void, destroyControlCenter: (flux) => void = (f) => f.continue()) : any[] {
  
  /*function create1k(flux) { runWithNewCC(flux, f => createWithCC(f, 1000)); }
  function insert100(flux) { runWithNewCC(flux, f => insertWithCC(f, 100)); }
  function insert1k(flux) { runWithNewCC(flux, f => insertWithCC(f, 1000)); }
  function insert1k_1by1Seq(flux) { runWithNewCC(flux, f => insert1by1SeqWithCC(f, 2)); }
  function insert1k_1by1Par(flux) { runWithNewCC(flux, f => insert1by1ParWithCC(f, 2)); }*/
  return [
    { name: "basics", tests: [
      { name: "init", test: (f: any) => { f.setFirstElements([createControlCenter, init]); f.continue(); } },
      save_c0,
      save_c0_new_name,
      save_c0_c1_c2,
      query_cars,
      query_peugeots,
      query_eq_peugeots,
      query_ne_peugeots,
      query_in_c2,
      query_id_c2,
      query_peoples,
      { name: "clean", test: (f: any) => { f.setFirstElements([clean, destroyControlCenter]); f.continue(); } },
    ]},
    { name: "relations", tests: [
      { name: "init", test: (f: any) => { f.setFirstElements([createControlCenter, init]); f.continue(); } },
      save_c0_c1_c2_c3_p0_p1_p2,
      save_relation_c0p0_c1p0_c2p1,
      query_cars_peoples,
      query_cars_peoples_relation_in_scope,
      query_cars_peoples_constraint_on_relation,
      query_elementof,
      query_intersection,
      query_elementof_intersection,
      query_elementof_sub,
      query_elementof_c1c2,
      { name: "clean", test: (f: any) => { f.setFirstElements([clean, destroyControlCenter]); f.continue(); } },
    ]},
    { name: "mixed", tests: [
      { name: "init", test: (f: any) => { f.setFirstElements([createControlCenter, init]); f.continue(); } },
      save_c0_c1_c2_c3_p0_p1_p2,
      save_relation_c0p0_c1p0_c2p1,
      load_mixed_attributes,
      load_sub_attributes,
      query_union_cars_peoples,
      query_cars_sub_scope,
      { name: "clean", test: (f: any) => { f.setFirstElements([clean, destroyControlCenter]); f.continue(); } },
    ]},
    ]//, create1k, insert100, insert1k, insert1k_1by1Seq, insert1k_1by1Par];
}

