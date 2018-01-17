export * from './deepEqual';
export * from './notificationCenter';
export * from './versionedObject';
export * from './aspect';
export * from './aspect.boot';
export * from './traverse';
export * from './controlCenter';
export * from './invocation';
export * from './result';
export * from './datasource';
export * from './datasource.internal';
export * from './datasource.memory';
export * from './pool';
export {Diagnostic, Reporter, PathReporter} from '@openmicrostep/msbuildsystem.shared';

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
