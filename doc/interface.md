Définition d'un objet aspect
============================

## Class
### attributs
#### is: 'class'
#### superclass: string
#### attributes: [0, *, Attribute]
#### queries: [0, *, Query]
#### categories: [0, *, Category]
#### farCategories: [0, *, FarCategory]
#### aspects: [0, *, Aspect]

## Attribute
### attributs
#### is: 'attribute'
#### type: Type

## Query
### attributs
#### is: 'query'
#### type: Type
#### query: dictionary

## Category
### attributs
#### is: 'category'
#### methods: [0, *, Method]

## FarCategory
### attributs
#### is: 'farCategory'
#### methods: [0, *, Method]

## Method
### attributs
#### is: 'method'
#### arguments: [0, *, Type]
#### return: Type

## Aspect
### attributs
#### is: 'aspect'
#### categories: [0, *, Category]
#### farCategories: [0, *, FarCategory]

## Type
### attributs
#### is: 'type'
#### type: 'primitive' | 'class' | 'array' | 'set' | 'dictionary'
#### itemType: Type
Si _type_ vaut _array_ ou _set_, le type d'un élément.
#### min: integer
Si _type_ vaut _array_ ou _set_, le nombre minimum d'élément requis.
#### max: integer | '*'
Si _type_ vaut _array_ ou _set_, le nombre maximum d'élément autorisés (_*_ pour l'infini).
#### properties: {*:Type}
Si _type_ vaut _dictionary_, les types pour chaque clés.