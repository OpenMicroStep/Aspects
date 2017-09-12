import {VersionedObject, VersionedObjectManager, ControlCenter} from '@openmicrostep/aspects';
import './resource';
import {Resource} from '../../../generated/aspects.interfaces';

let localIdCounter = 0;
class ResourceNative {
  _id = `_localid:${++localIdCounter}`
  _version = -1
  _name?: string = undefined;
  name() { return this._name; }
};
function setup10k() { // around 100ms
  let i = 1e4;
  while (i-- > 0) {
    let cc = new ControlCenter();
    let R = Resource.installAspect(cc, 'test1');
    let v = new R();
  }
}
function new100k() { // around 100ms
  let cc = new ControlCenter();
  let R = Resource.installAspect(cc, 'test1');
  let i = 1e5;
  while (i-- > 0) {
    let v = new R();
  }
}
function get3M() { // around 100ms
  let cc = new ControlCenter();
  let R = Resource.installAspect(cc, 'test1');
  let v = new R();
  v._name = "this is cool";
  let i = 3 * 1e6;
  while (i-- > 0) {
    v.name();
  }
}
function set1M() { // around 100ms
  let cc = new ControlCenter();
  let R = Resource.installAspect(cc, 'test1');
  let v = new R();
  let i = 1e6;
  while (i-- > 0) {
    v._name = `${i}`;
  }
}
function newNative1M() { // around 100ms
  let i = 1e6;
  while (i-- > 0) {
    let v = new ResourceNative();
  }
}
function getNative200M() { // around 100ms
  let v = new ResourceNative();
  v._name = "this is cool";
  let i = 2 * 1e8;
  while (i-- > 0) {
    v.name();
  }
}
function setNative2M() { // around 100ms
  let v = new ResourceNative();
  let i = 2 * 1e6;
  while (i-- > 0) {
    v._name = `${i}`;
  }
}

export const tests = { name: 'perfs', tests: [
  setup10k,
  new100k,
  newNative1M,
  get3M,
  getNative200M,
  set1M,
  setNative2M,
]};
