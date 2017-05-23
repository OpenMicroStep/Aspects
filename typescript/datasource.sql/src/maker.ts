import {DataSourceInternal} from '@openmicrostep/aspects';
import ConstraintType = DataSourceInternal.ConstraintType;

export type SqlBinding = { sql: string, bind: any[] };

function push_bindings(bind: any[], bindings: SqlBinding[]) {
  for (let b of bindings)
    bind.push(...b.bind);
}
function join_sqls(bind: SqlBinding[], separator: string) : string {
  return bind.map(b => b.sql).join(separator);
}

export class SqlMaker {
  select(sql_columns: string[], sql_from: SqlBinding[], sql_joins: SqlBinding[], sql_where: SqlBinding, limit?: [number, number]) : SqlBinding {
    let bind: SqlBinding[] = [];
    let sql = `SELECT ${sql_columns.join(',')}\nFROM ${join_sqls(sql_from, ',')}`;
    push_bindings(bind, sql_from);
    if (sql_joins.length) {
      sql += `\n${join_sqls(sql_joins, '\n')}`;
      push_bindings(bind, sql_from);
    }
    if (sql_where && sql_where.sql) {
      sql += `\nWHERE ${sql_where.sql}`;
      bind.push(...sql_where.bind);
    }
    if (limit && limit.length)
      sql += `\nLIMIT ${limit[0]}, ${limit[1]}`;
    return { sql: sql, bind: bind };
  }

  update(table: string, sql_set: SqlBinding[], sql_where: SqlBinding) : SqlBinding {
    return {
      sql: `UPDATE ${this.quote(table)} SET ${sql_set.map(s => s.sql).join(',')} ${this._where(sql_where)}`,
      bind: [...([] as SqlBinding[]).concat(...sql_set.map(s => s.bind)), ...sql_where.bind]
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

  values(columns: string[], values: any[]) : SqlBinding[] {
    return columns.map((c, i) => ({ sql: this.quote(c), bind: [values[i]] }));
  }

  insert(table: string, sql_values: SqlBinding[], output_columns: string[]) : SqlBinding {
    if (output_columns.length > 1)
      throw new Error(`default maker doesn't support multiple output columns`);
    return {
      sql: `INSERT INTO ${this.quote(table)} (${sql_values.map(c => c.sql).join(',')}) VALUES (${sql_values.map(c => '?').join(',')})`,
      bind: ([] as SqlBinding[]).concat(...sql_values.map(s => s.bind))
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
    r.sql += ` ${this.quote(alias)}`;
    return r;
  }

  sub(sql_select: SqlBinding) : SqlBinding {
    return {
      sql: `(${sql_select.sql})`,
      bind: sql_select.bind
    };
  }

  column(table: string, name: string, alias?: string) {
    let r = this.quote(table) + "." + this.quote(name);
    if (alias)
      r += ` ${this.quote(alias)}`;
    return r;
  }

  set(sql_column: string, value: any) : SqlBinding {
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
      first ? first = false : sql += sql_op;
      sql += condition.sql;
      bind.push(...condition.bind);
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
    throw new Error(`unsupported op operator ${operator}`);
  }

  op_bind(sql_column: SqlBinding, operator: DataSourceInternal.ConstraintBetweenColumnsTypes, value): SqlBinding {
    let b = this.op(sql_column.sql, operator, value);
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
    throw new Error(`unsupported compare operator ${operator}`);
  }

  compare_bind(sql_columnLeft: SqlBinding, operator: DataSourceInternal.ConstraintBetweenSetTypes, sql_columnRight: SqlBinding): SqlBinding {
    let b: SqlBinding;
    switch (operator) {
      case ConstraintType.In:
        b = { sql: `${sql_columnLeft} IN ${sql_columnRight}` , bind: [] };
        break;
      case ConstraintType.NotIn:
        b = { sql: `${sql_columnLeft} NOT IN ${sql_columnRight}` , bind: [] };
        break;
      default: b = this.compare(sql_columnLeft.sql, operator, sql_columnRight.sql);
    }
    b.bind.unshift(...sql_columnRight.bind);
    b.bind.unshift(...sql_columnLeft.bind);
    return b;
  }
}