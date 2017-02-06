import {VersionedObject, VersionedObjectManager, ControlCenter} from '@microstep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource} from '../../../generated/aspects.interfaces';
import {tests as tests_perfs} from './versionedObject.perfs.spec';

function basics() {
  let cc = new ControlCenter();
  let R = Resource.installAspect(cc, 'test1');
  let v = new R();
  assert.instanceOf(v, VersionedObject);
  assert.equal(v._version, -1);
  assert.typeOf(v._id, 'string');
  assert(VersionedObjectManager.isLocalId(v._id));
  assert.equal(v.manager().controlCenter(), cc);
  
  let v2 = new R();
  assert.instanceOf(v2, VersionedObject);
  assert.equal(v2._version, -1);
  assert.typeOf(v2._id, 'string');
  assert(VersionedObjectManager.isLocalId(v2._id));
  assert.notEqual(v._id, v2._id);

  assert.equal(v.id(), v._id);
  assert.equal(v2.id(), v2._id);
  assert.equal(v.version(), v._version);
  assert.equal(v2.version(), v2._version);

  assert.doesNotThrow(() => { v._id = v._id });
  assert.throw(() => { v._id = v2._id }, `cannot change identifier to a local identifier`);
  v._id = 2;
  assert.equal(v.id(), 2);
  assert.throw(() => { v._id = 3 }, `id can't be modified once assigned (not local)`);

  assert.throw(() => { v.name(); });
  v._name = "Resource Name";
  assert.equal(v.name(), "Resource Name");
  v._name = "Resource Name 2";
  assert.equal(v.name(), "Resource Name 2");

  assert.deepEqual(v.manager().diff(), { // only changed values
    "_id": 2,
    "_version": VersionedObjectManager.NextVersion,
    "_localAttributes": {
      "_name": "Resource Name 2"
    },
    "_versionAttributes": {},
  });

  assert.deepEqual(v.manager().snapshot(), { // complete object snapshot
    "_id": 2,
    "_version": VersionedObjectManager.NextVersion,
    "_localAttributes": {
      "_name": "Resource Name 2"
    },
    "_versionAttributes": {},
  });

  v.manager().setVersion(2);

  assert.deepEqual(v.manager().diff(), { // complete object snapshot
    "_id": 2,
    "_version": 2,
    "_localAttributes": {},
    "_versionAttributes": {},
  });
  assert.deepEqual(v.manager().snapshot(), { // complete object snapshot
    "_id": 2,
    "_version": 2,
    "_localAttributes": {},
    "_versionAttributes": {
      "_name": "Resource Name 2"
    },
  });
}

export const tests = { name: 'VersionedObject', tests: [
  basics,
  tests_perfs
]};
