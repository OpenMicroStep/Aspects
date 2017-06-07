import { FarTransport, VersionedObject, ControlCenter, Transport, Invocation } from '@openmicrostep/aspects';

const coder = new Transport.JSONCoder();
export class XHRTransport implements FarTransport {
  remoteCall<T>(to: VersionedObject, method: string, args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
      let isVoid = args.length === 0;
      let xhr = new XMLHttpRequest();
      let cc = to.controlCenter();
      xhr.open(isVoid ? "GET" : "POST", this.httpUrl(to, method), true);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          let res = JSON.parse(xhr.responseText);
          let component = {};
          cc.registerComponent(component);
          let inv = new Invocation(res.diagnostics, "result" in res, coder.decodeWithCC(res.result, cc, component));
          cc.unregisterComponent(component);
          resolve(inv);
        }
      }
      if (!isVoid) {
        xhr.setRequestHeader('Content-Type', 'application/json+mste');
        xhr.send(JSON.stringify(coder.encodeWithCC(args[0], cc)));
      }
      else
        xhr.send();
    });
  }

  httpUrl(to: VersionedObject, method: string) {
    let def = to.manager().aspect();
    return `${def.version}/${def.name}/${to.id()}/${method}`;
  }
}
