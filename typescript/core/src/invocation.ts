import { VersionedObject, ControlCenter, NotificationCenter } from './core';
import { Flux } from '@microstep/async';

export enum InvocationState {
  Prepared,
  Waiting,
  Terminated,
  Aborted
}

export interface Diagnostic {
  is: 'error';
  reasons: any[];
}

export type Invokable<A, R> = ((a: A) => R) | ((a: A) => Promise<R>) | ((f: Flux<{}>, a: A) => void);
export class Invocation<O extends VersionedObject, R> {
  _receiver: O;
  _method: string;
  _argument: any;
  _state: InvocationState;
  _result: R;
  _diag: Diagnostic;

  constructor(receiver: O, method: string, argument) {
    this._receiver = receiver;
    this._method = method;
    this._argument = argument;
    this._state = InvocationState.Prepared;
  }

  state() { return this._state; }
  receiver() { return this._receiver; }
  methodName() { return this._method; }
  argument() { return this._argument; }

  result() {
    if (this._state === InvocationState.Terminated)
      return this._result;
    throw new Error(`cannot get result of invocation, state is not Terminated`);
  }

  error() {
    if (this._state === InvocationState.Aborted)
      return this._diag;
    throw new Error(`cannot get error of invocation, state is not Aborted`);
  }

  farEvent(eventName: string, onObject?: Object) {
    this.farCallback((invocation) => {
      this._receiver.manager().controlCenter().notificationCenter().postNotification({
        name: eventName,
        object: onObject || this,
        info: { invocation: invocation }
      })
    });
  }
  farPromise<I extends Invocation<any, any>>() : Promise<I> {
    return new Promise((resolve) => { this.farCallback(resolve); });
  }
  farAsync(flux: Flux<{ envelop: Invocation<O, R> }>) {
    this.farCallback((invocation) => {
      flux.context.envelop = invocation;
      flux.continue();
    });
  }

  farCallback(callback: (invocation: Invocation<O, R>) => void) {
    let manager = this._receiver.manager();
    let m = manager.aspect().farMethods.get(this._method);
    if (!m)
      throw new Error(`method ${this._method} doesn't exists on ${manager.name()}`);
    let method = m;
    let argValidator = method.argumentValidators[0];
    let result = (err, ret) => {
      if (!err && ret instanceof Invocation) {
        if (ret.state() === InvocationState.Aborted)
          err = ret.error();
        else if (ret.state() === InvocationState.Terminated)
          ret = ret.result();
      }
      if (!err && method.returnValidator && !method.returnValidator(ret))
        err = { is: 'error', reasons: method.returnValidator.errors };
      if (err) {
        this._diag = err;
        this._state = InvocationState.Aborted;
      }
      else {
        this._result = ret;
        this._state = InvocationState.Terminated;
      }
      callback(this);
    };

    if (argValidator && !argValidator(this._argument))
      throw new Error(`argument is invalid`);
    method.transport.remoteCall(manager.controlCenter(), this._receiver, this._method, this._argument ? [this._argument]: [])
        .then((ret) => result(null, ret))
        .catch((err) => result(err, null))
  }
}