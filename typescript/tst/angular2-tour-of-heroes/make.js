module.exports =  {
  is: "project",
  name: "Aspects Tests - Angular 2 & Typescript - Tour of heroes",
  workspace: "aspects.TourOfHeroes",
  "files=": { is: 'group', elements: [
      { is: 'group', name: 'app', path: 'app/', elements: [
        { is: 'file', name: 'main.ts', tags: ['tsc'] },
        { is: 'file', name: 'index.html', tags: ['copy'] },
        { is: 'file', name: 'systemjs.config.js', tags: ['copy'] },
      ]},
      { is: 'group', name: 'server', path: 'server/', elements: [
        { is: 'file', name: 'server.ts'},
      ]},
      { is: 'group', name: 'shared', path: 'shared/', elements: [

        { is: 'file', name: 'monApp.ts', tags: ['tsc'] },
        { is: 'file', name: 'monApp.interface.md', tags: ['interface'] },
        { is: 'file', name: 'heroe.ts', tags: ['tsc'] },
        { is: 'file', name: 'heroe.interface.md', tags: ['interface'] }
      ]},
  ]},
  "targets=": { is: 'group',
    "app=":  {
      is: 'target',
      tsConfig: [{ 
        "emitDecoratorMetadata": true,
        "experimentalDecorators": true
      }],
      environments: ["=::logitud.typescript.angular::"],
      files: ["=files:app ? tsc", "=files:shared ? tsc"],
      copyFiles: [{ value: ["=files:app ? copy"], dest: "app" }],
      interfaces: [{ value: ['=files:shared ? interface'], aspect: 'app', header: `import {DataSource} from '@openmicrostep/aspects';` }]
    },
    "server=":  {
      is: 'target',
      environments: ["=::logitud.typescript.node::"],
      files: ["=files:server", "=files:shared ? tsc"],
      interfaces: [{ value: ['=files:shared ? interface'], aspect: 'server', header: `import {DataSource} from '@openmicrostep/aspects';` }]
    }
  }
};
