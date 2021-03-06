import {DataSourceInternal, Pool} from '@openmicrostep/aspects';
import { SqlMaker, SqlBinding} from './index';
import ConstraintType = DataSourceInternal.ConstraintType;

export interface DBConnector extends DBConnector.Init {
  transaction(): Promise<DBConnector.Transaction>;
  close(): void;
}
export namespace DBConnector {
  export interface CRUD {
    select(sql_select: SqlBinding) : Promise<object[]>;
    insert(sql_insert: SqlBinding, output_columns: string[]) : Promise<any[]>;
    update(sql_update: SqlBinding) : Promise<number>;
    delete(sql_update: SqlBinding) : Promise<number>;
  }
  export interface Init extends CRUD {
    maker: SqlMaker;
    unsafeRun(sql: SqlBinding) : Promise<void>;
    admin(sql: SqlBinding[]) : Promise<void>;
  }
  export interface Transaction extends CRUD {
    commit() : Promise<void>;
    rollback() : Promise<void>;
  }

  export interface Definition<LIB, OPTIONS, DB> {
    maker: SqlMaker,
    create(lib: LIB, options: OPTIONS): Promise<DB>,
    destroy(lib: LIB, db: DB): Promise<void>,
    select(lib: LIB, db: DB, sql_select: SqlBinding) : Promise<object[]>,
    insert(lib: LIB, db: DB, sql_insert: SqlBinding, output_columns: string[]) : Promise<any[]>,
    update(lib: LIB, db: DB, sql_update: SqlBinding) : Promise<number>,
    delete(lib: LIB, db: DB, sql_update: SqlBinding) : Promise<number>,
    run(lib: LIB, db: DB, sql: SqlBinding) : Promise<any>,
    beginTransaction(lib: LIB, db: DB): Promise<void>,
    commit(lib: LIB, db: DB): Promise<void>,
    rollback(lib: LIB, db: DB): Promise<void>,
    transform(sql: SqlBinding) : SqlBinding,
  }
  export function transformPass(sql: SqlBinding) { return sql; }
  export function transformBindings(sql: SqlBinding, replacer: (idx: number) => string) {
    let idx = 0;
    return { sql: sql.sql.replace(/\?/g, () => replacer(idx++)), bind: sql.bind };
  }
  export function createSimple<LIB, OPTIONS, DB>(definition: Definition<LIB, OPTIONS, DB>) {
    class GenericConnectorTransaction implements Transaction {
      lib: LIB;
      db: DB | undefined;
      pool: Pool<DB> | undefined;
      constructor(lib: LIB, db: DB, pool: Pool<DB>, private _t: (sql: SqlBinding) => SqlBinding) {
        this.lib = lib;
        this.db = db;
        this.pool = pool;
      }

      private _check() {
        if (!this.db)
          return Promise.reject(`cannot use transaction after commit or rollback`);
        return undefined;
      }
      select(sql_select: SqlBinding) : Promise<object[]> { return this._check() || definition.select(this.lib, this.db!, definition.transform(this._t(sql_select))); }
      insert(sql_insert: SqlBinding, out: string[])      { return this._check() || definition.insert(this.lib, this.db!, definition.transform(this._t(sql_insert)), out); }
      update(sql_update: SqlBinding) : Promise<number>   { return this._check() || definition.update(this.lib, this.db!, definition.transform(this._t(sql_update))); }
      delete(sql_delete: SqlBinding) : Promise<number>   { return this._check() || definition.delete(this.lib, this.db!, definition.transform(this._t(sql_delete))); }
      commit() : Promise<void>   { return this._check() || this._t({ sql: "COMMIT"  , bind: []}) && this._endTransaction(definition.commit(this.lib, this.db!));   }
      rollback() : Promise<void> { return this._check() || this._t({ sql: "ROLLBACK", bind: []}) && this._endTransaction(definition.rollback(this.lib, this.db!)); }

      private _endTransaction(promise: Promise<void>): Promise<void> {
        let ret = promise.then(() => { this.pool!.release(this.db!); this.db = undefined; this.pool = undefined; });
        ret.catch(err => { this.pool!.releaseAndDestroy(this.db!); this.db = undefined; this.pool = undefined; });
        return ret;
      }
    }
    class GenericConnector implements DBConnector {
      _transaction = 0;
      constructor(private lib: LIB, private pool: Pool<DB>, private _t: (sql: SqlBinding) => SqlBinding) {}
      maker = definition.maker;

      async transaction(): Promise<Transaction> {
        let db = await this.pool.acquire();
        this._t({ sql: "BEGIN TRANSACTION", bind: [] });
        await definition.beginTransaction(this.lib, db);
        return new GenericConnectorTransaction(this.lib, db, this.pool, this._t);
      }
      async scoped<P>(task: (db: DB) => Promise<P>) : Promise<P> {
        return this.pool.scoped(task);
      }
      admin(sql_admins: SqlBinding[]) : Promise<void>    { return this.scoped(async db => {
        for (let sql of sql_admins) {
          await definition.run(this.lib, db, definition.transform(this._t(sql)))
        }
      }) }
      unsafeRun(sql: SqlBinding) : Promise<void>         { return this.scoped(db => definition.run   (this.lib, db, definition.transform(this._t(sql))));           }
      select(sql_select: SqlBinding) : Promise<object[]> { return this.scoped(db => definition.select(this.lib, db, definition.transform(this._t(sql_select)))); }
      insert(sql_insert: SqlBinding, out: string[])      { return this.scoped(db => definition.insert(this.lib, db, definition.transform(this._t(sql_insert)), out)); }
      update(sql_update: SqlBinding) : Promise<number>   { return this.scoped(db => definition.update(this.lib, db, definition.transform(this._t(sql_update)))); }
      delete(sql_delete: SqlBinding) : Promise<number>   { return this.scoped(db => definition.delete(this.lib, db, definition.transform(this._t(sql_delete)))); }

      close() {
        this.pool.close();
      }
    }

    class InitConnector implements Init {
      constructor(private lib: LIB, private db: DB, private _t: (sql: SqlBinding) => SqlBinding) {}
      maker = definition.maker;

      async admin(sql_admins: SqlBinding[]) : Promise<void> {
        for (let sql of sql_admins) {
          await definition.run(this.lib, this.db, definition.transform(this._t(sql)))
        }
      }
      unsafeRun(sql: SqlBinding) : Promise<void>         { return definition.run(this.lib, this.db, definition.transform(this._t(sql)));           }
      select(sql_select: SqlBinding) : Promise<object[]> { return definition.select(this.lib, this.db, definition.transform(this._t(sql_select))); }
      insert(sql_insert: SqlBinding, out: string[])      { return definition.insert(this.lib, this.db, definition.transform(this._t(sql_insert)), out); }
      update(sql_update: SqlBinding) : Promise<number>   { return definition.update(this.lib, this.db, definition.transform(this._t(sql_update))); }
      delete(sql_delete: SqlBinding) : Promise<number>   { return definition.delete(this.lib, this.db, definition.transform(this._t(sql_delete))); }
    }

    return function createPool(lib: LIB, options: OPTIONS & { trace?: (sql: SqlBinding)=> void, init?: (connector: Init) => Promise<void> }, config?: Partial<Pool.Config>) : DBConnector {
      function trace(sql: SqlBinding) {
        if (options.trace)
          options.trace(sql);
        return sql;
      }
      return new GenericConnector(lib, new Pool<DB>({
        async create() {
          let db = await definition.create(lib, options);
          if (options.init) {
            try {
              await options.init(new InitConnector(lib, db, trace));
            }
            catch (e) {
              await definition.destroy(lib, db);
              throw e;
            }
          }
          return db;
        },
        destroy(db: DB) {
          return definition.destroy(lib, db);
        },
      }, config), trace);
    }
  }
}
