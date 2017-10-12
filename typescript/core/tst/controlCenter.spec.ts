import {ControlCenter, NotificationCenter, AspectConfiguration, AspectSelection} from '@openmicrostep/aspects';
import {assert} from 'chai';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

function basics() {
  let c0 = {};
  let c1 = {};
  let cc = new ControlCenter(new AspectConfiguration(new AspectSelection([
    Resource.Aspects.test1,
  ])));
  assert.instanceOf(cc.notificationCenter(), NotificationCenter);
  let ccc = cc.registerComponent({});
  let r0 = Resource.Aspects.test1.create(ccc);
  let r1 = Resource.Aspects.test1.create(ccc);
  cc.registerComponent(c0);
  cc.registerComponent(c1);

  cc.ccc(c0).registerObjects([r0]);
  assert.sameMembers([...cc.ccc(c0).componentObjects()], [r0]);
  assert.sameMembers([...cc.ccc(c1).componentObjects()], []);

  cc.ccc(c0).unregisterObjects([r0]);
  assert.sameMembers([...cc.ccc(c0).componentObjects()], []);
  assert.sameMembers([...cc.ccc(c1).componentObjects()], []);

  cc.ccc(c1).registerObjects([r0]);
  assert.sameMembers([...cc.ccc(c0).componentObjects()], []);
  assert.sameMembers([...cc.ccc(c1).componentObjects()], [r0]);

  cc.ccc(c0).registerObjects([r0]);
  assert.sameMembers([...cc.ccc(c0).componentObjects()], [r0]);
  assert.sameMembers([...cc.ccc(c1).componentObjects()], [r0]);

  cc.unregisterComponent(c0);
  assert.throw(() => cc.ccc(c0).componentObjects(), `you must register the component with 'registerComponent' before working with it`);
  assert.sameMembers([...cc.ccc(c1).componentObjects()], [r0]);

  assert.throw(() => cc.ccc(c0).registerObjects([r0]), `you must register the component with 'registerComponent' before working with it`);
  assert.throw(() => cc.ccc(c0).unregisterObjects([r0]), `you must register the component with 'registerComponent' before working with it`);
  assert.throw(() => cc.ccc(c0).registerObject(r0), `you must register the component with 'registerComponent' before working with it`);
  assert.throw(() => cc.ccc(c0).unregisterObject(r0), `you must register the component with 'registerComponent' before working with it`);

  cc.registerComponent(c0);
  assert.throw(() => cc.ccc(c0).unregisterObjects([r0]), `cannot unregister an object that is not registered`);
  assert.throw(() => cc.ccc(c0).unregisterObject(r0), `cannot unregister an object that is not registered`);
  cc.unregisterComponent(c0);

  assert.throw(() => cc.ccc(c0).unregisterObjects([r0]), `you must register the component with 'registerComponent' before working with it`);

  cc.ccc(c1).registerObjects([r1]);
  assert.sameMembers([...cc.ccc(c1).componentObjects()], [r0, r1]);

  cc.ccc(c1).unregisterObjects([r0]);
  assert.sameMembers([...cc.ccc(c1).componentObjects()], [r1]);

  assert.sameMembers(cc.ccc(c1).swapObjects([r1], [r0]), [r0]);
  assert.sameMembers([...cc.ccc(c1).componentObjects()], [r0]);

  assert.strictEqual(cc.ccc(c1).swapObject(r0, r1), r1);
  assert.sameMembers([...cc.ccc(c1).componentObjects()], [r1]);

  cc.unregisterComponent(c1);
}

function cannot_mix_cc() {
  let cfg = new AspectConfiguration(new AspectSelection([
    Car.Aspects.test1,
    People.Aspects.test1,
  ]));
  let cc1 = new ControlCenter(cfg);
  let cc2 = new ControlCenter(cfg);
  let ccc1 = cc1.registerComponent({});
  let ccc2 = cc2.registerComponent({});
  let cc1_car = ccc1.create<Car.Aspects.test1>("Car");
  assert.throw(() => ccc2.registerObject(cc1_car), `you can't register an object that is associated with another control center`);
  assert.throw(() => cc1_car._owner = ccc2.create<People.Aspects.test1>("People"));
}

export const tests = { name: 'ControlCenter', tests: [
  basics,
  cannot_mix_cc,
]};
