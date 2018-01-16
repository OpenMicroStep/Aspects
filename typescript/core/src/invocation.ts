import { Aspect, Result, ControlCenterContext } from './core';
import { Reporter, PathReporter } from '@openmicrostep/msbuildsystem.shared';

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
      let code_ctx = new Aspect.Type.Context(ccc, Aspect.Type.ModeLocation.Parameter);
      let { to: receiver, method } = invokable;
      let hasResult = false;
      let ret: any = undefined;
      reporter.transform.push((d) => { d.is = "error"; return d; });

      let manager = receiver.manager();
      let farMethod = manager.aspect().farMethods.get(method);

      const exit = () => {
        let result: Result | undefined = undefined;
        if (farMethod) {
          let at = new PathReporter(reporter, farMethod.name, ":return");
          if (hasResult && farMethod.returnType && !farMethod.transport.manual_coding) {
            let s = reporter.snapshot();
            let resultType = new Aspect.Type.ResultType(farMethod.returnType);
            code_ctx.location = Aspect.Type.ModeLocation.Return;
            if (resultType.canDecode(ret))
              ret = resultType.decode(at, code_ctx, ret);
            else
              ret = farMethod.returnType.validate(at, ret);
            // TODO: async finalize decode
            hasResult = !reporter.hasChanged(s);
          }
          if (ret instanceof Result) {
            result = ret;
            hasResult = ret.hasValues();
            ret = ret.hasOneValue() ? ret.value() : ret.values();
          }
          if (hasResult && farMethod.returnType) {
            let s = reporter.snapshot();
            farMethod.returnType.validate(at, ret);
            hasResult = !reporter.hasChanged(s);
          }
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
        let args: any[] = [];
        if (farMethod.argumentTypes.length > 0) {
          let argValidator = farMethod.argumentTypes[0];
          let at = new PathReporter(reporter, farMethod.name, ":", 0);
          argValidator.validate(at, a0);
          if (!farMethod.transport.manual_coding) {
            code_ctx.location = Aspect.Type.ModeLocation.Parameter;
            a0 = argValidator.encode(at, code_ctx, a0);
          }
          args.push(a0);
        }
        if (!reporter.failed) {
          let ctx = { context: { ccc, ...ccc.controlCenter().defaultContext() } };
          farMethod.transport.remoteCall(ctx, receiver, farMethod, args)
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
