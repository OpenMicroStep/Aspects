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
      reporter.transform.push((d) => { d.is = "error"; return d; });

      let manager = receiver.manager();
      let farMethod = manager.aspect().farMethods.get(method);

      const exit = (result: Result | undefined = undefined) => {
        let items: Result.Item[] = reporter.diagnostics;
        if (!reporter.failed && result) // if reporter failed, we can't trust result items
          items.push(...result.items());
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
          let far_method = farMethod;
          farMethod.transport.remoteCall(ctx, receiver, farMethod, args)
            .then(async (result) : Promise<void> => {
              let returnType = far_method.returnType || Aspect.Type.voidType;
              let at = new PathReporter(reporter, farMethod!.name, ":return");
              let ret: Result | undefined = undefined;
              let s = reporter.snapshot();
              if (!far_method.transport.manual_coding) {
                let resultType = new Aspect.Type.ResultType(returnType);
                code_ctx.location = Aspect.Type.ModeLocation.Return;
                let retType = resultType.canDecode(result) ? resultType : returnType;
                result = retType.decode(at, code_ctx, result);
                if (Aspect.Type.mustFinalizeDecode(code_ctx))
                  await Aspect.Type.finalizeDecode(code_ctx, ccc.controlCenter().defaultDataSource());
              }
              if (!reporter.hasChanged(s)) {
                if (result instanceof Result)
                  ret = result;
                else if (returnType !== Aspect.Type.voidType || result !== undefined)
                  ret = Result.fromValue(result);
                if (ret) {
                  for (let value of ret.values()) {
                    returnType.validate(at, value);
                  }
                }
                if (reporter.hasChanged(s))
                  ret = undefined;
              }
              exit(ret);
            })
            .catch((err) => {
              if (err)
                reporter.error(err);
              else
                reporter.diagnostic({ is: "error", msg: `unknown error` });
              exit();
            });
          return;
        }
      }
      exit();
    });
  }
}
