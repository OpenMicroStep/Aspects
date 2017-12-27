import {DBConnector, SqlBinding, SqlMaker} from './index';

class PostgresSqlMaker extends SqlMaker {
  quote(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  value(value: any) : SqlBinding {
    switch (typeof value) {
      case 'boolean': return { sql: value ? "TRUE" : "FALSE", bind: [] };
      case 'number': return { sql: value.toString(), bind: [] };
      default: return { sql: '?', bind: [value !== undefined ? value : null] };
    }
  }

  value_null_typed(type: SqlMaker.NullType): string {
    switch (type) {
      case "string": return "NULL::text";
      case "integer": return "NULL::integer";
      case "boolean": return "NULL::boolean";
    }
    return "NULL";
  }

  insert(table: string, columns: string[], sql_values: SqlBinding[], output_columns: string[]): SqlBinding {
    let sql = `INSERT INTO ${this.quote(table)} (${columns.map(c => this.quote(c)).join(',')}) VALUES (${this.join_sqls(sql_values, ',')})`;
    if (output_columns.length > 0)
      sql += ` RETURNING ${output_columns.map(c => this.quote(c)).join(',')}`;
    return {
      sql: sql,
      bind: this.join_bindings(sql_values)
    };
  }

  admin_create_table_column_type(type: SqlMaker.ColumnType) {
    switch (type.is) {
      case 'integer':
        switch (type.bytes) {
          case 2: return 'SMALLINT';
          case 4: return 'INTEGER';
          case 8: return 'BIGINT';
        }
        return 'INTEGER';
      case 'autoincrement': return type.bytes === 4 ? 'SERIAL' : 'BIGSERIAL';
      case 'string': return `VARCHAR(${type.max_bytes})`;
      case 'text': return `TEXT`;
      case 'decimal': return `NUMERIC(${type.precision}, ${type.scale})`;
      case 'binary': return 'BLOB';
      case 'double': return 'DOUBLE PRECISION';
      case 'float': return 'REAL';
      case 'boolean': return 'BOOLEAN';
    }
  }

  select_table_list() : SqlBinding {
    return { sql: `SELECT schemaname || '.' || tablename table_name FROM pg_catalog.pg_tables`, bind: [] };
  }

  select_index_list() : SqlBinding {
    return { sql: `SELECT schemaname || '.' || indexname index_name, schemaname || '.' || tablename table_name FROM pg_catalog.pg_indexes`, bind: [] };
  }
}


function query(
  pg,
  db: { errored: Promise<void>, client: { query(sql: string, bind: ReadonlyArray<any>, cb: (err, result) => void) } },
  sql: SqlBinding
): Promise<{ rows: any[], fields: any[], rowCount: number, command: string }> {
  return Promise.race([db.errored, new Promise<any>((resolve, reject) => {
    db.client.query(sql.sql, sql.bind, (err, result) => {
      err ? reject(err) : resolve(result);
    });
  })]);
}

export const PostgresDBConnectorFactory = DBConnector.createSimple<{ Client: { new(o: object): any } }, {
  host: string, port?: number, ssl?: boolean,
  user: string, password?: string, database: string,
  application_name?: string
}, { errored: Promise<void>, client: {
  query(sql: string, bind: ReadonlyArray<any>, cb: (err, result) => void),
  end()
} }
>({
  maker: new PostgresSqlMaker(),
  create(pg, options) {
    return new Promise((resolve, reject) => {
      let db = new pg.Client(options);
      db.connect(err => err ? reject(err) : resolve({
        errored: new Promise((resolve, reject) => db.on("error", reject)),
        client: db
      }));
    });
  },
  destroy(pg, db) {
    return new Promise<void>((resolve, reject) => {
      db.client.end();
      resolve();
    });
  },
  select(pg, db, sql_select: SqlBinding) : Promise<object[]> {
    return query(pg, db, sql_select).then(result => Promise.resolve(result.rows));
  },
  update(pg, db, sql_update: SqlBinding) : Promise<number> {
    return query(pg, db, sql_update).then(result => Promise.resolve(result.rowCount));
  },
  delete(pg, db, sql_delete: SqlBinding) : Promise<number> {
    return query(pg, db, sql_delete).then(result => Promise.resolve(result.rowCount));
  },
  insert(pg, db, sql_insert: SqlBinding, output_columns) : Promise<any[]> {
    return query(pg, db, sql_insert).then(result => Promise.resolve(output_columns.map(c => result.rows[0][c])));
  },
  run(pg, db, sql: SqlBinding) : Promise<any> {
    return query(pg, db, sql).then(result => Promise.resolve());
  },
  beginTransaction(pg, db): Promise<void> {
    return query(pg, db, { sql: "BEGIN", bind: [] }).then(result => Promise.resolve());
  },
  commit(pg, db): Promise<void> {
    return query(pg, db, { sql: "COMMIT", bind: [] }).then(result => Promise.resolve());
  },
  rollback(pg, db): Promise<void> {
    return query(pg, db, { sql: "ROLLBACK", bind: [] }).then(result => Promise.resolve());
  },
  transform(sql) { return DBConnector.transformBindings(sql, idx => `$${idx + 1}`); },
});
