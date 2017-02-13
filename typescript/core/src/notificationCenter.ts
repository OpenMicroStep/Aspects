
export interface Notification {
  name: string;
  object: Object;
  info?: any
}

export class NotificationCenter {
  // TODO: move to a more efficient way to store/use observers
  _observers: { observer: Object, method: string, event: string | undefined, onObject: Object | undefined }[] = [];
  addObserver(observer: Object, method: string, event: string | undefined, onObject: Object | undefined) {
    this._observers.push({ observer: observer, method: method, event: event, onObject: onObject });
  }

  removeObserver(observer: Object, event: string | undefined = undefined, onObject: Object | undefined = undefined) {
    this._observers = this._observers.filter(o => !(
      o.observer === observer &&
      (event === undefined || o.event === event) &&
      (onObject === undefined || o.onObject === onObject)
    ));
  }

  postNotification(notification: Notification) {
    this._observers.filter(o => (
      (o.event === undefined || o.event === notification.name) &&
      (o.onObject === undefined || o.onObject === notification.object)
    )).forEach(o => o.observer[o.method](notification));
  }
}
