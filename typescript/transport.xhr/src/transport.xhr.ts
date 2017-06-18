import { FarTransport, VersionedObject, ControlCenter, Transport, Invocation } from '@openmicrostep/aspects';

const coder = new Transport.JSONCoder();
export class XHRTransport implements FarTransport {
  async remoteCall(to: VersionedObject, method: string, args: any[]): Promise<Invocation<any>> {
    let res = await coder.encode_transport_decode(to.controlCenter(), args[0], (arg0) => {
      return new Promise((resolve, reject) => {
        let isVoid = args.length === 0;
        let xhr = new XMLHttpRequest();
        let cc = to.controlCenter();
        xhr.open(isVoid ? "GET" : "POST", this.httpUrl(to, method), true);
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            resolve(xhr.responseText);
          }
        }
        if (!isVoid) {
          xhr.setRequestHeader('Content-Type', 'application/json+mste');
          xhr.send(arg0);
        }
        else
          xhr.send();
      });
    });
    let inv = new Invocation(res.diagnostics, "result" in res, res.result);
    return inv;
  }

  httpUrl(to: VersionedObject, method: string) {
    let def = to.manager().aspect();
    return `${def.version}/${def.name}/${to.id()}/${method}`;
  }
}
