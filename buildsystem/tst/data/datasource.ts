import {Aspect, ControlCenter, ControlCenterContext, VersionedObject, VersionedObjectConstructor, Result, ImmutableList, ImmutableSet, ImmutableObject} from '@openmicrostep/aspects';

export class DataSource extends VersionedObject {
  static readonly definition: Aspect.Definition = <any>{
    "is": "class",
    "name": "DataSource",
    "version": 0,
    "attributes": [],
    "queries": [],
    "categories": [
      {
        "is": "category",
        "name": "local",
        "methods": [
          {
            "is": "method",
            "name": "filter",
            "argumentTypes": [
              {
                "is": "type",
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "type": "class"
                },
                "type": "array",
                "min": 0,
                "max": "*"
              },
              {
                "is": "type",
                "name": "dictionary",
                "type": "primitive"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          }
        ]
      }
    ],
    "farCategories": [
      {
        "is": "farCategory",
        "name": "client",
        "methods": [
          {
            "is": "method",
            "name": "query",
            "argumentTypes": [
              {
                "is": "type",
                "name": "dictionary",
                "type": "primitive"
              }
            ],
            "returnType": {
              "is": "type",
              "properties": {
                "*": {
                  "is": "type",
                  "itemType": {
                    "is": "type",
                    "name": "VersionedObject",
                    "type": "class"
                  },
                  "type": "array",
                  "min": 0,
                  "max": "*"
                }
              },
              "type": "dictionary"
            }
          },
          {
            "is": "method",
            "name": "load",
            "argumentTypes": [
              {
                "is": "type",
                "properties": {
                  "objects": {
                    "is": "type",
                    "itemType": {
                      "is": "type",
                      "name": "VersionedObject",
                      "type": "class"
                    },
                    "type": "array",
                    "min": 0,
                    "max": "*"
                  },
                  "scope": {
                    "is": "type",
                    "itemType": {
                      "is": "type",
                      "name": "string",
                      "type": "primitive"
                    },
                    "type": "array",
                    "min": 0,
                    "max": "*"
                  }
                },
                "type": "dictionary"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          },
          {
            "is": "method",
            "name": "save",
            "argumentTypes": [
              {
                "is": "type",
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "type": "class"
                },
                "type": "array",
                "min": 0,
                "max": "*"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          }
        ]
      },
      {
        "is": "farCategory",
        "name": "server",
        "methods": [
          {
            "is": "method",
            "name": "distantQuery",
            "argumentTypes": [
              {
                "is": "type",
                "name": "dictionary",
                "type": "primitive"
              }
            ],
            "returnType": {
              "is": "type",
              "properties": {
                "*": {
                  "is": "type",
                  "itemType": {
                    "is": "type",
                    "name": "VersionedObject",
                    "type": "class"
                  },
                  "type": "array",
                  "min": 0,
                  "max": "*"
                }
              },
              "type": "dictionary"
            }
          },
          {
            "is": "method",
            "name": "distantLoad",
            "argumentTypes": [
              {
                "is": "type",
                "properties": {
                  "objects": {
                    "is": "type",
                    "itemType": {
                      "is": "type",
                      "name": "VersionedObject",
                      "type": "class"
                    },
                    "type": "array",
                    "min": 0,
                    "max": "*"
                  },
                  "scope": {
                    "is": "type",
                    "itemType": {
                      "is": "type",
                      "name": "string",
                      "type": "primitive"
                    },
                    "type": "array",
                    "min": 0,
                    "max": "*"
                  }
                },
                "type": "dictionary"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          },
          {
            "is": "method",
            "name": "distantSave",
            "argumentTypes": [
              {
                "is": "type",
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "type": "class"
                },
                "type": "array",
                "min": 0,
                "max": "*"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          }
        ]
      },
      {
        "is": "farCategory",
        "name": "safe",
        "methods": [
          {
            "is": "method",
            "name": "safeQuery",
            "argumentTypes": [
              {
                "is": "type",
                "name": "dictionary",
                "type": "primitive"
              }
            ],
            "returnType": {
              "is": "type",
              "properties": {
                "*": {
                  "is": "type",
                  "itemType": {
                    "is": "type",
                    "name": "VersionedObject",
                    "type": "class"
                  },
                  "type": "array",
                  "min": 0,
                  "max": "*"
                }
              },
              "type": "dictionary"
            }
          },
          {
            "is": "method",
            "name": "safeLoad",
            "argumentTypes": [
              {
                "is": "type",
                "properties": {
                  "objects": {
                    "is": "type",
                    "itemType": {
                      "is": "type",
                      "name": "VersionedObject",
                      "type": "class"
                    },
                    "type": "array",
                    "min": 0,
                    "max": "*"
                  },
                  "scope": {
                    "is": "type",
                    "itemType": {
                      "is": "type",
                      "name": "string",
                      "type": "primitive"
                    },
                    "type": "array",
                    "min": 0,
                    "max": "*"
                  }
                },
                "type": "dictionary"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          },
          {
            "is": "method",
            "name": "safeSave",
            "argumentTypes": [
              {
                "is": "type",
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "type": "class"
                },
                "type": "array",
                "min": 0,
                "max": "*"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          }
        ]
      },
      {
        "is": "farCategory",
        "name": "raw",
        "methods": [
          {
            "is": "method",
            "name": "rawQuery",
            "argumentTypes": [
              {
                "is": "type",
                "name": "dictionary",
                "type": "primitive"
              }
            ],
            "returnType": {
              "is": "type",
              "properties": {
                "*": {
                  "is": "type",
                  "itemType": {
                    "is": "type",
                    "name": "VersionedObject",
                    "type": "class"
                  },
                  "type": "array",
                  "min": 0,
                  "max": "*"
                }
              },
              "type": "dictionary"
            }
          },
          {
            "is": "method",
            "name": "rawLoad",
            "argumentTypes": [
              {
                "is": "type",
                "properties": {
                  "objects": {
                    "is": "type",
                    "itemType": {
                      "is": "type",
                      "name": "VersionedObject",
                      "type": "class"
                    },
                    "type": "array",
                    "min": 0,
                    "max": "*"
                  },
                  "scope": {
                    "is": "type",
                    "itemType": {
                      "is": "type",
                      "name": "string",
                      "type": "primitive"
                    },
                    "type": "array",
                    "min": 0,
                    "max": "*"
                  }
                },
                "type": "dictionary"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          },
          {
            "is": "method",
            "name": "rawSave",
            "argumentTypes": [
              {
                "is": "type",
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "type": "class"
                },
                "type": "array",
                "min": 0,
                "max": "*"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          }
        ]
      },
      {
        "is": "farCategory",
        "name": "implementation",
        "methods": [
          {
            "is": "method",
            "name": "implQuery",
            "argumentTypes": [
              {
                "is": "type",
                "itemType": {
                  "is": "type",
                  "name": "ObjectSet",
                  "type": "class"
                },
                "type": "array",
                "min": 0,
                "max": "*"
              }
            ],
            "returnType": {
              "is": "type",
              "properties": {
                "*": {
                  "is": "type",
                  "itemType": {
                    "is": "type",
                    "name": "VersionedObject",
                    "type": "class"
                  },
                  "type": "array",
                  "min": 0,
                  "max": "*"
                }
              },
              "type": "dictionary"
            }
          },
          {
            "is": "method",
            "name": "implLoad",
            "argumentTypes": [
              {
                "is": "type",
                "properties": {
                  "objects": {
                    "is": "type",
                    "itemType": {
                      "is": "type",
                      "name": "VersionedObject",
                      "type": "class"
                    },
                    "type": "array",
                    "min": 0,
                    "max": "*"
                  },
                  "scope": {
                    "is": "type",
                    "itemType": {
                      "is": "type",
                      "name": "string",
                      "type": "primitive"
                    },
                    "type": "array",
                    "min": 0,
                    "max": "*"
                  }
                },
                "type": "dictionary"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          },
          {
            "is": "method",
            "name": "implSave",
            "argumentTypes": [
              {
                "is": "type",
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "type": "class"
                },
                "type": "array",
                "min": 0,
                "max": "*"
              }
            ],
            "returnType": {
              "is": "type",
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          }
        ]
      }
    ],
    "aspects": [
      {
        "is": "aspect",
        "name": "client",
        "categories": [
          "local",
          "client"
        ],
        "farCategories": [
          "server"
        ]
      },
      {
        "is": "aspect",
        "name": "server",
        "categories": [
          "local",
          "server",
          "safe",
          "raw"
        ],
        "farCategories": []
      },
      {
        "is": "aspect",
        "name": "impl",
        "categories": [
          "implementation"
        ],
        "farCategories": []
      }
    ]
  };
  static readonly parent = VersionedObject;
  static readonly category: DataSource.Categories;
}
export declare namespace DataSource {
  function __DataSource_c(name: string): {};
  function __DataSource_c(name: 'local'): DataSource.Categories.local;
  function __DataSource_c(name: 'client'): DataSource.Categories.client;
  function __DataSource_c(name: 'server'): DataSource.Categories.server;
  function __DataSource_c(name: 'safe'): DataSource.Categories.safe;
  function __DataSource_c(name: 'raw'): DataSource.Categories.raw;
  function __DataSource_c(name: 'implementation'): DataSource.Categories.implementation;
  function __DataSource_i(name: string): {};
  function __DataSource_i<T extends DataSource>(name: 'local'): DataSource.ImplCategories.local<T>;
  function __DataSource_i<T extends DataSource>(name: 'client'): DataSource.ImplCategories.client<T>;
  function __DataSource_i<T extends DataSource>(name: 'server'): DataSource.ImplCategories.server<T>;
  function __DataSource_i<T extends DataSource>(name: 'safe'): DataSource.ImplCategories.safe<T>;
  function __DataSource_i<T extends DataSource>(name: 'raw'): DataSource.ImplCategories.raw<T>;
  function __DataSource_i<T extends DataSource>(name: 'implementation'): DataSource.ImplCategories.implementation<T>;

  export interface Categories<C extends DataSource = DataSource> extends VersionedObject.Categories<C> {
    (name: 'local', implementation: DataSource.ImplCategories.local<C>);
    (name: 'client', implementation: DataSource.ImplCategories.client<C>);
    (name: 'server', implementation: DataSource.ImplCategories.server<C>);
    (name: 'safe', implementation: DataSource.ImplCategories.safe<C>);
    (name: 'raw', implementation: DataSource.ImplCategories.raw<C>);
    (name: 'implementation', implementation: DataSource.ImplCategories.implementation<C>);
  }
  export namespace Categories {
    export type local = DataSource & {
      filter(arg0: VersionedObject[], arg1: { [k: string]: any }): VersionedObject[];
    }
    export type client = DataSource & {
      query: Aspect.Invokable<{ [k: string]: any }, {[k: string]: VersionedObject[]}>;
      load: Aspect.Invokable<{objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      save: Aspect.Invokable<VersionedObject[], VersionedObject[]>;
    }
    export type server = DataSource & {
      distantQuery: Aspect.Invokable<{ [k: string]: any }, {[k: string]: VersionedObject[]}>;
      distantLoad: Aspect.Invokable<{objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      distantSave: Aspect.Invokable<VersionedObject[], VersionedObject[]>;
    }
    export type safe = DataSource & {
      safeQuery: Aspect.Invokable<{ [k: string]: any }, {[k: string]: VersionedObject[]}>;
      safeLoad: Aspect.Invokable<{objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      safeSave: Aspect.Invokable<VersionedObject[], VersionedObject[]>;
    }
    export type raw = DataSource & {
      rawQuery: Aspect.Invokable<{ [k: string]: any }, {[k: string]: VersionedObject[]}>;
      rawLoad: Aspect.Invokable<{objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      rawSave: Aspect.Invokable<VersionedObject[], VersionedObject[]>;
    }
    export type implementation = DataSource & {
      implQuery: Aspect.Invokable<ObjectSet[], {[k: string]: VersionedObject[]}>;
      implLoad: Aspect.Invokable<{objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      implSave: Aspect.Invokable<VersionedObject[], VersionedObject[]>;
    }
  }
  export namespace ImplCategories {
    export type local<C extends DataSource = DataSource> = {
      filter: (this: C, arg0: VersionedObject[], arg1: { [k: string]: any }) => VersionedObject[];
    }
    export type client<C extends DataSource = DataSource> = {
      query: Aspect.FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      load: Aspect.FarImplementation<C, {objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      save: Aspect.FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type server<C extends DataSource = DataSource> = {
      distantQuery: Aspect.FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      distantLoad: Aspect.FarImplementation<C, {objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      distantSave: Aspect.FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type safe<C extends DataSource = DataSource> = {
      safeQuery: Aspect.FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      safeLoad: Aspect.FarImplementation<C, {objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      safeSave: Aspect.FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type raw<C extends DataSource = DataSource> = {
      rawQuery: Aspect.FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      rawLoad: Aspect.FarImplementation<C, {objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      rawSave: Aspect.FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type implementation<C extends DataSource = DataSource> = {
      implQuery: Aspect.FarImplementation<C, ObjectSet[], {[k: string]: VersionedObject[]}>;
      implLoad: Aspect.FarImplementation<C, {objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      implSave: Aspect.FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
  }
  export namespace Aspects {
    export type client = Categories.local & Categories.client & Categories.server;
    export type server = Categories.local & Categories.server & Categories.safe & Categories.raw;
    export type impl = Categories.implementation;
  }
}
export namespace DataSource {
  export function create(ccc: ControlCenterContext) { return ccc.create<DataSource>("DataSource"); }
  export const Aspects = {
    client: <Aspect.FastConfiguration<DataSource.Aspects.client>> {
      name: "DataSource", aspect: "client", cstor: DataSource, categories: ["local", "client", "server"],
      create(ccc: ControlCenterContext) { return ccc.create<DataSource.Aspects.client>("DataSource", this.categories); },
    },
    server: <Aspect.FastConfiguration<DataSource.Aspects.server>> {
      name: "DataSource", aspect: "server", cstor: DataSource, categories: ["local", "server", "safe", "raw"],
      create(ccc: ControlCenterContext) { return ccc.create<DataSource.Aspects.server>("DataSource", this.categories); },
    },
    impl: <Aspect.FastConfiguration<DataSource.Aspects.impl>> {
      name: "DataSource", aspect: "impl", cstor: DataSource, categories: ["implementation"],
      create(ccc: ControlCenterContext) { return ccc.create<DataSource.Aspects.impl>("DataSource", this.categories); },
    },
  };
}
