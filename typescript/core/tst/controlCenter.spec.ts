import {ControlCenter, NotificationCenter} from '@openmicrostep/aspects';
import {assert} from 'chai';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

function basics() {
  let c0 = {};
  let c1 = {};
  let cc = new ControlCenter();
  assert.instanceOf(cc.notificationCenter(), NotificationCenter);
  let R = Resource.installAspect(cc, 'test1');
  let r0 = new R();
  let r1 = new R();
  cc.registerComponent(c0);
  cc.registerComponent(c1);

  cc.registerObjects(c0, [r0]);
  assert.sameMembers([...cc.componentObjects(c0)], [r0]);
  assert.sameMembers([...cc.componentObjects(c1)], []);

  cc.unregisterObjects(c0, [r0]);
  assert.sameMembers([...cc.componentObjects(c0)], []);
  assert.sameMembers([...cc.componentObjects(c1)], []);

  cc.registerObjects(c1, [r0]);
  assert.sameMembers([...cc.componentObjects(c0)], []);
  assert.sameMembers([...cc.componentObjects(c1)], [r0]);

  cc.registerObjects(c0, [r0]);
  assert.sameMembers([...cc.componentObjects(c0)], [r0]);
  assert.sameMembers([...cc.componentObjects(c1)], [r0]);

  cc.unregisterComponent(c0);
  assert.throw(() => cc.componentObjects(c0), `you must register the component with 'registerComponent' before working with it`);
  assert.sameMembers([...cc.componentObjects(c1)], [r0]);

  assert.throw(() => cc.registerObjects(c0, [r0]), `you must register the component with 'registerComponent' before working with it`);
  assert.throw(() => cc.unregisterObjects(c0, [r0]), `you must register the component with 'registerComponent' before working with it`);
  assert.throw(() => cc.registerObject(c0, r0), `you must register the component with 'registerComponent' before working with it`);
  assert.throw(() => cc.unregisterObject(c0, r0), `you must register the component with 'registerComponent' before working with it`);

  cc.registerComponent(c0);
  assert.throw(() => cc.unregisterObjects(c0, [r0]), `cannot unregister an object that is not registered`);
  assert.throw(() => cc.unregisterObject(c0, r0), `cannot unregister an object that is not registered`);
  cc.unregisterComponent(c0);

  assert.throw(() => cc.unregisterObjects(c0, [r0]), `you must register the component with 'registerComponent' before working with it`);

  cc.registerObjects(c1, [r1]);
  assert.sameMembers([...cc.componentObjects(c1)], [r0, r1]);

  cc.unregisterObjects(c1, [r0]);
  assert.sameMembers([...cc.componentObjects(c1)], [r1]);

  assert.sameMembers(cc.swapObjects(c1, [r1], [r0]), [r0]);
  assert.sameMembers([...cc.componentObjects(c1)], [r0]);

  assert.strictEqual(cc.swapObject(c1, r0, r1), r1);
  assert.sameMembers([...cc.componentObjects(c1)], [r1]);

  cc.unregisterComponent(c1);
}

function cannot_mix_cc() {
  let cc1 = new ControlCenter();
  let cc2 = new ControlCenter();
  let c0 = {};
  let C1 = Car.installAspect(cc1, 'test1');
  let P1 = People.installAspect(cc1, 'test1');
  let C2 = Car.installAspect(cc2, 'test1');
  let P2 = People.installAspect(cc2, 'test1');
  let c2 = new C2();
  cc1.registerComponent(c0);
  assert.throw(() => cc1.registerObjects(c0, [c2]));
  assert.throw(() => c2._owner = new P1());
}

export const tests = { name: 'ControlCenter', tests: [
  basics,
  cannot_mix_cc,
]};
