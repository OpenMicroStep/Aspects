import {
  resolver, FileElement, File, Reporter, AttributeTypes, AssociateElement,
} from '@openmicrostep/msbuildsystem.core';
import { JSTarget, JSCompilers } from '@openmicrostep/msbuildsystem.js';
import { TypescriptCompiler } from '@openmicrostep/msbuildsystem.js.typescript';
import *  as path from 'path';
import { ParseAspectInterfaceTask, InterfaceFileGroup } from './index';


@JSCompilers.declare(['aspects'])
export class AspectTypescriptCompiler extends TypescriptCompiler {
  constructor(graph: JSTarget) {
    super(graph);
    this.name.name = "aspects";
  }

  @resolver(AssociateElement.groupValidator(FileElement.validateFile, {
    header:       { validator: AttributeTypes.validateString, default: "" },
    customHeader: { validator: AttributeTypes.validateString, default: "" }
  }))
  interfaces: InterfaceFileGroup[] = [];

  @resolver(AttributeTypes.validateString)
  aspect: string = "";

  parsers: ParseAspectInterfaceTask[];

  buildGraph(reporter: Reporter) {
    super.buildGraph(reporter);
    let dest = File.getShared(path.join(this.graph.paths.intermediates, 'generated'), true);
    this.parsers = this.interfaces.map(i => new ParseAspectInterfaceTask(this, i, dest));
    this.parsers.forEach(p => this.tsc.addDependency(p));
  }
}
