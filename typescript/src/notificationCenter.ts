
export interface Notification {
  name: string;
  object: Object;
  info?: any
}

export class NotificationCenter {
  // TODO: move to a more efficient way to store/use observers
  _observers: { observer: Object, method: string, event: string | null, onObject: Object | null }[];
  addObserver(observer: Object, method: string, event: string | null, onObject: Object | null) {
    this._observers.push({ observer: observer, method: method, event: event, onObject: onObject });
  }

  removeObserver(observer: Object, event: string | null = null, onObject: Object | null = null) {
    this._observers = this._observers.filter(o => !(
      o.observer === observer &&
      (event === null || o.event === event) &&
      (onObject === null || o.onObject === onObject)
    ));
  }

  postNotification(notification: Notification) {
    this._observers.filter(o => !(
      (o.event === null || o.event === notification.name) &&
      (o.onObject === null || o.onObject === notification.object)
    )).forEach(o => o[o.method](notification));
  }
}
