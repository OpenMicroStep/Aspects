import * as sequelize from 'sequelize';
import {Element} from '@openmicrostep/msbuildsystem.shared';
import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, VersionedObjectConstructor} from '@openmicrostep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;

export class SqlInsert extends Element {
  table: string;
  values: SqlValue[] = [];
}

export class SqlValue extends Element {
  type: "autoincrement" | "ref" | "value"
  insert?: SqlInsert
  value?: string
}

export class SqlPath extends Element {
  table: string
  key: string
  value: string
  where: SqlValue[] = [];
  fromDb: (value) => any
  toDb: (value) => any

  uniqid(value: boolean) {
    let ret = JSON.stringify([this.table, this.key, this.where]);
    if (value)
      ret += JSON.stringify(this.value);
    return ret;
  }
}

export class SqlMappedAttribute extends Element {
  insert: SqlInsert | undefined;
  path: SqlPath[] = [];
  fromDbKey: (value) => any
  toDbKey: (value) => any

  last(): SqlPath {
    return this.path[this.path.length - 1];
  }

  pathref_uniqid() {
    let key = "";
    for (let i = 0, ilast = this.path.length - 1; i <= ilast; i++)
      key += this.path[i].uniqid(i !== ilast);
    return key;
  }
}

export class SqlMappedObject extends Element {
  inserts: SqlInsert[] = [];
  attributes: SqlMappedAttribute[] = [];
  
  get(attribute: string) : SqlMappedAttribute {
    let sqlattr = this.attributes.find(a => a.name === attribute);
    if (!sqlattr)
      throw new Error(`attribute ${attribute} is not defined in ${this}`);
    return sqlattr;
  }

  toString() {
    return this.name;
  }
}

function pass(v) { return v; }


export class SqlStorage {
  idGenerator?: (transaction: sequelize.Transaction, versionedObject: VersionedObject) => Promise<any[]>;
  toStorage: (object: Identifier) => any[]
  fromStorage: (object: any[]) => Identifier
  keyPath: { 
    model: any // sequelize.Model<any, any>
    fromColumns: string[]
    toColumns: string[]
  }[];

  constructor(options : {
    idGenerator?: (transaction: sequelize.Transaction, versionedObject: VersionedObject) => Promise<any[]>;
    toStorage?: (object: Identifier) => any[]
    fromStorage?: (object: any[]) => Identifier
    keyPath: {
      model: any // sequelize.Model<any, any>
      fromColumns: string[]
      toColumns?: string[]
    }[]
  }) {
    this.idGenerator = options.idGenerator;
    this.toStorage = options.toStorage || (options.idGenerator ? ((id) => [id]) : (id) => [+id.toString().split(':')[0]]);
    this.fromStorage = options.fromStorage || (options.idGenerator ? ((o) => o[0]) : ((o) => `${o[0]}:${this.keyPath[0].model.name}`));
    this.keyPath = options.keyPath.map(p => ({
      model: p.model,
      fromColumns: p.fromColumns,
      toColumns: p.toColumns || p.fromColumns,
    }));
  }

  async create(transaction: sequelize.Transaction, object: object, vo: VersionedObject) : Promise<Identifier> {
    // backward insertion (generator? -> outColumns -table 1-> inColumns -> outColumns -table 2-> inColumns)
    let id: any[] = [];
    if (this.idGenerator)
      id = await this.idGenerator(transaction, vo);
    for (let i = this.keyPath.length - 1; i >= 0; i--) {
      let p = this.keyPath[i];
      let o = i === this.keyPath.length - 1 ? object : {};
      id.forEach((v, idx) => o[p.toColumns[idx]] = v);
      let n = await p.model.build(o).save({transaction: transaction});
      id = p.fromColumns.map(c => n[c]);
    }
    return this.fromStorage(id);
  }

  async insert(transaction: sequelize.Transaction, object: object, id: Identifier) : Promise<void> {
    // forward insertion
    let ids = this.toStorage(id);
    for (let i = 0; i < this.keyPath.length; i++) {
      let p = this.keyPath[i];
      let o = i === this.keyPath.length - 1 ? object : {};
      ids.forEach((v, idx) => o[p.fromColumns[idx]] = v);
      let n = await p.model.build(object).save({transaction: transaction});
      ids = p.toColumns.map(c => n[c]);
    }
  }

  async update(transaction: sequelize.Transaction, newValues: object, oldValues: object, id: Identifier) : Promise<void> {
    let ids = this.toStorage(id);
    let p = this.keyPath[this.keyPath.length - 1];
    if (this.keyPath.length > 1) {
      let where: sequelize.IncludeOptions = {};
      let pwhere = where;
      ids.forEach((v, idx) => where[this.keyPath[0].fromColumns[idx]] = v);
      for (let i = 1; i < this.keyPath.length; i++) {
        let p = this.keyPath[i];
        (pwhere.include = (pwhere.include || [])).push({ model: p.model, required: true });
        pwhere = pwhere.include[0];
      }
      let n = await this.keyPath[0].model.findOne(Object.assign(where, { raw: true }));
      // TODO: resolve this tree
      ids = p.toColumns.map(c => n[c]);
    }
    else {
      ids.forEach((v, idx) => oldValues[p.fromColumns[idx]] = v);
    }

    let [affectedCount] = await p.model.update(newValues, { where: oldValues as {},  transaction: transaction });
    if (affectedCount < 1)
      return Promise.reject('cannot update object (probable conflict)');
    if (affectedCount > 1)
      return Promise.reject('cannot update database is corrupted');
  }
}

