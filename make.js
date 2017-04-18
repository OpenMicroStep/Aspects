module.exports =  {
  is: "project",
  name: "Aspects",
  "ts base=": { is: 'component', type: "javascript", compiler: "aspects",
      npmPackage: [{ is: "component",
        "version": "0.2.9",
      }],
      tsConfig: [{ is: "component",
        "module": "commonjs",
        "target": "es6",
        "declaration": true,
        "sourceMap": true,
        "moduleResolution": "node",
        "experimentalDecorators": true,
        "strictNullChecks": true,
        "skipLibCheck": true,
        "noImplicitThis": true,
        "noImplicitReturns": true,
        "lib": ["es6"]
    }]
  },
  "test=": {
    is: 'component',
    components: ["=ts base"],
    tsConfig: [{ is: "component",
      "types": ["chai"]
    }],
    npmPackage: [{ is: "component",
      dependencies: [{ is: "component",
        "chai": "^3.5.0"
      }],
      devDependencies: [{ is: "component", 
        "@types/chai": "^3.4.29",
        "@openmicrostep/tests": "^0.1.0"
      }]
    }]
  },
  "node=": {
    is: 'component', 
    tsConfig: [{ is: "component",
      "module": "commonjs",
      "types": ["node"]
    }],
    npmPackage: [{ is: "component",
      devDependencies: [{ is: "component", 
        "@types/node": "^4.0.30"
      }]
    }],
  },
  "browser=": { 
    is: 'component', 
    tsConfig: [{ is: "component",
      "module": "commonjs",
      "lib": ["dom"]
    }],
  },
  "envs=": { is: 'group',
    "js=": {
      is: 'environment', 
      packager: "npm",
      components: ["=ts base"]
    },
  },
  "Files=": { is: 'group', elements: [
      { is: 'group', name: 'core', path: 'typescript/core/', elements: [
        { is: 'group', name: 'src', path: 'src/', elements: [
          { is: 'file', name: 'core.ts', tags: ['tsc'] },
          { is: 'file', name: 'datasource.interface.md', tags: ['interface'] },
        ]},
        { is: 'group', name: 'tst', path: 'tst/', elements: [
          { is: 'file', name: 'core.spec.ts', tags: ['tsc'] },
          { is: 'file', name: 'resource.interface.md', tags: ['interface'] },
        ]},
      ]},
      { is: 'group', name: 'datasource.sql', path: 'typescript/datasource.sql/', elements: [
        { is: 'group', name: 'src', path: 'src/', elements: [
          { is: 'file', name: 'index.ts', tags: ['tsc'] },
        ]},
        { is: 'group', name: 'tst', path: 'tst/', elements: [
          { is: 'file', name: 'datasource.sequelize.spec.ts', tags: ['tsc'] },
          { is: 'file', name: 'resource.interface.md', tags: ['interface'] },
        ]},
      ]},
      { is: 'group', name: 'transport.express', path: 'typescript/transport.express/src', elements: [
        { is: 'file', name: 'transport.express.ts', tags: ['tsc'] }
      ]},
      { is: 'group', name: 'transport.xhr', path: 'typescript/transport.xhr/src', elements: [
        { is: 'file', name: 'transport.xhr.ts', tags: ['tsc'] }
      ]},
  ]},
  "typescript targets=": { is: 'group',
    "aspects core=":  {
      is: 'target',
      outputName: "@openmicrostep/aspects",
      environments: ["=envs:js"],
      files: ["=Files:core:src ? tsc"],
      interfaces: [{ 
        is: "associate",
        elements: ["=Files:core:src ? interface"], 
        customHeader: "import {ControlCenter, VersionedObject, VersionedObjectConstructor, FarImplementation, Invocation, DataSourceInternal, ImmutableList, ImmutableSet, ImmutableObject} from '../typescript/core/src/core';\nimport ObjectSet = DataSourceInternal.ObjectSet;"  
      }],
      npmPackage: [{ is: "component",
        "main": "typescript/core/src/core.js",
        "typings": "typescript/core/src/core.d.ts",
        "dependencies": [{ is: "component",
          "@openmicrostep/async": "^0.1.0",
          "ajv": "^4.9.0",
          "@openmicrostep/mstools": "^1.0.2",
          "immutable": "^3.8.1"
        }],
        "devDependencies": [{ is: "component",
          "@openmicrostep/async": "^0.1.0",
          "ajv": "^4.9.0",
          "@types/ajv": "^0.0.4",
          "@openmicrostep/mstools": "^1.0.2",
          "immutable": "^3.8.1"
        }],
      }],
    },
    "core.tests=":  {
      is: 'target',
      outputName: "@openmicrostep/aspects.tests",
      environments: ["=envs:js"],
      files: ["=Files:core:tst ? tsc"],
      targets: ["aspects core"],
      components: ["=test", "=::aspects core::", "=node"],
      interfaces: ["=Files:core:tst ? interface"],
    },
    "express=": {
      is: 'target',
      outputName: "@openmicrostep/aspects.express",
      targets: ["aspects core"],
      components: ["=::aspects core::", "=node"],
      environments: ["=envs:js"],
      files: ["=Files:transport.express ? tsc"],
      npmPackage: [{ is: "component",
        "main": "transport.express.js",
        "typings": "transport.express.d.ts",
        "devDependencies": [{ is: "component",
          "express": "^4.14.0",
          "@types/express": "^4.0.34",
          "express-serve-static-core": "^0.1.1",
          "@types/body-parser": "^0.0.33",
          "body-parser": "^1.15.2",
          "@openmicrostep/mstools": "^1.0.2"
        }],
      }],
    },
    "sql=": {
      is: 'target',
      outputName: "@openmicrostep/aspects.sql",
      targets: ["aspects core"],
      components: ["=::aspects core::", "=node"],
      environments: ["=envs:js"],
      files: ["=Files:datasource.sql:src ? tsc"],
      npmPackage: [{ is: "component",
        "main": "index.js",
        "typings": "index.d.ts",
        "devDependencies": [{ is: "component",
          "@openmicrostep/msbuildsystem.shared": "^0.3.0",
          "sequelize": "^3.27.0",
          "@types/sequelize": "^4.0.39"
        }],
      }],
    },
    "sql.tests=": {
      is: 'target',
      outputName: "@openmicrostep/aspects.sql.tests",
      targets: ["aspects core", "sql"],
      components: ["=test", "=::aspects core::", "=::sql::", "=node"],
      environments: ["=envs:js"],
      files: ["=Files:datasource.sql:tst ? tsc"],
      interfaces: ["=Files:datasource.sql:tst ? interface"],
      npmPackage: [{ is: "component",
        "devDependencies": [{ is: "component",
          "sequelize": "^3.27.0",
          "@types/sequelize": "^4.0.39",
          "sqlite3": "^3.1.8"
        }],
      }],
    },
    "client=": {
      is: 'target',
      packager: "npm",
      outputName: "@openmicrostep/aspects.xhr",
      npmPackage: [{ is: "component",
        "main": "transport.xhr.js",
        "typings": "transport.xhr.d.ts",
        "devDependencies": [{ is: "component",
          "@openmicrostep/mstools": "^1.0.2"
        }],
      }],
      targets: ["aspects core"],
      components: ["=::aspects core::", "=browser"],
      environments: ["=envs:js"],
      files: ["=Files:transport.xhr ? tsc"],
    }
  }
};
