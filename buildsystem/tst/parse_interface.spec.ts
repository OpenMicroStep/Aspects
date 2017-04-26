import {Reporter, Workspace, Runner, RunnerContext, RootGraph, File, Flux} from '@openmicrostep/msbuildsystem.core';
import {ParseAspectInterfaceTask, parseInterface} from '@openmicrostep/msbuildsystem.aspects';
import {assert} from 'chai';
import * as path from 'path';
import * as fs from 'fs';


function test_parse(f: Flux<RunnerContext>, file: string) {
  let w = Workspace.createTemporary();
  let g = new RootGraph(w);
  let task = new ParseAspectInterfaceTask(g, {
    values: [File.getShared(path.join(__dirname, `data/${file}.md`), true)],
    ext: { header: '', customHeader: '' }
  }, File.getShared(path.join(w.directory, `${file}/aspects.interfaces.ts`)));
  let runner = new Runner(g, 'build');
  runner.on('taskend', (ctx) => {
    if (ctx.task === task)
      assert.deepEqual(ctx.reporter.diagnostics, []);
  });
  f.setFirstElements([
    f => runner.run(f),
    f => {
      assert.equal(f.context.failed, false);
      assert.deepEqual(
        fs.readFileSync(path.join(w.directory, `${file}/aspects.interfaces.ts`), 'utf8'),
        fs.readFileSync(path.join(__dirname, `data/${file}.ts`), 'utf8'));
      f.continue();
    }
  ]);
  f.continue();
}

function datasource(f: Flux<RunnerContext>) {
  test_parse(f, 'datasource');
}
function resource(f: Flux<RunnerContext>) {
  test_parse(f, 'resource');
}
function person_and_cat_ts(f: Flux<RunnerContext>) {
  test_parse(f, 'person');
}
function person_and_cat() {
  let reporter = new Reporter();
  let elements = parseInterface(reporter, fs.readFileSync(path.join(__dirname, `data/person.md`), 'utf8'));
  assert.deepEqual(elements, {
    "Person=":{
       is:"class",
      "name":"Person",
      "attributes=": { is:"group",
        "_firstName=": { is: "attribute", name: "_firstName", type: { is: "type", type: "primitive", "name": "string" }},
        "_lastName=" : { is: "attribute", name: "_lastName" , type: { is: "type", type: "primitive", "name": "string" }},
        "_birthDate=": { is: "attribute", name: "_birthDate", type: { is: "type", type: "primitive", "name": "date"   }},
        "_mother="   : { is: "attribute", name: "_mother"   , type: { is: "type", type: "class"    , "name": "Person" }},
        "_father="   : { is: "attribute", name: "_father"   , type: { is: "type", type: "class"    , "name": "Person" }},
        "_cats="     : { is: "attribute", name: "_cats"     , 
          type: { is: "type", type: "array"    , "min":0,"max":"*","itemType":{ is:"type","type":"class", name: "Cat"} },
          relation: "_owner" }},
      "queries=": { is: "group",
        "_sons="     : { is: "query"    , name: "_sons"     , 
          type: { is: "type", type: "array"    , "min":0,"max":"*","itemType":{ is:"type","type":"class", name: "Person"} },
          query: "{\n  \"instanceOf\": \"Person\",\n  \"$or\": [\n    { \"_father\": { \"$eq\": \"=self\" } },\n    { \"_mother\": { \"$eq\": \"=self\" } }\n  ]\n}\n"}},
      "categories=": { is:"group",
        "core=":{ is:"category", name: "core","methods":[
          { is:"method", name: "firstName","arguments":[],"return":{ is:"type","type":"primitive", name: "string"}},
          { is:"method", name: "lastName" ,"arguments":[],"return":{ is:"type","type":"primitive", name: "string"}},
          { is:"method", name: "fullName" ,"arguments":[],"return":{ is:"type","type":"primitive", name: "string"}},
          { is:"method", name: "birthDate","arguments":[],"return":{ is:"type","type":"primitive", name: "date"  }}]},
        "calculation=":{ is:"farCategory", name: "calculation","methods":[
          { is:"method", name: "age"      ,"arguments":[],"return":{ is:"type","type":"primitive", name: "integer"}}]}},
      "aspects=": { is:"group" },
      "queries"   : ["=queries:_sons"],
      "attributes":["=attributes:_firstName","=attributes:_lastName","=attributes:_birthDate","=attributes:_mother","=attributes:_father","=attributes:_cats"],
      "categories"   : ["=categories:core"],
      "farCategories": ["=categories:calculation"],
      "aspects" :[]},
    "Cat=": { is:"class", name: "Cat",
      "attributes=":{ is:"group",
        "_owner=": { is:"attribute", name: "_owner",
          type: { is:"type","type":"class", name: "Person"},
          relation: "_cats" }},
      "queries=": { is:"group" },
      "categories=": { is:"group" },
      "aspects=": { is:"group" },
      "attributes": ["=attributes:_owner"],
      "queries"   : [],
      "categories"   : [],
      "farCategories": [],
      "aspects" : []}
  });
}

export const tests = {
  name: 'parse interface',
  tests: [
    person_and_cat,
    datasource,
    resource,
    person_and_cat_ts
  ]
};
