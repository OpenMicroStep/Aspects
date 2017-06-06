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
        let component = {}
        let cc = entity.controlCenter();
        cc.registerComponent(component);
        let decodedWithLocalId = new Map<VersionedObject, Identifier>();
        let inv = await Invocation.farPromise(entity, method.name, isA0Void ? undefined : coder.decodeWithCC(req.body, cc, component));
        let ret = inv.hasResult() 
          ? { result: coder.encodeWithCC(inv.result(), cc, vo => decodedWithLocalId.get(vo) || vo.id()), diagnostics: inv.diagnostics() }
          : { diagnostics: inv.diagnostics() };
        res.status(inv.hasDiagnostics() ? 400 : 200).json(ret);
      }).catch((error) => {
        console.info(error);
        res.status(501).send(error);
      });
    });
  }
}
