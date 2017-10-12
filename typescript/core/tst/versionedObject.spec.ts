import {VersionedObject, VersionedObjectManager, ControlCenter, AspectConfiguration, AspectSelection} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import {tests as tests_perfs} from './versionedObject.perfs.spec';

const cfg = new AspectConfiguration(new AspectSelection([
  Resource.Aspects.test1,
  Car.Aspects.test1,
  People.Aspects.test1,
]));
function basics() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v1 = Resource.Aspects.test1.create(ccc);
  assert.instanceOf(v1, Resource);
  assert.instanceOf(v1, VersionedObject);
  assert.equal(v1.version(), -1);
  assert.typeOf(v1.id(), 'string');
  assert(VersionedObjectManager.isLocalId(v1.id()));
  assert.equal(v1.manager().controlCenter(), cc);

  let v2 = Resource.Aspects.test1.create(ccc);
  assert.instanceOf(v2, Resource);
  assert.instanceOf(v2, VersionedObject);
  assert.equal(v2.version(), -1);
  assert.typeOf(v2.id(), 'string');
  assert(VersionedObjectManager.isLocalId(v2.id()));
  assert.notEqual(v1.id(), v2.id());

  let c1 = Car.Aspects.test1.create(ccc);
  assert.notInstanceOf(c1, People);
  assert.instanceOf(c1, Car);
  assert.instanceOf(c1, Resource);
  assert.instanceOf(c1, VersionedObject);
  assert.equal(c1.version(), -1);
  assert.typeOf(c1.id(), 'string');
  assert(VersionedObjectManager.isLocalId(c1.id()));
  assert.notEqual(c1.id(), v1.id());
  assert.notEqual(c1.id(), v2.id());
  assert.equal(c1.name(), undefined);
  assert.equal(c1.model(), undefined);
  c1._name = "MyCar";
  c1._model = "MyModel";
  assert.equal(c1.name(), `MyCar - MyModel`);
  assert.equal(c1.model(), `MyModel`);

  let p1 = People.Aspects.test1.create(ccc);
  assert.notInstanceOf(p1, Car);
  assert.instanceOf(p1, People);
  assert.instanceOf(p1, Resource);
  assert.instanceOf(p1, VersionedObject);
  assert.equal(p1.version(), -1);
  assert.typeOf(p1.id(), 'string');
  assert(VersionedObjectManager.isLocalId(p1.id()));
  assert.notEqual(p1.id(), v1.id());
  assert.notEqual(p1.id(), v2.id());
  assert.equal(p1.name(), undefined);
  p1._name = "MyPeople";
  assert.equal(p1.name(), `MyPeople`);
  assert.instanceOf(p1.birthDate(), Date);

  assert.equal(v1.id(), v1.id());
  assert.equal(v2.id(), v2.id());
  assert.equal(v1.version(), v1.version());
  assert.equal(v2.version(), v2.version());

  assert.equal(v1.name(), undefined);
  assert.doesNotThrow(() => { v1.manager().setId(v1.id()); });
  assert.throw(() => { v1.manager().setId(v2.id()); }, `cannot change identifier to a local identifier`);
  v1.manager().setId(2);
  assert.equal(v1.id(), 2);
  assert.throw(() => { v1.manager().setId(3); }, `id can't be modified once assigned (not local)`);
  assert.throw(() => { v1.name(); }, `attribute '_name' is unaccessible and never was`);
  v1.manager().setVersion(2);
}

function shared() {
  let cc = new ControlCenter(cfg);
  cc.safe(ccc => {
    let c1 = ccc.create<Car.Categories.local>("Car", ['local']);
    assert.instanceOf(c1, Car);
  });
}

function relation_1_n() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let c0 = Car.Aspects.test1.create(ccc);
  let c1 = Car.Aspects.test1.create(ccc);
  let p0 = People.Aspects.test1.create(ccc);

  c0._owner = p0;
  assert.equal(c0._owner, p0);
  assert.sameMembers([...p0._cars], [c0]);
  p0._cars = new Set(p0._cars).add(c1);
  assert.sameMembers([...p0._cars], [c0, c1]);
  assert.equal(c0._owner, p0);
  assert.equal(c1._owner, p0);

  c0._owner = undefined;
  assert.sameMembers([...p0._cars], [c1]);
  assert.equal(c0._owner, undefined);
  assert.equal(c1._owner, p0);

  let d = new Set(p0._cars); d.delete(c1);
  p0._cars = d;
  assert.sameMembers([...p0._cars], []);
  assert.equal(c0._owner, undefined);
  assert.equal(c1._owner, undefined);
}

function relation_n_n() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let c0 = Car.Aspects.test1.create(ccc);
  let c1 = Car.Aspects.test1.create(ccc);
  let p0 = People.Aspects.test1.create(ccc);

  assert.sameMembers([...p0._drivenCars], []);
  assert.sameMembers([...c0._drivers], []);
  assert.sameMembers([...c1._drivers], []);
  p0._drivenCars = new Set(p0._drivenCars).add(c0).add(c1);
  assert.sameMembers([...p0._drivenCars], [c0, c1]);
  assert.sameMembers([...c0._drivers], [p0]);
  assert.sameMembers([...c1._drivers], [p0]);

  let d = new Set(p0._drivenCars); d.delete(c0); d.delete(c1);
  p0._drivenCars = d;
  assert.sameMembers([...p0._drivenCars], []);
  assert.sameMembers([...c0._drivers], []);
  assert.sameMembers([...c1._drivers], []);
}

export const tests = { name: 'VersionedObject', tests: [
  basics,
  shared,
  relation_1_n,
  relation_n_n,
  tests_perfs
]};
