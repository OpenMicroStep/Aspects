import { PublicTransport, ControlCenter, VersionedObject, Identifier } from '@microstep/aspects';
import { Router } from 'express';
import * as bodyparser from 'body-parser';
import { MSTE } from '@microstep/mstools';

const text_middleware = bodyparser.text({type: () => true });

export class ExpressTransport implements PublicTransport {
  app: Router;
  findObject: (aspect: ControlCenter.Aspect, id: Identifier) => Promise<VersionedObject>;

  constructor(app: Router, findObject: (aspect: ControlCenter.InstalledAspect, id: Identifier) => Promise<VersionedObject>) {
    this.app = app;
    this.findObject = findObject;
  }

  register(controlCenter: ControlCenter, aspect: ControlCenter.InstalledAspect, localMethod: ControlCenter.Method, localImpl: (...args) => Promise<any>) {
    let path = `/${aspect.definition.version}/${aspect.definition.name}/:id/${localMethod.name}`;
    let isVoid = localMethod.argumentTypes.length === 0;
    console.info('GET:', path);
    if (!isVoid)
      this.app.use(path, text_middleware);
    this.app[isVoid ? "get" : "post"](path, (req, res) => {
      let id = req.params.id;
      this.findObject(aspect, /^[0-9]+$/.test(id) ? parseInt(id) : id).then((entity) => {
        if (!isVoid)
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
