import {ControlCenter, VersionedObject, VersionedObjectConstructor, FarImplementation, Invocation} from '@microstep/aspects';

export interface DataSourceConstructor<C extends DataSource> extends VersionedObjectConstructor<C> {
  parent: VersionedObjectConstructor<VersionedObject>;

  category(name: 'local', implementation: DataSource.ImplCategories.local<DataSource>);
  category(name: 'client_', implementation: DataSource.ImplCategories.client_<DataSource>);
  category(name: 'server_', implementation: DataSource.ImplCategories.server_<DataSource>);
  category(name: 'safe', implementation: DataSource.ImplCategories.safe<DataSource>);
  category(name: 'raw', implementation: DataSource.ImplCategories.raw<DataSource>);
  category(name: 'implementation', implementation: DataSource.ImplCategories.implementation<DataSource>);

  installAspect(on: ControlCenter, name: 'client'): { new(): DataSource.Aspects.client };
  installAspect(on: ControlCenter, name: 'server'): { new(): DataSource.Aspects.server };
  installAspect(on: ControlCenter, name: 'impl'): { new(): DataSource.Aspects.impl };

  __c(name: 'local'): DataSource.Categories.local;
  __c(name: 'client_'): DataSource.Categories.client_;
  __c(name: 'server_'): DataSource.Categories.server_;
  __c(name: 'safe'): DataSource.Categories.safe;
  __c(name: 'raw'): DataSource.Categories.raw;
  __c(name: 'implementation'): DataSource.Categories.implementation;
  __c(name: string): DataSource;
  __i<T extends DataSource>(name: 'local'): DataSource.ImplCategories.local<T>;
  __i<T extends DataSource>(name: 'client_'): DataSource.ImplCategories.client_<T>;
  __i<T extends DataSource>(name: 'server_'): DataSource.ImplCategories.server_<T>;
  __i<T extends DataSource>(name: 'safe'): DataSource.ImplCategories.safe<T>;
  __i<T extends DataSource>(name: 'raw'): DataSource.ImplCategories.raw<T>;
  __i<T extends DataSource>(name: 'implementation'): DataSource.ImplCategories.implementation<T>;
  __i<T extends DataSource>(name: string): {};
}
export interface DataSource extends VersionedObject {
}
export const DataSource = VersionedObject.extends<DataSourceConstructor<DataSource>>(VersionedObject, {
  "is": "class",
  "name": "DataSource",
  "version": 0,
  "attributes": [],
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
              "name": "",
              "tags": [],
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "tags": [],
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            },
            {
              "is": "type",
              "name": "dictionary",
              "tags": [],
              "type": "primitive"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
      "name": "client_",
      "methods": [
        {
          "is": "method",
          "name": "query",
          "argumentTypes": [
            {
              "is": "type",
              "name": "dictionary",
              "tags": [],
              "type": "primitive"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "properties": {
              "*": {
                "is": "type",
                "name": "",
                "tags": [],
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "tags": [],
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
              "name": "",
              "tags": [],
              "properties": {
                "objects": {
                  "is": "type",
                  "name": "",
                  "tags": [],
                  "itemType": {
                    "is": "type",
                    "name": "VersionedObject",
                    "tags": [],
                    "type": "class"
                  },
                  "type": "array",
                  "min": 0,
                  "max": "*"
                },
                "scope": {
                  "is": "type",
                  "name": "",
                  "tags": [],
                  "itemType": {
                    "is": "type",
                    "name": "string",
                    "tags": [],
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
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
              "name": "",
              "tags": [],
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "tags": [],
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
      "name": "server_",
      "methods": [
        {
          "is": "method",
          "name": "distantQuery",
          "argumentTypes": [
            {
              "is": "type",
              "name": "dictionary",
              "tags": [],
              "type": "primitive"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "properties": {
              "*": {
                "is": "type",
                "name": "",
                "tags": [],
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "tags": [],
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
              "name": "",
              "tags": [],
              "properties": {
                "objects": {
                  "is": "type",
                  "name": "",
                  "tags": [],
                  "itemType": {
                    "is": "type",
                    "name": "VersionedObject",
                    "tags": [],
                    "type": "class"
                  },
                  "type": "array",
                  "min": 0,
                  "max": "*"
                },
                "scope": {
                  "is": "type",
                  "name": "",
                  "tags": [],
                  "itemType": {
                    "is": "type",
                    "name": "string",
                    "tags": [],
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
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
              "name": "",
              "tags": [],
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "tags": [],
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
              "tags": [],
              "type": "primitive"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "properties": {
              "*": {
                "is": "type",
                "name": "",
                "tags": [],
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "tags": [],
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
              "name": "",
              "tags": [],
              "properties": {
                "objects": {
                  "is": "type",
                  "name": "",
                  "tags": [],
                  "itemType": {
                    "is": "type",
                    "name": "VersionedObject",
                    "tags": [],
                    "type": "class"
                  },
                  "type": "array",
                  "min": 0,
                  "max": "*"
                },
                "scope": {
                  "is": "type",
                  "name": "",
                  "tags": [],
                  "itemType": {
                    "is": "type",
                    "name": "string",
                    "tags": [],
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
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
              "name": "",
              "tags": [],
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "tags": [],
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
              "tags": [],
              "type": "primitive"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "properties": {
              "*": {
                "is": "type",
                "name": "",
                "tags": [],
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "tags": [],
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
              "name": "",
              "tags": [],
              "properties": {
                "objects": {
                  "is": "type",
                  "name": "",
                  "tags": [],
                  "itemType": {
                    "is": "type",
                    "name": "VersionedObject",
                    "tags": [],
                    "type": "class"
                  },
                  "type": "array",
                  "min": 0,
                  "max": "*"
                },
                "scope": {
                  "is": "type",
                  "name": "",
                  "tags": [],
                  "itemType": {
                    "is": "type",
                    "name": "string",
                    "tags": [],
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
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
              "name": "",
              "tags": [],
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "tags": [],
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
              "name": "",
              "tags": [],
              "itemType": {
                "is": "type",
                "name": "ObjectSet",
                "tags": [],
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "properties": {
              "*": {
                "is": "type",
                "name": "",
                "tags": [],
                "itemType": {
                  "is": "type",
                  "name": "VersionedObject",
                  "tags": [],
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
              "name": "",
              "tags": [],
              "properties": {
                "objects": {
                  "is": "type",
                  "name": "",
                  "tags": [],
                  "itemType": {
                    "is": "type",
                    "name": "VersionedObject",
                    "tags": [],
                    "type": "class"
                  },
                  "type": "array",
                  "min": 0,
                  "max": "*"
                },
                "scope": {
                  "is": "type",
                  "name": "",
                  "tags": [],
                  "itemType": {
                    "is": "type",
                    "name": "string",
                    "tags": [],
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
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
              "name": "",
              "tags": [],
              "itemType": {
                "is": "type",
                "name": "VersionedObject",
                "tags": [],
                "type": "class"
              },
              "type": "array",
              "min": 0,
              "max": "*"
            }
          ],
          "returnType": {
            "is": "type",
            "name": "",
            "tags": [],
            "itemType": {
              "is": "type",
              "name": "VersionedObject",
              "tags": [],
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
        "client_"
      ],
      "farCategories": [
        "server_"
      ]
    },
    {
      "is": "aspect",
      "name": "server",
      "categories": [
        "local",
        "server_",
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
});

export namespace DataSource {
  export namespace Categories {
    export type local = DataSource & {
      filter(arg0: VersionedObject[], arg1: { [k: string]: any }): VersionedObject[];
    }
    export type client_ = DataSource & {
      farCallback(this: DataSource, method: 'query', argument: { [k: string]: any }, callback: (envelop: Invocation<DataSource, {[k: string]: VersionedObject[]}>) => void);
      farEvent(this: DataSource, method: 'query', argument: { [k: string]: any }, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'query', argument: { [k: string]: any }): Promise<Invocation<DataSource, {[k: string]: VersionedObject[]}>>;
      farCallback(this: DataSource, method: 'load', argument: {objects?: VersionedObject[], scope?: string[]}, callback: (envelop: Invocation<DataSource, VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'load', argument: {objects?: VersionedObject[], scope?: string[]}, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'load', argument: {objects?: VersionedObject[], scope?: string[]}): Promise<Invocation<DataSource, VersionedObject[]>>;
      farCallback(this: DataSource, method: 'save', argument: VersionedObject[], callback: (envelop: Invocation<DataSource, VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'save', argument: VersionedObject[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'save', argument: VersionedObject[]): Promise<Invocation<DataSource, VersionedObject[]>>;
    }
    export type server_ = DataSource & {
      farCallback(this: DataSource, method: 'distantQuery', argument: { [k: string]: any }, callback: (envelop: Invocation<DataSource, {[k: string]: VersionedObject[]}>) => void);
      farEvent(this: DataSource, method: 'distantQuery', argument: { [k: string]: any }, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'distantQuery', argument: { [k: string]: any }): Promise<Invocation<DataSource, {[k: string]: VersionedObject[]}>>;
      farCallback(this: DataSource, method: 'distantLoad', argument: {objects?: VersionedObject[], scope?: string[]}, callback: (envelop: Invocation<DataSource, VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'distantLoad', argument: {objects?: VersionedObject[], scope?: string[]}, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'distantLoad', argument: {objects?: VersionedObject[], scope?: string[]}): Promise<Invocation<DataSource, VersionedObject[]>>;
      farCallback(this: DataSource, method: 'distantSave', argument: VersionedObject[], callback: (envelop: Invocation<DataSource, VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'distantSave', argument: VersionedObject[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'distantSave', argument: VersionedObject[]): Promise<Invocation<DataSource, VersionedObject[]>>;
    }
    export type safe = DataSource & {
      farCallback(this: DataSource, method: 'safeQuery', argument: { [k: string]: any }, callback: (envelop: Invocation<DataSource, {[k: string]: VersionedObject[]}>) => void);
      farEvent(this: DataSource, method: 'safeQuery', argument: { [k: string]: any }, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'safeQuery', argument: { [k: string]: any }): Promise<Invocation<DataSource, {[k: string]: VersionedObject[]}>>;
      farCallback(this: DataSource, method: 'safeLoad', argument: {objects?: VersionedObject[], scope?: string[]}, callback: (envelop: Invocation<DataSource, VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'safeLoad', argument: {objects?: VersionedObject[], scope?: string[]}, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'safeLoad', argument: {objects?: VersionedObject[], scope?: string[]}): Promise<Invocation<DataSource, VersionedObject[]>>;
      farCallback(this: DataSource, method: 'safeSave', argument: VersionedObject[], callback: (envelop: Invocation<DataSource, VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'safeSave', argument: VersionedObject[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'safeSave', argument: VersionedObject[]): Promise<Invocation<DataSource, VersionedObject[]>>;
    }
    export type raw = DataSource & {
      farCallback(this: DataSource, method: 'rawQuery', argument: { [k: string]: any }, callback: (envelop: Invocation<DataSource, {[k: string]: VersionedObject[]}>) => void);
      farEvent(this: DataSource, method: 'rawQuery', argument: { [k: string]: any }, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'rawQuery', argument: { [k: string]: any }): Promise<Invocation<DataSource, {[k: string]: VersionedObject[]}>>;
      farCallback(this: DataSource, method: 'rawLoad', argument: {objects?: VersionedObject[], scope?: string[]}, callback: (envelop: Invocation<DataSource, VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'rawLoad', argument: {objects?: VersionedObject[], scope?: string[]}, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'rawLoad', argument: {objects?: VersionedObject[], scope?: string[]}): Promise<Invocation<DataSource, VersionedObject[]>>;
      farCallback(this: DataSource, method: 'rawSave', argument: VersionedObject[], callback: (envelop: Invocation<DataSource, VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'rawSave', argument: VersionedObject[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'rawSave', argument: VersionedObject[]): Promise<Invocation<DataSource, VersionedObject[]>>;
    }
    export type implementation = DataSource & {
      farCallback(this: DataSource, method: 'implQuery', argument: ObjectSet[], callback: (envelop: Invocation<DataSource, {[k: string]: VersionedObject[]}>) => void);
      farEvent(this: DataSource, method: 'implQuery', argument: ObjectSet[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'implQuery', argument: ObjectSet[]): Promise<Invocation<DataSource, {[k: string]: VersionedObject[]}>>;
      farCallback(this: DataSource, method: 'implLoad', argument: {objects?: VersionedObject[], scope?: string[]}, callback: (envelop: Invocation<DataSource, VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'implLoad', argument: {objects?: VersionedObject[], scope?: string[]}, eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'implLoad', argument: {objects?: VersionedObject[], scope?: string[]}): Promise<Invocation<DataSource, VersionedObject[]>>;
      farCallback(this: DataSource, method: 'implSave', argument: VersionedObject[], callback: (envelop: Invocation<DataSource, VersionedObject[]>) => void);
      farEvent(this: DataSource, method: 'implSave', argument: VersionedObject[], eventName: string, onObject?: Object);
      farPromise(this: DataSource, method: 'implSave', argument: VersionedObject[]): Promise<Invocation<DataSource, VersionedObject[]>>;
    }
  }
  export namespace ImplCategories {
    export type local<C extends DataSource> = {
      filter: (this: C, arg0: VersionedObject[], arg1: { [k: string]: any }) => VersionedObject[];
    }
    export type client_<C extends DataSource> = {
      query: FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      load: FarImplementation<C, {objects?: VersionedObject[], scope?: string[]}, VersionedObject[]>;
      save: FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type server_<C extends DataSource> = {
      distantQuery: FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      distantLoad: FarImplementation<C, {objects?: VersionedObject[], scope?: string[]}, VersionedObject[]>;
      distantSave: FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type safe<C extends DataSource> = {
      safeQuery: FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      safeLoad: FarImplementation<C, {objects?: VersionedObject[], scope?: string[]}, VersionedObject[]>;
      safeSave: FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type raw<C extends DataSource> = {
      rawQuery: FarImplementation<C, { [k: string]: any }, {[k: string]: VersionedObject[]}>;
      rawLoad: FarImplementation<C, {objects?: VersionedObject[], scope?: string[]}, VersionedObject[]>;
      rawSave: FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
    export type implementation<C extends DataSource> = {
      implQuery: FarImplementation<C, ObjectSet[], {[k: string]: VersionedObject[]}>;
      implLoad: FarImplementation<C, {objects?: VersionedObject[], scope?: string[]}, VersionedObject[]>;
      implSave: FarImplementation<C, VersionedObject[], VersionedObject[]>;
    }
  }
  export namespace Aspects {
    export type client = Categories.local & Categories.client_ & Categories.server_;
    export type server = Categories.local & Categories.server_ & Categories.safe & Categories.raw;
    export type impl = Categories.implementation;
  }
}
