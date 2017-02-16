import { PublicTransport, ControlCenter, VersionedObject, Identifier, Aspect } from '@microstep/aspects';
import { Router } from 'express';
import * as bodyparser from 'body-parser';
import { MSTE } from '@microstep/mstools';

const text_middleware = bodyparser.text({type: () => true });

export class ExpressTransport implements PublicTransport {
  app: Router;
  findObject: (aspect: Aspect.Installed, id: Identifier) => Promise<VersionedObject>;

  constructor(app: Router, findObject: (aspect: Aspect.Installed, id: Identifier) => Promise<VersionedObject>) {
    this.app = app;
    this.findObject = findObject;
  }

  register(controlCenter: ControlCenter, aspect: Aspect.Installed, localMethod: Aspect.Method, localImpl: (...args) => Promise<any>) {
    let path = `/${aspect.version}/${aspect.name}/:id/${localMethod.name}`;
    let isA0Void = localMethod.argumentTypes.length === 0;
    let isRVoid = localMethod.returnType === "void";
    console.info('GET:', path);
    if (!isA0Void)
      this.app.use(path, text_middleware);
    this.app[isA0Void ? "get" : "post"](path, (req, res) => {
      let id = req.params.id;
      this.findObject(aspect, /^[0-9]+$/.test(id) ? parseInt(id) : id).then((entity) => {
        if (!isA0Void)
          return localImpl.call(entity, this.decode(req.body));
        else
          return localImpl.call(entity);
      }).then((result) => {
        res.status(200).send(this.encode(result));
      }).catch((error) => {
        console.info(error);
        res.status(400).send(error.message);
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
