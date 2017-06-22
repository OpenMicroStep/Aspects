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
  assert.sameMembers(cc.registeredObjects(c0), [r0]);
  assert.sameMembers(cc.registeredObjects(c1), []);

  cc.unregisterObjects(c0, [r0]);
  assert.sameMembers(cc.registeredObjects(c0), []);
  assert.sameMembers(cc.registeredObjects(c1), []);

  cc.registerObjects(c1, [r0]);
  assert.sameMembers(cc.registeredObjects(c0), []);
  assert.sameMembers(cc.registeredObjects(c1), [r0]);

  cc.registerObjects(c0, [r0]);
  assert.sameMembers(cc.registeredObjects(c0), [r0]);
  assert.sameMembers(cc.registeredObjects(c1), [r0]);

  cc.unregisterComponent(c0);
  assert.sameMembers(cc.registeredObjects(c0), []);
  assert.sameMembers(cc.registeredObjects(c1), [r0]);

  assert.throw(() => cc.registerObjects(c0, [r0]), `you must register the component with 'registerComponent' before registering objects`);
  assert.throw(() => cc.unregisterObjects(c0, [r0]), `cannot unregister an object that is not registered`);

  cc.registerObjects(c1, [r0]);
  assert.throw(() => cc.unregisterObjects(c0, [r0]), `cannot unregister an object that is not registered by the given component`);

  cc.registerObjects(c1, [r0, r1]);
  assert.sameMembers(cc.registeredObjects(c0), []);
  assert.sameMembers(cc.registeredObjects(c1), [r0, r1]);

  cc.unregisterObjects(c1, [r0]);
  assert.sameMembers(cc.registeredObjects(c0), []);
  assert.sameMembers(cc.registeredObjects(c1), [r1]);

  assert.sameMembers(cc.swapObjects(c1, [r1], [r0]), [r0]);
  assert.sameMembers(cc.registeredObjects(c0), []);
  assert.sameMembers(cc.registeredObjects(c1), [r0]);

  assert.strictEqual(cc.swapObject(c1, r0, r1), r1);
  assert.sameMembers(cc.registeredObjects(c0), []);
  assert.sameMembers(cc.registeredObjects(c1), [r1]);

  cc.unregisterComponent(c1);
}

export const tests = { name: 'NotificationCenter', tests: [
  basics
]};
