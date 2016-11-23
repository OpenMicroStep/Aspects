/* parse d'une interface
in:                                   out:
## class Person : Object              { 
Description de la classe              Person=: {
                                        is:class,
                                        superclass: Object
### attributs                           attributs: [=_version, ..., =_birthDate], 
#### _version:   integer                _version=:   {is: attribut, type:integer},
#### _firstName: string                 _firstName=: {is: attribut, type:string},
#### _lastName:  string                 _lastName=:  {is: attribut, type:string},
#### _birthDate: date                   _birthDate=: {is: attribut, type:date}
                                        categories: [=core, =calculation],
                                        core=: {
### category core [ts, objc]              is:category, langages:  [ts,objc],
                                          methods: [=firstName, ..., =birthDate],
#### firstName() : string                 firstName=: {is:method, type:{arguments:[],return:string}},
#### lastName()  : string                 lastName=:  {is:method, type:{arguments:[],return:string}},
#### fullName()  : string                 fullName=:  {is:method, type:{arguments:[],return:string}},
#### birthDate() : date                   birthDate=: {is:method, type:{arguments:[],return:date}},
                                          },
### category calculation [objc]         calculation=: {
#### age()       : integer                is:category, langages:  [objc],
                                          methods: [=age],
                                          age=: {is:method, type:{arguments:[],return:string}}
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
// response in pool.context.response or pool.context.error
export function interfaceParseFileCont(pool,path) {
  var fs= require('fs');
  fs.readFile(path, null, function(err, data) {
    if (err) {
      pool.context.error= "interfaceParseFileCont error: " + err;
      pool.continue();}
    else interfaceParseCont(pool, data);
    });
  }

export function interfaceParseCont(pool,data) {
  pool.context.response= interfaceParse(data);
  pool.continue();
  }

export function interfaceParse(source) {
  var err;
  var text,
      ch,     // The current character ch = text[at-1]
      at,lg   // The index of the next character and the lg of the text
      ;
  function _error(m) {
    throw {
      name: 'SyntaxError',
      message: m,
      at: at,
      text: text};}
  // Get the next character. When there are no more characters,
  // return the empty string.
  function _next(c?) {
    if (c && ch!==c) _error('_next: character expected: '+c+', received: '+ch);
    ch= at<lg ? text[at] : undefined;
    at += 1;
    return ch;}
  function _nextLine() {
    while (ch && ch !== '\n') _next();
    if (ch) _next();}
  function _white() {
    while (ch && ch <= ' ' && ch!=='\n') _next();}
  // Parse a string begining and ending with ".
  function _string() {
    var str= '';
    if (ch === '"') {
      while (_next() && ch !== '"') str+= ch;}
    else _error("Bad string");
    return str;}
  // Parse a word as "xxx" or yyy where yyy is letters or numbers.
  function _inWord() {
    return  ch === '_' ||
           ('A' <= ch && ch <= 'Z') ||
           ('a' <= ch && ch <= 'z') ||
           ('0' <= ch && ch <= '9');}
  function _word() {
    var str= '';
    _white();
    if (ch==='"') str= _string();
    else {
      while (_inWord()) {str+= ch; _next();}}
    return str;}
  function _inset(areRefs:boolean) {
    var set= [];
    _white();
    while (_inWord()) {
      var w= _word();
      if (w) set.push(areRefs ? '='+w : w);
      _white();
      if (ch===',') _next(',');
      _white();}
    return set;}
  function _level() {
    var level= 0;
    _white();
    while (ch && ch=='#') {level++; _next();}
    return level;}
  // [{Person={is:class...}},{is:class,attrs:{}},
  // [{Person={is:class,core=:{is:cat,first=:{is:meth}}}},
  //          {is:class,core=:{is:cat,first=:{is:meth}}},
  //                          {is:cat,first=:{is:meth}},
  //                                         {is:meth},
  
  var firstLevel= 2, currentLevel= 0, currentElementType= null;
  var result;
  //        key:              is            |  set name      |set| sets                            | subs are ?    
  var el= {'class':         ['class'        , 'classes'      , [], ['attribut','category','aspect'],  ''],
           'attributs':     ['attributs'    , ''             , [], []                              ,  'attribut'],
           'attribut':      ['attribut'     , 'attributs'    , [], []                              ,  ''],
           'category':      ['category'     , 'categories'   , [], ['method']                      ,  'method'],
           'method':        ['method'       , 'methods'      , [], []                              ,  ''],
           'aspect':        ['aspect'       , 'aspects'      , [], []                              ,  ''],
           'categories':    ['categories'   , ''             , [], []                              ,  ''],
           'farCategories': ['farCategories', ''             , [], []                              ,  '']};

  result= [{}];
  function _pop(n) {
    while (result.length>n) {
      result.pop();
      var r= result[result.length-1];
      var sets= r.is && el[r.is] ? el[r.is][3] : [];
      if (result.length>n) for (var i= 0; i<sets.length; i++) {
        var e= el[sets[i]];
//console.log('pop',sets[i],e);
        if (e[2].length) {r[e[1]]= e[2]; e[2]= [];}}}}
  function _addObject(name) {
    var r= result[result.length-1];
    var is= currentElementType ? currentElementType[0] : undefined;
    if (!is) _error("_addObject: element type unknonw");
    else if (is==='attributs') result.push(r);
    else if (is==='class'||is==='attribut'||is==='category'||is==='method'||is==='aspect') {
      var o= {is:is}, x;
      if (!name) name= _word();
      switch (is) {
        case 'class':
          _white();
          if (ch===':') {_next(':'); x= _word(); if (!x) _error('superclass'); else o['superclass']= x;}
          break;
        case 'attribut':
          _white(); _next(':'); x= _word(); if (!x) _error('type'); else o['type']= x;
          break;
        case 'category':
          _white();
          if (ch==='[') {_next('['); x= _inset(false); if (x) o['languages']= x; _next(']');}
          break;
        case 'method':
          var type= {};
          _white(); _next('('); x= _inset(false); type['arguments']= x; _next(')');
          _white(); _next(':'); x= _word(); if (!x) _error('return type'); else type['return']= x;
          o['type']= type;
          break;
        default: break;}
      r[name+'=']= o;
      currentElementType[2].push('='+name);
      result.push(o);}
    else if (is==='categories'||is==='farCategories') {
      _white(); _next(':');
      var set= _inset(true);
      if (set) r[is]= set;}
  //console.log('_addObject',result);
    }
  function _parseLine() {
    var level= _level();
    if (level>=firstLevel) {
      _pop(level-firstLevel+1);
      var is= _word(), name= null;
      if (!is) _error("parseLine: Bad word");
      else if (el[is]) { // class attributs...
        currentElementType= el[is];
        //_white(); if (ch===':') _next();
        _addObject(null);
        currentElementType= el[currentElementType[4]];}
      else {
        name= is; is= null;
        _addObject(name);}}
    _nextLine();}

  text= source; at= 0; lg= text.length;
  for (ch= ' '; ch;) _parseLine();
  _pop(1);
  return result[0];
  }
