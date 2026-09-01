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

  /** Its own measured layout, so a caller can walk a nested array at the recorded stride. */
  public get layout(): WasmStructLayout { return this.#layout; }

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

  public setF64(field: string, value: number): this {
    this.#view().setFloat64(this.#offset(field), value, true);
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
  public getF64(field: string): number { return this.#view().getFloat64(this.#offset(field), true); }
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

  /**
   * A fixed-size `float` array field, read whole. The count is the field's measured byte length
   * rather than a constant repeated here, so a shortened array is a shorter result rather than a
   * read past the structure.
   */
  public getF32Array(field: string): number[] {
    const entry = this.#layout.fields[field];
    if (!entry) throw new Error(`the measured layout has no field ${field}`);
    const view = this.#view();
    const base = this.#pointer + entry.offset;
    const values: number[] = [];
    for (let offset = 0; offset + 4 <= entry.size; offset += 4) {
      values.push(view.getFloat32(base + offset, true));
    }
    return values;
  }

  /** Writes a fixed-size `float` array field. The value must fill it exactly. */
  /**
   * A fixed-size `int32_t` array field, read and written whole.
   *
   * The count comes from the field's own measured size rather than from a constant written here,
   * so a structure that grows an entry is read correctly without this file changing.
   */
  public getI32Array(field: string): number[] {
    const entry = this.#layout.fields[field];
    if (!entry) throw new Error(`the measured layout has no field ${field}`);
    const view = this.#view();
    const base = this.#pointer + entry.offset;
    const values: number[] = [];
    for (let offset = 0; offset + 4 <= entry.size; offset += 4) {
      values.push(view.getInt32(base + offset, true));
    }
    return values;
  }

  public setI32Array(field: string, values: readonly number[]): this {
    const entry = this.#layout.fields[field];
    if (!entry) throw new Error(`the measured layout has no field ${field}`);
    const view = this.#view();
    const base = this.#pointer + entry.offset;
    for (let index = 0; index * 4 + 4 <= entry.size; index += 1) {
      view.setInt32(base + index * 4, Math.trunc(values[index] ?? 0), true);
    }
    return this;
  }

  /** The same for a fixed-size `CNA_Handle` array, which is eight bytes an entry. */
  public getU64Array(field: string): bigint[] {
    const entry = this.#layout.fields[field];
    if (!entry) throw new Error(`the measured layout has no field ${field}`);
    const view = this.#view();
    const base = this.#pointer + entry.offset;
    const values: bigint[] = [];
    for (let offset = 0; offset + 8 <= entry.size; offset += 8) {
      values.push(view.getBigUint64(base + offset, true));
    }
    return values;
  }

  public setU64Array(field: string, values: readonly (bigint | null)[]): this {
    const entry = this.#layout.fields[field];
    if (!entry) throw new Error(`the measured layout has no field ${field}`);
    const view = this.#view();
    const base = this.#pointer + entry.offset;
    for (let index = 0; index * 8 + 8 <= entry.size; index += 1) {
      view.setBigUint64(base + index * 8, values[index] ?? 0n, true);
    }
    return this;
  }

  public setF32Array(field: string, values: readonly number[]): this {
    const entry = this.#layout.fields[field];
    if (!entry) throw new Error(`the measured layout has no field ${field}`);
    if (values.length * 4 !== entry.size) {
      throw new RangeError(`${field} holds ${entry.size / 4} floats, not ${values.length}`);
    }
    const view = this.#view();
    const base = this.#pointer + entry.offset;
    for (let index = 0; index < values.length; index += 1) {
      view.setFloat32(base + index * 4, values[index], true);
    }
    return this;
  }

  /**
   * One element of a fixed-size array of structures, striding by the element's own measured
   * wasm32 size. The bound is the field's measured byte length rather than a constant copied out
   * of a header, so a shortened array reports a range error instead of reading past its end.
   */
  public element(field: string, index: number, name: keyof typeof WASM_STRUCT_LAYOUTS): WasmStruct {
    const entry = this.#layout.fields[field];
    if (!entry) throw new Error(`the measured layout has no field ${field}`);
    const stride = (WASM_STRUCT_LAYOUTS[name] as WasmStructLayout).size;
    if (index < 0 || (index + 1) * stride > entry.size) {
      throw new RangeError(`${field}[${index}] lies outside the measured ${entry.size}-byte array`);
    }
    return new WasmStruct(this.#module, name, this.#pointer + entry.offset + index * stride);
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

/** Raised by a route that answered a nonzero CNA result, carrying the code. */
export class WasmCnaError extends Error {
  public readonly cnaResult: number;
  public constructor(operation: string, result: number, detail: string | null) {
    super(`${operation} failed with CNA result ${result}${detail ? `: ${detail}` : ""}`);
    this.name = "WasmCnaError";
    this.cnaResult = result;
  }
}

const CNA_RESULT_SUCCESS = 0;

/**
 * The resolved routes of one module, and the four call shapes every CNA route reduces to.
 *
 * This is shared rather than owned by the backend class because the private boundary is several
 * interfaces, not one: a facade implementing `CnaGraphicsBackend` calls the same module through the
 * same resolved exports, and giving each facade its own copy of the resolution and error handling
 * is how two of them drift apart.
 */
export class WasmRouteTable {
  public readonly module: CnaWasmModule;
  readonly #routes = new Map<string, WasmExport>();

  public constructor(module: CnaWasmModule, names: readonly string[]) {
    this.module = module;
    // Resolved once, at construction: a module missing a route fails on load with the route's
    // name rather than mid-frame with an undefined call.
    for (const name of names) this.#routes.set(name, route(module, name));
  }

  public get size(): number { return this.#routes.size; }

  public has(name: string): boolean { return this.#routes.has(name); }

  public scope(): WasmScope { return new WasmScope(this.module); }

  public view(): DataView { return new DataView(this.module.HEAPU8.buffer as ArrayBuffer); }

  /** Calls a route and returns its raw `CNA_Result`. */
  public call(name: string, ...args: readonly (number | bigint)[]): number {
    const exported = this.#routes.get(name);
    if (!exported) throw new WasmRouteMissingError(name);
    return exported(...args);
  }

  /** Calls a route and throws unless it succeeded. */
  public invoke(name: string, ...args: readonly (number | bigint)[]): void {
    const result = this.call(name, ...args);
    if (result === CNA_RESULT_SUCCESS) return;
    throw new WasmCnaError(name, result, this.lastError());
  }

  /**
   * Calls a route whose last parameter is a `CNA_Handle*` output.
   *
   * The handle is read as a `BigInt` and stays one: `CNA_Handle` is a `uint64_t`, and taking it
   * through a JavaScript `Number` would silently round identities past 2^53.
   */
  public outHandle(name: string, ...args: readonly (number | bigint)[]): bigint {
    const scope = this.scope();
    try {
      const out = scope.allocate(8);
      this.invoke(name, ...args, out);
      return this.view().getBigUint64(out, true);
    } finally {
      scope.dispose();
    }
  }

  /** Calls a route whose last parameter is a `uint64_t*` output. */
  public outU64(name: string, ...args: readonly (number | bigint)[]): bigint {
    const scope = this.scope();
    try {
      const out = scope.allocate(8);
      this.invoke(name, ...args, out);
      return this.view().getBigUint64(out, true);
    } finally {
      scope.dispose();
    }
  }

  /** Calls a route whose last parameter is a `uint32_t*` output. */
  public outU32(name: string, ...args: readonly (number | bigint)[]): number {
    const scope = this.scope();
    try {
      const out = scope.allocate(4);
      this.invoke(name, ...args, out);
      return this.view().getUint32(out, true);
    } finally {
      scope.dispose();
    }
  }

  /** Reads a count/copy string pair, which is how this ABI returns every string. */
  public copyString(sizeRoute: string, copyRoute: string, ...args: readonly (number | bigint)[]): string {
    const scope = this.scope();
    try {
      const sizePointer = scope.allocate(8);
      this.invoke(sizeRoute, ...args, sizePointer);
      const byteLength = Number(this.view().getBigUint64(sizePointer, true));
      if (byteLength === 0) return "";
      const buffer = scope.allocate(byteLength);
      const writtenPointer = scope.allocate(8);
      this.invoke(copyRoute, ...args, buffer, BigInt(byteLength), writtenPointer);
      const written = Number(this.view().getBigUint64(writtenPointer, true));
      return readUtf8(this.module, buffer, written);
    } finally {
      scope.dispose();
    }
  }

  /** CNA's last error message, or null. Never throws: it is called from a failure path. */
  public lastError(): string | null {
    const scope = this.scope();
    try {
      const sizePointer = scope.allocate(8);
      if (this.call("cna_error_get_last_message_size", sizePointer) !== CNA_RESULT_SUCCESS) return null;
      const byteLength = Number(this.view().getBigUint64(sizePointer, true));
      if (byteLength === 0) return null;
      const buffer = scope.allocate(byteLength);
      const writtenPointer = scope.allocate(8);
      if (this.call(
        "cna_error_copy_last_message", buffer, BigInt(byteLength), writtenPointer,
      ) !== CNA_RESULT_SUCCESS) return null;
      const written = Number(this.view().getBigUint64(writtenPointer, true));
      return readUtf8(this.module, buffer, written);
    } finally {
      scope.dispose();
    }
  }
}
