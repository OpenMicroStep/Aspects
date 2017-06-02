const version = require('child_process').execSync('git describe --always', { cwd: __dirname }).toString().trim();

function tests_buildsystem(path) {
  return [
    `${path}/node/node_modules/@openmicrostep/msbuildsystem.shared.tests/index.js`,
    `${path}/node/node_modules/@openmicrostep/msbuildsystem.core.tests/index.js`,
    `${path}/node/node_modules/@openmicrostep/msbuildsystem.js.tests/index.js`,
    `${path}/node/node_modules/@openmicrostep/msbuildsystem.js.typescript.tests/index.js`,
    `${path}/node/node_modules/@openmicrostep/msbuildsystem.aspects.tests/index.js`,
  ]
}
function tests_aspects(path) {
  return [
    `${path}/js/node_modules/@openmicrostep/aspects.tests/typescript/core/tst/core.spec.js`,
    `${path}/js/node_modules/@openmicrostep/aspects.sql.tests/typescript/datasource.sql/tst/datasource.sql.spec.js`,
  ]
}

module.exports =  {
  is: "project",
  name: "Aspects",
  "ts base=": { is: 'component', type: "javascript", compiler: "aspects",
      npmPackage: { is: "component",
        "version": version,
      },
      tsConfig: { is: "component",
        "stripInternal": true,
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
    }
  },
  "test=": {
    is: 'component',
    components: ["=ts base"],
    tsConfig: { is: "component",
      "types": ["chai"]
    },
    npmPackage: { is: "component",
      dependencies: { is: "component",
        "chai": "^3.5.0"
      },
      devDependencies: { is: "component", 
        "@types/chai": "^3.4.29",
        "@openmicrostep/tests": "^0.1.0"
      }
    }
  },
  "node=": {
    is: 'component', 
    tsConfig: { is: "component",
      "module": "commonjs",
      "types": ["node"]
    },
    npmPackage: { is: "component",
      devDependencies: { is: "component", 
        "@types/node": "^4.0.30"
      }
    },
  },
  "browser=": { 
    is: 'component', 
    tsConfig: { is: "component",
      "module": "commonjs",
      "lib": ["dom"]
    },
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
          { is: 'file', name: 'datasource.sql.spec.ts', tags: ['tsc'] },
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
        is: "group",
        elements: ["=Files:core:src ? interface"], 
        customHeader: "import {ControlCenter, VersionedObject, VersionedObjectConstructor, FarImplementation, Invocation, DataSourceInternal, ImmutableList, ImmutableSet, ImmutableObject} from '../typescript/core/src/core';\nimport ObjectSet = DataSourceInternal.ObjectSet;"  
      }],
      npmPackage: { is: "component",
        "main": "typescript/core/src/core.js",
        "typings": "typescript/core/src/core.d.ts",
        "dependencies": { is: "component",
          "@openmicrostep/msbuildsystem.shared": "^0.5.0",
          "@openmicrostep/async": "^0.1.0",
          "@openmicrostep/mstools": "^1.0.2",
        },
      },
    },
    "aspects core.tests=":  {
      is: 'target',
      outputName: "@openmicrostep/aspects.tests",
      environments: ["=envs:js"],
      files: ["=Files:core:tst ? tsc"],
      targets: ["aspects core"],
      components: ["=test", "=::aspects core::", "=node"],
      interfaces: ["=Files:core:tst ? interface"],
    },
    "aspects express=": {
      is: 'target',
      outputName: "@openmicrostep/aspects.express",
      targets: ["aspects core"],
      components: ["=::aspects core::", "=node"],
      environments: ["=envs:js"],
      files: ["=Files:transport.express ? tsc"],
      npmPackage: { is: "component",
        "main": "transport.express.js",
        "typings": "transport.express.d.ts",
        "devDependencies": { is: "component",
          "express": "^4.14.0",
          "@types/express": "^4.0.34",
          "express-serve-static-core": "^0.1.1",
          "@types/body-parser": "^0.0.33",
          "body-parser": "^1.15.2",
          "@openmicrostep/mstools": "^1.0.2"
        },
      },
    },
    "aspects sql=": {
      is: 'target',
      outputName: "@openmicrostep/aspects.sql",
      targets: ["aspects core"],
      components: ["=::aspects core::", "=node"],
      environments: ["=envs:js"],
      files: ["=Files:datasource.sql:src ? tsc"],
      npmPackage: { is: "component",
        "main": "index.js",
        "typings": "index.d.ts",
        "dependencies": { is: "component",
          "@openmicrostep/msbuildsystem.shared": "^0.3.0",
        },
      },
    },
    "aspects sql.tests=": {
      is: 'target',
      outputName: "@openmicrostep/aspects.sql.tests",
      targets: ["aspects core", "aspects sql"],
      components: ["=test", "=::aspects core::", "=::aspects sql::", "=node"],
      environments: ["=envs:js"],
      files: ["=Files:datasource.sql:tst ? tsc"],
      interfaces: ["=Files:datasource.sql:tst ? interface"],
      npmPackage: { is: "component",
        "dependencies": { is: "component",
          "sqlite3": "^3.1.8",
          "mysql2": "^1.2.0",
          "pg": "^6.1.5",
          "tedious": "^2.0.0",
          "oracledb": "^1.13.1",
        },
      },
    },
    "aspects client=": {
      is: 'target',
      packager: "npm",
      outputName: "@openmicrostep/aspects.xhr",
      npmPackage: { is: "component",
        "main": "transport.xhr.js",
        "typings": "transport.xhr.d.ts",
        "devDependencies": { is: "component",
          "@openmicrostep/mstools": "^1.0.2"
        },
      },
      targets: ["aspects core"],
      components: ["=::aspects core::", "=browser"],
      environments: ["=envs:js"],
      files: ["=Files:transport.xhr ? tsc"],
    }
  },
  'commands=': { is: "group",
    "envs=": { is: "group", elements: [
      { is: "environment", name: "gitlab"  , tags: ["ci"   ] },
      { is: "environment", name: "travis"  , tags: ["ci"   , "coveralls"] },
      { is: "environment", name: "appveyor", tags: ["ci"   , "coveralls"] },
      { is: "environment", name: "local"   , tags: ["local"] },
    ]},
    "shell=": {
      is: "component",
      type: "basic",
      manual: true,
      environments: ["=envs"],
    },
    "cmd=": {
      is: "component",
      type: "cmd",
      cwd: "={cwd}.absolutePath",
      tty: true
    },
    'cwd=': { is: 'group', elements: [{ is: 'file', name: "./" }] },
    "build-bs=": { is: "task", components: ["=cmd"], cmd: Value([
      "msbuildsystem", "build", "-p", "MSBuildSystem/@msbuildsystem", "-p", "buildsystem", "-w", "dist/bs-aspects/"
    ]) },
    "tests-bs=": { is: "task", components: ["=cmd"], cmd: Value([
      "mstests", "-c", "-t", "5000", ...tests_buildsystem("dist/bs-aspects")
    ]) },
    "build-aspects=": { is: "task", components: ["=cmd"], cmd: Value([
      "node", "dist/bs-aspects/node/node_modules/@openmicrostep/msbuildsystem.cli/index.js", "build", "-w", "dist/aspects/"
    ]) },
    "tests-aspects=": { is: "task", components: ["=cmd"],
      env: { is: "component", "OCI_LIB_DIR": "/opt/oracle/instantclient", "OCI_INC_DIR": "/opt/oracle/instantclient/sdk/include" }, 
      cmd: Value(["mstests", "-c", ...tests_aspects("dist/aspects")]),
    },
    "coverage-aspects=": { is: "task", components: ["=cmd"], cmd: Value([
      "istanbul", "cover", "mstests",
      "--report", "json",
      "-x", "*.tests/**", "-x", "**/generated/**",
      "--root", "dist/aspects/js/node_modules/@openmicrostep/",
      "--",
      "-c", "-t", "20000", "-i", "-g", "perf", ...tests_aspects("dist/aspects")
    ]) },
    "coveralls-aspects=": { is: "task", components: ["=cmd"], cmd: Value([
      "sh", "-c",
      "cat ./coverage/coverage-final.json | remap-istanbul --type lcovonly | coveralls"
    ]) },
    "coverage-local-aspects=": { is: "task", components: ["=cmd"], cmd: Value([
      "sh", "-c",
      "cat ./coverage/coverage-final.json | remap-istanbul --output coverage --type html"
    ]) },
    "build=":     { is: "target", components: ["=shell"], preTasks: Value(["=build-bs", /*"=tests-bs",*/ "=build-aspects", "=tests-aspects" ]) },
  }
};
