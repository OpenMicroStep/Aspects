import {tests as versionedobject_tests} from './versionedObject.spec';
import {tests as notificationCenter_tests} from './notificationCenter.spec';
import {tests as controlCenter_tests} from './controlCenter.spec';
import {tests as datasource_scope_tests} from './datasource.scope.spec';
import {tests as datasource_query_tests} from './datasource.query.spec';
import {tests as datasource_memory_tests} from './datasource.memory.spec';
import {tests as transport_tests} from './transport.spec';

export const name = "core";
export const tests = [
  versionedobject_tests,
  notificationCenter_tests,
  controlCenter_tests,
  datasource_scope_tests,
  datasource_query_tests,
  datasource_memory_tests,
  transport_tests,
];
