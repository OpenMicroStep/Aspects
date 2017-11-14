Aspects
=======

Aspects is a set of concepts to:

 - control changes on a set of objects
 - exchange a limited amount of information between parties
 - share aspect implementations of an object

## Install

To install aspects for javascript: `npm install @openmicrostep/aspects`

## How to build

```
npm install -q -g @openmicrostep/msbuildsystem.cli
msbuildsystem modules install @openmicrostep/msbuildsystem.js.typescript
msbuildsystem build -w dist/local/ --target build --env local --no-progress
```

## Documentation

 - français: [doc/concepts.fr.md](doc/concepts.fr.md).
