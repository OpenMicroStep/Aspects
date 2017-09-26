import {ControlCenter, AspectConfiguration} from '@openmicrostep/aspects';
import './resource';
import {Resource} from '../../../generated/aspects.interfaces';

let localIdCounter = 0;
class ResourceNative {
  _id = `_localid:${++localIdCounter}`;
  _version = -1;
  _name?: string = undefined;
  name() { return this._name; }
};
function setup10k() { // around 100ms
  let i = 1e4;
  let cfg = new AspectConfiguration([
    Resource.Aspects.test1
  ]);
  while (i-- > 0) {
    new ControlCenter(cfg);
  }
}
function new100k_factory() { // around 100ms
  let cfg = new AspectConfiguration([
    Resource.Aspects.test1
  ]);
  let cc = new ControlCenter(cfg);
  let R = Resource.Aspects.test1.factory(cc);
  let i = 1e5;
  while (i-- > 0) {
    new R();
  }
}
function new100k_create() { // around 100ms
  let cfg = new AspectConfiguration([
    Resource.Aspects.test1
  ]);
  let cc = new ControlCenter(cfg);
  let i = 1e5;
  while (i-- > 0) {
    cc.create("Resource");
  }
}
function new100k_create_test1() { // around 100ms
  let cfg = new AspectConfiguration([
    Resource.Aspects.test1
  ]);
  let cc = new ControlCenter(cfg);
  let i = 1e5;
  while (i-- > 0) {
    Resource.Aspects.test1.create(cc);
  }
}
function get3M() { // around 100ms
  let cfg = new AspectConfiguration([
    Resource.Aspects.test1
  ]);
  let cc = new ControlCenter(cfg);
  let R = Resource.Aspects.test1.factory(cc);
  let v = new R();
  v._name = "this is cool";
  let i = 3 * 1e6;
  while (i-- > 0) {
    v.name();
  }
}
function set1M() { // around 100ms
  let cfg = new AspectConfiguration([
    Resource.Aspects.test1
  ]);
  let cc = new ControlCenter(cfg);
  let R = Resource.Aspects.test1.factory(cc);
  let v = new R();
  let i = 1e6;
  while (i-- > 0) {
    v._name = `${i}`;
  }
}
function newNative1M() { // around 100ms
  let i = 1e6;
  while (i-- > 0) {
    new ResourceNative();
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
  new100k_factory,
  new100k_create,
  new100k_create_test1,
  newNative1M,
  get3M,
  getNative200M,
  set1M,
  setNative2M,
]};
