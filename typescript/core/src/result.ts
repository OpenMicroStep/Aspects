import { VersionedObject, ControlCenter, NotificationCenter, Aspect, ImmutableList } from './core';
import {Reporter, AttributePath, Diagnostic} from '@openmicrostep/msbuildsystem.shared';
import { Flux } from '@openmicrostep/async';

export class Result<T = any> {
  _items: Result.Item[];
  _values: T[] = [];
  _diagnostics: Diagnostic[] = [];

  static toDiagItems(diagnostics: Diagnostic[]) : Result.ItemDiagnostic[] {
    return diagnostics.map((d: Result.ItemDiagnostic) => { d.is = "diagnostic"; return d; });
  }

  static fromDiagnostics<T = any>(diagnostics: Diagnostic[]) : Result<T> {
    return new Result(this.toDiagItems(diagnostics));
  }

  static fromDiagnosticsAndValue<T>(diagnostics: Diagnostic[], value: T) : Result<T> {
    return new Result([...this.toDiagItems(diagnostics), { is: "value", value: value }]);
  }

  static fromValue<T>(value: T) : Result<T> {
    return new Result([{ is: "value", value: value }]);
  }

  static fromItemsWithNewValue<T>(items: ImmutableList<Result.Item>, value: T) : Result<T> {
    return new Result([...items.filter(i => i.is !== "value"), { is: "value", value: value }]);
  }

  static fromResultWithNewValue<T>(result: Result, value: T) : Result<T> {
    return this.fromItemsWithNewValue(result.items(), value);
  }

  constructor(items: Result.Item[]) {
    this._items = items;
    for (let item of items) {
      switch (item.is) {
        case 'diagnostic': this._diagnostics.push(item); break;
        case 'value': this._values.push(item.value); break;
      }
    }
  }

  items() : ImmutableList<Result.Item> {
    return this._items;
  }

  hasOneValue() {
    return this._values.length === 1;
  }

  hasValues() {
    return this._values.length > 0;
  }

  value(): T {
    let values = this.values();
    if (values.length === 1)
      return values[0];
    else if (values.length === 0)
      throw new Error("no value in this result");
    else
      throw new Error("more than one value in the result");
  }

  values(): ImmutableList<T> {
    return this._values;
  }

  hasDiagnostics() {
    return this._diagnostics.length > 0;
  }

  diagnostics(): ImmutableList<Diagnostic> {
    return this._diagnostics;
  }
}

export namespace Result {
  export type ItemDiagnostic = { is: 'diagnostic' } & Diagnostic;
  export type ItemValue<T> = { is: 'value', value: T };
  export type Item = ItemDiagnostic | ItemValue<any>;
}
