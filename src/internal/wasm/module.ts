/**
 * The Emscripten module surface the WebAssembly backend uses, and the memory helpers that keep
 * every pointer, string and structure write in one measured place.
 *
 * Two properties of the artifact drive most of this file, both measured rather than assumed:
 * a `uint64_t` passed by value arrives as a `BigInt` because the module is linked with
 * `WASM_BIGINT`, and a `..._copy_*` route writes exactly its bytes with no terminator, so a string
 * must be read with its length.
 */

import { WASM_POINTER_SIZE, WASM_STRUCT_LAYOUTS, type WasmStructLayout } from "./layout.js";

/** A CNA route exported by the module, reached through its underscore-prefixed export name. */
export type WasmExport = (...args: readonly (number | bigint)[]) => number;

/** The subset of an instantiated Emscripten module this backend depends on. */
export interface CnaWasmModule {
  readonly HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  addFunction(handler: (...args: never[]) => unknown, signature: string): number;
  removeFunction(pointer: number): void;
  [route: string]: unknown;
}

/** Raised when the module does not export a route the backend needs. */
export class WasmRouteMissingError extends Error {
  public constructor(route: string) {
    super(`the CNA WebAssembly module does not export ${route}`);
    this.name = "WasmRouteMissingError";
  }
}

/**
 * A scoped native allocation. `using`-style manual release is deliberate: the module owns no
 * lifetime for a caller buffer, so every allocation is freed by the call that made it.
 */
export class WasmScope {
  readonly #module: CnaWasmModule;
  readonly #pointers: number[] = [];

  public constructor(module: CnaWasmModule) {
    this.#module = module;
  }

  /** Allocates zeroed bytes owned by this scope. */
  public allocate(size: number): number {
    if (size <= 0) throw new RangeError("a wasm allocation must be positive");
    const pointer = this.#module._malloc(size);
    if (pointer === 0) throw new Error("the CNA WebAssembly module could not allocate");
    this.#pointers.push(pointer);
    this.#module.HEAPU8.fill(0, pointer, pointer + size);
    return pointer;
  }

  /** Copies bytes into a fresh scope-owned allocation. */
  public allocateBytes(bytes: Uint8Array): number {
    const pointer = this.allocate(Math.max(bytes.byteLength, 1));
    this.#module.HEAPU8.set(bytes, pointer);
    return pointer;
  }

  /** Copies a string as UTF-8 without a terminator, returning the pointer and its byte length. */
  public allocateUtf8(value: string): { pointer: number; byteLength: number } {
    const bytes = new TextEncoder().encode(value);
    return { pointer: this.allocateBytes(bytes), byteLength: bytes.byteLength };
  }

  /** Releases every allocation this scope made. */
  public dispose(): void {
    while (this.#pointers.length > 0) this.#module._free(this.#pointers.pop() as number);
  }
}

/** Reads and writes one CNA structure in module memory through its measured wasm32 layout. */
export class WasmStruct {
  readonly #module: CnaWasmModule;
  readonly #layout: WasmStructLayout;
  readonly #pointer: number;

  public constructor(module: CnaWasmModule, name: keyof typeof WASM_STRUCT_LAYOUTS, pointer: number) {
    this.#module = module;
    this.#layout = WASM_STRUCT_LAYOUTS[name];
    this.#pointer = pointer;
  }

  /** The structure's address in module memory. */
  public get pointer(): number { return this.#pointer; }

  #view(): DataView {
    const buffer = this.#module.HEAPU8.buffer as ArrayBuffer;
    return new DataView(buffer);
  }

  #offset(field: string): number {
    const entry = this.#layout.fields[field];
    if (!entry) throw new Error(`the measured layout has no field ${field}`);
    return this.#pointer + entry.offset;
  }

  public setU32(field: string, value: number): this {
    this.#view().setUint32(this.#offset(field), value >>> 0, true);
    return this;
  }

  public setI32(field: string, value: number): this {
    this.#view().setInt32(this.#offset(field), value | 0, true);
    return this;
  }

  public setU8(field: string, value: number): this {
    this.#view().setUint8(this.#offset(field), value & 0xff);
    return this;
  }

  public setF32(field: string, value: number): this {
    this.#view().setFloat32(this.#offset(field), value, true);
    return this;
  }

  public setI64(field: string, value: bigint): this {
    this.#view().setBigInt64(this.#offset(field), value, true);
    return this;
  }

  public setU64(field: string, value: bigint): this {
    this.#view().setBigUint64(this.#offset(field), value, true);
    return this;
  }

  /** Writes a pointer field, which is four bytes wide under wasm32. */
  public setPointer(field: string, value: number): this {
    if (WASM_POINTER_SIZE !== 4) throw new Error("only wasm32 pointer layouts are supported");
    this.#view().setUint32(this.#offset(field), value >>> 0, true);
    return this;
  }

  public getU32(field: string): number { return this.#view().getUint32(this.#offset(field), true); }
  public getI32(field: string): number { return this.#view().getInt32(this.#offset(field), true); }
  public getU8(field: string): number { return this.#view().getUint8(this.#offset(field)); }
  public getF32(field: string): number { return this.#view().getFloat32(this.#offset(field), true); }
  public getI64(field: string): bigint { return this.#view().getBigInt64(this.#offset(field), true); }
  public getU64(field: string): bigint { return this.#view().getBigUint64(this.#offset(field), true); }
  public getPointer(field: string): number { return this.#view().getUint32(this.#offset(field), true); }

  /** A nested structure sharing this one's memory. */
  public nested(field: string, name: keyof typeof WASM_STRUCT_LAYOUTS): WasmStruct {
    return new WasmStruct(this.#module, name, this.#offset(field));
  }

  /** One element of a fixed-size `uint64_t` array field. */
  public getU64Element(field: string, index: number): bigint {
    return this.#view().getBigUint64(this.#offset(field) + index * 8, true);
  }
}

/** Allocates and initialises a versioned CNA descriptor with its `struct_size`/`struct_version`. */
export function allocateStruct(
  module: CnaWasmModule,
  scope: WasmScope,
  name: keyof typeof WASM_STRUCT_LAYOUTS,
  versioned = true,
): WasmStruct {
  const layout = WASM_STRUCT_LAYOUTS[name] as WasmStructLayout;
  const structure = new WasmStruct(module, name, scope.allocate(layout.size));
  if (versioned) {
    structure.setU32("struct_size", layout.size);
    structure.setU32("struct_version", 1);
  }
  return structure;
}

/** Reads a UTF-8 string of an exact byte length; copied CNA strings carry no terminator. */
export function readUtf8(module: CnaWasmModule, pointer: number, byteLength: number): string {
  const bytes = module.HEAPU8.subarray(pointer, pointer + byteLength);
  return new TextDecoder().decode(bytes);
}

/** Resolves an exported CNA route, which the module publishes with a leading underscore. */
export function route(module: CnaWasmModule, name: string): WasmExport {
  const exported = module[`_${name}`];
  if (typeof exported !== "function") throw new WasmRouteMissingError(name);
  return exported as WasmExport;
}
