import {
  ControlCenter, ControlCenterContext, VersionedObject, VersionedObjectManager, VersionedObjectConstructor,
  Result, Aspect, FarTransport, PublicTransport,
  ImmutableList, ImmutableMap, ImmutableSet, DataSourceInternal, DataSource
} from './core';
import {Type} from './aspect.type';
import { Reporter, PathReporter, Validate as V } from '@openmicrostep/msbuildsystem.shared';

export interface VersionedObjectConstructorCache extends VersionedObjectConstructor {
  aspect: Aspect.Installed;
}

function nameClass<T extends { new(...args): any }>(name: string, parent: string, cls: T): T {
  (cls as any).displayName = name;
  (cls as any).toString = function toCustomNameString(this: Function) {
    return `class ${name} extends ${parent} {}`;
  };
  Object.defineProperty(cls, "name", { value: name, configurable: true });
  return cls;
}

export class AspectSelection {
  /** @internal */ _classes: { name: string, aspect: string, cstor: VersionedObjectConstructor }[];
  constructor(classes: { name: string, aspect: string, cstor: VersionedObjectConstructor }[]) {
    let uniq = new Set<string>();
    for (let { name } of classes) {
      if (uniq.has(name))
        throw new Error(`an aspect with class name ${name} already exists`);
      uniq.add(name);
    }
    this._classes = classes.slice(0);
  }

  classes(): Iterable<Readonly<{ name: string, aspect: string, cstor: VersionedObjectConstructor }>> {
    return this._classes;
  }
}
export namespace AspectConfiguration {
  export type DefaultContext = { defaultDataSource?: DataSource.Categories.Public, [name: string]: VersionedObject | undefined };
}
export class AspectConfiguration {
  private readonly _custom_classes = new Map<string, Function>();
  private readonly _vo_classes = new Map<string, Function>();
  private readonly _aspects = new Map<string, VersionedObjectConstructorCache>();
  private readonly _cachedCategories = new Map<string, Map<string, Aspect.InstalledMethod>>();
  /** @internal */ readonly _initDefaultContext: ((ccc: ControlCenterContext) => AspectConfiguration.DefaultContext) | undefined;
  constructor(options: {
    selection: AspectSelection,
    farTransports?: { transport: FarTransport, classes: string[], farCategories: string[] }[],
    defaultFarTransport?: FarTransport,
    initDefaultContext?: (ccc: ControlCenterContext) => AspectConfiguration.DefaultContext,
    customClasses?: { [s: string]: Function },
  })
  constructor(selection: AspectSelection)
  constructor(options: AspectSelection | {
    selection: AspectSelection,
    farTransports?: { transport: FarTransport, classes: string[], farCategories: string[] }[],
    defaultFarTransport?: FarTransport,
    initDefaultContext?: (ccc: ControlCenterContext) => AspectConfiguration.DefaultContext,
    customClasses?: { [s: string]: Function },
  }) {
    this._custom_classes.set("ObjectSet", DataSourceInternal.ObjectSet);
    this._custom_classes.set("ResolvedScope", DataSourceInternal.ResolvedScope);
    this._vo_classes.set("VersionedObject", VersionedObject);
    if (options instanceof AspectSelection)
      options = { selection: options };
    if (options.customClasses) for (let classname in options.customClasses) {
      this._custom_classes.set(classname, options.customClasses[classname]);
    }
    let { selection, farTransports, defaultFarTransport, initDefaultContext } = options;

    this._initDefaultContext = initDefaultContext;

    for (let { name, aspect, cstor } of selection.classes()) {
      let aspect_cstor = this._aspects.get(name);
      if (aspect_cstor)
        throw new Error(`an aspect with class name ${name} already exists`);

      aspect_cstor = nameClass(`${name}:${aspect}`, `${name}`, class CachedAspect extends cstor {
        static aspect = new Aspect.Installed(
          name,
          aspect,
          cstor.definition.version,
          cstor.definition.is_sub_object === true,
          cstor,
        );
      });
      this._aspects.set(name, aspect_cstor);
      this._vo_classes.set(name, cstor);
    }

    let installed_attributes = new Set<VersionedObjectConstructorCache>();
    let pending_relations: [Aspect.Installed, Aspect.InstalledAttribute, string][] = [];
    for (let { name, aspect, cstor } of selection.classes()) {
      let aspect_cstor = this._aspects.get(name)!;

      let categories = aspect_cstor.aspect.categories as Set<string>;
      let aspect_def = cstor.definition.aspects.find(a => a.name === aspect);
      if (!aspect_def)
        throw new Error(`aspect ${aspect} not found in ${name} definition`);
      aspect_def.categories.forEach(c => {
        categories.add(c);
        this.installLocalCategoryCache(this.cachedCategory(name, c, cstor), aspect_cstor!, cstor);
      });
      aspect_def.farCategories.forEach(category_name => {
        categories.add(category_name);
        let ft = farTransports && farTransports.find(t => t.farCategories.indexOf(category_name) !== -1 && t.classes.indexOf(name) !== -1);
        let t = ft && ft.transport;
        if (!t)
          t = defaultFarTransport;
        if (!t)
          throw new Error(`no far transport on ${category_name} for ${name}`);
        this.installFarCategoryCache(this.cachedCategory(name, category_name, cstor), aspect_cstor!, cstor, t);
      });

      this.install_attributes(aspect_cstor, installed_attributes, pending_relations);
    }
    this.install_attribute_relations(pending_relations);
  }

  cstor(classname: string, categories: string[]) {
    let cstor = this._aspects.get(classname);
    if (!cstor)
      throw new Error(`cannot create ${classname}: no aspect found`);
    for (let category of categories)
      if (!cstor.aspect.categories.has(category))
        throw new Error(`cannot create ${classname}: category ${category} is missing in aspect ${cstor.aspect.aspect}`);
    return cstor;
  }

  create<T extends VersionedObject>(cc: ControlCenter, classname: string, categories: string[], ...args: any[]): T {
    let cstor = this.cstor(classname, categories);
    return new cstor(cc, ...args) as T;
  }

  aspect(classname: string): Aspect.Installed | undefined {
    let cstor = this._aspects.get(classname);
    return cstor ? cstor.aspect : undefined;
  }

  aspectChecked(classname: string): Aspect.Installed {
    let cstor = this._aspects.get(classname);
    if (!cstor)
      throw new Error(`cannot find aspect ${classname}`);
    return cstor.aspect;
  }

  *aspects(): IterableIterator<Aspect.Installed> {
    for (let cstor of this._aspects.values())
      yield cstor.aspect;
  }

  installPublicTransport(transport: PublicTransport, on: VersionedObjectConstructor, categories: string[]) {
    for (let categoryName of categories) {
      this.buildCategoryCache(categoryName, on).forEach(method => {
        if (method.transport) { // far method
          transport.installMethod(on, method as Aspect.InstalledFarMethod);
        }
      });
    }
  }

  private cachedCategory(name: string, category: string, from: VersionedObjectConstructor): Map<string, Aspect.InstalledMethod> {
    let key = JSON.stringify([name, category]);
    let tmp = this._cachedCategories.get(key);
    if (!tmp) {
      this._cachedCategories.set(key, tmp = this.buildCategoryCache(category, from));
    }
    return tmp;
  }

  private buildMethodList(categoryName: string, from: VersionedObjectConstructor, map = new Map<string, Aspect.Definition.Method>()): ['far' | 'local' | undefined, Map<string, Aspect.Definition.Method>] {
    let r: ['far' | 'local' | undefined, Map<string, Aspect.Definition.Method>];
    r = from.parent ? this.buildMethodList(categoryName, from.parent, map) : [undefined, map];
    let definition = from.definition;
    let category = (definition.categories || []).find(cel => cel.name === categoryName) || (definition.farCategories || []).find(cel => cel.name === categoryName);
    if (category) {
      let type = r[0];
      if (type === undefined)
        r[0] = type = category.is === "farCategory" ? 'far' : 'local';
      else if ((type === 'far') !== (category.is === "farCategory"))
        throw new Error(`category '${category.name}' is already defined as ${type} by subclasses`);
      category.methods.forEach(method => { map.set(method.name, method); });
    }
    return r;
  }

  private buildCategoryCache(categoryName: string, from: VersionedObjectConstructor): Map<string, Aspect.InstalledMethod> {
    let ret = new Map<string, Aspect.InstalledMethod>();
    let list = this.buildMethodList(categoryName, from);
    let isFar = list[0] === "far";
    list[1].forEach(method => {
      ret.set(method.name, {
        name: method.name,
        argumentTypes: method.argumentTypes.map(t => this.createType(t, false, false)),
        returnType: method.returnType.type !== "void" ? this.createType(method.returnType, false, false) : undefined,
        transport: isFar ? Aspect.farTransportStub : undefined
      });
    });
    return ret;
  }

  private installLocalCategoryCache(cache: Map<string, Aspect.InstalledMethod>, aspect_cstor: VersionedObjectConstructorCache, cstor: VersionedObjectConstructor) {
    cache.forEach((local_method, category_name) => {
      let localImpl = cstor.prototype[local_method.name];
      if (!(local_method.name in cstor.prototype))
        throw new Error(`local method ${local_method.name} is missing for category ${category_name} in ${cstor.name}`);
      if (typeof localImpl !== "function")
        throw new Error(`implementation of local method ${local_method.name} must be a function, got ${typeof localImpl}`);
      if (local_method.transport) {
        (aspect_cstor.aspect.farMethods as Map<string, Aspect.InstalledMethod>).set(category_name, Object.assign({}, local_method, {
          transport: {
            manual_coding: true,
            remoteCall(ctx, to, method, args) {
              return fastSafeCall(ctx, localImpl, to, args[0]);
            }
          } as FarTransport
        }));
        this.installCanFarInvokable(aspect_cstor, local_method.name);
      }
      else {
        if (localImpl.length !== local_method.argumentTypes.length && localImpl.name)
          throw new Error(`arguments count in implementation of local method ${local_method.name} doesn't match interface definition: ${localImpl.length} !== ${local_method.argumentTypes.length}`);
        aspect_cstor.prototype[local_method.name] = localImpl; // TODO: protect localImpl;
      }
    });
  }

  private installFarCategoryCache(cache: Map<string, Aspect.InstalledMethod>, aspect_cstor: VersionedObjectConstructorCache, cstor: VersionedObjectConstructor, transport: FarTransport) {
    cache.forEach((far_method, method_name) => {
      if (!far_method.transport)
        throw new Error(`${far_method.name} is not a far method`);
      (aspect_cstor.aspect.farMethods as Map<string, Aspect.InstalledMethod>).set(method_name, Object.assign({}, far_method as Aspect.InstalledFarMethod, { transport: transport }));
      this.installCanFarInvokable(aspect_cstor, method_name);
    });
  }

  private installCanFarInvokable(aspect_cstor: VersionedObjectConstructorCache, method_name: string) {
    Object.defineProperty(aspect_cstor.prototype, method_name, {
      enumerable: false,
      configurable: false,
      get() {
        return { to: this, method: method_name };
      },
    });
  }

  private install_attributes(
    aspect_cstor: VersionedObjectConstructorCache,
    installed_attributes: Set<VersionedObjectConstructorCache>,
    pending_relations: [Aspect.Installed, Aspect.InstalledAttribute, string][]
  ) {
    if (!installed_attributes.has(aspect_cstor)) {
      let attributes = aspect_cstor.aspect.attributes;
      let attributes_by_index = aspect_cstor.aspect.attributes_by_index;
      let cstor: VersionedObjectConstructor | undefined = aspect_cstor.aspect.implementation;
      let will_install: VersionedObjectConstructor[] = [];
      while (cstor && cstor !== VersionedObject) {
        will_install.unshift(cstor);
        cstor = cstor.parent;
      }
      for (cstor of will_install) {
        this._vo_classes.set(cstor.definition.name, cstor);
        for (let attribute of cstor.definition.attributes || []) {
          const data = this.install_attribute(aspect_cstor, attribute, attributes_by_index.length, pending_relations);
          (attributes_by_index as Aspect.InstalledAttribute[]).push(data);
          (attributes as Map<string, Aspect.InstalledAttribute>).set(data.name, data);
        }
      }
      installed_attributes.add(aspect_cstor);
    }
  }

  private install_attribute(
    aspect_cstor: VersionedObjectConstructorCache,
    attribute_definition: Aspect.Definition.Attribute,
    index: number,
    pending_relations: [Aspect.Installed, Aspect.InstalledAttribute, string][]
  ) {
    let type = this.createType(attribute_definition.type, true, true);
    let is_sub_object = attribute_definition.is_sub_object === true;
    let contained_aspects = new Set<Aspect.Installed>();
    for (let classname of type.classnames()) {
      let contained_aspect_cstor = this._aspects.get(classname);
      if (!contained_aspect_cstor)
        throw new Error(`attribute ${aspect_cstor.aspect.classname}.${attribute_definition.name} requires class ${classname} to work`);
      let contained_aspect = contained_aspect_cstor.aspect;
      if (is_sub_object && !contained_aspect.is_sub_object)
        throw new Error(`attribute ${aspect_cstor.aspect.classname}.${attribute_definition.name} is marked as sub object while ${classname} is not`);
      contained_aspects.add(contained_aspect);
    }
    let cstor = type.attribute_cstor();
    const attribute = new cstor(
      attribute_definition.name as keyof VersionedObject,
      index,
      type,
      undefined,
      contained_aspects,
      attribute_definition.is_sub_object === true,
    );
    for (let contained_aspect of contained_aspects) {
      (contained_aspect.references as Aspect.Reference[]).push({ class: aspect_cstor.aspect, attribute: attribute });
    }
    Object.defineProperty(aspect_cstor.prototype, attribute.name, {
      enumerable: true,
      get(this: VersionedObject) {
        return this.__manager.attributeValueFast(attribute);
      },
      set(this: VersionedObject, value) {
        let manager = this.__manager;
        let at = new PathReporter(new Reporter(), manager._aspect.classname, manager.id(), '.', attribute.name);
        type.validate(at, value);
        if (at.reporter.failed)
          throw new Error(`${at} value is invalid: ${JSON.stringify(at.reporter.diagnostics, null, 2)}`);
        manager.setAttributeValueFast(attribute, value);
      }
    });

    if (attribute_definition.relation)
      pending_relations.push([aspect_cstor.aspect, attribute, attribute_definition.relation]);
    return attribute;
  }

  private install_attribute_relations(pending_relations: [Aspect.Installed, Aspect.InstalledAttribute, string][]) {
    for (let [aspect, attribute, relation] of pending_relations) {
      let relation_aspect = attribute.containedVersionedObjectIfAlone();
      if (!relation_aspect)
        throw new Error(`attribute ${aspect.classname}.${attribute.name} type of a relation must be a class, an array of classes or a set of classes`);
      let relation_attribute = relation_aspect.attributes.get(relation);
      if (!relation_attribute)
        throw new Error(`attribute ${aspect.classname}.${attribute.name} contains a relation to an unknown attribute ${relation_aspect.classname}.${relation}`);
      (attribute.relation as Aspect.Reference) = { class: relation_aspect, attribute: relation_attribute };
    }
    for (let [aspect, attribute] of pending_relations) {
      let relation_aspect = attribute.relation!.class;
      let relation_attribute = attribute.relation!.attribute;
      if (!relation_attribute.relation)
        throw new Error(`relation ${aspect.classname}.${attribute.name} - ${relation_aspect.classname}.${relation_attribute.name} is not bidirectional`);
      if (relation_attribute.relation.class !== aspect)
        throw new Error(`relation ${aspect.classname}.${attribute.name} - ${relation_aspect.classname}.${relation_attribute.name} is type incoherent`);
      if (relation_attribute.relation.attribute !== attribute)
        throw new Error(`relation ${aspect.classname}.${attribute.name} - ${relation_aspect.classname}.${relation_attribute.name} is attribute incoherent`);
    }
  }

  private createType(type: Aspect.Definition.Type, forAttribute: boolean, encodable: boolean): Aspect.Type {
    const mktype = (type: Aspect.Definition.Type, lvl: number) => {
      if (forAttribute && lvl > 0 && type.type !== "primitive" && type.type !== "class" && type.type !== "or")
        throw new Error(`cannot create deep type validator for attribute`);
      switch (type.type) {
        case "primitive": return forAttribute && lvl === 0
          ? primitiveLevel0Validators[type.name]
          : primitiveValidators[type.name];
        case "class": {
          let cstor = this._vo_classes.get(type.name);
          if (!cstor && !encodable)
            cstor = this._custom_classes.get(type.name);
          if (!cstor)
            throw new Error(`cannot find class ${type.name}`);

          let dynamic_scope: Type.DynamicScope | undefined = undefined;
          if (type.scopes) {
            let resolved_scope = new DataSourceInternal.ResolvedScope();
            let cfg = this;
            let types = function* (type): IterableIterator<Aspect.Installed> {
              if (type === '_')
                yield* cfg.aspects();
              else
                yield cfg.aspectChecked(type);
            };
            for (let scope of type.scopes) {
              if (scope.scope)
                DataSourceInternal.parseScopeExtension(resolved_scope, scope.scope, types);
              else if (scope.name === "LoadedScope")
                dynamic_scope = Type.loadedScope;
              else
                throw new Error(`no scope found for ${scope.name}`);
            }
            if (dynamic_scope && type.scopes.length !== 1)
              throw new Error(`LoadedScope cannot be combined with other scopes`);
            if (!dynamic_scope)
              dynamic_scope = new Type.ResolvedDynamicScope(resolved_scope);
          }
          let t = new Type.VersionedObjectType(type.name, cstor, dynamic_scope);
          return forAttribute ? new Type.OrUndefinedType(t) : t;
        }
        case "array": return new Type.ArrayType(type.min, type.max === '*' ? Type.ArrayType.INFINITE : type.max, mktype(type.itemType, lvl + 1));
        case "set": return new Type.SetType(type.min, type.max === '*' ? Type.SetType.INFINITE : type.max, mktype(type.itemType, lvl + 1));
        case "dictionary": {
          let keys = new Map<string, Aspect.Type>();
          let otherKeyType: Aspect.Type | undefined = undefined;
          for (let [k, v] of Object.entries(type.properties)) {
            let type = mktype(v, lvl  + 1);
            if (k === '*')
              otherKeyType = type;
            else
              keys.set(k, type);
          }
          return new Type.DictionaryType(keys, otherKeyType);
        }
        case "or": return new Type.OrType(type.types.map(t => mktype(t, lvl + 1)));
      }
      throw new Error(`cannot create ${type.type} type validator`);
    }
    return mktype(type, 0);
  }
}

const primitiveValidators: {[s in Aspect.Definition.PrimaryType]: Aspect.Type } = {
  'identifier': Type.identifierType,
  'array': Type.arrayType,
  'any': Type.anyType,
  'string': Type.stringType,
  'integer': Type.integerType,
  'decimal': Type.decimalType,
  'boolean': Type.booleanType,
  'binary': Type.binaryType,
  'dictionary': Type.dictionaryType,
  'date': Type.dateType,
  'localdate': Type.dateType,
  'undefined': Type.undefinedType,
}
const primitiveLevel0Validators: {[s in Aspect.Definition.PrimaryType]: Aspect.Type } = (function () {
  let ret: any = {};
  for (let k in primitiveValidators) {
    ret[k] = new Type.OrUndefinedType(primitiveValidators[k]);
  }
  return ret;
})();

function fastSafeCall(ctx: Aspect.FarContext, farImpl: Aspect.FarImplementation<VersionedObject, any, any>, self, arg0): Promise<any> {
  try {
    return Promise.resolve(farImpl.call(self, ctx, arg0));
  } catch (e) {
    return Promise.reject(e);
  }
}
