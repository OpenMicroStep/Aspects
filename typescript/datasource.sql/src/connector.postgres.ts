import {DBConnector, DBConnectorTransaction, SqlBinding, SqlMaker} from './index';

class PostgresSqlMaker extends SqlMaker {
  quote(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  
  value_null_typed(type: SqlMaker.NullType) : string {
    switch (type) {
      case "string": return "NULL::text";
      case "integer": return "NULL::integer";
      case "boolean": return "NULL::boolean";
    }
    return "NULL";
  }

  insert(table: string, columns: string[], sql_values: SqlBinding[], output_columns: string[]) : SqlBinding {
    let sql =`INSERT INTO ${this.quote(table)} (${columns.map(c => this.quote(c)).join(',')}) VALUES (${this.join_sqls(sql_values, ',')})`;
    if (output_columns.length > 0)
      sql += ` RETURNING ${output_columns.map(c => this.quote(c)).join(',')}`;
    return {
      sql: sql,
      bind: this.join_bindings(sql_values)
    };
  }
}
export const PostgresDBConnectorFactory = DBConnector.createSimple<{ Client: { new(o: object): any } }, { 
  host: string, port?: number, ssl?: boolean,
  user: string, password?: string, database: string,
  application_name?: string
}, {
  query(sql: string, cb: (err, result) => void),
  query(sql: string, bind: ReadonlyArray<any>, cb: (err, result) => void),
  end()
}
>({
  maker: new PostgresSqlMaker(),
  create(pg, options) {
    return new Promise((resolve, reject) => {
      let db = new pg.Client(options);
      db.connect(err => err ? reject(err) : resolve(db));
    });
  },
  destroy(pg, db) {
    return new Promise<void>((resolve, reject) => {
      db.end();
      resolve();
    });
  },
  select(pg, db, sql_select: SqlBinding) : Promise<object[]> {
    return new Promise<any>((resolve, reject) => {
      db.query(sql_select.sql, sql_select.bind, function (err, result) {
        err ? reject(err) : resolve(result.rows);
      });
    });
  },
  update(pg, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      db.query(sql_update.sql, sql_update.bind, function (err, result) {
        err ? reject(err) : resolve(result.rowCount);
      });
    });
  },
  delete(pg, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      db.query(sql_update.sql, sql_update.bind, function (err, result) {
        err ? reject(err) : resolve(result.rowCount);
      });
    });
  },
  insert(pg, db, sql_insert: SqlBinding, output_columns) : Promise<any[]> {
    return new Promise<any>((resolve, reject) => {
      db.query(sql_insert.sql, sql_insert.bind, function (err, result) {
        err ? reject(err) : resolve(output_columns.map(c => result.rows[0][c]));
      });
    });
  },
  run(pg, db, sql: SqlBinding) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
      db.query(sql.sql, sql.bind, function (err, rows) {
        err ? reject(err) : resolve();
      });
    });
  },
  beginTransaction(pg, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.query("BEGIN", (err) => err ? reject(err) : resolve()) });
  },
  commit(pg, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.query("COMMIT", (err) => err ? reject(err) : resolve()) });
  },
  rollback(pg, db): Promise<void> {
    return new Promise<any>((resolve, reject) => { db.query("ROLLBACK", (err) => err ? reject(err) : resolve()) });
  },
  transform(sql) { return DBConnector.transformBindings(sql, idx => `$${idx + 1}`); },
});
