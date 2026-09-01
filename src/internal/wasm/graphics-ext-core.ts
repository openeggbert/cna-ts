// SPDX-License-Identifier: MS-PL
//
// The memory shapes CNA's extended graphics layer answers in, in one place.
//
// This layer is 603 members of one interface, and the WebAssembly slice of it is now large enough
// that it is built from several files rather than one. What they share is not a family -- it is a
// handful of output conventions: a `CNA_Bool*` that is one byte in four, an `int32_t*`, a
// `float*`, a `CNA_Vector2`/`CNA_Vector3` written into caller memory, and a string whose length
// this ABI reports through the copy route itself rather than through a separate count route.
//
// Those conventions were measured once and getting one of them wrong is silent: a `CNA_Bool` read
// as four bytes is true whenever any of the three bytes after it happens to be set. So they live
// here, `protected`, and every family file above uses them instead of re-deriving them.

import { CnaGraphicsExtensionBackendBase } from "../backend-base.js";
import type { Vector2Snapshot, Vector3Snapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct, WasmScope, type WasmRouteTable } from "./module.js";

/** `CNA_RESULT_BUFFER_TOO_SMALL`, which a capacity probe answers with rather than failing on. */
export const CNA_RESULT_BUFFER_TOO_SMALL = 14;

/**
 * The output conventions, held rather than inherited.
 *
 * CNA's engine layer is not one backend interface but nine -- extended graphics, shadows, the
 * prepass, decals, particles, light probes, atmosphere, clustered lighting and the instanced
 * renderer -- and each of their WebAssembly facades has to extend its own generated base. So the
 * shared part cannot be a base class, and before this existed `shadows.ts` and `compute.ts` each
 * carried their own private copy of `#bool`, `#int` and `#float`. Three copies of "a `CNA_Bool` is
 * one byte in a four-byte allocation" is three chances to write it down differently.
 *
 * Every engine facade holds one of these instead.
 */
export class WasmEngineMemory {
  public readonly routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    this.routes = routes;
  }

  /** A `CNA_Bool*` output, which is one byte rather than four. */
  public bool(route: string, ...args: readonly (number | bigint)[]): boolean {
    return this.#scalar(route, args, 4, (view, out) => view.getUint8(out) !== 0);
  }

  /** An `int32_t*` output. */
  public int(route: string, ...args: readonly (number | bigint)[]): number {
    return this.#scalar(route, args, 4, (view, out) => view.getInt32(out, true));
  }

  /** A `uint32_t*` output, which is how this ABI answers an enumeration. */
  public u32(route: string, ...args: readonly (number | bigint)[]): number {
    return this.#scalar(route, args, 4, (view, out) => view.getUint32(out, true));
  }

  /** A `float*` output. */
  public float(route: string, ...args: readonly (number | bigint)[]): number {
    return this.#scalar(route, args, 4, (view, out) => view.getFloat32(out, true));
  }

  /** A `uint64_t*` output read as a JavaScript number, for counts and sizes. */
  public u64AsNumber(route: string, ...args: readonly (number | bigint)[]): number {
    return this.#scalar(route, args, 8, (view, out) => Number(view.getBigUint64(out, true)));
  }

  /** A `CNA_Vector2` written into caller memory. */
  public vector2(route: string, ...args: readonly (number | bigint)[]): Vector2Snapshot {
    return this.#scalar(route, args, WASM_STRUCT_LAYOUTS.CNA_Vector2.size, (view, out) => ({
      X: view.getFloat32(out, true), Y: view.getFloat32(out + 4, true),
    }));
  }

  /** A `CNA_Vector3` written into caller memory. */
  public vector3(route: string, ...args: readonly (number | bigint)[]): Vector3Snapshot {
    return this.#scalar(route, args, WASM_STRUCT_LAYOUTS.CNA_Vector3.size, (view, out) => ({
      X: view.getFloat32(out, true),
      Y: view.getFloat32(out + 4, true),
      Z: view.getFloat32(out + 8, true),
    }));
  }

  #scalar<T>(
    route: string, args: readonly (number | bigint)[], size: number,
    read: (view: DataView, out: number) => T,
  ): T {
    const scope = this.routes.scope();
    try {
      const out = scope.allocate(size);
      this.routes.invoke(route, ...args, out);
      return read(this.routes.view(), out);
    } finally {
      scope.dispose();
    }
  }

  /** Passes a `CNA_Vector3` by pointer, which is how this layer takes one as an input. */
  public withVector3<T>(value: Vector3Snapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const pointer = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Vector3.size);
      const view = this.routes.view();
      view.setFloat32(pointer, value.X, true);
      view.setFloat32(pointer + 4, value.Y, true);
      view.setFloat32(pointer + 8, value.Z, true);
      return body(pointer);
    } finally {
      scope.dispose();
    }
  }

  /**
   * Passes a `CNA_Matrix` by pointer: sixteen floats in CNA's own order.
   *
   * The length is checked rather than trusted. A short array would otherwise leave the trailing
   * rows as whatever the allocation held -- and the allocation is zeroed, so a fifteen-element
   * matrix arrives with `M44 = 0`, which several of these routes read as "no camera was supplied"
   * and silently fall back on.
   */
  public withMatrix<T>(values: readonly number[], body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      return body(this.writeMatrix(scope, values));
    } finally {
      scope.dispose();
    }
  }

  /**
   * The same, into a scope the caller already owns, for a route that takes several of them.
   *
   * The length is checked rather than trusted. A short array would otherwise leave the trailing
   * rows as whatever the allocation held -- and the allocation is zeroed, so a fifteen-element
   * matrix arrives with `M44 = 0`, which several routes in this layer read as "no camera was
   * supplied" and silently fall back on.
   */
  public writeMatrix(scope: WasmScope, values: readonly number[]): number {
    if (values.length !== 16) {
      throw new RangeError(`a CNA_Matrix is sixteen floats, not ${values.length}`);
    }
    const pointer = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Matrix.size);
    const view = this.routes.view();
    for (let index = 0; index < 16; index += 1) {
      view.setFloat32(pointer + index * 4, values[index] as number, true);
    }
    return pointer;
  }

  /** A `CNA_Vector3` into a caller-owned scope, for the same reason. */
  public writeVector3(scope: WasmScope, values: readonly number[]): number {
    const pointer = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Vector3.size);
    const view = this.routes.view();
    for (let index = 0; index < 3; index += 1) {
      view.setFloat32(pointer + index * 4, values[index] ?? 0, true);
    }
    return pointer;
  }

  /** Reads one back, in the same order. */
  public matrix(route: string, ...args: readonly (number | bigint)[]): number[] {
    const scope = this.routes.scope();
    try {
      const out = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Matrix.size);
      this.routes.invoke(route, ...args, out);
      const view = this.routes.view();
      return Array.from({ length: 16 }, (_, index) => view.getFloat32(out + index * 4, true));
    } finally {
      scope.dispose();
    }
  }

  /**
   * Passes a `CNA_Color` by pointer.
   *
   * A four-byte multi-field aggregate taken by value, which wasm32 lowers the same way it lowers
   * `CNA_StringView`: as a pointer to a caller-owned copy.
   */
  public withColor<T>(
    texel: { readonly R: number; readonly G: number; readonly B: number; readonly A: number },
    body: (pointer: number) => T,
  ): T {
    const scope = this.routes.scope();
    try {
      const pointer = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Color.size);
      const bytes = this.routes.module.HEAPU8;
      bytes[pointer] = texel.R & 0xff;
      bytes[pointer + 1] = texel.G & 0xff;
      bytes[pointer + 2] = texel.B & 0xff;
      bytes[pointer + 3] = texel.A & 0xff;
      return body(pointer);
    } finally {
      scope.dispose();
    }
  }

  /** A `CNA_BoundingBox` into a caller-owned scope: two `CNA_Vector3`s at their measured offsets. */
  public writeBounds(
    scope: WasmScope,
    bounds: { readonly Min: Vector3Snapshot; readonly Max: Vector3Snapshot },
  ): number {
    const layout = WASM_STRUCT_LAYOUTS.CNA_BoundingBox;
    const pointer = scope.allocate(layout.size);
    const view = this.routes.view();
    for (const [field, value] of [["min", bounds.Min], ["max", bounds.Max]] as const) {
      const at = pointer + layout.fields[field].offset;
      view.setFloat32(at, value.X, true);
      view.setFloat32(at + 4, value.Y, true);
      view.setFloat32(at + 8, value.Z, true);
    }
    return pointer;
  }

  /** Reads one back, in the same two fields. */
  public bounds(
    route: string, ...args: readonly (number | bigint)[]
  ): { Min: Vector3Snapshot; Max: Vector3Snapshot } {
    const layout = WASM_STRUCT_LAYOUTS.CNA_BoundingBox;
    const scope = this.routes.scope();
    try {
      const out = scope.allocate(layout.size);
      this.routes.invoke(route, ...args, out);
      const view = this.routes.view();
      const read = (field: "min" | "max"): Vector3Snapshot => {
        const at = out + layout.fields[field].offset;
        return {
          X: view.getFloat32(at, true),
          Y: view.getFloat32(at + 4, true),
          Z: view.getFloat32(at + 8, true),
        };
      };
      return { Min: read("min"), Max: read("max") };
    } finally {
      scope.dispose();
    }
  }

  /** The same for a `CNA_Vector2`. */
  public withVector2<T>(value: Vector2Snapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const pointer = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Vector2.size);
      const view = this.routes.view();
      view.setFloat32(pointer, value.X, true);
      view.setFloat32(pointer + 4, value.Y, true);
      return body(pointer);
    } finally {
      scope.dispose();
    }
  }

  /**
   * A string whose length is probed through the copy route itself.
   *
   * Most of this ABI answers a string through a `..._byte_count` route and a `..._copy_` route.
   * The engine layer's have no count route: the copy route reports the required length when called
   * with a null destination and zero capacity. Reading one with a fixed buffer instead would
   * truncate a longer answer silently.
   *
   * The probe's own result is **not** required to be success. Measured: with a null destination
   * `cna_post_process_pass_copy_name` answers `SUCCESS` and `cna_cube_lut_copy_title` answers
   * `BUFFER_TOO_SMALL` (14), both having written the required length. Treating the second as a
   * failure -- which this did at first, and the browser suite caught -- loses a title CNA was
   * perfectly willing to give. The Node-API backend accepts both for the same two routes.
   *
   * `leading` is whatever the route takes before its destination: a handle, a handle and an index,
   * a flag, or nothing at all. All four shapes occur in this layer and all four are this function.
   */
  public probedString(route: string, ...leading: readonly (number | bigint)[]): string {
    const scope = this.routes.scope();
    try {
      const lengthOut = scope.allocate(8);
      const probe = this.routes.call(route, ...leading, 0, 0n, lengthOut);
      if (probe !== 0 && probe !== CNA_RESULT_BUFFER_TOO_SMALL) {
        this.routes.invoke(route, ...leading, 0, 0n, lengthOut);
      }
      const byteLength = Number(this.routes.view().getBigUint64(lengthOut, true));
      if (byteLength === 0) return "";
      // One byte more than the length: `cna_cube_lut_copy_title` refuses a capacity equal to it,
      // and capacity is an upper bound everywhere in this ABI, so the extra byte costs nothing.
      const buffer = scope.allocate(byteLength + 1);
      const writtenOut = scope.allocate(8);
      this.routes.invoke(route, ...leading, buffer, BigInt(byteLength + 1), writtenOut);
      const written = Number(this.routes.view().getBigUint64(writtenOut, true));
      return new TextDecoder().decode(
        this.routes.module.HEAPU8.subarray(buffer, buffer + written));
    } finally {
      scope.dispose();
    }
  }

  /**
   * An array whose length is probed through the copy route itself, like {@link probedString}.
   *
   * The probe's result is accepted as either `SUCCESS` or `BUFFER_TOO_SMALL`, for the same reason
   * and with the same measured split: `cna_instanced_renderer_ext_copy_instance_elements` answers
   * success with a null destination and `cna_ssao_pass_copy_kernel` answers 14. Requiring success
   * loses the second array entirely, which is how this was first written and what the browser run
   * reported.
   *
   * `read` is handed the base pointer and the number of elements CNA wrote, which is read back
   * from the count output rather than assumed equal to the capacity.
   */
  public probedArray<T>(
    route: string, leading: readonly (number | bigint)[], stride: number,
    read: (base: number, written: number) => T[],
  ): T[] {
    const scope = this.routes.scope();
    try {
      const countOut = scope.allocate(8);
      const probe = this.routes.call(route, ...leading, 0, 0n, countOut);
      if (probe !== 0 && probe !== CNA_RESULT_BUFFER_TOO_SMALL) {
        this.routes.invoke(route, ...leading, 0, 0n, countOut);
      }
      const count = Number(this.routes.view().getBigUint64(countOut, true));
      if (count === 0) return [];
      const buffer = scope.allocate(stride * count);
      this.routes.invoke(route, ...leading, buffer, BigInt(count), countOut);
      return read(buffer, Number(this.routes.view().getBigUint64(countOut, true)));
    } finally {
      scope.dispose();
    }
  }

  /**
   * A `CNA_StringView` passed by value, which wasm32 lowers as a pointer to a caller-owned copy --
   * the convention `docs/wasm-backend.md` records this backend measuring rather than assuming.
   */
  public withStringView<T>(value: string, body: (pointer: number) => T): T {
    const scope = new WasmScope(this.routes.module);
    try {
      const text = scope.allocateUtf8(value);
      const view = allocateStruct(this.routes.module, scope, "CNA_StringView", false);
      view.setPointer("data", text.pointer).setU64("byte_length", BigInt(text.byteLength));
      return body(view.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** A handle output, which is the shape every `..._create` route in this layer takes. */
  public create(route: string, ...args: readonly (number | bigint)[]): NativeHandle {
    return this.routes.outHandle(route, ...args);
  }
}

/**
 * The base of the extended-graphics facade, which is assembled from several family files.
 *
 * That layer alone is 603 members of one interface, so its WebAssembly side is built as a chain of
 * `abstract class`es each binding one family, with this at the bottom holding what they share.
 */
export abstract class WasmGraphicsExtensionCore extends CnaGraphicsExtensionBackendBase {
  protected readonly mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.mem = new WasmEngineMemory(routes);
  }

  /** Shorthand, because a family file names the route table on nearly every line. */
  protected get routes(): WasmRouteTable { return this.mem.routes; }

  /**
   * The one message a consumer gets for a member outside the slice.
   *
   * It names the member and says whose limitation it is, because the two things that leave an
   * engine API unavailable in a browser -- this slice not reaching it, and the artifact being
   * built without `CNA_CNAEXT` -- are answered by different people. A route inside the slice gets
   * CNA's own `NOT_SUPPORTED` for the second case; only the first arrives here.
   */
  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's extended-graphics slice; ` +
      "the Node-API backend implements it",
    );
  }
}
