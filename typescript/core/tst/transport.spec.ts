import {ControlCenter, Identifier, VersionedObject, DataSource, DataSourceQuery, InMemoryDataSource, Invocation, Result, Transport, AspectCache} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

function createContext_C1(publicTransport: (json: string) => Promise<string>) {
  let cc = new ControlCenter(new AspectCache());
  let ret = {
    cc: cc,
    Resource  : Resource  .installAspect(cc, "c1"    ),
    Car       : Car       .installAspect(cc, "c1"    ),
    People    : People    .installAspect(cc, "c1"    ),
    db: new (DataSource.installAspect(cc, "client"))(),
    component: {},
  };
  ret.db.manager().setId('datasource');
  let coder = new Transport.JSONCoder();
  ret.cc.installTransport({
    async remoteCall(to: VersionedObject, method: string, args: any[]): Promise<any> {
      let req = { to: to.id(), method: method, args: args };
      let res = await coder.encode_transport_decode(ret.cc, req, publicTransport);
      let inv = new Result(res);
      return inv;
    }
  });
  return ret;
}

type ContextS1 = { 
  Resource: { new(): Car.Aspects.s1 }, 
  Car: { new(): Car.Aspects.s1 }, 
  People: { new(): People.Aspects.s1 }, 
  db: DataSource.Aspects.server, 
  cc: ControlCenter,
  c0: Car.Aspects.s1,
  c1: Car.Aspects.s1,
  c2: Car.Aspects.s1,
  c3: Car.Aspects.s1,
  p0: People.Aspects.s1,
  p1: People.Aspects.s1,
  p2: People.Aspects.s1,
  component: {},
  publicTransport: (json: string) => Promise<string>
};

function createContext_S1(ds: InMemoryDataSource.DataStore, queries: Map<string, DataSourceQuery>): ContextS1 {
  let ctx: any = {};
  let cc = ctx.cc = new ControlCenter();
  ctx.Resource   = Resource.installAspect(cc, "s1"    );
  ctx.Car        = Car     .installAspect(cc, "s1"    );
  ctx.People     = People  .installAspect(cc, "s1"    );
  ctx.DataSource = InMemoryDataSource.installAspect(cc, "server");

  ctx.db = new ctx.DataSource(ds);
  ctx.db.setQueries(queries);
  ctx.c0 = Object.assign(new ctx.Car(), { _name: "Renault", _model: "Clio 3" });
  ctx.c1 = Object.assign(new ctx.Car(), { _name: "Renault", _model: "Clio 2" });
  ctx.c2 = Object.assign(new ctx.Car(), { _name: "Peugeot", _model: "3008 DKR" });
  ctx.c3 = Object.assign(new ctx.Car(), { _name: "Peugeot", _model: "4008 DKR" });
  ctx.p0 = Object.assign(new ctx.People(), { _name: "Lisa Simpsons" , _firstname: "Lisa" , _lastname: "Simpsons", _birthDate: new Date()  });
  ctx.p1 = Object.assign(new ctx.People(), { _name: "Bart Simpsons" , _firstname: "Bart" , _lastname: "Simpsons", _birthDate: new Date(0) });
  ctx.p2 = Object.assign(new ctx.People(), { _name: "Homer Simpsons", _firstname: "Homer", _lastname: "Simpsons", _birthDate: new Date()  });
  ctx.component = {};
  cc.registerComponent(ctx.component);
  ctx.db.manager().setId('datasource');

  let coder = new Transport.JSONCoder();
  ctx.publicTransport = async (json: string) => {
    let p1 = createContext_S1(ds, queries);
    p1.cc.registerObjects(p1.component, [p1.db]);

    let res = coder.decode_handle_encode(cc, json, async (request) => {
      let to = p1.cc.registeredObject(request.to)!;
      let inv = await Invocation.farPromise(to, request.method, request.args[0]);
      return inv.items();
    });
    return res;
  };
  return ctx;
}

async function distantSave(flux) {
  let ds = new InMemoryDataSource.DataStore();
  let s1 = createContext_S1(ds, new Map());
  let c1 = createContext_C1(s1.publicTransport);

  let c1_c4 = Object.assign(new c1.Car(), { _name: "Renault", _model: "Clio 4" });
  c1.cc.registerComponent(c1.component);
  c1.cc.registerObjects(c1.component, [c1_c4]);

  let inv = await c1.db.farPromise("save", [c1_c4]);
  assert.deepEqual(inv.result(), [c1_c4]);

  c1.cc.unregisterComponent(c1.component);
  flux.continue();
}

let queries = new Map<string, DataSourceQuery>();
queries.set("s1cars", (reporter, q) => {
  return {
    name: "cars",
    where: { $instanceOf: Car },
    scope: ['_name', '_owner'],
  }
});
async function distantQuery(flux) {
  let ds = new InMemoryDataSource.DataStore();
  let s1 = createContext_S1(ds, queries);
  let c1 = createContext_C1(s1.publicTransport);
  s1.cc.registerComponent(s1.component);
  s1.cc.registerObjects(s1.component, [s1.c0, s1.c1, s1.c2, s1.c3, s1.p0, s1.p1, s1.p2]);
  await s1.db.farPromise("rawSave", [s1.c0, s1.c1, s1.c2, s1.c3, s1.p0, s1.p1, s1.p2]);
  
  let inv = await c1.db.farPromise("query", { id: "s1cars" });
  let res = inv.value();
  c1.cc.registerComponent(c1.component);
  c1.cc.registerObjects(c1.component, res["cars"]);
  assert.sameMembers(
    res["cars"].map((vo: Car.Aspects.c1) => `${vo.id()}:${vo.brand()}:${vo.owner()}`), 
    [s1.c0, s1.c1, s1.c2, s1.c3].map((vo: Car.Aspects.c1) => `${vo.id()}:${vo.brand()}:${vo.owner()}`));
  flux.continue();
}


export const tests = { name: 'transport', tests: [
  distantSave,
  distantQuery,
]};
