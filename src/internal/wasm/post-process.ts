// SPDX-License-Identifier: MS-PL
//
// The rest of CNA's post-process passes, in a browser.
//
// The previous slice bound the passes whose whole input is the frame that is already on screen:
// the blit, colour grading, the tonemapper, bloom, FXAA, chromatic aberration and film grain. The
// twelve here are the ones that read something *else* -- depth, normals, velocity, a sun, a light
// on screen, a custom effect -- and they were left unbound not because a browser could not run
// them but because nobody had asked the artifact.
//
// The artifact was asked. Every one of these created and answered
// `cna_post_process_pass_is_supported` with **true** on a WebGL 2.0 context in headless Chromium,
// against an artifact built `-DCNA_CNAEXT=ON`; against the default artifact every create answers
// `NOT_SUPPORTED` (6) and nothing here is reached at all. Both answers are CNA's, which is the
// point: this file adds no policy of its own about what a browser can run.
//
// What makes them *checkable* rather than merely reachable is that seven of them ship a pure
// scalar of the same arithmetic their shader does, reached by a different route:
//
//   cna_depth_of_field_pass_circle_of_confusion_millimetres   the thin-lens equation
//   cna_ssao_pass_sample_count_for_quality                    the quality-to-samples table
//   cna_ssao_pass_copy_kernel                                 the hemisphere CNA actually samples
//   cna_aerial_perspective_pass_air_mass_for_distance         the exponential air-mass integral
//   cna_aerial_perspective_pass_transmittance                 Rayleigh extinction per channel
//   cna_height_fog_pass_optical_depth                         the height-fog integral
//   cna_contact_shadow_pass_is_occluded                       the ray-vs-depth acceptance test
//   cna_contact_shadow_pass_combine_visibility                how the two shadow terms multiply
//   cna_spatial_upscale_pass_is_identity_scale                whether the upscaler is a no-op
//
// A test that compares a rendered texel to one of those is comparing two implementations of one
// specification. That is the same standard `tonemapChannel` and `extractBloomChannel` set for the
// first slice, and it is why these passes are bound here rather than proved by "the output
// changed".

import type {
  RectangleSnapshot, SizeSnapshot, Vector2Snapshot, Vector3Snapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmEngineState } from "./engine-state.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct } from "./module.js";

/** Written into every `int32_t` output before the call, so a route that writes none is visible. */
const POISONED_INT32 = -0x5f5f5f60;

export abstract class WasmPostProcessPasses extends WasmEngineState {
  // --- screen-space ambient occlusion ------------------------------------------------------------

  public override createSsaoPass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_ssao_pass_create", device);
  }

  public override getSsaoRadius(pass: NativeHandle): number {
    return this.mem.float("cna_ssao_pass_get_radius", pass);
  }

  public override setSsaoRadius(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_ssao_pass_set_radius", pass, value);
  }

  public override getSsaoIntensity(pass: NativeHandle): number {
    return this.mem.float("cna_ssao_pass_get_intensity", pass);
  }

  public override setSsaoIntensity(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_ssao_pass_set_intensity", pass, value);
  }

  public override getSsaoSampleCount(pass: NativeHandle): number {
    return this.mem.int("cna_ssao_pass_get_sample_count", pass);
  }

  public override setSsaoSampleCount(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_ssao_pass_set_sample_count", pass, Math.trunc(value));
  }

  public override getSsaoHalfResolution(pass: NativeHandle): boolean {
    return this.mem.bool("cna_ssao_pass_get_half_resolution", pass);
  }

  public override setSsaoHalfResolution(pass: NativeHandle, value: boolean): void {
    this.routes.invoke("cna_ssao_pass_set_half_resolution", pass, value ? 1 : 0);
  }

  /** CNA's own quality-to-sample-count table, which is what a caller is checked against. */
  public override ssaoSampleCountForQuality(quality: number): number {
    return this.mem.int("cna_ssao_pass_sample_count_for_quality", quality);
  }

  /**
   * The hemisphere CNA samples, counted first and then copied.
   *
   * This is the pass's actual kernel rather than a description of one, so a test can assert the
   * two properties that make it a hemisphere -- every sample inside the unit ball, every sample on
   * the positive Z side -- against the vectors the shader will really use.
   */
  public override getSsaoKernel(pass: NativeHandle): readonly Vector3Snapshot[] {
    const stride = WASM_STRUCT_LAYOUTS.CNA_Vector3.size;
    return this.mem.probedArray("cna_ssao_pass_copy_kernel", [pass], stride, (base, written) => {
      const view = this.routes.view();
      const kernel: Vector3Snapshot[] = [];
      for (let index = 0; index < written; index += 1) {
        const at = base + stride * index;
        kernel.push({
          X: view.getFloat32(at, true),
          Y: view.getFloat32(at + 4, true),
          Z: view.getFloat32(at + 8, true),
        });
      }
      return kernel;
    });
  }

  /** The pass's own occlusion GLSL, in its packed and unpacked forms. */
  public override getSsaoOcclusionGlsl(packed: boolean): string {
    return this.mem.probedString("cna_ssao_pass_copy_occlusion_glsl", packed ? 1 : 0);
  }

  public override resetSsaoTargets(pass: NativeHandle): void {
    this.routes.invoke("cna_ssao_pass_reset_targets", pass);
  }

  // --- screen-space reflections -----------------------------------------------------------------

  public override createSsrPass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_ssr_pass_create", device);
  }

  public override getSsrIntensity(pass: NativeHandle): number {
    return this.mem.float("cna_ssr_pass_get_intensity", pass);
  }

  public override setSsrIntensity(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_ssr_pass_set_intensity", pass, value);
  }

  public override getSsrMaxDistance(pass: NativeHandle): number {
    return this.mem.float("cna_ssr_pass_get_max_distance", pass);
  }

  public override setSsrMaxDistance(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_ssr_pass_set_max_distance", pass, value);
  }

  public override getSsrThickness(pass: NativeHandle): number {
    return this.mem.float("cna_ssr_pass_get_thickness", pass);
  }

  public override setSsrThickness(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_ssr_pass_set_thickness", pass, value);
  }

  public override getSsrDepthBias(pass: NativeHandle): number {
    return this.mem.float("cna_ssr_pass_get_depth_bias", pass);
  }

  public override setSsrDepthBias(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_ssr_pass_set_depth_bias", pass, value);
  }

  public override getSsrEdgeFade(pass: NativeHandle): number {
    return this.mem.float("cna_ssr_pass_get_edge_fade", pass);
  }

  public override setSsrEdgeFade(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_ssr_pass_set_edge_fade", pass, value);
  }

  public override getSsrRoughnessBlur(pass: NativeHandle): number {
    return this.mem.float("cna_ssr_pass_get_roughness_blur", pass);
  }

  public override setSsrRoughnessBlur(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_ssr_pass_set_roughness_blur", pass, value);
  }

  public override getSsrStepCount(pass: NativeHandle): number {
    return this.mem.int("cna_ssr_pass_get_step_count", pass);
  }

  public override setSsrStepCount(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_ssr_pass_set_step_count", pass, Math.trunc(value));
  }

  // --- depth of field ---------------------------------------------------------------------------

  public override createDepthOfFieldPass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_depth_of_field_pass_create", device);
  }

  public override getDepthOfFieldFocusDistance(pass: NativeHandle): number {
    return this.mem.float("cna_depth_of_field_pass_get_focus_distance", pass);
  }

  public override setDepthOfFieldFocusDistance(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_depth_of_field_pass_set_focus_distance", pass, value);
  }

  public override getDepthOfFieldFocalLength(pass: NativeHandle): number {
    return this.mem.float("cna_depth_of_field_pass_get_focal_length", pass);
  }

  public override setDepthOfFieldFocalLength(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_depth_of_field_pass_set_focal_length", pass, value);
  }

  public override getDepthOfFieldFNumber(pass: NativeHandle): number {
    return this.mem.float("cna_depth_of_field_pass_get_f_number", pass);
  }

  public override setDepthOfFieldFNumber(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_depth_of_field_pass_set_f_number", pass, value);
  }

  public override getDepthOfFieldMaxRadius(pass: NativeHandle): number {
    return this.mem.float("cna_depth_of_field_pass_get_max_radius", pass);
  }

  public override setDepthOfFieldMaxRadius(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_depth_of_field_pass_set_max_radius", pass, value);
  }

  /**
   * The thin-lens circle of confusion, as a pure function of four scalars.
   *
   * The pass's whole visible behaviour is this number: a texel at the focus distance gets zero and
   * blurs by the aperture's projection everywhere else. Having it as a scalar means a test can
   * assert the *shape* of the response -- zero at focus, monotone away from it, symmetric in
   * neither direction because the near side saturates first -- rather than pinning one blurred
   * image from one run.
   */
  public override circleOfConfusionMillimetres(
    depth: number, focusDistance: number, focalLength: number, fNumber: number,
  ): number {
    return this.mem.float(
      "cna_depth_of_field_pass_circle_of_confusion_millimetres",
      depth, focusDistance, focalLength, fNumber,
    );
  }

  // --- lens flare -------------------------------------------------------------------------------

  public override createLensFlarePass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_lens_flare_pass_create", device);
  }

  public override getLensFlareThreshold(pass: NativeHandle): number {
    return this.mem.float("cna_lens_flare_pass_get_threshold", pass);
  }

  public override setLensFlareThreshold(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_lens_flare_pass_set_threshold", pass, value);
  }

  public override getLensFlareIntensity(pass: NativeHandle): number {
    return this.mem.float("cna_lens_flare_pass_get_intensity", pass);
  }

  public override setLensFlareIntensity(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_lens_flare_pass_set_intensity", pass, value);
  }

  public override getLensFlareDispersal(pass: NativeHandle): number {
    return this.mem.float("cna_lens_flare_pass_get_dispersal", pass);
  }

  public override setLensFlareDispersal(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_lens_flare_pass_set_dispersal", pass, value);
  }

  // --- motion blur ------------------------------------------------------------------------------

  public override createMotionBlurPass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_motion_blur_pass_create", device);
  }

  public override getMotionBlurStrength(pass: NativeHandle): number {
    return this.mem.float("cna_motion_blur_pass_get_strength", pass);
  }

  public override setMotionBlurStrength(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_motion_blur_pass_set_strength", pass, value);
  }

  public override getMotionBlurMaxDistance(pass: NativeHandle): number {
    return this.mem.float("cna_motion_blur_pass_get_max_distance", pass);
  }

  public override setMotionBlurMaxDistance(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_motion_blur_pass_set_max_distance", pass, value);
  }

  // --- aerial perspective -----------------------------------------------------------------------

  public override createAerialPerspectivePass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_aerial_perspective_pass_create", device);
  }

  public override getAerialPerspectiveSunDirection(pass: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_aerial_perspective_pass_get_sun_direction", pass);
  }

  public override setAerialPerspectiveSunDirection(
    pass: NativeHandle, value: Vector3Snapshot,
  ): void {
    this.mem.withVector3(value, (pointer) =>
      this.routes.invoke("cna_aerial_perspective_pass_set_sun_direction", pass, pointer));
  }

  public override getAerialPerspectiveTurbidity(pass: NativeHandle): number {
    return this.mem.float("cna_aerial_perspective_pass_get_turbidity", pass);
  }

  public override setAerialPerspectiveTurbidity(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_aerial_perspective_pass_set_turbidity", pass, value);
  }

  public override getAerialPerspectiveIntensity(pass: NativeHandle): number {
    return this.mem.float("cna_aerial_perspective_pass_get_intensity", pass);
  }

  public override setAerialPerspectiveIntensity(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_aerial_perspective_pass_set_intensity", pass, value);
  }

  public override getAerialPerspectiveScaleHeight(pass: NativeHandle): number {
    return this.mem.float("cna_aerial_perspective_pass_get_scale_height", pass);
  }

  public override setAerialPerspectiveScaleHeight(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_aerial_perspective_pass_set_scale_height", pass, value);
  }

  public override aerialPerspectiveCopyFallbackReason(pass: NativeHandle): string {
    return this.mem.probedString("cna_aerial_perspective_pass_copy_fallback_reason", pass);
  }

  /** How much atmosphere a ray of this direction crosses; a pure function of the geometry. */
  public override aerialPerspectiveAirMassForDistance(
    viewDirection: Vector3Snapshot, distance: number, scaleHeight: number,
  ): number {
    return this.mem.withVector3(viewDirection, (pointer) => this.mem.float(
      "cna_aerial_perspective_pass_air_mass_for_distance", pointer, distance, scaleHeight));
  }

  /** What survives that air mass, per channel: the three numbers the shader multiplies by. */
  public override aerialPerspectiveTransmittance(
    turbidity: number, airMass: number,
  ): Vector3Snapshot {
    return this.mem.vector3("cna_aerial_perspective_pass_transmittance", turbidity, airMass);
  }

  // --- height fog -------------------------------------------------------------------------------

  public override createHeightFogPass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_height_fog_pass_create", device);
  }

  public override getHeightFogColor(pass: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_height_fog_pass_get_color", pass);
  }

  public override setHeightFogColor(pass: NativeHandle, value: Vector3Snapshot): void {
    this.mem.withVector3(value, (pointer) =>
      this.routes.invoke("cna_height_fog_pass_set_color", pass, pointer));
  }

  public override getHeightFogDensity(pass: NativeHandle): number {
    return this.mem.float("cna_height_fog_pass_get_density", pass);
  }

  public override setHeightFogDensity(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_height_fog_pass_set_density", pass, value);
  }

  public override getHeightFogFalloff(pass: NativeHandle): number {
    return this.mem.float("cna_height_fog_pass_get_falloff", pass);
  }

  public override setHeightFogFalloff(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_height_fog_pass_set_falloff", pass, value);
  }

  public override getHeightFogBaseHeight(pass: NativeHandle): number {
    return this.mem.float("cna_height_fog_pass_get_base_height", pass);
  }

  public override setHeightFogBaseHeight(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_height_fog_pass_set_base_height", pass, value);
  }

  /** The height-fog integral along one ray, which is the whole of what the shader computes. */
  public override heightFogOpticalDepth(
    cameraHeight: number, rayHeightStep: number, distance: number,
    density: number, falloff: number, baseHeight: number,
  ): number {
    return this.mem.float(
      "cna_height_fog_pass_optical_depth",
      cameraHeight, rayHeightStep, distance, density, falloff, baseHeight,
    );
  }

  // --- light shafts -----------------------------------------------------------------------------

  public override createLightShaftPass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_light_shaft_pass_create", device);
  }

  public override getLightShaftLightScreenPosition(pass: NativeHandle): Vector2Snapshot {
    return this.mem.vector2("cna_light_shaft_pass_get_light_screen_position", pass);
  }

  public override setLightShaftLightScreenPosition(
    pass: NativeHandle, value: Vector2Snapshot,
  ): void {
    this.mem.withVector2(value, (pointer) =>
      this.routes.invoke("cna_light_shaft_pass_set_light_screen_position", pass, pointer));
  }

  public override getLightShaftThreshold(pass: NativeHandle): number {
    return this.mem.float("cna_light_shaft_pass_get_threshold", pass);
  }

  public override setLightShaftThreshold(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_light_shaft_pass_set_threshold", pass, value);
  }

  public override getLightShaftIntensity(pass: NativeHandle): number {
    return this.mem.float("cna_light_shaft_pass_get_intensity", pass);
  }

  public override setLightShaftIntensity(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_light_shaft_pass_set_intensity", pass, value);
  }

  public override getLightShaftDecay(pass: NativeHandle): number {
    return this.mem.float("cna_light_shaft_pass_get_decay", pass);
  }

  public override setLightShaftDecay(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_light_shaft_pass_set_decay", pass, value);
  }

  // --- volumetric fog ---------------------------------------------------------------------------

  public override createVolumetricFogPass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_volumetric_fog_pass_create", device);
  }

  public override getVolumetricFogDensity(pass: NativeHandle): number {
    return this.mem.float("cna_volumetric_fog_pass_get_density", pass);
  }

  public override setVolumetricFogDensity(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_volumetric_fog_pass_set_density", pass, value);
  }

  public override getVolumetricFogAnisotropy(pass: NativeHandle): number {
    return this.mem.float("cna_volumetric_fog_pass_get_anisotropy", pass);
  }

  public override setVolumetricFogAnisotropy(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_volumetric_fog_pass_set_anisotropy", pass, value);
  }

  public override getVolumetricFogRange(pass: NativeHandle): number {
    return this.mem.float("cna_volumetric_fog_pass_get_range", pass);
  }

  public override setVolumetricFogRange(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_volumetric_fog_pass_set_range", pass, value);
  }

  /**
   * The light the fog scatters: a shadow map it is occluded by, a direction and a colour.
   *
   * The shadow map is a borrow the pass reads from and never releases, so `0n` is the honest way
   * to say "no shadow map" rather than a handle to an empty one.
   */
  public override setVolumetricFogLight(
    pass: NativeHandle, shadowMap: NativeHandle, direction: Vector3Snapshot,
    color: Vector3Snapshot,
  ): void {
    this.mem.withVector3(direction, (directionPointer) =>
      this.mem.withVector3(color, (colorPointer) => this.routes.invoke(
        "cna_volumetric_fog_pass_set_light", pass, shadowMap, directionPointer, colorPointer)));
  }

  // --- contact shadows --------------------------------------------------------------------------

  public override createContactShadowPass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_contact_shadow_pass_create", device);
  }

  public override getContactShadowLightDirection(pass: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_contact_shadow_pass_get_light_direction", pass);
  }

  public override setContactShadowLightDirection(
    pass: NativeHandle, value: Vector3Snapshot,
  ): void {
    this.mem.withVector3(value, (pointer) =>
      this.routes.invoke("cna_contact_shadow_pass_set_light_direction", pass, pointer));
  }

  public override getContactShadowMaxDistance(pass: NativeHandle): number {
    return this.mem.float("cna_contact_shadow_pass_get_max_distance", pass);
  }

  public override setContactShadowMaxDistance(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_contact_shadow_pass_set_max_distance", pass, value);
  }

  public override getContactShadowStepCount(pass: NativeHandle): number {
    return this.mem.int("cna_contact_shadow_pass_get_step_count", pass);
  }

  public override setContactShadowStepCount(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_contact_shadow_pass_set_step_count", pass, Math.trunc(value));
  }

  public override getContactShadowThickness(pass: NativeHandle): number {
    return this.mem.float("cna_contact_shadow_pass_get_thickness", pass);
  }

  public override setContactShadowThickness(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_contact_shadow_pass_set_thickness", pass, value);
  }

  public override getContactShadowIntensity(pass: NativeHandle): number {
    return this.mem.float("cna_contact_shadow_pass_get_intensity", pass);
  }

  public override setContactShadowIntensity(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_contact_shadow_pass_set_intensity", pass, value);
  }

  public override getContactShadowBias(pass: NativeHandle): number {
    return this.mem.float("cna_contact_shadow_pass_get_bias", pass);
  }

  public override setContactShadowBias(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_contact_shadow_pass_set_bias", pass, value);
  }

  public override getContactShadowFallbackReason(pass: NativeHandle): string {
    return this.mem.probedString("cna_contact_shadow_pass_copy_fallback_reason", pass);
  }

  /**
   * The ray-march acceptance test, as a scalar.
   *
   * A contact shadow is this predicate evaluated along a ray: the marched sample is occluded when
   * it is behind the depth buffer by more than the bias and by less than the thickness. Both
   * bounds matter and a binding that dropped either would still produce shadows, so the test
   * asserts the *boundaries* -- which is only possible because CNA answers the predicate directly.
   */
  public override isContactShadowOccluded(
    rayViewDepth: number, sceneViewDepth: number, bias: number, thickness: number,
  ): boolean {
    return this.mem.bool(
      "cna_contact_shadow_pass_is_occluded", rayViewDepth, sceneViewDepth, bias, thickness);
  }

  public override getContactShadowOcclusionGlsl(): string {
    return this.mem.probedString("cna_contact_shadow_pass_copy_occlusion_test_glsl");
  }

  /** How the shadow map's visibility and the contact term combine into one. */
  public override combineContactShadowVisibility(
    shadowMapVisibility: number, contactVisibility: number,
  ): number {
    return this.mem.float(
      "cna_contact_shadow_pass_combine_visibility", shadowMapVisibility, contactVisibility);
  }

  // --- ASCII ------------------------------------------------------------------------------------

  public override createAsciiPass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_ascii_pass_create", device);
  }

  /**
   * The pass's effect, which the pass owns.
   *
   * Borrowed rather than owned by the caller: `AsciiPass` hands this out so its cell size and
   * quantize mode can be reached, and destroying it would leave the pass holding a released
   * effect. The public wrapper takes the borrowed shape, which is what the Node backend does for
   * the same route.
   */
  public override getAsciiPassEffect(pass: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_ascii_pass_get_effect", pass);
  }

  public override createAsciiEffect(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_ascii_post_process_effect_create", device);
  }

  public override destroyAsciiEffect(effect: NativeHandle): void {
    this.routes.invoke("cna_ascii_post_process_effect_destroy", effect);
  }

  /** A cell is two `int32_t` outputs rather than one, so a width read as a height is visible. */
  public override getAsciiCellSize(effect: NativeHandle): SizeSnapshot {
    return this.#twoInts("cna_ascii_post_process_effect_get_cell_size", effect);
  }

  public override setAsciiCellSize(effect: NativeHandle, width: number, height: number): void {
    this.routes.invoke(
      "cna_ascii_post_process_effect_set_cell_size", effect,
      Math.trunc(width), Math.trunc(height),
    );
  }

  public override getAsciiQuantizeMode(effect: NativeHandle): number {
    return this.mem.u32("cna_ascii_post_process_effect_get_quantize_mode", effect);
  }

  public override setAsciiQuantizeMode(effect: NativeHandle, mode: number): void {
    this.routes.invoke("cna_ascii_post_process_effect_set_quantize_mode", effect, mode);
  }

  /** The effect over a rectangle of whatever target is bound. */
  public override drawAsciiEffect(
    effect: NativeHandle, source: NativeHandle, destination: RectangleSnapshot,
  ): void {
    const scope = this.routes.scope();
    try {
      const rectangle = allocateStruct(this.routes.module, scope, "CNA_Rectangle", false);
      rectangle.setI32("x", Math.trunc(destination.X)).setI32("y", Math.trunc(destination.Y))
        .setI32("width", Math.trunc(destination.Width))
        .setI32("height", Math.trunc(destination.Height));
      this.routes.invoke(
        "cna_ascii_post_process_effect_draw", effect, source, rectangle.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** The character grid the last draw produced. */
  public override getAsciiLastGridDimensions(effect: NativeHandle): SizeSnapshot {
    return this.#twoInts("cna_ascii_post_process_effect_get_last_grid_dimensions", effect);
  }

  /**
   * A route with two `int32_t` outputs rather than a structure.
   *
   * Both are poisoned before the call: reading back an initializer this binding wrote is how a
   * route that never writes its outputs passes a test about what it computed.
   */
  #twoInts(route: string, handle: NativeHandle): SizeSnapshot {
    const scope = this.routes.scope();
    try {
      const width = scope.allocate(4);
      const height = scope.allocate(4);
      const before = this.routes.view();
      before.setInt32(width, POISONED_INT32, true);
      before.setInt32(height, POISONED_INT32, true);
      this.routes.invoke(route, handle, width, height);
      const view = this.routes.view();
      return { Width: view.getInt32(width, true), Height: view.getInt32(height, true) };
    } finally {
      scope.dispose();
    }
  }

  // --- the pass that runs a game's own effect ---------------------------------------------------

  /**
   * A pass over a **borrowed** effect: the caller keeps the effect and outlives the pass.
   *
   * `getEffectPassEffect` below is the one route in this family with an upstream hazard. It says
   * "do not destroy it" and mints a fresh registered handle anyway, so obeying the header leaves a
   * handle the game counts and nobody releases -- and `cna_game_destroy` then refuses for the rest
   * of the process (finding 17). The backend gives the handle back unchanged; the public
   * `EffectPass.HasEffect` releases it immediately and says why on itself. That decision is shared
   * managed code, so a browser and a desktop consumer get the same, correct, lifetime.
   */
  public override createEffectPass(
    device: NativeHandle, effect: NativeHandle, name: string,
  ): NativeHandle {
    return this.mem.withStringView(name, (view) =>
      this.mem.create("cna_post_process_effect_pass_create", device, effect, view));
  }

  /** The same pass, taking ownership of the effect rather than borrowing it. */
  public override createOwningEffectPass(
    device: NativeHandle, effect: NativeHandle, name: string,
  ): NativeHandle {
    return this.mem.withStringView(name, (view) =>
      this.mem.create("cna_post_process_effect_pass_create_owning", device, effect, view));
  }

  public override getEffectPassEffect(pass: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_post_process_effect_pass_get_effect", pass);
  }

  public override setEffectPassEffect(pass: NativeHandle, effect: NativeHandle): void {
    this.routes.invoke("cna_post_process_effect_pass_set_effect", pass, effect);
  }

  // --- the spatial upscaler ---------------------------------------------------------------------

  public override createSpatialUpscalePass(device: NativeHandle): NativeHandle {
    return this.mem.create("cna_spatial_upscale_pass_create", device);
  }

  public override destroySpatialUpscalePass(pass: NativeHandle): void {
    this.routes.invoke("cna_spatial_upscale_pass_destroy", pass);
  }

  public override getSpatialUpscaleSharpness(pass: NativeHandle): number {
    return this.mem.float("cna_spatial_upscale_pass_get_sharpness", pass);
  }

  public override setSpatialUpscaleSharpness(pass: NativeHandle, value: number): void {
    this.routes.invoke("cna_spatial_upscale_pass_set_sharpness", pass, value);
  }

  public override isSpatialUpscaleEdgeAdaptive(pass: NativeHandle): boolean {
    return this.mem.bool("cna_spatial_upscale_pass_get_edge_adaptive", pass);
  }

  public override setSpatialUpscaleEdgeAdaptive(pass: NativeHandle, value: boolean): void {
    this.routes.invoke("cna_spatial_upscale_pass_set_edge_adaptive", pass, value ? 1 : 0);
  }

  /** The upscale itself, from a source of one size onto the bound target of another. */
  public override drawSpatialUpscalePass(
    pass: NativeHandle, source: NativeHandle, sourceWidth: number, sourceHeight: number,
    targetWidth: number, targetHeight: number,
  ): void {
    this.routes.invoke(
      "cna_spatial_upscale_pass_draw", pass, source,
      Math.trunc(sourceWidth), Math.trunc(sourceHeight),
      Math.trunc(targetWidth), Math.trunc(targetHeight),
    );
  }

  /**
   * Whether these two sizes make the upscaler a no-op.
   *
   * Not the same question as "are the numbers equal": it is CNA's own answer, and a test that
   * asserts it for equal *and* unequal sizes catches a binding that transposed width and height,
   * which comparing the numbers locally would not.
   */
  public override isSpatialUpscaleIdentityScale(
    sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number,
  ): boolean {
    return this.mem.bool(
      "cna_spatial_upscale_pass_is_identity_scale",
      Math.trunc(sourceWidth), Math.trunc(sourceHeight),
      Math.trunc(targetWidth), Math.trunc(targetHeight),
    );
  }
}
