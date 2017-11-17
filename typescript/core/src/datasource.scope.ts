import { Aspect, ImmutableSet, VersionedObject, VersionedObjectManager } from './core';

export type Scope = {
  [s: string]: {
    [s: string]: string[]
  }
} | string[];
export type WillResolveScope = {
  [s: string]: {
    [s: string]: string[]
  }
};
export type ResolvedScope = {
  [s: string]: {
    [s: string]: Set<Aspect.InstalledAttribute>
  }
};
export namespace ResolvedScope {
  const emptySet = new Set();
  export function scope_at_type_path(scope: ResolvedScope | undefined, type: string, path: string): ImmutableSet<Aspect.InstalledAttribute> {
    if (!scope) return emptySet;
    let scope_type = scope[type];
    if (!scope_type) return emptySet;
    return scope_type[path] || emptySet;
  }
}

export type ResolvedSort = { asc: boolean, path: Aspect.InstalledAttribute[] }[];

type ParseScopeContext = {
  unsafe_scope: WillResolveScope,
  unsafe_path_count: number,
  safe_path_count: number,
  safe_aspect_path_abs: number;
  safe_aspect_path_idx: number;
  safe_aspect_path_cnt: number;
  safe_aspect_path: Aspect.InstalledAttribute[],
  max_path_len: number,
  scope: ResolvedScope,
  sort: ResolvedSort,
  aspectsForType: (type: string) => Iterable<Aspect.Installed>,
};


export function attribute_name_type_are_equals(ai: Aspect.InstalledAttribute, bi: Aspect.InstalledAttribute) : boolean {
  return ai === bi || (ai.name === bi.name && Aspect.typesAreComparable(ai.type, bi.type));
}

export function attributes_name_type_are_equals(a: Aspect.InstalledAttribute[], b: Aspect.InstalledAttribute[]) {
  if (a.length !== b.length)
    return false;
  for (var i = 0; i < a.length; i++) {
    if (!attribute_name_type_are_equals(a[i], b[i]))
      return false;
  }
  return true;
}

function parseScopeAttr(ctx: ParseScopeContext,
  safe_path: string,
  safe_attributes: Set<Aspect.InstalledAttribute>, aspect: Aspect.Installed,
  unsafe_attribute: string, is_absolute: boolean, allow_sort: boolean
) {
  let sort_match = unsafe_attribute.match(/^(\+|-)(#)?/);
  if (sort_match) {
    if (!is_absolute)
      throw new Error(`sort is forbidden on '_' paths`);
    if (!allow_sort)
      throw new Error(`sort is forbidden on '${safe_path}' path`);
    unsafe_attribute = unsafe_attribute.substring(sort_match[0].length);
  }

  let safe_attribute = aspect.attributes.get(unsafe_attribute);
  if (!safe_attribute)
    throw new Error(`'${unsafe_attribute}' requested but not found for '${aspect.classname}'`);

  if (!sort_match || sort_match[2] !== "#")
    safe_attributes.add(safe_attribute);

  let cnt = ctx.safe_aspect_path_cnt;
  let types = Aspect.typeToAspectNames(safe_attribute.type);
  if (types.length) {
    let path_a = `${safe_path.length === 1 ? '' : safe_path}${safe_attribute.name}.`;
    let go_deeper = is_absolute || path_a.length <= ctx.max_path_len;
    if (!go_deeper) {
      go_deeper = ctx.safe_aspect_path.indexOf(safe_attribute, ctx.safe_aspect_path_abs) === -1;
      if (!go_deeper) { // cycle found, let's add '_'
        let safe_attributes = get_safe_attributes(ctx, aspect, "_");
        safe_attributes.add(safe_attribute);
      }
    }

    if (go_deeper) {
      ctx.safe_aspect_path.push(safe_attribute);
      if (is_absolute) {
        let abs = ctx.safe_aspect_path_abs;
        ctx.safe_aspect_path_abs = ctx.safe_aspect_path.length;
        parseScopePath(ctx, iterParseTypes(ctx, path_a, types, sort_match !== null));
        ctx.safe_aspect_path_abs = abs;
      }
      else {
        parseScopePath(ctx, iterParseTypes(ctx, path_a, types, sort_match !== null));
      }
      ctx.safe_aspect_path.pop();
    }
  }

  if (sort_match && cnt === ctx.safe_aspect_path_cnt) {
    if (!Aspect.typeIsSingleValue(safe_attribute.type))
      throw new Error(`cannot sort on '${safe_attribute.name}' (it is not a single value)`);

    let idx = ctx.safe_aspect_path_idx + ctx.safe_aspect_path_cnt;
    let asc = sort_match[1] === '+';
    let path = ctx.safe_aspect_path.slice(0);
    path.push(safe_attribute);
    if (idx < ctx.sort.length) {
      let other = ctx.sort[idx];
      if (other.asc !== asc || !attributes_name_type_are_equals(other.path, path))
        throw new Error(`incompatible sorts`);
    }
    else {
      ctx.sort.push({ asc: sort_match[1] === '+', path: path });
    }
    ctx.safe_aspect_path_cnt++;
    if (sort_match[2] !== "#")
      safe_attributes.add(safe_attribute);
  }
}

function get_safe_attributes(ctx: ParseScopeContext, aspect: Aspect.Installed, safe_path: string) {
  let safe_scope_type = ctx.scope[aspect.classname];
  if (!safe_scope_type)
    ctx.scope[aspect.classname] = safe_scope_type = {};
  let safe_attributes = safe_scope_type[safe_path];
  if (!safe_attributes) {
    ctx.safe_path_count++;
    safe_attributes = safe_scope_type[safe_path] = new Set<Aspect.InstalledAttribute>();
  }
  return safe_attributes;
}

function parseScopeType(ctx: ParseScopeContext,
  safe_path: string | "_",
  aspect: Aspect.Installed, unsafe_scope_type: { [s: string]: string[] },
  allow_sort: boolean,
) {
  let unsafe_attributes = unsafe_scope_type[safe_path];
  let unsafe_attributes_ = unsafe_scope_type["_"];
  if (!unsafe_attributes && !unsafe_attributes_)
    return;

  let safe_attributes = get_safe_attributes(ctx, aspect, safe_path);
  if (unsafe_attributes && unsafe_attributes !== unsafe_attributes_) {
    for (let unsafe_attribute of unsafe_attributes) {
      parseScopeAttr(ctx, safe_path, safe_attributes, aspect, unsafe_attribute, true, allow_sort);
    }
  }
  if (unsafe_attributes_) {
    for (let unsafe_attribute of unsafe_attributes_) {
      parseScopeAttr(ctx, safe_path, safe_attributes, aspect, unsafe_attribute, false, allow_sort);
    }
  }
}

function parseScopePath(ctx: ParseScopeContext, iter: IterableIterator<void>) {
  let idx = ctx.safe_aspect_path_idx;
  let cnt = ctx.safe_aspect_path_cnt;
  let n = 0;
  let done = false;
  do {
    ctx.safe_aspect_path_idx = idx + cnt;
    ctx.safe_aspect_path_cnt = 0;
    done = iter.next().done;
    if (ctx.safe_aspect_path_cnt > 0 && ctx.safe_aspect_path_cnt !== n)  {
      if (n === 0)
        n = ctx.safe_aspect_path_cnt;
      else
        throw new Error(`incompatible sort count`);
    }
  } while (!done);
  ctx.safe_aspect_path_idx = idx;
  ctx.safe_aspect_path_cnt = cnt + n;
}

export function parseScope(
  unsafe_scope: Scope,
  aspectsForType: (type: string | "_") => Iterable<Aspect.Installed>
) : { scope: ResolvedScope, sort: ResolvedSort } {
  if (Array.isArray(unsafe_scope))
    unsafe_scope = { _: { '.' : unsafe_scope }};
  let ctx: ParseScopeContext = {
    unsafe_scope: unsafe_scope,
    unsafe_path_count: 0,
    safe_path_count: 0,
    safe_aspect_path_abs: 0,
    safe_aspect_path_idx: 0,
    safe_aspect_path_cnt: 0,
    safe_aspect_path: [],
    max_path_len: 0,
    scope: {},
    sort: [],
    aspectsForType: aspectsForType,
  };
  let max_path_len = 0;
  let path_count = 0;
  for (let t in ctx.unsafe_scope) {
    for (let p in ctx.unsafe_scope[t]) {
      path_count++;
      if (p.length > max_path_len)
        max_path_len = p.length;
    }
  }
  ctx.max_path_len = max_path_len;
  ctx.unsafe_path_count = path_count;
  parseScopePath(ctx, iterParseRootTypes(ctx, '.'));

  return { scope: ctx.scope, sort: ctx.sort };
}

function _traverseScope(
  scope: ResolvedScope, object: VersionedObject,
  path: string, n_path: string,
  for_each: (manager: VersionedObjectManager, path: string, attributes: ImmutableSet<Aspect.InstalledAttribute>) => void
) {
  let manager = object.manager();
  let attributes = ResolvedScope.scope_at_type_path(scope, manager.classname(), path);
  for_each(manager, path, attributes);
  for (let attribute of attributes) {
    if (Aspect.typeIsClass(attribute.type)) {
      let s_path = `${n_path}${attribute.name}.`;
      let data = manager._attribute_data[attribute.index];
      for (let value of Aspect.traverse<VersionedObject>(attribute.type, data.modified))
        _traverseScope(scope, value, s_path, s_path, for_each);
      for (let value of Aspect.traverse<VersionedObject>(attribute.type, data.saved))
        _traverseScope(scope, value, s_path, s_path, for_each);
    }
  }
}

export function traverseScope(
  scope: ResolvedScope, object: VersionedObject,
  for_each: (manager: VersionedObjectManager, path: string, attributes: ImmutableSet<Aspect.InstalledAttribute>) => void
) {
  _traverseScope(scope, object, '.', '', for_each);
}

function* iterParseRootTypes(ctx: ParseScopeContext, safe_path: string) {
  for (let unsafe_type in ctx.unsafe_scope) {
    let unsafe_scope_type = ctx.unsafe_scope[unsafe_type];
    for (let aspect of ctx.aspectsForType(unsafe_type)) {
      yield parseScopeType(ctx, safe_path, aspect, unsafe_scope_type, true);
    }
  }
}

function* iterParseTypes(ctx: ParseScopeContext, safe_path: string, types: Iterable<string>, allow_sort: boolean) {
  for (let unsafe_type of types) {
    let unsafe_scope_type = ctx.unsafe_scope[unsafe_type];
    let unsafe_scope_type_ = ctx.unsafe_scope["_"];
    for (let aspect of ctx.aspectsForType(unsafe_type)) {
      if (unsafe_scope_type)
        yield parseScopeType(ctx, safe_path, aspect, unsafe_scope_type, allow_sort);
      if (unsafe_scope_type_)
        yield parseScopeType(ctx, safe_path, aspect, unsafe_scope_type_, allow_sort);
    }
  }
}
