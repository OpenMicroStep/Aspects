import { FarTransport, VersionedObject, Result, Aspect } from '@openmicrostep/aspects';

export class XHRTransport implements FarTransport {
  async remoteCall(ccc, to: VersionedObject, method: Aspect.InstalledFarMethod, args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      let isVoid = args.length === 0;
      let xhr = new XMLHttpRequest();
      xhr.open(isVoid ? "GET" : "POST", this.httpUrl(to, method.name), true);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          resolve(JSON.parse(xhr.responseText));
        }
      };
      if (!isVoid) {
        xhr.setRequestHeader('Content-Type', 'application/json+mste');
        xhr.send(JSON.stringify(args[0]));
      }
      else
        xhr.send();
    });
  }

  httpUrl(to: VersionedObject, method: string) {
    let def = to.manager().aspect();
    return `${def.version}/${def.classname}/${to.id()}/${method}`;
  }
}
