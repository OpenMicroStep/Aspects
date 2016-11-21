module.exports =  {
  is: "project",
  name: "Aspects",
  "ts=": { is: 'environment', type: "javascript", packager: "npm", compiler: "typescript" },
  "Files=": { is: 'group', elements: [
      { is: 'group', name: 'typescript', elements: [
        { is: 'file', name: '*.ts' }
      ]}
  ]},
  "Typescript aspects=": {
    is: 'target',
    environments: ["=ts"],
    files: ["=Files:ts"],
  }
};
