import {DataSourceInternal} from '@openmicrostep/aspects';
import {Pool, SqlMaker, SqlBinding} from './index';
import ConstraintType = DataSourceInternal.ConstraintType;

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
    maker: SqlMaker,
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
      maker = definition.maker;

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
