import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, AComponent} from '@openmicrostep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlMappedObject} from './mapper';
export * from './mapper';
import {SqlQuery, mapValue} from './query';
import {SqlMaker, DBConnectorTransaction, SqlBinding, SqlPath, SqlInsert, DBConnector, Pool} from './index';

export class SequelizeDataSourceImpl extends DataSource {
  pool: Pool<DBConnector>;
  mappers: { [s: string] : SqlMappedObject };
  maker: SqlMaker;

  execute(db: DBConnector, set: ObjectSet, component: AComponent): Promise<VersionedObject[]> {
    let query = new SqlQuery();
    let ctx = {
      controlCenter: this.controlCenter(),
      maker: this.maker,
      mappers: this.mappers,
      queries: new Map(),
      aliases: 0
    };
    query.build(ctx, set);
    return query.execute(ctx, db, component);
  }
  async save(transaction: DBConnectorTransaction, object: VersionedObject): Promise<{ _id: Identifier, _version: number }> {
    let manager = object.manager();
    let aspect = manager.aspect();
    let id = manager.id();
    let version = manager._version;
    let mapper = this.mappers[aspect.name];
    if (!mapper)
      return Promise.reject(`mapper not found for: ${aspect.name}`);
    let idAttr = mapper.get("_id");
    let isNew = VersionedObjectManager.isLocalId(id);
    let valuesByTable = new Map<SqlInsert, Map<string, any>>();
    let valuesByPath = new Map<string, { table: string, sets: SqlBinding[], checks: SqlBinding[], where: SqlBinding }>(); // [table, key]value*[table, key]
    if (isNew) {
      for (let c of mapper.inserts)
        valuesByTable.set(c, new Map<string, { nv: any, ov: any }>());
    }
    let map = (k: string, nv: any, ov: any | undefined) => {
      let attribute = mapper.get(k);
      let last = attribute.last();
      let nvdb = attribute.toDb(mapValue(mapper, this, nv, k === '_id'));
      if (isNew && attribute.insert) { // insert syntax
        let values = valuesByTable.get(attribute.insert)!;
        values.set(last.value, nvdb);
      }
      else { // update syntax
        let iddb = attribute.toDbKey(mapper.toDbKey(id));
        let ovdb = ov && attribute.toDb(mapValue(mapper, this, ov, k === '_id'));
        let key = attribute.pathref_uniqid();
        let values = valuesByPath.get(key);
        if (!values) {
          valuesByPath.set(key, values = { table: last.table, sets: [], checks: [], where: { sql: "", bind: [] } });
          if (attribute.path.length > 1) {
            let from: SqlBinding[] = [];
            let where: SqlBinding[] = [];
            let p: SqlPath;
            let l: SqlPath = attribute.path[0];
            let i = 1, len = attribute.path.length - 1;
            from.push(this.maker.from(l.table, `U0`));
            where.push(this.maker.op(this.maker.column(`U0`, l.key), ConstraintType.Equal, iddb));
            for (; i < len; i++) {
              p = attribute.path[i];
              from.push(this.maker.from(p.table, `U${i}`));
              where.push(this.maker.compare(this.maker.column(`U${i - 1}`, l.value), ConstraintType.Equal, this.maker.column(`U${i}`, p.key)))
              l = p;
            }
            let select = this.maker.sub(this.maker.select([l.value], from, [], this.maker.and(where)));
            values.where = this.maker.compare_bind({ sql: this.maker.quote(last.key), bind: [] }, ConstraintType.Equal, select);
          }
          else {
            values.where = this.maker.op(this.maker.quote(last.key), ConstraintType.Equal, iddb);
          }
        }
        values.sets.push(this.maker.set(this.maker.quote(last.value), nvdb));
        if (!isNew)
          values.checks.push(this.maker.op(this.maker.quote(last.value), ConstraintType.Equal, ovdb));
      }
    };
    manager._localAttributes.forEach((nv, k) => map(k, nv, isNew ? undefined : manager._versionAttributes.get(k)));
    map("_version", version + 1, version);
    version++;
    if (isNew) {
      for (let c of mapper.inserts) {
        let autoinc = "";
        let key = "";
        let values = valuesByTable.get(c)!;
        for (let value of c.values) {
          switch (value.type) {
            case 'autoincrement':
              if (autoinc)
                throw new Error(`only one autoincremented column is autorized by insert`);
              autoinc = value.name; 
              break;
            case 'ref': {
              let tvalues = valuesByTable.get(value.insert!);
              if (!tvalues || !tvalues.has(value.value!))
                throw new Error(`referencing a previously created value that doesn't exists: ${value.insert}.${value.value}`);
              values.set(value.name, tvalues.get(value.value!)); break;
            }
            case 'value': values.set(value.name, value.value); break;
            default:
              throw new Error(`unsupported sql-value type: ${value.type}`);
          }
        }
        let sql_insert = this.maker.insert(c.table, this.maker.values(Array.from(values.keys()), Array.from(values.values())));
        let result = await transaction.insert(sql_insert); // sequential insertion
        if (autoinc)
          values.set(autoinc, result);
        if (c === idAttr.insert)
          id = mapper.fromDbKey(idAttr.fromDbKey(values.get(idAttr.last().value)));
      }
    }
    for (let entry of valuesByPath.values()) {
      let sql_update = this.maker.update(entry.table, entry.sets, this.maker.and([entry.where, ...entry.checks]));
      let changes = await transaction.update(sql_update); // TODO: test for any advantage to parallelize this ?
      if (changes !== 1)
        throw new Error(`cannot update`);
    }
    return { _id: id, _version: version };
  }

  scoped<P>(scope: (component: AComponent) => Promise<P>) : Promise<P> {
    let component = {};
    this.controlCenter().registerComponent(component);
    return scope(component)
      .then(v => { this.controlCenter().unregisterComponent(component); return Promise.resolve(v); })
      .catch(v => { this.controlCenter().unregisterComponent(component); return Promise.reject(v); })
  }

  implQuery(sets: ObjectSet[]): Promise<{ [k: string]: VersionedObject[] }> {
    let ret = {};
    return this.pool.scoped(db => this.scoped(component => 
      Promise.all(sets
        .filter(s => s.name)
        .map(s => this.execute(db, s, component)
        .then(obs => ret[s.name!] = obs))
      ).then(() => ret)));
  }

  async implLoad({objects, scope} : {
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
    let results = await this.pool.scoped(db => this.scoped(component => Promise.all(sets.map(s => this.execute(db, s, component)))));
    return ([] as VersionedObject[]).concat(...results);
  }

  implSave(objects: VersionedObject[]) : Promise<VersionedObject[]> {
    return this.pool.scoped(async (db) => {
      let tr = await db.transaction();
      let versions: { _id: Identifier, _version: number }[] = [];
      try {
        for (let obj of objects)
          versions.push(await this.save(tr, obj));
        await tr.commit();
      } catch(e) {
        await tr.rollback();
      }
      versions.forEach((v, i) => {
        let manager = objects[i].manager();
        manager.setId(v._id);
        manager.setVersion(v._version);
      });
      return objects;
    });
  }
}

export const SequelizeDataSource = VersionedObject.cluster(SequelizeDataSourceImpl, DataSource);
