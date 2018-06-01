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
    "angular2 app=":  {
      is: 'target',
      environments: ["=::openms.aspects.angular::"],
      components: ["=::openms.aspects.angular.dev::"],
      files: ["=files:app ? tsc", "=files:shared ? tsc"],
      copyFiles: [{ is: "group", elements: ["=files:app ? copy"], dest: "" }],
      interfaces: [{ is: "group", elements: ['=files:shared ? interface'], header: `import {DataSource} from '@openmicrostep/aspects';` }]
    },
    "angular2 server=":  {
      is: 'target',
      environments: ["=::openms.aspects.node::"],
      components: ["=::openms.aspects.node.dev::"],
      files: ["=files:server", "=files:shared ? tsc"],
      interfaces: [{ is: "group", elements: ['=files:shared ? interface'], header: `import {DataSource} from '@openmicrostep/aspects';` }],
      npmPackage: { is: "component",
        dependencies: { is: "component",
          "sqlite3": "4.0.0",
        }
      },
    }
  }
};
