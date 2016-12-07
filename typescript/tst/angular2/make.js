module.exports =  {
  is: "project",
  name: "Aspects Tests - Angular 2 & Typescript",
  // TODO: type: "logitud.angular2.app" & "logitud.angular2.server"
  "ts base=": { is: 'component', type: "javascript", compiler: "typescript",
    tsConfig: [{
      "target": "es6",
      "declaration": true,
      "sourceMap": true,
      "skipLibCheck": true,
      "moduleResolution": "node",
      "experimentalDecorators": true,
      "strictNullChecks": true,
      "noImplicitThis": true,
      "noImplicitReturns": true,
      "skipLibCheck": true,
      "lib": ["es6"]
    }],
    npmInstall: [{
      "@angular/common": "~2.2.0",
      "@angular/compiler": "~2.2.0",
      "@angular/core": "~2.2.0",
      "@angular/forms": "~2.2.0",
      "@angular/http": "~2.2.0",
      "@angular/platform-browser": "~2.2.0",
      "@angular/platform-browser-dynamic": "~2.2.0",
      "@angular/router": "~3.2.0",

      "angular-in-memory-web-api": "~0.1.15",
      "systemjs": "0.19.40",
      "core-js": "^2.4.1",
      "reflect-metadata": "^0.1.8",
      "rxjs": "5.0.0-beta.12",
      "zone.js": "^0.6.26",
    }]
  },
  "node=": { 
    is: 'environment', 
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
      "module": "umd",
      "lib": ["es6", "dom"]
    }],
    compatibleEnvironments: ["ts"],
  },

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
      environments: ["=browser"],
      files: ["=files:app", "=files:shared"]
    },
    "server=":  {
      is: 'target',
      environments: ["=node"],
      files: ["=files:server", "=files:shared"],
      npmInstall: [{
        "express": "^4.14.0",
        "@types/express": "^4.0.34",
        "express-serve-static-core": "^0.1.1"
      }],
    }
  }
};
