import {DBConnector, DBConnectorTransaction, SqlBinding, SqlMaker} from './index';

function trace<T extends SqlBinding | string>(sql: T) : T {
//  console.info(sql);
  return sql;
}
class OracleSqlMaker extends SqlMaker {
  quote(value: string) {
    return `"${value.replace(/`/g, '""')}"`;
  }
}
export const OracleDBConnectorFactory = DBConnector.createSimple<any, { 
  connectString: string,
  user: string, password?: string
}, any>({
  maker: new OracleSqlMaker(),
  create(oracledb, options) {
    return oracledb.getConnection(options);
  },
  destroy(db) {
    return db.close();
  },
  select(db, sql_select: SqlBinding) : Promise<object[]> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_select);
      db.execute(sql_select.sql, sql_select.bind, (err, result) => err ? reject(err) : resolve(result.rows));
    });
  },
  update(db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_update);
      db.execute(sql_update.sql, sql_update.bind, (err, result) => err ? reject(err) : resolve(result.rowsAffected));
    });
  },
  insert(db, sql_insert: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_insert);
      db.execute(sql_insert.sql, sql_insert.bind, (err, result) => err ? reject(err) : resolve());
    });
  },
  run(db, sql: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      db.execute(sql.sql, sql.bind, (err, result) => err ? reject(err) : resolve());
    });
  },
  beginTransaction(db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.execute(trace("START TRANSACTION"), (err) => err ? reject(err) : resolve()) });
  },
  commit(db): Promise<void> {
    trace("commit()"); return db.commit();
  },
  rollback(db): Promise<void> {
    trace("rollback()"); return db.rollback();
  },
  transform(sql) { return DBConnector.transformBindings(sql, idx => `:${idx}`); },
});
