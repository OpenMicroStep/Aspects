import { ControlCenterContext, ControlCenter, VersionedObject, DataSource, DataSourceQuery, InMemoryDataSource, Invocation, Result, AspectConfiguration, AspectSelection, Aspect, VersionedObjectManager, FarTransport, Reporter, PathReporter } from '@openmicrostep/aspects';
import {assert} from 'chai';
import './resource';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

function add_common_objects<T>(ccc: ControlCenterContext) {
  let ret = {
    c0: Object.assign(Car.create(ccc), { _name: "Renault", _model: "Clio 3" }),
    c1: Object.assign(Car.create(ccc), { _name: "Renault", _model: "Clio 2" }),
    c2: Object.assign(Car.create(ccc), { _name: "Peugeot", _model: "3008 DKR" }),
    c3: Object.assign(Car.create(ccc), { _name: "Peugeot", _model: "4008 DKR" }),
    p0: Object.assign(People.create(ccc), { _name: "Lisa Simpsons" , _firstname: "Lisa" , _lastname: "Simpsons", _birthDate: new Date()  }),
    p1: Object.assign(People.create(ccc), { _name: "Bart Simpsons" , _firstname: "Bart" , _lastname: "Simpsons", _birthDate: new Date(0) }),
    p2: Object.assign(People.create(ccc), { _name: "Homer Simpsons", _firstname: "Homer", _lastname: "Simpsons", _birthDate: new Date()  }),
  };
  ret.p0._father = ret.p2;
  ret.p1._father = ret.p2;
  return ret;
}

function createContext_C1(publicTransport: (json: string) => Promise<string>) {
  let default_transport: FarTransport = {
    async remoteCall({ context: { ccc } }, to, method, args): Promise<any> {
      let req = { to: to.id(), method: method.name, args: args };
      return JSON.parse(await publicTransport(JSON.stringify(req)));
    }
  };

  function initDefaultContext_C1(ccc:ControlCenterContext) {
    let db = DataSource.Aspects.client.create(ccc);
    db.manager().setSavedIdVersion('datasource', VersionedObjectManager.UndefinedVersion);
    let common_objects =  add_common_objects(ccc);
    return {db, ...common_objects }
  };

  let cc = new ControlCenter(
    new AspectConfiguration(
    {
      selection: new AspectSelection([
        Resource.Aspects.c1,
        Car.Aspects.c1,
        People.Aspects.c1,
        DataSource.Aspects.client,
      ]),
      defaultFarTransport: default_transport,
      initDefaultContext:initDefaultContext_C1,
    })
  );
  return { cc };

}

function createContext_S1(ds: InMemoryDataSource.DataStore, queries: Map<string, DataSourceQuery>) {
  let publicTransport = async (json: string) => {
    let { cc } = createContext_S1(ds, queries);
    let res = cc.safe(async ccc => {
      let { to, method, args } = JSON.parse(json);
      let code_ctx = new Aspect.Type.Context(ccc, Aspect.Type.ModeLocation.Parameter);
      let vo = ccc.findChecked(to);
      let farMethod = vo.manager().aspect().farMethods.get(method)!;
      let at = new PathReporter(new Reporter(), farMethod.name, ":", 0);
      let returnType = new Aspect.Type.ResultType(farMethod.returnType || Aspect.Type.voidType);
      let decoded_args = farMethod.argumentTypes.map((t, i) => t.decode(at.set(i), code_ctx, args[i]));
      if (!at.reporter.failed) {
        let inv = await Invocation.farPromise(ccc, { to: vo, method: farMethod.name }, decoded_args[0]);
        return JSON.stringify(returnType.encode(at.set('return'), code_ctx, inv));
      }
      else {
        return JSON.stringify({ is: "result", v: at.reporter.diagnostics });
      }
    });
    return res;
  };

  function initDefaultContext_S1(ccc:ControlCenterContext) {
    let db = InMemoryDataSource.Aspects.server.create(ccc, ds);
    db.setQueries(queries);
    db.manager().setSavedIdVersion('datasource', VersionedObjectManager.UndefinedVersion);
    let common_objects =  add_common_objects(ccc);
    return {db, ...common_objects }
  };

  let cc = new ControlCenter(
    new AspectConfiguration(
    {
      selection: new AspectSelection([
        Resource.Aspects.s1,
        Car.Aspects.s1,
        People.Aspects.s1,
        InMemoryDataSource.Aspects.server,
      ]),
      initDefaultContext:initDefaultContext_S1,
    })
  );

  return { cc: cc, publicTransport: publicTransport };
}

async function client_to_server_save(flux) {
  let ds = new InMemoryDataSource.DataStore();
  let s1 = createContext_S1(ds, new Map());
  let c1 = createContext_C1(s1.publicTransport);

  await c1.cc.safe(async ccc => {
    let defCtx = c1.cc.defaultContext();
    let db = defCtx.db as  DataSource.Aspects.client;
    let c1_c4 = Object.assign(Car.Aspects.c1.create(ccc), { _name: "Renault", _model: "Clio 4" });
    let inv = await ccc.farPromise(db.save, [c1_c4, defCtx.c0, defCtx.c1, defCtx.c2, defCtx.c3, defCtx.p0, defCtx.p1, defCtx.p2]);
    assert.deepEqual(inv.diagnostics(), []);
    assert.deepEqual(inv.value(), [c1_c4, defCtx.c0, defCtx.c1, defCtx.c2, defCtx.c3, defCtx.p0, defCtx.p1, defCtx.p2]);
  });
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

  await s1.cc.safe(ccc => {
    let defCtx = ccc.controlCenter().defaultContext();
    let db = defCtx.db as  DataSource.Aspects.server;
    return ccc.farPromise(db.rawSave, [defCtx.c0, defCtx.c1, defCtx.c2, defCtx.c3, defCtx.p0, defCtx.p1, defCtx.p2]);
  });

  await c1.cc.safe(async ccc => {
    let defCtx = ccc.controlCenter().defaultContext();
    let db = defCtx.db as  DataSource.Aspects.client;
    let inv = await ccc.farPromise(db.query, { id: "s1cars" });
    assert.deepEqual(inv.diagnostics(), []);
    let res = inv.value();
    let s1Ctx = s1.cc.defaultContext();
    assert.sameMembers(
      res["cars"].map((vo: Car.Aspects.c1) => `${vo.id()}:${vo.brand()}:${vo.owner()}`),
      ([s1Ctx.c0, s1Ctx.c1, s1Ctx.c2, s1Ctx.c3] as any[]).map((vo: Car.Aspects.c1) => `${vo.id()}:${vo.brand()}:${vo.owner()}`));
  });
  flux.continue();
}

async function manual_server_save(flux) {
  let data_out = [
    { is: "vo", cls: "Car", v: [[3, "_localid:300095", "_localid:300095"], [2, 0, -1],
      [1, "Renault", 0], [1, "Clio 4", 0], 0, 0, [1, { is: "set", v: ["toto"] }, 0]
    ] },
    { is: "vo", cls: "Car", v: [[3, "_localid:300088", "_localid:300088"], [2, 0, -1],
      [1, "Renault", 0], [1, "Clio 3", 0], 0, 0, 0
    ] },
    { is: "vo", cls: "Car", v: [[3, "_localid:300089", "_localid:300089"], [2, 0, -1],
      [1, "Renault", 0], [1, "Clio 2", 0], 0, 0, 0
    ] },
    { is: "vo", cls: "Car", v: [[3, "_localid:300090", "_localid:300090"], [2, 0, -1],
      [1, "Peugeot", 0], [1, "3008 DKR", 0], 0, 0, 0
    ] },
    { is: "vo", cls: "Car", v: [[3, "_localid:300091", "_localid:300091"], [2, 0, -1],
      [1, "Peugeot", 0], [1, "4008 DKR", 0], 0, 0, 0
    ] },
    { is: "vo", cls: "People", v: [[3, "_localid:300092", "_localid:300092"], [2, 0, -1],
      [1, "Lisa Simpsons" , 0], [1, "Lisa" , 0], [1, "Simpsons", 0],
      [1, { is: "vo", cls: "People", v: "_localid:300094" }, 0],
      0,0,0,0,0,
      [1, { is: "date", v: "2017-09-26T15:31:54.422Z" }, 0],
    ] },
    { is: "vo", cls: "People", v: [[3, "_localid:300093", "_localid:300093"], [2, 0, -1],
      [1, "Bart Simpsons" , 0], [1, "Bart" , 0], [1, "Simpsons", 0],
      [1, { is: "vo", cls: "People", v: "_localid:300094" }, 0],
      0,0,0,0,0,
      [1, { is: "date", v: "1970-01-01T00:00:00.000Z" }, 0],
    ] },
    { is: "vo", cls: "People", v: [[3, "_localid:300094", "_localid:300094"], [2, 0, -1],
      [1, "Homer Simpsons", 0], [1, "Homer", 0], [1, "Simpsons", 0],
      0,0,
      [1, { is: "set", v: [{ is: "vo", cls: "People", v: "_localid:300092" }, { is: "vo", cls: "People", v: "_localid:300093" }] }, 0],
      0,0,0,
      [1, { is: "date", v: "2017-09-26T15:31:54.422Z" }, 0],
    ] },
  ];
  let data_res = [
    { is: "vo", cls: "Car", v: [[3, "_localid:300095", "memory:1"], [2, 0, 0],
      [2, 0, "Renault"], [2, 0, "Clio 4"], [2, 0, null], [2, 0, { is: "set" }], [2, 0, { is: "set", v: ["toto"] }]
    ]},
    { is: "vo", cls: "Car", v: [[3, "_localid:300088", "memory:2"], [2, 0, 0],
      [2, 0, "Renault"], [2, 0, "Clio 3"], [2, 0, null], [2, 0, { is: "set" }], [2, 0, { is: "set" }]
    ]},
    { is: "vo", cls: "Car", v: [[3, "_localid:300089", "memory:3"], [2, 0, 0],
      [2, 0, "Renault"], [2, 0, "Clio 2"], [2, 0, null], [2, 0, { is: "set" }], [2, 0, { is: "set" }]
    ]},
    { is: "vo", cls: "Car", v: [[3, "_localid:300090", "memory:4"], [2, 0, 0],
      [2, 0, "Peugeot"], [2, 0, "3008 DKR"], [2, 0, null], [2, 0, { is: "set" }], [2, 0, { is: "set" }]
    ]},
    { is: "vo", cls: "Car", v: [[3, "_localid:300091", "memory:5"], [2, 0, 0],
      [2, 0, "Peugeot"], [2, 0, "4008 DKR"], [2, 0, null], [2, 0, { is: "set" }], [2, 0, { is: "set" }]
    ]},
    { is: "vo", cls: "People", v: [[3, "_localid:300092", "memory:6"], [2, 0, 0],
      [2, 0, "Lisa Simpsons" ], [2, 0, "Lisa" ], [2, 0, "Simpsons"],
      [2, 0, { is: "vo", cls: "People", v: [[3, "_localid:300094", "memory:7"], [2, 0, 0],
        [2, 0, "Homer Simpsons"], [2, 0, "Homer"], [2, 0, "Simpsons"],
        [2, 0, null], // _father
        [2, 0, null], // _mother
        [2, 0, { is: "set", v: [
          { is: "vo", cls: "People", v: "_localid:300092" },
          { is: "vo", cls: "People", v: [[3, "_localid:300093", "memory:8"], [2, 0, 0],
            [2, 0, "Bart Simpsons" ], [2, 0, "Bart" ], [2, 0, "Simpsons"],
            [2, 0, { is: "vo", cls: "People", v: "_localid:300094" }], // _father
            [2, 0, null], // _mother
            [2, 0, { is: "set" }], // _childrens_by_father
            [2, 0, { is: "set" }], // _childrens_by_mother
            [2, 0, { is: "set" }], // _cars
            [2, 0, { is: "set" }], // _drivenCars
            [2, 0, { is: "date", v: "1970-01-01T00:00:00.000Z" }],
          ] }]
        }], // _childrens_by_father
        [2, 0, { is: "set" }], // _childrens_by_mother
        [2, 0, { is: "set" }], // _cars
        [2, 0, { is: "set" }], // _drivenCars
        [2, 0, { is: "date", v: "2017-09-26T15:31:54.422Z" }],
      ]}], // _father
      [2, 0, null], // _mother
      [2, 0, { is: "set" }], // _childrens_by_father
      [2, 0, { is: "set" }], // _childrens_by_mother
      [2, 0, { is: "set" }], // _cars
      [2, 0, { is: "set" }], // _drivenCars
      [2, 0, { is: "date", v: "2017-09-26T15:31:54.422Z" }],
    ] },
    { is: "vo", cls: "People", v: "_localid:300093" },
    { is: "vo", cls: "People", v: "_localid:300094" }];
  let ds = new InMemoryDataSource.DataStore();
  let s1 = createContext_S1(ds, new Map());
  let c1 = createContext_C1(s1.publicTransport);
  let res = await s1.publicTransport(JSON.stringify({ to: c1.cc.defaultContext().db!.id(), method: "publicSave", args: [data_out] }));
  assert.deepEqual(JSON.parse(res), { is: "result", v: [{ is: "value", value: data_res}] } as any);
  flux.continue();
}

export const tests = { name: 'transport', tests: [
  client_to_server_save,
  client_to_server_query,
  manual_server_save,
]};
