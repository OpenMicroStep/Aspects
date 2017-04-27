import {DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, AComponent} from './core';
import ObjectSet = DataSourceInternal.ObjectSet;
declare var console: any;



export const InMemoryDataSource = VersionedObject.cluster(class InMemoryDataSource extends DataSource 
{
  prefix = "memory:";
  idCounter = 0;
  objects = new Map<Identifier, VersionedObject>();

  from(v, component: AComponent) {
    if (v instanceof VersionedObject) {
      let rObject = v;
      let cc = this.controlCenter();
      v = cc.registeredObject(rObject.id());
      if (!v) {
        v = new (cc.aspect(rObject.manager().aspect().name)!)();
        v.manager().setId(rObject.id());
        cc.registerObjects(component, [v]);
      }
    }
    return v;
  }

  to(v) {
    if (v instanceof VersionedObject) {
      let cc = this.controlCenter();
      let rObject  = new (cc.aspect(v.manager().aspect().name)!)();
      rObject.manager().setId(v.id());
      v = rObject;
    }
    return v;
  }

  implQuery(sets: ObjectSet[]): { [k: string]: VersionedObject[] } {
    let ret = {};
    let cc = this.controlCenter();
    let component = {};
    cc.registerComponent(component);
    sets.forEach(set => {
      if (set.name) {
        let lObjects: VersionedObject[] = [];
        this.objects.forEach(dObject => {
          if (set.pass(dObject)) {
            let dManager = dObject.manager();
            let cstor = cc.aspect(dManager.aspect().name)!;
            let lObject = cc.registeredObject(dObject.id()) || new cstor();
            let remoteAttributes = new Map<keyof VersionedObject, any>();
            let lManager = lObject.manager();
            cc.registerObjects(component, [lObject]);
            if (set.scope) for (let k of set.scope as (keyof VersionedObject)[])
              remoteAttributes.set(k, this.from(dManager._versionAttributes.get(k), component));
            lManager.setId(dObject.id());
            lManager.mergeWithRemoteAttributes(remoteAttributes, dObject.version());
            lObjects.push(lObject);
          }
        });
        ret[set.name] = lObjects;
      }
    });
    cc.unregisterComponent(component);
    return ret;
  }
  implLoad({objects, scope} : {
      objects?: VersionedObject[];
      scope?: string[];
  }): VersionedObject[] {
    let cc = this.controlCenter();
    let component = {};
    let ret: VersionedObject[] = [];
    cc.registerComponent(component);
    if (objects) {
      for (let lObject of objects) {
        let dObject = this.objects.get(lObject.id());
        if (dObject) {
          let lManager = lObject.manager();
          let dManager = dObject.manager();
          let remoteAttributes = new Map<keyof VersionedObject, any>();
          cc.registerObjects(component, [lObject]);
          if (scope) for (let k of scope as (keyof VersionedObject)[])
            remoteAttributes.set(k, this.from(dManager._versionAttributes.get(k), component));
          lManager.mergeWithRemoteAttributes(remoteAttributes, dObject.version());
          ret.push(lObject);
        }
      }
    }
    cc.unregisterComponent(component);
    return ret;
  }
  implSave(objects: VersionedObject[]) : Promise<VersionedObject[]> {
    let willFail = false;
    for (let i = 0; !willFail && i < objects.length; i++) {
      let object = objects[i];
      let version = object.manager()._version;
      if (version === VersionedObjectManager.DeletedVersion) {
        willFail = !this.objects.has(object.id());
      }
      else if (version !== VersionedObjectManager.NoVersion) { // Update
        let dbObject = this.objects.get(object.id());
        if (!(willFail = !dbObject)) {
          let dbManager = dbObject!.manager();
          let obManager = object.manager();
          for (let k of obManager._localAttributes.keys()) {
            let dbv = dbManager._versionAttributes.get(k);
            let exv = obManager._versionAttributes.get(k);
            if ((willFail = exv !== dbv)) break;
          }
        }
      }
    }

    if (!willFail) {
      for (let lObject of objects) {
        let lManager = lObject.manager();
        let lVersion = lManager._version;
        if (lVersion === VersionedObjectManager.NoVersion) {
          let id = `${this.prefix}${++this.idCounter}`;
          let dObject = new (this.controlCenter().aspect(lManager.aspect().name)!)();
          let dManager = dObject.manager();
          for (let [lk, lv] of lManager._localAttributes)
            dManager._versionAttributes.set(lk, this.to(lv));
          dManager.setId(id);
          dManager.setVersion(0);
          lManager.setId(dManager.id());
          lManager.setVersion(dManager.version());
          this.objects.set(dManager.id(), dObject);
        }
        else if (lVersion === VersionedObjectManager.DeletedVersion) {
          this.objects.delete(lObject.id());
        }
        else {
          let dObject = this.objects.get(lObject.id())!;
          let dManager = dObject.manager();
          for (let [lk, lv] of lManager._localAttributes)
            dManager._versionAttributes.set(lk, this.to(lv));
          dManager.setVersion(dManager._version + 1);
          lManager.setVersion(dManager.version());
        }
      }
    }

    return willFail ? Promise.reject(objects) : Promise.resolve(objects);
  }
}, DataSource);
