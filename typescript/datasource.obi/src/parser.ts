import {Parser} from '@openmicrostep/msbuildsystem.shared';

export interface ObiDefinition {
  is: ObiDefinition | undefined;
  _id: number | undefined;
  system_name: string | undefined;
  attributes: Map<ObiDefinition, Set<string | number | ObiDefinition>>;
}
export interface SysObiDefinition {
  is: ObiDefinition;
  _id: number;
  system_name: string;
  attributes: Map<ObiDefinition, Set<string | number | ObiDefinition>>;
}

export interface ObiParseContext {
  obis: ObiDefinition[];
  roByName: ReadonlyMap<string, ObiDefinition>;
  roById: ReadonlyMap<number, ObiDefinition>;
  byName: Map<string, ObiDefinition>;
  byId: Map<number, ObiDefinition>;
  CarSystemNameLib: string;
  CarTypeLib: string;
  TypIDLib: string;
  TypSIDLib: string;
}

export function parseObis(ctx: ObiParseContext, parser: Parser) : ObiDefinition[] {
  let ret: ObiDefinition[] = [];
  let obi: ObiDefinition | undefined;

  while ((obi = parseObi(ctx, parser)))
    ret.push(obi);

  // 2. handle type ID (not efficient at all)
  let obi_type = findByName(ctx, ctx.CarTypeLib);
  let obi_sid = findByName(ctx, ctx.TypSIDLib);
  let obi_eid = findByName(ctx, ctx.TypIDLib );
  if (obi_type && obi_sid && obi_eid) {
    for (let obi of ctx.obis) {
      for (let [k, set] of obi.attributes.entries()) {
        let type = k.attributes.get(obi_type);
        if (type && (type.has(ctx.TypSIDLib) || type.has(ctx.TypIDLib) || type.has(obi_sid) || type.has(obi_eid))) {
          let obi_set = new Set();
          for (let v of set as Set<string>) {
            if (typeof v === "string") {
              let obi_v = findByName(ctx, v);
              if (obi_v)
                obi_set.add(obi_v);
              else
                obi_set.add(obiByName(ctx, v));
            }
            else {
                obi_set.add(v);
            }
          }
          obi.attributes.set(k, obi_set);
        }
      }
    }
  }

  return ret;
}

function parseLine(parser: Parser) {
  let line = parser.while(Parser.isNotLineChar, 0);
  let m = line.match(/^\s*([^:\/]+?)\s*(?:(:)\s*(.*?))?\s*(\/\/.*)?$/);
  return m ? { name: m[1], sep: m[2], value: m[3], comment: m[4] } : undefined;
}

function findByName(ctx: ObiParseContext, name: string) {
  return ctx.byName.get(name) || ctx.roByName.get(name);
}
function findById(ctx: ObiParseContext, id: number) {
  return ctx.byId.get(id) || ctx.roById.get(id);
}

function obiById(ctx: ObiParseContext, is: string, id: number | undefined) : ObiDefinition {
  let obi = id && findById(ctx, id);
  if (!obi) {
    obi = { is: obiByName(ctx, is), _id: id, system_name: undefined, attributes: new Map() };
    ctx.obis.push(obi);
    if (id) ctx.byId.set(id, obi);
  }
  else if (!obi.is) {
    obi.is = obiByName(ctx, is);
  }
  return obi;
}

function obiByName(ctx: ObiParseContext, name: string) : ObiDefinition {
  let obi = findByName(ctx, name);
  if (!obi) {
    obi = { is: undefined, _id: undefined, system_name: name, attributes: new Map() };
    ctx.obis.push(obi);
    ctx.byName.set(name, obi);
  }
  return obi;
}

function addCarValue(obi: ObiDefinition, car_obi: ObiDefinition, value: string | ObiDefinition) {
  let values = obi.attributes.get(car_obi);
  if (!values)
    obi.attributes.set(car_obi, values = new Set());
  values.add(value);
}

function parseObi(ctx: ObiParseContext, parser: Parser) : ObiDefinition | undefined {
  let is: string | undefined = undefined;
  let obi: ObiDefinition | undefined;
  parser.skip(Parser.isLineChar);
  do {
    let l = parseLine(parser);
    if (l) {
      if (!is) {
        if (l.sep)
          parser.error(`a new entity name was expected`);
        else
          is = l.name;
      }
      else if (!l.sep)
        parser.error(`a characteristic or _end: was expected`);
      else if (l.name === "_end")
        return obi;
      else {
        let isId = l.name === "_id";
        if (!obi) {
          if (isId && ctx.byId.get(+l.value))
            parser.error(`cannot extends objects in the same definition: { _id: ${+l.value} }`);
          obi = obiById(ctx, is, isId ? +l.value : undefined);
          if (obi.is!.system_name !== is)
            parser.error(`two object are defined with the same id but with different kinds: { _id: ${+l.value} }`);
        }
        if (!isId) {
          let isSysName = l.name === ctx.CarSystemNameLib;
          let car_obi = obiByName(ctx, l.name);
          let value = l.value || parseObi(ctx, parser);
          if (value)
            addCarValue(obi, car_obi, value);
          if (isSysName) {
            obi.system_name = l.value;
            let previous_obi = findByName(ctx, l.value);
            if (previous_obi) { // reuse the previous obi if empty
              if (previous_obi.is || previous_obi.attributes.size)
                parser.error(`cannot reclare system name: ${l.value}`);
              else {
                Object.assign(previous_obi, obi);
                obi = previous_obi;
              }
            }
            else {
              ctx.byName.set(obi.system_name, obi);
            }
          }
        }
      }
    }
  } while (parser.skip(Parser.isLineChar) > 0);
  if (obi)
    parser.error(`_end: was expected`);
  return undefined;
}