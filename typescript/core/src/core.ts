export * from './validation';
export * from './deepEqual';
export * from './notificationCenter';
export * from './aspect';
export * from './versionedObject';
export * from './controlCenter';
export * from './invocation';
export * from './result';
export * from './datasource';
export * from './datasource.transport';
export * from './datasource.internal';
export * from './datasource.memory';
export * from './transport';
export * from './pool';
export {Diagnostic, Reporter} from '@openmicrostep/msbuildsystem.shared';

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
