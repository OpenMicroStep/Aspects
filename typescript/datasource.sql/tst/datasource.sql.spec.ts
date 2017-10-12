import {ControlCenter, AspectConfiguration, AspectSelection} from '@openmicrostep/aspects';
import {
  SqlDataSource, loadSqlMappers,
  SqliteDBConnectorFactory, MySQLDBConnectorFactory, PostgresDBConnectorFactory, MSSQLDBConnectorFactory,
} from '@openmicrostep/aspects.sql';
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
          { is: "sql-mapped-attribute", name: "_version"   , insert: "=V", path: [{ is: "sql-path", table: "Resource", key: "id"    , value: "idVersion" },
                                                                                  { is: "sql-path", table: "Version" , key: "id"    , value: "version"   , where: { type: "Resource" } }]
          , fromDb: v => v - 100      , toDb: v => v + 100 },
          { is: "sql-mapped-attribute", name: "_name"      , insert: "=R", path: [{ is: "sql-path", table: "Resource", key: "id"    , value: "name"      }] },
          { is: "sql-mapped-attribute", name: "_firstname" , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "firstname" }] },
          { is: "sql-mapped-attribute", name: "_lastname"  , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "lastname"  }] },
          { is: "sql-mapped-attribute", name: "_birthDate" , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "birthDate" }]
          , fromDb: v => new Date(+v) , toDb: d => d.getTime() },
          { is: "sql-mapped-attribute", name: "_father"    , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "father"    }] },
          { is: "sql-mapped-attribute", name: "_mother"    , insert: "=P", path: [{ is: "sql-path", table: "People"  , key: "id"    , value: "mother"    }] },
          { is: "sql-mapped-attribute", name: "_childrens_by_father"     , path: [{ is: "sql-path", table: "People"  , key: "father", value: "id"        }] },
          { is: "sql-mapped-attribute", name: "_childrens_by_mother"     , path: [{ is: "sql-path", table: "People"  , key: "mother", value: "id"        }] },
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
          { is: "sql-mapped-attribute", name: "_drivers"                 , path: [{ is: "sql-path", table: "Drivers" , key: "car"   , value: "people"    }] },
      ]
    }
  });

  let cfg = new AspectConfiguration(new AspectSelection([
    Car.Aspects.test1,
    People.Aspects.test1,
    SqlDataSource.Aspects.server,
  ]));
  let cc = new ControlCenter(cfg);
  let ccc = cc.registerComponent({});
  let db = SqlDataSource.Aspects.server.create(ccc, mappers, flux.context.connector, flux.context.connector.maker);
  Object.assign(flux.context, {
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
    const connector = SqliteDBConnectorFactory(sqlite3, { filename: 'test.sqlite' }, { max: 1 });
    await connector.unsafeRun({ sql: 'CREATE TABLE IF NOT EXISTS `Version` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `type` VARCHAR(255), `version` INTEGER)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE IF NOT EXISTS `Resource` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `idVersion` INTEGER REFERENCES `Version` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT, `name` VARCHAR(255))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE IF NOT EXISTS `People` (`id` INTEGER PRIMARY KEY REFERENCES `Resource` (`id`), `firstname` VARCHAR(255), `lastname` VARCHAR(255), `birthDate` DATETIME, `father` INTEGER REFERENCES `People` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT, `mother` INTEGER REFERENCES `People` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE IF NOT EXISTS `Car` (`id` INTEGER PRIMARY KEY REFERENCES `Resource` (`id`), `model` VARCHAR(255), `owner` INTEGER REFERENCES `People` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT)', bind: [] });
    await connector.unsafeRun({ sql: 'DELETE FROM `Version`', bind: [] });
    await connector.unsafeRun({ sql: 'DELETE FROM `Resource`', bind: [] });
    await connector.unsafeRun({ sql: 'DELETE FROM `People`', bind: [] });
    await connector.unsafeRun({ sql: 'DELETE FROM `Car`', bind: [] });
    flux.context.connector = connector;
    flux.setFirstElements([createSqlControlCenter]);
    flux.continue();
  }, destroy) },
  { name: "mysql (npm mysql2)", tests: createTests(async function mysqlCC(flux) {
    const host = process.env.MYSQL_PORT_3306_TCP_ADDR || 'localhost';
    const port = +(process.env.MYSQL_PORT_3306_TCP_PORT || '3306');
    const mysql2 = require('mysql2');
    const connector = MySQLDBConnectorFactory(mysql2, { host: host, port: port, user: 'root', password: "my-secret-pw", database: "" }, { max: 1 });
    await connector.unsafeRun({ sql: 'DROP DATABASE IF EXISTS aspects', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE DATABASE aspects', bind: [] });
    await connector.unsafeRun({ sql: 'USE aspects', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `Version` (`id` INTEGER PRIMARY KEY AUTO_INCREMENT, `type` VARCHAR(255), `version` INTEGER)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `Resource` (`id` INTEGER PRIMARY KEY AUTO_INCREMENT, `idVersion` INTEGER, `name` VARCHAR(255), FOREIGN KEY (idVersion) REFERENCES Version(id))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `People` (`id` INTEGER PRIMARY KEY, `firstname` VARCHAR(255), `lastname` VARCHAR(255), `birthDate` BIGINT, `father` INTEGER, `mother` INTEGER, FOREIGN KEY (id) REFERENCES Resource(id), FOREIGN KEY (father) REFERENCES People(id), FOREIGN KEY (mother) REFERENCES People(id))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE `Car` (`id` INTEGER PRIMARY KEY, `model` VARCHAR(255), `owner` INTEGER, FOREIGN KEY (id) REFERENCES Resource(id), FOREIGN KEY (owner) REFERENCES People(id))', bind: [] });
    flux.context.connector = connector;
    flux.setFirstElements([createSqlControlCenter]);
    flux.continue();
  }, destroy) },
  { name: "postgres (npm pg)", tests: createTests(async function postgresCC(flux) {
    const host = process.env.POSTGRES_PORT_5432_TCP_ADDR || 'localhost';
    const port = +(process.env.POSTGRES_PORT_5432_TCP_PORT || '5432');
    const pg = require('pg');
    const init = PostgresDBConnectorFactory(pg, { host: host, port: port, user: 'postgres', password: "my-secret-pw", database: "postgres" }, { max: 1 });
    await init.unsafeRun({ sql: 'DROP DATABASE IF EXISTS aspects', bind: [] });
    await init.unsafeRun({ sql: 'CREATE DATABASE aspects', bind: [] });
    init.close();
    const connector = PostgresDBConnectorFactory(pg, { host: host, port: port, user: 'postgres', password: "my-secret-pw", database: "aspects" }, { max: 1 });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Version" ("id" SERIAL PRIMARY KEY, "type" VARCHAR(255), "version" INTEGER)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Resource" ("id" SERIAL PRIMARY KEY, "idVersion" INTEGER REFERENCES "Version" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT, "name" VARCHAR(255))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "People" ("id" INTEGER PRIMARY KEY REFERENCES "Resource" ("id"), "firstname" VARCHAR(255), "lastname" VARCHAR(255), "birthDate" BIGINT, "father" INTEGER REFERENCES "People" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT, "mother" INTEGER REFERENCES "People" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Car" ("id" INTEGER PRIMARY KEY REFERENCES "Resource" ("id"), "model" VARCHAR(255), "owner" INTEGER REFERENCES "People" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT)', bind: [] });
    flux.context.connector = connector;
    flux.setFirstElements([createSqlControlCenter]);
    flux.continue();
  }, destroy) },
  { name: "mssql (npm tedious)", tests: createTests(async function mssqlCC(flux) {
    const host = process.env.MICROSOFT_MSSQL_SERVER_LINUX_PORT_1433_TCP_ADDR || 'localhost';
    const port = +(process.env.MICROSOFT_MSSQL_SERVER_LINUX_PORT_1433_TCP_PORT || '1433');
    const tedious = require('tedious');
    const connector = MSSQLDBConnectorFactory(tedious, { server: host, options: { port: port }, userName: 'sa', password: "7wnjijM9JihtKok4RC6" }, { max: 1 });
    await connector.unsafeRun({ sql: 'DROP DATABASE IF EXISTS aspects', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE DATABASE aspects', bind: [] });
    await connector.unsafeRun({ sql: 'USE aspects', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Version" ("id" INTEGER IDENTITY PRIMARY KEY, "type" VARCHAR(255), "version" INTEGER)', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Resource" ("id" INTEGER IDENTITY PRIMARY KEY, "idVersion" INTEGER, "name" VARCHAR(255), FOREIGN KEY (idVersion) REFERENCES Version(id))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "People" ("id" INTEGER PRIMARY KEY, "firstname" VARCHAR(255), "lastname" VARCHAR(255), "birthDate" BIGINT, "father" INTEGER, "mother" INTEGER, FOREIGN KEY (id) REFERENCES Resource(id), FOREIGN KEY (father) REFERENCES People(id), FOREIGN KEY (mother) REFERENCES People(id))', bind: [] });
    await connector.unsafeRun({ sql: 'CREATE TABLE "Car" ("id" INTEGER PRIMARY KEY, "model" VARCHAR(255), "owner" INTEGER, FOREIGN KEY (id) REFERENCES Resource(id), FOREIGN KEY (owner) REFERENCES People(id))', bind: [] });
    flux.context.connector = connector;
    flux.setFirstElements([createSqlControlCenter]);
    flux.continue();
  }, destroy) },
  /*{ name: "oracle (npm oracledb)", tests: createTests(async function oracleCC(flux) {
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
  }, destroy) },*/
];
