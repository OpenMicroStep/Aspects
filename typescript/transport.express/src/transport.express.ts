import {
  ControlCenter,
  PublicTransport,
  VersionedObject, VersionedObjectConstructor,
  Identifier, Aspect, Invocation, Result,
  PathReporter, Reporter,
} from '@openmicrostep/aspects';
import { Router, Request } from 'express';
import * as bodyparser from 'body-parser';

const fatal_error_result = { is: "result", v: [{ is: "fatal error", msg: `failed to process request` }] };
export class ExpressTransport implements PublicTransport {
  json_middleware: any;

  constructor(
    public app: Router,
    public findObject: (cstor: VersionedObjectConstructor<VersionedObject>, id: Identifier, req: Request) => Promise<VersionedObject>,
    options?: { body_limit: number }) {
    this.json_middleware = bodyparser.json({ limit:(options?options.body_limit:100000) });
  }

  installMethod(cstor: VersionedObjectConstructor<VersionedObject>, method: Aspect.InstalledMethod) {
    let path = `/${cstor.definition.version}/${cstor.definition.name}/:id/${method.name}`;
    let arg0Type = method.argumentTypes.length === 1 ? method.argumentTypes[0] : undefined;
    let returnType = new Aspect.Type.ResultType(method.returnType || Aspect.Type.voidType);
    console.info('GET:', path);
    if (arg0Type)
      this.app.use(path, this.json_middleware);
    this.app[!arg0Type ? "get" : "post"](path, (req, res) => {
      res.set('Content-Type', 'application/json');
      let id = req.params.id;
      this.findObject(cstor, /^[0-9]+$/.test(id) ? parseInt(id) : id, req).then(entity => entity.controlCenter().safe(async ccc => {
        let reporter = new Reporter();
        let at = new PathReporter(reporter, method.name, ":", 0);
        let code_ctx = new Aspect.Type.Context(ccc, Aspect.Type.ModeLocation.Parameter);
        let arg0: any = undefined;
        if (arg0Type) {
          arg0 = arg0Type.decode(at, code_ctx, req.body);
          arg0Type.validate(at, arg0);
        }
        let out_result: any;
        let out_status: number;
        code_ctx.location = Aspect.Type.ModeLocation.Return;
        if (reporter.failed) {
          out_result = Aspect.Type.resultType.encode(at, code_ctx, Result.fromReporter(reporter));
          out_status = 400;
        }
        else {
          let inv = await Invocation.farPromise(ccc, { to: entity, method: method.name }, arg0);
          out_result = returnType.encode(at, code_ctx, inv);
          out_status = 200;
          if (reporter.failed) {
            out_status = 501;
            out_result = fatal_error_result;
          }
        }
        res.status(out_status).json(out_result);
      })).catch((error) => {
        console.info(error);
        res.status(501).json(fatal_error_result);
      });
    });
  }
}
