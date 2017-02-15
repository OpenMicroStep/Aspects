import {DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal} from './core';
import ObjectSet = DataSourceInternal.ObjectSet;

export const InMemoryDataSource = VersionedObject.cluster(class InMemoryDataSource extends DataSource 
{
  objects = new Set<VersionedObject>();

  implQuery(sets: ObjectSet[]): { [k: string]: VersionedObject[] } {
    let ret = {};
    sets.forEach(set => {
      if (set.name) {
        let objects: VersionedObject[] = [];
        this.objects.forEach(object => {
          if (set.pass(object))
            objects.push(object);
        });
        ret[set.name] = objects;
      }
    })
    return ret;
  }
  implLoad({objects, scope} : {
      objects?: VersionedObject[];
      scope?: string[];
  }): VersionedObject[] {
    return objects || [];
  }
  implSave(objects: VersionedObject[]) : VersionedObject[] {
    objects.forEach(object => {
      let version = object.version();
      if (version === VersionedObjectManager.DeletedVersion)
        this.objects.delete(object);
      else {
        let manager = object.manager();
        manager.setVersion(version + 1);
        this.objects.add(object);
      }
    });
    return objects;
  }
}, DataSource);
