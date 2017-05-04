import {ControlCenter, DataSource, DataSourceInternal, InMemoryDataSource, VersionedObject, VersionedObjectManager} from '@openmicrostep/aspects';
import {
  SqlDataSource, SqlMappedObject, SqlMappedAttribute, DBConnector, loadSqlMappers, 
  SqliteDBConnectorFactory, MySQLDBConnectorFactory, PostgresDBConnectorFactory, MSSQLDBConnectorFactory, OracleDBConnectorFactory,
} from '@openmicrostep/aspects.sql';
import {assert} from 'chai';
import {createTests} from '../../core/tst/datasource.impl.spec';
import {Resource, Car, People} from '../../../generated/aspects.interfaces';

function fromDbKeyPeople(id) { return `${id}:People`; }
function fromDbKeyCar(id)    { return `${id}:Car`   ; }
function toDBKey(id) { return +id.split(':')[0]; }

function createSqlControlCenter(flux) {
  const mappers = loadSqlMappers({
    "People=": { 
      is: "sql-mapped-object",
      fromDbKey: (id) => `${id}:People`,
      toDbKey: toDBKey,
      inserts: [
        { is: "sql-insert", name: "V", table: "Version" , values: [{ is: "sql-value", name: "id"       , type: "autoincrement" }, 
                                                                    { is: "sql-value", name: "type"     , type: "value", value: "Resource" }] },
        { is: "sql-insert", name: "R", table: "Resource", values: [{ is: "sql-value", name: "id"       , type: "autoincrement" }, 
                                                                    { is: "sql-value", name: "idVersion", type: "ref", insert: "=V", value: "id" }] },
        { is: "sql-insert", name: "P", table: "People"  , values: [{ is: "sql-value", name: "id"       , type: "ref", insert: "=R", value: "id" }] },
      ],
      attributes: [
          { is: "sql-mapped-attribute", name: "_id"        , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "id"        }] },
          { is: "sql-mapped-attribute", name: "_version"   , insert: "=V", path: [{ is: "sql-path", table: "Resource", key: "id"    , value: "idVersion" }, { is: "sql-path", table: "Version", key: "id", where: { type: "Resource" }, value: "version" }] },
          { is: "sql-mapped-attribute", name: "_name"      , insert: "=R", path: [{ is: "sql-path", table: "Resource", key: "id"    , value: "name"      }] },
          { is: "sql-mapped-attribute", name: "_firstname" , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "firstname" }] },
          { is: "sql-mapped-attribute", name: "_lastname"  , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "lastname"  }] },
          { is: "sql-mapped-attribute", name: "_birthDate" , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "birthDate" }], fromDb: v => new Date(+v), toDb: d => d.getTime() },
          { is: "sql-mapped-attribute", name: "_cars"                    , path: [{ is: "sql-path", table: "Car"     , key: "owner" , value: "id"        }] },
          { is: "sql-mapped-attribute", name: "_drivenCars"              , path: [{ is: "sql-path", table: "Drivers" , key: "people", value: "car"       }] },
      ]
    },
    "Car=": { 
      is: "sql-mapped-object",
      fromDbKey: (id) => `${id}:Car`,
      toDbKey: toDBKey,
      inserts: [
        { is: "sql-insert", name: "V", table: "Version" , values: [{ is: "sql-value", name: "id"       , type: "autoincrement" }, 
                                                                    { is: "sql-value", name: "type"     , type: "value", value: "Resource" }] },
        { is: "sql-insert", name: "R", table: "Resource", values: [{ is: "sql-value", name: "id"       , type: "autoincrement" }, 
                                                                    { is: "sql-value", name: "idVersion", type: "ref", insert: "=V", value: "id" }] },
        { is: "sql-insert", name: "C", table: "Car"     , values: [{ is: "sql-value", name: "id"       , type: "ref", insert: "=R", value: "id" }] },
      ],
      attributes: [
          { is: "sql-mapped-attribute", name: "_id"        , insert: "=C", path: [{ is: "sql-path", table: "Car"     , key: "id"    , value: "id"        }] },
          { is: "sql-mapped-attribute", name: "_version"   , insert: "=V", path: [{ is: "sql-path", table: "Resource", key: "id"    , value: "idVersion" }, { is: "sql-path", table: "Version", key: "id", where: { type: "Resource" }, value: "version" }] },
          { is: "sql-mapped-attribute", name: "_name"      , insert: "=R", path: [{ is: "sql-path", table: "Resource", key: "id"    , value: "name"      }] },
          { is: "sql-mapped-attribute", name: "_model"     , insert: "=C", path: [{ is: "sql-path", table: "Car"     , key: "id"    , value: "model"     }] },
          { is: "sql-mapped-attribute", name: "_owner"     , insert: "=C", path: [{ is: "sql-path", table: "Car"     , key: "id"    , value: "owner"     }] },
      ]
    }
  });

  let cc = new ControlCenter();
  let C = Car.installAspect(cc, 'test1');
  let P = People.installAspect(cc, 'test1');
  let DB = SqlDataSource.installAspect(cc, "server");
  let db = new DB();
  let mdb = db as any;
  mdb.mappers = mappers;
  mdb.connector = flux.context.connector;
  mdb.maker = flux.context.connector.maker;
  Object.assign(flux.context, {
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

export const name = "SqlDataSource";
export const tests = 
[
  { name: "sqlite (npm sqlite3)", tests: createTests(async function sqliteCC(flux) {
    const sqlite3 = require('sqlite3').verbose();
    const connector = SqliteDBConnectorFactory(sqlite3, { filename: ':memory:' }, { max: 1 });
    await connector.unsafeRun({ sql: 'CREATE TABLE `Version` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `type` VARCHAR(255), `version` INTEGER)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `Resource` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `idVersion` INTEGER REFERENCES `Version` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT, `name` VARCHAR(255))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `People` (`id` INTEGER PRIMARY KEY REFERENCES `Resource` (`id`), `firstname` VARCHAR(255), `lastname` VARCHAR(255), `birthDate` DATETIME)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `Car` (`id` INTEGER PRIMARY KEY REFERENCES `Resource` (`id`), `model` VARCHAR(255), `owner` INTEGER REFERENCES `People` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT)', bind: [] });
    flux.context.connector = connector;
    flux.setFirstElements([createSqlControlCenter]);
    flux.continue();
  }, destroy) },
  { name: "mysql (npm mysql2)", tests: createTests(async function mysqlCC(flux) {
    const mysql2 = require('mysql2');
    const connector = MySQLDBConnectorFactory(mysql2, { host: 'localhost', user: 'root', password: "my-secret-pw", database: "" }, { max: 10 });
    await connector.unsafeRun({ sql: 'DROP DATABASE IF EXISTS aspects', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE DATABASE aspects', bind: [] });
    await connector.unsafeRun({ sql: 'USE aspects', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `Version` (`id` INTEGER PRIMARY KEY AUTO_INCREMENT, `type` VARCHAR(255), `version` INTEGER)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `Resource` (`id` INTEGER PRIMARY KEY AUTO_INCREMENT, `idVersion` INTEGER, `name` VARCHAR(255), FOREIGN KEY (idVersion) REFERENCES Version(id))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `People` (`id` INTEGER PRIMARY KEY, `firstname` VARCHAR(255), `lastname` VARCHAR(255), `birthDate` BIGINT, FOREIGN KEY (id) REFERENCES Resource(id))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `Car` (`id` INTEGER PRIMARY KEY, `model` VARCHAR(255), `owner` INTEGER, FOREIGN KEY (id) REFERENCES Resource(id), FOREIGN KEY (owner) REFERENCES People(id))', bind: [] });
    flux.context.connector = connector;
    flux.setFirstElements([createSqlControlCenter]);
    flux.continue();
  }, destroy) },
  { name: "postgres (npm pg)", tests: createTests(async function postgresCC(flux) {
    const pg = require('pg');
    const init = PostgresDBConnectorFactory(pg, { host: 'localhost', user: 'postgres', password: "my-secret-pw", database: "postgres" }, { max: 1 });
    await init.unsafeRun({ sql: 'DROP DATABASE IF EXISTS aspects', bind: [] });
    await init.unsafeRun({ sql: 'CREATE DATABASE aspects', bind: [] });
    init.close();
    const connector = PostgresDBConnectorFactory(pg, { host: 'localhost', user: 'postgres', password: "my-secret-pw", database: "aspects" }, { max: 10 });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Version" ("id" SERIAL PRIMARY KEY, "type" VARCHAR(255), "version" INTEGER)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Resource" ("id" SERIAL PRIMARY KEY, "idVersion" INTEGER REFERENCES "Version" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT, "name" VARCHAR(255))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "People" ("id" INTEGER PRIMARY KEY REFERENCES "Resource" ("id"), "firstname" VARCHAR(255), "lastname" VARCHAR(255), "birthDate" BIGINT)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Car" ("id" INTEGER PRIMARY KEY REFERENCES "Resource" ("id"), "model" VARCHAR(255), "owner" INTEGER REFERENCES "People" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT)', bind: [] });
    flux.context.connector = connector;
    flux.setFirstElements([createSqlControlCenter]);
    flux.continue();
  }, destroy) },
  { name: "mssql (npm tedious)", tests: createTests(async function mssqlCC(flux) {
    const tedious = require('tedious');
    const connector = MSSQLDBConnectorFactory(tedious, { server: 'localhost', userName: 'sa', password: "7wnjijM9JihtKok4RC6" }, { max: 10 });
    await connector.unsafeRun({ sql: 'DROP DATABASE IF EXISTS aspects', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE DATABASE aspects', bind: [] });
    await connector.unsafeRun({ sql: 'USE aspects', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Version" ("id" INTEGER IDENTITY PRIMARY KEY, "type" VARCHAR(255), "version" INTEGER)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Resource" ("id" INTEGER IDENTITY PRIMARY KEY, "idVersion" INTEGER, "name" VARCHAR(255), FOREIGN KEY (idVersion) REFERENCES Version(id))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "People" ("id" INTEGER PRIMARY KEY, "firstname" VARCHAR(255), "lastname" VARCHAR(255), "birthDate" BIGINT, FOREIGN KEY (id) REFERENCES Resource(id))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Car" ("id" INTEGER PRIMARY KEY, "model" VARCHAR(255), "owner" INTEGER, FOREIGN KEY (id) REFERENCES Resource(id), FOREIGN KEY (owner) REFERENCES People(id))', bind: [] });
    flux.context.connector = connector;
    flux.setFirstElements([createSqlControlCenter]);
    flux.continue();
  }, destroy) }
  { name: "oracle (npm oracledb)", tests: createTests(async function oracleCC(flux) {
    const oracledb = require('oracledb');
    const connector = OracleDBConnectorFactory(oracledb, { connectString: '(DESCRIPTION = (ADDRESS_LIST = (ADDRESS = (PROTOCOL = TCP)(HOST = 127.0.0.1)(PORT = 1521)))(CONNECT_DATA = (SERVICE_NAME = XE)))', user: 'system', password: "oracle" }, { max: 1 });
    await connector.unsafeRun({ sql: 'DROP TABLE "People" CASCADE CONSTRAINTS', bind: [] }).catch(err => { console.info(err); });
    await connector.unsafeRun({ sql: 'DROP TABLE "Car" CASCADE CONSTRAINTS', bind: [] }).catch(err => { console.info(err); });
    await connector.unsafeRun({ sql: 'DROP TABLE "Version" CASCADE CONSTRAINTS', bind: [] }).catch(err => { console.info(err); });
    await connector.unsafeRun({ sql: 'DROP TABLE "Resource" CASCADE CONSTRAINTS', bind: [] }).catch(err => { console.info(err); });
    await connector.unsafeRun({ sql: 'DROP SEQUENCE VersionSeq', bind: [] }).catch(err => { console.info(err); });
    await connector.unsafeRun({ sql: 'DROP SEQUENCE ResourceSeq', bind: [] }).catch(err => { console.info(err); });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Version" ("id" INTEGER PRIMARY KEY NOT NULL, "type" VARCHAR(255), "version" INTEGER)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE SEQUENCE VersionSeq START WITH 1', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE OR REPLACE TRIGGER VersionAID BEFORE INSERT ON "Version"\nFOR EACH ROW\nBEGIN\nSELECT VersionSeq.NEXTVAL INTO :new."id" FROM dual;\nEND;', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Resource" ("id" INTEGER PRIMARY KEY NOT NULL, "idVersion" INTEGER, "name" VARCHAR(255), FOREIGN KEY ("idVersion") REFERENCES "Version"("id"))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE SEQUENCE ResourceSeq START WITH 1', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE OR REPLACE TRIGGER ResourceAID BEFORE INSERT ON "Resource"\nFOR EACH ROW\nBEGIN\nSELECT ResourceSeq.NEXTVAL INTO :new."id" FROM dual;\nEND;', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "People" ("id" INTEGER PRIMARY KEY, "firstname" VARCHAR(255), "lastname" VARCHAR(255), "birthDate" NUMBER(19, 0), FOREIGN KEY ("id") REFERENCES "Resource"("id"))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Car" ("id" INTEGER PRIMARY KEY, "model" VARCHAR(255), "owner" INTEGER, FOREIGN KEY ("id") REFERENCES "Resource"("id"), FOREIGN KEY ("owner") REFERENCES "People"("id"))', bind: [] });
    flux.context.connector = connector;
    flux.setFirstElements([createSqlControlCenter]);
    flux.continue();
  }, destroy) },
];
