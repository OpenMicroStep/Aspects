import {ControlCenter, DataSource, ControlCenterContext, VersionedObject, VersionedObjectManager, Result} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

interface Flux<T> {
  context: T;
  continue(): void;
}
type Context = {
  db: DataSource.Aspects.server,
  cc: ControlCenter,
  c0: Car.Aspects.test1,
  c1: Car.Aspects.test1,
  c2: Car.Aspects.test1,
  c3: Car.Aspects.test1,
  p0: People.Aspects.test1,
  p1: People.Aspects.test1,
  p2: People.Aspects.test1,
  p3: People.Aspects.test1,
  p4: People.Aspects.test1,
  ccc: ControlCenterContext,
};

function init(flux: Flux<Context>) {
  let ctx = flux.context;
  let {db, cc} = ctx;
  let ccc = ctx.ccc = cc.registerComponent({});
  ctx.c0 = Object.assign(Car.Aspects.test1.create(ccc), { _name: "Renault", _model: "Clio 3" });
  ctx.c1 = Object.assign(Car.Aspects.test1.create(ccc), { _name: "Renault", _model: "Clio 2"  , _tags: new Set(['Renault', 'Trop', 'Vieux']) });
  ctx.c2 = Object.assign(Car.Aspects.test1.create(ccc), { _name: "Peugeot", _model: "3008 DKR", _tags: new Set(['Peugeot', 'Dakkar']) });
  ctx.c3 = Object.assign(Car.Aspects.test1.create(ccc), { _name: "Peugeot", _model: "4008 DKR", _tags: new Set(['Peugeot', 'Renault', 'Dakkar', 'Top1', 'Top2']) });
  ctx.p4 = Object.assign(People.Aspects.test1.create(ccc), { _name: "Abraham Simpson", _firstname: "Abraham", _lastname: "Simpson", _birthDate: new Date()  });
  ctx.p2 = Object.assign(People.Aspects.test1.create(ccc), { _name: "Homer Simpson"  , _firstname: "Homer"  , _lastname: "Simpson", _birthDate: new Date(), _father: ctx.p4 });
  ctx.p3 = Object.assign(People.Aspects.test1.create(ccc), { _name: "Marge Simpson"  , _firstname: "Marge"  , _lastname: "Simpson", _birthDate: new Date()  });
  ctx.p0 = Object.assign(People.Aspects.test1.create(ccc), { _name: "Lisa Simpson"   , _firstname: "Lisa"   , _lastname: "Simpson", _birthDate: new Date(), _father: ctx.p2, _mother: ctx.p3 });
  ctx.p1 = Object.assign(People.Aspects.test1.create(ccc), { _name: "Bart Simpson"   , _firstname: "Bart"   , _lastname: "Simpson", _birthDate: new Date(), _father: ctx.p2, _mother: ctx.p3 });
  flux.continue();
}

function clean(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2, p3, p4} = f.context;
  ccc.unregisterObjects([c0, c1, c2, c3, p0, p1, p2, p3, p4]);
  assert.deepEqual([...ccc.componentObjects()], []);
  ccc.destroy();
  f.continue();
}

function save_c0(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  assert.equal(c0.version(), VersionedObjectManager.NoVersion);
  assert.equal(c0.manager().isModified(), true);
  assert.equal(c0.manager().isSaved(), false);
  ccc.farPromise(db.rawSave, [c0]).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.sameMembers(envelop.value(), [c0]);
    assert.equal(c0.version(), 0);
    assert.equal(c0.manager().isModified(), false);
    assert.equal(c0.manager().isSaved(), true);
    assert.strictEqual(c0.manager().savedAttributeValue("_name"), "Renault");
    assert.strictEqual(c0.manager().savedAttributeValue("_model"), "Clio 3");
    assert.sameMembers([...c0.manager().savedAttributeValue("_tags")], []);
    f.continue();
  });
}
function save_c0_new_name(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  assert.equal(c0.manager().isModified(), false);
  assert.equal(c0.manager().isSaved(), true);
  c0._name = "ReNault";
  assert.equal(c0.manager().isModified(), true);
  assert.equal(c0.manager().isSaved(), true);
  ccc.farPromise(db.rawSave, [c0]).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.sameMembers(envelop.value(), [c0]);
    assert.equal(c0.version(), 1);
    assert.equal(c0.manager().isModified(), false);
    assert.equal(c0.manager().isSaved(), true);
    assert.strictEqual(c0.manager().savedAttributeValue("_name"), "ReNault");
    assert.strictEqual(c0.manager().savedAttributeValue("_model"), "Clio 3");
    assert.sameMembers([...c0.manager().savedAttributeValue("_tags")], []);
    f.continue();
  });
}

function save_c0_c1_c2_modify_tags(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  assert.equal(c0.manager().isModified(), false);
  c0._tags = new Set(['new']);
  c1._tags = new Set([]);
  c2._tags = new Set(['Paris', 'Dakkar']);
  assert.equal(c0.manager().isModified(), true);
  assert.equal(c1.manager().isModified(), true);
  assert.equal(c2.manager().isModified(), true);
  ccc.farPromise(db.rawSave, [c0,c1,c2]).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.sameMembers(envelop.value(), [c0,c1,c2]);
    assert.equal(c0.version(), 2);
    assert.equal(c0.manager().isModified(), false);
    assert.equal(c1.manager().isModified(), false);
    assert.equal(c2.manager().isModified(), false);
    f.continue();
  });
}

function save_c0_c1_c2(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawSave, [c0, c1, c2]).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.sameMembers(envelop.value(), [c0, c1, c2]);
    assert.equal(c0.version(), 1);
    assert.equal(c1.version(), 0);
    assert.equal(c2.version(), 0);
    f.continue();
  });
}
function query_cars(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { name: "cars", where: { $instanceOf: Car } }).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    let res = envelop.value();
    assert.sameMembers(res['cars'], [c0, c1, c2]);
    f.continue();
  });
}
function query_peugeots(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { name: "cars", where: { $instanceOf: Car, _name: "Peugeot" } }).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    let res = envelop.value();
    assert.sameMembers(res['cars'], [c2]);
    let lc2 = res['cars'][0];
    assert.isNotTrue(lc2.manager().isModified());
    f.continue();
  });
}
function query_eq_peugeots(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { name: "cars", where: { $instanceOf: Car, _name: { $eq: "Peugeot" } } }).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    let res = envelop.value();
    assert.sameMembers(res['cars'], [c2]);
    let lc2 = res['cars'][0];
    assert.isNotTrue(lc2.manager().isModified());
    f.continue();
  });
}
function query_ne_peugeots(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { name: "cars", where: { $instanceOf: Car, _name: { $neq: "Peugeot" } } }).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    let res = envelop.value();
    assert.sameMembers(res['cars'], [c0, c1]);
    let lc2 = res['cars'][0];
    assert.isNotTrue(lc2.manager().isModified());
    f.continue();
  });
}
function query_in_c2(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { name: "cars", where: { $instanceOf: Car, $in: [c2] } }).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.deepEqual(envelop.diagnostics(), []);
    assert.sameMembers(envelop.value()['cars'], [c2]);
    f.continue();
  });
};
function query_id_c2(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { name: "cars", where: { $instanceOf: Car, _id: c2.id() } }).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.sameMembers(envelop.value()['cars'], [c2]);
    f.continue();
  });
}
function query_peoples(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { name: "peoples", where: { $instanceOf: People } }).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.deepEqual(envelop.value(), {
      peoples: []
    });
    f.continue();
  });
}

function sort_c0_c1_c2_c3_asc(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { name: "cars", where: { $instanceOf: "Car" }, scope: {
    Car: { '.' : ['+_name', '+_model'] },
  } }).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.deepEqual(envelop.value(), {
      cars: [c2, c3, c1, c0],
    });
    f.continue();
  });
}

function sort_c0_c1_c2_c3_dsc(f: Flux<Context>) {
  let {ccc, db, cc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { name: "cars", where: { $instanceOf: "Car" }, scope: {
    Car: { '.' : ['-_name', '-_model'] },
  } }).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.deepEqual(envelop.value(), {
      cars: [c0, c1, c3, c2],
    });
    f.continue();
  });
}

function save_c0_c1_c2_c3_p0_p1_p2_p3_p4(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2, p3, p4} = f.context;
  ccc.farPromise(db.rawSave, [c0, c1, c2, c3, p0, p1, p2, p3, p4]).then(envelop => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.sameMembers(envelop.value(), [c0, c1, c2, c3, p0, p1, p2, p3, p4]);
    f.continue();
  });
}
function save_relation_c0p0_c1p0_c2p1(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  assert.equal(c0.manager().isModified(), false);
  assert.sameMembers([...p0._cars], []);
  c0._owner = p0;
  assert.sameMembers([...p0._cars], [c0]);
  assert.equal(c0.manager().isModified(), true);
  assert.equal(c1.manager().isModified(), false);
  c1._owner = p0;
  assert.sameMembers([...p0._cars], [c0, c1]);
  assert.equal(c1.manager().isModified(), true);
  c2._owner = p1;
  assert.sameMembers([...p1._cars], [c2]);

  ccc.farPromise(db.rawSave, [c0, c1, c2, p0, p1]).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    assert.sameMembers(envelop.value(), [c0, c1, c2, p0, p1]);
    assert.equal(c0.version(), 1);
    assert.equal(c0.manager().isModified(), false);
    assert.equal(c0._owner, p0);

    assert.equal(c1.version(), 1);
    assert.equal(c1.manager().isModified(), false);
    assert.equal(c1._owner, p0);
    f.continue();
  });
}
async function _query_cars(f: Flux<Context>, q: () => Promise<Result<{ [k: string]: VersionedObject[] }>>) {
  let {cc, ccc, c0, p0} = f.context;
  let p0_cpy = { id: p0.id(), _firstname: p0._firstname, _lastname: p0._lastname, _birthDate: p0._birthDate };
  let c0_cpy = { id: c0.id(), _name: c0._name, _owner: p0_cpy, _model: c0._model };
  ccc.unregisterObjects([p0, c0]);

  let envelop = await q();
  assert.deepEqual(envelop.diagnostics(), []);
  let { cars, peoples } = envelop.value();
  assert.equal(cars.length, 1);
  assert.equal(peoples.length, 1);
  let lc0 = cars[0] as typeof c0;
  let lp0 = peoples[0] as typeof p0;
  assert.notEqual(lc0, c0, "objects where unregistered, the datasource should not return the same object");
  assert.notEqual(lp0, p0, "objects where unregistered, the datasource should not return the same object");
  p0 = f.context.p0 = lp0;
  c0 = f.context.c0 = lc0;

  assert.equal(lc0._name, c0_cpy._name);
  assert.equal(lc0._owner!.id(), c0_cpy._owner.id);
  assert.equal(lc0._owner, lp0);
  assert.equal(lc0._model, c0_cpy._model);

  assert.equal(lp0._firstname, p0_cpy._firstname);
  assert.equal(lp0._lastname, p0_cpy._lastname);
  assert.equal(lp0._birthDate!.getTime(), p0_cpy._birthDate!.getTime());

  return { lp0: lp0, lc0: lc0 };
}
async function query_cars_peoples(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  let p0_id = p0.id();
  let c0_id = c0.id();
  await _query_cars(f, () => {
    return ccc.farPromise(db.rawQuery, { results: [
      { name: "cars"   , where: { $instanceOf: Car   , _id: c0_id }, scope: ['_name', '_owner', '_model']             },
      { name: "peoples", where: { $instanceOf: People,  _id: p0_id }, scope: ['_firstname', '_lastname', '_birthDate'] },
    ]});
  });
  f.continue();
}

async function query_cars_peoples_relation_in_scope(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  let p0_id = p0.id();
  let c0_id = c0.id();
  let {lp0, lc0} = await _query_cars(f, () => {
    return ccc.farPromise(db.rawQuery, { results: [
      { name: "cars"   , where: { $instanceOf: Car   , _id: c0_id }, scope: ['_name', '_owner', '_model']             },
      { name: "peoples", where: { $instanceOf: People, _id: p0_id }, scope: ['_firstname', '_lastname', '_birthDate', '_cars'] },
    ]});
  });
  assert.sameMembers([...lp0._cars], [lc0, c1]);
  f.continue();
}

function query_cars_peoples_constraint_on_relation(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  let p0_cpy = { id: p0.id(), _firstname: p0._firstname, _lastname: p0._lastname, _birthDate: p0._birthDate };
  c0.manager().unloadAllAttributes();
  ccc.farPromise(db.rawQuery, { results: [
    { name: "peoples", where: { $instanceOf: People, _cars: { $contains: c0 } }, scope: ['_firstname', '_lastname', '_birthDate', '_cars'] },
  ]}).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    let peoples = envelop.value()['peoples'];
    assert.equal(peoples.length, 1);
    let lp0 = peoples[0] as typeof p0;
    ccc.registerObjects([lp0]);
    assert.equal(lp0._cars.size, 2);
    let lc0 = [...lp0._cars].find(c => c.id() === c0.id()) as typeof c0;
    c0 = f.context.c0 = lc0;
    p0 = f.context.p0 = lp0;

    assert.equal(lp0._firstname, p0_cpy._firstname);
    assert.equal(lp0._lastname, p0_cpy._lastname);
    assert.equal(lp0._birthDate!.getTime(), p0_cpy._birthDate!.getTime());
    assert.sameMembers([...lp0._cars], [c0, c1]);

    f.continue();
  });
}

function query_elementof(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { // All persons with a car and their cars
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
    let { peoples1 } = envelop.value();
    assert.sameMembers(peoples1, [p0, p1]);
    f.continue();
  });
}
function query_intersection(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { // All persons with a car and their cars
    "C=": { $instanceOf: Car },
    "P=": { $instanceOf: People },
    "persons2=": { $intersection: ["=C:_owner", "=P"] },
    results: [
      { name: "peoples2", where: "=persons2", scope: ['_firstname', '_lastname', '_birthDate'] },
    ]
  }).then((envelop) => {
    let { peoples2 } = envelop.value();
    assert.sameMembers(peoples2, [p0, p1]);
    f.continue();
  });
}
function query_elementof_sub(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { // All persons with a car and their cars
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
    let { cars2 } = envelop.value();
    assert.sameMembers(cars2  , [c0, c1, c2]);
    f.continue();
  });
}
function query_elementof_intersection(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { // All persons with a car and their cars
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
    let { peoples1, peoples2, cars1, cars2 } = envelop.value();
    assert.sameMembers(peoples1, [p0, p1]);
    assert.sameMembers(peoples2, [p0, p1]);
    assert.sameMembers(cars1  , [c0, c1, c2]);
    assert.sameMembers(cars2  , [c0, c1, c2]);
    f.continue();
  });
}
function query_elementof_c1c2(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  ccc.farPromise(db.rawQuery, { // Cars where the owner has another car
    "C=": { $instanceOf: Car },
    "cars=": {
      $out: "=c1",
      "c1=": { $elementOf: "=C" },
      "c2=": { $elementOf: "=C" },
      "=c1._owner": { $eq: "=c2._owner" },
      "=c1": { $neq: "=c2" },
    },
    results: [
      { name: "cars", where: "=cars", scope: [] },
    ]
  }).then((envelop) => {
    let { cars } = envelop.value();
    assert.sameMembers(cars, [c0, c1]);
    f.continue();
  });
}

function query_mother_father_peoples(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p4, p2, p3, p0, p1} = f.context;
  [...ccc.componentObjects()].map(vo => vo.manager().unloadAllAttributes());
  ccc.farPromise(db.rawQuery, { name: "peoples", where: { $instanceOf: "People" }, scope: {
    People: {
      _: ['_firstname', '_lastname'],
      '.': ['+_firstname', '+_lastname', '_father', '_mother', '_cars'],
    },
    Car: {
      _: ['_name'],
    },
  }}).then((envelop) => {
    assert.deepEqual(envelop.diagnostics(), []);
    let { peoples } = envelop.value();
    assert.deepEqual(peoples, [p4, p1, p2, p0, p3]);
    let attributes = ['_firstname', '_lastname', '_father', '_mother'];
    deepEqual(p4, { _firstname: "Abraham", _lastname: "Simpson", }, attributes);
    deepEqual(p2, { _firstname: "Homer"  , _lastname: "Simpson", _father: p4 }, attributes);
    deepEqual(p3, { _firstname: "Marge"  , _lastname: "Simpson", }, attributes);
    deepEqual(p0, { _firstname: "Lisa"   , _lastname: "Simpson", _father: p2, _mother: p3 }, attributes);
    deepEqual(p1, { _firstname: "Bart"   , _lastname: "Simpson", _father: p2, _mother: p3 }, attributes);
    f.continue();
  });
}

function query_father_tree(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p4, p2, p3, p0, p1} = f.context;
  [...ccc.componentObjects()].map(vo => vo.manager().unloadAllAttributes());
  ccc.farPromise(db.rawQuery, {
    name: "peoples",
    where: { $instanceOf: "People" },
    scope: ['+_firstname', '+_lastname', '_father', '_childrens_by_father', '_mother', '_childrens_by_mother'],
  }).then((envelop) => {
    let { peoples } = envelop.value();
    assert.deepEqual(peoples, [p4, p1, p2, p0, p3]);
    let attributes = ['_firstname', '_lastname', '_father', '_childrens_by_father', '_mother', '_childrens_by_mother'];
    deepEqual(p4, { _firstname: "Abraham", _lastname: "Simpson", _childrens_by_father: [p2]    , _childrens_by_mother: []      ,                          }, attributes);
    deepEqual(p2, { _firstname: "Homer"  , _lastname: "Simpson", _childrens_by_father: [p0, p1], _childrens_by_mother: []      , _father: p4              }, attributes);
    deepEqual(p3, { _firstname: "Marge"  , _lastname: "Simpson", _childrens_by_father: []      , _childrens_by_mother: [p0, p1],                          }, attributes);
    deepEqual(p0, { _firstname: "Lisa"   , _lastname: "Simpson", _childrens_by_father: []      , _childrens_by_mother: []      , _father: p2, _mother: p3 }, attributes);
    deepEqual(p1, { _firstname: "Bart"   , _lastname: "Simpson", _childrens_by_father: []      , _childrens_by_mother: []      , _father: p2, _mother: p3 }, attributes);
    f.continue();
  });
}

function select(vo: object, attr: string[]) {
  let ret = {};
  for (let a of attr)
    ret[a] = vo[a];
  return ret;
}
function deepEqual(a, b, attributes: string[]) {
  for (let attribute of attributes) {
    let va = a[attribute];
    let vb = b[attribute];
    if (va instanceof Set)
      assert.sameMembers([...va], vb, attribute);
    else if (va instanceof Array)
      assert.deepEqual(va, vb, attribute);
    else
      assert.strictEqual(va, vb, attribute);
  }
}
async function load_mixed_attributes(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;

  c0.manager().unloadAllAttributes();
  p0.manager().unloadAllAttributes();

  let inv = await ccc.farPromise(db.safeLoad, { objects: [c0, p0], scope: {
      People: { '.': ['_name', '_firstname', '_lastname'] },
      Car: { '.': ['_name', '_owner', '_model'] },
    }
  });
  assert.deepEqual(inv.diagnostics(), []);
  assert.isTrue(inv.hasOneValue());
  let u = inv.value();
  assert.sameMembers(u, [p0, c0]);
  deepEqual(c0, {_id: c0.id(), _name: "Renault", _model: "Clio 3", _owner: p0 }, ["_id", "_name", "_owner", "_model"]);
  deepEqual(p0, {_id: p0.id(), _name: "Lisa Simpson", _firstname: "Lisa", _lastname: "Simpson" }, ["_id", "_name", "_firstname", "_lastname"]);

  f.continue();
}
async function load_sub_attributes(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  c0.manager().unloadAllAttributes();
  p0.manager().unloadAllAttributes();

  let inv = await ccc.farPromise(db.safeLoad, { objects: [c0], scope: {
      Car: { '.': ['_name', '_owner', '_model'] },
      People: { '_owner.': ['_name', '_firstname', '_lastname'] },
    }
  });
  assert.deepEqual(inv.diagnostics(), []);
  assert.isTrue(inv.hasOneValue());
  let u = inv.value();
  assert.sameMembers(u, [c0]);
  deepEqual(c0, {_id: c0.id(), _name: "Renault", _model: "Clio 3", _owner: p0 }, ["_id", "_name", "_owner", "_model"]);
  deepEqual(c0._owner, {_id: p0.id(), _name: "Lisa Simpson", _firstname: "Lisa", _lastname: "Simpson" }, ["_id", "_name", "_firstname", "_lastname"]);

  f.continue();
}
async function load_sub_mult_attributes(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  c0.manager().unloadAllAttributes();
  c1.manager().unloadAllAttributes();
  p0.manager().unloadAllAttributes();

  let inv = await ccc.farPromise(db.safeLoad, { objects: [p0], scope: {
      People: { '.': ['_name', '_firstname', '_lastname', '_cars'] },
      Car: { '_cars.': ['_name', '_owner', '_model'] },
    }
  });
  assert.deepEqual(inv.diagnostics(), []);
  assert.isTrue(inv.hasOneValue());
  let u = inv.value();
  assert.sameMembers(u, [p0]);
  deepEqual(p0, {_id: p0.id(), _name: "Lisa Simpson", _firstname: "Lisa", _lastname: "Simpson" }, ["_id", "_name", "_firstname", "_lastname"]);
  assert.deepEqual(
    [...p0._cars].map(p => select(p, ["_id", "_name", "_owner", "_model"])),
    [
      {_id: c0.id(), _name: "Renault", _model: "Clio 3", _owner: p0 },
      {_id: c1.id(), _name: "Renault", _model: "Clio 2", _owner: p0 },
    ]
  );

  f.continue();
}

async function query_union_cars_peoples(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  let c0_id = c0.id();
  let p0_id = p0.id();
  ccc.unregisterObjects([c0, p0]);
  let inv = await ccc.farPromise(db.rawQuery, {
    "cars=": { $instanceOf: Car, _id: c0_id },
    "peoples=": { $instanceOf: People, _id: p0_id },
    results: [
      { name: "u", where: { $union: ["=cars", "=peoples"] }, scope: {
        Car: { '.': ['_name', '_owner', '_model'] },
        People: { '.': ['_name', '_firstname', '_lastname', '_birthDate'] },
      }}
    ]
  });
  assert.deepEqual(inv.diagnostics(), []);
  assert.isTrue(inv.hasOneValue());
  let u = inv.value()['u'];
  let lc0 = u.find(v => v instanceof Car) as typeof c0;
  let lp0 = u.find(v => v instanceof People) as typeof p0;
  assert.equal(u.length, 2);
  deepEqual(lc0, {_id: c0_id, _name: "Renault", _model: "Clio 3", _owner: lp0 }, ["_id", "_name", "_owner", "_model"]);
  deepEqual(lp0, {_id: p0_id, _firstname: "Lisa", _lastname: "Simpson" }, ["_id", "_firstname", "_lastname"]);

  f.context.c0 = lc0;
  f.context.p0 = lp0;
  f.continue();
}
async function query_cars_sub_scope(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2} = f.context;
  let c0_id = c0.id();
  let p0_id = p0.id();
  ccc.unregisterObjects([c0, p0]);

  let inv = await ccc.farPromise(db.rawQuery, {
    "cars=": { $instanceOf: Car, _id: c0_id },
    results: [
      { name: "u", where: "=cars", scope: {
        Car: { '.': ['_name', '_owner', '_model'] },
        People: { '_owner.': ['_name', '_firstname', '_lastname', '_birthDate'] },
      }},
    ]
  });
  assert.deepEqual(inv.diagnostics(), []);
  assert.isTrue(inv.hasOneValue());
  let u = inv.value()['u'];
  let lc0 = u.find(v => v instanceof Car) as typeof c0;
  assert.equal(u.length, 1);
  deepEqual(lc0, {_id: c0_id, _name: "Renault", _model: "Clio 3", _owner: lc0._owner }, ["_id", "_name", "_owner", "_model"]);
  deepEqual(lc0._owner, {_id: p0_id, _firstname: "Lisa", _lastname: "Simpson" }, ["_id", "_firstname", "_lastname"]);

  f.context.c0 = lc0;
  f.context.p0 = lc0._owner as typeof p0;
  f.continue();
}

async function query_parents(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3, p0, p1, p2, p3, p4} = f.context;

  let inv = await ccc.farPromise(db.rawQuery, {
    "parents=": {
      $unionForAlln: "=U(n)",
      "U(0)=": { $instanceOf: "People", _firstname: "Lisa", _lastname: "Simpson" },
      "U(n + 1)=": {
        $out: "=p",
        "s=": { $elementOf: "=U(n)" },
        "p=": { $elementOf: { $instanceOf: "People" } },
        $or: [
          { "=p": { $eq: "=s._mother" } },
          { "=p": { $eq: "=s._father" } },
        ]
      }
    },
    results: [
      { name: "u", where: "=parents", scope: {
        People: { '.': ['_name', '_firstname', '_lastname', '_birthDate'] },
      } },
    ]
  });
  assert.deepEqual(inv.diagnostics(), []);
  assert.isTrue(inv.hasOneValue());
  let u = inv.value()['u'];
  assert.sameMembers(u, [p0, p2, p3, p4]);
  f.continue();
}

function createWithCC(flux, nb) {
  let {db, cc} = flux.context as Context;
  let objects: VersionedObject[] = [];
  let ccc = cc.registerComponent({});
  for (var i = 0; i < nb; i++) {
    objects.push(Object.assign(Car.Aspects.test1.create(ccc), { _name: "Renault", _model: "Clio 3" }));
  }
  flux.context.objects = objects;
  flux.continue();
}
function insertWithCC(flux, nb) {
  let {ccc, db} = flux.context as Context;
  flux.setFirstElements([
    f => createWithCC(f, nb),
    f => {
      let objects: VersionedObject[] = f.context.objects;
      ccc.farPromise(db.rawSave, objects).then((envelop) => {
        assert.sameMembers(envelop.value(), objects);
        f.continue();
      });
    }
  ])
  flux.continue();
}
function insert1by1ParWithCC(flux, nb) {
  let {ccc, db} = flux.context as Context;
  flux.setFirstElements([
    f => createWithCC(f, nb),
    async f => {
      let objects: VersionedObject[] = f.context.objects;
      let results = await Promise.all(objects.map(o => ccc.farPromise(db.rawSave, [o]).then(e => e.value()[0])))
      assert.sameMembers(results, objects);
      f.continue();
    }
  ])
  flux.continue();
}
function insert1by1SeqWithCC(flux, nb) {
  let {ccc, db} = flux.context as Context;
  flux.setFirstElements([
    f => createWithCC(f, nb),
    f => {
      let objects: VersionedObject[] = f.context.objects;
      let results: VersionedObject[] = [];
      let i = 0;
      let doOne = (envelop?) => {
        if (envelop)
          results.push(envelop.value()[0]);
        if (i < objects.length) {
          let c = i++;
          ccc.farPromise(db.rawSave, [objects[c]]).then(doOne);
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

async function _query_op_value_check_both(f: Flux<Context>,op:string,value:string|string[],expected:Car[]) {
  let {c0, c1, c2, c3} = f.context;
  await _query_op_value_check(f, `$${op}`, value, expected);
  await _query_op_value_check(f, `$n${op}`, value, [c0,c1, c2, c3].filter(v => expected.indexOf(v) === -1));
}

async function _query_op_value_check(f: Flux<Context>,op:string,value:string|string[],expected:Car[]) {
  let {db, cc, ccc} = f.context;
  let envelop = await ccc.farPromise(db.rawQuery, { name: "cars", where: { $instanceOf: Car, _tags: { [op]: value } } });
  assert.deepEqual(envelop.diagnostics(), []);
  assert.sameMembers(envelop.value()['cars'].map(v => v.id()), expected.map(v => v.id()));
  assert.sameMembers(envelop.value()['cars'], expected);
}

async function _query_op_variable_check_both(f: Flux<Context>,op:string, model: string, rattribute: string, expected:Car[]) {
  let {c0, c1, c2, c3} = f.context;
  await _query_op_variable_check(f, `$${op}`, model, rattribute, expected);
  await _query_op_variable_check(f, `$n${op}`, model, rattribute, [c0,c1, c2, c3].filter(v => expected.indexOf(v) === -1));
}
async function _query_op_variable_check(f: Flux<Context>,op:string, model: string, rattribute: string, expected:Car[]) {
  let {db, cc, ccc} = f.context;
  let envelop = await ccc.farPromise(db.rawQuery, {
    name: "cars",
    where: {
      $out: "=l",
      "l=": { $elementOf: { $instanceOf: Car,  } },
      "r=": { $elementOf: { $instanceOf: Car, _model: model } },
      "=l._tags": { [op]: `=r.${rattribute}` }
    }
  });
  assert.deepEqual(envelop.diagnostics(), []);
  assert.sameMembers(envelop.value()['cars'].map(v => v.id()), expected.map(v => v.id()));
  assert.sameMembers(envelop.value()['cars'], expected);
}

async function query_contains_value(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3} = f.context;
  await _query_op_value_check_both(f,"contains","",[]);
  await _query_op_value_check_both(f,"contains","Vieux",[c1]);
  await _query_op_value_check_both(f,"contains","Dakkar",[c2,c3]);
  await _query_op_value_check_both(f,"contains","Dummy",[]);
  f.continue();
}

async function query_contains_variable(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3} = f.context;
  await _query_op_variable_check(f,"$contains", "none", "_name", []);
  await _query_op_variable_check(f,"$ncontains", "none", "_name", []);
  await _query_op_variable_check_both(f,"contains", "Clio 3", "_name", [c1, c3]); // $contains: "Renault"
  f.continue();
}

async function query_subset_value(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3} = f.context;
  await _query_op_value_check_both(f,"subset",[],[c0]);
  await _query_op_value_check_both(f,"subset",["Peugeot"],[c0]);
  await _query_op_value_check_both(f,"subset",["Peugeot","Dakkar"],[c0,c2]);
  await _query_op_value_check_both(f,"subset",["Peugeot","Renault","Dakkar","Vieux"],[c0,c2]);
  await _query_op_value_check_both(f,"subset",["Peugeot","Renault","Dakkar","Top1","Top2"],[c0,c2,c3]);
  f.continue();
}

async function query_subset_variable(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3} = f.context;
  await _query_op_variable_check_both(f,"subset","Clio 3", "_tags", [c0]);
  await _query_op_variable_check_both(f,"subset","Clio 2", "_tags", [c0, c1]);
  await _query_op_variable_check_both(f,"subset","4008 DKR", "_tags", [c0, c2, c3]);
  f.continue();
}

async function query_superset_value(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3} = f.context;
  await _query_op_value_check_both(f,"superset",[],[c0,c1,c2,c3]);
  await _query_op_value_check_both(f,"superset",["Trop"],[c1]);
  await _query_op_value_check_both(f,"superset",["Renault","Top1"],[c3]);
  await _query_op_value_check_both(f,"superset",["Peugeot", "Dakkar"],[c2,c3]);
  await _query_op_value_check_both(f,"superset",["Dummy"],[]);
  f.continue();
}

async function query_superset_variable(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3} = f.context;
  await _query_op_variable_check_both(f,"superset","Clio 3", "_tags", [c0, c1, c2, c3]);
  await _query_op_variable_check_both(f,"superset","Clio 2", "_tags", [c1]);
  await _query_op_variable_check_both(f,"superset","3008 DKR", "_tags", [c2, c3]);
  f.continue();
}

async function query_sameset_value(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3} = f.context;
  await _query_op_value_check_both(f,"sameset",[],[c0]);
  await _query_op_value_check_both(f,"sameset",["Peugeot","Renault","Dakkar"],[]);
  await _query_op_value_check_both(f,"sameset",["Peugeot","Renault"],[]);
  await _query_op_value_check_both(f,"sameset",["Top1","Peugeot","Top2","Renault","Dakkar"],[c3]);
  await _query_op_value_check_both(f,"sameset",["Top1","Peugeot","Top2","Renault","Dakkar","Vieux"],[]);
  f.continue();
}

async function query_sameset_variable(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3} = f.context;
  await _query_op_variable_check_both(f,"sameset","Clio 3", "_tags", [c0]);
  await _query_op_variable_check_both(f,"sameset","Clio 2", "_tags", [c1]);
  await _query_op_variable_check_both(f,"sameset","3008 DKR", "_tags", [c2]);
  f.continue();
}

async function query_intersects_value(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3} = f.context;
  await _query_op_value_check_both(f,"intersects",[],[]);
  await _query_op_value_check_both(f,"intersects",["Trop"],[c1]);
  await _query_op_value_check_both(f,"intersects",["Peugeot","Renault","Dakkar"],[c1,c2,c3]);
  f.continue();
}

async function query_intersects_variable(f: Flux<Context>) {
  let {db, cc, ccc, c0, c1, c2, c3} = f.context;
  await _query_op_variable_check_both(f,"intersects","Clio 3", "_tags", []);
  await _query_op_variable_check_both(f,"intersects","Clio 2", "_tags", [c1,c3]);
  await _query_op_variable_check_both(f,"intersects","3008 DKR", "_tags", [c2,c3]);
  await _query_op_variable_check_both(f,"intersects","4008 DKR", "_tags", [c1,c2,c3]);
  f.continue();
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
      save_c0_c1_c2_modify_tags,
      query_cars,
      query_peugeots,
      query_eq_peugeots,
      query_ne_peugeots,
      query_in_c2,
      query_id_c2,
      query_peoples,
      { name: "clean", test: (f: any) => { f.setFirstElements([clean, destroyControlCenter]); f.continue(); } },
    ]},
    { name: "sort", tests: [
      { name: "init", test: (f: any) => { f.setFirstElements([createControlCenter, init]); f.continue(); } },
      save_c0_c1_c2_c3_p0_p1_p2_p3_p4,
      save_relation_c0p0_c1p0_c2p1,
      sort_c0_c1_c2_c3_asc,
      sort_c0_c1_c2_c3_dsc,
      { name: "clean", test: (f: any) => { f.setFirstElements([clean, destroyControlCenter]); f.continue(); } },
    ]},
    { name: "relations", tests: [
      { name: "init", test: (f: any) => { f.setFirstElements([createControlCenter, init]); f.continue(); } },
      save_c0_c1_c2_c3_p0_p1_p2_p3_p4,
      save_relation_c0p0_c1p0_c2p1,
      query_cars_peoples,
      query_cars_peoples_relation_in_scope,
      query_cars_peoples_constraint_on_relation,
      query_elementof,
      query_intersection,
      query_elementof_intersection,
      query_elementof_sub,
      query_elementof_c1c2,
      query_mother_father_peoples,
      query_father_tree,
      { name: "clean", test: (f: any) => { f.setFirstElements([clean, destroyControlCenter]); f.continue(); } },
    ]},
    { name: "mixed", tests: [
      { name: "init", test: (f: any) => { f.setFirstElements([createControlCenter, init]); f.continue(); } },
      save_c0_c1_c2_c3_p0_p1_p2_p3_p4,
      save_relation_c0p0_c1p0_c2p1,
      load_mixed_attributes,
      load_sub_attributes,
      load_sub_mult_attributes,
      query_union_cars_peoples,
      query_cars_sub_scope,
      query_parents,

      query_contains_value,
      query_contains_variable,

      query_subset_value,
      query_subset_variable,
      query_superset_value,
      query_superset_variable,

      query_sameset_value,
      query_sameset_variable,
      query_intersects_value,
      query_intersects_variable,

      { name: "clean", test: (f: any) => { f.setFirstElements([clean, destroyControlCenter]); f.continue(); } },
    ]},
    ]//, create1k, insert100, insert1k, insert1k_1by1Seq, insert1k_1by1Par];
}
