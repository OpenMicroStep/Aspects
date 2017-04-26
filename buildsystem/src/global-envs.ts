import {Element, Workspace, Reporter, Project} from '@openmicrostep/msbuildsystem.core';

let reporter: Reporter | null = new Reporter();
Element.load(reporter, {
  is: "root",
  "openms.aspects.angular=": {
    is: "environment", 
    type: "javascript", compiler: "aspects", packager: "npm",
    tsConfig: [{ is: "component",
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
    }],
    npmPackage: [{ is: "component",
      dependencies: [{ is: "component",
        "@angular/common": "~2.3.0",
        "@angular/compiler": "~2.3.0",
        "@angular/core": "~2.3.0",
        "@angular/forms": "~2.3.0",
        "@angular/http": "~2.3.0",
        "@angular/platform-browser": "~2.3.0",
        "@angular/platform-browser-dynamic": "~2.3.0",
        "@angular/router": "~3.3.0",

        "angular-in-memory-web-api": "~0.2.0",
        "systemjs": "0.19.40",
        "core-js": "^2.4.1",
        "reflect-metadata": "^0.1.8",
        "rxjs": "5.0.0-rc.4",
        "zone.js": "^0.7.2",

        "@openmicrostep/mstools": "^1.0.2",
        "@openmicrostep/async": "^0.1.1",
        "@openmicrostep/aspects": "^0.4.0",
        "@openmicrostep/aspects.xhr": "^0.4.0",
      }],
    }],
  },
  "openms.aspects.node=": {
    is: "environment",
    type: "javascript", compiler: "aspects", packager: "npm",
    tsConfig: [{ is: "component",
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
    }],
    npmPackage: [{
      is: "component",
      dependencies: [{ is: "component",
        "@openmicrostep/mstools": "^1.0.2",
        "@openmicrostep/async": "^0.1.0",
        "@openmicrostep/aspects": "^0.4.0",
        "@openmicrostep/aspects.express": "^0.4.0",
        "@openmicrostep/aspects.sql": "^0.4.0",
        "express": "^4.14.0",
        "body-parser": "^1.15.2",
        "express-serve-static-core": "^0.1.1",
        "source-map-support": "^0.4.11",
      }],
      devDependencies: [{ is: "component",
        "@types/express": "^4.0.34",
        "@types/node": "^4.0.30",
      }]
    }],
  }
}, Workspace.globalRoot, Project.elementFactories);
if (reporter.diagnostics.length)
  console.warn("error while loading global envs", reporter.diagnostics);
reporter = null;
