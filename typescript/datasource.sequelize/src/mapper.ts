import * as sequelize from 'sequelize';
import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal} from '@microstep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;

export type SqlValues = { [column: string]: any };
export interface SqlStorage {
  alias: string;
  model: sequelize.Model<any, any>;
  create(transaction: sequelize.Transaction, object: object, vo: VersionedObject) : Promise<Identifier>;
  insert(transaction: sequelize.Transaction, object: object, id: Identifier) : Promise<void>;
  update(transaction: sequelize.Transaction, newValues: object, oldValues: object, id: Identifier) : Promise<void>;
}
export class SequelizeStorage implements SqlStorage {
  alias: string;
  model: sequelize.Model<any, any>;
  idGenerator?: (transaction: sequelize.Transaction, versionedObject: VersionedObject) => Promise<SqlValues>;
  toStorageKey: (object: Identifier) => SqlValues
  fromStorageKey: (object: SqlValues) => Identifier
  keyPath: { 
    model: sequelize.Model<any, any>,
    toStorageKey: (object: SqlValues) => SqlValues
    fromStorageKey: (object: SqlValues) => SqlValues
  }[];

  constructor({idGenerator, toStorageKey, fromStorageKey, keyPath} : {
    idGenerator?: (transaction: sequelize.Transaction, versionedObject: VersionedObject) => Promise<SqlValues>;
    toStorageKey?: (object: Identifier) => SqlValues
    fromStorageKey?: (object: SqlValues) => Identifier
    keyPath: ({ model: sequelize.Model<any, any> } & ({
      toStorageKey: (object: SqlValues) => SqlValues
      fromStorageKey: (object: SqlValues) => SqlValues
    } | { columns: SqlValues }))[]
  }) {
    this.idGenerator = idGenerator;
    this.toStorageKey = toStorageKey || ((id: Identifier) => ({ _id: id }));
    this.fromStorageKey = fromStorageKey || ((object: SqlValues) => object._id as Identifier);
    this.keyPath = keyPath.map((p: any) => ({
      model: p.model,
      toStorageKey: p.toStorageKey || (o => { let r = {}; for (let k in p.columns) r[p.columns[k]] = o [k]; return r; }),
      fromStorageKey: p.fromStorageKey || (o => { let r = {}; for (let k in p.columns) r[k] = o [p.columns[k]]; return r; }),
    }));
  }
/*
  toDbId(id: Identifier): number {
    return parseInt(id.toString().split(':', 2)[1]);
  }
  fromDbId(id: number, aspect: Aspect.Installed): string {
    return `${aspect.name}:${id}`;
  }
*/

  async create(transaction: sequelize.Transaction, object: object, vo: VersionedObject) : Promise<Identifier> {
    let ret: Identifier;
    if (this.idGenerator) {
      // forward insertion
      let id = await this.idGenerator(transaction, vo);
      ret = this.fromStorageKey(id);
      for (let i = 0; i < this.keyPath.length; i++) {
        let p = this.keyPath[i];
        id = p.toStorageKey(id);
        id = await p.model.build(i === 0 ? Object.assign(object, id) : id).save({transaction: transaction});
      }
    }
    else {
      // backward insertion
      let id: SqlValues = {};
      for (let i = this.keyPath.length - 1; i >= 0; i--) {
        let p = this.keyPath[i];
        id = p.fromStorageKey(id);
        id = await p.model.build(i === 0 ? Object.assign(object, id) : id).save({transaction: transaction});
      }
      ret = this.fromStorageKey(id);
    }
    return ret;
  }

  async insert(transaction: sequelize.Transaction, object: object, id: Identifier) : Promise<void> {
    let p = this.keyPath[0];
    Object.assign(object, p.toStorageKey(this.toStorageKey(id)));
    await p.model.build(object).save({transaction: transaction});
  }

  async update(transaction: sequelize.Transaction, newValues: object, oldValues: object, id: Identifier) : Promise<void> {
    let p = this.keyPath[0];
    Object.assign(oldValues, p.toStorageKey(this.toStorageKey(id)));
     let [affectedCount] = await p.model.update(newValues, { where: oldValues as {},  transaction: transaction });
     if (affectedCount < 1)
       return Promise.reject('cannot update object (probable conflict)');
     if (affectedCount > 1)
       return Promise.reject('cannot update database is corrupted');
  }
}

export class SqlMappedObject {
  cstor: Aspect.Constructor;
  attributes = new Map<string, SqlMappedAttribute>();

  constructor({ attributes }: {
    attributes: SqlMappedAttribute[]
  }) {

  }

  async select(set: ObjectSet): Promise<VersionedObject[]>  {
    throw "wip";
  }

  async save(transaction: sequelize.Transaction, object: VersionedObject): Promise<{ _id: Identifier, _version: number }> {
    let id: Identifier;
    let manager = object.manager();
    let isNew = VersionedObjectManager.isLocalId(manager.id());
    let idStorage = isNew ? this.attributes.get('_id')!.storage : undefined;
    let objects = new Map<SqlStorage, { newValues: object, oldValues: object }>();
    let version = isNew ? 0 : manager.version() + 1;
    let map = (v, k) => {
      let attribute = this.attributes.get(k)!;
      let obj = objects.get(attribute.storage);
      if (!obj)
        objects.set(attribute.storage, obj = { newValues: {}, oldValues: {} });
      attribute.assignToStorage(obj.newValues, k, v);
      if (!isNew)
        attribute.assignToStorage(obj.oldValues, k, manager._versionAttributes.get(k));
    };
    manager._localAttributes.forEach(map);
    map(version, '_version');
    if (idStorage)
      id = await idStorage.create(transaction, objects.get(idStorage)!.newValues, object);
    else
      id = manager.id();
    for (let [storage, obj] of objects.entries()) {
      if (storage !== idStorage) {
        if (isNew)
          await storage.insert(transaction, obj.newValues, id)
        else
          await storage.update(transaction, obj.newValues, obj.oldValues, id);
      }
    }
    return { _id: id, _version: version };
  }
}

export class SqlMappedAttribute {
  name: string;
  storage: SqlStorage;
  path: string[];

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
  }

  assignToStorage(into: object, key: string, value) {

  }
  mapToStorage(key: string, value) {

  }
  mapFromStorage(value) : any {}
}