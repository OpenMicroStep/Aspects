import {DBConnector, DBConnectorTransaction, SqlBinding, SqlMaker} from './index';

function trace<T extends SqlBinding | string>(sql: T) : T {
//  console.info(sql);
  return sql;
}

export const PostgresDBConnectorFactory = DBConnector.createSimple<any, { 
  host: string, port?: number, ssl?: boolean,
  user: string, password?: string, database: string,
  application_name?: string,
}, any>({
  create(pg, options) {
    return new Promise((resolve, reject) => {
      let db = new pg.Client(options);
      db.connect(err => err ? reject(err) : resolve(db));
    });
  },
  destroy(db) {
    return new Promise<void>((resolve, reject) => {
      db.end();
      resolve();
    });
  },
  select(db, sql_select: SqlBinding) : Promise<object[]> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_select);
      db.query(sql_select.sql, sql_select.bind, function (err, result) {
        err ? reject(err) : resolve(result.rows);
      });
    });
  },
  update(db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_update);
      db.query(sql_update.sql, sql_update.bind, function (err, result) {
        err ? reject(err) : resolve(result.rowCount);
      });
    });
  },
  insert(db, sql_insert: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_insert);
      db.query(sql_insert.sql, sql_insert.bind, function (err, result) {
        err ? reject(err) : resolve(result.rows[0].id); // TODO: change connector API to handle postgres
      });
    });
  },
  run(db, sql: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      db.query(sql.sql, sql.bind, function (err, rows) {
        err ? reject(err) : resolve();
      });
    });
  },
  beginTransaction(db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.query(trace("BEGIN"), (err) => err ? reject(err) : resolve()) });
  },
  commit(db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.query(trace("COMMIT"), (err) => err ? reject(err) : resolve()) });
  },
  rollback(db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.query(trace("ROLLBACK"), (err) => err ? reject(err) : resolve()) });
  },
  transform(sql) { return DBConnector.transformBindings(sql, idx => `$${idx}`); },
});
