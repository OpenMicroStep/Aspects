import {
  Element, ElementDefinition,
  File, Graph, InOutTask, Directory, Step
} from '@msbuildsystem/core';
import *  as path from 'path';
import { AspectRootElement, parseInterface, elementFactories } from './index';

export type InterfaceFileGroup = {
    values: File[];
    ext: {
        header: string;
        customHeader: string;
    };
}

export class ParseAspectInterfaceTask extends InOutTask {
  constructor(graph: Graph, public src: InterfaceFileGroup, public dest: Directory) {
    super({ type: "aspect parser", name: "interfaces" }, graph, src.values, []);
  }

  uniqueKey() {
    return Object.assign(super.uniqueKey(), {
      dest: this.dest.path,
      ext: this.src.ext
    });
  }
  isRunRequired(step: Step<{ runRequired?: boolean }>) {
    step.context.runRequired = true;
      step.continue();
  }
  run(step: Step<{}>) {
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
        let dest = File.getShared(path.join(this.dest.path, `aspects.interfaces.ts`));
        let r = this.src.ext.customHeader || `import {ControlCenter, VersionedObject, VersionedObjectConstructor, FarImplementation, Invocation} from '@microstep/aspects';`;
        r += `\n${this.src.ext.header}\n`;
        root.__classes.forEach(cls => {
          r += cls.__decl();
        });
        dest.writeUtf8File(r, (err) => {
          step.context.reporter.error(err);
          step.continue();
        });
      }
    ]);
    step.continue();
  }

  clean(step) {
    // TODO
    step.continue();
  }
}
