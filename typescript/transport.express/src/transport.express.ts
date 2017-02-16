import { ControlCenter, PublicTransport, VersionedObject, VersionedObjectConstructor, Identifier, Aspect, InvocationState } from '@microstep/aspects';
import { Router } from 'express';
import * as bodyparser from 'body-parser';
import { MSTE } from '@microstep/mstools';

const text_middleware = bodyparser.text({type: () => true });

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
    let isRVoid = method.returnType === "void";
    console.info('GET:', path);
    if (!isA0Void)
      this.app.use(path, text_middleware);
    this.app[isA0Void ? "get" : "post"](path, (req, res) => {
      let id = req.params.id;
      this.findObject(cstor, /^[0-9]+$/.test(id) ? parseInt(id) : id).then((entity) => {
        if (!isA0Void)
          return entity.farPromise(method.name, this.decode(req.body));
        else
          return entity.farPromise(method.name, undefined);
      }).then((envelop) => {
        if (envelop.state() === InvocationState.Terminated)
          res.status(200).send(this.encode(envelop.result()));
        else
          res.status(400).send(envelop.error());
      }).catch((error) => {
        console.info(error);
        res.status(501).send(error);
      });
    });
  }

  encode(value): any {
    return MSTE.stringify(value);
  }

  decode(value): any {
    return MSTE.parse(value);
  }
}
