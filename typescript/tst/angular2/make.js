module.exports =  {
  is: "project",
  name: "Aspects Tests - Angular 2 & Typescript",
  workspace: "aspects.demoapp",
  "files=": { is: 'group', elements: [
      { is: 'group', name: 'app', path: 'app/', elements: [
        { is: 'file', name: 'main.ts', tags: ['tsc'] },
        { is: 'file', name: 'index.html', tags: ['copy'] },
        { is: 'file', name: 'styles.css', tags: ['copy'] },
        { is: 'file', name: 'systemjs.config.js', tags: ['copy'] },
      ]},
      { is: 'group', name: 'server', path: 'server/', elements: [
        { is: 'file', name: 'server.ts'},
      ]},
      { is: 'group', name: 'shared', path: 'shared/', elements: [
        { is: 'file', name: 'person.ts', tags: ['tsc'] },
        { is: 'file', name: 'demoapp.ts', tags: ['tsc'] },
        { is: 'file', name: 'person.interface.md', tags: ['interface'] },
        { is: 'file', name: 'demoapp.interface.md', tags: ['interface'] },
      ]},
  ]},
  "targets=": { is: 'group',
    "app=":  {
      is: 'target',
      //tsConfig: [{ traceResolution: true }],
      environments: ["=::openms.aspects.angular::"],
      files: ["=files:app ? tsc", "=files:shared ? tsc"],
      copyFiles: [{ is: "associate", elements: ["=files:app ? copy"], dest: "" }],
      interfaces: [{ is: "associate", elements: ['=files:shared ? interface'], header: `import {DataSource} from '@openmicrostep/aspects';` }]
    },
    "server=":  {
      is: 'target',
      environments: ["=::openms.aspects.node::"],
      files: ["=files:server", "=files:shared ? tsc"],
      interfaces: [{ is: "associate", elements: ['=files:shared ? interface'], header: `import {DataSource} from '@openmicrostep/aspects';` }],
      npmPackage: [{ is: "component",
        dependencies: [{ is: "component",
          "sqlite3": "^3.1.8",
        }]
      }],
    }
  }
};
