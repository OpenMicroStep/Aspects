import {Aspect, DataSource, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, ControlCenterContext, DataSourceInternal, AComponent, Result} from '@openmicrostep/aspects';
import {Reporter} from '@openmicrostep/msbuildsystem.shared';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlMappedObject} from './mapper';
export * from './mapper';
import {SqlQuery, SqlMappedQuery, SqlMappedSharedContext, mapValue} from './query';
import {SqlMaker, DBConnectorTransaction, SqlBinding, SqlPath, SqlInsert, DBConnector, DBConnectorCRUD} from './index';

export type SqlDataSourceTransaction = { tr: DBConnectorTransaction, versions: Map<VersionedObject, { _id: Identifier, _version: number }> };
export class SqlDataSource extends DataSource {
  constructor(cc: ControlCenter,
    public mappers: { [s: string]: SqlMappedObject },
    private connector: DBConnector,
    private maker: SqlMaker = connector.maker
  ) {
    super(cc);
  }

  static parent = DataSource;
  static definition = {
    is: "class",
    name: "SqlDataSource",
    version: 0,
    is_sub_object: false,
    aspects: DataSource.definition.aspects
  };

  async save(tr: SqlDataSourceTransaction, reporter: Reporter, objects: Set<VersionedObject>, object: VersionedObject) : Promise<void> {
    let manager = object.manager();
    let aspect = manager.aspect();
    let id = manager.id();
    let version = manager.version();
    let mapper = this.mappers[aspect.classname];
    if (!mapper)
      return Promise.reject(`mapper not found for: ${aspect.classname}`);
    let idAttr = mapper.get("_id")!;
    let isNew = manager.isNew();
    let valuesByTable = new Map<SqlInsert, Map<string, any>>();
    let valuesByPath = new Map<string, { table: string, sets: SqlBinding[], checks: SqlBinding[], where: SqlBinding }>(); // [table, key]value*[table, key]
    if (isNew) {
      for (let c of mapper.inserts)
        valuesByTable.set(c, new Map<string, { nv: any, ov: any }>());
    }
    let map = (k: Aspect.InstalledAttribute, modified: any, saved: any | undefined) => {
      let mapped_attribute = mapper.get(k.name)!;
      if (!mapped_attribute.insert) // virtual attribute
        return;
      let last = mapped_attribute.last();
      let db_modified = mapValue(this, mapper, mapped_attribute, modified);
      if (isNew && mapped_attribute.insert) { // insert syntax
        let values = valuesByTable.get(mapped_attribute.insert)!;
        values.set(last.value, db_modified);
      }
      else { // update syntax
        let iddb = mapped_attribute.toDbKey(mapper.toDbKey(id));
        let key = mapped_attribute.pathref_uniqid();
        let values = valuesByPath.get(key);
        if (!values) {
          valuesByPath.set(key, values = { table: last.table, sets: [], checks: [], where: { sql: "", bind: [] } });
          if (mapped_attribute.path.length > 1) {
            let p: SqlPath;
            let l: SqlPath = mapped_attribute.path[0];
            let i = 1, len = mapped_attribute.path.length - 1;
            let from = this.maker.from(l.table, `U0`);
            let joins: SqlBinding[] = [];
            let where = this.maker.op(this.maker.column(`U0`, l.key), ConstraintType.Equal, iddb);
            for (; i < len; i++) {
              p = mapped_attribute.path[i];
              joins.push(this.maker.join('inner',
                p.table, `U${i}`,
                this.maker.compare(this.maker.column(`U${i - 1}`, l.value), ConstraintType.Equal, this.maker.column(`U${i}`, p.key))
              ));
              l = p;
            }
            let select = this.maker.sub(this.maker.select([this.maker.column(`U0`, l.value)], from, joins, where));
            values.where = this.maker.compare_bind({ sql: this.maker.quote(last.key), bind: [] }, ConstraintType.Equal, select);
          }
          else {
            values.where = this.maker.op(this.maker.quote(last.key), ConstraintType.Equal, iddb);
          }
        }
        values.sets.push(this.maker.set(last.value, db_modified));
        if (!isNew) {
          let db_saved = mapValue(this, mapper, mapped_attribute, saved);
          values.checks.push(this.maker.op(this.maker.quote(last.value), ConstraintType.Equal, db_saved));
        }
      }
    };
    for (let { attribute, modified } of manager.modifiedAttributes()) {
      if (modified instanceof VersionedObject && modified.manager().isNew()) {
        if (!objects.has(modified)) {
          reporter.diagnostic({ is: "error", msg: `cannot save ${attribute.name}: referenced object is not saved and won't be` });
          continue;
        }
        if (!tr.versions.has(modified))
          await this.save(tr, reporter, objects, modified);
        let v = tr.versions.get(modified)!;
        let name = modified.manager().classname();
        let mapper = this.mappers[name];
        if (!mapper)
          throw new Error(`cannot find mapper for ${name}`);
        let idattr = mapper.attribute_id();
        modified = idattr.toDbKey(mapper.toDbKey(v._id));
      }
      map(attribute, modified, isNew ? undefined : manager.savedAttributeValueFast(attribute));
    }
    map(Aspect.attribute_version, version + 1, version);
    version++;
    if (isNew) {
      for (let c of mapper.inserts) {
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
              values.set(value.name, tvalues.get(value.value!));
            } break;
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

  execute(db: DBConnectorCRUD, set: ObjectSet, ccc: ControlCenterContext): Promise<VersionedObject[]> {
    let ctx: SqlMappedSharedContext = {
      cstor: SqlMappedQuery,
      db: db,
      ccc: ccc,
      controlCenter: this.controlCenter(),
      maker: this.maker,
      mappers: this.mappers,
      queries: new Map(),
      aliases: 0
    };
    return SqlQuery.execute(ctx, set);
  }
  _ctx(tr: SqlDataSourceTransaction | undefined, ccc: ControlCenterContext) : SqlMappedSharedContext {
    return {
      cstor: SqlMappedQuery,
      db: tr ? tr.tr : this.connector,
      ccc: ccc,
      controlCenter: this.controlCenter(),
      maker: this.maker,
      mappers: this.mappers,
      queries: new Map(),
      aliases: 0
    };
  }

  async implQuery({ context: { ccc } }, { tr, sets }: { tr?: SqlDataSourceTransaction, sets: ObjectSet[] }): Promise<{ [k: string]: VersionedObject[] }> {
    let ret = {};
    let ctx = this._ctx(tr, ccc);
    return Promise.all(sets
      .filter(s => s.name)
      .map(s => SqlQuery.execute(ctx, s)
      .then((objects) => ret[s.name!] = objects))
    ).then(() => ret);
  }

  async implLoad({ context: { ccc } }, {tr, objects, scope}: {
    tr?: SqlDataSourceTransaction;
    objects: VersionedObject[];
    scope: DataSourceInternal.ResolvedScope;
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
      let set = new ObjectSet(aspect.classname);
      set.addType({ type: ConstraintType.MemberOf, value: aspect });
      set.and(new DataSourceInternal.ConstraintValue(ConstraintType.In, set._name, Aspect.attribute_id, list));
      sets.add(set);
    }
    let set = new ObjectSet('load');
    if (sets.size > 1) {
      set.addType({ type: ConstraintType.Union, value: sets });
    }
    else {
      set = sets.values().next().value;
    }
    set.scope = scope;
    await SqlQuery.execute(this._ctx(tr, ccc), set);
    return objects;
  }

  async implBeginTransaction(): Promise<SqlDataSourceTransaction> {
    let tr = await this.connector.transaction();
    return { tr: tr, versions: new Map<VersionedObject, { _id: Identifier, _version: number }>() };
  }

  async implSave({ context: { ccc } }, {tr, objects}: { tr: SqlDataSourceTransaction, objects: Set<VersionedObject> }) : Promise<Result<void>> {
    let reporter = new Reporter();
    for (let obj of objects) {
      try {
        if (!tr.versions.has(obj))
          await this.save(tr, reporter, objects, obj);
      } catch (e) {
        reporter.error(e || `unknown error`);
      }
    }
    return Result.fromDiagnostics(reporter.diagnostics);
  }

  async implEndTransaction({ context: { ccc } }, {tr, commit}: { tr: SqlDataSourceTransaction, commit: boolean }) : Promise<void> {
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

export namespace SqlDataSource {
  export const Aspects = {
    client: Aspect.disabled_aspect<DataSource.Aspects.client>("DataSource", "client", "SqlDataSource"),
    server: <Aspect.FastConfiguration<DataSource.Aspects.server>> {
      name: "DataSource", aspect: "server", cstor: SqlDataSource, categories: DataSource.Aspects.server.categories,
      create(ccc: ControlCenterContext, mappers: { [s: string]: SqlMappedObject }, connector: DBConnector) {
        return ccc.create<DataSource.Aspects.server>("DataSource", this.categories, mappers, connector);
      },
    },
  };
}
