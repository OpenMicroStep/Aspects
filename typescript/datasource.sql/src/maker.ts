import {DataSourceInternal} from '@openmicrostep/aspects';
import ConstraintType = DataSourceInternal.ConstraintType;

type SqlBindingM = { sql: string, bind: any[] };
export type SqlBindingW = { sql: string, bind: ReadonlyArray<any> };
export type SqlBinding = Readonly<SqlBindingW>;
export abstract class SqlMaker {
  protected push_bindings(bind: any[], bindings: SqlBinding[]) {
    for (let b of bindings)
      bind.push(...b.bind);
  }
  protected join_sqls(bind: SqlBinding[], separator: string) : string {
    return bind.map(b => b.sql).join(separator);
  }
  protected join_bindings(bind: SqlBinding[]) : any[] {
    return ([] as any[]).concat(...bind.map(b => b.bind));
  }

  protected sql_sort(sql_sort?: string[]) : string {
    return (sql_sort && sql_sort.length) ? `\nORDER BY ${sql_sort.join(',')}` : '';
  }

  union(sql_select: SqlBinding[]) : SqlBinding {
    if (sql_select.length === 1) return sql_select[0];
    let sql = `(${this.join_sqls(sql_select, ' UNION ')})`;
    return { sql: sql, bind: this.join_bindings(sql_select) };
  }

  intersection(sql_select: SqlBinding[]) : SqlBinding {
    if (sql_select.length === 1) return sql_select[0];
    let sql = `(${this.join_sqls(sql_select, ' INTERSECT ')})`;
    return { sql: sql, bind: this.join_bindings(sql_select) };
  }

  select(sql_columns: (string | SqlBinding)[], sql_from: SqlBinding, sql_joins: SqlBinding[], sql_where?: SqlBinding, sql_sort?: string[]) : SqlBinding {
    let bind: SqlBinding[] = [];
    let columns = sql_columns.map(c => {
      if (typeof c === "string")
        return c;
      bind.push(...c.bind);
      return c.sql;
    }).join(',');
    let sql = `SELECT DISTINCT ${columns}\nFROM ${sql_from.sql}`;
    bind.push(...sql_from.bind)
    if (sql_joins.length) {
      sql += `\n${this.join_sqls(sql_joins, '\n')}`;
      this.push_bindings(bind, sql_joins);
    }
    if (sql_where && sql_where.sql) {
      sql += `\nWHERE ${sql_where.sql}`;
      bind.push(...sql_where.bind);
    }
    if (sql_sort && sql_sort.length) {
      sql += `\nORDER BY ${sql_sort.join(',')}`;
    }
    return { sql: sql, bind: bind };
  }

  select_with_recursive?: (sql_columns: string[], u_0: SqlBinding, u_n: string, u_np1: SqlBinding) => SqlBinding;

  update(table: string, sql_set: SqlBinding[], sql_where: SqlBinding) : SqlBinding {
    return {
      sql: `UPDATE ${this.quote(table)} SET ${sql_set.map(s => s.sql).join(',')} ${this._where(sql_where)}`,
      bind: [...([] as any[]).concat(...sql_set.map(s => s.bind)), ...sql_where.bind]
    }
  }

  delete(table: string, sql_where: SqlBinding) : SqlBinding {
    return {
      sql: `DELETE FROM ${this.quote(table)} ${this._where(sql_where)}`,
      bind: sql_where.bind
    }
  }

  protected _where(sql_where: SqlBinding) : string {
    return sql_where.sql ? `WHERE ${sql_where.sql}` : '';
  }

  insert(table: string, columns: string[], sql_values: SqlBinding[], output_columns: string[]) : SqlBinding {
    if (output_columns.length > 1)
      throw new Error(`default maker doesn't support multiple output columns`);
    return {
      sql: `INSERT INTO ${this.quote(table)} (${columns.map(c => this.quote(c)).join(',')}) VALUES (${this.join_sqls(sql_values, ',')})`,
      bind: this.join_bindings(sql_values)
    };
  }

  quote(value: string) {
    return `\`${value.replace(/`/g, '``')}\``;
  }

  from(table: string, alias?: string) : SqlBinding {
    return { sql: alias ? `${this.quote(table)} ${this.quote(alias)}` : this.quote(table), bind: [] };
  }

  from_sub(sql_select: SqlBinding, alias: string) : SqlBinding {
    let r = this.sub(sql_select);
    return { sql: `${r.sql} ${this.quote(alias)}`, bind: r.bind };
  }

  protected _join(kind: SqlMaker.JoinType, sql_select: string, on?: SqlBinding) : string {
    let sql_kind: string;
    switch (kind) {
      case "left": sql_kind = on ? "LEFT JOIN" : "NATURAL LEFT JOIN"; break;
      case "inner": sql_kind = on ? "INNER JOIN" : "NATURAL INNER JOIN"; break;
      case "cross": sql_kind = on ? "CROSS JOIN" : "CROSS JOIN"; break;
      case "right": sql_kind = on ? "RIGHT JOIN" : "NATURAL RIGHT JOIN"; break;
      case "": sql_kind = on ? "CROSS JOIN" : "CROSS JOIN"; break;
      default: throw new Error(`invalid join kind ${kind}`);
    }
    if (on)
      return `${sql_kind} ${sql_select} ON ${on.sql}`;
    else
      return `${sql_kind} ${sql_select}`;
  }

  join(kind: SqlMaker.JoinType, table: string, alias: string, on?: SqlBinding) : SqlBinding {
    return {
      sql: this._join(kind, `${this.quote(table)} ${this.quote(alias)}`, on),
      bind: on ? on.bind : [],
    };
  }

  join_from(kind: SqlMaker.JoinType, sql_from: SqlBinding, on?: SqlBinding) {
    return {
      sql: this._join(kind, sql_from.sql, on),
      bind: on ? [...sql_from.bind, ...on.bind] : sql_from.bind,
    };
  }

  sub(sql_select: SqlBinding) : SqlBinding {
    if (sql_select.sql.startsWith('(') && sql_select.sql.endsWith(')'))
      return sql_select;
    return {
      sql: `(${sql_select.sql})`,
      bind: sql_select.bind
    };
  }

  value_null_typed(type: SqlMaker.NullType) : SqlBinding {
    return {sql: "NULL", bind: [] };
  }

  value_fast(value: null | number) : string {
    return typeof value === "number" ? value.toString() : "NULL";
  }

  value(value: any) : SqlBinding {
    return { sql: '?', bind: [value !== undefined ? value : null] };
  }

  value_concat(values: SqlBinding[]) : SqlBinding {
    return { sql: this.join_sqls(values, " || "), bind: this.join_bindings(values) };
  }

  values(values: any[]) : SqlBinding[] {
    return values.map(this.value.bind(this));
  }

  column(table: string, name: string, alias?: string) {
    let col = { sql:this.quote(table) + "." + this.quote(name), bind:[] };
    if (alias) return this.column_alias(col,alias)
    return col;
  }

  column_count() {
    return "COUNT(*)";
  }

  column_alias(sql_column: SqlBinding, alias: string) : SqlBinding {
    return { sql: `${sql_column.sql} ${this.quote(alias)}`, bind: sql_column.bind };
  }

  sort_column(sql_column: SqlBinding, asc: boolean): string {
    return `${sql_column.sql} ${asc ? 'ASC' : 'DESC'}`;
  }

  set(column: string, value: any) : SqlBinding {
    if (value === undefined)
      value = null;
    return { sql: `${this.quote(column)} = ?`, bind: [value] };
  }

  protected _conditions(conditions: SqlBinding[], sql_op: string) : SqlBinding {
    if (conditions.length === 0)
      return { sql: '', bind: [] };
    if (conditions.length === 1)
      return conditions[0];
    let sql = "(";
    let bind: SqlBinding[] = [];
    let first = true;
    for (let condition of conditions) {
      if (condition.sql) {
        first ? first = false : sql += sql_op;
        sql += condition.sql;
        bind.push(...condition.bind);
      }
    }
    if (sql.length === 1)
      return { sql: '', bind: [] };
    sql += ")";
    return { sql: sql, bind: bind };
  }

  and(conditions: SqlBinding[]) : SqlBinding {
    return this._conditions(conditions, " AND ");
  }

  or(conditions: SqlBinding[]) {
    return this._conditions(conditions, " OR ");
  }

  /**@internal*/
  _op(sql_column: string, operator: DataSourceInternal.ConstraintBetweenAnyValueAndFixedValue, value): SqlBinding {

    switch (operator) {
      case ConstraintType.Equal:
        if (value === null || value === undefined)
          return { sql: `${sql_column} IS NULL`, bind: [] };
        return { sql: `${sql_column} = ?`       , bind: [value] };
      case ConstraintType.NotEqual:           return { sql: `${sql_column} <> ?`      , bind: [value] };
      case ConstraintType.GreaterThan:        return { sql: `${sql_column} > ?`       , bind: [value] };
      case ConstraintType.GreaterThanOrEqual: return { sql: `${sql_column} >= ?`      , bind: [value] };
      case ConstraintType.LessThan:           return { sql: `${sql_column} < ?`       , bind: [value] };
      case ConstraintType.LessThanOrEqual:    return { sql: `${sql_column} <= ?`      , bind: [value] };
      case ConstraintType.Text:               return { sql: `${sql_column} LIKE ?`    , bind: [`%${value}%`] };
      case ConstraintType.In:                 return value.length > 0
        ? { sql: `${sql_column} IN (${value.map(v => '?').join(',')})`    , bind: value }
        : { sql: `1 = 0`    , bind: [] };
      case ConstraintType.NotIn:              return { sql: `${sql_column} NOT IN (${value.map(v => '?').join(',')})`, bind: value };
      case ConstraintType.Exists:             return { sql: `${sql_column} ${value ? 'NOT NULL' : 'IS NULL'}`, bind: [] };
    }
    throw new Error(`unsupported op operator ${ConstraintType[operator]}`);
  }

  op(sql_column: SqlBinding, operator: DataSourceInternal.ConstraintBetweenAnyValueAndFixedValue, value): SqlBinding {
    let b = this._op(sql_column.sql, operator, value) as SqlBindingM;
    b.bind.unshift(...sql_column.bind);
    return b;
  }

  case(sql_case: SqlBinding, cases: Iterable<[string, SqlBinding]>, sql_else?: SqlBinding) : SqlBinding {
    let sql: SqlBindingM = { sql: `CASE ${sql_case.sql}`, bind: [...sql_case.bind] };
    for (let [value, expr] of cases) {
      sql.sql += ` WHEN ? THEN ${this.sub(expr).sql}`;
      sql.bind.push(value, ...expr.bind);
    }
    if (sql_else) {
      sql.sql += ` ELSE ${this.sub(sql_else).sql}`;
      sql.bind.push(...sql_else.bind);
    }
    sql.sql += ' END';
    return sql;
  }

  compare(sql_columnLeft: SqlBinding, operator: DataSourceInternal.ConstraintBetweenAnyValueAndAnyValue, sql_columnRight: SqlBinding): SqlBinding {
    let op:string;
    switch (operator) {
      case ConstraintType.Equal:              op = '='; break;
      case ConstraintType.NotEqual:           op = '<>';break;
      case ConstraintType.GreaterThan:        op = '>'; break;
      case ConstraintType.GreaterThanOrEqual: op = '>=';break;
      case ConstraintType.LessThan:           op = '<'; break;
      case ConstraintType.LessThanOrEqual:    op = '<=';break;
      default:
        throw new Error(`unsupported compare operator ${ConstraintType[operator]}`);
    }
    let b:SqlBindingM;
    b = { sql: `${sql_columnLeft.sql} ${op} ${sql_columnRight.sql}` , bind: [] };
    b.bind.unshift(...sql_columnRight.bind);
    b.bind.unshift(...sql_columnLeft.bind);
    return b;

  }
/*
  compare_bind(sql_columnLeft: SqlBinding, operator: DataSourceInternal.ConstraintBetweenAnyValueAndAnyValue, sql_columnRight: SqlBinding): SqlBinding {
    let b = this.compare(sql_columnLeft.sql, operator, sql_columnRight.sql) as SqlBindingM;
    b.bind.unshift(...sql_columnRight.bind);
    b.bind.unshift(...sql_columnLeft.bind);
    return b;
  }
*/
  protected abstract admin_create_table_column_type(type: SqlMaker.ColumnType,): string;

  protected admin_create_table_primary_key(table: SqlMaker.Table): string {
    if (table.primary_key.length)
      return `PRIMARY KEY (${table.primary_key.map(c => this.quote(c))})`;
    return "";
  }

  protected admin_create_table_foreign_keys(table: SqlMaker.Table): string {
    let defs: string[] = [];
    for (let foreign_key of table.foreign_keys || []) {
      let s = `FOREIGN KEY (${foreign_key.columns.map(column => this.quote(column)).join(', ')}) `;
      s += `REFERENCES ${this.quote(foreign_key.foreign_table)} (${foreign_key.foreign_columns.map(column => this.quote(column)).join(', ')})`;
      s += `\n    ON UPDATE ${this.admin_create_table_foreign_key_on(foreign_key.on_update)}`;
      s += `\n    ON DELETE ${this.admin_create_table_foreign_key_on(foreign_key.on_delete)}`;
      defs.push(s);
    }
    return defs.join(',\n  ');
  }

  protected admin_create_table_foreign_key_on(on: "set null" | "restrict" | "cascade"): string {
    return on.toUpperCase();
  }

  protected admin_create_table_unique_indexes(table: SqlMaker.Table): string {
    let defs: string[] = [];
    for (let unique_index of table.unique_indexes || []) {
      defs.push(`UNIQUE (${unique_index.columns.map(c =>
        `${this.quote(c.name)} ${c.asc ? 'ASC' : 'DESC'}`
      )})`);
    }
    return defs.join(',\n  ');
  }

  admin_create_table(table: SqlMaker.Table) : SqlBinding[] {
    let ret: SqlBinding[] = [];
    let defs: string[] = [];
    for (let column of table.columns)
      defs.push(`${this.quote(column.name)} ${this.admin_create_table_column_type(column.type)}`);
    defs.push(this.admin_create_table_primary_key(table));
    defs.push(this.admin_create_table_foreign_keys(table));
    defs.push(this.admin_create_table_unique_indexes(table));

    let sql = `CREATE TABLE ${this.quote(table.name)} (\n  ${defs.filter(s => !!s).join(',\n  ')}\n)`;
    ret.push({ sql: sql, bind: [] });
    for (let [i, index] of (table.indexes || []).entries())
      ret.push({ sql:
        `CREATE INDEX ${this.quote(`${table.name}_${i}`)} ON ${this.quote(table.name)} (${index.columns.map(c =>
          `${this.quote(c.name)} ${c.asc ? 'ASC' : 'DESC'}`
        )})`, bind: []
      });
    return ret;
  }

  admin_drop_table(table: SqlMaker.Table) : SqlBinding[] {
    return [{ sql: `DROP TABLE ${this.quote(table.name)}`, bind: [] }];
  }

  abstract select_table_list() : SqlBinding;
  abstract select_index_list() : SqlBinding;
}
export namespace SqlMaker {
  export type JoinType = "left" | "inner" | "right" | "cross" | "";
  export type NullType = 'integer' | 'decimal' | 'date' | 'string' | 'boolean' | undefined;
  export type Table = {
    name: string,
    columns: Column[],
    primary_key: string[],
    foreign_keys?: ForeignKey[],
    unique_indexes?: Index[],
    indexes?: Index[],
  };
  export type ColumnType =
    { is: "string", max_bytes: number } |
    { is: "text", max_bytes: number } |
    { is: "autoincrement", bytes: 4 | 8  } |
    { is: "integer", bytes: 2 | 4 | 8  } |
    { is: "binary", max_bytes: number } |
    { is: "float" } |
    { is: "double" } |
    { is: "boolean" } |
    { is: "decimal", precision: number, scale: number };
  export type Index = {
    columns: IndexedColumn[],
  };
  export type IndexedColumn = {
    name: string,
    asc: boolean,
  };
  export type Column = {
    name: string,
    type: ColumnType,
    allow_null?: boolean,
  };
  export type ForeignKey = {
    columns: string[],
    foreign_table: string,
    foreign_columns: string[],
    on_delete: "set null" | "restrict" | "cascade",
    on_update: "set null" | "restrict" | "cascade",
  };
}

SqlMaker.prototype.select_with_recursive = function select_with_recursive(sql_columns: string[], u_0: SqlBinding, u_n: string, u_np1: SqlBinding) : SqlBinding {
  return {
    sql: `WITH RECURSIVE ${this.quote(u_n)}(${sql_columns.join(',')}) AS (\n${u_0.sql}\nUNION\n${u_np1.sql}\n) SELECT DISTINCT * FROM ${this.quote(u_n)}`,
    bind: [...u_0.bind, ...u_np1.bind],
  };
}
