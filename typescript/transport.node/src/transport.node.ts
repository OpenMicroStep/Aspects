import { FarTransport, VersionedObject, ControlCenter, Result, Aspect } from '@openmicrostep/aspects';
import * as http from 'http';
import * as https from 'https';
import * as URL from 'url';

export class NodeReqTransport implements FarTransport {
  url: string;
  constructor({url}: {url: string}) {
    this.url = url;
  }
  async remoteCall(ccc, to: VersionedObject, method: Aspect.InstalledFarMethod, args: any[]): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      let isVoid = args.length === 0;
      const u = URL.parse(this.httpUrl(to, method.name));
      let options: http.RequestOptions = {
        protocol:u.protocol,
        hostname:u.hostname,
        path: u.path,
        port: u.port ? +u.port : undefined,
        method: isVoid ? "GET" : "POST",
        headers: isVoid ? {} : { 'Content-Type': 'application/json' }
      };

      let req: http.ClientRequest;
      let handler = (res: http.IncomingMessage) => {
        let data = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('error', (err) => {
          console.error(`problem with res: ${err.message}`);
          reject(err)
        });
        res.on('end', () => {
          resolve(JSON.parse(data));
        });
      };
      switch (u.protocol) {
        case 'https:': req = https.request(options, handler); break;
        case 'http:': req = http.request(options, handler); break;
        default: throw new Error(`unsupported protocol`);
      }
      req.on('error', (err) => {
        console.error(`problem with request: ${err.message}`);
        reject(err)
      });

      if (!isVoid) {
        req.setHeader('Content-Type', 'application/json');
        req.end(JSON.stringify(args[0]));
      }
      else {
        req.end() ;
      }
    });
  }

  httpUrl(to: VersionedObject, method: string) {
    let def = to.manager().aspect();
    return `${this.url}/${def.version}/${def.classname}/${to.id()}/${method}`;
  }
}
