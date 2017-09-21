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

  sort_column(sql_column: string, asc: boolean): string {
    return `${sql_column} ${asc ? 'ASC' : 'DESC'}`;
  }

  set(sql_column: string, value: any) : SqlBinding {
    if (value === undefined)
      value = null;
    return { sql: `${sql_column} = ?`, bind: [value] };
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

  op(sql_column: string, operator: DataSourceInternal.ConstraintOnValueTypes, value): SqlBinding {
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
      case ConstraintType.In:                 return { sql: `${sql_column} IN (${value.map(v => '?').join(',')})`    , bind: value };
      case ConstraintType.NotIn:              return { sql: `${sql_column} NOT IN (${value.map(v => '?').join(',')})`, bind: value };
      case ConstraintType.Exists:             return { sql: `${sql_column} ${value ? 'NOT NULL' : 'IS NULL'}`, bind: [] };
    }
    throw new Error(`unsupported op operator ${ConstraintType[operator]}`);
  }

  op_bind(sql_column: SqlBinding, operator: DataSourceInternal.ConstraintBetweenColumnsTypes, value): SqlBinding {
    let b = this.op(sql_column.sql, operator, value) as SqlBindingM;
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
    let b: SqlBindingM;
    switch (operator) {
      case ConstraintType.In:
        b = { sql: `${sql_columnLeft} IN ${sql_columnRight}` , bind: [] };
        break;
      case ConstraintType.NotIn:
        b = { sql: `${sql_columnLeft} NOT IN ${sql_columnRight}` , bind: [] };
        break;
      default: b = this.compare(sql_columnLeft.sql, operator, sql_columnRight.sql) as SqlBindingM;
    }
    b.bind.unshift(...sql_columnRight.bind);
    b.bind.unshift(...sql_columnLeft.bind);
    return b;
  }
}
export namespace SqlMaker {
  export type JoinType = "left" | "inner" | "right" | "cross" | "";
  export type NullType = 'integer' | 'decimal' | 'date' | 'string' | 'boolean' | undefined;
}

SqlMaker.prototype.select_with_recursive = function select_with_recursive(sql_columns: string[], u_0: SqlBinding, u_n: string, u_np1: SqlBinding) : SqlBinding {
  return {
    sql: `WITH RECURSIVE ${this.quote(u_n)}(${sql_columns.join(',')}) AS (\n${u_0.sql}\nUNION\n${u_np1.sql}\n) SELECT DISTINCT * FROM ${this.quote(u_n)}`,
    bind: [...u_0.bind, ...u_np1.bind],
  };
}
