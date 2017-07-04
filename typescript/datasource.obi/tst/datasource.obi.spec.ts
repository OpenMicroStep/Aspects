import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager} from '@openmicrostep/aspects';
import {Reporter, Parser} from '@openmicrostep/msbuildsystem.shared';
import {SqliteDBConnectorFactory} from '@openmicrostep/aspects.sql';
import {parseObis, ObiDefinition, OuiDB, ObiDataSource, StdDefinition} from '@openmicrostep/aspects.obi';
import {assert} from 'chai';
import {createTests} from '../../core/tst/datasource.impl.spec';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

type D = ObiDefinition;
function sortvalue(a) {
  return typeof a === "object" && (a._id || a.system_name) ? a._id || a.system_name : a;
}
function serialize(s, map = new Map()) {
  let r = s;
  if (typeof s === "object") {
    r = map.get(s);
    if (!r) {
      if (s instanceof Map)
        s = [...s.entries()].sort((a, b) => sortvalue(a[0]) < sortvalue(b[0]) ? -1 : 1);
      if (s instanceof Set)
        s = [...s];
      if (Array.isArray(s)) {
        map.set(s, r = []);
        s.forEach(e => r.push(serialize(e, map)));
      }
      else {
        let k, v;
        map.set(s, r = {});
        for (k in s) {
          v = s[k];
          r[k] = serialize(v, map);
        }
      }
    }
    else if (r._id || r.system_name) {
      r = `=obi:${r.system_name || r._id}`
    }
  }
  /*else if (typeof s === "function") {
    r = s.aspect ? s.aspect.name : s.name;
  }*/
  return r;
}

function parse(reporter: Reporter, def: string) {
  let ctx = {
    obis: [],
    roByName: new Map<string, ObiDefinition>(),
    roById: new Map<number, ObiDefinition>(),
    byName: new Map<string, ObiDefinition>(),
    byId: new Map<number, ObiDefinition>(),
    CarSystemNameLib: "system name",
    CarTypeLib: "type",
    TypIDLib: "ID",
    TypSIDLib: "SID",
  };
  let parser = new Parser(reporter, def);
  let obis = parseObis(ctx, parser);
  return obis;
}

function testDecode(def: string, expect: ObiDefinition[]) {
  let reporter = new Reporter();
  let obis = parse(reporter, def);
  let actual = obis.map(d => serialize(d));
  let expected = expect.map(d => serialize(d));
  assert.deepEqual(actual, expected); // better diff
  //assert.deepEqual(obis, expect);
}

function decode_error_end1() {
  let def = `
ENT
_id: 1
_end:
_end:`;
  let reporter = new Reporter();
  parse(reporter, def);
  assert.deepEqual(reporter.diagnostics, [
    { "type": "error", "row": 5, "col": 5, "msg": "a new entity name was expected" },
  ]);
}

function decode_error_end2() {
  let def = `
ENT
_id: 1`;
  let reporter = new Reporter();
  parse(reporter, def);
  assert.deepEqual(reporter.diagnostics, [
    { "type": "error", "row": 3, "col": 6, "msg": "_end: was expected" },
  ]);
}
function decode_error_end3() {
  let def = `
ENT
_id: 1
`;
  let reporter = new Reporter();
  parse(reporter, def);
  assert.deepEqual(reporter.diagnostics, [
    { "type": "error", "row": 4, "col": 0, "msg": "_end: was expected" },
  ]);
}
function decode_error_collision0() {
  let def = `
ENT
_id: 1
_end:

ENT
_id: 1
_end:
`;
  let reporter = new Reporter();
  parse(reporter, def);
  assert.deepEqual(reporter.diagnostics, [
    { "type": "error", "row": 7, "col": 7, "msg": "cannot extends objects in the same definition: { _id: 1 }" },
  ]);
}
function decode_ENT() {
  let def = `
ENT // test
_id: 1
system name: ENT
pattern:
  Gab
  _id: 1002
  characteristic: system name
  cardinality: one
  mandatory: 1
  _end:
pattern:
  Gab
  _id: 1004
  characteristic: pattern
  cardinality: multi
  _end:
_end:
  `;

  let ENT: D            = { is: undefined, _id: 1        , system_name: "ENT"           , attributes: new Map() };
  let system_name: D    = { is: undefined, _id: undefined, system_name: "system name"   , attributes: new Map() };
  let pattern: D        = { is: undefined, _id: undefined, system_name: "pattern"       , attributes: new Map() };
  let characteristic: D = { is: undefined, _id: undefined, system_name: "characteristic", attributes: new Map() };
  let cardinality: D    = { is: undefined, _id: undefined, system_name: "cardinality"   , attributes: new Map() };
  let mandatory: D      = { is: undefined, _id: undefined, system_name: "mandatory"     , attributes: new Map() };
  let Gab: D            = { is: undefined, _id: undefined, system_name: "Gab"           , attributes: new Map() };
  let ENT_1: D          = { is: Gab      , _id: 1002     , system_name: undefined       , attributes: new Map() };
  let ENT_2: D          = { is: Gab      , _id: 1004     , system_name: undefined       , attributes: new Map() };
  ENT.is = ENT;
  ENT.attributes.set  (system_name   , new Set(["ENT"        ]));
  ENT.attributes.set  (pattern       , new Set([ENT_1, ENT_2 ]));
  ENT_1.attributes.set(characteristic, new Set(["system name"]));
  ENT_1.attributes.set(cardinality   , new Set(["one"        ]));
  ENT_1.attributes.set(mandatory     , new Set(["1"          ]));
  ENT_2.attributes.set(characteristic, new Set(["pattern"    ]));
  ENT_2.attributes.set(cardinality   , new Set(["multi"      ]));
  testDecode(def, [ENT]);
}


function ENT_Car_Gab_Typ() {

  let ENT           : D = { is: undefined, _id: 1   , system_name: "ENT"           , attributes: new Map() };
  let Car           : D = { is: ENT      , _id: 3   , system_name: "Car"           , attributes: new Map() };
  let Typ           : D = { is: ENT      , _id: 5   , system_name: "Typ"           , attributes: new Map() };
  let Gab           : D = { is: ENT      , _id: 7   , system_name: "Gab"           , attributes: new Map() };
  let Lst           : D = { is: undefined, _id: undefined, system_name: "Lst"      , attributes: new Map() };

  let system_name   : D = { is: Car      , _id: 102 , system_name: "system name"   , attributes: new Map() };
  let characteristic: D = { is: Car      , _id: 103 , system_name: "characteristic", attributes: new Map() };
  let type          : D = { is: Car      , _id: 105 , system_name: "type"          , attributes: new Map() };
  let pattern       : D = { is: Car      , _id: 107 , system_name: "pattern"       , attributes: new Map() };
  let domain_entity : D = { is: Car      , _id: 109 , system_name: "domain entity" , attributes: new Map() };
  let domain_list   : D = { is: Car      , _id: 110 , system_name: "domain list"   , attributes: new Map() };
  let cardinality   : D = { is: Car      , _id: 115 , system_name: "cardinality"   , attributes: new Map() };
  let mandatory     : D = { is: Car      , _id: 243 , system_name: "mandatory"     , attributes: new Map() };
  let the_cardinalities: D = { is: undefined, _id: undefined, system_name: "the cardinalities", attributes: new Map() };
  let one           : D = { is: undefined, _id: undefined, system_name: "one"      , attributes: new Map() };
  let multi         : D = { is: undefined, _id: undefined, system_name: "multi"    , attributes: new Map() };
  let ID            : D = { is: Typ      , _id: 2001, system_name: "ID"            , attributes: new Map() };
  let SID           : D = { is: Typ      , _id: 2003, system_name: "SID"           , attributes: new Map() };
  let STR           : D = { is: Typ      , _id: 2021, system_name: "STR"           , attributes: new Map() };
  let BOOL          : D = { is: Typ      , _id: 2043, system_name: "BOOL"          , attributes: new Map() };

  let ENT_1         : D = { is: Gab      , _id: 1002, system_name: undefined       , attributes: new Map() };
  let ENT_2         : D = { is: Gab      , _id: 1004, system_name: undefined       , attributes: new Map() };
  let Car_1         : D = { is: Gab      , _id: 1032, system_name: undefined       , attributes: new Map() };
  let Car_2         : D = { is: Gab      , _id: 1034, system_name: undefined       , attributes: new Map() };
  let Car_3         : D = { is: Gab      , _id: 1036, system_name: undefined       , attributes: new Map() };
  let Car_4         : D = { is: Gab      , _id: 1038, system_name: undefined       , attributes: new Map() };
  let Typ_1         : D = { is: Gab      , _id: 1052, system_name: undefined       , attributes: new Map() };
  let Gab_1         : D = { is: Gab      , _id: 1072, system_name: undefined       , attributes: new Map() };
  let Gab_2         : D = { is: Gab      , _id: 1074, system_name: undefined       , attributes: new Map() };
  let Gab_3         : D = { is: Gab      , _id: 1076, system_name: undefined       , attributes: new Map() };

  ENT.is = ENT;
  ENT  .attributes.set(system_name   , new Set(["ENT"         ]));
  ENT  .attributes.set(pattern       , new Set([ENT_1, ENT_2  ]));
  ENT_1.attributes.set(characteristic, new Set([system_name   ]));
  ENT_1.attributes.set(cardinality   , new Set([one           ]));
  ENT_1.attributes.set(mandatory     , new Set(["1"           ]));
  ENT_2.attributes.set(characteristic, new Set([pattern       ]));
  ENT_2.attributes.set(cardinality   , new Set([multi         ]));

  Car  .attributes.set(system_name   , new Set(["Car"         ]));
  Car  .attributes.set(pattern       , new Set([Car_1, Car_2, Car_3, Car_4]));
  Car_1.attributes.set(characteristic, new Set([system_name   ]));
  Car_1.attributes.set(cardinality   , new Set([one           ]));
  Car_1.attributes.set(mandatory     , new Set(["1"           ]));
  Car_2.attributes.set(characteristic, new Set([type          ]));
  Car_2.attributes.set(cardinality   , new Set([one           ]));
  Car_2.attributes.set(mandatory     , new Set(["1"           ]));
  Car_3.attributes.set(characteristic, new Set([domain_entity ]));
  Car_3.attributes.set(cardinality   , new Set([one           ]));
  Car_4.attributes.set(characteristic, new Set([domain_list   ]));
  Car_4.attributes.set(cardinality   , new Set([one           ]));

  Typ  .attributes.set(system_name   , new Set(["Typ"         ]));
  Typ  .attributes.set(pattern       , new Set([Typ_1         ]));
  Typ_1.attributes.set(characteristic, new Set([system_name   ]));
  Typ_1.attributes.set(cardinality   , new Set([one           ]));
  Typ_1.attributes.set(mandatory     , new Set(["1"           ]));

  Gab  .attributes.set(system_name   , new Set(["Gab"         ]));
  Gab  .attributes.set(pattern       , new Set([Gab_1, Gab_2, Gab_3]));
  Gab_1.attributes.set(characteristic, new Set([characteristic]));
  Gab_1.attributes.set(cardinality   , new Set([one           ]));
  Gab_1.attributes.set(mandatory     , new Set(["1"           ]));
  Gab_2.attributes.set(characteristic, new Set([cardinality   ]));
  Gab_2.attributes.set(cardinality   , new Set([one           ]));
  Gab_3.attributes.set(characteristic, new Set([mandatory     ]));
  Gab_3.attributes.set(cardinality   , new Set([one           ]));

  system_name   .attributes.set(system_name   , new Set(["system name"   ]));
  system_name   .attributes.set(type          , new Set([STR             ]));
  characteristic.attributes.set(system_name   , new Set(["characteristic"]));
  characteristic.attributes.set(type          , new Set([ID              ]));
  characteristic.attributes.set(domain_entity , new Set([Car             ]));
  type          .attributes.set(system_name   , new Set(["type"          ]));
  type          .attributes.set(type          , new Set([ID              ]));
  type          .attributes.set(domain_entity , new Set([Typ             ]));
  pattern       .attributes.set(system_name   , new Set(["pattern"       ]));
  pattern       .attributes.set(type          , new Set([SID             ]));
  pattern       .attributes.set(domain_entity , new Set([Gab             ]));
  domain_entity .attributes.set(system_name   , new Set(["domain entity" ]));
  domain_entity .attributes.set(type          , new Set([ID              ]));
  domain_entity .attributes.set(domain_entity , new Set([ENT             ]));
  domain_list   .attributes.set(system_name   , new Set(["domain list"   ]));
  domain_list   .attributes.set(type          , new Set([ID              ]));
  domain_list   .attributes.set(domain_entity , new Set([Lst             ]));
  cardinality   .attributes.set(system_name   , new Set(["cardinality"   ]));
  cardinality   .attributes.set(type          , new Set([ID              ]));
  cardinality   .attributes.set(domain_list   , new Set([the_cardinalities]));
  mandatory     .attributes.set(system_name   , new Set(["mandatory"     ]));
  mandatory     .attributes.set(type          , new Set([BOOL            ]));

  ID  .attributes.set(system_name   , new Set(["ID"            ]));
  SID .attributes.set(system_name   , new Set(["SID"           ]));
  STR .attributes.set(system_name   , new Set(["STR"           ]));
  BOOL.attributes.set(system_name   , new Set(["BOOL"          ]));

  return {
    ENT: ENT,
    Car: Car,
    Typ: Typ,
    Gab: Gab,
    Lst: Lst,
    system_name: system_name,
    characteristic: characteristic,
    type: type,
    pattern: pattern,
    domain_entity: domain_entity,
    domain_list: domain_list,
    cardinality: cardinality,
    mandatory: mandatory,
    the_cardinalities: the_cardinalities,
    one: one,
    multi: multi,
    ID: ID,
    SID: SID,
    STR: STR,
    BOOL: BOOL,
    ENT_1: ENT_1,
    ENT_2: ENT_2,
    Car_1: Car_1,
    Car_2: Car_2,
    Car_3: Car_3,
    Car_4: Car_4,
    Typ_1: Typ_1,
    Gab_1: Gab_1,
    Gab_2: Gab_2,
    Gab_3: Gab_3,
  };
}

function decode_ENT_Car_Gab_Typ() {
  let def = `
ENT
_id: 1
system name: ENT
pattern:
  Gab
  _id: 1002
  characteristic: system name
  cardinality: one
  mandatory: 1
  _end:
pattern:
  Gab
  _id: 1004
  characteristic: pattern
  cardinality: multi
  _end:
_end:

ENT
_id: 3
system name: Car
pattern: 
  Gab
  _id: 1032
  characteristic: system name
  cardinality: one
  mandatory: 1
  _end:
pattern: 
  Gab
  _id: 1034
  characteristic: type
  cardinality: one
  mandatory: 1
  _end:
pattern: 
  Gab
  _id: 1036
  characteristic: domain entity
  cardinality: one
  _end:
pattern: 
  Gab
  _id: 1038
  characteristic: domain list
  cardinality: one
  _end:
_end:

ENT
_id: 5
system name: Typ
pattern: 
  Gab
  _id: 1052
  characteristic: system name
  cardinality: one
  mandatory: 1
  _end:
_end:

ENT
_id: 7
system name: Gab
pattern: 
  Gab
  _id: 1072
  characteristic: characteristic
  cardinality: one
  mandatory: 1
  _end:
pattern: 
  Gab
  _id: 1074
  characteristic: cardinality
  cardinality: one
  _end:
pattern: 
  Gab
  _id: 1076
  characteristic: mandatory
  cardinality: one
  _end:
_end:

Car
_id: 102
system name: system name
type: STR
_end:

Car
_id: 103
system name: characteristic
type: ID
domain entity: Car
_end:

Car
_id: 105
system name: type
type: ID
domain entity: Typ
_end:

Car
_id: 107
system name: pattern
type: SID
domain entity: Gab
_end:

Car
_id: 109
system name: domain entity
type: ID
domain entity: ENT
_end:

Car
_id: 110
system name: domain list
type: ID
domain entity: Lst
_end:

Car
_id: 115
system name: cardinality
type: ID
domain list: the cardinalities
_end:

Car
_id: 243
system name: mandatory
type: BOOL
_end:

Typ
_id: 2001
system name: ID
_end:

Typ
_id: 2003
system name: SID
_end:

Typ
_id: 2021
system name: STR
_end:

Typ
_id: 2043
system name: BOOL
_end:
  `;

  let e = ENT_Car_Gab_Typ();
  testDecode(def, [
    e.ENT, e.Car, e.Typ, e.Gab, 
    e.system_name, e.characteristic, e.type, e.pattern, e.domain_entity, e.domain_list, e.cardinality, e.mandatory,
    e.ID, e.SID, e.STR, e.BOOL,
  ]);
}

async function load_std(flux) {
  let trace = false;
  const sqlite3 = require('sqlite3').verbose();
  const connector = SqliteDBConnectorFactory(sqlite3, { 
    filename: ":memory:",
    trace: sql => trace && console.info(sql),
  }, { max: 1 });
  await connector.unsafeRun({ sql: 'CREATE TABLE `TJ_VAL_ID`  (`VAL_INST` bigint(20) NOT NULL, `VAL_CAR` bigint(20) NOT NULL, `VAL` bigint(20) NOT NULL  , PRIMARY KEY (`VAL_INST`,`VAL_CAR`,`VAL`))', bind: []})
  await connector.unsafeRun({ sql: 'CREATE TABLE `TJ_VAL_INT` (`VAL_INST` bigint(20) NOT NULL, `VAL_CAR` bigint(20) NOT NULL, `VAL` bigint(20) NOT NULL  , PRIMARY KEY (`VAL_INST`,`VAL_CAR`,`VAL`))', bind: []})
  await connector.unsafeRun({ sql: 'CREATE TABLE `TJ_VAL_STR` (`VAL_INST` bigint(20) NOT NULL, `VAL_CAR` bigint(20) NOT NULL, `VAL` varchar(144) NOT NULL, PRIMARY KEY (`VAL_INST`,`VAL_CAR`,`VAL`))', bind: []})
  
  const ouiDb = new OuiDB(connector);
  await ouiDb.injectObis(ouiDb.parseObis(new Parser(new Reporter(), StdDefinition)));
  await ouiDb.loadSystemObis();

  const test_obis = ouiDb.parseObis(new Parser(new Reporter(), `
ENT // ENT-Gab
_id: 7
pattern: 
  Gab
  _id: 1089
  characteristic: urn
  cardinality: one
  _end:
_end:

Car
_id: 301
system name: urn
type: STR
_end:

ENT // ENT-R_Element
_id: 10011
system name: R_Element
pattern: 
  Gab
  _id: 10013
  characteristic: system name
  cardinality: one
  _end:
pattern: 
  Gab
  _id: 10015
  characteristic: order
  cardinality: one
  _end:
_end:
`));
  await ouiDb.injectObis(test_obis);
  trace = false;
  await ouiDb.loadSystemObis();
  flux.continue();
}

const test_def = `
ENT
system name: T_Car
pattern:
  Gab
  characteristic: t_version
  cardinality: one
  _end:
pattern:
  Gab
  characteristic: t_name
  cardinality: one
  _end:
pattern:
  Gab
  characteristic: t_model
  cardinality: one
  _end:
pattern:
  Gab
  characteristic: t_owner
  cardinality: one
  _end:
pattern:
  Gab
  characteristic: t_drivers
  cardinality: multi
  _end:
_end:

ENT
system name: T_People
pattern:
  Gab
  characteristic: t_version
  cardinality: one
  _end:
pattern:
  Gab
  characteristic: t_name
  cardinality: one
  _end:
pattern:
  Gab
  characteristic: t_firstname
  cardinality: one
  _end:
pattern:
  Gab
  characteristic: t_lastname
  cardinality: one
  _end:
pattern:
  Gab
  characteristic: t_drivenCars
  cardinality: multi
  _end:
pattern:
  Gab
  characteristic: t_birthDate
  cardinality: one
  _end:
pattern:
  Gab
  characteristic: t_father
  cardinality: one
  _end:
pattern:
  Gab
  characteristic: t_mother
  cardinality: one
  _end:
_end:

Car
system name: t_version
type: INT
_end:

Car
system name: t_name
type: STR
_end:

Car
system name: t_model
type: STR
_end:

Car
system name: t_firstname
type: STR
_end:

Car
system name: t_lastname
type: STR
_end:

Car
system name: t_birthDate
type: DAT
_end:

Car
system name: t_drivenCars
type: ID
domain entity: T_Car
_end:

Car
system name: t_drivers
type: ID
domain entity: T_People
_end:

Car
system name: t_owner
type: ID
domain entity: T_People
_end:

Car
system name: t_father
type: ID
domain entity: T_People
_end:

Car
system name: t_mother
type: ID
domain entity: T_People
_end:
`;

async function createObiControlCenter(flux) {
  let trace = false;
  const sqlite3 = require('sqlite3').verbose();
  const connector = SqliteDBConnectorFactory(sqlite3, { 
    filename: ":memory:",
    trace: sql => trace && console.info(sql),
  }, { max: 1 });
  await connector.unsafeRun({ sql: 'CREATE TABLE `TJ_VAL_ID`  (`VAL_INST` bigint(20) NOT NULL, `VAL_CAR` bigint(20) NOT NULL, `VAL` bigint(20) NOT NULL  , PRIMARY KEY (`VAL_INST`,`VAL_CAR`,`VAL`))', bind: []})
  await connector.unsafeRun({ sql: 'CREATE TABLE `TJ_VAL_INT` (`VAL_INST` bigint(20) NOT NULL, `VAL_CAR` bigint(20) NOT NULL, `VAL` bigint(20) NOT NULL  , PRIMARY KEY (`VAL_INST`,`VAL_CAR`,`VAL`))', bind: []})
  await connector.unsafeRun({ sql: 'CREATE TABLE `TJ_VAL_STR` (`VAL_INST` bigint(20) NOT NULL, `VAL_CAR` bigint(20) NOT NULL, `VAL` varchar(144) NOT NULL, PRIMARY KEY (`VAL_INST`,`VAL_CAR`,`VAL`))', bind: []})
  
  const ouiDb = new OuiDB(connector);
  await ouiDb.injectObis(ouiDb.parseObis(new Parser(new Reporter(), StdDefinition)));
  await ouiDb.loadSystemObis();
  const test_obis = ouiDb.parseObis(new Parser(new Reporter(), test_def));
  await ouiDb.injectObis(test_obis);
  await ouiDb.loadSystemObis();

  let cc = new ControlCenter();
  let C = Car.installAspect(cc, 'test1');
  let P = People.installAspect(cc, 'test1');
  let DB = ObiDataSource.installAspect(cc, "server");
  let db = new DB(ouiDb, {
    aspectClassname_to_ObiEntity: (classname: string) => `T_${classname}`,
    obiEntity_to_aspectClassname: (classname: string) => classname.substring(2),
    aspectAttribute_to_ObiCar: (attribute: string) => `t${attribute}`,
    aspectValue_to_obiValue: (value, attribute: string) => {
      if (attribute === "_birthDate")
        return value.getTime();
      return value;
    },
    obiValue_to_aspectValue: (value, attribute: string) => {
      if (attribute === "_birthDate")
        return new Date(value);
      return value;
    },
  });
  //trace = true;
  
  Object.assign(flux.context, {
    connector: connector,
    Car: C,
    People: P,
    db: db,
    cc: cc
  });
  flux.continue();
}
function destroy(flux) {
  flux.context.connector.close();
  flux.continue();
}

export const name = "obi";
export const tests = 
[
  { name: "decode", tests: [
    decode_ENT,
    decode_ENT_Car_Gab_Typ,
    decode_error_end1,
    decode_error_end2,
    decode_error_end3,
    decode_error_collision0,
  ]},
  load_std,
  { name: "sqlite (npm sqlite3)", tests: createTests(createObiControlCenter, destroy) },
];
