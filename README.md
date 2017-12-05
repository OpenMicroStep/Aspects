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

### How to test MySQL, PostgreSQL, MSSql, Oracle

First you need docker: https://docs.docker.com/engine/installation/

```sh
docker-compose up -d

export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=my-secret-pw

export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_USER=root
export MYSQL_PASSWORD=my-secret-pw

export MSSQL_HOST=localhost
export MSSQL_PORT=1433
export MSSQL_USER=sa
export MSSQL_PASSWORD=7wnjijM9JihtKok4RC6

msbuildsystem build -w dist/local/ --target build --env local --no-progress
```



## Documentation

 - français: [doc/concepts.fr.md](doc/concepts.fr.md).
