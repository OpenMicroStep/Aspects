import {VersionedObject, VersionedObjectManager, ControlCenter, ImmutableSet} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import {tests as tests_perfs} from './versionedObject.perfs.spec';

function basics() {
  let cc = new ControlCenter();
  let R = Resource.installAspect(cc, 'test1');
  let C = Car.installAspect(cc, 'test1');
  let P = People.installAspect(cc, 'test1');
  let v1 = new R();
  assert.instanceOf(v1, R);
  assert.instanceOf(v1, Resource);
  assert.instanceOf(v1, VersionedObject);
  assert.equal(v1.version(), -1);
  assert.typeOf(v1.id(), 'string');
  assert(VersionedObjectManager.isLocalId(v1.id()));
  assert.equal(v1.manager().controlCenter(), cc);
  
  let v2 = new R();
  assert.instanceOf(v2, R);
  assert.instanceOf(v2, Resource);
  assert.instanceOf(v2, VersionedObject);
  assert.equal(v2.version(), -1);
  assert.typeOf(v2.id(), 'string');
  assert(VersionedObjectManager.isLocalId(v2.id()));
  assert.notEqual(v1.id(), v2.id());

  let c1 = new C();
  assert.notInstanceOf(c1, P);
  assert.notInstanceOf(c1, People);
  assert.instanceOf(c1, C);
  assert.instanceOf(c1, Car);
  assert.notInstanceOf(c1, R);
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

  let p1 = new P();
  assert.notInstanceOf(p1, C);
  assert.notInstanceOf(p1, Car);
  assert.instanceOf(p1, P);
  assert.instanceOf(p1, People);
  assert.notInstanceOf(p1, R);
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
  assert.doesNotThrow(() => { v1.manager().setId(v1.id()) });
  assert.throw(() => { v1.manager().setId(v2.id()) }, `cannot change identifier to a local identifier`);
  v1.manager().setId(2);
  assert.equal(v1.id(), 2);
  assert.throw(() => { v1.manager().setId(3) }, `id can't be modified once assigned (not local)`);
  assert.throw(() => { v1.name() }, `attribute '_name' is unaccessible and never was`);
  v1.manager().setVersion(2);
}

function shared() {
  let cc = new ControlCenter();
  let R = Resource.installAspect(cc, 'test1');
  let C = Car.installAspect(cc, 'test1');
  let P = People.installAspect(cc, 'test1');

  let c0 = new C();
  let c1 = c0.controlCenter().create<Car.Categories.local>(Car, ['local']);
  assert.instanceOf(c1, C);
  assert.instanceOf(c1, Car);
}

function relation() {
  let cc = new ControlCenter();
  let C = Car.installAspect(cc, 'test1');
  let P = People.installAspect(cc, 'test1');

  let c0 = new C();
  let c1 = new C();
  let p0 = new P();

  c0._owner = p0;
  assert.equal(c0._owner, p0);
  assert.sameMembers([...p0._cars], [c0]);
  p0._cars = new Set(p0._cars).add(c1);
  assert.sameMembers([...p0._cars], [c0, c1]);
  assert.equal(c0._owner, p0);
  assert.equal(c1._owner, p0);

  assert.sameMembers([...p0._drivenCars], []);
  assert.sameMembers([...c0._drivers], []);
  assert.sameMembers([...c1._drivers], []);
  p0._drivenCars = new Set(p0._drivenCars).add(c0).add(c1);
  assert.sameMembers([...p0._drivenCars], [c0, c1]);
  assert.sameMembers([...c0._drivers], [p0]);
  assert.sameMembers([...c1._drivers], [p0]);
}
export const tests = { name: 'VersionedObject', tests: [
  basics,
  shared,
  relation,
  tests_perfs
]};
