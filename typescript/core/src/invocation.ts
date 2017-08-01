import { VersionedObject, ControlCenter, NotificationCenter, Aspect } from './core';
import {Reporter, AttributePath, Diagnostic} from '@openmicrostep/msbuildsystem.shared';
import { Flux } from '@openmicrostep/async';

export enum InvocationState {
  Terminated = 1,
  TerminatedWithDiagnostics = 1 | 2,
  Aborted = 2,
}

export type Invokable<A, R> = ((a: A) => R) | ((a: A) => Promise<R>) | ((f: Flux<{}>, a: A) => void);
export class Invocation<R> {
  _state: InvocationState;
  _result: R;
  _diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[], hasResult: boolean, result: R) {
    this._state = 0;
    this._result = result;
    this._diagnostics = diagnostics;
    if (hasResult)
      this._state |= InvocationState.Terminated;
    if (diagnostics.length > 0)
      this._state |= InvocationState.Aborted;
  }

  state() { return this._state; }

  hasResult(): boolean {
    return (this._state & InvocationState.Terminated) === InvocationState.Terminated;
  }

  result() {
    if (this.hasResult())
      return this._result;
    if (this.hasDiagnostics())
      throw this.diagnostics();
    throw new Error(`cannot get result of invocation, state is not Terminated`);
  }

  hasDiagnostics(): boolean {
    return (this._state & InvocationState.Aborted) === InvocationState.Aborted;
  }
  diagnostics() {
    return this._diagnostics;
  }

  static farEvent<O extends VersionedObject, R>(receiver: O, method: string, argument, eventName: string, onObject?: Object) {
    Invocation.farCallback(receiver, method, argument, (invocation) => {
      receiver.manager().controlCenter().notificationCenter().postNotification({
        name: eventName,
        object: onObject || receiver,
        info: invocation
      })
    });
  }
  static farPromise<O extends VersionedObject, R>(receiver: O, method: string, argument) : Promise<Invocation<R>> {
    return new Promise((resolve) => { Invocation.farCallback(receiver, method, argument, resolve); });
  }
  static farAsync<O extends VersionedObject, R>(flux: Flux<{ envelop: Invocation<R> }>, receiver: O, method: string, argument) {
    Invocation.farCallback<O, R>(receiver, method, argument, (invocation) => {
      flux.context.envelop = invocation;
      flux.continue();
    });
  }

  static farCallback<O extends VersionedObject, R>(receiver: O, method: string, argument, callback: (invocation: Invocation<R>) => void) {
    const reporter = new Reporter();
    let hasResult = false;
    let ret: any = undefined;
    const exit = () => {
      if (!reporter.failed && ret instanceof Invocation) {
        if (ret.hasDiagnostics())
          reporter.diagnostics.push(...ret.diagnostics());
        if ((hasResult = ret.hasResult()))
          ret = ret.result();
      }
      if (hasResult && farMethod && farMethod.returnValidator) {
        let nb = reporter.diagnostics.length;
        ret = farMethod.returnValidator.validate(reporter, new AttributePath(farMethod.name, ":return"), ret);
        hasResult = nb === reporter.diagnostics.length; // no new diagnostic
      }
      callback(new Invocation<R>(reporter.diagnostics, hasResult, ret));
    };
    reporter.transform.push((d) => { d.type = "error"; return d; });

    let manager = receiver.manager();
    let farMethod = manager.aspect().farMethods.get(method);
    if (!farMethod)
      reporter.diagnostic({ type: "error", msg: `method ${method} doesn't exists on ${manager.name()}` });
    else {
      let argValidator = farMethod.argumentValidators[0];
      let arg = argValidator ? argValidator.validate(reporter, new AttributePath(farMethod.name, ":", 0), argument) : undefined;
      if (!reporter.failed) {
        farMethod.transport.remoteCall(receiver, method, argValidator ? [arg]: [])
          .then((result) => { hasResult = true; ret = result; exit(); })
          .catch((err) => {
            if (err)
              reporter.error(err);
            else
              reporter.diagnostic({ type: "error", msg: `unknown error` });
            exit(); 
          })
        return;
      }
    }
    exit();
  }
}