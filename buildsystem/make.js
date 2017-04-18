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
  "typescript targets=": { is: 'group',
    'bs aspects=': {
      is: 'target',
      outputName: '@openmicrostep/msbuildsystem.aspects',
      environments: ["=envs:node"],
      components: ['=::core::cfg:module', '=::core::', '=::typescript::', '=::js::'],
      targets: ['core', 'typescript'],
      files: ['=Files:buildsystem:src ? tsc'],
    },
    'bs aspects tests=': {
      is: 'target',
      outputName: '@openmicrostep/msbuildsystem.aspects.tests',
      environments: ["=envs:node"],
      components: ['=::core::cfg:tests', '=::core::', '=::bs aspects::'],
      targets: ['bs aspects'],
      files: ['=Files:buildsystem:tst ? tsc'],
      copyFiles: [{value: ['=Files:buildsystem:tst ? rsc'], dest: 'data/', expand: true }]
    }
  }
};
