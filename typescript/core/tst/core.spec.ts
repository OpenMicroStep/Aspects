import {tests as versionedobject_tests} from './versionedObject.spec';
import {tests as notificationCenter_tests} from './notificationCenter.spec';
import {tests as controlCenter_tests} from './controlCenter.spec';

export const name = "core";
export const tests = [
  versionedobject_tests,
  notificationCenter_tests,
  controlCenter_tests,
];
