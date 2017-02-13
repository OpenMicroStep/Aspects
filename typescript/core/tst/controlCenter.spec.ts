import {ControlCenter, NotificationCenter} from '@microstep/aspects';
import {assert} from 'chai';

function basics() {
  let cc = new ControlCenter();
  assert.instanceOf(cc.notificationCenter(), NotificationCenter);
}

export const tests = { name: 'NotificationCenter', tests: [
  basics
]};
