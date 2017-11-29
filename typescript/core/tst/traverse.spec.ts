import {
  Aspect, AspectSelection, AspectConfiguration, ControlCenter,
  VersionedObject, VersionedObjectManager, VersionedObjectSnapshot,
  traverseModifedScope, traverseSavedScope, traverseCurrentScope, traverseAllScope,
} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People, Point, Polygon, RootObject} from '../../../generated/aspects.interfaces';
import {tests as tests_perfs} from './versionedObject.perfs.spec';

const cfg = new AspectConfiguration(new AspectSelection([
  Resource.Aspects.test1,
  Car.Aspects.test1,
  People.Aspects.test1,
  Point.Aspects.test1,
  Polygon.Aspects.test1,
  RootObject.Aspects.test1,
]));

function traverse_modifed() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let r0 = RootObject.Aspects.test1.create(ccc);
  let s0 = Polygon.Aspects.test1.create(ccc);
  let p0 = Point.Aspects.test1.create(ccc);
  let p1 = Point.Aspects.test1.create(ccc);
  let p2 = Point.Aspects.test1.create(ccc);
  assert.sameMembers([...traverseModifedScope([r0], ['_s0'])], [r0]);
  assert.sameMembers([...traverseModifedScope([r0], { RootObject: { '_': ['_s0'] } })], [r0]);
  assert.sameMembers([...traverseModifedScope([r0], { _: { '_': ['_s0'] } })], [r0]);
  assert.sameMembers([...traverseModifedScope([r0], { RootObject: { '.': ['_s0'] } })], [r0]);
  assert.sameMembers([...traverseModifedScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseModifedScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0]);

  r0._s0 = s0;
  assert.sameMembers([...traverseModifedScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseModifedScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseModifedScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseModifedScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0]);

  s0._set = new Set([p0, p1, p2]);
  assert.sameMembers([...traverseModifedScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseModifedScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseModifedScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseModifedScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0, p0, p1, p2]);
}


function traverse_saved() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let r0 = RootObject.Aspects.test1.create(ccc);
  let s0 = Polygon.Aspects.test1.create(ccc);
  let p0 = Point.Aspects.test1.create(ccc);
  let p1 = Point.Aspects.test1.create(ccc);
  let p2 = Point.Aspects.test1.create(ccc);
  assert.sameMembers([...traverseSavedScope([r0], ['_s0'])], [r0]);
  assert.sameMembers([...traverseSavedScope([r0], { RootObject: { '.': ['_s0'] } })], [r0]);
  assert.sameMembers([...traverseSavedScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseSavedScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0]);

  r0._s0 = s0;
  s0._set = new Set([p0, p1, p2]);
  assert.sameMembers([...traverseSavedScope([r0], ['_s0'])], [r0]);
  assert.sameMembers([...traverseSavedScope([r0], { RootObject: { '.': ['_s0'] } })], [r0]);
  assert.sameMembers([...traverseSavedScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseSavedScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0]);

  [r0].map((vo, idx) => { vo.manager().setId(`0${idx}`); vo.manager().setVersion(0); });
  assert.sameMembers([...traverseSavedScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseSavedScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseSavedScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseSavedScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0]);

  [s0].map((vo, idx) => { vo.manager().setId(`1${idx}`); vo.manager().setVersion(0); });
  assert.sameMembers([...traverseSavedScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseSavedScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseSavedScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseSavedScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0, p0, p1, p2]);
}

function traverse_all() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let r0 = RootObject.Aspects.test1.create(ccc);
  let s0 = Polygon.Aspects.test1.create(ccc);
  let p0 = Point.Aspects.test1.create(ccc);
  let p1 = Point.Aspects.test1.create(ccc);
  let p2 = Point.Aspects.test1.create(ccc);
  assert.sameMembers([...traverseAllScope([r0], ['_s0'])], [r0]);
  assert.sameMembers([...traverseAllScope([r0], { RootObject: { '.': ['_s0'] } })], [r0]);
  assert.sameMembers([...traverseAllScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseAllScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0]);

  r0._s0 = s0;
  assert.sameMembers([...traverseAllScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseAllScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseAllScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseAllScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0]);

  s0._set = new Set([p0, p1, p2]);
  assert.sameMembers([...traverseAllScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseAllScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseAllScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseAllScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0, p0, p1, p2]);

  [r0].map((vo, idx) => { vo.manager().setId(`0${idx}`); vo.manager().setVersion(0); });
  assert.sameMembers([...traverseAllScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseAllScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseAllScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseAllScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0, p0, p1, p2]);

  [s0].map((vo, idx) => { vo.manager().setId(`1${idx}`); vo.manager().setVersion(0); });
  assert.sameMembers([...traverseAllScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseAllScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseAllScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseAllScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0, p0, p1, p2]);
}

function traverse_current() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let r0 = RootObject.Aspects.test1.create(ccc);
  let s0 = Polygon.Aspects.test1.create(ccc);
  let p0 = Point.Aspects.test1.create(ccc);
  let p1 = Point.Aspects.test1.create(ccc);
  let p2 = Point.Aspects.test1.create(ccc);
  assert.sameMembers([...traverseCurrentScope([r0], ['_s0'])], [r0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': ['_s0'] } })], [r0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseCurrentScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0]);

  r0._s0 = s0;
  assert.sameMembers([...traverseCurrentScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseCurrentScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0]);

  s0._set = new Set([p0, p1, p2]);
  assert.sameMembers([...traverseCurrentScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseCurrentScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0, p0, p1, p2]);

  [r0].map((vo, idx) => { vo.manager().setId(`0${idx}`); vo.manager().setVersion(0); });
  assert.sameMembers([...traverseCurrentScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseCurrentScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0, p0, p1, p2]);

  [s0].map((vo, idx) => { vo.manager().setId(`1${idx}`); vo.manager().setVersion(0); });
  assert.sameMembers([...traverseCurrentScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseCurrentScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0, p0, p1, p2]);

  s0._set = new Set([p0, p2]);
  assert.sameMembers([...traverseCurrentScope([r0], ['_s0'])], [r0, s0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': ['_s0'] } })], [r0, s0]);
  assert.sameMembers([...traverseCurrentScope([r0], { RootObject: { '.': [] } })], [r0]);
  assert.sameMembers([...traverseCurrentScope([r0], {
    RootObject: { '.': ['_s0'] },
    Polygon: { '_s0.': ['_set'] },
  })], [r0, s0, p0, p2]);
}

export const tests = { name: 'traverse', tests: [
  traverse_modifed,
  traverse_saved,
  traverse_all,
  traverse_current,
]};
