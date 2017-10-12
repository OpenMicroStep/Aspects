import { VersionedObject, ControlCenter, NotificationCenter, Aspect, Result } from './core';
import {Reporter, AttributePath, Diagnostic} from '@openmicrostep/msbuildsystem.shared';
import { Flux } from '@openmicrostep/async';

export type Invokable<A, R> = ((a: A) => R) | ((a: A) => Promise<R>) | ((f: Flux<{}>, a: A) => void);
export namespace Invocation {
  export function farEvent<O extends VersionedObject, R>(receiver: O, method: string, argument, eventName: string, onObject?: Object) {
    Invocation.farCallback(receiver, method, argument, (invocation) => {
      receiver.manager().controlCenter().notificationCenter().postNotification({
        name: eventName,
        object: onObject || receiver,
        info: invocation
      })
    });
  }
  export function farPromise<O extends VersionedObject, R>(receiver: O, method: string, argument) : Promise<Result<R>> {
    return new Promise((resolve) => { Invocation.farCallback(receiver, method, argument, resolve); });
  }
  export function farAsync<O extends VersionedObject, R>(flux: Flux<{ envelop: Result<R> }>, receiver: O, method: string, argument) {
    Invocation.farCallback<O, R>(receiver, method, argument, (invocation) => {
      flux.context.envelop = invocation;
      flux.continue();
    });
  }

  export function farCallback<O extends VersionedObject, R>(receiver: O, method: string, argument, callback: (invocation: Result<R>) => void) {
    const reporter = new Reporter();
    let hasResult = false;
    let ret: any = undefined;
    const exit = () => {
      let result: Result | undefined = undefined;
      if (ret instanceof Result) {
        result = ret;
        hasResult = ret.hasValues();
        ret = ret.hasOneValue() ? ret.value() : ret.values();
      }
      if (hasResult && farMethod && farMethod.returnValidator) {
        let nb = reporter.diagnostics.length;
        ret = farMethod.returnValidator.validate(reporter, new AttributePath(farMethod.name, ":return"), ret);
        hasResult = nb === reporter.diagnostics.length; // no new diagnostic
      }
      let items: Result.Item[] = reporter.diagnostics;
      if (!reporter.failed && result) // if reporter failed, we can't trust result items
        items.push(...result.items());
      else if (!reporter.failed && hasResult)
        items.push({ is: "value", value: ret });
      callback(new Result<R>(items));
    };
    reporter.transform.push((d) => { d.is = "error"; return d; });

    let manager = receiver.manager();
    let farMethod = manager.aspect().farMethods.get(method);
    if (!farMethod)
      reporter.diagnostic({ is: "error", msg: `method ${method} doesn't exists on ${manager.name()}` });
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
              reporter.diagnostic({ is: "error", msg: `unknown error` });
            exit();
          })
        return;
      }
    }
    exit();
  }
}
