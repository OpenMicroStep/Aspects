import {Aspect, ControlCenter, VersionedObject, VersionedObjectConstructor, FarImplementation, Invocation, ImmutableList, ImmutableSet, ImmutableObject} from '@openmicrostep/aspects';

export class Person extends VersionedObject {
  _firstName: string | undefined;
  _lastName: string | undefined;
  _birthDate: Date | undefined;
  _mother: Person | undefined;
  _father: Person | undefined;
  _cats: ImmutableSet<Cat>;
  readonly _sons: ImmutableList<Person>;

  static readonly definition: Aspect.Definition = <any>{
    "is": "class",
    "name": "Person",
    "version": 0,
    "attributes": [
      {
        "is": "attribute",
        "name": "_firstName",
        "type": {
          "is": "type",
          "name": "string",
          "type": "primitive"
        }
      },
      {
        "is": "attribute",
        "name": "_lastName",
        "type": {
          "is": "type",
          "name": "string",
          "type": "primitive"
        }
      },
      {
        "is": "attribute",
        "name": "_birthDate",
        "type": {
          "is": "type",
          "name": "date",
          "type": "primitive"
        }
      },
      {
        "is": "attribute",
        "name": "_mother",
        "type": {
          "is": "type",
          "name": "Person",
          "type": "class"
        }
      },
      {
        "is": "attribute",
        "name": "_father",
        "type": {
          "is": "type",
          "name": "Person",
          "type": "class"
        }
      },
      {
        "is": "attribute",
        "name": "_cats",
        "type": {
          "is": "type",
          "itemType": {
            "is": "type",
            "name": "Cat",
            "type": "class"
          },
          "type": "set",
          "min": 0,
          "max": "*"
        },
        "relation": "_owner"
      }
    ],
    "queries": [
      {
        "is": "query",
        "name": "_sons",
        "type": {
          "is": "type",
          "itemType": {
            "is": "type",
            "name": "Person",
            "type": "class"
          },
          "type": "array",
          "min": 0,
          "max": "*"
        },
        "query": "{\n  \"instanceOf\": \"Person\",\n  \"$or\": [\n    { \"_father\": { \"$eq\": \"=self\" } },\n    { \"_mother\": { \"$eq\": \"=self\" } }\n  ]\n}\n"
      }
    ],
    "categories": [
      {
        "is": "category",
        "name": "core",
        "methods": [
          {
            "is": "method",
            "name": "firstName",
            "argumentTypes": [],
            "returnType": {
              "is": "type",
              "name": "string",
              "type": "primitive"
            }
          },
          {
            "is": "method",
            "name": "lastName",
            "argumentTypes": [],
            "returnType": {
              "is": "type",
              "name": "string",
              "type": "primitive"
            }
          },
          {
            "is": "method",
            "name": "fullName",
            "argumentTypes": [],
            "returnType": {
              "is": "type",
              "name": "string",
              "type": "primitive"
            }
          },
          {
            "is": "method",
            "name": "birthDate",
            "argumentTypes": [],
            "returnType": {
              "is": "type",
              "name": "date",
              "type": "primitive"
            }
          }
        ]
      }
    ],
    "farCategories": [
      {
        "is": "farCategory",
        "name": "calculation",
        "methods": [
          {
            "is": "method",
            "name": "age",
            "argumentTypes": [],
            "returnType": {
              "is": "type",
              "name": "integer",
              "type": "primitive"
            }
          }
        ]
      }
    ],
    "aspects": []
  };
  static readonly parent = VersionedObject;
  static readonly category: Person.Categories;
}
export declare namespace Person {
  function __c(name: 'core'): Person.Categories.core;
  function __c(name: 'calculation'): Person.Categories.calculation;
  function __i<T extends Person>(name: 'core'): Person.ImplCategories.core<T>;
  function __i<T extends Person>(name: 'calculation'): Person.ImplCategories.calculation<T>;

  export interface Categories<C extends Person = Person> extends VersionedObject.Categories<C> {
    (name: 'core', implementation: Person.ImplCategories.core<C>);
    (name: 'calculation', implementation: Person.ImplCategories.calculation<C>);
  }
  export namespace Categories {
    export type core = Person & {
      firstName(): string;
      lastName(): string;
      fullName(): string;
      birthDate(): Date;
    }
    export type calculation = Person & {
      farCallback(this: Person, method: 'age', argument: undefined, callback: (envelop: Invocation<number>) => void);
      farEvent(this: Person, method: 'age', argument: undefined, eventName: string, onObject?: Object);
      farPromise(this: Person, method: 'age', argument: undefined): Promise<Invocation<number>>;
    }
  }
  export namespace ImplCategories {
    export type core<C extends Person = Person> = {
      firstName: (this: C) => string;
      lastName: (this: C) => string;
      fullName: (this: C) => string;
      birthDate: (this: C) => Date;
    }
    export type calculation<C extends Person = Person> = {
      age: FarImplementation<C, undefined, number>;
    }
  }
  export namespace Aspects {
    
  }
}
export class Cat extends VersionedObject {
  _owner: Person | undefined;

  static readonly definition: Aspect.Definition = <any>{
    "is": "class",
    "name": "Cat",
    "version": 0,
    "attributes": [
      {
        "is": "attribute",
        "name": "_owner",
        "type": {
          "is": "type",
          "name": "Person",
          "type": "class"
        },
        "relation": "_cats"
      }
    ],
    "queries": [],
    "categories": [],
    "farCategories": [],
    "aspects": []
  };
  static readonly parent = VersionedObject;
  static readonly category: Cat.Categories;
}
export declare namespace Cat {
  export interface Categories<C extends Cat = Cat> extends VersionedObject.Categories<C> {
  }
  export namespace Categories {
  }
  export namespace ImplCategories {
  }
  export namespace Aspects {
    
  }
}
