
export interface Notification<T = any> {
  name: string;
  object: object;
  info: T
}

export type Event<T> = string & { __type__?: T };

export class NotificationCenter {
  // TODO: move to a more efficient way to store/use observers
  _observers: { observer: object, method: string, event: string | undefined, onObject: Object | undefined }[] = [];

  addObserver<O extends { [K in M]: (notification: Notification) => void }, M extends string>(observer: O, method: M, event: string, onObject: Object | undefined);
  addObserver<O extends { [K in M]: (notification: Notification) => void }, M extends string>(observer: O, method: M, event: string | undefined, onObject: Object);
  addObserver<O extends { [K in M]: (notification: Notification<T>) => void }, M extends string, T>(observer: O, method: M, event: Event<T>, onObject: Object | undefined);
  addObserver<O extends { [K in M]: (notification: Notification) => void }, M extends string>(observer: O, method: M, event: string | undefined, onObject: Object | undefined) {
    this._observers.push({ observer: observer, method: method, event: event, onObject: onObject });
  }

  removeObserver(observer: Object, event: string | undefined = undefined, onObject: Object | undefined = undefined) {
    this._observers = this._observers.filter(o => !(
      o.observer === observer &&
      (event === undefined || o.event === event) &&
      (onObject === undefined || o.onObject === onObject)
    ));
  }

  postNotification(notification: Notification & { name: Event<any> }) {
    this._observers.filter(o => (
      (o.event === undefined || o.event === notification.name) &&
      (o.onObject === undefined || o.onObject === notification.object)
    )).forEach(o => o.observer[o.method](notification));
  }
}
