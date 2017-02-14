import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager, Aspect} from '@microstep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import ConstraintType = DataSourceInternal.ConstraintType;

export function createTests(createControlCenter: () => { Car: { new(): Car.Aspects.test1 }, People: { new(): People.Aspects.test1 }, db: DataSource.Aspects.server }) {
  function makeObjects() {
    let cc = new ControlCenter();
    let C = Car.installAspect(cc, 'test1');
    let P = People.installAspect(cc, 'test1');
    let objects: VersionedObject[] = [];
    objects.push(Object.assign(new C(), { _name: "Renault", _model: "Clio 3" }));
    objects.push(Object.assign(new C(), { _name: "Renault", _model: "Clio 2" }));
    objects.push(Object.assign(new C(), { _name: "Peugeot", _model: "3008 DKR" }));
    objects.push(Object.assign(new P(), { _name: "Lisa Simpsons", _firstname: "Lisa", _lastname: "Simpsons" }));
    objects.push(Object.assign(new P(), { _name: "Bart Simpsons", _firstname: "Bart", _lastname: "Simpsons" }));
    return objects;
  }

  function basics(flux) {
    let {Car, People, db} = createControlCenter();
    let objects: VersionedObject[] = [];
    let c0 = Object.assign(new Car(), { _name: "Renault", _model: "Clio 3" });
    let c1 = Object.assign(new Car(), { _name: "Renault", _model: "Clio 2" });
    let c2 = Object.assign(new Car(), { _name: "Peugeot", _model: "3008 DKR" });
    let p0 = Object.assign(new People(), { _name: "Lisa Simpsons", _firstname: "Lisa", _lastname: "Simpsons" });
    let p1 = Object.assign(new People(), { _name: "Bart Simpsons", _firstname: "Bart", _lastname: "Simpsons" });
    flux.setFirstElements([
      f => {
        assert.equal(c0.version(), VersionedObjectManager.NoVersion);
        assert.equal(c0.manager().hasChanges(), true);
        db.farPromise('rawSave', [c0]).then((envelop) => {
          assert.sameMembers(envelop.result(), [c0]);
          assert.equal(c0.version(), 0);
          assert.equal(c0.manager().hasChanges(), false);
          f.continue();
        });
      },
      f => {
        assert.equal(c0.manager().hasChanges(), false);
        c0._name = "ReNault";
        assert.equal(c0.manager().hasChanges(), true);
        db.farPromise('rawSave', [c0]).then((envelop) => {
          assert.sameMembers(envelop.result(), [c0]);
          assert.equal(c0.version(), 1);
          assert.equal(c0.manager().hasChanges(), false);
          f.continue();
        });
      },
      f => {
        db.farPromise('rawSave', [c0, c1, c2]).then((envelop) => {
          assert.sameMembers(envelop.result(), [c0, c1, c2]);
          assert.equal(c0.version(), 1);
          assert.equal(c1.version(), 0);
          assert.equal(c2.version(), 0);
          f.continue();
        });
      },
      f => {
        db.farPromise('rawQuery', { name: "cars", where: { $instanceOf: Car, _name: "Peugeot" } }).then((envelop) => {
          assert.deepEqual(envelop.result(), {
            cars: [c2]
          });
          f.continue();
        });
      },
      f => {
        db.farPromise('rawQuery', { name: "peoples", where: { $instanceOf: People } }).then((envelop) => {
          assert.deepEqual(envelop.result(), {
            peoples: []
          });
          f.continue();
        });
      }
    ]);
    flux.continue();
  }
  return [basics];
}

