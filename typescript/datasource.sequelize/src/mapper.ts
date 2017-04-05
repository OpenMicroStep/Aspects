import * as sequelize from 'sequelize';
import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, VersionedObjectConstructor} from '@microstep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;

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

export class SqlMappedObject {
  interface: VersionedObjectConstructor<VersionedObject>;
  select: SqlStorage;
  insert: SqlStorage;
  attributes = new Map<string, SqlMappedAttribute>();

  constructor(options: {
    interface: VersionedObjectConstructor<VersionedObject>
    select: SqlStorage
    insert: SqlStorage
    attributes: SqlMappedAttribute[]
  }) {
    this.interface = options.interface;
    this.select = options.select;
    this.insert = options.insert;
    for (let a of options.attributes)
      this.attributes.set(a.name, a);
  }

  async save(transaction: sequelize.Transaction, object: VersionedObject): Promise<{ _id: Identifier, _version: number }> {
    let id: Identifier;
    let manager = object.manager();
    let aspect = manager.aspect();
    let isNew = VersionedObjectManager.isLocalId(manager.id());
    let objects = new Map<SqlStorage, { newValues: object, oldValues: object }>();
    let version = isNew ? 0 : manager._version + 1;
    let map = (k: string, nv, ov) => {
      let attribute = this.attributes.get(k)!;
      let obj = objects.get(attribute.storage);
      if (!obj)
        objects.set(attribute.storage, obj = { newValues: {}, oldValues: {} });
      obj.newValues[attribute.path[0]] = attribute.mapToStorage(nv);
      if (!isNew)
        obj.oldValues[attribute.path[0]] = attribute.mapToStorage(ov);
    };
    manager._localAttributes.forEach((nv, k) => map(k, nv, isNew ? undefined : manager._versionAttributes.get(k)));
    map('_version', version, manager._version);
    if (isNew)
      id = await this.insert.create(transaction, (objects.get(this.insert) || { newValues: {}, oldValues: {} }).newValues, object);
    else
      id = manager.id();
    for (let [storage, obj] of objects.entries()) {
      if (storage !== this.insert) {
        if (isNew)
          await storage.insert(transaction, obj.newValues, id)
        else
          await storage.update(transaction, obj.newValues, obj.oldValues, id);
      }
    }
    return { _id: id, _version: version };
  }

  toString() {
    return this.interface.definition.name;
  }
}

function pass(v) { return v; }

export class SqlMappedAttribute {
  name: string;
  storage: SqlStorage;
  path: string[];
  mapToStorage: (value: any) => any;
  mapFromStorage: (value: any) => any;

  constructor ({ name, storage, path, mapToStorage, mapFromStorage, where }: {
    name: string;
    storage: SqlStorage; // référence vers la source de données (document, table, ...)
    path: string[]; // chemin au sein de la source de données vers la valeur de l'attribute
    mapToStorage?: (objectValue: any) => any; // mappage de la valeur aspect vers la valeur en base
    mapFromStorage?: (storageValue: any) => any; // mappage depuis la valeur en base vers la valeur aspect
    where?: ObjectSet; // si type === "query", la requête DataSource à effectuer. L'élément "=::self::" est prédéfini comme étant l'objet Aspect sur lequel porte la recherche
  }) {
    this.name = name;
    this.storage = storage;
    this.path = path;
    this.mapToStorage = mapToStorage || pass;
    this.mapFromStorage = mapFromStorage || pass;
  }
}