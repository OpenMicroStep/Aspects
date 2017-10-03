import {VersionedObjectCoder, ControlCenter, VersionedObject, DataSource, DataSourceQuery, InMemoryDataSource, Invocation, Result, Transport, AspectConfiguration} from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

function add_common_objects<T extends { cc: ControlCenter }>(ctx: T) {
  let ret = Object.assign(ctx, {
    c0: Object.assign(Car.create(ctx.cc), { _name: "Renault", _model: "Clio 3" }),
    c1: Object.assign(Car.create(ctx.cc), { _name: "Renault", _model: "Clio 2" }),
    c2: Object.assign(Car.create(ctx.cc), { _name: "Peugeot", _model: "3008 DKR" }),
    c3: Object.assign(Car.create(ctx.cc), { _name: "Peugeot", _model: "4008 DKR" }),
    p0: Object.assign(People.create(ctx.cc), { _name: "Lisa Simpsons" , _firstname: "Lisa" , _lastname: "Simpsons", _birthDate: new Date()  }),
    p1: Object.assign(People.create(ctx.cc), { _name: "Bart Simpsons" , _firstname: "Bart" , _lastname: "Simpsons", _birthDate: new Date(0) }),
    p2: Object.assign(People.create(ctx.cc), { _name: "Homer Simpsons", _firstname: "Homer", _lastname: "Simpsons", _birthDate: new Date()  }),
  });
  ret.p0._father = ret.p2;
  ret.p1._father = ret.p2;
  return ret;
}

function createContext_C1(publicTransport: (json: string) => Promise<string>) {
  let coder = new Transport.JSONCoder();
  let default_transport = {
    async remoteCall(to: VersionedObject, method: string, args: any[]): Promise<any> {
      let req = { to: to.id(), method: method, args: args };
      let res = await coder.encode_transport_decode(to.controlCenter(), req, publicTransport);
      let inv = new Result(res);
      return inv;
    }
  };
  let cc = new ControlCenter(new AspectConfiguration([
    Resource.Aspects.c1,
    Car.Aspects.c1,
    People.Aspects.c1,
    DataSource.Aspects.client,
  ], default_transport));
  let ret = {
    cc: cc,
    Resource  : Resource.Aspects.c1.factory(cc),
    Car       : Car.Aspects.c1.factory(cc),
    People    : People.Aspects.c1.factory(cc),
    db: DataSource.Aspects.client.create(cc),
    component: {},
  };
  ret.db.manager().setId('datasource');
  return add_common_objects(ret);
}

type ContextS1 = {
  Resource: { new(): Car.Aspects.s1 },
  Car: { new(): Car.Aspects.s1 },
  People: { new(): People.Aspects.s1 },
  db: DataSource.Aspects.server,
  cc: ControlCenter,
  component: {},
  publicTransport: (json: string) => Promise<string>
};

function createContext_S1(ds: InMemoryDataSource.DataStore, queries: Map<string, DataSourceQuery>) {
  let ctx: any = {};
  let cc = ctx.cc = new ControlCenter(new AspectConfiguration([
    Resource.Aspects.s1,
    Car.Aspects.s1,
    People.Aspects.s1,
    InMemoryDataSource.Aspects.server,
  ]));
  ctx.Resource   = Resource.Aspects.s1.factory(cc);
  ctx.Car        = Car.Aspects.s1.factory(cc);
  ctx.People     = People.Aspects.s1.factory(cc);
  ctx.DataSource = InMemoryDataSource.Aspects.server.factory(cc);

  ctx.db = new ctx.DataSource(ds);
  ctx.db.setQueries(queries);
  ctx.component = {};
  cc.registerComponent(ctx.component);
  ctx.db.manager().setId('datasource');

  let coder = new Transport.JSONCoder();
  ctx.publicTransport = async (json: string) => {
    let p1 = createContext_S1(ds, queries);
    p1.cc.registerObjects(p1.component, [p1.db]);

    let res = coder.decode_handle_encode(cc, json, async (request) => {
      let to = p1.cc.find(request.to)!;
      let inv = await Invocation.farPromise(to, request.method, request.args[0]);
      return inv.items();
    });
    return res;
  };
  return add_common_objects(ctx as ContextS1);
}

async function client_to_server_save(flux) {
  let ds = new InMemoryDataSource.DataStore();
  let s1 = createContext_S1(ds, new Map());
  let c1 = createContext_C1(s1.publicTransport);

  let c1_c4 = Object.assign(new c1.Car(), { _name: "Renault", _model: "Clio 4" });
  c1.cc.registerComponent(c1.component);
  c1.cc.registerObjects(c1.component, [c1_c4, c1.c0, c1.c1, c1.c2, c1.c3, c1.p0, c1.p1, c1.p2]);

  let inv = await c1.db.farPromise("save", [c1_c4, c1.c0, c1.c1, c1.c2, c1.c3, c1.p0, c1.p1, c1.p2]);
  assert.deepEqual(inv.diagnostics(), []);
  assert.deepEqual(inv.value(), [c1_c4, c1.c0, c1.c1, c1.c2, c1.c3, c1.p0, c1.p1, c1.p2]);

  c1.cc.unregisterComponent(c1.component);
  flux.continue();
}

let queries = new Map<string, DataSourceQuery>();
queries.set("s1cars", (reporter, q) => {
  return {
    name: "cars",
    where: { $instanceOf: Car },
    scope: ['_name', '_owner'],
  };
});
async function client_to_server_query(flux) {
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
    ([s1.c0, s1.c1, s1.c2, s1.c3] as any[]).map((vo: Car.Aspects.c1) => `${vo.id()}:${vo.brand()}:${vo.owner()}`));
  flux.continue();
}

async function manual_server_save(flux) {
  let data_out = [
    { is: "Car", real_id: "_localid:300104", local_id: "_localid:300095", version: -1,
      local_attributes: { _name: "Renault", _model: "Clio 4" },
      version_attributes: {} },
    { is: "Car", real_id: "_localid:300105", local_id: "_localid:300088", version: -1,
      local_attributes: { _name: "Renault", _model: "Clio 3" },
      version_attributes: {} },
    { is: "Car", real_id: "_localid:300106", local_id: "_localid:300089", version: -1,
      local_attributes: { _name: "Renault", _model: "Clio 2" },
      version_attributes: {} },
    { is: "Car", real_id: "_localid:300107", local_id: "_localid:300090", version: -1,
      local_attributes: { _name: "Peugeot", _model: "3008 DKR" },
      version_attributes: {} },
    { is: "Car", real_id: "_localid:300108", local_id: "_localid:300091", version: -1,
      local_attributes: { _name: "Peugeot", _model: "4008 DKR" },
      version_attributes: {} },
    { is: "People", real_id: "_localid:300109", local_id: "_localid:300092", version: -1,
      local_attributes: {
        _name: "Lisa Simpsons", _firstname: "Lisa", _lastname: "Simpsons", _birthDate: { is: "date", v: "2017-09-26T15:31:54.422Z" },
        _father: { is: "vo", v: ["People", "_localid:300094"] } },
      version_attributes: {} },
    { is: "People", real_id: "_localid:300110", local_id: "_localid:300093", version: -1,
      local_attributes: {
        _name: "Bart Simpsons", _firstname: "Bart", _lastname: "Simpsons", _birthDate: { is: "date", v: "1970-01-01T00:00:00.000Z" },
        _father: { is: "vo", v: ["People", "_localid:300094"] } },
      version_attributes: {} },
    { is: "People", real_id: "_localid:300111", local_id: "_localid:300094", version: -1,
      local_attributes: {
        _name: "Homer Simpsons", _firstname: "Homer", _lastname: "Simpsons", _birthDate: { is: "date", v: "2017-09-26T15:31:54.422Z" },
        _childrens_by_father: { is: "set", v: [{ is: "vo", v: ["People", "_localid:300092"] }, { is: "vo", v: ["People", "_localid:300093"] }] } },
      version_attributes: {} }];
  let common_attributes = {
    _mother: null,
    _childrens_by_mother: { is: "set", v: [] },
    _cars: { is: "set", v: [] },
    _drivenCars: { is: "set", v: [] },
  };
  let data_res = [
    { is: "Car", real_id: "memory:1", local_id: "_localid:300095", version: 0,
      local_attributes: {},
      version_attributes: { _name: "Renault", _model: "Clio 4", _owner: null, _drivers: { is: "set", v: [] } } },
    { is: "Car", real_id: "memory:2", local_id: "_localid:300088", version: 0,
      local_attributes: {},
      version_attributes: { _name: "Renault", _model: "Clio 3", _owner: null, _drivers: { is: "set", v: [] } } },
    { is: "Car", real_id: "memory:3", local_id: "_localid:300089", version: 0,
      local_attributes: {},
      version_attributes: { _name: "Renault", _model: "Clio 2", _owner: null, _drivers: { is: "set", v: [] } } },
    { is: "Car", real_id: "memory:4", local_id: "_localid:300090", version: 0,
      local_attributes: {},
      version_attributes: { _name: "Peugeot", _model: "3008 DKR", _owner: null, _drivers: { is: "set", v: [] } } },
    { is: "Car", real_id: "memory:5", local_id: "_localid:300091", version: 0,
      local_attributes: {},
      version_attributes: { _name: "Peugeot", _model: "4008 DKR", _owner: null, _drivers: { is: "set", v: [] } } },
    { is: "People", real_id: "memory:6", local_id: "_localid:300092", version: 0,
      local_attributes: {},
      version_attributes: {
        _name: "Lisa Simpsons", _firstname: "Lisa", _lastname: "Simpsons", _birthDate: { is: "date", v: "2017-09-26T15:31:54.422Z" },
        _father: { is: "vo", v: ["People", "memory:7"] }, _childrens_by_father: { is: "set", v: [] }, ...common_attributes } },
    { is: "People", real_id: "memory:8", local_id: "_localid:300093", version: 0,
      local_attributes: {},
      version_attributes: {
        _name: "Bart Simpsons", _firstname: "Bart", _lastname: "Simpsons", _birthDate: { is: "date", v: "1970-01-01T00:00:00.000Z" },
        _father: { is: "vo", v: ["People", "memory:7"] }, _childrens_by_father: { is: "set", v: [] }, ...common_attributes } },
    { is: "People", real_id: "memory:7", local_id: "_localid:300094", version: 0,
      local_attributes: {},
      version_attributes: {
        _name: "Homer Simpsons", _firstname: "Homer", _lastname: "Simpsons", _birthDate: { is: "date", v: "2017-09-26T15:31:54.422Z" },
        _father: null, _childrens_by_father: { is: "set", v: [{ is: "vo", v: ["People", "memory:6"] }, { is: "vo", v: ["People", "memory:8"] }] }, ...common_attributes } }];
  let ds = new InMemoryDataSource.DataStore();
  let s1 = createContext_S1(ds, new Map());
  let c1 = createContext_C1(s1.publicTransport);

  let res = await c1.db.farPromise('distantSave', data_out as any);
  assert.deepEqual(res.diagnostics(), []);
  assert.deepEqual(res.value(), data_res as any);
  flux.continue();
}

export const tests = { name: 'transport', tests: [
  client_to_server_save,
  client_to_server_query,
  manual_server_save,
]};
