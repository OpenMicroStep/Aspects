import {
  Aspect, AspectSelection, AspectConfiguration, ControlCenter,
  VersionedObject, VersionedObjectManager, VersionedObjectSnapshot, Identifier,
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

function snapshot() {
  let cc = new ControlCenter(cfg);
  let aspect_resource = cfg.aspectChecked("Resource");
  let ccc = cc.registerComponent({});

  let snapshot = new VersionedObjectSnapshot(aspect_resource, "s1");
  assert.strictEqual(snapshot.id(), "s1");
  assert.strictEqual(snapshot.attributeValueFast(Aspect.attribute_id), "s1");
  assert.strictEqual(snapshot.attributeValueFast(Aspect.attribute_version), undefined);
  assert.strictEqual(snapshot.attributeValueFast(aspect_resource.checkedAttribute("_name")), undefined);
  assert.throw(() => snapshot.version(), `no version in this snapshot`);
  assert.isTrue(snapshot.hasAttributeValueFast(Aspect.attribute_id));
  assert.isFalse(snapshot.hasAttributeValueFast(Aspect.attribute_version));
  assert.isFalse(snapshot.hasAttributeValueFast(aspect_resource.checkedAttribute("_name")));

  snapshot.setAttributeValueFast(Aspect.attribute_version, 3);
  assert.strictEqual(snapshot.version(), 3);
  assert.strictEqual(snapshot.attributeValueFast(Aspect.attribute_version), 3);
  assert.isTrue(snapshot.hasAttributeValueFast(Aspect.attribute_id));
  assert.isTrue(snapshot.hasAttributeValueFast(Aspect.attribute_version));
  assert.isFalse(snapshot.hasAttributeValueFast(aspect_resource.checkedAttribute("_name")));

  snapshot.setAttributeValueFast(aspect_resource.checkedAttribute("_name"), "test3");
  assert.strictEqual(snapshot.attributeValueFast(aspect_resource.checkedAttribute("_name")), "test3");
  assert.isTrue(snapshot.hasAttributeValueFast(Aspect.attribute_id));
  assert.isTrue(snapshot.hasAttributeValueFast(Aspect.attribute_version));
  assert.isTrue(snapshot.hasAttributeValueFast(aspect_resource.checkedAttribute("_name")));
}

function basics() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v1 = Resource.Aspects.test1.create(ccc);
  let v1_aspect = v1.manager().aspect();

  assert.strictEqual(v1.manager().aspect(), cfg.aspectChecked("Resource"));
  assert.isTrue(v1.manager().isNew());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.instanceOf(v1, Resource);
  assert.instanceOf(v1, VersionedObject);
  assert.equal(v1.version(), -1);
  assert.strictEqual(v1.manager().object(), v1);
  assert.typeOf(v1.id(), 'string');
  assert(VersionedObjectManager.isLocalId(v1.id()));
  assert.equal(v1.manager().controlCenter(), cc);
  assert.sameOrderedMembers([...v1.manager().modifiedAttributes()], []);
  assert.sameOrderedMembers([...v1.manager().outdatedAttributes()], []);

  let v2 = Resource.Aspects.test1.create(ccc);
  assert.instanceOf(v2, Resource);
  assert.instanceOf(v2, VersionedObject);
  assert.equal(v2.version(), -1);
  assert.typeOf(v2.id(), 'string');
  assert(VersionedObjectManager.isLocalId(v2.id()));
  assert.notEqual(v1.id(), v2.id());

  let c1 = Car.Aspects.test1.create(ccc);
  assert.notInstanceOf(c1, People);
  assert.instanceOf(c1, Car);
  assert.instanceOf(c1, Resource);
  assert.instanceOf(c1, VersionedObject);
  assert.equal(c1.version(), -1);
  assert.typeOf(c1.id(), 'string');
  assert(VersionedObjectManager.isLocalId(c1.id()));
  assert.notEqual(c1.id(), v1.id());
  assert.notEqual(c1.id(), v2.id());

  assert.isTrue(c1.manager().isNew());
  assert.isFalse(c1.manager().isModified());
  assert.isFalse(c1.manager().isSaved());
  assert.isFalse(c1.manager().isInConflict());
  assert.isFalse(c1.manager().isPendingDeletion());
  assert.sameOrderedMembers([...c1.manager().modifiedAttributes()], []);
  assert.sameOrderedMembers([...c1.manager().outdatedAttributes()], []);

  assert.equal(c1.name(), undefined);
  assert.equal(c1.model(), undefined);

  assert.isTrue(c1.manager().isNew());
  assert.isFalse(c1.manager().isModified());
  assert.isFalse(c1.manager().isSaved());
  assert.isFalse(c1.manager().isInConflict());
  assert.isFalse(c1.manager().isPendingDeletion());

  c1._name = "MyCar";
  c1._model = "MyModel";
  assert.equal(c1.name(), `MyCar - MyModel`);
  assert.equal(c1.model(), `MyModel`);
  assert.isTrue(c1.manager().isNew());
  assert.isTrue(c1.manager().isModified());
  assert.isFalse(c1.manager().isSaved());
  assert.isFalse(c1.manager().isInConflict());
  assert.isFalse(c1.manager().isPendingDeletion());
  assert.sameDeepOrderedMembers([...c1.manager().modifiedAttributes()], [
    { attribute: c1.manager().aspect().checkedAttribute("_name"), modified: "MyCar" },
    { attribute: c1.manager().aspect().checkedAttribute("_model"), modified: "MyModel" },
  ]);
  assert.sameOrderedMembers([...c1.manager().outdatedAttributes()], []);

  c1.manager().setAttributeValue("_name", "MyCar2");
  assert.sameDeepOrderedMembers([...c1.manager().modifiedAttributes()], [
    { attribute: c1.manager().aspect().checkedAttribute("_name"), modified: "MyCar2" },
    { attribute: c1.manager().aspect().checkedAttribute("_model"), modified: "MyModel" },
  ]);

  c1.manager().clearAllModifiedAttributes();
  assert.isTrue(c1.manager().isNew());
  assert.isFalse(c1.manager().isModified());
  assert.isFalse(c1.manager().isSaved());
  assert.isFalse(c1.manager().isInConflict());
  assert.isFalse(c1.manager().isPendingDeletion());
  assert.sameOrderedMembers([...v1.manager().modifiedAttributes()], []);
  assert.sameOrderedMembers([...v1.manager().outdatedAttributes()], []);

  let p1 = People.Aspects.test1.create(ccc);
  assert.notInstanceOf(p1, Car);
  assert.instanceOf(p1, People);
  assert.instanceOf(p1, Resource);
  assert.instanceOf(p1, VersionedObject);
  assert.equal(p1.version(), -1);
  assert.typeOf(p1.id(), 'string');
  assert(VersionedObjectManager.isLocalId(p1.id()));
  assert.notEqual(p1.id(), v1.id());
  assert.notEqual(p1.id(), v2.id());
  assert.equal(p1.name(), undefined);
  p1._name = "MyPeople";
  assert.equal(p1.name(), `MyPeople`);
  assert.instanceOf(p1.birthDate(), Date);

  assert.equal(v1.id(), v1.id());
  assert.equal(v2.id(), v2.id());
  assert.equal(v1.version(), v1.version());
  assert.equal(v2.version(), v2.version());

  assert.equal(v1.name(), undefined);
  assert.throw(() => { v1.manager().setSavedIdVersion(v1.id(), 1); }, `cannot change identifier to a local identifier`);
  assert.throw(() => { v1.manager().setPendingDeletion(true); }, `cannot set pending deletion on locally identified objects`);
  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, 0);
    assert.throw(() => v1.manager().mergeSavedAttributes(snapshot), `cannot change identifier to a local identifier`);
  }
  assert.throw(() => { v1.manager().setSavedIdVersion(v1.id(), 0); }, `cannot change identifier to a local identifier`);
  assert.throw(() => { v1.manager().setSavedIdVersion(v2.id(), 0); }, `cannot change identifier to a local identifier`);

  v1.manager().setSavedIdVersion(2, 0);
  assert.throw(() => { v1.manager().setSavedIdVersion(v1.id(), -1); }, `version must be >= 0`);
  assert.equal(v1.id(), 2);
  assert.throw(() => { v1.manager().setSavedIdVersion(3, 0); }, `id can't be modified once assigned (not local)`);

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, -1);
    assert.throw(() => v1.manager().mergeSavedAttributes(snapshot), `version must be >= 0`);
  }

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, 2);
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.equal(v1.version(), 2);
  assert.isFalse(v1.manager().isNew());
  assert.isFalse(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.throw(() => v1.manager().attributeValue("_name"), `attribute 'Resource._name' is not loaded`);
  assert.throw(() => v1.manager().savedAttributeValue("_name"), `attribute 'Resource._name' is not loaded`);
  assert.throw(() => v1.manager().outdatedAttributeValue("_name"), `attribute 'Resource._name' is not in conflict`);
  assert.throw(() => v1.manager().setAttributeValue("_name", "bad"), `attribute 'Resource._name' is not loaded`);
  assert.sameOrderedMembers([...v1.manager().modifiedAttributes()], []);
  assert.sameOrderedMembers([...v1.manager().outdatedAttributes()], []);

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, 3);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "test3");
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.equal(v1.version(), 3);
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isFalse(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isFalse(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  v1.manager().setAttributeValue("_name", "testM");
  assert.strictEqual(v1.manager().attributeValue("_name"), "testM");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test3");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, 4);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "test4");
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.equal(v1.version(), 4);
  assert.strictEqual(v1.manager().attributeValue("_name"), "testM");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test4");
  assert.strictEqual(v1.manager().outdatedAttributeValue("_name"), "test3");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isTrue(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isTrue(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.sameDeepOrderedMembers([...v1.manager().modifiedAttributes()], [
    { attribute: v1.manager().aspect().checkedAttribute("_name"), modified: "testM" },
  ]);
  assert.sameDeepOrderedMembers([...v1.manager().outdatedAttributes()], [
    { attribute: v1.manager().aspect().checkedAttribute("_name"), outdated: "test3" },
  ]);
  assert.throw(() => v1.manager().setSavedIdVersion(v1.id(), 5), `version can't be set on a conflicted object`);

  v1.manager().resolveOutdatedAttribute("_name");
  assert.strictEqual(v1.manager().attributeValue("_name"), "testM");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test4");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  v1.manager().unloadAttribute("_name");
  assert.isFalse(v1.manager().hasAttributeValue("_name"));
  assert.isFalse(v1.manager().isAttributeSaved("_name"));
  assert.isFalse(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isFalse(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, 5);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "test5");
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.equal(v1.version(), 5);
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isFalse(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isFalse(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  v1.manager().setAttributeValue("_name", "testM2");
  assert.strictEqual(v1.manager().attributeValue("_name"), "testM2");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test5");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  v1.manager().clearAllModifiedAttributes();
  assert.strictEqual(v1.manager().attributeValue("_name"), "test5");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test5");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isFalse(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isFalse(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  v1.manager().setAttributeValue("_name", "testM3");
  assert.strictEqual(v1.manager().attributeValue("_name"), "testM3");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test5");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, 6);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "test6");
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.equal(v1.version(), 6);
  assert.strictEqual(v1.manager().attributeValue("_name"), "testM3");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test6");
  assert.strictEqual(v1.manager().outdatedAttributeValue("_name"), "test5");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isTrue(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isTrue(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  v1.manager().setAttributeValue("_name", "test5");
  assert.strictEqual(v1.manager().attributeValue("_name"), "test5");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test6");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.sameOrderedMembers([...v1.manager().outdatedAttributes()], []);

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, 7);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "test7");
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.equal(v1.version(), 7);
  assert.strictEqual(v1.manager().attributeValue("_name"), "test5");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test7");
  assert.strictEqual(v1.manager().outdatedAttributeValue("_name"), "test6");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isTrue(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isTrue(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, 8);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "test6");
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.equal(v1.version(), 8);
  assert.strictEqual(v1.manager().attributeValue("_name"), "test5");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test6");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, 9);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "test9");
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.equal(v1.version(), 9);
  assert.strictEqual(v1.manager().attributeValue("_name"), "test5");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test9");
  assert.strictEqual(v1.manager().outdatedAttributeValue("_name"), "test6");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isTrue(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isTrue(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.sameDeepOrderedMembers([...v1.manager().modifiedAttributes()], [
    { attribute: v1.manager().aspect().checkedAttribute("_name"), modified: "test5" },
  ]);
  assert.sameDeepOrderedMembers([...v1.manager().outdatedAttributes()], [
    { attribute: v1.manager().aspect().checkedAttribute("_name"), outdated: "test6" },
  ]);

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, v1.id());
    snapshot.setAttributeValueFast(Aspect.attribute_version, 10);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "test10");
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.equal(v1.version(), 10);
  assert.strictEqual(v1.manager().attributeValue("_name"), "test5");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test10");
  assert.strictEqual(v1.manager().outdatedAttributeValue("_name"), "test6");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isTrue(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isTrue(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.sameDeepOrderedMembers([...v1.manager().modifiedAttributes()], [
    { attribute: v1.manager().aspect().checkedAttribute("_name"), modified: "test5" },
  ]);
  assert.sameDeepOrderedMembers([...v1.manager().outdatedAttributes()], [
    { attribute: v1.manager().aspect().checkedAttribute("_name"), outdated: "test6" },
  ]);

  v1.manager().resolveAllOutdatedAttributes();
  assert.strictEqual(v1.manager().attributeValue("_name"), "test5");
  assert.strictEqual(v1.manager().savedAttributeValue("_name"), "test10");
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeSaved("_name"));
  assert.isTrue(v1.manager().isAttributeModified("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
}

function shared() {
  let cc = new ControlCenter(cfg);
  cc.safe(ccc => {
    let c1 = ccc.create<Car.Categories.local>("Car", ['local']);
    assert.instanceOf(c1, Car);
  });
}

function delete_unmodified_saved() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v1 = Resource.Aspects.test1.create(ccc);
  let v1_aspect = v1.manager().aspect();

  assert.isTrue(v1.manager().isNew());
  assert.isFalse(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.throw(() => { v1.manager().setPendingDeletion(true); }, `cannot set pending deletion on locally identified objects`);

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, "deleteme");
    snapshot.setAttributeValueFast(Aspect.attribute_version, 0);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "name");
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.strictEqual(v1.manager().id(), "deleteme");
  assert.strictEqual(v1.manager().version(), 0);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.isTrue(v1.manager().hasAttributeValue("_name"));

  v1.manager().setPendingDeletion(true);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isTrue(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.isTrue(v1.manager().hasAttributeValue("_name"));

  v1.manager().setPendingDeletion(false);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.isTrue(v1.manager().hasAttributeValue("_name"));

  v1.manager().setPendingDeletion(true);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isTrue(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.isTrue(v1.manager().hasAttributeValue("_name"));

  v1.manager().setSavedIdVersion(v1.id(), VersionedObjectManager.DeletedVersion);
  assert.strictEqual(v1.manager().version(), VersionedObjectManager.DeletedVersion);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isTrue(v1.manager().isDeleted());
  assert.isFalse(v1.manager().hasAttributeValue("_name"));

  assert.throw(() => v1.manager().setSavedIdVersion(v1.id(), 1), `version can't be set on a deleted object`);
  assert.throw(() => v1.manager().setPendingDeletion(true), `cannot set pending deletion on a deleted object`);
}

function delete_modified_saved() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v1 = Resource.Aspects.test1.create(ccc);
  let v1_aspect = v1.manager().aspect();

  assert.isTrue(v1.manager().isNew());
  assert.isFalse(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.throw(() => { v1.manager().setPendingDeletion(true); }, `cannot set pending deletion on locally identified objects`);

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, "deleteme");
    snapshot.setAttributeValueFast(Aspect.attribute_version, 0);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "name");
    v1.manager().mergeSavedAttributes(snapshot);
    v1._name = "test";
  }
  assert.strictEqual(v1.manager().id(), "deleteme");
  assert.strictEqual(v1.manager().version(), 0);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isTrue(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.isTrue(v1.manager().hasAttributeValue("_name"));

  v1.manager().setPendingDeletion(true);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isTrue(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isTrue(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.isTrue(v1.manager().hasAttributeValue("_name"));

  v1.manager().setSavedIdVersion(v1.id(), VersionedObjectManager.DeletedVersion);
  assert.strictEqual(v1.manager().version(), VersionedObjectManager.DeletedVersion);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isTrue(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isTrue(v1.manager().isDeleted());
  assert.isFalse(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeInConflict("_name"));
  assert.strictEqual(v1.manager().outdatedAttributeValue("_name"), "test");
}

function delete_merge() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v1 = Resource.Aspects.test1.create(ccc);
  let v1_aspect = v1.manager().aspect();

  assert.isTrue(v1.manager().isNew());
  assert.isFalse(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, "deleteme");
    snapshot.setAttributeValueFast(Aspect.attribute_version, VersionedObjectManager.DeletedVersion);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "name");
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.strictEqual(v1.manager().id(), "deleteme");
  assert.strictEqual(v1.manager().version(), VersionedObjectManager.DeletedVersion);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isTrue(v1.manager().isDeleted());
  assert.isFalse(v1.manager().hasAttributeValue("_name"));
}

function delete_modified_merge() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let v1 = Car.Aspects.test1.create(ccc);
  let v1_aspect = v1.manager().aspect();

  assert.isTrue(v1.manager().isNew());
  assert.isFalse(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.throw(() => { v1.manager().setPendingDeletion(true); }, `cannot set pending deletion on locally identified objects`);

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, "deleteme");
    snapshot.setAttributeValueFast(Aspect.attribute_version, 0);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "name0");
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_model"), "model0");
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_tags"), new Set(["0", "1", "s"]));
    v1.manager().mergeSavedAttributes(snapshot);
    v1._name = "nameM";
    v1._tags = new Set(["m0", "m1", "s"]);
  }
  assert.strictEqual(v1.manager().id(), "deleteme");
  assert.strictEqual(v1.manager().version(), 0);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isTrue(v1.manager().isModified());
  assert.isFalse(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isFalse(v1.manager().isAttributeInConflict("_name"));

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, "deleteme");
    snapshot.setAttributeValueFast(Aspect.attribute_version, 1);
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_name"), "name1");
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_model"), "model1");
    snapshot.setAttributeValueFast(v1_aspect.checkedAttribute("_tags"), new Set(["0", "2", "s"]));
    v1.manager().mergeSavedAttributes(snapshot);
    v1._model = "modelM";
  }
  assert.strictEqual(v1.manager().id(), "deleteme");
  assert.strictEqual(v1.manager().version(), 1);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isTrue(v1.manager().isModified());
  assert.isTrue(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isFalse(v1.manager().isDeleted());
  assert.isTrue(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeInConflict("_name"));
  assert.strictEqual(v1.manager().outdatedAttributeValue("_name"), "name0");
  assert.isTrue(v1.manager().hasAttributeValue("_model"));
  assert.isFalse(v1.manager().isAttributeInConflict("_model"));
  assert.isTrue(v1.manager().hasAttributeValue("_tags"));
  assert.isTrue(v1.manager().isAttributeInConflict("_tags"));
  assert.sameMembers([...v1.manager().outdatedAttributeValue("_tags")], ["0", "1", "s"]);

  {
    let snapshot = new VersionedObjectSnapshot(v1_aspect, "deleteme");
    snapshot.setAttributeValueFast(Aspect.attribute_version, VersionedObjectManager.DeletedVersion);
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.strictEqual(v1.manager().id(), "deleteme");
  assert.strictEqual(v1.manager().version(), VersionedObjectManager.DeletedVersion);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isTrue(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isTrue(v1.manager().isDeleted());
  assert.isFalse(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeInConflict("_name"));
  assert.strictEqual(v1.manager().outdatedAttributeValue("_name"), "nameM");
  assert.isFalse(v1.manager().hasAttributeValue("_model"));
  assert.isTrue(v1.manager().isAttributeInConflict("_model"));
  assert.strictEqual(v1.manager().outdatedAttributeValue("_model"), "modelM");
  assert.isFalse(v1.manager().hasAttributeValue("_tags"));
  assert.isTrue(v1.manager().isAttributeInConflict("_tags"));
  assert.sameMembers([...v1.manager().outdatedAttributeValue("_tags")], ["m0", "m1", "s"]);

  { //doing it a 2nd time shouldn't impact the result
    let snapshot = new VersionedObjectSnapshot(v1_aspect, "deleteme");
    snapshot.setAttributeValueFast(Aspect.attribute_version, VersionedObjectManager.DeletedVersion);
    v1.manager().mergeSavedAttributes(snapshot);
  }
  assert.strictEqual(v1.manager().id(), "deleteme");
  assert.strictEqual(v1.manager().version(), VersionedObjectManager.DeletedVersion);
  assert.isFalse(v1.manager().isNew());
  assert.isTrue(v1.manager().isSaved());
  assert.isFalse(v1.manager().isModified());
  assert.isTrue(v1.manager().isInConflict());
  assert.isFalse(v1.manager().isPendingDeletion());
  assert.isTrue(v1.manager().isDeleted());
  assert.isFalse(v1.manager().hasAttributeValue("_name"));
  assert.isTrue(v1.manager().isAttributeInConflict("_name"));
  assert.strictEqual(v1.manager().outdatedAttributeValue("_name"), "nameM");
  assert.isFalse(v1.manager().hasAttributeValue("_model"));
  assert.isTrue(v1.manager().isAttributeInConflict("_model"));
  assert.strictEqual(v1.manager().outdatedAttributeValue("_model"), "modelM");
  assert.isFalse(v1.manager().hasAttributeValue("_tags"));
  assert.isTrue(v1.manager().isAttributeInConflict("_tags"));
  assert.sameMembers([...v1.manager().outdatedAttributeValue("_tags")], ["m0", "m1", "s"]);
}

function dead() {
  let cc = new ControlCenter(cfg);
  let v1: Resource.Aspects.test1;
  let v1_id: Identifier = "";
  cc.safe(ccc => {
    v1 = Resource.Aspects.test1.create(ccc);
    v1_id = v1.id();
  });
  assert.throw(() => v1.id(), `this object (${v1_id}) was totally unregistered and thus is considered DEAD !`);
  assert.throw(() => v1._name, `this object (${v1_id}) was totally unregistered and thus is considered DEAD !`);
}

function relation_1_n() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let c0 = Car.Aspects.test1.create(ccc);
  let c1 = Car.Aspects.test1.create(ccc);
  let p0 = People.Aspects.test1.create(ccc);

  c0._owner = p0;
  assert.equal(c0._owner, p0);
  assert.sameMembers([...p0._cars], [c0]);
  p0._cars = new Set(p0._cars).add(c1);
  assert.sameMembers([...p0._cars], [c0, c1]);
  assert.equal(c0._owner, p0);
  assert.equal(c1._owner, p0);

  c0._owner = undefined;
  assert.sameMembers([...p0._cars], [c1]);
  assert.equal(c0._owner, undefined);
  assert.equal(c1._owner, p0);

  let d = new Set(p0._cars); d.delete(c1);
  p0._cars = d;
  assert.sameMembers([...p0._cars], []);
  assert.equal(c0._owner, undefined);
  assert.equal(c1._owner, undefined);
}

function relation_n_n() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let c0 = Car.Aspects.test1.create(ccc);
  let c1 = Car.Aspects.test1.create(ccc);
  let p0 = People.Aspects.test1.create(ccc);

  assert.sameMembers([...p0._drivenCars], []);
  assert.sameMembers([...c0._drivers], []);
  assert.sameMembers([...c1._drivers], []);
  p0._drivenCars = new Set(p0._drivenCars).add(c0).add(c1);
  assert.sameMembers([...p0._drivenCars], [c0, c1]);
  assert.sameMembers([...c0._drivers], [p0]);
  assert.sameMembers([...c1._drivers], [p0]);

  let d = new Set(p0._drivenCars); d.delete(c0); d.delete(c1);
  p0._drivenCars = d;
  assert.sameMembers([...p0._drivenCars], []);
  assert.sameMembers([...c0._drivers], []);
  assert.sameMembers([...c1._drivers], []);
}

function sub_object_single() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let r0 = RootObject.Aspects.test1.create(ccc);
  let p0 = Point.Aspects.test1.create(ccc);
  assert.isFalse(r0.manager().isSubObject());
  assert.isTrue(p0.manager().isSubObject());
  assert.strictEqual(p0.manager().hasAttributeValue("_altitute"), true);
  assert.strictEqual(p0.manager().attributeValue("_altitute"), undefined);
  assert.strictEqual(p0.manager().savedAttributeValue("_altitute"), undefined);
  assert.isFalse(r0.manager().isModified());
  assert.strictEqual(r0, r0.manager().rootObject());
  assert.isFalse(r0.manager().isAttributeModified("_p1"));
  assert.isFalse(r0.manager().isAttributeSaved("_p1"));
  assert.isFalse(r0.manager().isAttributeInConflict("_p1"));
  assert.throw(() => p0.manager().rootObject(), "cannot find root object of sub object, the sub object is not linked to any parent object");

  r0._p1 = p0;
  assert.isTrue(r0.manager().isAttributeModified("_p1"));
  assert.isFalse(r0.manager().isAttributeSaved("_p1"));
  assert.isFalse(r0.manager().isAttributeInConflict("_p1"));
  assert.strictEqual(r0, p0.manager().rootObject());
  assert.strictEqual(r0._p1,  p0);
  assert.isTrue(r0.manager().isModified());

  r0.manager().clearModifiedAttribute("_p1");
  assert.isFalse(r0.manager().isAttributeModified("_p1"));
  assert.isFalse(r0.manager().isAttributeSaved("_p1"));
  assert.isFalse(r0.manager().isAttributeInConflict("_p1"));
  assert.isFalse(r0.manager().isModified());

  r0._p1 = p0;
  assert.isTrue(r0.manager().isAttributeModified("_p1"));
  assert.isFalse(r0.manager().isAttributeSaved("_p1"));
  assert.isFalse(r0.manager().isAttributeInConflict("_p1"));
  assert.strictEqual(r0, p0.manager().rootObject());
  assert.strictEqual(r0._p1,  p0);
  assert.isTrue(r0.manager().isModified());

  p0._altitute = 2000;
  assert.strictEqual(p0.manager().attributeValue("_altitute"), 2000);
  assert.isTrue(r0.manager().isModified());
  assert.isTrue(p0.manager().isModified());
  assert.isTrue(p0.manager().isAttributeModified("_altitute"));
  assert.isTrue(r0.manager().isAttributeModified("_p1"));

  r0.manager().clearModifiedAttribute("_p1");
  assert.isFalse(r0.manager().isAttributeModified("_p1"));
  assert.isFalse(p0.manager().isAttributeModified("_altitute"));
  assert.isFalse(r0.manager().isModified());
  assert.isFalse(p0.manager().isModified());

  r0._p1 = p0;
  assert.isTrue(r0.manager().isAttributeModified("_p1"));
  assert.isFalse(r0.manager().isAttributeSaved("_p1"));
  assert.isFalse(r0.manager().isAttributeInConflict("_p1"));
  assert.strictEqual(r0, p0.manager().rootObject());
  assert.strictEqual(r0._p1,  p0);
  assert.isTrue(r0.manager().isModified());

  p0.manager().setSavedIdVersion("p0", 0);
  assert.isFalse(p0.manager().isModified());
  assert.isTrue(r0.manager().isModified());
  assert.throw(() => { p0.manager().setPendingDeletion(true); }, `cannot set pending deletion on sub-objects, change the parent attribute directly`);

  r0.manager().setSavedIdVersion("r0", 0);
  assert.isFalse(r0.manager().isModified());
  assert.isFalse(r0.manager().isAttributeModified("_p1"));
  assert.isTrue(r0.manager().isAttributeSaved("_p1"));
  assert.isFalse(r0.manager().isAttributeInConflict("_p1"));
  assert.isFalse(p0.manager().isAttributeModified("_altitute"));
  assert.isTrue(p0.manager().isAttributeSaved("_altitute"));
  assert.strictEqual(p0.manager().attributeValue("_altitute"), undefined);
  assert.strictEqual(p0.manager().savedAttributeValue("_altitute"), undefined);

  p0._altitute = 1000;
  assert.strictEqual(p0.manager().attributeValue("_altitute"), 1000);
  assert.strictEqual(p0.manager().savedAttributeValue("_altitute"), undefined);
  assert.isTrue(r0.manager().isModified());
  assert.isTrue(p0.manager().isModified());
  assert.isTrue(p0.manager().isAttributeModified("_altitute"));
  assert.isTrue(p0.manager().isAttributeSaved("_altitute"));
  assert.isTrue(r0.manager().isAttributeModified("_p1"));
  assert.isTrue(r0.manager().isAttributeSaved("_p1"));

  p0._altitute = undefined;
  assert.isFalse(r0.manager().isModified());
  assert.isFalse(p0.manager().isModified());

  p0._altitute = 1000;
  assert.strictEqual(p0.manager().attributeValue("_altitute"), 1000);
  assert.strictEqual(p0.manager().savedAttributeValue("_altitute"), undefined);
  assert.isTrue(r0.manager().isModified());
  assert.isTrue(p0.manager().isModified());
  assert.isTrue(p0.manager().isAttributeModified("_altitute"));
  assert.isTrue(p0.manager().isAttributeSaved("_altitute"));
  assert.isTrue(r0.manager().isAttributeModified("_p1"));
  assert.isTrue(r0.manager().isAttributeSaved("_p1"));

  r0.manager().clearModifiedAttribute("_p1");
  assert.strictEqual(p0.manager().attributeValue("_altitute"), undefined);
  assert.strictEqual(p0.manager().savedAttributeValue("_altitute"), undefined);
  assert.isFalse(r0.manager().isModified());
  assert.isFalse(p0.manager().isModified());
  assert.isFalse(r0.manager().isAttributeModified("_p1"));
  assert.isFalse(p0.manager().isAttributeModified("_altitute"));
  assert.isTrue(r0.manager().isAttributeSaved("_p1"));
  assert.isTrue(p0.manager().isAttributeSaved("_altitute"));

  assert.strictEqual(r0._p2, undefined);
  assert.throw(() => r0._p2 = p0, "a sub object is only assignable to one parent/attribute");
  assert.strictEqual(r0._p2, undefined);

  r0.manager().unloadAttribute("_p1");
  assert.isFalse(r0.manager().isModified());
  assert.isFalse(p0.manager().isModified());
  assert.isTrue(r0.manager().isSaved());
  assert.isTrue(p0.manager().isSaved());
  assert.isFalse(r0.manager().hasAttributeValue("_p1"));
  assert.isFalse(p0.manager().hasAttributeValue("_altitute"));
  assert.isFalse(r0.manager().isAttributeSaved("_p1"));
  assert.isFalse(p0.manager().isAttributeSaved("_altitute"));
}

function sub_object_single_delete() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let r0 = RootObject.Aspects.test1.create(ccc);
  let p0 = Point.Aspects.test1.create(ccc);
  let r0_aspect = r0.manager().aspect();
  let p0_aspect = p0.manager().aspect();

  {
    let snapshot_p0 = new VersionedObjectSnapshot(p0_aspect, "p0");
    snapshot_p0.setAttributeValueFast(Aspect.attribute_version, 1);
    snapshot_p0.setAttributeValueFast(p0_aspect.checkedAttribute("_altitute"), 1000);
    snapshot_p0.setAttributeValueFast(p0_aspect.checkedAttribute("_latitude"), 1133);
    snapshot_p0.setAttributeValueFast(p0_aspect.checkedAttribute("_longitude"), 1133);
    p0.manager().mergeSavedAttributes(snapshot_p0);
    p0._altitute = 2000;
    p0._longitude = 2133;
  }
  {
    let snapshot_r0 = new VersionedObjectSnapshot(r0_aspect, "r0");
    snapshot_r0.setAttributeValueFast(Aspect.attribute_version, 1);
    snapshot_r0.setAttributeValueFast(r0_aspect.checkedAttribute("_p1"), p0);
    r0._p1 = p0;
    r0.manager().mergeSavedAttributes(snapshot_r0);
  }
  assert.isTrue(r0.manager().isModified());
  assert.isTrue(p0.manager().isModified());
  assert.isTrue(r0.manager().isSaved());
  assert.isTrue(p0.manager().isSaved());
  assert.isFalse(r0.manager().isDeleted());
  assert.isFalse(p0.manager().isDeleted());
  assert.isTrue(r0.manager().hasAttributeValue("_p1"));
  assert.isTrue(p0.manager().hasAttributeValue("_altitute"));
  assert.isTrue(p0.manager().hasAttributeValue("_latitude"));
  assert.isTrue(p0.manager().hasAttributeValue("_longitude"));
  assert.isTrue(r0.manager().isAttributeSaved("_p1"));
  assert.isTrue(p0.manager().isAttributeSaved("_altitute"));
  assert.isTrue(p0.manager().isAttributeSaved("_latitude"));
  assert.isTrue(p0.manager().isAttributeSaved("_longitude"));

  {
    let snapshot_r0 = new VersionedObjectSnapshot(r0_aspect, "r0");
    snapshot_r0.setAttributeValueFast(Aspect.attribute_version, VersionedObjectManager.DeletedVersion);
    r0.manager().mergeSavedAttributes(snapshot_r0);
  }
  {
    let snapshot_p0 = new VersionedObjectSnapshot(p0_aspect, "p0");
    snapshot_p0.setAttributeValueFast(Aspect.attribute_version, VersionedObjectManager.DeletedVersion);
    p0.manager().mergeSavedAttributes(snapshot_p0);
  }
  assert.isFalse(r0.manager().isModified());
  assert.isFalse(p0.manager().isModified());
  assert.isTrue(r0.manager().isSaved());
  assert.isTrue(p0.manager().isSaved());
  assert.isTrue(r0.manager().isDeleted());
  assert.isTrue(p0.manager().isDeleted());
  assert.isFalse(r0.manager().hasAttributeValue("_p1"));
  assert.isFalse(p0.manager().hasAttributeValue("_altitute"));
  assert.isFalse(p0.manager().hasAttributeValue("_latitude"));
  assert.isFalse(p0.manager().hasAttributeValue("_longitude"));
  assert.isTrue(r0.manager().isAttributeInConflict("_p1"));
  assert.isTrue(p0.manager().isAttributeInConflict("_altitute"));
  assert.isFalse(p0.manager().isAttributeInConflict("_latitude"));
  assert.isTrue(p0.manager().isAttributeInConflict("_longitude"));
}

function sub_object_single_modified_delete() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let r0 = RootObject.Aspects.test1.create(ccc);
  let p0 = Point.Aspects.test1.create(ccc);
  let p1 = Point.Aspects.test1.create(ccc);
  let r0_aspect = r0.manager().aspect();
  let p0_aspect = p0.manager().aspect();

  {
    let snapshot_p0 = new VersionedObjectSnapshot(p0_aspect, "p0");
    snapshot_p0.setAttributeValueFast(Aspect.attribute_version, 1);
    snapshot_p0.setAttributeValueFast(p0_aspect.checkedAttribute("_altitute"), 1000);
    snapshot_p0.setAttributeValueFast(p0_aspect.checkedAttribute("_latitude"), 1133);
    snapshot_p0.setAttributeValueFast(p0_aspect.checkedAttribute("_longitude"), 1133);
    p0.manager().mergeSavedAttributes(snapshot_p0);
  }
  assert.isFalse(r0.manager().isModified());
  assert.isFalse(p0.manager().isModified());
  assert.isFalse(r0.manager().isSaved());
  assert.isTrue(p0.manager().isSaved());
  assert.isFalse(r0.manager().isDeleted());
  assert.isFalse(p0.manager().isDeleted());
  assert.isTrue(r0.manager().hasAttributeValue("_p1"));
  assert.isTrue(p0.manager().hasAttributeValue("_altitute"));
  assert.isTrue(p0.manager().hasAttributeValue("_latitude"));
  assert.isTrue(p0.manager().hasAttributeValue("_longitude"));
  assert.isFalse(r0.manager().isAttributeSaved("_p1"));
  assert.isTrue(p0.manager().isAttributeSaved("_altitute"));
  assert.isTrue(p0.manager().isAttributeSaved("_latitude"));
  assert.isTrue(p0.manager().isAttributeSaved("_longitude"));

  p0._altitute = 2000;
  p0._longitude = 2133;
  assert.isFalse(r0.manager().isModified());
  assert.isTrue(p0.manager().isModified());
  assert.isFalse(r0.manager().isSaved());
  assert.isTrue(p0.manager().isSaved());
  assert.isFalse(r0.manager().isDeleted());
  assert.isFalse(p0.manager().isDeleted());
  assert.isTrue(r0.manager().hasAttributeValue("_p1"));
  assert.isTrue(p0.manager().hasAttributeValue("_altitute"));
  assert.isTrue(p0.manager().hasAttributeValue("_latitude"));
  assert.isTrue(p0.manager().hasAttributeValue("_longitude"));
  assert.isFalse(r0.manager().isAttributeSaved("_p1"));
  assert.isTrue(p0.manager().isAttributeSaved("_altitute"));
  assert.isTrue(p0.manager().isAttributeSaved("_latitude"));
  assert.isTrue(p0.manager().isAttributeSaved("_longitude"));

  {
    let snapshot_r0 = new VersionedObjectSnapshot(r0_aspect, "r0");
    snapshot_r0.setAttributeValueFast(Aspect.attribute_version, 1);
    snapshot_r0.setAttributeValueFast(r0_aspect.checkedAttribute("_p1"), p0);
    r0.manager().mergeSavedAttributes(snapshot_r0);
  }
  assert.isTrue(r0.manager().isModified());
  assert.isTrue(p0.manager().isModified());
  assert.isTrue(r0.manager().isSaved());
  assert.isTrue(p0.manager().isSaved());
  assert.isFalse(r0.manager().isDeleted());
  assert.isFalse(p0.manager().isDeleted());
  assert.isTrue(r0.manager().hasAttributeValue("_p1"));
  assert.isTrue(p0.manager().hasAttributeValue("_altitute"));
  assert.isTrue(p0.manager().hasAttributeValue("_latitude"));
  assert.isTrue(p0.manager().hasAttributeValue("_longitude"));
  assert.isTrue(r0.manager().isAttributeSaved("_p1"));
  assert.isTrue(p0.manager().isAttributeSaved("_altitute"));
  assert.isTrue(p0.manager().isAttributeSaved("_latitude"));
  assert.isTrue(p0.manager().isAttributeSaved("_longitude"));

  r0._p1 = p1;
  assert.isTrue(r0.manager().isModified());
  assert.isTrue(p0.manager().isModified());
  assert.isTrue(r0.manager().isSaved());
  assert.isTrue(p0.manager().isSaved());
  assert.isFalse(r0.manager().isDeleted());
  assert.isFalse(p0.manager().isDeleted());
  assert.isTrue(r0.manager().hasAttributeValue("_p1"));
  assert.isTrue(p0.manager().hasAttributeValue("_altitute"));
  assert.isTrue(p0.manager().hasAttributeValue("_latitude"));
  assert.isTrue(p0.manager().hasAttributeValue("_longitude"));
  assert.isTrue(r0.manager().isAttributeSaved("_p1"));
  assert.isTrue(p0.manager().isAttributeSaved("_altitute"));
  assert.isTrue(p0.manager().isAttributeSaved("_latitude"));
  assert.isTrue(p0.manager().isAttributeSaved("_longitude"));

  {
    let snapshot_p0 = new VersionedObjectSnapshot(p0_aspect, "p0");
    snapshot_p0.setAttributeValueFast(Aspect.attribute_version, VersionedObjectManager.DeletedVersion);
    p0.manager().mergeSavedAttributes(snapshot_p0);
  }
  {
    let snapshot_r0 = new VersionedObjectSnapshot(r0_aspect, "r0");
    snapshot_r0.setAttributeValueFast(Aspect.attribute_version, VersionedObjectManager.DeletedVersion);
    r0.manager().mergeSavedAttributes(snapshot_r0);
  }
  assert.isFalse(r0.manager().isModified());
  assert.isFalse(p0.manager().isModified());
  assert.isTrue(r0.manager().isSaved());
  assert.isTrue(p0.manager().isSaved());
  assert.isTrue(r0.manager().isDeleted());
  assert.isTrue(p0.manager().isDeleted());
  assert.isFalse(r0.manager().hasAttributeValue("_p1"));
  assert.isFalse(p0.manager().hasAttributeValue("_altitute"));
  assert.isFalse(p0.manager().hasAttributeValue("_latitude"));
  assert.isFalse(p0.manager().hasAttributeValue("_longitude"));
  assert.isTrue(r0.manager().isAttributeInConflict("_p1"));
  assert.isTrue(p0.manager().isAttributeInConflict("_altitute"));
  assert.isFalse(p0.manager().isAttributeInConflict("_latitude"));
  assert.isTrue(p0.manager().isAttributeInConflict("_longitude"));
}

function sub_object_set() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let r0 = RootObject.Aspects.test1.create(ccc);
  let s0 = Polygon.Aspects.test1.create(ccc);
  let p0 = Point.Aspects.test1.create(ccc);
  let p1 = Point.Aspects.test1.create(ccc);
  let p2 = Point.Aspects.test1.create(ccc);

  assert.isFalse(r0.manager().isSubObject());
  assert.isTrue(s0.manager().isSubObject());
  assert.isTrue(p0.manager().isSubObject());
  assert.isTrue(p1.manager().isSubObject());
  assert.isTrue(p2.manager().isSubObject());

  assert.isFalse(r0.manager().isModified());

  s0._set = new Set([p0, p1, p2]);
  r0._s0 = s0;

  assert.strictEqual(r0._s0,  s0);
  assert.sameMembers([...s0._set], [p0, p1, p2]);

  assert.isTrue(r0.manager().isModified());
  assert.isTrue(s0.manager().isModified());


  s0._set = new Set([p0, p1, p2]);

  p0.manager().setSavedIdVersion("p0", 0);
  assert.isFalse(p0.manager().isModified());
  assert.isTrue(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  p1.manager().setSavedIdVersion("p1", 0);
  assert.isFalse(p1.manager().isModified());
  assert.isTrue(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  p2.manager().setSavedIdVersion("p2", 0);
  assert.isFalse(p2.manager().isModified());
  assert.isTrue(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  s0.manager().setSavedIdVersion("s0", 0);
  assert.isFalse(p2.manager().isModified());
  assert.isFalse(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  r0.manager().setSavedIdVersion("r0", 0);
  assert.isFalse(p2.manager().isModified());
  assert.isFalse(s0.manager().isModified());
  assert.isFalse(r0.manager().isModified());

  s0._set = new Set([p1, p0, p2]);
  assert.isFalse(s0.manager().isModified());
  assert.isFalse(r0.manager().isModified());

  s0._set = new Set([p1, p2]);
  assert.isTrue(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  s0._set = new Set([p0, p1, p2]);
  assert.isFalse(s0.manager().isModified());
  assert.isFalse(r0.manager().isModified());

  s0._set = new Set([p1, p2]);
  assert.isTrue(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  s0.manager().setSavedIdVersion(s0.id(), 0);
  assert.isFalse(s0.manager().isModified());
  assert.isFalse(r0.manager().isModified());
}

function sub_object_array() {
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});

  let r0 = RootObject.Aspects.test1.create(ccc);
  let s0 = Polygon.Aspects.test1.create(ccc);
  let p0 = Point.Aspects.test1.create(ccc);
  let p1 = Point.Aspects.test1.create(ccc);
  let p2 = Point.Aspects.test1.create(ccc);

  assert.isFalse(r0.manager().isSubObject());
  assert.isTrue(s0.manager().isSubObject());
  assert.isTrue(p0.manager().isSubObject());
  assert.isTrue(p1.manager().isSubObject());
  assert.isTrue(p2.manager().isSubObject());

  assert.isFalse(r0.manager().isModified());

  s0._points = [p0, p1, p2];
  r0._s0 = s0;

  assert.strictEqual(r0._s0,  s0);
  assert.sameOrderedMembers([...s0._points], [p0, p1, p2]);

  assert.isTrue(r0.manager().isModified());
  assert.isTrue(s0.manager().isModified());

  p0.manager().setSavedIdVersion("p0", 0);
  assert.isFalse(p0.manager().isModified());
  assert.isTrue(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  p1.manager().setSavedIdVersion("p1", 0);
  assert.isFalse(p1.manager().isModified());
  assert.isTrue(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  p2.manager().setSavedIdVersion("p2", 0);
  assert.isFalse(p2.manager().isModified());
  assert.isTrue(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  s0.manager().setSavedIdVersion("s0", 0);
  assert.isFalse(p2.manager().isModified());
  assert.isFalse(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  r0.manager().setSavedIdVersion("r0", 0);
  assert.isFalse(p2.manager().isModified());
  assert.isFalse(s0.manager().isModified());
  assert.isFalse(r0.manager().isModified());

  s0._points = [p1, p0, p2];
  assert.isTrue(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  s0._points = [p0, p1, p2];
  assert.isFalse(s0.manager().isModified());
  assert.isFalse(r0.manager().isModified());

  s0._points = [p1, p0, p2];
  assert.isTrue(s0.manager().isModified());
  assert.isTrue(r0.manager().isModified());

  s0.manager().setSavedIdVersion(s0.id(), 0);
  assert.isFalse(s0.manager().isModified());
  assert.isFalse(r0.manager().isModified());

  assert.throw(() => s0._points = [p1, p0, p2, p1], "a sub object is only assignable to one parent/attribute (duplication detected in the same attribute)");
  assert.sameOrderedMembers([...s0._points], [p1, p0, p2]);
}

export const tests = { name: 'VersionedObject', tests: [
  snapshot,
  basics,
  shared,
  delete_unmodified_saved,
  delete_modified_saved,
  delete_merge,
  delete_modified_merge,
  dead,
  relation_1_n,
  relation_n_n,
  sub_object_single,
  sub_object_single_delete,
  sub_object_single_modified_delete,
  sub_object_set,
  sub_object_array,
  tests_perfs
]};
