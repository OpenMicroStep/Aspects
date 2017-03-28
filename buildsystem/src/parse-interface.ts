/* parse d'une interface
in:                                   out:
## class Person : Object              {
Description de la classe              Person=: {
                                        is:class,
                                        superclass: Object
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
import {Reporter, Parser} from '@msbuildsystem/core';

type Rule<T, P> = { rx?: RegExp, subs: string[], parser?: (parser: Parser) => T, gen?: (v: T, parent: P) => void };
const rules: { [s: string]: Rule<any, any> } = {
  "class": {
    rx: /^\s*class\s+/,
    subs: ['attributes', 'category', 'farCategory', 'aspect'],
    parser: parseClass,
    gen: (clazz, parent) => parent[`${clazz.name}=`] = clazz
  } as Rule<Element.Class, object>,
  "attributes": {
    rx: /^\s*attributes\s*$/,
    subs: ['attribute']
  },
  "attribute": {
    parser: parseAttribute,
    subs: [],
    gen: aspectRuleGen("attributes", "attributes"),
  } as Rule<Element.Attribute, Element.Class>,
  "category": {
    rx: /^\s*category\s+/,
    parser: parseCategory,
    subs: ["method"],
    gen: aspectRuleGen("categories", "categories"),
  } as Rule<Element.Category, Element.Class>,
  "farCategory": {
    rx: /^\s*farCategory\s+/,
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
  };
}
function aspectRuleCategories(is: string) : Rule<string[], Element.Aspect> {
  return {
    rx: new RegExp(`^\\s*${is}\\s*:`),
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
    if ((headerLevel = parser.skip(ch => ch === '#')) > 0) { // parse header
      parser.skip(Parser.isSpaceChar);
      let content = parser.while(ch => ch !== '\n', 0).trim();
      let o = stack[first ? 0 : headerLevel + offset];
      for (let rule of o.rules) {
        if (!rule.rx || rule.rx.test(content)) {
          let sub = { rules: rule.subs.map(r => rules[r]), output: o.output };
          let ok = true;
          if (rule.parser) {
            let parser = new Parser(new Reporter(), content);
            sub.output = rule.parser(parser);
            ok = parser.reporter.diagnostics.length === 0;
            reporter.aggregate(parser.reporter);
          }
          if (ok) {
            if (rule.gen)
              rule.gen(sub.output, o.output);
            if (first) {
              offset = - headerLevel;
              first = false;
            }
            stack[headerLevel + offset + 1] = sub;
            break;
          }
        }
      }
    }
    parser.skip(ch => ch !== '\n'); // Go to next line
  } while (parser.test('\n'));
  return output;
}

namespace Element {
  export type Type =
    { is: 'type', type: 'primitive', name: string } |
    { is: 'type', type: 'class', name: string } |
    { is: 'type', type: 'array', itemType: Type, min: number, max: number | "*" } |
    { is: 'type', type: 'set', itemType: Type , min: number, max: number | "*"} |
    { is: 'type', type: 'dictionary', properties: { [s: string]: Type } };
  export type Class = {
    is: 'class',
    name: string,
    superclass?: string,

    "attributes=": { is: "group", elements: Attribute[] },
    attributes: string[],

    "categories=": { is: "group", elements: (Category | FarCategory)[] },
    categories: string[],
    farCategories: string[],

    "aspects=": { is: "group", elements: Aspect[] },
    aspects: string[]
  }
  export type Attribute = {
    is: 'attribute',
    name: string,
    type: Type
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

function parseAttribute(parser: Parser) : Element.Attribute {
  let name = parseName(parser);
  parser.skip(Parser.isAnySpaceChar);
  parser.consume(':');
  parser.skip(Parser.isAnySpaceChar);
  let type = parseType(parser);
  return { is: 'attribute', name: name, type: type };
}

function _parseCategory(parser: Parser, is: 'category' | 'farCategory') {
  parser.consume(is);
  parser.skip(Parser.isAnySpaceChar, 1);
  let name = parseName(parser);
  return { is: is, name: name, methods: [] };
}

function _parseCategories(parser: Parser, is: string) : string[] {
  let categories = [] as string[];
  parser.consume(is);
  parser.skip(Parser.isAnySpaceChar);
  parser.consume(':');
  parser.skip(Parser.isAnySpaceChar);
  while (!parser.atEnd()) {
    categories.push(parseName(parser));
    parser.skip(Parser.isAnySpaceChar);
  }
  return categories;
}

function parseCategory(parser: Parser) : Element.Category {
  return _parseCategory(parser, 'category') as Element.Category;
}

function parseFarCategory(parser: Parser) : Element.FarCategory {
  return _parseCategory(parser, 'farCategory') as Element.FarCategory;
}


function parseMethod(parser: Parser) : Element.Method {
  let name = parseName(parser);
  let args = [] as Element.Type[];
  let ret: Element.Type;
  parser.skip(Parser.isAnySpaceChar);
  parser.consume('(');
  parser.skip(Parser.isAnySpaceChar);
  if (!parser.test(')')) {
    do {
      parser.skip(Parser.isAnySpaceChar);
      let argname = parseName(parser);
      parser.skip(Parser.isAnySpaceChar);
      parser.consume(':');
      parser.skip(Parser.isAnySpaceChar);
      args.push(parseType(parser));
      parser.skip(Parser.isAnySpaceChar);
    } while (parser.test(','));
    parser.consume(')');
  }
  parser.skip(Parser.isAnySpaceChar);
  parser.consume(':');
  parser.skip(Parser.isAnySpaceChar);
  ret = parseType(parser);
  return { is: 'method', name: name, arguments: args, return: ret };
}

function parseAspect(parser: Parser) : Element.Aspect {
  parser.consume(`aspect`);
  parser.skip(Parser.isAnySpaceChar);
  let name = parseName(parser);
  return {
    is: 'aspect',
    name: name,
    categories: [],
    farCategories: []
  };
}

function parseClass(parser: Parser) : Element.Class {
  parser.consume(`class`);
  parser.skip(Parser.isAnySpaceChar, 1);
  let name = parseName(parser);
  let ret: Element.Class = {
    is: 'class',
    name: name,
    "attributes=": { is: 'group', elements: [] }, attributes: [],
    "categories=": { is: 'group', elements: [] }, categories: [], farCategories: [],
    "aspects=": { is: 'group', elements: [] }, aspects: [],
  };
  parser.skip(Parser.isAnySpaceChar);
  if (parser.test(':')) {
    parser.skip(Parser.isAnySpaceChar);
    ret.superclass = parseName(parser);
    parser.skip(Parser.isAnySpaceChar);
  }
  return ret;
}

function parseName(parser: Parser) {
  return parser.ch === '`' ? parseQuotedString(parser, '`') : parser.while(Parser.isWordChar, 1);
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


const primitiveTypes = new Set(['any', 'integer', 'decimal', 'date', 'localdate', 'string', 'array', 'dictionary', 'identifier', 'object']);
function parseType(parser: Parser) : Element.Type {
  let ret: Element.Type;
  let type: string;
  if ((type = parser.test('[') || parser.test('<'))) {
    parser.skip(Parser.isAnySpaceChar);
    let min = +parser.while(Parser.isNumberChar, 1);
    parser.skip(Parser.isAnySpaceChar);
    parser.consume(',');
    parser.skip(Parser.isAnySpaceChar);
    let max: number | "*" = +parser.while(Parser.isNumberChar, 0) || parser.consume('*');
    parser.skip(Parser.isAnySpaceChar);
    parser.consume(',');
    parser.skip(Parser.isAnySpaceChar);
    ret = { is: 'type', type: type === '[' ? 'array' : 'set', min: min, max: max, itemType: parseType(parser) } as Element.Type;
    parser.skip(Parser.isAnySpaceChar);
    parser.consume(type === '[' ? ']' : '>');
  }
  else if (parser.test('{')) {
    let properties = {};
    ret = { is: 'type', type: 'dictionary', properties: properties };
    do {
      parser.skip(Parser.isAnySpaceChar);
      let key = parser.test('*') || parseName(parser);
      parser.skip(Parser.isAnySpaceChar);
      parser.consume(':');
      parser.skip(Parser.isAnySpaceChar);
      ret.properties[key] = parseType(parser);
      parser.skip(Parser.isAnySpaceChar);
    } while (parser.test(','));
    parser.consume('}');
  }

  else {
    let name = parseName(parser);
    if (primitiveTypes.has(name))
      ret = { is: 'type', type: 'primitive', name: name };
    else
      ret = { is: 'type', type: 'class', name: name };
  }
  return ret;
}
