import { FarTransport, VersionedObject, Transport, Result } from '@openmicrostep/aspects';

const coder = new Transport.JSONCoder();
export class XHRTransport implements FarTransport {
  async remoteCall(ccc, to: VersionedObject, method: string, args: any[]): Promise<Result<any>> {
    let res = await coder.encode_transport_decode(ccc, args[0], (arg0) => {
      return new Promise((resolve, reject) => {
        let isVoid = args.length === 0;
        let xhr = new XMLHttpRequest();
        xhr.open(isVoid ? "GET" : "POST", this.httpUrl(to, method), true);
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            resolve(xhr.responseText);
          }
        };
        if (!isVoid) {
          xhr.setRequestHeader('Content-Type', 'application/json+mste');
          xhr.send(arg0);
        }
        else
          xhr.send();
      });
    });
    // TODO: validate res data
    let inv = new Result(res);
    return inv;
  }

  httpUrl(to: VersionedObject, method: string) {
    let def = to.manager().aspect();
    return `${def.version}/${def.name}/${to.id()}/${method}`;
  }
}
