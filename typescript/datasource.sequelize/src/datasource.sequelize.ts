import * as sequelize from 'sequelize';
import {DataSource, Scope, Conditions, VersionedObject, Identifier, ControlCenter} from '@microstep/aspects';

export class SequelizeDataSource extends DataSource {
  models: { [s: string]: sequelize.Model<any, any> };
  implementations = new Map<string, { aspect: ControlCenter.InstalledAspect, implementation: ControlCenter.Implementation }>();
  sequelize: sequelize.Sequelize;
  define(implementation: ControlCenter.Implementation, additions = {}) {
    let aspect = this.manager().controlCenter().aspect(implementation);
    this.implementations.set(aspect.name, { aspect: aspect, implementation: implementation });
    let model = {
      _id: { type: sequelize.BIGINT.UNSIGNED, primaryKey: true },
      _version: sequelize.INTEGER.UNSIGNED
    };
    aspect.attributes.forEach(a => {
      model[a.name]= this.mapTypeToSequelize(a.classifiedType)
    });
    this.sequelize.define(aspect.name, Object.assign(model, additions));
  }

  mapTypeToSequelize(type: ControlCenter.PrimaryType | 'entity'): any {
    switch(type) {
      case 'integer':    return sequelize.INTEGER;
      case 'decimal':    return sequelize.DECIMAL;
      case 'date':       return sequelize.DATE;
      case 'localdate':  return sequelize.DATE;
      case 'string':     return sequelize.TEXT;
      case 'identifier': return sequelize.BIGINT.UNSIGNED;
      case 'entity':     return sequelize.BIGINT.UNSIGNED;
      case 'object':
      case 'any':        
      case 'dictionary': 
      case 'array':      
        throw new Error(`unsupported type: ${type} (will be mapped to JSON later)`);
      default: throw new Error(`unsupported type: ${type}`);
    }
  }

  mapVersionedObjects(objects): VersionedObject[] {
    return objects.map((o) => {
      let cls = this.implementations.get(o.getTableName())!.implementation;
      let a = new cls();
      Object.keys(o).forEach(k => a[k] = o[k]);
      return a;
    })
  }

  protected _query({conditions, scope}: {conditions: Conditions, scope?: Scope}): Promise<VersionedObject[]> {
    return <any>this.models[conditions['$class']].findAll().then((objects) => {
      return this.filter(objects, conditions);
    });
  }
  protected _load({objects, scope}: {objects: VersionedObject[], scope?: Scope}): Promise<VersionedObject[]> {
    let byName = new Map<string, VersionedObject[]>();
    objects.forEach((o) => {
      let name = o.manager().aspect().name;
      let objects = byName.get(name);
      if (!objects)
        byName.set(name, objects= []);
      objects.push(o);
    });
    let requests = <Promise<VersionedObject[]>[]>[];
    byName.forEach((objects, objectClass) => {
      requests.push(<any>this.models[objectClass].findAll({ where: { _id: { $in: objects.map(o => o.id()) }}}));
    });
    return Promise.all<VersionedObject[]>(requests).then((results) => {
      return (<VersionedObject[]>[]).concat(...results);
    }); 
  }
  protected _save(objects: VersionedObject[]): Promise<boolean> {
    return Promise.reject("not implemented");
  }
}
