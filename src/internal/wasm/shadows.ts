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
import type {
  ClusterBoundsSnapshot, DirectionalLightSnapshot, PointLightSnapshot, SpotLightSnapshot,
  Vector3Snapshot,
} from "../backend.js";
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
  // the renderer's name.
  //
  // The skinned caster is here too, and the reason it was once thought not to be is worth stating:
  // it takes a bone palette from the *caller*, not from a model.
  // `cna_shadow_map_apply_skinned_caster` is `(map, const CNA_Matrix* bones, count,
  // weights_per_vertex)`, so a page that builds its own skinned vertex stream supplies its own
  // palette. What needs a native content manager is drawing a skinned `ModelMeshPart`, which is a
  // different thing and stays out of reach.

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




  // --- the three shadow maps that are not a directional one --------------------------------------
  //
  // A directional light's shadow is one map over the whole scene; these three are not. A **spot**
  // light has a position, a range and a cone, so its shadow is one perspective map. A **point**
  // light has no direction at all, so its shadow is six of them. And a directional light over a
  // large scene needs more resolution near the camera than far from it, so a **cascaded** map is
  // several maps over nested slices of the view frustum.
  //
  // All three answered `..._is_supported` with true on a WebGL 2.0 context, asked of the running
  // artifact rather than inferred from the fact that the plain shadow map works.
  //
  // Every one of them ships the transform maths as pure routes -- `compute_light_view`,
  // `compute_light_projection`, `compute_face_view`, `compute_face_projection`,
  // `compute_split_distances`, `compute_frustum_corners`, `compute_bounding_sphere` and
  // `snap_to_texel_grid` -- so what a map *did* can be checked against what those say it should
  // have done, by two different routes into the same arithmetic.

  public override createCascadedShadowMap(
    device: NativeHandle, quality: number, cascadeCount: number,
  ): NativeHandle {
    return this.#mem.create(
      "cna_cascaded_shadow_map_create", device, quality, Math.trunc(cascadeCount));
  }

  /**
   * Releases the map.
   *
   * Three of the four shadow maps refuse this while a borrow is outstanding and the spot map does
   * not (finding 16), so the public wrappers release their borrows first in every case -- which is
   * the order the other three force anyway, and the only one that is safe on all four.
   */
  public override destroyCascadedShadowMap(map: NativeHandle): void {
    this.#routes.invoke("cna_cascaded_shadow_map_destroy", map);
  }

  public override updateCascadedShadowMap(
    map: NativeHandle, light: DirectionalLightSnapshot, cameraView: readonly number[],
    cameraProjection: readonly number[],
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_cascaded_shadow_map_update", map, this.#light(scope, light),
        this.#mem.writeMatrix(scope, cameraView),
        this.#mem.writeMatrix(scope, cameraProjection),
      );
    } finally {
      scope.dispose();
    }
  }

  public override beginCascadedShadowPass(map: NativeHandle, cascadeIndex: number): void {
    this.#routes.invoke("cna_cascaded_shadow_map_begin", map, Math.trunc(cascadeIndex));
  }

  public override endCascadedShadowPass(map: NativeHandle): void {
    this.#routes.invoke("cna_cascaded_shadow_map_end", map);
  }

  public override getCascadeMatrix(map: NativeHandle, cascadeIndex: number): readonly number[] {
    return this.#mem.matrix(
      "cna_cascaded_shadow_map_get_cascade_matrix", map, Math.trunc(cascadeIndex));
  }

  public override getCascadeSplitDistance(map: NativeHandle, cascadeIndex: number): number {
    return this.#mem.float(
      "cna_cascaded_shadow_map_get_split_distance", map, Math.trunc(cascadeIndex));
  }

  public override selectCascade(map: NativeHandle, viewDepth: number): number {
    return this.#mem.int("cna_cascaded_shadow_map_select_cascade", map, viewDepth);
  }

  public override applyCascadesToReceiver(map: NativeHandle, effect: NativeHandle): void {
    this.#routes.invoke("cna_cascaded_shadow_map_apply_to_receiver", map, effect);
  }

  /** Where a cascade's centre must sit so the map does not swim as the camera moves. */
  public override snapCascadeToTexelGrid(
    centre: Vector3Snapshot, radius: number, cascadeSize: number,
  ): Vector3Snapshot {
    return this.#mem.withVector3(centre, (pointer) => this.#mem.vector3(
      "cna_cascaded_shadow_map_snap_to_texel_grid", pointer, radius, Math.trunc(cascadeSize)));
  }

  public override getCascadeSize(map: NativeHandle): number {
    return this.#mem.int("cna_cascaded_shadow_map_get_cascade_size", map);
  }

  public override getCascadeCount(map: NativeHandle): number {
    return this.#mem.int("cna_cascaded_shadow_map_get_cascade_count", map);
  }

  public override getCascadeBlendBand(map: NativeHandle): number {
    return this.#mem.float("cna_cascaded_shadow_map_get_blend_band", map);
  }

  public override setCascadeBlendBand(map: NativeHandle, band: number): void {
    this.#routes.invoke("cna_cascaded_shadow_map_set_blend_band", map, band);
  }

  public override getCascadeSplitLambda(map: NativeHandle): number {
    return this.#mem.float("cna_cascaded_shadow_map_get_split_lambda", map);
  }

  public override setCascadeSplitLambda(map: NativeHandle, lambda: number): void {
    this.#routes.invoke("cna_cascaded_shadow_map_set_split_lambda", map, lambda);
  }

  public override isCascadeDebugTintEnabled(map: NativeHandle): boolean {
    return this.#mem.bool("cna_cascaded_shadow_map_is_debug_tint_enabled", map);
  }

  public override setCascadeDebugTintEnabled(map: NativeHandle, enabled: boolean): void {
    this.#routes.invoke("cna_cascaded_shadow_map_set_debug_tint_enabled", map, enabled ? 1 : 0);
  }

  public override getCascadedCasterEffect(map: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_cascaded_shadow_map_get_caster_effect", map);
  }

  public override getCascadedShadowTexture(map: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_cascaded_shadow_map_get_shadow_texture", map);
  }

  public override isCascadedShadowMapSupported(map: NativeHandle): boolean {
    return this.#mem.bool("cna_cascaded_shadow_map_is_supported", map);
  }

  // --- the spot map ------------------------------------------------------------------------------

  public override createSpotShadowMap(device: NativeHandle, quality: number): NativeHandle {
    return this.#mem.create("cna_spot_shadow_map_create", device, quality);
  }

  /**
   * Releases the map.
   *
   * **Upstream finding 16.** This is the one of the four whose `destroy` never reads its own
   * `activeBorrowCount`: it succeeds with a lent handle still pointing at it, leaving the caller
   * holding a texture whose object is gone. The other three refuse with `INVALID_STATE`. Nothing
   * is added here to compensate -- a check in the binding would hide the defect and would not
   * protect a consumer of any other binding -- and the public `SpotShadowMap` releases its borrows
   * before the map, which is the order the other three force and the only one safe on all four.
   */
  public override destroySpotShadowMap(map: NativeHandle): void {
    this.#routes.invoke("cna_spot_shadow_map_destroy", map);
  }

  public override beginSpotShadowPass(map: NativeHandle, light: SpotLightSnapshot): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke("cna_spot_shadow_map_begin", map, this.#spotLight(scope, light));
    } finally {
      scope.dispose();
    }
  }

  public override endSpotShadowPass(map: NativeHandle): void {
    this.#routes.invoke("cna_spot_shadow_map_end", map);
  }

  public override getSpotShadowLightViewProjection(map: NativeHandle): readonly number[] {
    return this.#mem.matrix("cna_spot_shadow_map_get_light_view_projection", map);
  }

  public override getSpotShadowLightPosition(map: NativeHandle): Vector3Snapshot {
    return this.#mem.vector3("cna_spot_shadow_map_get_light_position", map);
  }

  public override getSpotShadowLightRange(map: NativeHandle): number {
    return this.#mem.float("cna_spot_shadow_map_get_light_range", map);
  }

  public override getSpotShadowQuality(map: NativeHandle): number {
    return this.#mem.u32("cna_spot_shadow_map_get_quality", map);
  }

  public override getSpotShadowSize(map: NativeHandle): number {
    return this.#mem.int("cna_spot_shadow_map_get_size", map);
  }

  public override getSpotShadowDepthBias(map: NativeHandle): number {
    return this.#mem.float("cna_spot_shadow_map_get_depth_bias", map);
  }

  public override setSpotShadowDepthBias(map: NativeHandle, bias: number): void {
    this.#routes.invoke("cna_spot_shadow_map_set_depth_bias", map, bias);
  }

  public override getSpotShadowCasterEffect(map: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_spot_shadow_map_get_caster_effect", map);
  }

  public override getSpotShadowTexture(map: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_spot_shadow_map_get_shadow_texture", map);
  }

  public override isSpotShadowMapSupported(map: NativeHandle): boolean {
    return this.#mem.bool("cna_spot_shadow_map_is_supported", map);
  }

  // --- the cube map ------------------------------------------------------------------------------

  public override createCubeShadowMap(device: NativeHandle, quality: number): NativeHandle {
    return this.#mem.create("cna_cube_shadow_map_create", device, quality);
  }

  public override destroyCubeShadowMap(map: NativeHandle): void {
    this.#routes.invoke("cna_cube_shadow_map_destroy", map);
  }

  public override updateCubeShadowMap(map: NativeHandle, light: PointLightSnapshot): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke("cna_cube_shadow_map_update", map, this.#pointLight(scope, light));
    } finally {
      scope.dispose();
    }
  }

  public override beginCubeShadowPass(map: NativeHandle, faceIndex: number): void {
    this.#routes.invoke("cna_cube_shadow_map_begin", map, Math.trunc(faceIndex));
  }

  public override endCubeShadowPass(map: NativeHandle): void {
    this.#routes.invoke("cna_cube_shadow_map_end", map);
  }

  public override getCubeShadowLightPosition(map: NativeHandle): Vector3Snapshot {
    return this.#mem.vector3("cna_cube_shadow_map_get_light_position", map);
  }

  public override getCubeShadowLightRange(map: NativeHandle): number {
    return this.#mem.float("cna_cube_shadow_map_get_light_range", map);
  }

  public override getCubeShadowQuality(map: NativeHandle): number {
    return this.#mem.u32("cna_cube_shadow_map_get_quality", map);
  }

  public override getCubeShadowSize(map: NativeHandle): number {
    return this.#mem.int("cna_cube_shadow_map_get_size", map);
  }

  public override getCubeShadowDepthBias(map: NativeHandle): number {
    return this.#mem.float("cna_cube_shadow_map_get_depth_bias", map);
  }

  public override setCubeShadowDepthBias(map: NativeHandle, bias: number): void {
    this.#routes.invoke("cna_cube_shadow_map_set_depth_bias", map, bias);
  }

  public override getCubeShadowCasterEffect(map: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_cube_shadow_map_get_caster_effect", map);
  }

  public override getCubeShadowTexture(map: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_cube_shadow_map_get_shadow_texture", map);
  }

  public override isCubeShadowMapSupported(map: NativeHandle): boolean {
    return this.#mem.bool("cna_cube_shadow_map_is_supported", map);
  }

  // --- the transforms, which are the same arithmetic on every renderer ----------------------------

  public override computeSpotShadowLightView(light: SpotLightSnapshot): readonly number[] {
    const scope = this.#routes.scope();
    try {
      return this.#mem.matrix(
        "cna_spot_shadow_map_compute_light_view", this.#spotLight(scope, light));
    } finally {
      scope.dispose();
    }
  }

  public override computeSpotShadowLightProjection(light: SpotLightSnapshot): readonly number[] {
    const scope = this.#routes.scope();
    try {
      return this.#mem.matrix(
        "cna_spot_shadow_map_compute_light_projection", this.#spotLight(scope, light));
    } finally {
      scope.dispose();
    }
  }

  /** The view from a point light along one cube face, which is where a face permutation shows. */
  public override computeCubeShadowFaceView(
    face: number, position: Vector3Snapshot,
  ): readonly number[] {
    return this.#mem.withVector3(position, (pointer) =>
      this.#mem.matrix("cna_cube_shadow_map_compute_face_view", face, pointer));
  }

  public override computeCubeShadowFaceProjection(range: number): readonly number[] {
    return this.#mem.matrix("cna_cube_shadow_map_compute_face_projection", range);
  }

  public override cubeShadowMapSizeForQuality(quality: number): number {
    return this.#mem.int("cna_cube_shadow_map_size_for_quality", quality);
  }

  /** The logarithmic-to-uniform split blend, counted first because the count is the caller's. */
  public override computeCascadeSplitDistances(
    nearPlane: number, farPlane: number, cascadeCount: number, lambda: number,
  ): readonly number[] {
    return this.#mem.probedArray(
      "cna_cascaded_shadow_map_compute_split_distances",
      [nearPlane, farPlane, Math.trunc(cascadeCount), lambda], 4,
      (base, written) => {
        const view = this.#routes.view();
        return Array.from({ length: written }, (_, index) =>
          view.getFloat32(base + index * 4, true));
      });
  }

  /** The eight corners of a frustum in world space, in CNA's own order. */
  public override computeCascadeFrustumCorners(
    view: readonly number[], projection: readonly number[],
  ): readonly Vector3Snapshot[] {
    const scope = this.#routes.scope();
    try {
      const stride = WASM_STRUCT_LAYOUTS.CNA_Vector3.size;
      const corners = scope.allocate(stride * 8);
      this.#routes.invoke(
        "cna_cascaded_shadow_map_compute_frustum_corners",
        this.#mem.writeMatrix(scope, view), this.#mem.writeMatrix(scope, projection), corners,
      );
      const memory = this.#routes.view();
      return Array.from({ length: 8 }, (_, index) => ({
        X: memory.getFloat32(corners + index * stride, true),
        Y: memory.getFloat32(corners + index * stride + 4, true),
        Z: memory.getFloat32(corners + index * stride + 8, true),
      }));
    } finally {
      scope.dispose();
    }
  }

  /** The smallest sphere around those corners: a centre and a radius, two separate outputs. */
  public override computeCascadeBoundingSphere(
    corners: readonly Vector3Snapshot[],
  ): { readonly Center: Vector3Snapshot; readonly Radius: number } {
    const scope = this.#routes.scope();
    try {
      const stride = WASM_STRUCT_LAYOUTS.CNA_Vector3.size;
      const input = scope.allocate(stride * Math.max(corners.length, 1));
      const memory = this.#routes.view();
      corners.forEach((corner, index) => {
        memory.setFloat32(input + index * stride, corner.X, true);
        memory.setFloat32(input + index * stride + 4, corner.Y, true);
        memory.setFloat32(input + index * stride + 8, corner.Z, true);
      });
      const centre = scope.allocate(stride);
      const radius = scope.allocate(4);
      this.#routes.view().setFloat32(radius, -1234.5, true);
      this.#routes.invoke(
        "cna_cascaded_shadow_map_compute_bounding_sphere", input, centre, radius);
      const after = this.#routes.view();
      return {
        Center: {
          X: after.getFloat32(centre, true),
          Y: after.getFloat32(centre + 4, true),
          Z: after.getFloat32(centre + 8, true),
        },
        Radius: after.getFloat32(radius, true),
      };
    } finally {
      scope.dispose();
    }
  }

  /** A `CNA_SpotLightEXT`, initialised by CNA before anything is written into it. */
  #spotLight(scope: WasmScope, light: SpotLightSnapshot): number {
    const structure = new WasmStruct(
      this.#routes.module, "CNA_SpotLightEXT",
      scope.allocate(WASM_STRUCT_LAYOUTS.CNA_SpotLightEXT.size),
    );
    this.#routes.invoke("cna_spot_light_ext_init", structure.pointer);
    structure
      .setF32Array("position", [light.Position.X, light.Position.Y, light.Position.Z])
      .setF32Array("direction", [light.Direction.X, light.Direction.Y, light.Direction.Z])
      .setF32Array("color", [light.Color.X, light.Color.Y, light.Color.Z])
      .setF32("intensity", light.Intensity)
      .setF32("range", light.Range)
      .setF32("inner_angle", light.InnerAngle)
      .setF32("outer_angle", light.OuterAngle)
      .setU8("casts_shadows", light.CastsShadows ? 1 : 0);
    return structure.pointer;
  }

  #pointLight(scope: WasmScope, light: PointLightSnapshot): number {
    const structure = new WasmStruct(
      this.#routes.module, "CNA_PointLightEXT",
      scope.allocate(WASM_STRUCT_LAYOUTS.CNA_PointLightEXT.size),
    );
    this.#routes.invoke("cna_point_light_ext_init", structure.pointer);
    structure
      .setF32Array("position", [light.Position.X, light.Position.Y, light.Position.Z])
      .setF32Array("color", [light.Color.X, light.Color.Y, light.Color.Z])
      .setF32("intensity", light.Intensity)
      .setF32("range", light.Range)
      .setU8("casts_shadows", light.CastsShadows ? 1 : 0);
    return structure.pointer;
  }


  /**
   * The skinned caster's bone palette, as one contiguous array of matrices.
   *
   * The count is the caller's, so the array is written at the measured `CNA_Matrix` stride and its
   * length is what CNA is told -- no fixed maximum, and no assumption that a palette is some
   * particular size because another engine's is.
   */
  public override applySkinnedShadowCaster(
    map: NativeHandle, bones: readonly (readonly number[])[], weightsPerVertex: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      const stride = WASM_STRUCT_LAYOUTS.CNA_Matrix.size;
      const buffer = scope.allocate(stride * Math.max(bones.length, 1));
      const view = this.#routes.view();
      bones.forEach((bone, index) => {
        if (bone.length !== 16) {
          throw new RangeError(`bone ${index} is ${bone.length} floats, not sixteen`);
        }
        for (let element = 0; element < 16; element += 1) {
          view.setFloat32(buffer + index * stride + element * 4, bone[element] as number, true);
        }
      });
      this.#routes.invoke(
        "cna_shadow_map_apply_skinned_caster", map, buffer, BigInt(bones.length),
        Math.trunc(weightsPerVertex),
      );
    } finally {
      scope.dispose();
    }
  }

  public override getSkinnedShadowCasterEffect(map: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_shadow_map_get_skinned_caster_effect", map);
  }

}
