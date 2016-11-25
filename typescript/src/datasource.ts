import { Identifier, AObject } from './core';

export type Scope = string[];
export type Conditions = Operators | { [s: string]: any };
export type Operators =
  { $eq: any } |
  { $ne: any } |
  { $gte: any } |
  {  $lt: any } |
  { $lte: any } |
  { $in: any[] } |
  { $nin: any[] } |
  { $and: Conditions[] } |
  { $or: Conditions[] } |
  { $not: Conditions } |
  { $exists: boolean } |
  { $type: boolean };

export abstract class DataSource {
  abstract query(objectClass: string, conditions: Conditions, scope: Scope): Promise<AObject[]>;
  abstract load(objects: (AObject | Identifier)[], scope: Scope): Promise<AObject[]>;
  abstract save(objects: AObject[]): Promise<boolean>;
}
