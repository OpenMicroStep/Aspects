import {DBConnector, SqlBinding, SqlMaker} from './index';

class MySqlMaker extends SqlMaker {
  admin_create_table_column_type(type: SqlMaker.ColumnType) {
    switch (type.is) {
      case 'integer':
        switch (type.bytes) {
          case 2: return 'SMALLINT';
          case 4: return 'INTEGER';
          case 8: return 'BIGINT';
        }
        return 'INTEGER';
      case 'autoincrement': return type.bytes === 4 ? 'INTEGER AUTO_INCREMENT' : 'BIGINT AUTO_INCREMENT';
      case 'string': return `VARCHAR(${type.max_bytes})`;
      case 'text': return `TEXT`;
      case 'decimal': return `NUMERIC(${type.precision}, ${type.scale})`;
      case 'binary': return 'BLOB';
      case 'double': return 'DOUBLE';
      case 'float': return 'FLOAT';
      case 'boolean': return 'BOOLEAN';
    }
  }

  select_table_list() : SqlBinding {
    return { sql: `SELECT TABLE_SCHEMA || '.' || TABLE_NAME table_name FROM INFORMATION_SCHEMA.TABLES`, bind: [] };
  }

  select_index_list() : SqlBinding {
    return { sql: `SELECT TABLE_SCHEMA || '.' || INDEX_NAME index_name, TABLE_SCHEMA || '.' || TABLE_NAME table_name FROM INFORMATION_SCHEMA.STATISTICS`, bind: [] };
  }
}
MySqlMaker.prototype.select_with_recursive = undefined;

export const MySQLDBConnectorFactory = DBConnector.createSimple<any, { host: string, port: number, user?: string, password?: string, database: string }, any>({
  maker: new MySqlMaker(),
  create(mysql2, options) {
    return new Promise((resolve, reject) => {
      let db = mysql2.createConnection(options);
      db.connect(err => err ? reject(err) : resolve(db));
    });
  },
  destroy(mysql2, db) {
    return new Promise<void>((resolve, reject) => {
      db.close(err => err ? reject(err) : resolve());
    });
  },
  select(mysql2, db, sql_select: SqlBinding) : Promise<object[]> {
    return new Promise<any>((resolve, reject) => {
      db.execute(sql_select.sql, sql_select.bind, function (err, results: object[], fields) {
        err ? reject(err) : resolve(results ? results : []);
      });
    });
  },
  update(mysql2, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      db.execute(sql_update.sql, sql_update.bind, function (err, results, fields) {
        err ? reject(err) : resolve(results.affectedRows);
      });
    });
  },
  delete(mysql2, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      db.execute(sql_update.sql, sql_update.bind, function (err, results, fields) {
        err ? reject(err) : resolve(results.affectedRows);
      });
    });
  },
  insert(mysql2, db, sql_insert: SqlBinding, output_columns) : Promise<any[]> {
    if (output_columns.length > 1)
      return Promise.reject(new Error(`MySQL doesn't support multiple output columns`));
    return new Promise<any>((resolve, reject) => {
      db.execute(sql_insert.sql, sql_insert.bind, function (err, results, fields) {
        err ? reject(err) : resolve(output_columns.length > 0 ? [results.insertId] : []);
      });
    });
  },
  run(mysql2, db, sql: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      if (sql.bind.length > 0) {
        db.execute(sql.sql, sql.bind, function (err, rows) {
          err ? reject(err) : resolve();
        });
      }
      else {
        db.query(sql.sql, function (err, rows) {
          err ? reject(err) : resolve();
        });
      }
    });
  },
  beginTransaction(mysql2, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.beginTransaction((err) => err ? reject(err) : resolve()) });
  },
  commit(mysql2, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.commit((err) => err ? reject(err) : resolve()) });
  },
  rollback(mysql2, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.rollback((err) => err ? reject(err) : resolve()) });
  },
  transform: DBConnector.transformPass,
});
