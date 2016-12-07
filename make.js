module.exports =  {
  is: "project",
  name: "Aspects",
  "ts base=": { is: 'component', type: "javascript", compiler: "typescript",
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
  "ts=": { 
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
    compatibleEnvironments: ["ts"],
  },
  "browser=": { 
    is: 'environment', 
    //packager: "browserify",
    components: ["=ts base"],
    tsConfig: [{
      "module": "commonjs",
      "lib": ["es6", "dom"]
    }],
    compatibleEnvironments: ["ts"],
  },

  "Files=": { is: 'group', elements: [
      { is: 'group', name: 'typescript', path: 'typescript/src/', elements: [
        { is: 'file', name: 'core.ts', tags: ['core'] },
        { is: 'file', name: 'transport.express.ts', tags: ['express'] },
        { is: 'file', name: 'transport.xhr.ts', tags: ['client'] },
        { is: 'file', name: 'datasource.sequelize.ts', tags: ['sequelize'] }
      ]}
  ]},
  "typescript targets=": { is: 'group',
    "core=":  {
      is: 'target',
      outputName: "@microstep/aspects",
      environments: ["=ts"],
      files: ["=Files:typescript ? core"],
      npmPackage: [{
        "version": "0.1.0",
        "main": "core.js",
        "typings": "core.d.ts"
      }],
      npmInstall: [{
        "@microstep/async": "^0.1.0",
        "ajv": "^4.9.0",
        "@types/ajv": "^0.0.4",
        "@microstep/mstools": "^1.0.0"
      }]
    },
    "express=":  {
      is: 'target',
      outputName: "@microstep/aspects.express",
      targets: ["=core"],
      environments: ["=node"],
      files: ["=Files:typescript ? express"],
      npmPackage: [{
        "version": "0.1.0",
        "main": "transport.express.js",
        "typings": "transport.express.d.ts"
      }],
      npmInstall: [{
        "express": "^4.14.0",
        "@types/express": "^4.0.34",
        "express-serve-static-core": "^0.1.1",
        "@types/body-parser": "^0.0.33",
        "body-parser": "^1.15.2",
      }]
    },
    "sequelize=":  {
      is: 'target',
      outputName: "@microstep/aspects.sequelize",
      targets: ["=core"],
      environments: ["=node"],
      files: ["=Files:typescript ? sequelize"],
      npmPackage: [{
        "version": "0.1.0",
        "main": "datasource.sequelize.js",
        "typings": "datasource.sequelize.d.ts"
      }],
      npmInstall: [{
        "sequelize": "^3.27.0",
        "@types/sequelize": "^4.0.39"
      }]
    },
    "client=":  {
      is: 'target',
      packager: "npm",
      outputName: "@microstep/aspects.xhr",
      npmPackage: [{
        "version": "0.1.0",
        "main": "transport.xhr.js",
        "typings": "transport.xhr.d.ts"
      }],
      targets: ["=core"],
      environments: ["=browser"],
      files: ["=Files:typescript ? client"],
    }
  }
};
