import { ObiDefinition } from './parser';
export function getOne(def: ObiDefinition, attribute: ObiDefinition, defaultValue?: string | ObiDefinition) {
  let set = def.attributes.get(attribute);
  if (!set && defaultValue)
    return defaultValue;
  if (!set)
    throw new Error(`attribute ${attribute.system_name} not found in { is: ${def.is}, _id: ${def._id}, system_name: ${def.system_name} }`);
  if (set.size !== 1)
    throw new Error(`attribute ${attribute.system_name} cardinality is not one { is: ${def.is}, _id: ${def._id}, system_name: ${def.system_name} }`);
  return set.values().next().value;
}


export function add_to<K, T>(map: Map<K, Set<T>>, key: K, value: T) {
  let values = map.get(key);
  if (!values)
    map.set(key, values = new Set());
  values.add(value);
}
export function del_from<K, T>(map: Map<K, Set<T>>, key: K, value: T) {
  let values = map.get(key);
  if (values)
    values.delete(value);
}

export * from './odb';
export * from './parser';
export * from './datasource.obi';
export * from './obi-def';
export * from './query';
