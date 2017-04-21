import {DBConnector, DBConnectorTransaction, SqlBinding} from './index';

async function select(db, tr, sql_select) : Promise<object[]> {
  let results = await db.query(sql_select.sql, { bind: sql_select.bind, transaction: tr, raw: true });
  return results;
}
async function update(db, tr, sql_update) : Promise<number>  {
  let results = await db.query(sql_update.sql, { bind: sql_update.bind, transaction: tr, raw: true });
  return results;
}
async function insert(db, tr, sql_insert) : Promise<any> {
  let results = await db.query(sql_insert.sql, { bind: sql_insert.bind, transaction: tr, raw: true });
  return results;
}

export class SequelizeDBConnector implements DBConnector {
  constructor(public db) {}

  async transaction(): Promise<DBConnectorTransaction> {
    return new SequelizeDBTransaction(this.db, await this.db.transaction());
  }

  select(sql_select: SqlBinding) : Promise<object[]> {
    return select(this.db, undefined, sql_select);
  }

  update(sql_update: SqlBinding) : Promise<number> {
    return update(this.db, undefined, sql_update);
  }

  insert(sql_insert: SqlBinding) : Promise<any> {
    return insert(this.db, undefined, sql_insert);
  }
}

class SequelizeDBTransaction implements DBConnectorTransaction {
  constructor(public db, public tr) {}

  select(sql_select: SqlBinding) : Promise<object[]> {
    return select(this.db, this.tr, sql_select);
  }

  update(sql_update: SqlBinding) : Promise<number> {
    return update(this.db, this.tr, sql_update);
  }

  insert(sql_insert: SqlBinding) : Promise<any> {
    return insert(this.db, this.tr, sql_insert);
  }

  commit() : Promise<void> {
    return this.tr.commit();
  }
  rollback() : Promise<void> {
    return this.tr.rollback();
  }
}