import {DBConnector, DBConnectorTransaction, SqlBinding} from './index';

function trace<T extends SqlBinding | string>(sql: T) : T {
//  console.info(sql);
  return sql;
}

function select(db, sql_select: SqlBinding) : Promise<object[]> {
  return new Promise<any>((resolve, reject) => {
    trace(sql_select);
    db.all(sql_select.sql, sql_select.bind, function(err, rows: object[]) {
      err ? reject(err) : resolve(rows ? rows : []);
    });
  });
}

function update(db, sql_update: SqlBinding) : Promise<number> {
  return new Promise<any>((resolve, reject) => {
    trace(sql_update);
    db.run(sql_update.sql, sql_update.bind, function(this: {changes}, err) {
      err ? reject(err) : resolve(this.changes);
    });
  });
}

function insert(db, sql_insert: SqlBinding) : Promise<any> {
  return new Promise<any>((resolve, reject) => {
    trace(sql_insert);
    db.run(sql_insert.sql, sql_insert.bind, function(this: {lastID}, err) {
      err ? reject(err) : resolve(this.lastID);
    });
  });
}

function run(db, sql: SqlBinding) : Promise<any> {
  return new Promise<any>((resolve, reject) => {
    db.run(sql.sql, sql.bind, function(err) {
      err ? reject(err) : resolve();
    });
  });
}

export class SqliteDBConnector implements DBConnector {
  _transaction = 0;
  constructor(public db) {}

  static provider(sqlite3: any, filename: string, mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) {
    return {
      create() {
        return new Promise<SqliteDBConnector>((resolve, reject) => {
          let db = new sqlite3.Database(filename, mode, err => err ? reject(err) : resolve(new SqliteDBConnector(db)));
        });
      },
      destroy(db: SqliteDBConnector) {
        return new Promise((resolve, reject) => {
          db.db.close(err => err ? reject(err) : resolve(db));
        });
      }
    }
  }

  transaction(): Promise<DBConnectorTransaction> {
    if (this._transaction > 0) return Promise.reject(new Error(`connector is already in a transaction`));
    return new Promise<any>((resolve, reject) => {
      this.db.exec(trace("BEGIN TRANSACTION"), (err) => {
        err ? reject(err) : resolve(new SqliteDBConnectorTransaction(this));
      });
    });
  }

  unsafeRun(sql: SqlBinding) : Promise<void> {
    return run(this.db, sql);
  }

  select(sql_select: SqlBinding) : Promise<object[]> {
    if (this._transaction > 0) return Promise.reject(new Error(`connector is already in a transaction`));
    return select(this.db, sql_select);
  }

  update(sql_update: SqlBinding) : Promise<number> {
    if (this._transaction > 0) return Promise.reject(new Error(`connector is already in a transaction`));
    return update(this.db, sql_update);
  }

  insert(sql_insert: SqlBinding) : Promise<any> {
    if (this._transaction > 0) return Promise.reject(new Error(`connector is already in a transaction`));
    return insert(this.db, sql_insert);
  }
}

class SqliteDBConnectorTransaction implements DBConnectorTransaction {
  constructor(public connector: SqliteDBConnector) {}

  select(sql_select: SqlBinding) : Promise<object[]> {
    return select(this.connector.db, sql_select);
  }

  update(sql_update: SqlBinding) : Promise<number> {
    return update(this.connector.db, sql_update);
  }

  insert(sql_insert: SqlBinding) : Promise<any> {
    return insert(this.connector.db, sql_insert);
  }

  commit() : Promise<void> {
    return new Promise<any>((resolve, reject) => {
      this.connector.db.exec(trace("COMMIT"), (err) => {
        this.connector._transaction--;
        err ? reject(err) : resolve();
      });
    });
  }

  rollback() : Promise<void> {
    return new Promise<any>((resolve, reject) => {
      this.connector.db.exec(trace("ROLLBACK"), (err) => {
        this.connector._transaction--;
        err ? reject(err) : resolve();
      });
    });
  }
}