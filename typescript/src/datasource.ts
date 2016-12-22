import { controlCenter, Identifier, VersionedObject, FarImplementation, areEquals, Invocation, Invokable } from './core';
import * as interfaces from '../../generated/aspects.interfaces';
export * from '../../generated/aspect.server.interfaces';
export const DataSource = interfaces.DataSource;
export type DataSource = interfaces.DataSource;
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

export const operators = new Map<string, (value, options) => boolean>();
export function passConditions(value, conditions: Conditions): boolean {
  for (var k in conditions) {
    let operator = operators.get(k);
    if (operator) {
      if (!operator(value, conditions[k]))
        return false;
    }
    else if(k in value) {
      if (!passConditions(value[k], conditions[k]))
        return false;
    }
    else {
      return false;
    }
  }
  return true;
}

interfaces.DataSource.category('core', {
  /// category core 
  filter(objects: VersionedObject[], conditions: Conditions): VersionedObject[] {
    return objects.filter(o => passConditions(o, conditions));
  }
});
interfaces.DataSource.category('db', {
  /// far category db
  query(q: {conditions: Conditions, scope?: Scope}): Promise<VersionedObject[]> {
    return this.farPromise("_query", { conditions: q.conditions, scope: q.scope || [] }).then(i => i.result());
  },
  load(l: {objects: VersionedObject[], scope?: Scope}): Promise<VersionedObject[]> {
    return this.farPromise("_load", { objects: l.objects, scope: l.scope || [] }).then(i => i.result());
  },
  save(objects: VersionedObject[]): Promise<VersionedObject[]> { 
    return this.farPromise("_save", objects).then(i => i.result());
  },
});

operators.set("$eq", (value, expected) => { return  areEquals(value, expected); });
operators.set("$ne", (value, expected) => { return !areEquals(value, expected); });
operators.set("$gt", (value, expected) => { return value > expected });
operators.set("$gte", (value, expected) => { return value >= expected });
operators.set("$lt", (value, expected) => { return value < expected });
operators.set("$lte", (value, expected) => { return value <= expected });
operators.set("$in", (value, values: any[]) => { return values.indexOf(value) !== -1 });
operators.set("$nin", (value, values: any[]) => { return values.indexOf(value) === -1 });
operators.set("$and", (value, conditions: Conditions[]) => { 
  return conditions.every(c => passConditions(value, c));
});
operators.set("$or", (value, conditions: Conditions[]) => { 
  return conditions.some(c => passConditions(value, c));
});
operators.set("$not", (value, conditions: Conditions) => { 
  return !passConditions(value, conditions);
});

operators.set("$text", (value, conditions: { $search: string }) => { 
  // TODO: fix this very bad quick writing... :)
  return !!Object.keys(value).some(k => k !== '_id' && value && typeof value[k] === "string" && value[k].toLowerCase().indexOf(conditions.$search.toLowerCase()) !== -1);
});
