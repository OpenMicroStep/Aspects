module.exports =  {
  is: "project",
  name: "Aspects Tests - Angular 2 & Typescript",
  workspace: "aspects.demoapp",
  "files=": { is: 'group', elements: [
      { is: 'group', name: 'app', path: 'app/', elements: [
        { is: 'file', name: 'main.ts'},
      ]},
      { is: 'group', name: 'server', path: 'server/', elements: [
        { is: 'file', name: 'server.ts'},
      ]},
      { is: 'group', name: 'shared', path: 'shared/', elements: [
        { is: 'file', name: 'person.ts'},
      ]},
  ]},
  "targets=": { is: 'group',
    "app=":  {
      is: 'target',
      environments: ["=::logitud.angular.typescript::"],
      files: ["=files:app", "=files:shared"],
    },
    "server=":  {
      is: 'target',
      environments: ["=::logitud.node.typescript::"],
      files: ["=files:server", "=files:shared"],
    }
  }
};
