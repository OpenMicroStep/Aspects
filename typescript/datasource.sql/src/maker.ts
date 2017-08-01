import {DataSourceInternal} from '@openmicrostep/aspects';
import ConstraintType = DataSourceInternal.ConstraintType;

export type SqlBinding = { readonly sql: string, readonly bind: ReadonlyArray<any> };
type SqlBindingW = { sql: string, bind: any[] };
export class SqlMaker {
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

  sort(sql_select: SqlBinding, sql_sort: string[]) {
    if (sql_sort.length === 0)
      return sql_select;
    return { sql: `${sql_select.sql}\nORDER BY ${sql_sort.join(',')}`, bind: sql_select.bind };
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

  select(sql_columns: (string | SqlBinding)[], sql_from: SqlBinding[], sql_joins: SqlBinding[], sql_where: SqlBinding) : SqlBinding {
    let bind: SqlBinding[] = [];
    let columns = sql_columns.map(c => {
      if (typeof c === "string")
        return c;
      bind.push(...c.bind);
      return c.sql;
    }).join(',');
    let sql = `SELECT DISTINCT ${columns}\nFROM ${this.join_sqls(sql_from, ',')}`;
    this.push_bindings(bind, sql_from);
    if (sql_joins.length) {
      sql += `\n${this.join_sqls(sql_joins, '\n')}`;
      this.push_bindings(bind, sql_joins);
    }
    if (sql_where && sql_where.sql) {
      sql += `\nWHERE ${sql_where.sql}`;
      bind.push(...sql_where.bind);
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

  _where(sql_where: SqlBinding) : string {
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

  left_join(table: string, alias: string, on: SqlBinding) {
    return { sql: `LEFT OUTER JOIN ${this.quote(table)} ${this.quote(alias)} ON ${on.sql}`, bind: on.bind };
  }
  
  inner_join(table: string, alias: string, on: SqlBinding) {
    return { sql: `INNER JOIN ${this.quote(table)} ${this.quote(alias)} ON ${on.sql}`, bind: on.bind };
  }

  sub(sql_select: SqlBinding) : SqlBinding {
    return {
      sql: `(${sql_select.sql})`,
      bind: sql_select.bind
    };
  }

  value_null_typed(type: SqlMaker.NullType) : string {
    return "NULL";
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
    let r = this.quote(table) + "." + this.quote(name);
    return alias ? this.column_alias(r, alias) : r;
  }

  column_alias(sql_column: string, alias: string) {
    return `${sql_column} ${this.quote(alias)}`;
  }

  column_alias_bind(sql_column: SqlBinding, alias: string) : SqlBinding {
    return { sql: `${sql_column.sql} ${this.quote(alias)}`, bind: sql_column.bind };
  }

  sort_column(table: string, name: string, asc: boolean): string {
    return `${this.quote(table)}.${this.quote(name)} ${asc ? 'ASC' : 'DESC'}`;
  }

  set(sql_column: string, value: any) : SqlBinding {
    if (value === undefined)
      value = null;
    return { sql: `${sql_column} = ?`, bind: [value] };
  }

  _conditions(conditions: SqlBinding[], sql_op: string) : SqlBinding {
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
    sql += ")";
    return { sql: sql, bind: bind };
  }

  and(conditions: SqlBinding[]) : SqlBinding {
    return this._conditions(conditions, " AND ");
  }

  or(conditions: SqlBinding[]) {
    return this._conditions(conditions, " OR ");
  }

  op(sql_column: string, operator: DataSourceInternal.ConstraintOnValueTypes, value): SqlBinding {
    switch (operator) {
      case ConstraintType.Equal: {
        if (value === null || value === undefined)
          return { sql: `${sql_column} IS NULL`, bind: [] };
        return { sql: `${sql_column} = ?`       , bind: [value] };
      }
      case ConstraintType.NotEqual:           return { sql: `${sql_column} <> ?`      , bind: [value] };
      case ConstraintType.GreaterThan:        return { sql: `${sql_column} > ?`       , bind: [value] };
      case ConstraintType.GreaterThanOrEqual: return { sql: `${sql_column} >= ?`      , bind: [value] };
      case ConstraintType.LessThan:           return { sql: `${sql_column} < ?`       , bind: [value] };
      case ConstraintType.LessThanOrEqual:    return { sql: `${sql_column} <= ?`      , bind: [value] };
      case ConstraintType.Text:               return { sql: `${sql_column} LIKE ?`    , bind: [`%${value}%`] };
      case ConstraintType.In:                 return { sql: `${sql_column} IN (${value.map(v => '?').join(',')})`    , bind: value };
      case ConstraintType.NotIn:              return { sql: `${sql_column} NOT IN (${value.map(v => '?').join(',')})`, bind: value };
      case ConstraintType.Exists:             return { sql: `${sql_column} ${value ? 'NOT NULL' : 'IS NULL'}`, bind: [] };
    }
    throw new Error(`unsupported op operator ${ConstraintType[operator]}`);
  }

  op_bind(sql_column: SqlBinding, operator: DataSourceInternal.ConstraintBetweenColumnsTypes, value): SqlBinding {
    let b = this.op(sql_column.sql, operator, value) as SqlBindingW;
    b.bind.unshift(...sql_column.bind);
    return b;
  }

  compare(sql_columnLeft: string, operator: DataSourceInternal.ConstraintBetweenColumnsTypes, sql_columnRight: string): SqlBinding {
    switch (operator) {
      case ConstraintType.Equal:              return { sql: `${sql_columnLeft} = ${sql_columnRight}` , bind: [] };
      case ConstraintType.NotEqual:           return { sql: `${sql_columnLeft} <> ${sql_columnRight}`, bind: [] };
      case ConstraintType.GreaterThan:        return { sql: `${sql_columnLeft} > ${sql_columnRight}` , bind: [] };
      case ConstraintType.GreaterThanOrEqual: return { sql: `${sql_columnLeft} >= ${sql_columnRight}`, bind: [] };
      case ConstraintType.LessThan:           return { sql: `${sql_columnLeft} < ${sql_columnRight}` , bind: [] };
      case ConstraintType.LessThanOrEqual:    return { sql: `${sql_columnLeft} <= ${sql_columnRight}`, bind: [] };
    }
    throw new Error(`unsupported compare operator ${ConstraintType[operator]}`);
  }

  compare_bind(sql_columnLeft: SqlBinding, operator: DataSourceInternal.ConstraintBetweenSetTypes, sql_columnRight: SqlBinding): SqlBinding {
    let b: SqlBindingW;
    switch (operator) {
      case ConstraintType.In:
        b = { sql: `${sql_columnLeft} IN ${sql_columnRight}` , bind: [] };
        break;
      case ConstraintType.NotIn:
        b = { sql: `${sql_columnLeft} NOT IN ${sql_columnRight}` , bind: [] };
        break;
      default: b = this.compare(sql_columnLeft.sql, operator, sql_columnRight.sql) as SqlBindingW;
    }
    b.bind.unshift(...sql_columnRight.bind);
    b.bind.unshift(...sql_columnLeft.bind);
    return b;
  }
}
export namespace SqlMaker {
  export type NullType = 'integer' | 'decimal' | 'date' | 'string' | 'boolean' | undefined;
}

SqlMaker.prototype.select_with_recursive = function select_with_recursive(sql_columns: string[], u_0: SqlBinding, u_n: string, u_np1: SqlBinding) : SqlBinding {
  return {
    sql: `WITH RECURSIVE ${this.quote(u_n)}(${sql_columns.join(',')}) AS (\n${u_0.sql}\nUNION\n${u_np1.sql}\n) SELECT DISTINCT * FROM ${this.quote(u_n)}`,
    bind: [...u_0.bind, ...u_np1.bind],
  };
}