import {Element, Workspace, Reporter, Project} from '@openmicrostep/msbuildsystem.core';

let reporter: Reporter | null = new Reporter();
Element.load(reporter, {
  is: "root",
  "openms.aspects.angular=": {
    is: "environment",
    components: [{
      is: "component", name: "target",
      type: "javascript", compiler: "aspects", packager: "npm",
      tsConfig: { is: "component",
        "target": "es6",
        "declaration": true,
        "sourceMap": true,
        "skipLibCheck": true,
        "moduleResolution": "node",
        "experimentalDecorators": true,
        "emitDecoratorMetadata": true,
        "strictNullChecks": true,
        "noImplicitThis": true,
        "noImplicitReturns": true,
        "module": "commonjs",
        "lib": ["es6", "dom"]
      }
    }, {
      is: "component", name: "angular",
      npmPackage: { is: "component",
        dependencies: { is: "component",
          "systemjs": "0.19.40",
          "core-js": "^2.4.1",
          "rxjs": "^5.5.5",
          "zone.js": "^0.8.4",
          "@angular/common": "^5.1.1",
          "@angular/compiler": "^5.1.1",
          "@angular/core": "^5.1.1",
          "@angular/forms": "^5.1.1",
          "@angular/http": "^5.1.1",
          "@angular/platform-browser": "^5.1.1",
          "@angular/platform-browser-dynamic": "^5.1.1",
          "@angular/router": "^5.1.1",
          "@angular/animations": "^5.1.1",
          "angular-in-memory-web-api": "^0.5.2",

          "@openmicrostep/msbuildsystem.shared": "^0.7.0",
        },
      }
    }, {
      is: "component", name: "aspects",
      npmPackage: { is: "component",
        dependencies: { is: "component",
          "@openmicrostep/mstools": "^1.0.2",
          "@openmicrostep/async": "^0.1.1",
          "@openmicrostep/aspects": "^0.9.0",
          "@openmicrostep/aspects.xhr": "^0.9.0",
          "@openmicrostep/msbuildsystem.shared": "^0.7.0",
        },
      },
    }],
  },
  "openms.aspects.node=": {
    is: "environment",
    components: [{
      is: "component", name: "target",
      type: "javascript", compiler: "aspects", packager: "npm",
      tsConfig: { is: "component",
        "target": "es6",
        "declaration": true,
        "sourceMap": true,
        "skipLibCheck": true,
        "moduleResolution": "node",
        "experimentalDecorators": true,
        "strictNullChecks": true,
        "noImplicitThis": true,
        "noImplicitReturns": true,
        "lib": ["es6"],
        "module": "commonjs",
        "types": ["node"]
      }
    }, {
      is: "component", name: "express",
      npmPackage: { is: "component",
        dependencies: { is: "component",
          "@openmicrostep/mstools": "^1.0.2",
          "@openmicrostep/async": "^0.1.0",
          "express": "^4.14.0",
          "body-parser": "^1.15.2",
          "source-map-support": "^0.4.11",
        },
        devDependencies: { is: "component",
          "@types/express": "^4.0.34",
          "@types/node": "^6.0.78",
        },
      }
    }, {
      is: "component", name: "aspects",
      npmPackage: { is: "component",
        dependencies: { is: "component",
          "@openmicrostep/mstools": "^1.0.2",
          "@openmicrostep/async": "^0.1.0",
          "@openmicrostep/aspects": "^0.9.0",
          "@openmicrostep/aspects.express": "^0.9.0",
          "@openmicrostep/aspects.sql": "^0.9.0",
          "@openmicrostep/aspects.obi": "^0.9.0",
          "@openmicrostep/msbuildsystem.shared": "^0.7.0",
        },
      },
    }],
  },
  "openms.aspects.angular.dev=": {
      is: "component",
      "js=": { is: "environment" },
      environments: ["=js"],
      targetsByEnvironment: {
        "=js": ["aspects core", "aspects client"],
      },
      componentsByEnvironment: {
        "=js": ["=openms.aspects.angular:target", "=openms.aspects.angular:angular", "=::aspects core::", "=::aspects client::"],
      },
      npmPackage: { is: "component",
        dependencies: { is: "component",
          "@openmicrostep/async": "^0.1.0",
      }
    }
  },
  "openms.aspects.angular.material=": {
    is: "component",
    npmPackage: { is: "component",
      dependencies: { is: "component",
        "@angular/material": "~5.1.0",
        "@angular/cdk": "~5.1.0",
      },
    }
  },
  "openms.aspects.node.dev=": {
      is: "component",
      "js=": { is: "environment" },
      environments: ["=js"],
      targetsByEnvironment: {
        "=js": ["aspects core", "aspects express", "aspects sql", "aspects transport node", "aspects obi"]
      },
      componentsByEnvironment: {
        "=js": ["=openms.aspects.node:target", "=openms.aspects.node:express", "=::aspects core::", "=::aspects express::", "=::aspects transport node::", "=::aspects sql::", "=::aspects obi::"],
      }
  },
  "openms.aspects.node.tests=": {
    is: "component",
    tsConfig: { is: "component",
      "types": ["chai"],
    },
    npmPackage: { is: "component",
      dependencies: { is: "component",
        "chai": "^4.1.2"
      },
      devDependencies: { is: "component",
        "@types/chai": "^4.0.4",
        "@openmicrostep/tests": "^0.1.0"
      },
    }
  },
}, Workspace.globalRoot, Project.elementFactories);
if (reporter.diagnostics.length)
  console.warn("error while loading global envs", reporter.diagnostics);
reporter = null;
