import {ControlCenter, VersionedObject, VersionedObjectConstructor, FarImplementation, Invocation} from '@microstep/aspects';

export interface ResourceConstructor<C extends Resource> extends VersionedObjectConstructor<C> {
  parent: VersionedObjectConstructor<VersionedObject>;

  category(name: 'local', implementation: Resource.ImplCategories.local<Resource>);

  installAspect(on: ControlCenter, name: 'test1'): { new(): Resource.Aspects.test1 };

  __c(name: 'local'): Resource.Categories.local;
  __c(name: string): Resource;
  __i<T extends Resource>(name: 'local'): Resource.ImplCategories.local<T>;
  __i<T extends Resource>(name: string): {};
}
export interface Resource extends VersionedObject {
  _name: string | undefined;
}
export const Resource = VersionedObject.extends<ResourceConstructor<Resource>>(VersionedObject, {
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
        "tags": [],
        "type": "primitive"
      }
    }
  ],
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
            "tags": [],
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
});

export namespace Resource {
  export namespace Categories {
    export type local = Resource & {
      name(): string;
    }
  }
  export namespace ImplCategories {
    export type local<C extends Resource> = {
      name: (this: C) => string;
    }
  }
  export namespace Aspects {
    export type test1 = Categories.local;
  }
}
export interface CarConstructor<C extends Car> extends VersionedObjectConstructor<C> {
  parent: ResourceConstructor<Resource>;

  category(name: 'local', implementation: Car.ImplCategories.local<Car>);
  category(name: 'local2', implementation: Car.ImplCategories.local2<Car>);

  installAspect(on: ControlCenter, name: 'test1'): { new(): Car.Aspects.test1 };

  __c(name: 'local'): Car.Categories.local;
  __c(name: 'local2'): Car.Categories.local2;
  __c(name: string): Car;
  __i<T extends Car>(name: 'local'): Car.ImplCategories.local<T>;
  __i<T extends Car>(name: 'local2'): Car.ImplCategories.local2<T>;
  __i<T extends Car>(name: string): {};
}
export interface Car extends Resource {
  _model: string | undefined;
}
export const Car = VersionedObject.extends<CarConstructor<Car>>(Resource, {
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
        "tags": [],
        "type": "primitive"
      }
    }
  ],
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
            "tags": [],
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
            "tags": [],
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
});

export const __Car_Categories_local = Resource.__c('local');
export const __Car_Categories_local2 = Resource.__c('local2');
export const __Car_ImplCategories_local = Resource.__i<Car>('local');
export const __Car_ImplCategories_local2 = Resource.__i<Car>('local2');
export namespace Car {
  export namespace Categories {
    export type local = Car & typeof __Car_Categories_local & {
      model(): string;
    }
    export type local2 = Car & typeof __Car_Categories_local2 & {
      model2(): string;
    }
  }
  export namespace ImplCategories {
    export type local<C extends Car> = typeof __Car_ImplCategories_local & {
      model: (this: C) => string;
    }
    export type local2<C extends Car> = typeof __Car_ImplCategories_local2 & {
      model2: (this: C) => string;
    }
  }
  export namespace Aspects {
    export type test1 = Categories.local;
  }
}
