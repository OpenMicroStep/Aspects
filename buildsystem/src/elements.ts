import { Element, AttributePath, ElementDefinition, ProviderMap, Reporter } from '@openmicrostep/msbuildsystem.core';

export const elementFactories = Element.createElementFactoriesProviderMap('aspects');

export const GroupElement = Element.DynGroupElement(Element);
elementFactories.registerSimple('group', (reporter: Reporter, name: string, definition: ElementDefinition, attrPath: AttributePath, parent: Element) => {
  return new GroupElement('group', name, parent);
});

export class AspectBaseElement extends Element {

}


export class AspectRootElement extends Element {
  __classes: ClassElement[] = [];
}
export  interface AspectBaseElement {
  __root() : AspectRootElement;
}

function appendUndefined(type: string, allowUndefined: boolean) {
  return allowUndefined ? `${type} | undefined` : type;
}

function embedType(condition: boolean, prefix: [string, string], type: string, suffix: [string, string]) {
  return condition ? `${prefix[0]}${type}${suffix[0]}` : `${prefix[1]}${type}${suffix[1]}`; 
}

elementFactories.registerSimple('type', (reporter, name, definition, attrPath, parent: AspectBaseElement) => {
  return new TypeElement('type', name, parent);
});
export class TypeElement extends Element {
  type: 'primitive' | 'class' | 'array' | 'set' | 'dictionary' | 'or';
  itemType?: TypeElement = undefined;
  properties?: { [s: string]: TypeElement } = undefined;
  types?: TypeElement[] = undefined;
  min?: number;
  max?: number | '*';

  __decl(isAttribute: boolean, allowUndefined: boolean = false, relation: boolean = false) {
    switch (this.type) {
      case 'primitive':
        switch (this.name) {
          case 'integer':    return appendUndefined("number", allowUndefined);
          case 'decimal':    return appendUndefined("number", allowUndefined);
          case 'date':       return appendUndefined("Date", allowUndefined);
          case 'string':     return appendUndefined("string", allowUndefined);
          case 'array':      return appendUndefined("any[]", allowUndefined);
          case 'dictionary': return appendUndefined("{ [k: string]: any }", allowUndefined);
          case 'object':     return appendUndefined("Object", allowUndefined);
          case 'identifier': return appendUndefined("string | number", allowUndefined);
        }
        return "any";
      case 'class':
        return appendUndefined(this.name, allowUndefined);
      case 'array':
        return embedType(isAttribute, [`ImmutableList<`, ``], this.itemType ? this.itemType.__decl(isAttribute) : 'any' , [`>`, `[]`]);
      case 'set':
        return embedType(isAttribute, [`ImmutableSet<`, `Set<`], this.itemType ? this.itemType.__decl(isAttribute) : 'any' , [`>`, `>`]);
      case 'dictionary':
        return embedType(isAttribute, [`ImmutableObject<`, ``], `{${Object.keys(this.properties).map(k => `${k === '*' ? '[k: string]' : `${k}`}: ${this.properties![k].__decl(isAttribute)}`).join(', ')}}` , [`>`, ``]);
      case 'or':
        return this.types ? this.types.map(t => t.__decl(isAttribute)).join(' | ') : 'any';
    }
  }

  toJSON() {
    let r: Partial<TypeElement> = { is: this.is };
    this.name                     && (r.name = this.name);
    this.itemType !== undefined   && (r.itemType = this.itemType);
    this.types !== undefined      && (r.types = this.types);
    this.properties !== undefined && (r.properties = this.properties);
    this.type !== undefined       && (r.type = this.type);
    this.min !== undefined        && (r.min = this.min);
    this.max !== undefined        && (r.max = this.max);
    return r;
  }
}

elementFactories.registerSimple('class', (reporter, name, definition, attrPath, parent: AspectBaseElement) => {
  let ret = new ClassElement('class', name, parent);
  parent.__root().__classes.push(ret);
  return ret;
});
export class ClassElement extends Element {
  superclass: string = "VersionedObject";
  attributes: AttributeElement[] = [];
  queries: QueryElement[] = [];
  categories: CategoryElement[] = [];
  farCategories: CategoryElement[] = [];
  aspects: AspectElement[] = [];

  __decl() {
    let parent = this.superclass;
    let categories = [...this.categories, ...this.farCategories];
    let workaround = '';
    if (parent !== "VersionedObject") {
      workaround = `${this.categories.map(category => `\n${category.__const(this)}`).join('')}${
                      this.farCategories.map(category => `\n${category.__const(this)}`).join('')}${
                      this.categories.map(category => `\n${category.__constImpl(this)}`).join('')}${
                      this.farCategories.map(category => `\n${category.__constImpl(this)}`).join('')}`;
    }
    let decl = `export class ${this.name} extends ${parent} {`;
    let attributes = [...this.attributes, ...this.queries];
    for (let attribute of attributes) {
      let type = attribute.type.__decl(true, true, attribute instanceof AttributeElement && !!attribute.relation);
      decl += `\n  ${attribute instanceof QueryElement ? 'readonly ' : ''}${attribute.name}: ${type};`;
    }
    if (attributes.length) 
      decl += `\n`;
    decl += `\n  static readonly definition: Aspect.Definition = <any>${JSON.stringify(this, null, 2).replace(/\n/g, '\n  ')};`;
    decl += `\n  static readonly parent = ${parent};`;
    decl += `\n  static readonly category: ${this.name}.Categories;`;
    decl += `\n}`;
    if (parent !== "VersionedObject") {
      decl += `\nexport namespace ${this.name} {`;
      for (let category of categories)
        decl += `\n  ${category.__const(this)}`;
      for (let category of categories)
        decl += `\n  ${category.__constImpl(this)}`;
      decl += `\n}`;
    }
    decl += `\nexport declare namespace ${this.name} {`;
    for (let aspect of this.aspects)
      decl += `\n  function installAspect(on: ControlCenter, name: '${aspect.name}'): { new(): ${this.name}.Aspects.${aspect.name} };`;
    if (this.aspects.length) 
      decl += `\n`;
    for (let category of categories)
      decl += `\n  function __c(name: '${category.name}'): ${this.name}.Categories.${category.name};`;
    for (let category of categories)
      decl += `\n  function __i<T extends ${this.name}>(name: '${category.name}'): ${this.name}.ImplCategories.${category.name}<T>;`;
    if (categories.length)
      decl += `\n`;
    decl += `\n  export interface Categories<C extends ${this.name} = ${this.name}> extends ${parent}.Categories<C> {`;
    for (let category of categories)
      decl += `\n    (name: '${category.name}', implementation: ${this.name}.ImplCategories.${category.name}<C>);`
    decl += `\n  }`;
    decl += `
  export namespace Categories {${
    this.categories.map(category => category.__decl(this, !!workaround)).join('')}${
    this.farCategories.map(category => category.__decl(this, !!workaround)).join('')}
  }
  export namespace ImplCategories {${
    this.categories.map(category => category.__declImpl(this, !!workaround)).join('')}${
    this.farCategories.map(category => category.__declImpl(this, !!workaround)).join('')}
  }
  export namespace Aspects {
    ${this.aspects.map(aspect => `export type ${aspect.name} = ${
      aspect.categories.concat(aspect.farCategories).map(c => `Categories.${c.name}`).join(' & ') || this.name
    };`).join('\n    ')}
  }`;
    decl += `\n}\n`;
    return decl;
  }

  toJSON() {
    return {
      is: this.is,
      name: this.name,
      version: 0,
      attributes: this.attributes.map(a => a.toJSON()),
      queries: this.queries.map(a => a.toJSON()),
      categories: this.categories.map(c => c.toJSON()),
      farCategories: this.farCategories.map(c => c.toJSON()),
      aspects: this.aspects.map(a => a.toJSON())
    };
  }
}

elementFactories.registerSimple('attribute', (reporter, name, definition, attrPath, parent) => {
  return new AttributeElement('attribute', name, parent);
});
export class AttributeElement extends Element {
  type: TypeElement;
  relation?: string;

  __resolveWithPath(reporter: Reporter, attrPath: AttributePath) {
    super.__resolveWithPath(reporter, attrPath);
    if (this.relation && this.type.type === 'array')
      this.type.type = 'set';
  }

  toJSON() {
    return {
      is: this.is,
      name: this.name,
      type: this.type,
      relation: this.relation
    };
  }
}

elementFactories.registerSimple('query', (reporter, name, definition, attrPath, parent) => {
  return new QueryElement('query', name, parent);
});
export class QueryElement extends Element {
  type: TypeElement;
  query: any;

  toJSON() {
    return {
      is: this.is,
      name: this.name,
      type: this.type,
      query: this.query
    };
  }
}

const farMethods = <((clazz: string, method: string, argument: string, ret: string) => string)[]>[
  (clazz: string, method: string, argument: string, ret: string) =>
    `farCallback(this: ${clazz}, method: '${method}', argument: ${argument}, callback: (envelop: Invocation<${ret}>) => void);`,
  (clazz: string, method: string, argument: string, ret: string) =>
    `farEvent(this: ${clazz}, method: '${method}', argument: ${argument}, eventName: string, onObject?: Object);`,
  (clazz: string, method: string, argument: string, ret: string) =>
    `farPromise(this: ${clazz}, method: '${method}', argument: ${argument}): Promise<Invocation<${ret}>>;`,
  //(clazz: string, method: string, argument: string, ret: string) =>
  //  `farAsync(this: ${clazz}, method: '${method}', argument: ${argument}): (flux: Flux<{ envelop: Invocation<${clazz}, ${ret}> }>) => void;`
];

elementFactories.registerSimple('category', (reporter, name, definition, attrPath, parent) => {
  return new CategoryElement('category', name, parent);
});
elementFactories.registerSimple('farCategory', (reporter, name, definition, attrPath, parent) => {
  return new CategoryElement('farCategory', name, parent);
});
export class CategoryElement extends Element {
  langages: string[] = [];
  methods: MethodElement[] = [];

  __constName(clazz: ClassElement) {
    return `__${clazz.name}_Categories_${this.name}`;
  }
  __constNameImpl(clazz: ClassElement) {
    return `__${clazz.name}_ImplCategories_${this.name}`;
  }
  __const(clazz: ClassElement) {
    return `export const ${this.__constName(clazz)} = ${clazz.superclass}.__c('${this.name}');`;
  }
  __constImpl(clazz: ClassElement) {
    return `export const ${this.__constNameImpl(clazz)} = ${clazz.superclass}.__i<${clazz.name}>('${this.name}');`;
  }
  __decl(clazz: ClassElement, workaround: boolean) {
    return `
    export type ${this.name} = ${clazz.name} & ${workaround ? `typeof ${this.__constName(clazz)} & ` : ''}{
${this.is === 'farCategory' ? this.__declFarMethods(clazz.name) : this.__declMethods()}    }`;
  }
  __declImpl(clazz: ClassElement, workaround: boolean) {
    return `
    export type ${this.name}<C extends ${clazz.name} = ${clazz.name}> = ${workaround ? `typeof ${this.__constNameImpl(clazz)} & ` : ''}{
${this.is === 'farCategory' ? this.__declImplFarMethods('C') : this.__declImplMethods('C')}    }`;
  }
  __declMethods() {
    return this.methods.map(method => `      ${method.name}(${method.__declArguments().join(', ')}): ${method.__declReturn()};\n`).join('');
  }
  __declFarMethods(clazz: string) {
    return this.methods.map(method => farMethods.map(f => `      ${f(clazz, method.name, method.__declFarArgument(), method.__declReturn())}\n`).join('')).join('');
  }
  __declImplMethods(clazz: string) {
    return this.methods.map(method => `      ${method.name}: (this: ${clazz}${method.__declArguments().map(a => `, ${a}`).join('')}) => ${method.__declReturn()};\n`).join('');
  }
  __declImplFarMethods(clazz: string) {
    return this.methods.map(method => `      ${method.name}: FarImplementation<${clazz}, ${method.__declFarArgument()}, ${method.__declReturn()}>;\n`).join('');
  }

  toJSON(){
    return {
      is: this.is,
      name: this.name,
      methods: this.methods.map(m => m.toJSON())
    };
  }
}

elementFactories.registerSimple('method', (reporter, name, definition, attrPath, parent) => {
  return new MethodElement('method', name, parent);
});
export class MethodElement extends Element {
  arguments: TypeElement[] = [];
  return: TypeElement;

  __declArguments() : string[] {
    return this.arguments.map((a, i) => `arg${i}: ${a.__decl(false)}`);
  }
  __declFarArgument() {
    return this.arguments[0] ? this.arguments[0].__decl(false) : "undefined";
  }
  __declReturn() {
    return this.return.__decl(false);
  }

  toJSON() {
    return {
      is: this.is,
      name: this.name,
      argumentTypes: this.arguments,
      returnType: this.return,
    };
  }
}

elementFactories.registerSimple('aspect', (reporter, name, definition, attrPath, parent) => {
  return new AspectElement('aspect', name, parent);
});
export class AspectElement extends Element {
  categories: CategoryElement[] = [];
  farCategories: CategoryElement[] = [];

  toJSON() {
    return {
      is: this.is,
      name: this.name,
      categories: this.categories.map(c => c.name),
      farCategories: this.farCategories.map(c => c.name),
    };
  }
}
