import * as sequelize from 'sequelize';
import {Element, AttributePath, ElementDefinition, ProviderMap, Reporter} from '@openmicrostep/msbuildsystem.shared';
import {Aspect, DataSource, DataSourceConstructor, VersionedObject, VersionedObjectManager, Identifier, ControlCenter, DataSourceInternal, VersionedObjectConstructor} from '@openmicrostep/aspects';
import ObjectSet = DataSourceInternal.ObjectSet;
import ConstraintType = DataSourceInternal.ConstraintType;

export const elementFactories = Element.createElementFactoriesProviderMap('aspects');

export function loadSqlMappers(definition) : { [s: string]: SqlMappedObject } {
  let root = Element.load(new Reporter(), definition, new Element('root', 'root', null), elementFactories);
  let ret = {};
  Object.keys(root).forEach(k => k.endsWith('=') && root[k] instanceof SqlMappedObject ? ret[k.replace(/=$/, '')] = root[k] : void 0);
  return ret;
}

export class SqlInsert extends Element {
  table: string;
  values: SqlValue[] = [];
}

elementFactories.registerSimple('sql-value', (reporter, name, definition, attrPath, parent: Element) => {
  return new SqlValue('sql-value', name, parent);
});
export class SqlValue extends Element {
  type: "autoincrement" | "ref" | "value"
  insert?: SqlInsert
  value?: string
}

elementFactories.registerSimple('sql-path', (reporter, name, definition, attrPath, parent: Element) => {
  return new SqlPath('sql-path', name, parent);
});
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

elementFactories.registerSimple('sql-mapped-attribute', (reporter, name, definition, attrPath, parent: Element) => {
  return new SqlMappedAttribute('sql-mapped-attribute', name, parent);
});
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

elementFactories.registerSimple('sql-mapped-object', (reporter, name, definition, attrPath, parent: Element) => {
  return new SqlMappedObject('sql-mapped-object', name, parent);
});
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
