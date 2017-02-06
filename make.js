module.exports =  {
  is: "project",
  name: "Aspects",
  "ts base=": { is: 'component', type: "javascript", compiler: "aspects",
      tsConfig: [{
        "module": "commonjs",
        "target": "es6",
        "declaration": true,
        "sourceMap": true,
        "inlineSources": true,
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
  },
  "js=": { 
    is: 'environment', 
    packager: "npm",
    components: ["=ts base"]
  },
  "node=": {
    is: 'environment', 
    packager: "npm",
    components: ["=ts base"],
    tsConfig: [{
      "module": "commonjs",
      "types": ["node"]
    }],
    npmInstall: [{
      "@types/node": "^4.0.30"
    }],
    compatibleEnvironments: ["js"],
  },
  "browser=": { 
    is: 'environment', 
    //packager: "browserify",
    components: ["=ts base"],
    tsConfig: [{
      "module": "commonjs",
      "lib": ["dom"]
    }],
    compatibleEnvironments: ["js"],
  },

  "Files=": { is: 'group', elements: [
      { is: 'group', name: 'core', path: 'typescript/core/', elements: [
        { is: 'file', name: 'src/core.ts', tags: ['tsc'] },
        { is: 'file', name: 'src/datasource.interface.md', tags: ['interface'] },
        { is: 'file', name: 'tst/core.spec.ts', tags: ['tst'] },
      ]},
      { is: 'group', name: 'transport.express', path: 'typescript/transport.express/src', elements: [
        { is: 'file', name: 'transport.express.ts', tags: ['tsc'] }
      ]},
      { is: 'group', name: 'transport.xhr', path: 'typescript/transport.xhr/src', elements: [
        { is: 'file', name: 'transport.xhr.ts', tags: ['tsc'] }
      ]},
      { is: 'group', name: 'datasource.sequelize', path: 'typescript/datasource.sequelize/src', elements: [
        { is: 'file', name: 'datasource.sequelize.ts', tags: ['tsc'] }
      ]}
  ]},
  "typescript targets=": { is: 'group',
    "core=":  {
      is: 'target',
      outputName: "@microstep/aspects",
      environments: ["=browser", "=node"],
      files: ["=Files:core ? tsc"],
      interfaces: [{ 
        value: ["=Files:core ? interface"], 
        aspect: "aspects_core",
        customHeader: "import {VersionedObject, VersionedObjectConstructor, FarImplementation, Invocation, DataSourceInternal} from '../typescript/core/src/core';\nimport ObjectSet = DataSourceInternal.ObjectSet;"  
      }],
      tsMain: "core.ts", 
      packager: "npm",
      //tsConfig: [{ traceResolution: true }],
      npmPackage: [{
        "version": "0.1.3",
        "main": "typescript/src/core.js",
        "typings": "typescript/src/core.d.ts",
        "dependencies": {
          "@microstep/async": "^0.1.0",
          "ajv": "^4.9.0",
          "@microstep/mstools": "^1.0.2"
        }
      }],
      npmInstall: [{
        "@microstep/async": "^0.1.0",
        "ajv": "^4.9.0",
        "@types/ajv": "^0.0.4",
        "@microstep/mstools": "^1.0.2"
      }]
    },
    "core.tests=":  {
      is: 'target',
      outputName: "@microstep/aspects.tests",
      environments: ["=node"],
      files: ["=Files:core ? tst"],
      targets: ["core"],
      components: ["=::core::"],
    },
    "express=": {
      is: 'target',
      outputName: "@microstep/aspects.express",
      targets: ["core"],
      components: ["=::core::"],
      environments: ["=node"],
      files: ["=Files:transport.express ? tsc"],
      npmPackage: [{
        "version": "0.2.0",
        "main": "transport.express.js",
        "typings": "transport.express.d.ts"
      }],
      npmInstall: [{
        "express": "^4.14.0",
        "@types/express": "^4.0.34",
        "express-serve-static-core": "^0.1.1",
        "@types/body-parser": "^0.0.33",
        "body-parser": "^1.15.2",
        "@microstep/mstools": "^1.0.2"
      }]
    },
    "sequelize=": {
      is: 'target',
      outputName: "@microstep/aspects.sequelize",
      targets: ["core"],
      components: ["=::core::"],
      environments: ["=node"],
      files: ["=Files:datasource.sequelize ? tsc"],
      npmPackage: [{
        "version": "0.2.0",
        "main": "datasource.sequelize.js",
        "typings": "datasource.sequelize.d.ts"
      }],
      npmInstall: [{
        "sequelize": "^3.27.0",
        "@types/sequelize": "^4.0.39"
      }]
    },
    "client=": {
      is: 'target',
      packager: "npm",
      outputName: "@microstep/aspects.xhr",
      npmPackage: [{
        "version": "0.2.0",
        "main": "transport.xhr.js",
        "typings": "transport.xhr.d.ts"
      }],
      npmInstall: [{
        "@microstep/mstools": "^1.0.2"
      }],
      targets: ["core"],
      components: ["=::core::"],
      environments: ["=browser"],
      files: ["=Files:transport.xhr ? tsc"],
    }
  }
};
