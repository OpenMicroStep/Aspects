import * as sequelize from 'sequelize';
import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal} from '@microstep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;

class SequelizeQuery {
  model?: string = undefined;
  where?: sequelize.WhereOptions = undefined;
  attributes?: string[] = undefined;
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
          let type = this.model && this.db.models.get(this.model);
          if (!type)
            throw new Error(`no model`);
          let cc = this.db.manager().controlCenter();
          let cstor = type.cstor;
          let validAttributes = cstor.aspect.attributes;
          let attributes = ['_id', '_version']; // TODO: map them
          let loadAttributes: Aspect.InstalledAttribute[] = [];
          let include: sequelize.IncludeOptions[] = [];
          this.attributes && this.attributes.forEach(attr => {
            let a = validAttributes.get(attr);
            if (a) {
              loadAttributes.push(a); 
              attributes.push(attr);
            }
          });
          this.sharedQueries.forEach(query => {
            if (query !== this) {
              include.push(query.toInclude());
            };
          });
          type.model.findAll({
            where: this.where,
            include: include,
            attributes: attributes
          }).then((objects) => {
            objects.forEach(o => this.loadObject(o, cstor, cc, loadAttributes));
            resolve(this.values);
          }).catch(reject);
        });
      });
    }
    return this.promise;
  }

  toInclude() : sequelize.IncludeOptions {
    let type = this.model && this.db.models.get(this.model);
    if (!type)
      throw new Error(`no model`);
    return {
      model: type.model,
      where: this.where
    }
  }

  loadObject(o, cstor: Aspect.Constructor, cc: ControlCenter, loadAttributes: Aspect.InstalledAttribute[]) {
    let id = this.db.fromDbId(o._id, cstor.aspect);
    let version = o._version;
    let attributes = new Map<string, any>();
    for (let attr of loadAttributes) {
      // TODO: map key/value
      let value = o[attr.name];
      let versionedObjectName = attr.versionedObject;
      if (versionedObjectName) {
        let cstor = cc.aspect(versionedObjectName);
        if (!cstor)
          throw new Error(`cannot find aspect for ${versionedObjectName}`);
        let id = this.db.fromDbId(value, cstor.aspect);
        value = cc.registeredObject(id);
        if (!value) {
          value = new cstor();
          value.manager().setId(id);
        }
      }
      attributes.set(attr.name, value);
    }
    let vo = cc.registeredObject(id) || new cstor();
    let manager = vo.manager();
    manager.setId(id);
    manager.mergeWithRemoteAttributes(attributes as Map<keyof VersionedObject, any>, version);
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
    if (Array.isArray(value))
      value = value.map(v => v instanceof VersionedObject ? this.db.toDbId(v.id(), v.manager().aspect()) : v);
    else if (value instanceof VersionedObject)
      value = this.db.toDbId(value.id(), value.manager().aspect());
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
    this.attributes = set.scope;
    return ret;
  }

  setModel(on: SequelizeQuery, model?: string) : SequelizeQuery {
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
      case ConstraintType.InstanceOf: {
        let v: any = constraint.value;
        ret = ret.setModel(ret, v.aspect ? v.aspect.name : v.definition.name);
        break;
      }
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
  models = new Map<string, { model: sequelize.Model<any, any>, cstor: Aspect.Constructor }>();

  execute(set: ObjectSet): Promise<VersionedObject[]> {
    let query = new SequelizeQuery(this);
    query.build(set);
    return query.execute();
  }

  toDbId(id: Identifier, aspect: Aspect.Installed): number {
    return parseInt(id.toString().substring(aspect.name.length + 1));
  }
  fromDbId(id: number, aspect: Aspect.Installed): string {
    return `${aspect.name}:${id}`;
  }

  save(transaction: sequelize.Transaction, object: VersionedObject): Promise<{ _id: Identifier, _version: number }> {
    let aspect = object.manager().aspect();
    let type = this.models.get(aspect.name);
    if (!type)
      return Promise.reject('model not found');
    let manager = object.manager();
    let o: any = {};
    manager._localAttributes.forEach((v, k) => {
      // TODO: map key/values
      o[k] = v instanceof VersionedObject ? this.toDbId(v.id(), v.manager().aspect()) : v;
    });
    if (object.version() === VersionedObjectManager.NoVersion) {
      o._version = 0;
      return type.model.build(o).save({transaction: transaction}).then(o => Promise.resolve({ _id: this.fromDbId(o._id, aspect), _version: o._version }));
    }
    else {
      o._version = object.version() + 1;
      return type.model.update(o, { where: { _id: this.toDbId(object.id(), aspect), _version: object.version() },  transaction: transaction }).then(r => {
        let [affectedCount] = r;
        if (affectedCount < 1)
          return Promise.reject('cannot update object not found');
        if (affectedCount > 1)
          return Promise.reject('cannot update database is corrupted');
        return Promise.resolve({ _id: object.id(), _version: o._version });
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
