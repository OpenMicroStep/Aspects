import {DBConnector, DBConnectorTransaction, SqlBinding, SqlMaker} from './index';

function trace<T extends SqlBinding | string>(sql: T) : T {
//  console.info(sql);
  return sql;
}

class MSSQLMaker extends SqlMaker {
  quote(value: string) {
    return `[${value}]`;
  }

  insert(table: string, sql_values: SqlBinding[], output_columns: string[]) : SqlBinding {
    let sql = `INSERT INTO ${this.quote(table)} (${sql_values.map(c => c.sql).join(',')})`;
    if (output_columns.length > 0)
      sql += ` OUTPUT ${output_columns.map((c, i) => `Inserted.${this.quote(c)}`).join(',')}`;
    sql += ` VALUES (${sql_values.map(c => '?').join(',')})`;
    return {
      sql: sql,
      bind: ([] as SqlBinding[]).concat(...sql_values.map(s => s.bind))
    };
  }
}
function request(tedious, sql: SqlBinding, cb: (err, rowCount) => void) {
  let TYPES = tedious.TYPES;
  let request = new tedious.Request(sql.sql, cb);
  let rows: object[] = [];
  for (let i = 0; i < sql.bind.length; i++) {
    let bind = sql.bind[i];
    let type;
    switch(typeof bind) {
      case 'number': {
        if (Number.isInteger(bind)) {
          type = TYPES.BigInt;
          bind = `${bind}`;
        }
        else {
          type = TYPES.Real;
        }
        break;
      }
      case 'boolean': type = TYPES.Bit; break;
      case 'string': type = TYPES.VarChar; break;
      case 'object': {
        if (bind instanceof Date) type = TYPES.DateTime;
        else if (bind instanceof Buffer) type = TYPES.VarBinary;
        else if (bind === null) type = TYPES.Null;
        break;
      }
      case 'undefined': type = TYPES.Null; bind = null; break;
    }
    if (!type)
      throw new Error(`unsupported binding type: ${typeof bind}`);
    request.addParameter(`${i}`, type, bind);
  }
  return request;
}

export const MSSQLDBConnectorFactory = DBConnector.createSimple<any, { 
  server: string, domain?: string,
  userName: string, password?: string,
  options?: { 
    port?: number, 
    instanceName?: string, 
    database?: string,
    encrypt?: boolean,
    useColumnNames?: false
  },
}, any>({
  maker: new MSSQLMaker(),
  create(tedious, options) {
    return new Promise((resolve, reject) => {
      let db = new tedious.Connection(options);
      db.once('connect', err => err ? reject(err) : resolve(db));
    });
  },
  destroy(tedious, db) {
    return new Promise<void>((resolve, reject) => {
      db.close();
      resolve();
    });
  },
  select(tedious, db, sql_select: SqlBinding) : Promise<object[]> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_select);
      let rows = [] as object[];
      let req = request(tedious, sql_select, (err, rowCount) => err ? reject(err) : resolve(rows));
      req.on('row', row => {
        let r = {};
        row.map(c => r[c.metadata.colName] = c.value);
        rows.push(r)
      });
      db.execSql(req);
    });
  },
  update(tedious, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_update);
      let req = request(tedious, sql_update, (err, rowCount) => err ? reject(err) : resolve(rowCount));
      db.execSql(req);
    });
  },
  delete(tedious, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_update);
      let req = request(tedious, sql_update, (err, rowCount) => err ? reject(err) : resolve(rowCount));
      db.execSql(req);
    });
  },
  insert(tedious, db, sql_insert: SqlBinding, output_columns) : Promise<any[]> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_insert);
      let ret;
      let req = request(tedious, sql_insert, (err, rowCount) => {
        if (err) reject(err);
        else if (!ret && output_columns.length > 0) reject(new Error(`output columns not complete`));
        else resolve(ret || [])
      });
      req.on('row', r => ret = output_columns.map((c, i) => r[i].value));
      db.execSql(req);
    });
  },
  run(tedious, db, sql: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      let req = request(tedious, sql, (err, rowCount) => err ? reject(err) : resolve());
      db.execSql(req);
    });
  },
  beginTransaction(tedious, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { trace("beginTransaction()"); db.beginTransaction((err) => err ? reject(err) : resolve()) });
  },
  commit(tedious, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { trace("commitTransaction()"); db.commitTransaction((err) => err ? reject(err) : resolve()) });
  },
  rollback(tedious, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { trace("rollbackTransaction()"); db.rollbackTransaction((err) => err ? reject(err) : resolve()) });
  },
  transform(sql) { return DBConnector.transformBindings(sql, idx => `@${idx}`); },
});
