import {Aspect, DataSource, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, AComponent, Invocation} from '@openmicrostep/aspects';
import {Parser, Reporter} from '@openmicrostep/msbuildsystem.shared';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlMappedObject, SqlMappedAttribute} from './mapper';
export * from './mapper';
import {SqlQuery, SqlMappedQuery, SqlMappedSharedContext, mapValue} from './query';
import {SqlMaker, DBConnectorTransaction, SqlBinding, SqlPath, SqlInsert, DBConnector, DBConnectorCRUD, Pool} from './index';

export type SqlDataSourceTransaction = { tr: DBConnectorTransaction, versions: Map<VersionedObject, { _id: Identifier, _version: number }> };
export class SqlDataSource extends DataSource
{
  constructor(manager: VersionedObjectManager<SqlDataSource>,
    public mappers: { [s: string] : SqlMappedObject },
    private connector: DBConnector,
    private maker: SqlMaker
  ) {
    super(manager);
  }

  static parent = DataSource;
  static definition = {
    is: "class",
    name: "SqlDataSource",
    version: 0,
    aspects: DataSource.definition.aspects
  };
  static installAspect(on: ControlCenter, name: 'client'): { new(): DataSource.Aspects.client };
  static installAspect(on: ControlCenter, name: 'server'): { new(mappers?: { [s: string] : SqlMappedObject }, connector?: DBConnector, maker?: SqlMaker): DataSource.Aspects.server };
  static installAspect(on: ControlCenter, name:string): any {
    return on.cache().createAspect(on, name, this);
  }

  async save(tr: SqlDataSourceTransaction, reporter: Reporter, objects: Set<VersionedObject>, object: VersionedObject) : Promise<void> {
    let manager = object.manager();
    let state = manager.state();
    let aspect = manager.aspect();
    let id = manager.id();
    let version = manager.versionVersion();
    let mapper = this.mappers[aspect.name];
    if (!mapper)
      return Promise.reject(`mapper not found for: ${aspect.name}`);
    let idAttr = mapper.get("_id")!;
    let isNew = state === VersionedObjectManager.State.NEW;
    let valuesByTable = new Map<SqlInsert, Map<string, any>>();
    let valuesByPath = new Map<string, { table: string, sets: SqlBinding[], checks: SqlBinding[], where: SqlBinding }>(); // [table, key]value*[table, key]
    if (isNew) {
      for (let c of mapper.inserts)
        valuesByTable.set(c, new Map<string, { nv: any, ov: any }>());
    }
    let map = (k: string, nv: any, ov: any | undefined) => {
      let attribute = mapper.get(k)!;
      if (!attribute.insert) // virtual attribute
        return;
      let last = attribute.last();
      let nvdb = mapValue(this, mapper, attribute, nv);
      if (isNew && attribute.insert) { // insert syntax
        let values = valuesByTable.get(attribute.insert)!;
        values.set(last.value, nvdb);
      }
      else { // update syntax
        let iddb = attribute.toDbKey(mapper.toDbKey(id));
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
            let select = this.maker.sub(this.maker.select([this.maker.column(`U0`, l.value)], from, [], this.maker.and(where)));
            values.where = this.maker.compare_bind({ sql: this.maker.quote(last.key), bind: [] }, ConstraintType.Equal, select);
          }
          else {
            values.where = this.maker.op(this.maker.quote(last.key), ConstraintType.Equal, iddb);
          }
        }
        values.sets.push(this.maker.set(this.maker.quote(last.value), nvdb));
        if (!isNew) {
          let ovdb = mapValue(this, mapper, attribute, ov);
          values.checks.push(this.maker.op(this.maker.quote(last.value), ConstraintType.Equal, ovdb));
        }
      }
    };
    for (let [k, nv] of manager.localAttributes()) {
      if (nv instanceof VersionedObject && nv.manager().state() === VersionedObjectManager.State.NEW) {
        if (!objects.has(nv)) {
          reporter.diagnostic({ type: "error", msg: `cannot save ${k}: referenced object is not saved and won't be` });
          continue;
        }
        if (!tr.versions.has(nv))
          await this.save(tr, reporter, objects, nv);
        let v = tr.versions.get(nv)!;
        let name = nv.manager().aspect().name;
        let mapper = this.mappers[name];
        if (!mapper)
          throw new Error(`cannot find mapper for ${name}`);
        let idattr = mapper.attribute_id();
        nv = idattr.toDbKey(mapper.toDbKey(v._id));
      }
      map(k, nv, isNew ? undefined : manager.versionAttributes().get(k));
    }
    map("_version", version + 1, version);
    version++;
    if (isNew) {
      for (let c of mapper.inserts) {
        let autoinc = "";
        let key = "";
        let values = valuesByTable.get(c)!;
        let output_columns: string[] = [];
        let columns: string[] = [];
        let sql_values: SqlBinding[] = [];
        for (let value of c.values) {
          switch (value.type) {
            case 'autoincrement':
              output_columns.push(value.name);
              break;
            case 'sql':
              columns.push(value.name);
              sql_values.push({ sql: value.value!, bind: [] });
              output_columns.push(value.name);
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
        columns.push(...values.keys());
        sql_values.push(...this.maker.values([...values.values()]));
        let sql_insert = this.maker.insert(c.table, columns, sql_values, output_columns);
        let result = await tr.tr.insert(sql_insert, output_columns); // sequential insertion
        output_columns.forEach((c, i) => values.set(c, result[i]));
        if (c === idAttr.insert) {
          id = mapper.fromDbKey(idAttr.fromDbKey(values.get(idAttr.last().value)));
          tr.versions.set(object, { _id: id, _version: version });
        }
      }
    }
    else {
      tr.versions.set(object, { _id: id, _version: version });
    }
    for (let entry of valuesByPath.values()) {
      let sql_update = this.maker.update(entry.table, entry.sets, this.maker.and([entry.where, ...entry.checks]));
      let changes = await tr.tr.update(sql_update); // TODO: test for any advantage to parallelize this ?
      if (changes !== 1)
        throw new Error(`cannot update`);
    }
  }

  scoped<P>(scope: (component: AComponent) => Promise<P>) : Promise<P> {
    let component = {};
    this.controlCenter().registerComponent(component);
    return scope(component)
      .then(v => { this.controlCenter().unregisterComponent(component); return Promise.resolve(v); })
      .catch(v => { this.controlCenter().unregisterComponent(component); return Promise.reject(v); })
  }

  execute(db: DBConnectorCRUD, set: ObjectSet, component: AComponent): Promise<VersionedObject[]> {
    let ctx: SqlMappedSharedContext = {
      cstor: SqlMappedQuery,
      db: db,
      component: component,
      controlCenter: this.controlCenter(),
      maker: this.maker,
      mappers: this.mappers,
      queries: new Map(),
      aliases: 0
    };
    return SqlQuery.execute(ctx, set);
  }
  _ctx(tr: SqlDataSourceTransaction | undefined, component: AComponent) : SqlMappedSharedContext {
    return {
      cstor: SqlMappedQuery,
      db: tr ? tr.tr : this.connector,
      component: component,
      controlCenter: this.controlCenter(),
      maker: this.maker,
      mappers: this.mappers,
      queries: new Map(),
      aliases: 0
    };
  }

  implQuery({ tr, sets }: { tr?: SqlDataSourceTransaction, sets: ObjectSet[] }): Promise<{ [k: string]: VersionedObject[] }> {
    return this.scoped(async (component) => {
      let ret = {};
      let ctx = this._ctx(tr, component);
      await Promise.all(sets
        .filter(s => s.name)
        .map(s => SqlQuery.execute(ctx, s)
          .then((objects) => ret[s.name!] = objects)));
      return ret;
    });
  }

  async implLoad({tr, objects, scope} : {
    tr?: SqlDataSourceTransaction;
    objects: VersionedObject[];
    scope: DataSourceInternal.Scope;
  }): Promise<VersionedObject[]> {
    let types = new Map<Aspect.Installed, VersionedObject[]>();
    for (let object of objects) {
      let aspect = object.manager().aspect();
      let list = types.get(aspect);
      if (!list)
        types.set(aspect, list = []);
      list.push(object);
    }
    let sets = new Set<ObjectSet>();
    for (let [aspect, list] of types) {
      let set = new ObjectSet(aspect.name);
      set.addType({ type: ConstraintType.MemberOf, value: aspect });
      set.and(new DataSourceInternal.ConstraintValue(ConstraintType.In, set._name, "_id", list));
      sets.add(set);
    }
    let set = new ObjectSet('load');
    if (sets.size > 1) {
      set.addType({ type: ConstraintType.UnionOf, value: sets });
    }
    else {
      set = sets.values().next().value;
    }
    set.scope = DataSourceInternal.parseScope(scope, (type) => {
      if (type === '_')
        return types.keys();
      return [this.controlCenter().aspectChecked(type)];
    }).scope;
    return await this.scoped(component => SqlQuery.execute(this._ctx(tr, component), set).then(() => objects));
  }

  async implBeginTransaction(): Promise<SqlDataSourceTransaction> {
    let tr = await this.connector.transaction();
    return { tr: tr, versions: new Map<VersionedObject, { _id: Identifier, _version: number }>() };
  }

  async implSave({tr, objects}: { tr: SqlDataSourceTransaction, objects: Set<VersionedObject> }) : Promise<Invocation<void>> {
    let reporter = new Reporter();
    for (let obj of objects) {
      try {
        if (!tr.versions.has(obj))
          await this.save(tr, reporter, objects, obj);
      } catch (e) {
        reporter.error(e || `unknown error`);
      }
    }
    return new Invocation(reporter.diagnostics, false, undefined);
  }

  async implEndTransaction({tr, commit}: { tr: SqlDataSourceTransaction, commit: boolean }) : Promise<void> {
    if (commit) {
      await tr.tr.commit();
      tr.versions.forEach((v, vo) => {
        let manager = vo.manager();
        manager.setId(v._id);
        manager.setVersion(v._version);
      });
    }
    else {
      await tr.tr.rollback();
    }
  }
}