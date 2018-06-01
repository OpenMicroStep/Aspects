import {DBConnector, SqlBinding, SqlMaker} from './index';

class OracleSqlMaker extends SqlMaker {
  quote(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  insert(table: string, columns: string[], sql_values: SqlBinding[], output_columns: string[]) : SqlBinding {
    let sql =`INSERT INTO ${this.quote(table)} (${columns.map(c => this.quote(c)).join(',')}) VALUES (${this.join_sqls(sql_values, ',')})`;
    if (output_columns.length > 0)
      sql += ` RETURNING ${output_columns.map((c, i) => this.quote(c)).join(',')} INTO ${output_columns.map((c, i) => `:r${i}`).join(',')}`;
    return {
      sql: sql,
      bind: this.join_bindings(sql_values)
    };
  }

  admin_create_table_column_type(type: SqlMaker.ColumnType) {
    switch (type.is) {
      case 'integer':
        switch (type.bytes) {
          case 2: return 'NUMBER( 5,0)';
          case 4: return 'NUMBER(10,0)';
          case 8: return 'NUMBER(19,0)';
        }
        return 'NUMBER(10,0)';
      case 'autoincrement': return type.bytes === 4 ? 'NUMBER(10,0)' : 'NUMBER(19,0)';
      case 'string': return `NVARCHAR2(${type.max_bytes})`;
      case 'text': return `NCLOB`;
      case 'decimal': return `NUMBER(${type.precision}, ${type.scale})`;
      case 'binary': return 'BLOB';
      case 'double': return 'BINARY_DOUBLE';
      case 'float': return 'BINARY_FLOAT';
      case 'boolean': return 'NUMBER(1)';
    }
  }

  admin_create_table(table: SqlMaker.Table) : SqlBinding[] {
    let ret = super.admin_create_table(table);
    for (let column of table.columns) {
      if (column.type.is === "autoincrement") {
        ret.push({ sql: `CREATE SEQUENCE ${this.quote(`${table.name}_${column.name}_seq`)} START WITH 1`, bind: [] });
        ret.push({ sql: `CREATE OR REPLACE TRIGGER ${this.quote(`${table.name}_${column.name}_autoincrement`)}
BEFORE INSERT ON ${this.quote(table.name)}
FOR EACH ROW
BEGIN
  SELECT ${this.quote(`${table.name}_${column.name}_seq`)}.NEXTVAL INTO :new."id" FROM dual;
END;`, bind: [] });
      }
    }
    return ret;
  }

  select_table_list() : SqlBinding {
    return { sql: `SELECT OWNER || "." || TABLE_NAME table_name FROM ALL_TABLES`, bind: [] };
  }

  select_index_list() : SqlBinding {
    return { sql: `SELECT OWNER || "." || INDEX_NAME index_name, OWNER || "." || TABLE_NAME table_name FROM ALL_INDEXES`, bind: [] };
  }
}
export const OracleDBConnectorFactory = DBConnector.createSimple<any, {
  connectString: string,
  user?: string, password?: string
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
      db.execute(sql_select.sql, sql_select.bind, (err, result) => {
        if (err) return reject(err);
        let rows = result.rows.map(row => {
          let r = {};
          row.map((v, i) => r[result.metaData[i].name] = v);
          return r;
        });
        resolve(rows);
      });
    });
  },
  update(oracledb, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      db.execute(sql_update.sql, sql_update.bind, (err, result) => err ? reject(err) : resolve(result.rowsAffected));
    });
  },
  delete(oracledb, db, sql_update: SqlBinding) : Promise<number> {
    return new Promise<any>((resolve, reject) => {
      db.execute(sql_update.sql, sql_update.bind, (err, result) => err ? reject(err) : resolve(result.rowsAffected));
    });
  },
  insert(oracledb, db, sql_insert: SqlBinding, output_columns) : Promise<any[]> {
    return new Promise<any>((resolve, reject) => {
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
    return new Promise<any>((resolve, reject) => { db.execute("SET TRANSACTION READ WRITE", [], (err) => err ? reject(err) : resolve()) });
  },
  commit(oracledb, db): Promise<void> {
    return db.commit();
  },
  rollback(oracledb, db): Promise<void> {
    return db.rollback();
  },
  transform(sql) { return DBConnector.transformBindings(sql, idx => `:i${idx}`); },
});
