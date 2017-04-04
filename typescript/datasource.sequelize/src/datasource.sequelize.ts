import * as sequelize from 'sequelize';
import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal} from '@openmicrostep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlMappedObject} from './mapper';
export * from './mapper';
import {SequelizeQuery} from './query';

/*interface QueryGenerator {
  selectQuery(tableName: string, options: {
    attributes: string[],
    where: any,
    order: any,
    group: any,
    limit: any,
    offset: any,
  })
}
this.db.sequelize.dialect.QueryGenerator
*/
export class SequelizeDataSourceImpl extends DataSource {
  sequelize: sequelize.Sequelize;
  mappers: { [s: string] : SqlMappedObject };

  execute(set: ObjectSet): Promise<VersionedObject[]> {
    let query = new SequelizeQuery(this);
    query.build(set);
    return query.execute();
  }

  save(transaction: sequelize.Transaction, object: VersionedObject): Promise<{ _id: Identifier, _version: number }> {
    let aspect = object.manager().aspect();
    let mapper = this.mappers[object.manager().aspect().name];
    if (!mapper)
      return Promise.reject(`mapper not found for: ${aspect.name}`);
    return mapper.save(transaction, object);
  }

  implQuery(sets: ObjectSet[]): Promise<{ [k: string]: VersionedObject[] }> {
    let ret = {};
    return Promise.all(sets
      .filter(s => s.name)
      .map(s => this.execute(s)
      .then(obs => ret[s.name!] = obs))
    ).then(() => ret);
  }
  implLoad({objects, scope} : {
      objects: VersionedObject[];
      scope?: string[];
  }): Promise<VersionedObject[]> {
    let types = new Map<Function, VersionedObject[]>();
    for (let object of objects) {
      let aspect = object.constructor;
      let list = types.get(aspect);
      if (!list)
        types.set(aspect, list = []);
      list.push(object);
    }
    let sets = <ObjectSet[]>[];
    types.forEach((list, aspect) => {
      let set = new ObjectSet();
      set.scope = scope;
      new DataSourceInternal.ConstraintOnType(ConstraintType.InstanceOf, set, aspect);
      new DataSourceInternal.ConstraintOnValue(ConstraintType.In, set, undefined, list);
      sets.push(set);
    });
    return Promise.all(sets.map(s => this.execute(s))).then((results) => {
      return ([] as VersionedObject[]).concat(...results);
    });
  }

  implSave(objects: VersionedObject[]) : Promise<VersionedObject[]> {
    return new Promise<VersionedObject[]>((resolve, reject) => {
      this.sequelize.transaction((transaction) => Promise.all(objects.map(object => this.save(transaction, object))) as any)
      .then((versions: { _id: Identifier, _version: number }[]) => {
        // update objects
        versions.forEach((v, i) => {
          let manager = objects[i].manager();
          manager.setId(v._id);
          manager.setVersion(v._version);
        });
        resolve(objects);
      })
      .catch(reject);
    });
  }
}

export const SequelizeDataSource = VersionedObject.cluster(SequelizeDataSourceImpl, DataSource);
