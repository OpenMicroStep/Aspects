import {Aspect, ControlCenter, VersionedObject, VersionedObjectConstructor, FarImplementation, Result, ImmutableList, ImmutableSet, ImmutableObject} from '@openmicrostep/aspects';

export class Resource extends VersionedObject {
  _name: string | undefined;

  static readonly definition: Aspect.Definition = <any>{
    "is": "class",
    "name": "Resource",
    "version": 0,
    "attributes": [
      {
        "is": "attribute",
        "name": "_name",
        "type": {
          "is": "type",
          "name": "string",
          "type": "primitive"
        }
      }
    ],
    "queries": [],
    "categories": [
      {
        "is": "category",
        "name": "local",
        "methods": [
          {
            "is": "method",
            "name": "name",
            "argumentTypes": [],
            "returnType": {
              "is": "type",
              "name": "string",
              "type": "primitive"
            }
          }
        ]
      }
    ],
    "farCategories": [],
    "aspects": [
      {
        "is": "aspect",
        "name": "test1",
        "categories": [
          "local"
        ],
        "farCategories": []
      }
    ]
  };
  static readonly parent = VersionedObject;
  static readonly category: Resource.Categories;
}
export declare namespace Resource {
  function installAspect(on: ControlCenter, name: 'test1'): { new(): Resource.Aspects.test1 };

  function __Resource_c(name: string): {};
  function __Resource_c(name: 'local'): Resource.Categories.local;
  function __Resource_i(name: string): {};
  function __Resource_i<T extends Resource>(name: 'local'): Resource.ImplCategories.local<T>;

  export interface Categories<C extends Resource = Resource> extends VersionedObject.Categories<C> {
    (name: 'local', implementation: Resource.ImplCategories.local<C>);
  }
  export namespace Categories {
    export type local = Resource & {
      name(): string;
    }
  }
  export namespace ImplCategories {
    export type local<C extends Resource = Resource> = {
      name: (this: C) => string;
    }
  }
  export namespace Aspects {
    export type test1 = Categories.local;
  }
}
export class Car extends Resource {
  _model: string | undefined;

  static readonly definition: Aspect.Definition = <any>{
    "is": "class",
    "name": "Car",
    "version": 0,
    "attributes": [
      {
        "is": "attribute",
        "name": "_model",
        "type": {
          "is": "type",
          "name": "string",
          "type": "primitive"
        }
      }
    ],
    "queries": [],
    "categories": [
      {
        "is": "category",
        "name": "local",
        "methods": [
          {
            "is": "method",
            "name": "model",
            "argumentTypes": [],
            "returnType": {
              "is": "type",
              "name": "string",
              "type": "primitive"
            }
          }
        ]
      },
      {
        "is": "category",
        "name": "local2",
        "methods": [
          {
            "is": "method",
            "name": "model2",
            "argumentTypes": [],
            "returnType": {
              "is": "type",
              "name": "string",
              "type": "primitive"
            }
          }
        ]
      }
    ],
    "farCategories": [],
    "aspects": [
      {
        "is": "aspect",
        "name": "test1",
        "categories": [
          "local"
        ],
        "farCategories": []
      }
    ]
  };
  static readonly parent = Resource;
  static readonly category: Car.Categories;
}
export namespace Car {
  export const __Car_Categories_local = Resource.__Resource_c && Resource.__Resource_c('local');
  export const __Car_Categories_local2 = Resource.__Resource_c && Resource.__Resource_c('local2');
  export const __Car_ImplCategories_local = Resource.__Resource_i && Resource.__Resource_i<Car>('local');
  export const __Car_ImplCategories_local2 = Resource.__Resource_i && Resource.__Resource_i<Car>('local2');
}
export declare namespace Car {
  function installAspect(on: ControlCenter, name: 'test1'): { new(): Car.Aspects.test1 };

  function __Car_c(name: string): {};
  function __Car_c(name: 'local'): Car.Categories.local;
  function __Car_c(name: 'local2'): Car.Categories.local2;
  function __Car_i(name: string): {};
  function __Car_i<T extends Car>(name: 'local'): Car.ImplCategories.local<T>;
  function __Car_i<T extends Car>(name: 'local2'): Car.ImplCategories.local2<T>;

  export interface Categories<C extends Car = Car> extends Resource.Categories<C> {
    (name: 'local', implementation: Car.ImplCategories.local<C>);
    (name: 'local2', implementation: Car.ImplCategories.local2<C>);
  }
  export namespace Categories {
    export type local = Car & typeof __Car_Categories_local & {
      model(): string;
    }
    export type local2 = Car & typeof __Car_Categories_local2 & {
      model2(): string;
    }
  }
  export namespace ImplCategories {
    export type local<C extends Car = Car> = typeof __Car_ImplCategories_local & {
      model: (this: C) => string;
    }
    export type local2<C extends Car = Car> = typeof __Car_ImplCategories_local2 & {
      model2: (this: C) => string;
    }
  }
  export namespace Aspects {
    export type test1 = Categories.local;
  }
}
