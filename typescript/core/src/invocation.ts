import { Aspect, Result, ControlCenterContext } from './core';
import { Reporter, AttributePath } from '@openmicrostep/msbuildsystem.shared';

export namespace Invocation {
  export function farEvent<A0, R>(invokable: Aspect.Invokable<A0, R>, a0: A0, eventName: string, onObject?: Object) {
    let cc = invokable.to.controlCenter();
    cc.safe(async ccc => {
      let res = await farPromise(ccc, invokable, a0);
      invokable.to.controlCenter().notificationCenter().postNotification({
        name: eventName,
        object: onObject || invokable.to,
        info: res
      });
    });
  }

  export function farCallback<A0, R>(invokable: Aspect.Invokable<A0, R>, a0: A0, callback: (invocation: Result<R>) => void) {
    invokable.to.controlCenter().safe(async ccc => callback(await farPromise(ccc, invokable, a0)));
  }

  export function farPromise<A0, R>(ccc: ControlCenterContext, invokable: Aspect.Invokable<A0, R>, a0: A0) : Promise<Result<R>> {
    return new Promise((resolve) => {
      const reporter = new Reporter();
      let { to: receiver, method } = invokable;
      let hasResult = false;
      let ret: any = undefined;
      reporter.transform.push((d) => { d.is = "error"; return d; });

      let manager = receiver.manager();
      let farMethod = manager.aspect().farMethods.get(method);

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
        resolve(new Result<R>(items));
      };

      if (!farMethod)
        reporter.diagnostic({ is: "error", msg: `method ${method} doesn't exists on ${manager.classname()}` });
      else {
        let argValidator = farMethod.argumentValidators[0];
        let arg = argValidator ? argValidator.validate(reporter, new AttributePath(farMethod.name, ":", 0), a0) : undefined;
        if (!reporter.failed) {

          farMethod.transport.remoteCall({ context:{ ccc,...ccc.controlCenter().defaultContext() } }, receiver, method, argValidator ? [arg] : [])
            .then(
              (result) => { hasResult = true; ret = result; exit(); },
                (err) => {
                if (err)
                  reporter.error(err);
                else
                  reporter.diagnostic({ is: "error", msg: `unknown error` });
                exit();
              }
            );
          return;
        }
      }
      exit();
    });
  }
}
