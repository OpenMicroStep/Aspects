import {FarTransport, VersionedObject, ControlCenter} from '@microstep/aspects';
import { MSTE } from '@microstep/mstools';

export class XHRTransport implements FarTransport {
  remoteCall<T>(controlCenter: ControlCenter, to: VersionedObject, method: string, args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
        var isVoid = args.length === 0;
        var xhr = new XMLHttpRequest();
        xhr.open(isVoid ? "GET" : "POST", this.httpUrl(to, method), true);
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4) {
                if (xhr.status >= 200 && xhr.status < 300) 
                    resolve(this.decode(controlCenter, xhr.responseText));
                else
                    reject(this.decode(controlCenter, xhr.responseText));
            }
        }
        if (!isVoid) {
            xhr.setRequestHeader('Content-Type', 'application/json+mste');
            xhr.send(this.encode(args[0]));
        }
        else
            xhr.send();
    });
  }

  httpMethod(to: VersionedObject, method: string) {
      return "GET";
  }

  httpUrl(to: VersionedObject, method: string) {
      let def = to.manager().definition();
      return `${def.version}/${def.name}/${to.id()}/${method}`;
  }

  encode(value): any {
    return MSTE.stringify(value);
  }

  decode(controlCenter: ControlCenter, value): any {
    let ret;
    let classes = {};
    controlCenter._aspectsByName.forEach((a, n) => classes[n] = a.implementation);
    VersionedObject.willConstructObjects(( ) => {
      ret = MSTE.parse(value, { classes: classes });
    }, controlCenter.managerFactory()).forEach(o => controlCenter.mergeObject(o));
    return ret;
  }
}