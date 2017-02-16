import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager, Aspect} from '@microstep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';
import ConstraintType = DataSourceInternal.ConstraintType;

type Context = { Car: { new(): Car.Aspects.test1 }, People: { new(): People.Aspects.test1 }, db: DataSource.Aspects.server, cc: ControlCenter };

function basicsWithCC(flux) {
  let {Car, People, db, cc} = flux.context as Context;
  let objects: VersionedObject[] = [];
  let component = {};
  let c0 = Object.assign(new Car(), { _name: "Renault", _model: "Clio 3" });
  let c1 = Object.assign(new Car(), { _name: "Renault", _model: "Clio 2" });
  let c2 = Object.assign(new Car(), { _name: "Peugeot", _model: "3008 DKR" });
  let p0 = Object.assign(new People(), { _name: "Lisa Simpsons", _firstname: "Lisa", _lastname: "Simpsons" });
  let p1 = Object.assign(new People(), { _name: "Bart Simpsons", _firstname: "Bart", _lastname: "Simpsons" });
  flux.setFirstElements([
    f => {
      cc.registerComponent(component);
      cc.registerObjects(component, [c0, c1, c2, p0, p1]);
      f.continue();
    },
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
        let res = envelop.result();
        assert.sameMembers(res['cars'], [c2]);
        let lc2 = res['cars'][0];
        assert.isNotTrue(lc2.manager().hasChanges());
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
    },
    f => {
      cc.unregisterObjects(component, [c0, c1, c2, p0, p1]);
      cc.unregisterComponent(component);
      f.continue();
    }
  ]);
  flux.continue();
}

function relationsWithCC(flux) {
  let {Car, People, db, cc} = flux.context as Context;
  let objects: VersionedObject[] = [];
  let component = {};
  let c0 = Object.assign(new Car(), { _name: "Renault", _model: "Clio 3" });
  let c1 = Object.assign(new Car(), { _name: "Renault", _model: "Clio 2" });
  let c2 = Object.assign(new Car(), { _name: "Peugeot", _model: "3008 DKR" });
  let p0 = Object.assign(new People(), { _name: "Lisa Simpsons", _firstname: "Lisa", _lastname: "Simpsons" });
  let p1 = Object.assign(new People(), { _name: "Bart Simpsons", _firstname: "Bart", _lastname: "Simpsons" });
  flux.setFirstElements([
    f => {
      cc.registerComponent(component);
      cc.registerObjects(component, [c0, c1, c2, p0, p1]);
      f.continue();
    },
    f => {
      db.farPromise('rawSave', [c0, c1, c2, p0, p1]).then(envelop => { 
        assert.sameMembers(envelop.result(), [c0, c1, c2, p0, p1]);
        f.continue(); 
      });
    },
    f => {
      assert.equal(c0.manager().hasChanges(), false);
      c0._owner = p0;
      assert.equal(c0.manager().hasChanges(), true);
      db.farPromise('rawSave', [c0]).then((envelop) => {
        assert.sameMembers(envelop.result(), [c0]);
        assert.equal(c0.version(), 1);
        assert.equal(c0.manager().hasChanges(), false);
        assert.equal(c0._owner, p0);
        f.continue();
      });
    },
    f => {
      cc.unregisterObjects(component, [c0]);
      db.farPromise('rawQuery', { name: "cars", where: { $instanceOf: Car, _owner: c0 }, scope: ['_name', '_owner', '_model'] }).then((envelop) => {
        let res = envelop.result()['cars'];
        assert.equal(res.length, 1);
        let lc0 = res[0] as typeof c0;
        assert.equal(lc0._name, c0._name);
        assert.equal(lc0._owner, c0._owner);
        assert.equal(lc0._model, c0._model);
        c0 = lc0;
        cc.registerObjects(component, [c0]);
        f.continue();
      });
    },
    f => {
      cc.unregisterObjects(component, [c0, c1, c2, p0, p1]);
      cc.unregisterComponent(component);
      f.continue();
    }
  ]);
  flux.continue();
}

function createWithCC(flux, nb) {
  let {Car, People, db, cc} = flux.context as Context;
  let objects: VersionedObject[] = [];
  for (var i = 0; i < nb; i++) {
    objects.push(Object.assign(new Car(), { _name: "Renault", _model: "Clio 3" }));
  }
  flux.context.objects = objects;
  flux.continue();
}
function insertWithCC(flux, nb) {
  let {db} = flux.context as Context;
  flux.setFirstElements([
    f => createWithCC(f, nb),
    f => {
      let objects: VersionedObject[] = f.context.objects;
      db.farPromise('rawSave', objects).then((envelop) => {
        assert.sameMembers(envelop.result(), objects);
        f.continue();
      });
    }
  ])
  flux.continue();
}
function insert1by1ParWithCC(flux, nb) {
  let {db} = flux.context as Context;
  flux.setFirstElements([
    f => createWithCC(f, nb),
    f => {
      let objects: VersionedObject[] = f.context.objects;
      Promise.all(objects.map(o => db.farPromise('rawSave', [o]).then(e => e.result()[0]))).then((results) => {
        assert.sameMembers(results, objects);
        f.continue();
      });
    }
  ])
  flux.continue();
}
function insert1by1SeqWithCC(flux, nb) {
  let {db} = flux.context as Context;
  flux.setFirstElements([
    f => createWithCC(f, nb),
    f => {
      let objects: VersionedObject[] = f.context.objects;
      let results: VersionedObject[] = [];
      let i = 0;
      let doOne = (envelop?) => {
        if (envelop)
          results.push(envelop.result()[0]);
        if (i < objects.length) {
          let c = i++;
          db.farPromise('rawSave', [objects[c]]).then(doOne);
        }
        else {
          assert.sameMembers(results, objects);
          f.continue();
        }
      };
      doOne();
    }
  ])
  flux.continue();
}

export function createTests(createControlCenter: (flux) => void) {
  function runWithNewCC(flux, test) {
    flux.setFirstElements([
      createControlCenter,
      test,
    ]);
    flux.continue();
  }

  function basics(flux) { runWithNewCC(flux, basicsWithCC); }
  function create1k(flux) { runWithNewCC(flux, f => createWithCC(f, 1000)); }
  function insert100(flux) { runWithNewCC(flux, f => insertWithCC(f, 100)); }
  function insert1k(flux) { runWithNewCC(flux, f => insertWithCC(f, 1000)); }
  function insert1k_1by1Seq(flux) { runWithNewCC(flux, f => insert1by1SeqWithCC(f, 2)); }
  function insert1k_1by1Par(flux) { runWithNewCC(flux, f => insert1by1ParWithCC(f, 2)); }
  function relations(flux) { runWithNewCC(flux, relationsWithCC); }
  return [basics, relations]//, create1k, insert100, insert1k, insert1k_1by1Seq, insert1k_1by1Par];
}

