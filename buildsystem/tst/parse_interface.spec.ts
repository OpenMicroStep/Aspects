import {Workspace, Runner, RunnerContext, RootGraph, File, Flux} from '@msbuildsystem/core';
import {ParseAspectInterfaceTask} from '@msbuildsystem/aspects';
import {assert} from 'chai';
import * as path from 'path';
import * as fs from 'fs';


function test_parse(f: Flux<RunnerContext>, file: string) {
  let w = Workspace.createTemporary();
  let g = new RootGraph(w);
  let task = new ParseAspectInterfaceTask(g, {
    values: [File.getShared(path.join(__dirname, `data/${file}.md`), true)],
    ext: { header: '', customHeader: '' }
  }, File.getShared(path.join(w.directory, `${file}`), true));
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

export const tests = {
  name: 'parse interface',
  tests: [
    datasource,
    resource
  ]
};
