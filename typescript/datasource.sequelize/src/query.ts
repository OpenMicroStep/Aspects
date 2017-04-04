import * as sequelize from 'sequelize';
import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal} from '@microstep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlMappedObject, SqlStorage} from './mapper';

export class SequelizeQuery {
  mapper?: SqlMappedObject = undefined;
  attributes?: string[] = undefined;
  where = new Map<SqlStorage, sequelize.WhereOptions>();
  dependencies: SequelizeQuery[] = [];
  values: VersionedObject[] = [];
  requiredBy: SequelizeQuery[] = [];
  promise: Promise<VersionedObject[]> | undefined = undefined;

  constructor(public db: { sequelize: sequelize.Sequelize, mappers: { [s: string] : SqlMappedObject } }
            , public sharedQueries = new Map<ObjectSet, SequelizeQuery>()) {}

  // BEGIN BUILD
  build(set: ObjectSet) : SequelizeQuery {
    let ret: SequelizeQuery = this;
    set.constraintsOnType.forEach(constraint => ret = ret.addConstraintOnType(set, constraint));
    this.sharedQueries.set(set, ret);
    set.constraintsOnValue.forEach(constraint => ret.addConstraintOnValue(set, constraint));
    set.constraintsBetweenSet.forEach(constraint => ret.addConstraintBetweenSet(set, constraint));
    this.attributes = set.scope;
    return ret;
  }

  addKeyValue(where: sequelize.WhereOptions, key: string, value) {
    while (key in where)
      where = (where["$and"] = where["$and"] || {}) as sequelize.WhereOptions;
    where[key] = value;
  }
  
  addOperator(attribute: string | undefined, operator: string, value) {
    if (!this.mapper)
      throw new Error(`cannot add operator before mapper is set`);
    attribute = attribute || "_id";

    let sqlattr = this.mapper.attributes.get(attribute);
    if (!sqlattr)
      throw new Error(`attribute ${attribute} is not defined in ${this.mapper}`);

    let where = this.where.get(sqlattr.storage);
    if (!where)
      this.where.set(sqlattr.storage, where = {});
    if (Array.isArray(value))
      value = value.map(v => sqlattr!.mapToStorage(attribute!, value));
    if (attribute === '_id') {
      // TODO: this is going to be very complex ...
    }
    else {
      attribute = sqlattr.path[0];
    }
    where = where[attribute] = (where[attribute] || {}) as sequelize.WhereOptions;
    this.addKeyValue(where, operator, value);
  }

  addDependency(dep: SequelizeQuery) {
    this.dependencies.push(dep);
    dep.requiredBy.push(this);
  }

  setMapper(on: SequelizeQuery, mapper: SqlMappedObject | undefined) : SequelizeQuery {
    if (on.mapper && on.mapper !== mapper) {
      if (this === on)
        throw new Error(`constraints on type collides`);
      on = new SequelizeQuery(this.db);
    }
    on.mapper = mapper;
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
          ret = ret.setMapper(ret, sub.mapper);
          ret.addOperator('_id', '$in', values);
          ret.dependencies.push(sub);
          sub.requiredBy.push(ret);
        }
        break;
      }
      case ConstraintType.Union:{
        (constraint.value as ObjectSet[]).forEach(unionSet => {
          let sub = ret.build(unionSet);
          ret = ret.setMapper(ret, sub.mapper);
          throw new Error(`union is not yet supported`);
          /*if (sub.mapper !== ret.mapper) {
            // TODO: union of sub request (ie. this request will be executed locally)
            throw new Error(`union of sub request is not yet supported`);
          }
          else if (sub.where) {
            let where = ret.where = ret.where || {};
            let $or = (where['$or'] = where['$or'] || []) as sequelize.WhereOptions[];
            $or.push(sub.where);
          }*/
        })
        break;
      }
      case ConstraintType.MemberOf:
      case ConstraintType.InstanceOf: {
        let v: any = constraint.value;
        ret = ret.setMapper(ret, ret.db.mappers[v.aspect ? v.aspect.name : v.definition.name]);
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
  // END BUILD

  execute(cc: ControlCenter): Promise<VersionedObject[]> {
    if (!this.promise) {
      let deps = this.dependencies.map(d => d.execute(cc));
      this.promise = Promise.all(deps).then(async () => {
        let ret: VersionedObject[];
        if (!this.mapper)
          throw new Error(`no mapper`);
        let idStorage = this.mapper.attributes.get('_id')!.storage;
        let attributeByStorage = new Map<SqlStorage, string[]>();
        let attributes = this.attributes || [];
        attributes.unshift('_id', '_version');

        for (let attribute of attributes) {
          let sqlattr = this.mapper.attributes.get(attribute);
          if (!sqlattr)
            throw new Error(`attribute ${attribute} is not defined in ${this.mapper}`);
          let attrs = attributeByStorage.get(sqlattr.storage);
          if (!attrs)
            attributeByStorage.set(sqlattr.storage, attrs = []);
          attrs.push(sqlattr.path[0]);
        }

        let include: sequelize.IncludeOptions[] = [];
        let includeByStorage = new Map<SqlStorage, sequelize.IncludeOptions>();
        let request = {
          raw: true,
          attributes: attributeByStorage.get(idStorage),
          where: this.where.get(idStorage),
          include: include,
        }
        let getInclude = (storage: SqlStorage) => {
          let i = includeByStorage.get(storage);
          if (!i) {
            i = {};
            includeByStorage.set(storage, i);
            include.push(i);
          }
          return i;
        }

        for (let query of this.sharedQueries.values()) {
          for (let [storage, attributes] of attributeByStorage) {
            if (storage !== idStorage)
              getInclude(storage).attributes = attributes;
          }
          for (let [storage, where] of query.where) {
            if (storage !== idStorage)
              getInclude(storage).where = where;
          }
        }
        let objects = await idStorage.model.findAll(request);
        // TODO: LOAD
        return this.values;
      });
    }
    return this.promise;
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
}
