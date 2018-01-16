import {
  VersionedObject, DataSourceInternal, ImmutableList, Aspect, VersionedObjectManager
} from './core';

export function traverseModifedScope(objects: Iterable<VersionedObject>, unsafe_scope: DataSourceInternal.Scope) : Set<VersionedObject> {
  return traverse(objects, unsafe_scope, [traverse_modified_attribute]);
}

export function traverseSavedScope(objects: Iterable<VersionedObject>, unsafe_scope: DataSourceInternal.Scope) : Set<VersionedObject> {
  return traverse(objects, unsafe_scope, [traverse_saved_attribute]);
}

export function traverseAllScope(objects: Iterable<VersionedObject>, unsafe_scope: DataSourceInternal.Scope) : Set<VersionedObject> {
  return traverse(objects, unsafe_scope, [traverse_modified_attribute, traverse_saved_attribute]);
}

export function traverseCurrentScope(objects: Iterable<VersionedObject>, unsafe_scope: DataSourceInternal.Scope) : Set<VersionedObject> {
  return traverse(objects, unsafe_scope, [traverse_current_attribute]);
}

const emptyList = [];
function scope_at_type_path(unsafe_scope: { [s: string]: { [s: string]: string[] } }, classname: string, path: string): ImmutableList<string> {
  let unsafe_scope_type = unsafe_scope[classname];
  return (unsafe_scope_type && unsafe_scope_type[path]) || emptyList;
}

type TraverseValue = (manager: VersionedObjectManager, attribute: Aspect.InstalledAttribute) => any | undefined;
type TraverseContext = {
  unsafe_scope: { [s: string]: { [s: string]: string[] } };
  traverse_value: TraverseValue[];
  ret: Set<VersionedObject>;
}

function traverse(objects: Iterable<VersionedObject>, unsafe_scope: DataSourceInternal.Scope, traverse_value: TraverseValue[]) : Set<VersionedObject> {
  if (Array.isArray(unsafe_scope))
    unsafe_scope = { _: { '.' : unsafe_scope }};
  let ctx: TraverseContext = {
    unsafe_scope,
    traverse_value: traverse_value,
    ret: new Set<VersionedObject>()
  }
  for (let vo of objects) {
    traverse_object(ctx, vo, '.', '');
  }
  return ctx.ret;
}

function traverse_modified_attribute(manager: VersionedObjectManager, attribute: Aspect.InstalledAttribute) {
  return manager.isAttributeModifiedFast(attribute) && manager.attributeValueFast(attribute);
}
function traverse_saved_attribute(manager: VersionedObjectManager, attribute: Aspect.InstalledAttribute) {
  return manager.isAttributeSavedFast(attribute) && manager.savedAttributeValueFast(attribute);
}
function traverse_current_attribute(manager: VersionedObjectManager, attribute: Aspect.InstalledAttribute) {
  return manager.hasAttributeValueFast(attribute) && manager.attributeValueFast(attribute);
}
function traverse_object(ctx: TraverseContext, vo: VersionedObject, path: string, prefix: string) {
  let sz = ctx.ret.size;
  ctx.ret.add(vo);
  if (sz < ctx.ret.size) {
    let manager = vo.manager();
    let aspect = manager.aspect();
    for (let attribute_name of scope_at_type_path(ctx.unsafe_scope, aspect.classname, path))
      traverse_attribute(ctx, manager, attribute_name, prefix);
    for (let attribute_name of scope_at_type_path(ctx.unsafe_scope, '_', path))
      traverse_attribute(ctx, manager, attribute_name, prefix);
    for (let attribute_name of scope_at_type_path(ctx.unsafe_scope, aspect.classname, '_'))
      traverse_attribute(ctx, manager, attribute_name, prefix);
    for (let attribute_name of scope_at_type_path(ctx.unsafe_scope, '_', '_'))
      traverse_attribute(ctx, manager, attribute_name, prefix);
  }
}

function traverse_attribute(ctx: TraverseContext, manager: VersionedObjectManager, attribute_name: string, prefix: string) {
  let attribute = manager.aspect().checkedAttribute(attribute_name);
  for (let traverse_value of ctx.traverse_value) {
    let values = traverse_value(manager, attribute);
    if (values && attribute.containsVersionedObject()) {
      let s_path = `${prefix}${attribute_name}.`;
      for (let value of attribute.traverseValue<VersionedObject>(values))
        traverse_object(ctx, value, s_path, s_path);
    }
  }
}
