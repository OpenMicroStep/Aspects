import {Aspect, DataSource, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, ControlCenterContext, DataSourceInternal, AComponent, Result} from '@openmicrostep/aspects';
import {Reporter} from '@openmicrostep/msbuildsystem.shared';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;
import {SqlMappedObject, SqlMappedAttribute} from './mapper';
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
    let maker = this.maker;
    let manager = object.manager();
    let aspect = manager.aspect();
    let id = manager.id();
    let version = manager.version();
    let mapper = this.mappers[aspect.classname];
    if (!mapper)
      return Promise.reject(`mapper not found for: ${aspect.classname}`);
    let idAttr = mapper.get("_id")!;
    let id_path_last = idAttr.last();
    let isNew = manager.isNew();
    let inserts = new Map<SqlInsert, Map<string, any>[]>();;
    let requestsByPath = new Map<string, {
      table: string,
      delete: SqlBinding[],
      update_sets: SqlBinding[], update_checks: SqlBinding[],
      where: SqlBinding
    }>(); // [table, key]value*[table, key]
    let requestsForAttribute = (attribute: SqlMappedAttribute) => {
      let iddb = attribute.toDbKey(mapper.toDbKey(id));
      let key = attribute.pathref_uniqid();
      let ret = requestsByPath.get(key);
      let last = attribute.last();
      if (!ret) {
        requestsByPath.set(key, ret = { table: last.table, delete: [], update_sets: [], update_checks: [], where: { sql: "", bind: [] } });
        if (attribute.path.length > 1) {
          let p: SqlPath;
          let l: SqlPath = attribute.path[0];
          let i = 1, len = attribute.path.length - 1;
          let from = this.maker.from(l.table, `U0`);
          let joins: SqlBinding[] = [];
          let where = this.maker.op(this.maker.column(`U0`, l.key), ConstraintType.Equal, iddb);
          for (; i < len; i++) {
            p = attribute.path[i];
            joins.push(this.maker.join('inner',
              p.table, `U${i}`,
              this.maker.compare(this.maker.column(`U${i - 1}`, l.value), ConstraintType.Equal, this.maker.column(`U${i}`, p.key))
            ));
            l = p;
          }
          let select = this.maker.sub(this.maker.select([this.maker.column(`U0`, l.value)], from, joins, where));
          ret.where = this.maker.compare_bind({ sql: this.maker.quote(last.key), bind: [] }, ConstraintType.Equal, select);
        }
        else {
          ret.where = this.maker.op(this.maker.quote(last.key), ConstraintType.Equal, iddb);
        }
      }
      return ret;
    };

    let map = (attribute: Aspect.InstalledAttribute, modified: any, saved: any | undefined) => {
      let mapped_attribute = mapper.get(attribute.name);
      if (!mapped_attribute)
        throw new Error(`attribute ${attribute.name} is missing in mapper ${mapper.name}`);
      if (!mapped_attribute.insert) // virtual attribute
        return;
      let last = mapped_attribute.last();
      let is_single_value = Aspect.typeIsSingleValue(attribute.type);
      let db_modified = mapValue(this, mapper, mapped_attribute, modified);
      let db_saved = saved !== undefined ? mapValue(this, mapper, mapped_attribute, saved) : undefined;
      if (isNew && mapped_attribute.insert) { // insert syntax
        let insert = inserts.get(mapped_attribute.insert);
        if (!insert)
          inserts.set(mapped_attribute.insert, insert = []);
        if (is_single_value) {
          if (insert.length === 0)
            insert.push(new Map());
          if (insert.length === 1)
            insert[0].set(last.value, db_modified);
          else
            throw new Error(`insert ${mapped_attribute.insert.name} is used by both multi and single values`);
        } else {
          for (let new_value_db_i of db_modified) {
            let m = new Map<string, any>();
            m.set(last.value, new_value_db_i);
            insert.push(m);
          }
        }
      }
      else { // update syntax
        let requests = requestsForAttribute(mapped_attribute);
        if (is_single_value) {
          requests.update_sets.push(this.maker.set(last.value, db_modified));
          if (!isNew) // TODO: check this if
            requests.update_checks.push(this.maker.op(this.maker.quote(last.value), ConstraintType.Equal, db_saved));
        }
        else {
          for (let [idx, value_db_i] of attribute.diffValue(db_modified, db_saved)) {
            if (idx !== -1) {
              let insert = inserts.get(mapped_attribute.insert);
              if (!insert)
                inserts.set(mapped_attribute.insert, insert = []);
              let m = new Map<string, any>();
              m.set(last.value, value_db_i);
              insert.push(m);
            }
            else {
              requests.delete.push(this.maker.op(this.maker.quote(last.value), ConstraintType.Equal, value_db_i));
            }
          }
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
    let inserted = new Set<SqlInsert>();

    let insert_attributes = async (c: SqlInsert, insert_values: Map<string, any>[], is_new: boolean) => {
      for (let insert_value of insert_values) {
        let output_columns: string[] = [];
        let columns: string[] = [];
        let sql_values: SqlBinding[] = [];
        for (let sql_insert_value of c.values) {
          switch (sql_insert_value.type) {
            case 'autoincrement':
              if (is_new)
                output_columns.push(sql_insert_value.name);
              break;
            case 'sql':
              columns.push(sql_insert_value.name);
              sql_values.push({ sql: sql_insert_value.value!, bind: [] });
              output_columns.push(sql_insert_value.name);
              break;
            case 'ref': {
              let ref_ins = sql_insert_value.insert!;
              let ref_col = sql_insert_value.value!;
              let deps_inserted = inserted.has(ref_ins);
              if (!deps_inserted && is_new)
                throw new Error(`referencing a previously created value that doesn't exists: ${ref_ins.name}.${ref_col}`);
              if (deps_inserted) {
                let tvalues = inserts.get(ref_ins);
                if (!tvalues || tvalues.length !== 1 || !tvalues[0].has(ref_col))
                  throw new Error(`referencing a previously created value that doesn't exists: ${ref_ins.name}.${ref_col}`);
                insert_value.set(sql_insert_value.name, tvalues[0].get(ref_col));
              }
              else {
                if (id_path_last.table !== ref_ins.table || id_path_last.value !== ref_col)
                  throw new Error(`support of complex ref in update is not yet supported, you must reference _id last path table & value`);
                insert_value.set(sql_insert_value.name, mapper.toDbKey(idAttr.toDbKey(id)));
              }
            } break;
            case 'value': insert_value.set(sql_insert_value.name, sql_insert_value.value); break;
            default:
              throw new Error(`unsupported sql-value type: ${sql_insert_value.type}`);
          }
        }
        columns.push(...insert_value.keys());
        sql_values.push(...this.maker.values([...insert_value.values()]));
        let sql_insert = this.maker.insert(c.table, columns, sql_values, output_columns);
        let result = await tr.tr.insert(sql_insert, output_columns); // sequential insertion
        output_columns.forEach((c, i) => insert_value.set(c, result[i]));
        if (c === idAttr.insert) {
          id = mapper.fromDbKey(idAttr.fromDbKey(insert_value.get(id_path_last.value)));
          tr.versions.set(object, { _id: id, _version: version });
        }
      }
      inserted.add(c);
    }
    if (isNew) {
      for (let c of mapper.inserts) {
        let values = inserts.get(c);
        if (!values)
          inserts.set(c, values = [new Map()]);
        if (values.length > 1)
          throw new Error(`insert ${c.name} can't be used for multi value`);
        await insert_attributes(c, values, true);
      }
    }
    else {
      tr.versions.set(object, { _id: id, _version: version });
    }
    for (let entry of requestsByPath.values()) {
      if (entry.update_sets.length > 0) {
        let sql_update = this.maker.update(entry.table, entry.update_sets, this.maker.and([entry.where, ...entry.update_checks]));
        let changes = await tr.tr.update(sql_update); // TODO: test for any advantage to parallelize this ?
        if (changes !== 1)
          throw new Error(`cannot update`);
      }
      for (let del of entry.delete) {
        let sql_delete = this.maker.delete(entry.table, this.maker.and([entry.where, del]));
        let changes = await tr.tr.delete(sql_delete); // TODO: where can probably be merged
        if (changes !== 1)
          throw new Error(`cannot update`);
      }
    }
    for (let[c, values] of inserts) {
      if (!inserted.has(c))
        await insert_attributes(c, values, false);
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
      set.addType({ type: ConstraintType.Is, value: aspect });
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
