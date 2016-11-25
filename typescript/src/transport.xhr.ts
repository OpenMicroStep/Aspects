import {FarTransport, AObject, ControlCenter} from '@microstep/aspects';
import { MSTE } from '@microstep/mstools';

class XHRTransport implements FarTransport {
  remoteCall<T>(controlCenter: ControlCenter, to: AObject, method: string, args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.open(this.httpMethod(to, method), this.httpUrl(to, method), true);
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4) {
                if (xhr.status >= 200 && xhr.status < 300)
                    resolve(controlCenter.mergeEntities(this.decode(xhr.responseText)));
                else
                    reject(this.decode(xhr.responseText));
            }
        }
        xhr.send(this.encode(args[0]));
    });
  }

  httpMethod(to: AObject, method: string) {
      return "GET";
  }

  httpUrl(to: AObject, method: string) {
      let def = to.manager().definition();
      return `${def.version}/${def.name}/${to.id()}/${method}`;
  }

  encode(value): any {
    return MSTE.stringify(value);
  }

  decode(value): any {
    return MSTE.parse(value);
  }
}