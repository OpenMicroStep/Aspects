/* parse d'une interface
in:                                   out:
## class Person : Object              {
Description de la classe              Person=: {
                                        is:class,
                                        superclass: Object
                                        is_sub_object: boolean
### attributes                          attributes: [=_version, ..., =_birthDate],
#### _version:   integer                _version=:   {is: attribute, type:integer},
#### _firstName: string                 _firstName=: {is: attribute, type:string},
#### _lastName:  string                 _lastName=:  {is: attribute, type:string},
#### _birthDate: date                   _birthDate=: {is: attribute, type:date}
                                        categories: [=core, =calculation],
                                        core=: {
### category core [ts, objc]              is:category, langages:  [ts,objc],
                                          methods: [=firstName, ..., =birthDate],
#### firstName() : string                 firstName=: {is:method, type:{arguments:[],return:string}},
#### lastName()  : string                 lastName=:  {is:method, type:{arguments:[],return:string}},
#### fullName()  : string                 fullName=:  {is:method, type:{arguments:[],return:string}},
#### birthDate() : date                   birthDate=: {is:method, type:{arguments:[],return:date}},
                                          },
### farCategory calculation [objc]      calculation=: {
#### age()       : integer                is:farCategory, langages:  [objc],
                                          methods: [=age,=tst],
                                          age=: {is:method, type:{arguments:[],return:string}},
#### tst(x:date ,y:{a:int}): {r:[1,*,{r:int}]};
                                          tst=:{is:method,type:{arguments:[date,{a:int}],return:{r:[1,*,{r:int}]}}}
                                          }
                                        aspects= [=server, =client],
### aspect server                       server=: {
#### categories: core, calculation        is:aspect,
                                          categories: [=core, =calculation]
                                          }
### aspect client                       client=: {
#### categories: core                     is:aspect,
#### farCategories: calculation           categories: [=core],
                                          farCategories: [=calculation]
                                          }
                                        }
                                      AnotherClass=: {...}
                                      }
*/
import {Reporter, Parser} from '@openmicrostep/msbuildsystem.core';

type Rule<T, P> = { subs: string[], parser: (parser: Parser) => T | undefined, gen?: (v: T, parent: P) => any };
const rules: { [s: string]: Rule<any, any> } = {
  "class": {
    subs: ['attributes', 'queries', 'category', 'farCategory', 'aspect'],
    parser: parseClass,
    gen: (clazz, parent) => parent[`${clazz.name}=`] = clazz
  } as Rule<Element.Class, object>,
  "attributes": {
    parser: (parser) => parser.test('attributes') || undefined,
    subs: ['attribute'],
    gen: (v, p) => p,
  },
  "queries": {
    parser: (parser) => parser.test('queries') || undefined,
    subs: ['query'],
    gen: (v, p) => p,
  },
  "query": {
    parser: parseQuery,
    subs: [],
    gen: aspectRuleGen("queries", "queries"),
  } as Rule<Element.Query, Element.Class>,
  "attribute": {
    parser: parseAttribute,
    subs: [],
    gen: aspectRuleGen("attributes", "attributes"),
  } as Rule<Element.Attribute, Element.Class>,
  "category": {
    parser: parseCategory,
    subs: ["method"],
    gen: aspectRuleGen("categories", "categories"),
  } as Rule<Element.Category, Element.Class>,
  "farCategory": {
    parser: parseFarCategory,
    subs: ["method"],
    gen: aspectRuleGen("categories", "farCategories"),
  } as Rule<Element.FarCategory, Element.Class>,
  "method": {
    subs: [],
    parser: parseMethod,
    gen: (method, parent) => parent.methods.push(method)
  } as Rule<Element.Method, Element.Category>,
  "aspect": {
    subs: ["categories", "farCategories"],
    parser: parseAspect,
    gen: aspectRuleGen("aspects", "aspects"),
  } as Rule<Element.Aspect, Element.Class>,
  "categories": aspectRuleCategories("categories"),
  "farCategories": aspectRuleCategories("farCategories"),
};

function aspectRuleGen(namespace: string, attr: string) {
  return function(el, parent) {
    parent[`${namespace}=`][`${el.name}=`] = el;
    parent[attr].push(`=${namespace}:${el.name}`);
    return el;
  };
}
function aspectRuleCategories(is: string) : Rule<string[], Element.Aspect> {
  return {
    parser: (parser) => _parseCategories(parser, is),
    subs: [],
    gen: (categories: string[], parent: Element.Aspect) => {
      for (let category of categories)
        parent[is].push(`=categories:${category}`);
    }
  };
}


export function parseInterface(reporter: Reporter, data: string) : object {
  let parser = new Parser(reporter, data);
  let output = {};
  let offset = 0;
  let first = true;
  let headerLevel: number;
  let stack = [{ rules: [rules.class], output: output }];
  do {
    let parsed = false;
    if ((headerLevel = parser.skip(ch => ch === '#')) > 0) { // parse header
      parser.skip(Parser.isSpaceChar);
      let o = stack[first ? 0 : headerLevel + offset];
      if (o) {
        for (let rule of o.rules) {
          let sub = { rules: rule.subs.map(r => rules[r]), output: o.output };
          let ok = true;
          if (rule.parser) {
            sub.output = rule.parser(parser);
            ok = sub.output !== undefined && parser.reporter.diagnostics.length === 0;
          }
          if (ok) {
            if (rule.gen)
              sub.output = rule.gen(sub.output, o.output) || sub.output;
            if (first) {
              offset = - headerLevel;
              first = false;
            }
            stack[headerLevel + offset + 1] = sub;
            stack.length = headerLevel + offset + 2;
            parsed = true;
            break;
          }
        }
      }
    }
    if (!parsed)
      parseUntilNextLine(parser);
  } while (!parser.atEnd());
  return output;
}

namespace Element {
  export type Type =
    { is: 'type', type: 'primitive', name: string } |
    { is: 'type', type: 'class', name: string, scopes?: string[] } |
    { is: 'type', type: 'array', itemType: Type, min: number, max: number | "*" } |
    { is: 'type', type: 'set', itemType: Type , min: number, max: number | "*"} |
    { is: 'type', type: 'dictionary', properties: { [s: string]: Type } } |
    { is: 'type', type: 'or', types: Type[] } |
    { is: 'type', type: 'void' };
  export type Class = {
    is: 'class',
    name: string,
    superclass?: string,
    is_sub_object: boolean,

    "attributes=": { is: "group" },
    attributes: string[],

    "queries=": { is: "group" },
    queries: string[],

    "categories=": { is: "group" },
    categories: string[],
    farCategories: string[],

    "aspects=": { is: "group" },
    aspects: string[]
  }
  export type Attribute = {
    is: 'attribute',
    name: string,
    type: Type,
    relation?: string
    is_sub_object?: boolean,
    validators?: string[],
  }
  export type Query = {
    is: 'query',
    name: string,
    type: Type,
    query: any
  }
  export type Category = {
    is: 'category',
    name: string,
    methods: Method[]
  }
  export type FarCategory = {
    is: 'farCategory',
    name: string,
    methods: Method[]
  }
  export type Method = {
    is: 'method',
    name: string,
    arguments: Type[],
    return: Type
  }
  export type Aspect = {
    is: 'aspect',
    name: string,
    categories: string[],
    farCategories: string[],
  }
}

function parseUntilNextLine(parser: Parser) : boolean {
  parser.skip(Parser.isNotLineChar);
  return !!(Parser.isLineChar(parser.ch) && parser.next());
}

function _parseAttribute(parser: Parser, is: string) {
  let name = parseName(parser);
  parser.skip(Parser.isSpaceChar);
  parser.consume(':');
  parser.skip(Parser.isSpaceChar);
  let type = parseType(parser);
  parseUntilNextLine(parser);
  return { is: is, name: name, type: type };
}

function parseAttribute(parser: Parser) : Element.Attribute {
  let attr = _parseAttribute(parser, 'attribute') as Element.Attribute;
  parseOptions(parser, (parser) => {
    let relation = parseStringOption(parser, "relation");
    if (relation)
      attr.relation = relation;
    if (parseBooleanOption(parser, "sub object") === true)
      attr.is_sub_object = true;
    let validators = parseStringListOption(parser, "validators");
    if (validators.length > 0)
      attr.validators = validators;
  });
  return attr;
}

function parseQuery(parser: Parser) : Element.Query {
  let query = _parseAttribute(parser, 'query') as Element.Query;
  let json = '';
  do {
    if (parser.ch === '#')
      break;
    if (parser.test('```')) {
      while (parser.test('\n') && !parser.test('```')) {
        json += parser.while(Parser.isNotLineChar, 0) + "\n";
      }
    }
    else if (parser.test('    ')) {
      do {
        json += parser.while(Parser.isNotLineChar, 0) + "\n";
      } while (parser.test('\n    '));
    }
  } while (!json && parseUntilNextLine(parser));
  if (json) {
    try {
      JSON.parse(json);
      query.query = json;
    } catch (e) {
      parser.error(`invalid json for query ${query.name}`);
      query.query = undefined;
    }
  }
  return query;
}

function _parseCategory<T>(parser: Parser, is: 'category' | 'farCategory') : T | undefined {
  if (!parser.test(is)) return undefined;
  parser.skip(Parser.isSpaceChar, 1);
  let name = parseName(parser);parser.skip(ch => ch !== '\n');
  parseUntilNextLine(parser);
  return { is: is, name: name, methods: [] } as any;
}

function _parseCategories(parser: Parser, is: string) : string[] | undefined {
  if (!parser.test(is)) return undefined;
  let categories = [] as string[];
  parser.skip(Parser.isSpaceChar);
  parser.consume(':');
  parser.skip(Parser.isSpaceChar);
  while (Parser.isWordChar(parser.ch)) {
    categories.push(parseName(parser));
    parser.skip(Parser.isSpaceChar);
  }
  parseUntilNextLine(parser);
  return categories;
}

function parseCategory(parser: Parser) : Element.Category | undefined {
  return _parseCategory(parser, 'category') as Element.Category;
}

function parseFarCategory(parser: Parser) : Element.FarCategory | undefined {
  return _parseCategory(parser, 'farCategory') as Element.FarCategory;
}

function parseMethod(parser: Parser) : Element.Method {
  let name = parseName(parser);
  let args = [] as Element.Type[];
  let ret: Element.Type;
  parser.skip(Parser.isSpaceChar);
  parser.consume('(');
  parser.skip(Parser.isSpaceChar);
  if (!parser.test(')')) {
    do {
      parser.skip(Parser.isSpaceChar);
      let argname = parseName(parser);
      parser.skip(Parser.isSpaceChar);
      parser.consume(':');
      parser.skip(Parser.isSpaceChar);
      args.push(parseType(parser));
      parser.skip(Parser.isSpaceChar);
    } while (parser.test(','));
    parser.consume(')');
  }
  parser.skip(Parser.isSpaceChar);
  parser.consume(':');
  parser.skip(Parser.isSpaceChar);
  ret = parseType(parser);
  parseUntilNextLine(parser);
  return { is: 'method', name: name, arguments: args, return: ret };
}

function parseAspect(parser: Parser) : Element.Aspect | undefined {
  if (!parser.test(`aspect`)) return undefined;
  parser.skip(Parser.isSpaceChar);
  let name = parseName(parser);
  parseUntilNextLine(parser);
  return {
    is: 'aspect',
    name: name,
    categories: [],
    farCategories: []
  };
}

function parseClass(parser: Parser) : Element.Class | undefined {
  if (!parser.test(`class`)) return undefined;
  parser.skip(Parser.isSpaceChar, 1);
  let name = parseName(parser);
  let ret: Element.Class = {
    is: 'class',
    name: name,
    is_sub_object: false,
    "attributes=": { is: 'group' }, attributes: [],
    "queries="   : { is: 'group' }, queries: [],
    "categories=": { is: 'group' }, categories: [], farCategories: [],
    "aspects="   : { is: 'group' }, aspects: [],
  };
  parser.skip(Parser.isSpaceChar);
  if (parser.test(':')) {
    parser.skip(Parser.isSpaceChar);
    ret.superclass = parseName(parser);
    parser.skip(Parser.isSpaceChar);
  }
  parseUntilNextLine(parser);
  parseOptions(parser, (parser) => {
    if (parseBooleanOption(parser, "sub object") === true)
      ret.is_sub_object = true;
  });
  return ret;
}

function parseOptions(parser: Parser, try_parse_option: (parser: Parser) => void) {
  do {
    if (parser.ch === '#')
      break;
    parser.skip(Parser.isSpaceChar);
    try_parse_option(parser);
  } while (parseUntilNextLine(parser));
}
function parseStringListOption(parser: Parser, option: string) : string[] {
  let options: string[] = [];
  if (parser.test(`_${option}_:`)) {
    do {
      parser.skip(Parser.isSpaceChar);
      options.push(parseQuotedString(parser, '`'));
      parser.skip(Parser.isSpaceChar);
    } while (parser.test(','));
  }
  return options;
}

function parseStringOption(parser: Parser, option: string) : string | undefined {
  if (parser.test(`_${option}_:`)) {
    parser.skip(Parser.isSpaceChar);
    return parseQuotedString(parser, '`');
  }
  return undefined
}
function parseBooleanOption(parser: Parser, option: string) : true | undefined {
  if (parser.test(`_${option}_`))
    return true;
  return undefined;
}

function isNameChar(ch: string): boolean {
  return Parser.isWordChar(ch) || ch === '.';
}

function parseName(parser: Parser) {
  return parser.ch === '`' ? parseQuotedString(parser, '`') : parser.while(isNameChar, 1);
}

function parseQuotedString(parser: Parser, quote = `"`) {
  parser.consume(quote);
  let noescaped = true;
  let str = parser.while(ch => {
    if (!noescaped)
      return (noescaped = true);
    if (ch === '\\')
      noescaped = false;
    return ch !== quote;
  }, 1);
  parser.consume(quote);
  return str;
}


const primitiveTypes = new Set(['any', 'integer', 'decimal', 'date', 'localdate', 'string', 'array', 'dictionary', 'identifier', 'boolean', 'undefined', 'binary']);
function parseType(parser: Parser) : Element.Type {
  let ret = [_parseType(parser)];
  parser.skip(Parser.isSpaceChar);
  while (parser.test('|')) {
    parser.skip(Parser.isSpaceChar);
    ret.push(_parseType(parser));
    parser.skip(Parser.isSpaceChar);
  }
  return ret.length === 1 ? ret[0] : { is: 'type', type: 'or', types: ret };
}
function _parseType(parser: Parser) : Element.Type {
  let ret: Element.Type;
  let type: string;
  if ((type = parser.test('[') || parser.test('<'))) {
    parser.skip(Parser.isSpaceChar);
    let min = +parser.while(Parser.isNumberChar, 1);
    parser.skip(Parser.isSpaceChar);
    parser.consume(',');
    parser.skip(Parser.isSpaceChar);
    let max: number | "*" = +parser.while(Parser.isNumberChar, 0) || parser.consume('*');
    parser.skip(Parser.isSpaceChar);
    parser.consume(',');
    parser.skip(Parser.isSpaceChar);
    ret = { is: 'type', type: type === '[' ? 'array' : 'set', min: min, max: max, itemType: parseType(parser) } as Element.Type;
    parser.skip(Parser.isSpaceChar);
    parser.consume(type === '[' ? ']' : '>');
  }
  else if (parser.test('{')) {
    let properties = {};
    ret = { is: 'type', type: 'dictionary', properties: properties };
    do {
      parser.skip(Parser.isSpaceChar);
      let key = parser.test('*') || parseName(parser);
      parser.skip(Parser.isSpaceChar);
      parser.consume(':');
      parser.skip(Parser.isSpaceChar);
      ret.properties[key] = parseType(parser);
      parser.skip(Parser.isSpaceChar);
    } while (parser.test(','));
    parser.consume('}');
  }
  else {
    let name = parseName(parser);
    if (name === 'void')
      ret = { is: 'type', type: 'void' };
    else if (primitiveTypes.has(name))
      ret = { is: 'type', type: 'primitive', name: name };
    else {
      parser.skip(Parser.isSpaceChar);
      if (parser.test('{')) { // Scope
        let scopes: string[] = [];
        do {
          parser.skip(Parser.isSpaceChar);
          let scope = parseName(parser);
          scopes.push(`=${scope}`);
          parser.skip(Parser.isSpaceChar);
        } while (parser.test(','));
        parser.consume('}');
        ret = { is: 'type', type: 'class', name: name, scopes: scopes };
      }
      else {
        ret = { is: 'type', type: 'class', name: name };
      }
    }
  }
  return ret;
}
