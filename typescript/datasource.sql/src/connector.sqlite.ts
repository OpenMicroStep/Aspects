import {DBConnector, DBConnectorTransaction, SqlBinding, SqlMaker} from './index';

class SqliteMaker extends SqlMaker {
  union(sql_select: SqlBinding[]) : SqlBinding {
    if (sql_select.length === 1) return sql_select[0];
    let sql = `SELECT * FROM (${this.join_sqls(sql_select, ' UNION ')})`;
    return { sql: sql, bind: this.join_bindings(sql_select) };
  }

  intersection(sql_select: SqlBinding[]) : SqlBinding {
    if (sql_select.length === 1) return sql_select[0];
    let sql = `SELECT * FROM (${this.join_sqls(sql_select, ' INTERSECT ')})`;
    return { sql: sql, bind: this.join_bindings(sql_select) };
  }
}
export const SqliteDBConnectorFactory = DBConnector.createSimple<{
  OPEN_READWRITE: number,
  OPEN_CREATE: number,
  Database: { new(filename: string, mode: number, cb: (err) => void) }
}, { 
  filename: string, 
  mode?: any 
}, {
  exec(sql: string, cb: (err) => void): void
  all(sql: string, bind: ReadonlyArray<any>, cb: (err, rows) => void): void
  run(sql: string, bind: ReadonlyArray<any>, cb: (this: { changes?: number, lastID?: number }, err) => void): void
  close(cb: (err) => void): void
}
>({
  maker: new SqliteMaker(),
  create(sqlite3, { filename, mode }) {
    if (mode === undefined)
      mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
    return new Promise((resolve, reject) => {
      let db = new sqlite3.Database(filename, mode, err => err ? reject(err) : resolve(db));
    });
  },
  destroy(sqlite3, db) {
    return new Promise<void>((resolve, reject) => {
      db.close(err => err ? reject(err) : resolve());
    });
  },
  select(sqlite3, db, sql_select: SqlBinding) : Promise<object[]> {
    return new Promise<any>((resolve, reject) => {
      db.all(sql_select.sql, sql_select.bind, function(err, rows: object[]) {
        err ? reject(err) : resolve(rows ? rows : []);
      });
    });
  },
  update(sqlite3, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      db.run(sql_update.sql, sql_update.bind, function(this: {changes}, err) {
        err ? reject(err) : resolve(this.changes);
      });
    });
  },
  delete(sqlite3, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      db.run(sql_update.sql, sql_update.bind, function(this: {changes}, err) {
        err ? reject(err) : resolve(this.changes);
      });
    });
  },
  insert(sqlite3, db, sql_insert: SqlBinding, output_columns) : Promise<any[]> {
    if (output_columns.length > 1)
      return Promise.reject(new Error(`Sqlite doesn't support multiple output columns`));
    return new Promise<any>((resolve, reject) => {
      db.run(sql_insert.sql, sql_insert.bind, function(this, err) {
        err ? reject(err) : resolve(output_columns.length > 0 ? [this.lastID] : []);
      });
    });
  },
  run(sqlite3, db, sql: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      db.run(sql.sql, sql.bind, function(err) {
        err ? reject(err) : resolve();
      });
    });
  },
  beginTransaction(sqlite3, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.exec("BEGIN TRANSACTION", (err) => err ? reject(err) : resolve()) });
  },
  commit(sqlite3, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.exec("COMMIT", (err) => err ? reject(err) : resolve()) });
  },
  rollback(sqlite3, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.exec("ROLLBACK", (err) => err ? reject(err) : resolve()) });
  },
  transform: DBConnector.transformPass,
});
