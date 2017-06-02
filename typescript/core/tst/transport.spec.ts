import {ControlCenter, Identifier, VersionedObject, DataSource, InMemoryDataSource, Invocation, Transport} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

function createContext_C1() {
  let cc = new ControlCenter();
  let ret = {
    cc: cc,
    Resource  : Resource  .installAspect(cc, "c1"    ),
    Car       : Car       .installAspect(cc, "c1"    ),
    People    : People    .installAspect(cc, "c1"    ),
    db: new (DataSource.installAspect(cc, "client"))(),
    component: {},
  };
  ret.db.manager().setId('datasource');
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
};

function createContext_S1(ds: InMemoryDataSource.DataStore): ContextS1 {
  let ctx: any = {};
  let cc = ctx.cc = new ControlCenter();
  ctx.Resource   = Resource.installAspect(cc, "s1"    );
  ctx.Car        = Car     .installAspect(cc, "s1"    );
  ctx.People     = People  .installAspect(cc, "s1"    );
  ctx.DataSource = InMemoryDataSource.installAspect(cc, "server");

  ctx.db = new ctx.DataSource(ds);
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
  return ctx;
}

async function test1(flux) {
  let ds = new InMemoryDataSource.DataStore();
  let c1 = createContext_C1();
  let s1 = createContext_S1(ds);
  await s1.db.farPromise("rawSave", [s1.c0, s1.c1, s1.c2, s1.c3, s1.p0, s1.p1, s1.p2]);

  let coder = new Transport.JSONCoder();
  let publicTransport = async (json: string) => {
    let p1 = createContext_S1(ds);
    p1.cc.registerObjects(p1.component, [p1.db]);
    let request = JSON.parse(json);
    let to = p1.cc.registeredObject(request.to)!;
    let component = {};
    p1.cc.registerComponent(component);
    let decodedWithLocalId = new Map<VersionedObject, Identifier>();
    let args = coder.decodeWithCC(request.args, p1.cc, component, new Set(), decodedWithLocalId);
    let inv = await to.farPromise(request.method, args[0]);
    let ret = inv.hasResult() 
      ? { result: coder.encodeWithCC(inv.result(), p1.cc, vo => decodedWithLocalId.get(vo) || vo.id()), diagnostics: inv.diagnostics() }
      : { diagnostics: inv.diagnostics() };
    let response = JSON.stringify(ret);
    return response;
  };
  c1.cc.installTransport({
    async remoteCall(to: VersionedObject, method: string, args: any[]): Promise<any> {
      let req = { to: to.id(), method: method, args: args.map(a => coder.encodeWithCC(a, c1.cc)) };
      let request = JSON.stringify(req, null, 2);
      let response = await publicTransport(request);
      let res = JSON.parse(response);
      let component = {};
      c1.cc.registerComponent(component);
      let inv = new Invocation(res.diagnostics, "result" in res, coder.decodeWithCC(res.result, c1.cc, component));
      c1.cc.unregisterComponent(component);
      return inv;
    }
  });
  let c1_c4 = Object.assign(new c1.Car(), { _name: "Renault", _model: "Clio 4" });
  c1.cc.registerComponent(c1.component);
  c1.cc.registerObjects(c1.component, [c1_c4]);
  let inv = await c1.db.farPromise("save", [c1_c4]);
  assert.deepEqual(inv.result(), [c1_c4]);
  c1.cc.unregisterComponent(c1.component);
  flux.continue();
}



export const tests = { name: 'transport', tests: [
  test1,
]};
