export * from './deepEqual';
export * from './notificationCenter';
export * from './versionedObject';
export * from './aspect';
export * from './controlCenter';
export * from './invocation';
export {DataSource, DataSourceConstructor} from '../../../generated/aspects.interfaces';
export * from './datasource';
export * from './datasource.memory';
export interface ImmutableList<T> extends ReadonlyArray<T> {

}
export interface ImmutableSet<T> extends ReadonlySet<T> {
  [Symbol.iterator](): IterableIterator<T>;
  entries(): IterableIterator<[T, T]>;
  keys(): IterableIterator<T>;
  values(): IterableIterator<T>;
}
export interface ImmutableMap<K, V> extends ReadonlyMap<K, V> {
  [Symbol.iterator](): IterableIterator<[K, V]>;
  entries(): IterableIterator<[K, V]>;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
}
export type ImmutableObject<T> = {
  readonly [P in keyof T]: ImmutableObject<T[P]>;
}
