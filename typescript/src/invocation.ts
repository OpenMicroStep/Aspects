import { AObject, ControlCenter } from './core';
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

export class Invocation<O extends AObject, R> {
  _receiver: O;
  _method: ControlCenter.Method;
  _argument: any;
  _state: InvocationState;
  _result: R;
  _err: Diagnostic;
  _invoker: (argument, result: (err: Diagnostic | null, ret?: R) => void) => void;

  constructor(receiver: O, method: ControlCenter.Method, argument, invoker: (argument, result: (err: Diagnostic | null, ret?: R) => Invocation<O, R>) => void) {
    this._receiver = receiver;
    this._method = method;
    this._argument = argument;
    this._state = InvocationState.Prepared;
    this._invoker = invoker;
  }

  state() { return this._state; }
  receiver() { return this._receiver; }
  methodName() { return this._method.name; }
  argument() { return this._argument; }

  result() {
    if (this._state === InvocationState.Terminated)
      return this._result;
    throw new Error(`cannot get result of invocation, state is not Terminated`);
  }

  error() {
    if (this._state === InvocationState.Aborted)
      return this._err;
    throw new Error(`cannot get error of invocation, state is not Aborted`);
  }

  invoke(callback: (invocation: Invocation<O, R>) => void) {
    let argValidator = this._method.argumentValidators[0];
    if (argValidator && !argValidator(this._argument))
      throw new Error(`argument is invalid`);
    this._invoker(this._argument, (err, ret) => {
      if (!err && this._method.returnValidator && !this._method.returnValidator(ret))
        err = { is: 'error', reasons: this._method.returnValidator.errors };
      if (err) {
        this._err = err;
        this._state = InvocationState.Aborted;
      }
      else {
        this._result = ret!;
        this._state = InvocationState.Terminated;
      }
      callback(this);
    });
  }
}