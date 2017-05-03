import {DBConnector, DBConnectorTransaction, SqlBinding, SqlMaker} from './index';

function trace<T extends SqlBinding | string>(sql: T) : T {
//  console.info(sql);
  return sql;
}

export const SqliteDBConnectorFactory = DBConnector.createSimple<any, { filename: string, mode?: any }, any>({
  create(sqlite3, { filename, mode }) {
    if (mode === undefined)
      mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
    return new Promise((resolve, reject) => {
      let db = new sqlite3.Database(filename, mode, err => trace("connected") && err ? reject(err) : resolve(db));
    });
  },
  destroy(db) {
    return new Promise<void>((resolve, reject) => {
      db.close(err => err ? reject(err) : resolve());
    });
  },
  select(db, sql_select: SqlBinding) : Promise<object[]> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_select);
      db.all(sql_select.sql, sql_select.bind, function(err, rows: object[]) {
        err ? reject(err) : resolve(rows ? rows : []);
      });
    });
  },
  update(db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_update);
      db.run(sql_update.sql, sql_update.bind, function(this: {changes}, err) {
        err ? reject(err) : resolve(this.changes);
      });
    });
  },
  insert(db, sql_insert: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_insert);
      db.run(sql_insert.sql, sql_insert.bind, function(this: {lastID}, err) {
        err ? reject(err) : resolve(this.lastID);
      });
    });
  },
  run(db, sql: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      db.run(sql.sql, sql.bind, function(err) {
        err ? reject(err) : resolve();
      });
    });
  },
  beginTransaction(db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.exec(trace("BEGIN TRANSACTION"), (err) => err ? reject(err) : resolve()) });
  },
  commit(db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.exec(trace("COMMIT"), (err) => err ? reject(err) : resolve()) });
  },
  rollback(db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.exec(trace("ROLLBACK"), (err) => err ? reject(err) : resolve()) });
  },
  transform: DBConnector.transformPass,
});
