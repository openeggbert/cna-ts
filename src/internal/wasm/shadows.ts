// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaShadowBackend` facade: a shadow map, its rigid casting pass, and
// the maths that decides where the light looks from.
//
// The pure functions -- the light's view and projection for a scene, the size and filter radius a
// quality implies -- take plain values, touch no device and are the same arithmetic on every
// renderer, so a browser can have them and check them against the same expectations the windowed
// suite uses.
//
// The *pass* was a different question: `Begin`, the caster draws, `End`, and reading the depth
// image back all depend on what the context can actually do, and that is for the device to answer
// rather than for this file to assume. It was asked, in headless Chromium on WebGL2 with an
// artifact built `-DCNA_CNAEXT=ON`: `cna_shadow_map_is_supported` and
// `cna_graphics_device_supports_shadow_sampling_ext` both answer true. So the rigid pass is here.
//
// The **skinned** caster is not, and for an architectural reason rather than a capability one: it
// takes a bone palette, and a skinned mesh reaches a game through a native content manager this
// package deliberately does not have. Both capability answers are still reported by the browser
// suite rather than asserted, so a context that answers differently is recorded rather than
// failing on an assumption this file made.

import { CnaShadowBackendBase } from "../backend-base.js";
import type { ClusterBoundsSnapshot, DirectionalLightSnapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { WasmEngineMemory } from "./graphics-ext-core.js";
import { allocateStruct, WasmScope, WasmStruct, type WasmRouteTable } from "./module.js";

export class WasmShadowBackend extends CnaShadowBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's shadow slice, which covers a ` +
      "shadow map's description and the pure light-transform maths; the Node-API backend " +
      "implements the casting pass",
    );
  }

  // --- what the device says --------------------------------------------------------------------

  public override supportsShadowSampling(device: NativeHandle): boolean {
    return this.#mem.bool("cna_graphics_device_supports_shadow_sampling_ext", device);
  }

  // --- the object ------------------------------------------------------------------------------

  public override createShadowMap(device: NativeHandle, quality: number): NativeHandle {
    return this.#routes.outHandle("cna_shadow_map_create", device, quality);
  }

  public override destroyShadowMap(map: NativeHandle): void {
    this.#routes.invoke("cna_shadow_map_destroy", map);
  }

  /**
   * Whether this map can actually cast.
   *
   * Separate from `supportsShadowSampling`, and the two are not the same question: a frame that
   * draws shadows needs both, and a renderer can have one without the other. The browser suite
   * records both rather than letting either stand in for the other.
   */
  public override isShadowMapSupported(map: NativeHandle): boolean {
    return this.#mem.bool("cna_shadow_map_is_supported", map);
  }

  public override getShadowMapSize(map: NativeHandle): number {
    return this.#mem.int("cna_shadow_map_get_size", map);
  }

  public override getShadowMapQuality(map: NativeHandle): number {
    return this.#mem.u32("cna_shadow_map_get_quality", map);
  }

  public override getShadowMapDepthBias(map: NativeHandle): number {
    return this.#mem.float("cna_shadow_map_get_depth_bias", map);
  }

  public override setShadowMapDepthBias(map: NativeHandle, bias: number): void {
    this.#routes.invoke("cna_shadow_map_set_depth_bias", map, bias);
  }

  public override getShadowMapFilterRadius(map: NativeHandle): number {
    return this.#mem.int("cna_shadow_map_get_filter_radius", map);
  }

  // --- the pass -------------------------------------------------------------------------------
  //
  // Bound because the device said it could: `cna_shadow_map_is_supported` and
  // `cna_graphics_device_supports_shadow_sampling_ext` both answer true on a WebGL2 context with
  // an artifact built `-DCNA_CNAEXT=ON`, measured in headless Chromium rather than assumed from
  // the renderer's name. The skinned caster is not here: it needs a bone palette this backend has
  // no way to produce in a browser, because a skinned mesh arrives through a native content
  // manager this package deliberately does not have.

  public override beginShadowPass(
    map: NativeHandle, light: DirectionalLightSnapshot, bounds: ClusterBoundsSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_shadow_map_begin", map, this.#light(scope, light), this.#bounds(scope, bounds),
      );
    } finally {
      scope.dispose();
    }
  }

  public override endShadowPass(map: NativeHandle): void {
    this.#routes.invoke("cna_shadow_map_end", map);
  }

  public override applyShadowCaster(map: NativeHandle): void {
    this.#routes.invoke("cna_shadow_map_apply_caster", map);
  }

  /** The depth image the pass wrote. Borrowed: the map owns it and hands out a view. */
  public override getShadowMapTexture(map: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_shadow_map_get_shadow_texture", map);
  }

  public override getShadowCasterEffect(map: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_shadow_map_get_caster_effect", map);
  }

  public override getShadowMapLightViewProjection(map: NativeHandle): readonly number[] {
    return this.#mem.matrix("cna_shadow_map_get_light_view_projection", map);
  }

  // --- the maths, which is the same arithmetic on every renderer -------------------------------

  public override shadowMapSizeForQuality(quality: number): number {
    return this.#mem.int("cna_shadow_map_size_for_quality", quality);
  }

  public override shadowMapFilterRadiusForQuality(quality: number): number {
    return this.#mem.int("cna_shadow_map_filter_radius_for_quality", quality);
  }

  public override computeShadowLightView(
    light: DirectionalLightSnapshot, bounds: ClusterBoundsSnapshot,
  ): readonly number[] {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Matrix.size);
      this.#routes.invoke(
        "cna_shadow_map_compute_light_view",
        this.#light(scope, light), this.#bounds(scope, bounds), out,
      );
      return this.#matrix(out);
    } finally {
      scope.dispose();
    }
  }

  public override computeShadowLightProjection(
    lightView: readonly number[], bounds: ClusterBoundsSnapshot,
  ): readonly number[] {
    const scope = this.#routes.scope();
    try {
      const view = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Matrix.size);
      const data = this.#routes.view();
      for (let index = 0; index < 16; index += 1) {
        data.setFloat32(view + index * 4, lightView[index] ?? 0, true);
      }
      const out = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Matrix.size);
      this.#routes.invoke(
        "cna_shadow_map_compute_light_projection", view, this.#bounds(scope, bounds), out,
      );
      return this.#matrix(out);
    } finally {
      scope.dispose();
    }
  }

  // --- the shapes CNA takes these in -----------------------------------------------------------

  /** A versioned `CNA_DirectionalLightEXT`, whose two `CNA_Vector3` members are inline. */
  #light(scope: WasmScope, light: DirectionalLightSnapshot): number {
    const structure = allocateStruct(this.#routes.module, scope, "CNA_DirectionalLightEXT");
    const view = this.#routes.view();
    const fields = WASM_STRUCT_LAYOUTS.CNA_DirectionalLightEXT.fields;
    const write = (
      field: keyof typeof fields, value: { X: number; Y: number; Z: number },
    ): void => {
      const offset = structure.pointer + fields[field].offset;
      view.setFloat32(offset, value.X, true);
      view.setFloat32(offset + 4, value.Y, true);
      view.setFloat32(offset + 8, value.Z, true);
    };
    write("direction", light.Direction);
    write("color", light.Color);
    // `casts_shadows` stays zero: this light is being asked where it would look from, which is
    // arithmetic on its direction, and claiming it casts would be stating something the caller did
    // not.
    return structure.setF32("intensity", light.Intensity).pointer;
  }

  /** A `CNA_BoundingBox`, which is unversioned: two `CNA_Vector3` and nothing else. */
  #bounds(scope: WasmScope, bounds: ClusterBoundsSnapshot): number {
    const layout = WASM_STRUCT_LAYOUTS.CNA_BoundingBox;
    const pointer = scope.allocate(layout.size);
    const view = this.#routes.view();
    for (const [field, value] of [["min", bounds.Min], ["max", bounds.Max]] as const) {
      const offset = pointer + layout.fields[field].offset;
      view.setFloat32(offset, value.X, true);
      view.setFloat32(offset + 4, value.Y, true);
      view.setFloat32(offset + 8, value.Z, true);
    }
    return pointer;
  }

  #matrix(pointer: number): number[] {
    const view = this.#routes.view();
    return Array.from({ length: 16 }, (_, index) => view.getFloat32(pointer + index * 4, true));
  }



}
