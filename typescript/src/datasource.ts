import { Identifier, VersionedObject, areEquals, Invocation, Invokable } from './core';

export type Scope = string[];
export type Conditions = Operators | { [s: string]: any };
export type Operators =
  { $class: string } |
  { $eq: any } |
  { $ne: any } |
  { $gt: any } |
  { $gte: any } |
  { $lt: any } |
  { $lte: any } |
  { $in: any[] } |
  { $nin: any[] } |
  { $and: Conditions[] } |
  { $or: Conditions[] } |
  { $not: Conditions } |
  { $exists: boolean } |
  { $type: boolean };

export class DataSource extends VersionedObject {
  static operators = new Map<string, (value, options) => boolean>();
  static passConditions(value, conditions: Conditions): boolean {
    for (var k in conditions) {
      let operator = DataSource.operators.get(k);
      if (operator) {
        if (!operator(value, conditions[k]))
          return false;
      }
      else if(k in value) {
        if (!DataSource.passConditions(value[k], conditions[k]))
          return false;
      }
      else {
        return false;
      }
    }
    return true;
  }

  /// category core 
  filter(objects: VersionedObject[], conditions: Conditions): VersionedObject[] {
    return objects.filter(o => DataSource.passConditions(o, conditions));
  }
  /// far category db
  query(q: {conditions: Conditions, scope?: Scope}): Promise<VersionedObject[]> {
    return this.farPromise("_query", q).then(i => i.result());
  }
  load(l: {objects: VersionedObject[], scope?: Scope}): Promise<VersionedObject[]> {
    return this.farPromise("_load", l).then(i => i.result());
  }
  save(objects: VersionedObject[]): Promise<VersionedObject[]> { 
    return this.farPromise("_save", objects).then(i => i.result());
  }

  /// far category transport
  _query: Invokable<{conditions: Conditions, scope?: Scope}, VersionedObject[]>;
  _load: Invokable<{objects: VersionedObject[], scope?: Scope}, VersionedObject[]>;
  _save: Invokable<VersionedObject[], boolean>;
}

DataSource.operators.set("$eq", (value, expected) => { return  areEquals(value, expected); });
DataSource.operators.set("$ne", (value, expected) => { return !areEquals(value, expected); });
DataSource.operators.set("$gt", (value, expected) => { return value > expected });
DataSource.operators.set("$gte", (value, expected) => { return value >= expected });
DataSource.operators.set("$lt", (value, expected) => { return value < expected });
DataSource.operators.set("$lte", (value, expected) => { return value <= expected });
DataSource.operators.set("$in", (value, values: any[]) => { return values.indexOf(value) !== -1 });
DataSource.operators.set("$nin", (value, values: any[]) => { return values.indexOf(value) === -1 });
DataSource.operators.set("$and", (value, conditions: Conditions[]) => { 
  return conditions.every(c => DataSource.passConditions(value, c));
});
DataSource.operators.set("$or", (value, conditions: Conditions[]) => { 
  return conditions.some(c => DataSource.passConditions(value, c));
});
DataSource.operators.set("$not", (value, conditions: Conditions) => { 
  return !DataSource.passConditions(value, conditions);
});

DataSource.operators.set("$text", (value, conditions: { $search: string }) => { 
  // TODO: fix this very bad quick writing... :)
  return !!Object.keys(value).some(k => k !== '_id' && value && typeof value[k] === "string" && value[k].toLowerCase().indexOf(conditions.$search.toLowerCase()) !== -1);
});
