import { ImmutableList } from './core';
import { Diagnostic, Reporter } from '@openmicrostep/msbuildsystem.shared';

export class Result<T = any> {
  /** @internal */ _items: Result.Item[];
  /** @internal */ _values: T[] = [];
  /** @internal */ _diagnostics: Diagnostic[] = [];

  static fromDiagnostics<T = any>(diagnostics: Diagnostic[]) : Result<T> {
    return new Result([...diagnostics]);
  }
  static fromReporter<T = any>(reporter: Reporter) : Result<T> {
    return this.fromDiagnostics(reporter.diagnostics);
  }
  static fromValue<T>(value: T) : Result<T> {
    return new Result([{ is: "value", value: value }]);
  }
  static fromDiagnosticsAndValue<T>(diagnostics: Diagnostic[], value: T) : Result<T> {
    return new Result([...diagnostics, { is: "value", value: value }]);
  }
  static fromReporterAndValue<T>(reporter: Reporter, value: T) : Result<T> {
    return this.fromDiagnosticsAndValue(reporter.diagnostics, value);
  }

  static fromItemsWithoutValue(items: ImmutableList<Result.Item>) : Result<any> {
    return new Result([...items.filter(i => i.is !== "value")]);
  }
  static fromItemsWithNewValue<T>(items: ImmutableList<Result.Item>, value: T) : Result<T> {
    return new Result([...items.filter(i => i.is !== "value"), { is: "value", value: value }]);
  }
  static fromItemsWithMappedValue<IN_T, OUT_T>(items: ImmutableList<Result.Item>, map: (i: IN_T) => OUT_T) : Result<OUT_T> {
    return new Result([...items.map(i => i.is === "value" ? { is: "value", value: map(i.value) } as Result.ItemValue<OUT_T> : i)]);
  }

  static fromResultWithoutValue(result: Result) : Result<any> {
    return this.fromItemsWithoutValue(result.items());
  }
  static fromResultWithNewValue<T>(result: Result, value: T) : Result<T> {
    return this.fromItemsWithNewValue(result.items(), value);
  }
  static fromResultWithMappedValue<IN_T, OUT_T>(result: Result<IN_T>, map: (i: IN_T) => OUT_T) : Result<OUT_T> {
    return this.fromItemsWithMappedValue(result.items(), map);
  }

  constructor(items: Result.Item[]) {
    this._items = items;
    for (let item of items) {
      if (item.is === 'value')
        this._values.push(item.value);
      else
        this._diagnostics.push(item);
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
  export type ItemDiagnostic = Diagnostic;
  export type ItemValue<T> = { is: 'value', value: T };
  export type Item = ItemDiagnostic | ItemValue<any>;
}
