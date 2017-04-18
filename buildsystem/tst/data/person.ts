import {ControlCenter, VersionedObject, VersionedObjectConstructor, FarImplementation, Invocation, ImmutableList, ImmutableSet, ImmutableObject} from '@openmicrostep/aspects';

export interface PersonConstructor<C extends Person> extends VersionedObjectConstructor<C> {
  parent: VersionedObjectConstructor<VersionedObject>;

  category(name: 'core', implementation: Person.ImplCategories.core<Person>);
  category(name: 'calculation', implementation: Person.ImplCategories.calculation<Person>);


  __c(name: 'core'): Person.Categories.core;
  __c(name: 'calculation'): Person.Categories.calculation;
  __c(name: string): Person;
  __i<T extends Person>(name: 'core'): Person.ImplCategories.core<T>;
  __i<T extends Person>(name: 'calculation'): Person.ImplCategories.calculation<T>;
  __i<T extends Person>(name: string): {};
}
export interface Person extends VersionedObject {
  _firstName: string | undefined;
  _lastName: string | undefined;
  _birthDate: Date | undefined;
  _mother: Person | undefined;
  _father: Person | undefined;
  _cats: ImmutableSet<Cat>;
  readonly _sons: ImmutableList<Person>;
}
export const Person = VersionedObject.extends<PersonConstructor<Person>>(VersionedObject, {
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
});

export namespace Person {
  export namespace Categories {
    export type core = Person & {
      firstName(): string;
      lastName(): string;
      fullName(): string;
      birthDate(): Date;
    }
    export type calculation = Person & {
      farCallback(this: Person, method: 'age', argument: undefined, callback: (envelop: Invocation<Person, number>) => void);
      farEvent(this: Person, method: 'age', argument: undefined, eventName: string, onObject?: Object);
      farPromise(this: Person, method: 'age', argument: undefined): Promise<Invocation<Person, number>>;
    }
  }
  export namespace ImplCategories {
    export type core<C extends Person> = {
      firstName: (this: C) => string;
      lastName: (this: C) => string;
      fullName: (this: C) => string;
      birthDate: (this: C) => Date;
    }
    export type calculation<C extends Person> = {
      age: FarImplementation<C, undefined, number>;
    }
  }
  export namespace Aspects {
    
  }
}
export interface CatConstructor<C extends Cat> extends VersionedObjectConstructor<C> {
  parent: VersionedObjectConstructor<VersionedObject>;



  __c(name: string): Cat;
  __i<T extends Cat>(name: string): {};
}
export interface Cat extends VersionedObject {
  _owner: Person | undefined;
}
export const Cat = VersionedObject.extends<CatConstructor<Cat>>(VersionedObject, {
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
});

export namespace Cat {
  export namespace Categories {
  }
  export namespace ImplCategories {
  }
  export namespace Aspects {
    
  }
}
