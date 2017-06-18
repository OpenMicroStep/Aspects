import { ControlCenter, PublicTransport, VersionedObject, VersionedObjectConstructor, Identifier, Aspect, Invocation, InvocationState, Transport } from '@openmicrostep/aspects';
import { Router } from 'express';
import * as bodyparser from 'body-parser';

const text_middleware = bodyparser.text({type: () => true });

const coder = new Transport.JSONCoder();
export class ExpressTransport implements PublicTransport {
  app: Router;
  findObject: (cstor: VersionedObjectConstructor<VersionedObject>, id: Identifier) => Promise<VersionedObject>;

  constructor(app: Router, findObject: (cstor: VersionedObjectConstructor<VersionedObject>, id: Identifier) => Promise<VersionedObject>) {
    this.app = app;
    this.findObject = findObject;
  }

  installMethod(cstor: VersionedObjectConstructor<VersionedObject>, method: Aspect.InstalledMethod) {
    let path = `/${cstor.definition.version}/${cstor.definition.name}/:id/${method.name}`;
    let isA0Void = method.argumentTypes.length === 0;
    let isRVoid = method.returnType.type === "void";
    console.info('GET:', path);
    if (!isA0Void)
      this.app.use(path, text_middleware);
    this.app[isA0Void ? "get" : "post"](path, (req, res) => {
      let id = req.params.id;
      this.findObject(cstor, /^[0-9]+$/.test(id) ? parseInt(id) : id).then(async (entity) => {
        let cc = entity.controlCenter();
        let inv: Invocation<any> | undefined;
        let json = await coder.decode_handle_encode(cc, isA0Void ? undefined : req.body, async (decoded) => {
          inv = await Invocation.farPromise(entity, method.name, decoded);
          let ret = inv.hasResult() 
          ? { result: inv.result(), diagnostics: inv.diagnostics() }
          : { diagnostics: inv.diagnostics() };
          return ret;
        });
        res.set('Content-Type', 'application/json');
        res.status(inv && inv.hasDiagnostics() ? 400 : 200);
        res.send(json);
      }).catch((error) => {
        console.info(error);
        res.status(501).send(error);
      });
    });
  }
}
