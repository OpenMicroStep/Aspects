import {DataSourceInternal} from '@openmicrostep/aspects';
import {Pool} from './index';
import ConstraintType = DataSourceInternal.ConstraintType;

export type SqlBinding = { sql: string, bind: any[] };

function push_bindings(bind: any[], bindings: SqlBinding[]) {
  for (let b of bindings)
    bind.push(...b.bind);
}
function join_sqls(bind: SqlBinding[], separator: string) : string {
  return bind.map(b => b.sql).join(separator);
}

export interface DBConnector {
  maker: SqlMaker;
  transaction(): Promise<DBConnectorTransaction>;
  unsafeRun(sql: SqlBinding) : Promise<void>;
  select(sql_select: SqlBinding) : Promise<object[]>;
  update(sql_update: SqlBinding) : Promise<number>;
  insert(sql_insert: SqlBinding) : Promise<any>;
}
export interface DBConnectorTransaction {
  select(sql_select: SqlBinding) : Promise<object[]>;
  update(sql_update: SqlBinding) : Promise<number>;
  insert(sql_insert: SqlBinding) : Promise<any>;
  commit() : Promise<void>;
  rollback() : Promise<void>;
}

export namespace DBConnector {
  export interface Definition<LIB, OPTIONS, DB> {
    create(lib: LIB, options: OPTIONS): Promise<DB>,
    destroy(db: DB): Promise<void>,
    select(db: DB, sql_select: SqlBinding) : Promise<object[]>,
    update(db: DB, sql_update: SqlBinding) : Promise<number>,
    insert(db: DB, sql_insert: SqlBinding) : Promise<any>,
    run(db: DB, sql: SqlBinding) : Promise<any>,
    beginTransaction(db: DB): Promise<void>,
    commit(db: DB): Promise<void>,
    rollback(db: DB): Promise<void>,
    transform(sql: SqlBinding) : SqlBinding,
  }
  export function transformPass(sql: SqlBinding) { return sql; }
  export function transformBindings(sql: SqlBinding, replacer: (idx: number) => string) {
    let idx = 0;
    return { sql: sql.sql.replace(/__$__/g, () => replacer(idx++)), bind: sql.bind };
  }
  export function createSimple<LIB, OPTIONS, DB>(definition: Definition<LIB, OPTIONS, DB>) {
    class GenericConnectorTransaction implements DBConnectorTransaction {
      db: DB | undefined;
      pool: Pool<DB> | undefined;
      constructor(db: DB, pool: Pool<DB>) {
        this.db = db;
        this.pool = pool;
      }

      private _check() {
        if (!this.db)
          return Promise.reject(`cannot use transaction after commit or rollback`);
        return undefined;
      }
      select(sql_select: SqlBinding) : Promise<object[]> { return this._check() || definition.select(this.db!, definition.transform(sql_select)); }
      update(sql_update: SqlBinding) : Promise<number>   { return this._check() || definition.update(this.db!, definition.transform(sql_update)); }
      insert(sql_insert: SqlBinding) : Promise<any>      { return this._check() || definition.insert(this.db!, definition.transform(sql_insert)); }
      commit() : Promise<void>   { return this._check() || this._endTransaction(definition.commit(this.db!));   }
      rollback() : Promise<void> { return this._check() || this._endTransaction(definition.rollback(this.db!)); }

      private _endTransaction(promise: Promise<void>): Promise<void> {
        let ret = promise.then(() => { this.pool!.release(this.db!); this.db = undefined; this.pool = undefined; });
        ret.catch(err => { this.pool!.releaseAndDestroy(this.db!); this.db = undefined; this.pool = undefined; });
        return ret;
      }
    }
    class GenericConnector implements DBConnector {
      _transaction = 0;
      constructor(private pool: Pool<DB>) {}
      maker = new SqlMaker();

      async transaction(): Promise<DBConnectorTransaction> {
        let db = await this.pool.acquire();
        await definition.beginTransaction(db);
        return new GenericConnectorTransaction(db, this.pool);
      }
      unsafeRun(sql: SqlBinding) : Promise<void>         { return this.pool.scoped(db => definition.run(db, definition.transform(sql)));           }
      select(sql_select: SqlBinding) : Promise<object[]> { return this.pool.scoped(db => definition.select(db, definition.transform(sql_select))); }
      update(sql_update: SqlBinding) : Promise<number>   { return this.pool.scoped(db => definition.update(db, definition.transform(sql_update))); }
      insert(sql_insert: SqlBinding) : Promise<any>      { return this.pool.scoped(db => definition.insert(db, definition.transform(sql_insert))); }
    }

    return function createPool(lib: LIB, options: OPTIONS, config?: Partial<Pool.Config>) : DBConnector {
      return new GenericConnector(new Pool<DB>({
        create() { return definition.create(lib, options); },
        destroy(db: DB) { return definition.destroy(db); }
      }, config))
    }
  }
}

export class SqlMaker {
  select(sql_columns: string[], sql_from: SqlBinding[], sql_joins: SqlBinding[], sql_where: SqlBinding, limit?: [number, number]) : SqlBinding {
    let bind: SqlBinding[] = [];
    let sql = `SELECT ${sql_columns.join(',')}\nFROM ${join_sqls(sql_from, ',')}`;
    push_bindings(bind, sql_from);
    if (sql_joins.length) {
      sql += `\n${join_sqls(sql_joins, '\n')}`;
      push_bindings(bind, sql_from);
    }
    if (sql_where) {
      sql += `\nWHERE ${sql_where.sql}`;
      bind.push(...sql_where.bind);
    }
    if (limit && limit.length)
      sql += `\nLIMIT ${limit[0]}, ${limit[1]}`;
    return { sql: sql, bind: bind };
  }

  update(table: string, sql_set: SqlBinding[], sql_where: SqlBinding) : SqlBinding {
    return {
      sql: `UPDATE ${this.quote(table)} SET ${sql_set.map(s => s.sql).join(',')} WHERE ${sql_where.sql}`,
      bind: [...([] as SqlBinding[]).concat(...sql_set.map(s => s.bind)), ...sql_where.bind]
    }
  }

  values(columns: string[], values: any[]) : SqlBinding[] {
    return columns.map((c, i) => ({ sql: this.quote(c), bind: [values[i]] }));
  }

  insert(table: string, sql_values: SqlBinding[]) : SqlBinding {
    return {
      sql: `INSERT INTO ${this.quote(table)} (${sql_values.map(c => c.sql).join(',')}) VALUES (${sql_values.map(c => '?').join(',')})`,
      bind: ([] as SqlBinding[]).concat(...sql_values.map(s => s.bind))
    };
  }

  quote(value: string) {
    return `\`${value}\``;
  }

  from(table: string, alias?: string) : SqlBinding {
    return { sql: alias ? `${this.quote(table)} ${this.quote(alias)}` : this.quote(table), bind: [] };
  }

  from_sub(sql_select: SqlBinding, alias: string) : SqlBinding {
    let r = this.sub(sql_select);
    r.sql += ` ${this.quote(alias)}`;
    return r;
  }

  sub(sql_select: SqlBinding) : SqlBinding {
    return {
      sql: `(${sql_select.sql})`,
      bind: sql_select.bind
    };
  }

  column(table: string, name: string, alias?: string) {
    let r = this.quote(table) + "." + this.quote(name);
    if (alias)
      r += ` ${this.quote(alias)}`;
    return r;
  }

  set(sql_column: string, value: any) : SqlBinding {
    return { sql: `${sql_column} = ?`, bind: [value] };
  }

  _conditions(conditions: SqlBinding[], sql_op: string) : SqlBinding {
    if (conditions.length === 1)
      return conditions[0];
    let sql = "(";
    let bind: SqlBinding[] = [];
    let first = true;
    for (let condition of conditions) {
      first ? first = false : sql += sql_op;
      sql += condition.sql;
      bind.push(...condition.bind);
    }
    sql += ")";
    return { sql: sql, bind: bind };
  }

  and(conditions: SqlBinding[]) : SqlBinding {
    return this._conditions(conditions, " AND ");
  }

  or(conditions: SqlBinding[]) {
    return this._conditions(conditions, " OR ");
  }

  op(sql_column: string, operator: DataSourceInternal.ConstraintOnValueTypes, value): SqlBinding {
    switch (operator) {
      case ConstraintType.Equal: {
        if (value === null || value === undefined)
          return { sql: `${sql_column} IS NULL`, bind: [] };
        return { sql: `${sql_column} = ?`       , bind: [value] };
      }
      case ConstraintType.NotEqual:           return { sql: `${sql_column} <> ?`      , bind: [value] };
      case ConstraintType.GreaterThan:        return { sql: `${sql_column} > ?`       , bind: [value] };
      case ConstraintType.GreaterThanOrEqual: return { sql: `${sql_column} >= ?`      , bind: [value] };
      case ConstraintType.LessThan:           return { sql: `${sql_column} < ?`       , bind: [value] };
      case ConstraintType.LessThanOrEqual:    return { sql: `${sql_column} <= ?`      , bind: [value] };
      case ConstraintType.Text:               return { sql: `${sql_column} LIKE ?`    , bind: [value] };
      case ConstraintType.In:                 return { sql: `${sql_column} IN (${value.map(v => '?').join(',')})`    , bind: value };
      case ConstraintType.NotIn:              return { sql: `${sql_column} NOT IN (${value.map(v => '?').join(',')})`, bind: value };
      case ConstraintType.Exists:             return { sql: `${sql_column} ${value ? 'NOT NULL' : 'IS NULL'}`, bind: [] };
    }
    throw new Error(`unsupported op operator ${operator}`);
  }

  op_bind(sql_column: SqlBinding, operator: DataSourceInternal.ConstraintBetweenColumnsTypes, value): SqlBinding {
    let b = this.op(sql_column.sql, operator, value);
    b.bind.unshift(...sql_column.bind);
    return b;
  }

  compare(sql_columnLeft: string, operator: DataSourceInternal.ConstraintBetweenColumnsTypes, sql_columnRight: string): SqlBinding {
    switch (operator) {
      case ConstraintType.Equal:              return { sql: `${sql_columnLeft} = ${sql_columnRight}` , bind: [] };
      case ConstraintType.NotEqual:           return { sql: `${sql_columnLeft} <> ${sql_columnRight}`, bind: [] };
      case ConstraintType.GreaterThan:        return { sql: `${sql_columnLeft} > ${sql_columnRight}` , bind: [] };
      case ConstraintType.GreaterThanOrEqual: return { sql: `${sql_columnLeft} >= ${sql_columnRight}`, bind: [] };
      case ConstraintType.LessThan:           return { sql: `${sql_columnLeft} < ${sql_columnRight}` , bind: [] };
      case ConstraintType.LessThanOrEqual:    return { sql: `${sql_columnLeft} <= ${sql_columnRight}`, bind: [] };
    }
    throw new Error(`unsupported compare operator ${operator}`);
  }

  compare_bind(sql_columnLeft: SqlBinding, operator: DataSourceInternal.ConstraintBetweenSetTypes, sql_columnRight: SqlBinding): SqlBinding {
    let b: SqlBinding;
    switch (operator) {
      case ConstraintType.In:
        b = { sql: `${sql_columnLeft} IN ${sql_columnRight}` , bind: [] };
        break;
      case ConstraintType.NotIn:
        b = { sql: `${sql_columnLeft} NOT IN ${sql_columnRight}` , bind: [] };
        break;
      default: b = this.compare(sql_columnLeft.sql, operator, sql_columnRight.sql);
    }
    b.bind.unshift(...sql_columnRight.bind);
    b.bind.unshift(...sql_columnLeft.bind);
    return b;
  }
}
