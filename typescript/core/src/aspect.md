## class AspectSelection

Hold the aspect selection by classes.

#### `constructor(classes: { name: string, aspect: string, cstor: VersionedObjectConstructor }[])`
Create a new aspect selection.

__!__: throws in the following cases:

 - _classes_ __MUST NOT__ contains to classes of the same name otherwise an exception is thrown

## class AspectConfiguration

Hold the configuration of classes:

 - their aspect and implementation
 - how farMethod are handled (the transport)

### Internals

In the background, it manages a cache of installed aspect on top of class implementations by using 2 caches:

 - fully installed aspect on top of class implementations
 - category cache (to boost & share methods)

To boost performance and object creation times, attributes are installed as getter and setter on the prototype and redirected to the manager.

Here is a diagram of what is done

```
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


### Methods

#### `constructor(selection: AspectSelection, farTransports?: { transport: FarTransport, classes: string[], farCategories: string[] }[], defaultFarTransport?: FarTransport)`

Create a new aspect configuration.  

__!__: throws in the following cases:

 - if _defaultFarTransport_ is not provided, all far categories must have the corresponding transport defined in _farTransport_, otherwise an exception is thrown

#### `create(cc: ControlCenter, classname: string, categories: string[], ...args: any[]) : VersionnedObject`

Create a new versionned object attached to the given control center.  

__!__: throws in the following cases:

  - __classname__ doesn't exists in this configuration
  - the installed aspect of __classname__ doesn't have all the requested categories

#### `aspect(classname: string): Aspect.InstallAspect | undefined`
Get an installed aspect from its classname or undefined if not found

#### `aspectChecked(classname: string): Aspect.InstallAspect`
Get an installed aspect from its classname.

__!__: throws if __classname__ doesn't exists in this configuration

#### `aspects(): IterableIterator<Aspect.Installed>`
Returns the list of installed aspects (ie: classname, aspect, attributes, methods, categories, implementation).

#### `aspectFactory<T extends VersionedObject>(cc: ControlCenter, classname: string, categories: string[]) : Aspect.Factory<T>`
Returns a method that will create a new versionned object of class _classname_ attached to __cc__ each time it's called.

__!__: throws in the following cases:

  - __classname__ doesn't exists in this configuration
  - the installed aspect of __classname__ doesn't have all the requested categories
