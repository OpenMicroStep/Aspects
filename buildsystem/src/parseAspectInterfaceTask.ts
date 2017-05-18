import {
  Element, ElementDefinition, ComponentElement,
  File, Graph, InOutTask, Directory, Step
} from '@openmicrostep/msbuildsystem.core';
import *  as path from 'path';
import { AspectRootElement, parseInterface, elementFactories } from './index';

export type InterfaceFileGroup = ComponentElement.Group<File, { header: string; customHeader: string; }>;

export class ParseAspectInterfaceTask extends InOutTask {
  constructor(graph: Graph, public src: InterfaceFileGroup, public dest: File) {
    super({ type: "aspect parser", name: "interfaces" }, graph, src.elements, [dest]);
  }

  uniqueKey() {
    return { ...super.uniqueKey(), customHeader: this.src.customHeader, header: this.src.header };
  }
  
  do_build(step: Step<{}>) {
    let root = new AspectRootElement('root', 'root', null);
    step.setFirstElements([
      this.inputFiles.map(inputFile => (step: Step<{}>) => {
        inputFile.readUtf8File((err, content) => {
          if (err) {
            step.context.reporter.error(err);
            step.continue();
          }
          else {
            let ret = parseInterface(step.context.reporter, content);
            if (!step.context.reporter.failed)
              Element.load(step.context.reporter, ret as ElementDefinition,  root, elementFactories);
            step.continue();
          }
        });
      }),
      (step: Step<{}>) => {
        let r = this.src.customHeader || `import {ControlCenter, VersionedObject, VersionedObjectConstructor, FarImplementation, Invocation, ImmutableList, ImmutableSet, ImmutableObject} from '@openmicrostep/aspects';`;
        r += `\n${this.src.header}\n`;
        root.__classes.forEach(cls => {
          r += cls.__decl();
        });
        this.dest.writeUtf8File(r, (err) => {
          step.context.reporter.error(err);
          step.continue();
        });
      }
    ]);
    step.continue();
  }
}
