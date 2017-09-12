import {
  FileElement, File, Reporter, AttributeTypes as V, ComponentElement,
} from '@openmicrostep/msbuildsystem.core';
import { JSTarget, JSCompilers } from '@openmicrostep/msbuildsystem.js';
import { TypescriptCompiler } from '@openmicrostep/msbuildsystem.js.typescript';
import *  as path from 'path';
import { ParseAspectInterfaceTask, InterfaceFileGroup } from './index';


export class AspectTypescriptCompiler extends TypescriptCompiler {
  constructor(graph: JSTarget) {
    super(graph);
    this.name.name = "aspects";
  }

  interfaces: InterfaceFileGroup[] = [];

  parsers: ParseAspectInterfaceTask[];

  buildGraph(reporter: Reporter) {
    super.buildGraph(reporter);
    let dest = File.getShared(path.join(this.graph.paths.intermediates, 'generated', `aspects.interfaces.ts`));
    this.parsers = this.interfaces.map(i => new ParseAspectInterfaceTask(this, i, dest));
    this.parsers.forEach(p => this.tsc.addDependency(p));
  }
}
JSCompilers.register(['aspects'], AspectTypescriptCompiler, {
  interfaces: V.defaultsTo(ComponentElement.groupValidator(
    FileElement.validateFile, {
      header:       V.defaultsTo(V.validateString , ""),
      customHeader: V.defaultsTo(V.validateString , ""),
    }), []),

});
