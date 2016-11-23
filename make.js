module.exports =  {
  is: "project",
  name: "Aspects",
  "ts=": { is: 'environment', type: "javascript", packager: "npm", compiler: "typescript",
      tsConfig: [{
        "module": "commonjs",
        "target": "es6",
        "declaration": true,
        "sourceMap": true,
        "experimentalDecorators": true,
        "strictNullChecks": true,
        "noImplicitThis": true,
        "noImplicitReturns": true,
        "lib": ["es6"],
        "types": ["node"]
    }],
    npmInstall: [{
      "@types/node": "^4.0.30"
    }],
  },
  "Files=": { is: 'group', elements: [
      { is: 'group', name: 'typescript', path: 'typescript/src', elements: [
        { is: 'file', name: '*.ts' }
      ]}
  ]},
  "Typescript aspects=": {
    is: 'target',
    environments: ["=ts"],
    files: ["=Files:typescript"],
  }
};
