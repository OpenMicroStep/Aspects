import { VersionedObject, ControlCenter, NotificationCenter, Aspect } from './core';
import {Reporter, AttributePath} from '@openmicrostep/msbuildsystem.shared';
import { Flux } from '@openmicrostep/async';

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
    if (this._state === InvocationState.Aborted)
      throw this.error();
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
    let path = new AttributePath(method.name, ":");
    let argValidator = method.argumentValidators[0];
    let reporter = new Reporter();
    let result = (err, ret) => {
      if (!err && ret instanceof Invocation) {
        if (ret.state() === InvocationState.Aborted)
          err = ret.error();
        else if (ret.state() === InvocationState.Terminated)
          ret = ret.result();
      }
      if (!err && method.returnValidator)
        ret = validateValue(ret, path.set("ret"), method.returnValidator);
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

    let arg = argValidator ? validateValue(this._argument, path.set(0), argValidator) : undefined;
    method.transport.remoteCall(this._receiver, this._method, argValidator ? [arg]: [])
        .then((ret) => result(null, ret))
        .catch((err) => result(err, null))
  }
}

function validateValue(value, path: AttributePath, validator: Aspect.TypeValidator) {
  let reporter = new Reporter();
  value = validator.validate(reporter, path, value);
  if (reporter.diagnostics.length > 0)
    throw new Error(`${path} value is invalid: ${JSON.stringify(reporter.diagnostics, null, 2)}`);
  return value;
}