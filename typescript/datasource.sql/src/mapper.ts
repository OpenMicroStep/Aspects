import {Element, AttributePath, ElementDefinition, ProviderMap, Reporter} from '@openmicrostep/msbuildsystem.shared';
import {Aspect, DataSource, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, VersionedObjectConstructor} from '@openmicrostep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;

export const elementFactories = Element.createElementFactoriesProviderMap('aspects');

export function loadSqlMappers(definition) : { [s: string]: SqlMappedObject } {
  let root = Element.load(new Reporter(), definition, new Element('root', 'root', null), elementFactories);
  let ret = {};
  Object.keys(root).forEach(k => k.endsWith('=') && root[k] instanceof SqlMappedObject ? ret[k.replace(/=$/, '')] = root[k] : void 0);
  return ret;
}

elementFactories.registerSimple('sql-insert', (reporter, name, definition, attrPath, parent: Element) => {
  return new SqlInsert('sql-insert', name, parent);
});
export class SqlInsert extends Element {
  table: string;
  values: SqlValue[] = [];
}

elementFactories.registerSimple('sql-value', (reporter, name, definition, attrPath, parent: Element) => {
  return new SqlValue('sql-value', name, parent);
});
export class SqlValue extends Element {
  type: "autoincrement" | "ref" | "value" | "sql"
  insert?: SqlInsert
  value?: string
}

function pass(v) { return v; }

elementFactories.registerSimple('sql-path', (reporter, name, definition, attrPath, parent: Element) => {
  return new SqlPath('sql-path', name, parent);
});
export class SqlPath extends Element {
  table: string
  key: string
  value: string
  where: SqlValue[] = [];

  uniqid(value: boolean) {
    let ret = JSON.stringify([this.table, this.key, this.where]);
    if (value)
      ret += JSON.stringify(this.value);
    return ret;
  }
}

elementFactories.registerSimple('sql-mapped-attribute', (reporter, name, definition, attrPath, parent: Element) => {
  return new SqlMappedAttribute('sql-mapped-attribute', name, parent);
});
export class SqlMappedAttribute extends Element {
  insert: SqlInsert | undefined;
  path: SqlPath[] = [];
  fromDbKey: (value) => any = pass;
  toDbKey: (value) => any = pass;
  fromDb: (value) => any = pass;
  toDb: (value) => any = pass;

  last(): SqlPath {
    return this.path[this.path.length - 1];
  }
}

elementFactories.registerSimple('sql-mapped-object', (reporter, name, definition, attrPath, parent: Element) => {
  return new SqlMappedObject('sql-mapped-object', name, parent);
});
export class SqlMappedObject extends Element {
  inserts: SqlInsert[] = [];
  delete_cascade: SqlPath[] = [];
  fromDbKey: (value) => any = pass;
  toDbKey: (value) => any = pass;
  attributes: SqlMappedAttribute[] = [];

  attribute_id() : SqlMappedAttribute {
    return this.get("_id")!;
  }

  attribute_version() : SqlMappedAttribute {
    return this.get("_version")!;
  }

  get(attribute: string) : SqlMappedAttribute | undefined {
    return this.attributes.find(a => a.name === attribute);
  }

  toString() {
    return this.name;
  }
}
