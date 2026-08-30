import type { XnaType } from "../Microsoft/Xna/Framework/Contracts.js";

/** Internal structural stand-ins for CLR design-time types that appear in the strict projection. */
export namespace ComponentModel {
  export interface ITypeDescriptorContext {}

  export class PropertyDescriptorCollection implements Iterable<string> {
    readonly #names: readonly string[];

    public constructor(names: readonly string[] = []) {
      this.#names = Object.freeze([...names]);
    }

    public get Count(): number { return this.#names.length; }
    public Get(index: number): string { return this.#names[index]; }
    public [Symbol.iterator](): IterableIterator<string> { return this.#names[Symbol.iterator](); }
  }

  export class ExpandableObjectConverter {
    public CanConvertFrom(
      _context: ITypeDescriptorContext,
      _sourceType: XnaType<unknown>,
    ): boolean { return false; }

    public CanConvertTo(
      _context: ITypeDescriptorContext,
      _destinationType: XnaType<unknown>,
    ): boolean { return false; }

    public ConvertFrom(
      _context: ITypeDescriptorContext,
      _culture: Globalization.CultureInfo,
      value: unknown,
    ): unknown {
      throw new TypeError(`Cannot convert from ${typeof value}`);
    }

    public ConvertTo(
      _context: ITypeDescriptorContext,
      _culture: Globalization.CultureInfo,
      _value: unknown,
      _destinationType: XnaType<unknown>,
    ): unknown {
      throw new TypeError("The requested destination type is not supported");
    }

    public CreateInstance(
      _context: ITypeDescriptorContext,
      _propertyValues: Collections.IDictionary,
    ): unknown {
      throw new TypeError("Instance creation is not supported");
    }

    public GetCreateInstanceSupported(_context: ITypeDescriptorContext): boolean { return false; }
    public GetProperties(
      _context: ITypeDescriptorContext,
      _value: unknown,
      _attributes: Attribute[],
    ): PropertyDescriptorCollection { return new PropertyDescriptorCollection(); }
    public GetPropertiesSupported(_context: ITypeDescriptorContext): boolean { return false; }
  }
}

export namespace Globalization {
  export interface CultureInfo {
    readonly ListSeparator?: string;
    readonly DecimalSeparator?: string;
  }
}

export namespace Collections {
  export type IDictionary = ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>;
}

export interface Attribute {}

// One async contract, not two: these are the framework's own, re-exported so the internal helpers
// can use them without importing across the boundary at every call site.
export type { AsyncCallback, IAsyncResult } from "../Microsoft/Xna/Framework/Contracts.js";
import type { IAsyncResult as FrameworkAsyncResult } from "../Microsoft/Xna/Framework/Contracts.js";

export class CompletedAsyncResult<T> implements FrameworkAsyncResult {
  public readonly IsCompleted = true;
  public readonly CompletedSynchronously = true;
  public constructor(
    public readonly Value: T,
    public readonly AsyncState: unknown,
  ) {}
}
