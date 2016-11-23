import {FarTransport, Entity, ControlCenter} from './index';

class XHRTransport implements FarTransport {
  remoteCall<T>(controlCenter: ControlCenter, to: Entity, method: string, args: any[]): Promise<T> {
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

  httpMethod(to: Entity, method: string) {
      return "GET";
  }

  httpUrl(to: Entity, method: string) {
      let def = to.__control.definition();
      return `${def.version}/${def.name}/${to.id()}/${method}`;
  }

  encode(value) : any {

  }

  decode(value) : any {
      
  }
}