## class VersionedObject

La classe VersionedObject est la classe mère dont héritent tous les objets aspects.

### core
#### id(): Identifier
L'identifiant de l'objet géré.

#### version(): integer
La version courante de l'objet géré.

#### manager(): VersionedObjectManager
Le gestionnaire de cet objet.

#### controlCenter(): ControlCenter
Le center de contrôle auquel est rattaché l'objet.

#### ${attribute_name}: any
Pour chaque attribut, il existe la propriété correspondant permettant un accès classique à la valeur qui serait autrement accessible via `manager().attributeValue(attribute_name)`.

__!__: Lève une exception si l'attribut n'est pas chargé

### validation

#### validate(reporter: Reporter)
Validation de l'objet sans considération pour son entourage et report des diagnostics dans _reporter_.

## class VersionedObjectManager

Les méthodes ayant en paramètre un nom d'attribut existes aussi dans une version plus rapide avec le suffix `Fast`. Elles prennent directement les données Aspects de l'attribut évitant ainsi la résolution du nom sur une table de hashage. Ces méthodes ne sont pas décrite dans ce document par soucis de lisibilité.

Un attribut est considé chargé si:

 - l'objet est nouveau
 - l'attribut est sauvé

Une fois qu'un objet possède un identifiant réel, il n'est plus considéré comme nouveau.

### Environnement
#### id(): Identifier
L'identifiant de l'objet géré.

#### version(): integer
La version courante de l'objet géré:

 - un entier si l'objet est sauvé (via setVersion / mergeSavedAttributes)
 - `VersionedObjectManager.NoVersion` si l'objet est nouveau et sans réel identifiant (`isNew()` vrai)
- `VersionedObjectManager.UndefinedVersion` si l'objet à un identifiant réel mais pas de version définit

#### object(): VersionedObject
L'objet géré.

#### rootObject(): VersionedObject
L'objet racine.
Si l'objet est un sous-objet alors c'est l'objet racine de son parent, sinon c'est l'objet géré.

#### controlCenter(): ControlCenter
Le center de contrôle auquel est rattaché l'objet.

### Définition
#### classname(): string
Le nom de la classe de l'objet

#### aspect(): Aspect.Installed
Les données sur l'aspect de l'objet.

#### isSubObject(): boolean
Vrai si l'objet est un sous-object.

### Etat & Valeurs
#### isSaved(): boolean
Vrai si l'objet est sauvé

#### isNew(): boolean
Vrai si l'objet est nouveau.

#### isModified(): boolean
Vrai si l'objet est modifié

#### isInConflict(): boolean
Vrai si l'objet à un conflit

#### isDeleted(): boolean
Vrai si l'objet est supprimé

#### isAttributeSaved(attribute_name: string): boolean
Vrai si l'attribut _attribute\_name_ est sauvé

#### isAttributeModified(attribute_name: string): boolean
Vrai si l'attribut _attribute\_name_ est modifié

#### isAttributeInConflict(attribute_name: string): boolean
Vrai si l'attribut _attribute\_name_ est en conflit

#### hasAttributeValue(attribute_name: string): boolean
Vrai si l'attribut _attribute\_name_ est chargé.

#### attributeValue(attribute_name: string): any
La valeur courante de l'attribut _attribute\_name_.

 - Si l'attribut est modifié, c'est la valeur modifié.
 - Sinon si l'attribut est sauvé, c'est la valeur sauvé
 - Sinon si l'objet est nouveau, c'est la valeur par défaut
  - un ensemble vide si l'attribut est un ensemble
  - un tabeau vide si l'attribute est un tableau
  - undefined sinon

__!__: Lève une exception si l'attribut n'est pas chargé

#### savedAttributeValue(attribute_name: string): any
La valeur sauvé de le l'attribut _attribute\_name_.

__!__: Lève une exception si l'attribut n'est pas chargé

### Gestion

#### setAttributeValue(attribute_name: string, value: any): void
Change la valeur courante de l'attribut _attribute\_name_.

__!__: Lève une exception si:
 - l'attribut n'est pas chargé
 - la valeur donnée pose un problème de cohérence vis à vis du modèle Aspects

#### modifiedAttributes(): Iterable<{ attribute: Aspect.InstalledAttribute, modified: any }>
Retourne un itérateur sur l'ensemble des attributs modifiés et la valeur associée.

#### clearModifiedAttribute(attribute_name: string): void
Annule les modifications faites à l'attribut _attribute\_name_

#### clearAllModifiedAttributes(): void
Annule toutes les modifications

#### unloadAttribute(attribute_name: string): void
Décharge l'attribut _attribute\_name_, si l'attribut est modifié, les modifications sont perdues.

#### unload(): void
Décharge tous les attributs

#### delete(): void
Marque l'objet pour suppression. Un objet marqué pour suppression est considéré comme totalement déchargé.

#### setId(id: Identifier)
Définit l'identifiant réel de l'objet.

__!__: Lève une exception si:
 - _id_ est un identifiant local
 - un identifiant à déjà été définit pour l'objet

#### setVersion(version: number)
Marque l'objet comme sauvé, l'ensemble des modifications sont placés sont considérés comme sauvé.

__!__: Lève une exception si l'objet est nouveau (ne possède pas d'identifiant réel)

#### computeMissingAttributes(snapshot: VersionedObjectSnapshot): string[]
Retourne la liste des attributs actuellement chargé qui ne sont pas présent dans l'instantané _snapshot_.

#### mergeSavedAttributes(snapshot: VersionedObjectSnapshot): { changes: string[], conflicts: string[], missings: string[] }
Fusionne l'instantané _snapshot_ en tant que valeur sauvé de l'objet et retourne 3 listes d'attributs:

 - `changes`: pour l'ensemble des attributs qui ont une nouvelle valeur sauvé,
 - `conflicts`: pour l'ensemble des attributs qui sont désormais en conflit,
 - `missings`: pour l'ensemble des attributs qui était chargé et qui ne le sont plus car non présents dans l'instantané.

__!__: Lève une exception si les valeurs données posent un problème de cohérence vis à vis du modèle Aspects

## class VersionedObjectSnapshot

#### id(): Identifier
L'identifiant de l'objet au moment de sa capture.

#### version(): integer
La version de l'objet au moment de sa capture.

#### setAttributeValueFast(attribute: Aspect.InstalledAttribute, value): void
Définit la valeur de l'attribut _attribute_ au moment de sa capture.

#### hasAttributeValueFast(attribute: Aspect.InstalledAttribute): boolean
Vrai si la valeur de l'attribut _attribute_ fait partie de la capture

#### attributeValueFast(attribute: Aspect.InstalledAttribute): any
La valeur de l'attribut _attribute_ au moment de sa capture.
