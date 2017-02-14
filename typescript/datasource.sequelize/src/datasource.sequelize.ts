import * as sequelize from 'sequelize';
import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal} from '@microstep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;

class SqlTable {
  attributes = new Map<string, SqlAttribute>();
}

class SqlAttribute {

}

class SequelizeQuery {
  cstor?: Aspect.Constructor = undefined;
  model?: sequelize.Model<any, any> = undefined;
  where?: sequelize.WhereOptions = undefined;
  dependencies: SequelizeQuery[] = [];
  values: VersionedObject[] = [];
  requiredBy: SequelizeQuery[] = [];
  promise: Promise<VersionedObject[]> | undefined = undefined;

  constructor(public db: SequelizeDataSourceImpl, public sharedQueries = new Map<ObjectSet, SequelizeQuery>()) {}

  execute(): Promise<VersionedObject[]> {
    if (!this.promise) {
      let deps = this.dependencies.map(d => d.execute());
      this.promise = Promise.all(deps).then(() => {
        return new Promise<VersionedObject[]>((resolve, reject) => {
          if (!this.model)
            throw new Error(`no model`);
          let include: sequelize.IncludeOptions[] = [];
          this.sharedQueries.forEach(query => {
            if (query !== this) {
              include.push(query);
            };
          });
          this.model!.findAll({
            where: this.where,
            include: include
          }).then((objects) => {
            objects.forEach(o => this.loadObject(o));
            resolve(this.values);
          }).catch(reject);
        });
      });
    }
    return this.promise;
  }

  loadObject(o: Object) {
    if (!this.cstor)
      throw new Error(`no cstor`);
    let vo = new this.cstor();
    for (let k in o) {
      vo[k] = o[k];
    }
    this.values.push(vo);
  }

  addDependency(dep: SequelizeQuery) {
    this.dependencies.push(dep);
    dep.requiredBy.push(this);
  }

  addOperator(attribute: string | undefined, operator: string, value) {
    let where = this.where = this.where || {};
    attribute = attribute || "_id";
    // TODO: map attribute && values
    if (value instanceof VersionedObject)
      value = value.id();
    where = where[attribute] = (where[attribute] || {}) as sequelize.WhereOptions;
    this.addKeyValue(where, operator, value);
  }

  addKeyValue(where: sequelize.WhereOptions, key: string, value) {
    while (key in where)
      where = (where["$and"] = where["$and"] || {}) as sequelize.WhereOptions;
    where[key] = value;
  }

  build(set: ObjectSet) : SequelizeQuery {
    let ret: SequelizeQuery = this;
    set.constraintsOnType.forEach(constraint => ret = ret.addConstraintOnType(set, constraint));
    this.sharedQueries.set(set, ret);
    set.constraintsOnValue.forEach(constraint => ret.addConstraintOnValue(set, constraint));
    set.constraintsBetweenSet.forEach(constraint => ret.addConstraintBetweenSet(set, constraint));
    return ret;
  }

  setModel(on: SequelizeQuery, model?: sequelize.Model<any, any>) : SequelizeQuery {
    if (on.model && on.model !== model) {
      if (this === on)
        throw new Error(`constraints on type collides`);
      on = new SequelizeQuery(this.db);
    }
    on.model = model;
    return on;
  }
  addConstraintOnType(set: ObjectSet, constraint: DataSourceInternal.ConstraintOnType) : SequelizeQuery {
    let ret: SequelizeQuery = this;
    switch(constraint.type) {
      case ConstraintType.ElementOf:
      case ConstraintType.In: {
        let sub = ret.build(constraint.value as ObjectSet);
        if (sub !== ret) {
          let values = [];
          ret = ret.setModel(ret, sub.model);
          ret.addOperator('_id', '$in', values);
          ret.dependencies.push(sub);
          sub.requiredBy.push(ret);
        }
        break;
      }
      case ConstraintType.Union:{
        (constraint.value as ObjectSet[]).forEach(unionSet => {
          let sub = ret.build(unionSet);
          ret = ret.setModel(ret, sub.model);
          if (sub.model !== ret.model) {
            // TODO: union of sub request (ie. this request will be executed locally)
            throw new Error(`union of sub request is not yet supported`);
          }
          else if (sub.where) {
            let where = ret.where = ret.where || {};
            let $or = (where['$or'] = where['$or'] || []) as sequelize.WhereOptions[];
            $or.push(sub.where);
          }
        })
        break;
      }
      case ConstraintType.MemberOf:
      case ConstraintType.InstanceOf:
        ret = ret.setModel(ret, this.db.models.get((constraint.value as Aspect.Constructor).aspect.name));
        break;
    }
    return ret;
  }
  addConstraintOnValue(set: ObjectSet, constraint: DataSourceInternal.ConstraintOnValue) {
    switch(constraint.type) {
      case ConstraintType.Equal: this.addOperator(constraint.attribute, '$eq', constraint.value); break;
      case ConstraintType.NotEqual: this.addOperator(constraint.attribute, '$ne', constraint.value); break;
      case ConstraintType.GreaterThan: this.addOperator(constraint.attribute, '$gt', constraint.value); break;
      case ConstraintType.GreaterThanOrEqual: this.addOperator(constraint.attribute, '$gte', constraint.value); break;
      case ConstraintType.LessThan: this.addOperator(constraint.attribute, '$lt', constraint.value); break;
      case ConstraintType.LessThanOrEqual: this.addOperator(constraint.attribute, '$lte', constraint.value); break;
      case ConstraintType.Text: {
        if (constraint.attribute) this.addOperator(constraint.attribute, '$like', `%${constraint.value}%`);
        else throw new Error(`full text search on object is not yet supported, but it will be soon`);
        break;
      }
      case ConstraintType.In: this.addOperator(constraint.attribute, '$in', constraint.value); break;
      case ConstraintType.NotIn: this.addOperator(constraint.attribute, '$nin', constraint.value); break;
      case ConstraintType.Exists: {
        if (constraint.value) this.addOperator(constraint.attribute, '$not', null);
        else this.addOperator(constraint.attribute, '$eq', null);
        break;
      }
    }
  }

  addConstraintBetweenSet(set: ObjectSet, constraint: DataSourceInternal.ConstraintBetweenSet) {
    let otherSet = constraint.oppositeSet(set);
    let otherQuery = this.sharedQueries.get(otherSet);
    if (!otherQuery) {
      otherQuery = new SequelizeQuery(this.db, this.sharedQueries);
      otherQuery.build(otherSet);
    }
    if (constraint.set === set) {
      let value;
      switch(constraint.type) {
        case ConstraintType.Equal: this.addOperator(constraint.attribute, '$eq', value); break;
        case ConstraintType.NotEqual: this.addOperator(constraint.attribute, '$ne', value); break;
        case ConstraintType.GreaterThan: this.addOperator(constraint.attribute, '$gt', value); break;
        case ConstraintType.GreaterThanOrEqual: this.addOperator(constraint.attribute, '$gte', value); break;
        case ConstraintType.LessThan: this.addOperator(constraint.attribute, '$lt', value); break;
        case ConstraintType.LessThanOrEqual: this.addOperator(constraint.attribute, '$lte', value); break;
        case ConstraintType.Text: {
          if (constraint.attribute) this.addOperator(constraint.attribute, '$like', `%${value}%`);
          else throw new Error(`full text search on object is not yet supported, but it will be soon`);
          break;
        }
        case ConstraintType.In: this.addOperator(constraint.attribute, '$in', value); break;
        case ConstraintType.NotIn: this.addOperator(constraint.attribute, '$nin', value); break;
      }
    }
  }
}

export class SequelizeDataSourceImpl extends DataSource {
  sequelize: sequelize.Sequelize;
  models = new Map<string, sequelize.Model<any, any>>();

  execute(set: ObjectSet): Promise<VersionedObject[]> {
    let query = new SequelizeQuery(this);
    query.build(set);
    return query.execute();
  }

  save(transaction: sequelize.Transaction, object: VersionedObject): Promise<{ _id: Identifier, _version: number }> {
    let model = this.models.get(object.manager().aspect().name);
    if (!model)
      return Promise.reject('model not found');
    let manager = object.manager();
    let nextVersion = manager.version() + 1;
    let o: any = { _version: nextVersion };
    manager._localAttributes.forEach((v, k) => {
      // TODO: map key/values
      o[k] = v;
    });
    if (object.version() === VersionedObjectManager.NoVersion) {
      return model.build(o).save({transaction: transaction}).then(o => Promise.resolve({ _id: o._id, _version: o._version }));
    }
    else {
      return model.update([
        {}
      ], { where: { _id: object.id(), _version: object.version() },  transaction: transaction }).then(r => {
        let [affectedCount] = r;
        if (affectedCount < 1)
          return Promise.reject('cannot update object not found');
        if (affectedCount > 1)
          return Promise.reject('cannot update database is corrupted');
        return Promise.resolve({ _id: object.id(), _version: nextVersion });
      }) as any;
    }
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
      objects?: VersionedObject[];
      scope?: string[];
  }): Promise<VersionedObject[]> {
    return Promise.reject("not implemented");
  }

  implSave(objects: VersionedObject[]) : Promise<VersionedObject[]> {
    return new Promise<VersionedObject[]>((resolve, reject) => {
      let versions: { _id: Identifier, _version: number }[];
      this.sequelize.transaction((transaction) => Promise.all(objects.map(object => this.save(transaction, object))).then(v => versions = v) as any)
      .then(() => {
        // update objects
        versions.forEach((v, i) => {
          objects[i]._id = v._id;
          objects[i].manager().setVersion(v._version);
        });
        resolve(objects);
      })
      .catch(reject);
    });
  }
}

export const SequelizeDataSource = VersionedObject.cluster(SequelizeDataSourceImpl, DataSource);
