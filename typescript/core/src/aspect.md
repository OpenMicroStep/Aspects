# Module aspect.ts

Handle dynamic creation of aspect classes.

## Direct attributes and methods injection

It use 2 level of cache before the final class

 - final class: attachement to the controlcenter (not cached and veryfast: complexity of a closure)
 - aspect implementation (install categories & attributes on the class)
 - category cache (to boost & share methods)

To boost performance and object creation times, attributes are installed as getter and setter on the prototype and redirected to the manager.

Here is a diagram of what is done

```
+------------------------------------------+
|               Final class                |
| constructor closure of the controlCenter |
+------------------------------------------+
                     |
  +--------------------------------------+
  |            Cached Aspect             |
  | attributes defined on the prototype  |
  | categories & farCategories injection |
  +--------------------------------------+
                     |
  +--------------------------------------+
  |            Original Class            |
  +--------------------------------------+
```

If we consider too classes __A__ and __B__ with __B__ extends __A__ we got:

```
+-----------+   +-----------+
|  Final A  |   |  Final B  |
+-----------+   +-----------+
     |                |
+-----------+   +-----------+
| Cached  A |   | Cached  B |
+-----------+   +-----------+
      |               |
      |         +-----------+
      |         |     B     |
      |         +-----------+
      |               |
      |---------------+
      |
+-----------+
|     A     |
+-----------+
```

So if we consider publicly available classes:

```js
FinalA instanceof A === true
FinalB instanceof A === true
FinalB instanceof B === true
B instanceof A === true
FinalB instanceof FinalA === false
```

TODO: consider dynamic modification of prototype chain to fix `FinalB instanceof FinalA` and investigate potential performance losses (js engines hate this).

## Aspect runtime data

To allow the controlcenter to be fast at its job, when an aspect is built, an `Aspect.Installed` object is generated.
This object contains `O(1)` accesses to important imformations (typings, transports, relations, references) and is monomorphic