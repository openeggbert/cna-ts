// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaLodBackend` facade: level-of-detail selection, whole.
//
// Every route here is arithmetic. A LOD group holds thresholds and picks one for a distance; it
// touches no device, allocates no GPU resource and draws nothing, so there is no capability
// question to ask and nothing about it that a browser could do differently from Node. That makes
// it the one engine family this backend can implement completely rather than in a slice -- and it
// makes every one of its answers exactly predictable, which is what the browser suite asserts.
//
// The one thing a browser cannot supply is a `ModelMeshPart` to hang on a level, because those
// arrive through a native content manager this package deliberately does not have. CNA already
// treats an absent part as a real state -- a level that deliberately draws nothing -- and
// distinguishes it from an empty group through `selectLodIndex`, so a browser gets the selection
// behaviour in full and only the payload is missing.

import { CnaLodBackendBase } from "../backend-base.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { WasmStruct, type WasmRouteTable } from "./module.js";

export class WasmLodBackend extends CnaLodBackendBase {
  readonly #routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#routes = routes;
  }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's level-of-detail slice`,
    );
  }

  public override createLodGroup(): NativeHandle {
    return this.#routes.outHandle("cna_lod_group_ext_create");
  }

  public override destroyLodGroup(group: NativeHandle): void {
    this.#routes.invoke("cna_lod_group_ext_destroy", group);
  }

  /** A level, and its part -- which in a browser is always absent, and legitimately so. */
  public override addLodLevel(
    group: NativeHandle, maxDistance: number, part: NativeHandle | null,
  ): void {
    this.#routes.invoke("cna_lod_group_ext_add_level", group, maxDistance, part ?? 0n);
  }

  public override clearLodGroup(group: NativeHandle): void {
    this.#routes.invoke("cna_lod_group_ext_clear", group);
  }

  /** Every level's threshold, in order. The parts are not projected: this backend has none. */
  public override copyLodLevels(group: NativeHandle): readonly number[] {
    const scope = this.#routes.scope();
    try {
      const countOut = scope.allocate(8);
      const probe = this.#routes.call("cna_lod_group_ext_copy_levels", group, 0, 0n, countOut);
      if (probe !== 0 && probe !== CNA_RESULT_BUFFER_TOO_SMALL) {
        this.#routes.invoke("cna_lod_group_ext_copy_levels", group, 0, 0n, countOut);
      }
      const count = Number(this.#routes.view().getBigUint64(countOut, true));
      if (count === 0) return [];
      const layout = WASM_STRUCT_LAYOUTS.CNA_LodLevelEXT;
      const buffer = scope.allocate(layout.size * count);
      this.#routes.invoke(
        "cna_lod_group_ext_copy_levels", group, buffer, BigInt(count), countOut);
      return Array.from({ length: count }, (_, index) =>
        new WasmStruct(this.#routes.module, "CNA_LodLevelEXT", buffer + layout.size * index)
          .getF32("max_distance"));
    } finally {
      scope.dispose();
    }
  }

  public override selectLodIndex(group: NativeHandle, distance: number): number {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(4);
      this.#routes.invoke("cna_lod_group_ext_select_index", group, distance, out);
      return this.#routes.view().getInt32(out, true);
    } finally {
      scope.dispose();
    }
  }

  /**
   * The chosen level's part, which is `null` both for an empty group and for a level that
   * deliberately draws nothing. `selectLodIndex` is what separates those two, which is why both
   * are here rather than one standing in for the other.
   */
  public override selectLodPart(group: NativeHandle, distance: number): NativeHandle | null {
    const handle = this.#routes.outHandle("cna_lod_group_ext_select", group, distance);
    return handle === 0n ? null : handle;
  }

  public override getLodHysteresis(group: NativeHandle): number {
    return this.#float("cna_lod_group_ext_get_hysteresis", group);
  }

  public override setLodHysteresis(group: NativeHandle, margin: number): void {
    this.#routes.invoke("cna_lod_group_ext_set_hysteresis", group, margin);
  }

  public override resetLodHysteresis(group: NativeHandle): void {
    this.#routes.invoke("cna_lod_group_ext_reset_hysteresis", group);
  }

  public override getLodSelectionMode(group: NativeHandle): number {
    return this.#routes.outU32("cna_lod_group_ext_get_selection_mode", group);
  }

  public override setLodSelectionMode(group: NativeHandle, mode: number): void {
    this.#routes.invoke("cna_lod_group_ext_set_selection_mode", group, mode);
  }

  public override setLodScreenSpaceParameters(
    group: NativeHandle, radius: number, verticalFov: number, viewportHeight: number,
  ): void {
    this.#routes.invoke(
      "cna_lod_group_ext_set_screen_space_parameters", group, radius, verticalFov, viewportHeight,
    );
  }

  public override getLodProjectedRadiusPixels(group: NativeHandle, distance: number): number {
    return this.#float("cna_lod_group_ext_projected_radius_pixels", group, distance);
  }

  #float(route: string, ...args: readonly (number | bigint)[]): number {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(4);
      this.#routes.invoke(route, ...args, out);
      return this.#routes.view().getFloat32(out, true);
    } finally {
      scope.dispose();
    }
  }
}

/** `CNA_RESULT_BUFFER_TOO_SMALL`, which a capacity probe answers with rather than failing on. */
const CNA_RESULT_BUFFER_TOO_SMALL = 14;
