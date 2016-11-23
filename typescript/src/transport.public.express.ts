import { PublicTransport, ControlCenter, Entity } from './index';
import { Application } from 'express';

class ExpressTransport implements PublicTransport {
  app: Application;
  register(controlCenter: ControlCenter, definition: ControlCenter.Definition, localMethod: ControlCenter.Method, localImpl: (...args) => Promise<any>) {
    this.app.get(`${definition.version}/${definition.name}/:id/${localMethod.name}`, function (req, res) {
      controlCenter.entityManager.get(req.params.id).then((entity) => {
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

  }

  decode(value): any {

  }
}
