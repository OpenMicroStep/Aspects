import {ControlCenter, AspectConfiguration, AspectSelection} from '@openmicrostep/aspects';
import './resource';
import {People, Car} from '../../../generated/aspects.interfaces';
import {assert} from 'chai';

const ONE_K = 1e3;
const ONE_M = 1e6;
const ONE_B = 1e9;

const cfg = new AspectConfiguration(new AspectSelection([
  People.Aspects.test1,
  Car.Aspects.test1
]));
let localIdCounter = 0;
class PeopleNative {
  _id = `_localid:${++localIdCounter}`;
  _version = -1;
  _name?: string = undefined;

  _firstname?: string = undefined;
  _lastname?: string = undefined;
  _father?: People = undefined;
  _mother?: People = undefined;
  _childrens_by_father?: People[] = [];
  _childrens_by_mother?: People[] = [];
  _cars?: Car[] = [];
  _drivenCars?: Car[] = [];
  _birthDate?: Date = undefined;

  name() { return this._name; }
  firstname() { return this._firstname; }
  lastname() { return this._lastname; }
};
function controlCenter_creation_1_000_0000() { // around 100ms
  let i = ONE_M;
  while (i-- > 0) {
    new ControlCenter(cfg);
  }
}
function create_1_000_0000() { // around 100ms
  let cc = new ControlCenter(cfg);
  let cstor = cc.configuration().cstor("People", [])
  let i = ONE_M;
  while (i-- > 0) {
    new cstor(cc);
  }
}
function create_native_1_000_0000() { // around 100ms
  let i = ONE_M;
  while (i-- > 0) {
    new PeopleNative();
  }
}
function create_register_unregister_100_000() { // around 100ms
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let i = 100 * ONE_K;
  while (i-- > 0) {
    ccc.unregisterObject(People.Aspects.test1.create(ccc));
  }
}
function property_access_warm() { // around 100ms
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v = People.Aspects.test1.create(ccc);
  let v2 = People.Aspects.test1.create(ccc);
  v2.manager().setId(2);
  for (let i = 0; i < 50; i++)
    assert.throw(() => { v2._name; });
  property_access_warm_opt(v);
}
function property_access_warm_opt(v) {
  let i = ONE_K;
  while (i-- > 0) {
    v.name();
    v._firstname;
    v._lastname;
  }
  v._name = "this is cool";
  v._firstname = "first name";
  v._lastname = "last name";
  i = ONE_K;
  while (i-- > 0) {
    v.name();
    v._firstname;
    v._lastname;
  }
  v.manager().setId(1);
  v.manager().setVersion(1);
  i = ONE_K;
  while (i-- > 0) {
    v.name();
    v._firstname;
    v._lastname;
  }
}
function property_access_10_000_000_000_modified() { // around 100ms
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v = People.Aspects.test1.create(ccc);
  assert.strictEqual(property_access_10B_modified_opt(v), 310000000);
}
function property_access_10B_modified_opt(v) { // around 100ms
  v._name = "this is cool";
  v._firstname = "first name";
  v._lastname = "last name";
  let i = 10 * ONE_M;
  let r = 0;
  while (i-- > 0) {
    r += v.name().length;
    r += v._firstname.length;
    r += v._lastname.length;
  }
  return r;
}

function property_access_10_000_000_000_saved() { // around 100ms
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v = People.Aspects.test1.create(ccc);
  v._name = "this is cool";
  v._firstname = "first name";
  v._lastname = "last name";
  v.manager().setId(1);
  v.manager().setVersion(1);
  assert.strictEqual(property_access_10B_saved_opt(v), 310000000);
}

function property_access_10B_saved_opt(v) { // around 100ms
  let i = 10 * ONE_M;
  let r = 0;
  while (i-- > 0) {
    r += v.name().length;
    r += v._firstname.length;
    r += v._lastname.length;
  }
  return r;
}

function property_access_10_000_000_000_mixed() { // around 100ms
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v1 = People.Aspects.test1.create(ccc);
  v1._name = "this is cool 1";
  v1._firstname = "first name 1";
  v1._lastname = "last name 1";
  v1.manager().setId(1);
  v1.manager().setVersion(1);
  let v2 = People.Aspects.test1.create(ccc);
  v2._name = "this is cool 2";
  v2._firstname = "first name 2";
  v2._lastname = "last name 2";
  assert.strictEqual(property_access_10B_mixed_opt(v1, v2), 370000000);
}
function property_access_10B_mixed_opt(v1, v2) { // around 100ms
  let i = 10 * ONE_M / 2;
  let r = 0;
  while (i-- > 0) {
    r += v1.name().length;
    r += v2.name().length;
    r += v1._firstname.length;
    r += v2._firstname.length;
    r += v1._lastname.length;
    r += v2._lastname.length;
  }
  return r;
}

function property_access_native_10_000_000_000() { // around 100ms
  let v = new PeopleNative();
  v._name = "this is cool";
  v._firstname = "first name";
  v._lastname = "last name";
  assert.strictEqual(property_access_native_10B_opt(v), 310000000);
}

function property_access_native_10B_opt(v) {
  let i = 10 * ONE_M;
  let r = 0;
  while (i-- > 0) {
    r += v.name()!.length;
    r += v._firstname.length;
    r += v._lastname.length;
  }
  return r;
}

function property_set_1_000_000() { // around 100ms
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v = People.Aspects.test1.create(ccc);
  let i = ONE_M;
  while (i-- > 0) {
    v._name = `${i}`;
    v._firstname = `f${i}`;
    v._lastname = `l${i}`;
  }
}
function property_set_native_1_000_000() { // around 100ms
  let v = new PeopleNative();
  let i = ONE_M;
  while (i-- > 0) {
    v._name = `${i}`;
    v._firstname = `f${i}`;
    v._lastname = `l${i}`;
  }
}

const test_list = [
  controlCenter_creation_1_000_0000,
  create_1_000_0000,
  create_native_1_000_0000,
  create_register_unregister_100_000,
  property_access_10_000_000_000_modified,
  property_access_10_000_000_000_saved,
  property_access_10_000_000_000_mixed,
  property_access_native_10_000_000_000,
  property_set_1_000_000,
  property_set_native_1_000_000,
]
export const tests = { name: 'perfs', tests: [
  { name: 'warmup', tests: [
    property_access_warm,
    ...test_list,
    function wait_a_bit(flux) {
      setTimeout(() => flux.continue(), 1000);
    }
  ]},
  { name: 'warm1', tests: [
    ...test_list,
    function wait_a_bit_more(flux) {
      setTimeout(() => flux.continue(), 1000);
    }
  ]},
  { name: 'warm2', tests: [
    ...test_list,
  ]},
]};
