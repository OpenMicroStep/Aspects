import {DBConnector, DBConnectorTransaction, SqlBinding, SqlMaker} from './index';

function trace<T extends SqlBinding | string>(sql: T) : T {
//  console.info(sql);
  return sql;
}
class OracleSqlMaker extends SqlMaker {
  quote(value: string) {
    return `"${value.replace(/`/g, '""')}"`;
  }
  
  insert(table: string, sql_values: SqlBinding[], output_columns: string[]) : SqlBinding {
    let sql = `INSERT INTO ${this.quote(table)} (${sql_values.map(c => c.sql).join(',')}) VALUES (${sql_values.map(c => '?').join(',')})`;
    if (output_columns.length > 0)
      sql += ` RETURNING ${output_columns.map((c, i) => `${this.quote(c)} INTO :r${i}`).join(',')}`;
    return {
      sql: sql,
      bind: ([] as SqlBinding[]).concat(...sql_values.map(s => s.bind))
    };
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
  destroy(oracledb, db) {
    return db.close();
  },
  select(oracledb, db, sql_select: SqlBinding) : Promise<object[]> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_select);
      db.execute(sql_select.sql, sql_select.bind, (err, result) => err ? reject(err) : resolve(result.rows));
    });
  },
  update(oracledb, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_update);
      db.execute(sql_update.sql, sql_update.bind, (err, result) => err ? reject(err) : resolve(result.rowsAffected));
    });
  },
  insert(oracledb, db, sql_insert: SqlBinding, output_columns) : Promise<any[]> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_insert);
      let bind: object = {};
      sql_insert.bind.forEach((v, i) => bind[`i${i}`] = v);
      output_columns.forEach((v, i) => bind[`r${i}`] = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT });
      db.execute(sql_insert.sql, bind, (err, result) => {
        err ? reject(err) : resolve(output_columns.map((c, i) => result.outBinds[`r${i}`][0]))
      });
    });
  },
  run(oracledb, db, sql: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      db.execute(sql.sql, sql.bind, (err, result) => err ? reject(err) : resolve());
    });
  },
  beginTransaction(oracledb, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.execute(trace("START TRANSACTION"), (err) => err ? reject(err) : resolve()) });
  },
  commit(oracledb, db): Promise<void> {
    trace("commit()"); return db.commit();
  },
  rollback(oracledb, db): Promise<void> {
    trace("rollback()"); return db.rollback();
  },
  transform(sql) { return DBConnector.transformBindings(sql, idx => `:i${idx}`); },
});
