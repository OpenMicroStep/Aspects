import { Aspect, Identifier, VersionedObject, VersionedObjectConstructor } from './core';
import { Async, Flux } from '@openmicrostep/async';
import { Reporter, AttributeTypes as V, AttributePath } from '@openmicrostep/msbuildsystem.shared';

export namespace Validation {

export const validateId: V.Validator0<Identifier> = {
  validate: function validateString(reporter: Reporter, path: AttributePath, value: any) {
    if (typeof value !== "string" && typeof value !== "number")
      path.diagnostic(reporter, { is: "warning", msg: `an identifier must be a string or a number, got ${typeof value}` });
    else if (value === "")
      path.diagnostic(reporter, { is: "warning", msg: `an identifier can't be an empty string ` });
    else
      return value;
    return undefined;
  }
};

export const validateVersion: V.Validator0<number> = {
  validate: function validateString(reporter: Reporter, path: AttributePath, value: any) {
    if (typeof value !== "number" || !Number.isInteger(value))
      path.diagnostic(reporter, { is: "warning", msg: `a version must be an integer, got ${typeof value}` });
    else
      return value;
    return undefined;
  }
};

export const validateHasValue: V.Validator0<any> = {
  validate: function validateHasValue(reporter: Reporter, path: AttributePath, value: any) {
    if (value === undefined)
      path.diagnostic(reporter, { is: "warning", msg: `required` });
    return value;
  }
};


export function classValidator(classname: string, allowUndefined: boolean) : Aspect.TypeValidator {
  return { validate: function validateClass(reporter: Reporter, path: AttributePath, value: any) {
    if (value === undefined && allowUndefined)
      return value;
    if (value instanceof VersionedObject) {
      let aspect = value.controlCenter().aspect(classname);
      if (!aspect && classname === "VersionedObject")
        return value;
      else if (!aspect)
        path.diagnostic(reporter, { is: "warning", msg: `attribute must be a ${classname}, unable to find aspect`});
      else if (value instanceof aspect.implementation)
        return value;
      else
        path.diagnostic(reporter, { is: "warning", msg: `attribute must be a ${classname}, got ${value.manager().name()}`});
    }
    else if (typeof value === "object")
      path.diagnostic(reporter, { is: "warning", msg: `attribute must be a ${classname}, got ${value.constructor ? value.constructor.name : value}`});
    else
      path.diagnostic(reporter, { is: "warning", msg: `attribute must be a ${classname}, got ${typeof value}`});
    return value;
  }}
}

export function categoryValidation<T extends VersionedObject>(on: VersionedObjectConstructor<T> & { category(name: 'validation', implementation: VersionedObject.ImplCategories.validation<T>): void }, extensions: V.Extensions0<Partial<T>>) {
  const validate = Validation.attributesValidator(extensions);
  on.category('validation', {
    validate(reporter) {
      validate(reporter, this as T);
    }
  });
}

export function attributesValidator<T extends VersionedObject>(extensions: V.Extensions0<Partial<T>>) {
  return function validateAttributes(reporter: Reporter, object: T): void {
    let at = new AttributePath();
    let m = object.manager();
    at.push('.', '');
    for (let attribute in extensions) {
      if (m.hasAttributeValue(attribute))
        extensions[attribute].validate(reporter, at.set(attribute), m.attributeValue(attribute));
    }
  }
}

export const primitiveValidators: {[s in Aspect.PrimaryType]: Aspect.TypeValidator } = {
  'identifier': validateId,
  'array': V.validateArray,
  'any': V.validateAny,
  'string': {
    validate: function validateString(reporter: Reporter, path: AttributePath, value: any) {
      if (typeof value === "string")
        return value;
      path.diagnostic(reporter, { is: "warning", msg: `attribute must be a string, got ${typeof value}` });
      return undefined;
    }
  },
  'integer': {
    validate: function validateInteger(reporter: Reporter, path: AttributePath, value: any) {
      if (typeof value === "number" && Number.isInteger(value))
        return value;
      path.diagnostic(reporter, { is: "warning", msg: `attribute must be an integer, got ${typeof value}` });
      return undefined;
    }
  },
  'boolean': {
    validate: function validateBoolean(reporter: Reporter, path: AttributePath, value: any) {
      if (typeof value === "boolean")
        return value;
      path.diagnostic(reporter, { is: "warning", msg: `attribute must be an boolean, got ${typeof value}` });
      return undefined;
    }
  },
  'decimal': {
    validate: function validateDecimal(reporter: Reporter, path: AttributePath, value: any) {
      if (typeof value === "number" && Number.isFinite(value))
        return value;
      path.diagnostic(reporter, { is: "warning", msg: `attribute must be a decimal, got ${typeof value}` });
      return undefined;
    }
  },
  'dictionary': {
    validate: function validateDictionary(reporter: Reporter, path: AttributePath, value: any) {
      if (typeof value === "object")
        return value;
      path.diagnostic(reporter, { is: "warning", msg: `attribute must be a dictionary, got ${typeof value}` });
      return undefined;
    }
  },
  'object': {
    validate: function validateObject(reporter: Reporter, path: AttributePath, value: any) {
      if (typeof value === "object")
        return value;
      path.diagnostic(reporter, { is: "warning", msg: `attribute must be an object, got ${typeof value}` });
      return undefined;
    }
  },
  'date': {
    validate: function validateDate(reporter: Reporter, path: AttributePath, value: any) {
      if (value instanceof Date)
        return value;
      path.diagnostic(reporter, { is: "warning", msg: `attribute must be a Date, got ${typeof value}` });
      return undefined;
    }
  },
  'localdate': {
    validate: function validateLocalDate(reporter: Reporter, path: AttributePath, value: any) {
      if (value instanceof Date)
        return value;
      path.diagnostic(reporter, { is: "warning", msg: `attribute must be a Date, got ${typeof value}` });
      return undefined;
    }
  },
}
export const primitiveLevel0Validators: {[s in Aspect.PrimaryType]: Aspect.TypeValidator } = (function () {
  let ret: any = {};
  for (let k in primitiveValidators) {
    ret[k] = V.defaultsTo(primitiveValidators[k], undefined);
  }
  return ret;
})();

} // namespace Validation
