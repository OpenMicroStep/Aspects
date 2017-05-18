const version = require('child_process').execSync('git describe --always').toString().trim();

module.exports =  {
  is: "project",
  name: "Aspects Buildsystem module",
  "envs=": { is: 'group',
    "node=": { is: 'environment' },
  },
  "Files=": { is: 'group', elements: [
      { is: 'group', name: 'buildsystem', elements: [
        { is: 'group', name: "src", path: "src", elements: [
          { is: 'file', name: "index.ts", tags: ["tsc"] }
        ]},
        { is: 'group', name: "tst", path: "tst", elements: [
          { is: 'file', name: "index.ts", tags: ["tsc"] },
          { is: 'file', name: "data/**" , tags: ["rsc"] }
        ]}
      ]}
  ]},
  'base=': {
    is: 'component',
    npmPackage: { is: "component",
      "version": version,
      "main": "index.js",
      "typings": "index.d.ts",
      devDependencies: { is: "component",
        "@types/node": "^4.0.30"
      }
    },
    components: ['=::core::'],
  },
  "typescript targets=": { is: 'group',
    'bs aspects=': {
      is: 'target',
      outputName: '@openmicrostep/msbuildsystem.aspects',
      environments: ["=envs:node"],
      components: ['=::core::cfg:module', '=base', '=::typescript::', '=::js::'],
      targets: ['core', 'typescript'],
      files: ['=Files:buildsystem:src ? tsc'],
    },
    'bs aspects tests=': {
      is: 'target',
      outputName: '@openmicrostep/msbuildsystem.aspects.tests',
      environments: ["=envs:node"],
      components: ['=::core::cfg:tests', '=base', '=::bs aspects::'],
      targets: ['bs aspects'],
      files: ['=Files:buildsystem:tst ? tsc'],
      copyFiles: [{ is: "group", elements: ['=Files:buildsystem:tst ? rsc'], dest: 'data/', expand: true }]
    }
  }
};
