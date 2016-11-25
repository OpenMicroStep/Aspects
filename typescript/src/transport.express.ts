import { PublicTransport, ControlCenter, AObject, Identifier } from './core';
import { Application } from 'express';
import { MSTE } from '@microstep/mstools';

class ExpressTransport implements PublicTransport {
  app: Application;
  findObject: (aspect: ControlCenter.Aspect, id: Identifier) => Promise<AObject>;

  constructor(app: Application, findObject: (aspect: ControlCenter.Aspect, id: Identifier) => Promise<AObject>) {
    this.app = app;
    this.findObject = findObject;
  }

  register(controlCenter: ControlCenter, aspect: ControlCenter.Aspect, localMethod: ControlCenter.Method, localImpl: (...args) => Promise<any>) {
    this.app.get(`${aspect.definition.version}/${aspect.definition.name}/:id/${localMethod.name}`, (req, res) => {
      this.findObject(aspect, req.params.id).then((entity) => {
        return localImpl.call(entity, this.decode(req.body));
      }).then((result) => {
        res.send(this.encode(result));
        res.end();
      }).catch((error) => {
        res.send(400);
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
