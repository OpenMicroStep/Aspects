import {DBConnector, DBConnectorTransaction, SqlBinding, SqlMaker} from './index';

function trace<T extends SqlBinding | string>(sql: T) : T {
//  console.info(sql);
  return sql;
}

class MSSQLMaker extends SqlMaker {
  quote(value: string) {
    return `[${value}]`;
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
      case 'string': type = TYPES.Text; break;
      case 'object': {
        if (bind instanceof Date) type = TYPES.DateTime;
        else if (bind instanceof Buffer) type = TYPES.Binary;
        break;
      }
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
    database: string,
    encrypt?: boolean,
  },
}, { connection: any, tedious: any }>({
  maker: new MSSQLMaker(),
  create(tedious, options) {
    return new Promise((resolve, reject) => {
      let db = { connection: new tedious.Connection(options), tedious: tedious };
      db.connection.once('connect', err => err ? reject(err) : resolve(db));
    });
  },
  destroy(db) {
    return new Promise<void>((resolve, reject) => {
      db.connection.close();
      resolve();
    });
  },
  select(db, sql_select: SqlBinding) : Promise<object[]> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_select);
      let rows = [] as object[];
      let req = request(db.tedious, sql_select, (err, rowCount) => err ? reject(err) : resolve(rows));
      req.on('row', row => rows.push(row));
      db.connection.execSql(request);
    });
  },
  update(db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_update);
      let req = request(db.tedious, sql_update, (err, rowCount) => err ? reject(err) : resolve(rowCount));
      db.connection.execSql(request);
    });
  },
  insert(db, sql_insert: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      trace(sql_insert);
      let row;
      let req = request(db.tedious, sql_insert, (err, rowCount) => err ? reject(err) : resolve(row));
      req.on('row', r => row = r);
      db.connection.execSql(request);
    });
  },
  run(db, sql: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      let req = request(db.tedious, sql, (err, rowCount) => err ? reject(err) : resolve());
      db.connection.execSql(request);
    });
  },
  beginTransaction(db): Promise<void> {
    return new Promise<any>((resolve, reject) => { trace("beginTransaction()"); db.connection.beginTransaction((err) => err ? reject(err) : resolve()) });
  },
  commit(db): Promise<void> {
    return new Promise<any>((resolve, reject) => { trace("commitTransaction()"); db.connection.commitTransaction((err) => err ? reject(err) : resolve()) });
  },
  rollback(db): Promise<void> {
    return new Promise<any>((resolve, reject) => { trace("rollbackTransaction()"); db.connection.rollbackTransaction((err) => err ? reject(err) : resolve()) });
  },
  transform(sql) { return DBConnector.transformBindings(sql, idx => `@${idx}`); },
});
