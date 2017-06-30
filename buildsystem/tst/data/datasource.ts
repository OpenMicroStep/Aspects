import {Aspect, ControlCenter, VersionedObject, VersionedObjectConstructor, FarImplementation, Invocation, ImmutableList, ImmutableSet, ImmutableObject} from '@openmicrostep/aspects';

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
  function installAspect(on: ControlCenter, name: 'client'): { new(): DataSource.Aspects.client };
  function installAspect(on: ControlCenter, name: 'server'): { new(): DataSource.Aspects.server };
  function installAspect(on: ControlCenter, name: 'impl'): { new(): DataSource.Aspects.impl };

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
      farCallback(this: DataSource, method: 'query', argument: { [k: string]: any }, callback: (envelop: Invocation<{[k: string]: VersionedObject[]}>) => void);
      farEvent(this: DataSource, method: 'query', argument: { [k: string]: any }, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'query', argument: { [k: string]: any }): Promise<Invocation<{[k: string]: VersionedObject[]}>>;
      farCallback(this: DataSource, method: 'load', argument: {objects: VersionedObject[], scope: string[]}, callback: (envelop: Invocation<VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'load', argument: {objects: VersionedObject[], scope: string[]}, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'load', argument: {objects: VersionedObject[], scope: string[]}): Promise<Invocation<VersionedObject[]>>;
      farCallback(this: DataSource, method: 'save', argument: VersionedObject[], callback: (envelop: Invocation<VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'save', argument: VersionedObject[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'save', argument: VersionedObject[]): Promise<Invocation<VersionedObject[]>>;
    }
    export type server = DataSource & {
      farCallback(this: DataSource, method: 'distantQuery', argument: { [k: string]: any }, callback: (envelop: Invocation<{[k: string]: VersionedObject[]}>) => void);
      farEvent(this: DataSource, method: 'distantQuery', argument: { [k: string]: any }, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'distantQuery', argument: { [k: string]: any }): Promise<Invocation<{[k: string]: VersionedObject[]}>>;
      farCallback(this: DataSource, method: 'distantLoad', argument: {objects: VersionedObject[], scope: string[]}, callback: (envelop: Invocation<VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'distantLoad', argument: {objects: VersionedObject[], scope: string[]}, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'distantLoad', argument: {objects: VersionedObject[], scope: string[]}): Promise<Invocation<VersionedObject[]>>;
      farCallback(this: DataSource, method: 'distantSave', argument: VersionedObject[], callback: (envelop: Invocation<VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'distantSave', argument: VersionedObject[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'distantSave', argument: VersionedObject[]): Promise<Invocation<VersionedObject[]>>;
    }
    export type safe = DataSource & {
      farCallback(this: DataSource, method: 'safeQuery', argument: { [k: string]: any }, callback: (envelop: Invocation<{[k: string]: VersionedObject[]}>) => void);
      farEvent(this: DataSource, method: 'safeQuery', argument: { [k: string]: any }, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'safeQuery', argument: { [k: string]: any }): Promise<Invocation<{[k: string]: VersionedObject[]}>>;
      farCallback(this: DataSource, method: 'safeLoad', argument: {objects: VersionedObject[], scope: string[]}, callback: (envelop: Invocation<VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'safeLoad', argument: {objects: VersionedObject[], scope: string[]}, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'safeLoad', argument: {objects: VersionedObject[], scope: string[]}): Promise<Invocation<VersionedObject[]>>;
      farCallback(this: DataSource, method: 'safeSave', argument: VersionedObject[], callback: (envelop: Invocation<VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'safeSave', argument: VersionedObject[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'safeSave', argument: VersionedObject[]): Promise<Invocation<VersionedObject[]>>;
    }
    export type raw = DataSource & {
      farCallback(this: DataSource, method: 'rawQuery', argument: { [k: string]: any }, callback: (envelop: Invocation<{[k: string]: VersionedObject[]}>) => void);
      farEvent(this: DataSource, method: 'rawQuery', argument: { [k: string]: any }, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'rawQuery', argument: { [k: string]: any }): Promise<Invocation<{[k: string]: VersionedObject[]}>>;
      farCallback(this: DataSource, method: 'rawLoad', argument: {objects: VersionedObject[], scope: string[]}, callback: (envelop: Invocation<VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'rawLoad', argument: {objects: VersionedObject[], scope: string[]}, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'rawLoad', argument: {objects: VersionedObject[], scope: string[]}): Promise<Invocation<VersionedObject[]>>;
      farCallback(this: DataSource, method: 'rawSave', argument: VersionedObject[], callback: (envelop: Invocation<VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'rawSave', argument: VersionedObject[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'rawSave', argument: VersionedObject[]): Promise<Invocation<VersionedObject[]>>;
    }
    export type implementation = DataSource & {
      farCallback(this: DataSource, method: 'implQuery', argument: ObjectSet[], callback: (envelop: Invocation<{[k: string]: VersionedObject[]}>) => void);
      farEvent(this: DataSource, method: 'implQuery', argument: ObjectSet[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'implQuery', argument: ObjectSet[]): Promise<Invocation<{[k: string]: VersionedObject[]}>>;
      farCallback(this: DataSource, method: 'implLoad', argument: {objects: VersionedObject[], scope: string[]}, callback: (envelop: Invocation<VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'implLoad', argument: {objects: VersionedObject[], scope: string[]}, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'implLoad', argument: {objects: VersionedObject[], scope: string[]}): Promise<Invocation<VersionedObject[]>>;
      farCallback(this: DataSource, method: 'implSave', argument: VersionedObject[], callback: (envelop: Invocation<VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'implSave', argument: VersionedObject[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'implSave', argument: VersionedObject[]): Promise<Invocation<VersionedObject[]>>;
    }
  }
  export namespace ImplCategories {
    export type local<C extends DataSource = DataSource> = {
      filter: (this: C, arg0: VersionedObject[], arg1: { [k: string]: any }) => VersionedObject[];
    }
    export type client<C extends DataSource = DataSource> = {
      query: FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      load: FarImplementation<C, {objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      save: FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type server<C extends DataSource = DataSource> = {
      distantQuery: FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      distantLoad: FarImplementation<C, {objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      distantSave: FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type safe<C extends DataSource = DataSource> = {
      safeQuery: FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      safeLoad: FarImplementation<C, {objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      safeSave: FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type raw<C extends DataSource = DataSource> = {
      rawQuery: FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      rawLoad: FarImplementation<C, {objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      rawSave: FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type implementation<C extends DataSource = DataSource> = {
      implQuery: FarImplementation<C, ObjectSet[], {[k: string]: VersionedObject[]}>;
      implLoad: FarImplementation<C, {objects: VersionedObject[], scope: string[]}, VersionedObject[]>;
      implSave: FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
  }
  export namespace Aspects {
    export type client = Categories.local & Categories.client & Categories.server;
    export type server = Categories.local & Categories.server & Categories.safe & Categories.raw;
    export type impl = Categories.implementation;
  }
}
