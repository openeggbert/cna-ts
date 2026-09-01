// SPDX-License-Identifier: MS-PL
//
// The engine layer's state: the render pipeline, the effects that are not passes, the transparency
// and exposure resolves, the debug draw, the frustum culler, and the shader-effect family.
//
// Every member here is generated from three facts and no judgement: the member's own signature in
// `CnaGraphicsExtensionBackend`, the route the Node-API bridge proves it against, and the C
// declaration of that route -- which is what decides whether a `number` argument is truncated to an
// integer or passed as a float, because `size` is an `int32_t` in one route here and a `float` in
// the next. Nothing chooses a helper by the look of a name.
//
// It is a separate file from its siblings for the reason the others are: the extended-graphics
// interface is 603 members, and a facade that size is only readable if each part of it is one
// family. What this part has in common is that none of it writes a CNA structure into wasm memory;
// the members that do are in the file below it.

import type { Vector2Snapshot, Vector3Snapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmEngineStructures } from "./engine-structures.js";

export abstract class WasmEngineState extends WasmEngineStructures {
  public override createRenderPipeline(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_render_pipeline_create", device);
  }

  public override resizeRenderPipeline(
    pipeline: NativeHandle, width: number, height: number,
  ): void {
    this.routes.invoke(
      "cna_render_pipeline_resize", pipeline, Math.trunc(width), Math.trunc(height),
    );
  }

  public override beginRenderPipeline(pipeline: NativeHandle, packedClearColor: number): void {
    this.routes.invoke("cna_render_pipeline_begin", pipeline, packedClearColor);
  }

  public override endRenderPipeline(pipeline: NativeHandle): void {
    this.routes.invoke("cna_render_pipeline_end", pipeline);
  }

  public override evaluateThinFilmIridescence(
    outsideIor: number, filmIor: number, cosTheta: number, thicknessNanometres: number,
    baseReflectance: Vector3Snapshot,
  ): Vector3Snapshot {
    return this.mem.withVector3(
      baseReflectance,
      (baseReflectancePointer) => this.mem.vector3(
          "cna_thin_film_iridescence_evaluate", outsideIor, filmIor, cosTheta,
          thicknessNanometres, baseReflectancePointer,
      ),
    );
  }

  public override getThinFilmIridescenceGlsl(): string {
    return this.mem.probedString("cna_thin_film_iridescence_copy_glsl");
  }

  public override beginScopedRenderTarget(
    device: NativeHandle, destination: NativeHandle,
  ): NativeHandle {
    return this.routes.outHandle("cna_scoped_render_target_begin", device, destination);
  }

  public override endScopedRenderTarget(scope: NativeHandle): void {
    this.routes.invoke("cna_scoped_render_target_end", scope);
  }

  public override createCrtEffect(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_crt_effect_create", device);
  }

  public override getCrtScanlineIntensity(effect: NativeHandle): number {
    return this.mem.float("cna_crt_effect_get_scanline_intensity", effect);
  }

  public override setCrtScanlineIntensity(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_crt_effect_set_scanline_intensity", effect, value);
  }

  public override getCrtCurvature(effect: NativeHandle): number {
    return this.mem.float("cna_crt_effect_get_curvature", effect);
  }

  public override setCrtCurvature(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_crt_effect_set_curvature", effect, value);
  }

  public override getCrtVignetteIntensity(effect: NativeHandle): number {
    return this.mem.float("cna_crt_effect_get_vignette_intensity", effect);
  }

  public override setCrtVignetteIntensity(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_crt_effect_set_vignette_intensity", effect, value);
  }

  public override getCrtMaskIntensity(effect: NativeHandle): number {
    return this.mem.float("cna_crt_effect_get_mask_intensity", effect);
  }

  public override setCrtMaskIntensity(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_crt_effect_set_mask_intensity", effect, value);
  }

  public override getCrtMaskType(effect: NativeHandle): number {
    return this.mem.u32("cna_crt_effect_get_mask_type", effect);
  }

  public override setCrtMaskType(effect: NativeHandle, maskType: number): void {
    this.routes.invoke("cna_crt_effect_set_mask_type", effect, maskType);
  }

  public override createDepthEffect(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_depth_effect_create", device);
  }

  public override getDepthEffectMode(effect: NativeHandle): number {
    return this.mem.u32("cna_depth_effect_get_mode", effect);
  }

  public override setDepthEffectMode(effect: NativeHandle, mode: number): void {
    this.routes.invoke("cna_depth_effect_set_mode", effect, mode);
  }

  public override getDepthEffectDitherMode(effect: NativeHandle): number {
    return this.mem.u32("cna_depth_effect_get_dither_mode", effect);
  }

  public override setDepthEffectDitherMode(effect: NativeHandle, mode: number): void {
    this.routes.invoke("cna_depth_effect_set_dither_mode", effect, mode);
  }

  public override addOwnedPostProcessPass(chain: NativeHandle, pass: NativeHandle): void {
    this.routes.invoke("cna_post_process_chain_add_owned_pass", chain, pass);
  }

  public override createFrustumCuller(): NativeHandle {
    return this.routes.outHandle("cna_frustum_culler_ext_create");
  }

  public override destroyFrustumCuller(culler: NativeHandle): void {
    this.routes.invoke("cna_frustum_culler_ext_destroy", culler);
  }

  public override getFrustumCullerFrustum(culler: NativeHandle): readonly number[] {
    return this.mem.matrix("cna_frustum_culler_ext_get_frustum", culler);
  }

  public override createGpuInstanceCuller(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_gpu_instance_culler_create", graphicsDevice);
  }

  public override destroyGpuInstanceCuller(culler: NativeHandle): void {
    this.routes.invoke("cna_gpu_instance_culler_destroy", culler);
  }

  public override isGpuInstanceCullerSupported(culler: NativeHandle): boolean {
    return this.mem.bool("cna_gpu_instance_culler_is_supported", culler);
  }

  public override getGpuInstanceCullerUnsupportedReason(culler: NativeHandle): string {
    return this.mem.probedString("cna_gpu_instance_culler_copy_unsupported_reason", culler);
  }

  public override getGpuInstanceCullerInstanceCount(culler: NativeHandle): number {
    return this.mem.int("cna_gpu_instance_culler_get_instance_count", culler);
  }

  public override gpuInstanceCullerDraw(culler: NativeHandle, primitiveType: number): void {
    this.routes.invoke("cna_gpu_instance_culler_draw", culler, primitiveType);
  }

  public override getGpuInstanceCullerVisibleCount(culler: NativeHandle): number {
    return this.mem.int("cna_gpu_instance_culler_read_visible_count_ext", culler);
  }

  public override createDebugDraw(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_debug_draw_create", graphicsDevice);
  }

  public override destroyDebugDraw(debug: NativeHandle): void {
    this.routes.invoke("cna_debug_draw_destroy", debug);
  }

  public override endDebugDraw(debug: NativeHandle): void {
    this.routes.invoke("cna_debug_draw_end", debug);
  }

  public override clearDebugDraw(debug: NativeHandle): void {
    this.routes.invoke("cna_debug_draw_clear", debug);
  }

  public override addDebugDrawSphere(
    debug: NativeHandle, centre: Vector3Snapshot, radius: number, color: number, segments: number,
  ): void {
    this.mem.withVector3(
      centre,
      (centrePointer) => this.routes.invoke(
          "cna_debug_draw_add_sphere", debug, centrePointer, radius, color, Math.trunc(segments),
      ),
    );
  }

  public override addDebugDrawFrustum(
    debug: NativeHandle, viewProjection: readonly number[], color: number,
  ): void {
    this.mem.withMatrix(
      viewProjection,
      (viewProjectionPointer) => this.routes.invoke(
          "cna_debug_draw_add_frustum", debug, viewProjectionPointer, color,
      ),
    );
  }

  public override addDebugDrawCross(
    debug: NativeHandle, position: Vector3Snapshot, size: number, color: number,
  ): void {
    this.mem.withVector3(
      position,
      (positionPointer) => this.routes.invoke(
          "cna_debug_draw_add_cross", debug, positionPointer, size, color,
      ),
    );
  }

  public override isDebugDrawDepthTested(debug: NativeHandle): boolean {
    return this.mem.bool("cna_debug_draw_is_depth_tested", debug);
  }

  public override setDebugDrawDepthTested(debug: NativeHandle, value: boolean): void {
    this.routes.invoke("cna_debug_draw_set_depth_tested", debug, value ? 1 : 0);
  }

  public override getDebugDrawLineCount(debug: NativeHandle): number {
    return this.mem.int("cna_debug_draw_get_line_count", debug);
  }

  public override addDebugDrawProbeVolumeGizmo(
    debug: NativeHandle, volume: NativeHandle, color: number, crossSize: number,
  ): void {
    this.routes.invoke("cna_debug_draw_add_probe_volume_gizmo", debug, volume, color, crossSize);
  }

  public override addDebugDrawCascadeGizmo(
    debug: NativeHandle, cascades: NativeHandle, color: number,
  ): void {
    this.routes.invoke("cna_debug_draw_add_cascade_gizmo", debug, cascades, color);
  }

  public override createHdrDisplayOutput(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_hdr_display_output_create", graphicsDevice);
  }

  public override destroyHdrDisplayOutput(output: NativeHandle): void {
    this.routes.invoke("cna_hdr_display_output_destroy", output);
  }

  public override isHdrDisplayOutputSupported(output: NativeHandle): boolean {
    return this.mem.bool("cna_hdr_display_output_is_supported", output);
  }

  public override getHdrDisplayPaperWhiteNits(output: NativeHandle): number {
    return this.mem.float("cna_hdr_display_output_get_paper_white_nits", output);
  }

  public override setHdrDisplayPaperWhiteNits(output: NativeHandle, value: number): void {
    this.routes.invoke("cna_hdr_display_output_set_paper_white_nits", output, value);
  }

  public override getHdrDisplayPeakNits(output: NativeHandle): number {
    return this.mem.float("cna_hdr_display_output_get_peak_nits", output);
  }

  public override setHdrDisplayPeakNits(output: NativeHandle, value: number): void {
    this.routes.invoke("cna_hdr_display_output_set_peak_nits", output, value);
  }

  public override drawHdrDisplayOutput(
    output: NativeHandle, source: NativeHandle, destination: NativeHandle, width: number,
    height: number,
  ): void {
    this.routes.invoke(
      "cna_hdr_display_output_draw", output, source, destination, Math.trunc(width),
      Math.trunc(height),
    );
  }

  public override hdrEncodePq(nits: number): number {
    return this.mem.float("cna_hdr_display_output_encode_pq", nits);
  }

  public override hdrDecodePq(encoded: number): number {
    return this.mem.float("cna_hdr_display_output_decode_pq", encoded);
  }

  public override hdrRollOff(nits: number, peakNits: number): number {
    return this.mem.float("cna_hdr_display_output_roll_off", nits, peakNits);
  }

  public override hdrEncode(
    space: number, sceneLinear: Vector3Snapshot, paperWhiteNits: number, peakNits: number,
  ): Vector3Snapshot {
    return this.mem.withVector3(
      sceneLinear,
      (sceneLinearPointer) => this.mem.vector3(
          "cna_hdr_display_output_encode", space, sceneLinearPointer, paperWhiteNits, peakNits,
      ),
    );
  }

  public override createAutoExposure(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_auto_exposure_ext_create", graphicsDevice);
  }

  public override destroyAutoExposure(autoExposure: NativeHandle): void {
    this.routes.invoke("cna_auto_exposure_ext_destroy", autoExposure);
  }

  public override updateAutoExposure(
    autoExposure: NativeHandle, scene: NativeHandle, deltaSeconds: number,
  ): number {
    return this.mem.float("cna_auto_exposure_ext_update", autoExposure, scene, deltaSeconds);
  }

  public override getAutoExposureExposure(autoExposure: NativeHandle): number {
    return this.mem.float("cna_auto_exposure_ext_get_exposure", autoExposure);
  }

  public override setAutoExposureExposure(autoExposure: NativeHandle, value: number): void {
    this.routes.invoke("cna_auto_exposure_ext_set_exposure", autoExposure, value);
  }

  public override getAutoExposureKeyValue(autoExposure: NativeHandle): number {
    return this.mem.float("cna_auto_exposure_ext_get_key_value", autoExposure);
  }

  public override setAutoExposureKeyValue(autoExposure: NativeHandle, value: number): void {
    this.routes.invoke("cna_auto_exposure_ext_set_key_value", autoExposure, value);
  }

  public override getAutoExposureBrighteningSpeed(autoExposure: NativeHandle): number {
    return this.mem.float("cna_auto_exposure_ext_get_brightening_speed", autoExposure);
  }

  public override getAutoExposureDarkeningSpeed(autoExposure: NativeHandle): number {
    return this.mem.float("cna_auto_exposure_ext_get_darkening_speed", autoExposure);
  }

  public override addPipelineUserPass(pipeline: NativeHandle, pass: NativeHandle): void {
    this.routes.invoke("cna_render_pipeline_add_user_pass", pipeline, pass);
  }

  public override clearPipelineUserPasses(pipeline: NativeHandle): void {
    this.routes.invoke("cna_render_pipeline_clear_user_passes", pipeline);
  }

  public override getPipelineTransparencyFallbackReason(pipeline: NativeHandle): string {
    return this.mem.probedString(
      "cna_render_pipeline_copy_transparency_fallback_reason_ext", pipeline,
    );
  }

  public override setPipelineGpuTimingEnabled(pipeline: NativeHandle, value: boolean): void {
    this.routes.invoke("cna_render_pipeline_set_gpu_timing_enabled_ext", pipeline, value ? 1 : 0);
  }

  public override isPipelineGpuTimingEnabled(pipeline: NativeHandle): boolean {
    return this.mem.bool("cna_render_pipeline_is_gpu_timing_enabled_ext", pipeline);
  }

  public override didPipelineSkyboxDraw(pipeline: NativeHandle): boolean {
    return this.mem.bool("cna_render_pipeline_did_skybox_draw", pipeline);
  }

  public override didPipelineShadowPassRun(pipeline: NativeHandle): boolean {
    return this.mem.bool("cna_render_pipeline_did_shadow_pass_run", pipeline);
  }

  public override getPipelineShadowMap(pipeline: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_render_pipeline_get_shadow_map", pipeline);
  }

  public override getPipelineSceneTarget(pipeline: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_render_pipeline_get_scene_target", pipeline);
  }

  public override isPipelineUsingSceneTarget(pipeline: NativeHandle): boolean {
    return this.mem.bool("cna_render_pipeline_is_using_scene_target", pipeline);
  }

  public override releasePipelineDeviceResources(pipeline: NativeHandle): void {
    this.routes.invoke("cna_render_pipeline_release_device_resources_ext", pipeline);
  }

  public override createClusteredLightBuffer(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_clustered_light_buffer_create", graphicsDevice);
  }

  public override destroyClusteredLightBuffer(buffer: NativeHandle): void {
    this.routes.invoke("cna_clustered_light_buffer_destroy", buffer);
  }

  public override uploadClusteredLightBuffer(
    buffer: NativeHandle, lights: NativeHandle, grid: NativeHandle, assignment: NativeHandle,
  ): void {
    this.routes.invoke("cna_clustered_light_buffer_upload", buffer, lights, grid, assignment);
  }

  public override bindClusteredLightBuffer(
    buffer: NativeHandle, effect: NativeHandle, firstUnit: number,
  ): void {
    this.routes.invoke("cna_clustered_light_buffer_bind", buffer, effect, Math.trunc(firstUnit));
  }

  public override isClusteredLightBufferUploaded(buffer: NativeHandle): boolean {
    return this.mem.bool("cna_clustered_light_buffer_is_uploaded", buffer);
  }

  public override getClusteredLightBufferLightCount(buffer: NativeHandle): number {
    return this.mem.int("cna_clustered_light_buffer_get_light_count", buffer);
  }

  public override getClusteredLightBufferClusterCount(buffer: NativeHandle): number {
    return this.mem.int("cna_clustered_light_buffer_get_cluster_count", buffer);
  }

  public override getClusteredLightBufferReferenceCount(buffer: NativeHandle): number {
    return this.mem.int("cna_clustered_light_buffer_get_reference_count", buffer);
  }

  public override createClusteredLightCompute(
    graphicsDevice: NativeHandle, stride: number,
  ): NativeHandle {
    return this.routes.outHandle(
      "cna_clustered_light_compute_create", graphicsDevice, Math.trunc(stride),
    );
  }

  public override destroyClusteredLightCompute(compute: NativeHandle): void {
    this.routes.invoke("cna_clustered_light_compute_destroy", compute);
  }

  public override isClusteredLightComputeSupported(compute: NativeHandle): boolean {
    return this.mem.bool("cna_clustered_light_compute_is_supported", compute);
  }

  public override getClusteredLightComputeUnsupportedReason(compute: NativeHandle): string {
    return this.mem.probedString("cna_clustered_light_compute_copy_unsupported_reason", compute);
  }

  public override getClusteredLightComputeStride(compute: NativeHandle): number {
    return this.mem.int("cna_clustered_light_compute_get_stride", compute);
  }

  public override didClusteredLightComputeUseCompute(compute: NativeHandle): boolean {
    return this.mem.bool("cna_clustered_light_compute_used_compute", compute);
  }

  public override hasClusteredLightComputeOverflowed(compute: NativeHandle): boolean {
    return this.mem.bool("cna_clustered_light_compute_has_overflowed", compute);
  }

  public override createClusteredForwardEffect(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_clustered_forward_effect_create", graphicsDevice);
  }

  public override destroyClusteredForwardEffect(effect: NativeHandle): void {
    this.routes.invoke("cna_clustered_forward_effect_destroy", effect);
  }

  public override isClusteredForwardEffectSupported(effect: NativeHandle): boolean {
    return this.mem.bool("cna_clustered_forward_effect_is_supported", effect);
  }

  public override getClusteredForwardShader(effect: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_clustered_forward_effect_get_effect", effect);
  }

  public override getClusteredForwardBaseColor(effect: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_clustered_forward_effect_get_base_color", effect);
  }

  public override setClusteredForwardBaseColor(effect: NativeHandle, color: Vector3Snapshot): void {
    this.mem.withVector3(
      color,
      (colorPointer) => this.routes.invoke(
          "cna_clustered_forward_effect_set_base_color", effect, colorPointer,
      ),
    );
  }

  public override getClusteredForwardMetallic(effect: NativeHandle): number {
    return this.mem.float("cna_clustered_forward_effect_get_metallic", effect);
  }

  public override setClusteredForwardMetallic(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_clustered_forward_effect_set_metallic", effect, value);
  }

  public override getClusteredForwardRoughness(effect: NativeHandle): number {
    return this.mem.float("cna_clustered_forward_effect_get_roughness", effect);
  }

  public override setClusteredForwardRoughness(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_clustered_forward_effect_set_roughness", effect, value);
  }

  public override getClusteredForwardIor(effect: NativeHandle): number {
    return this.mem.float("cna_clustered_forward_effect_get_ior", effect);
  }

  public override setClusteredForwardIor(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_clustered_forward_effect_set_ior", effect, value);
  }

  public override getClusteredForwardAmbient(effect: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_clustered_forward_effect_get_ambient", effect);
  }

  public override setClusteredForwardAmbient(effect: NativeHandle, value: Vector3Snapshot): void {
    this.mem.withVector3(
      value,
      (valuePointer) => this.routes.invoke(
          "cna_clustered_forward_effect_set_ambient", effect, valuePointer,
      ),
    );
  }

  public override getClusteredForwardOpaqueFrame(effect: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_clustered_forward_effect_get_opaque_frame", effect);
  }

  public override getClusteredForwardMaterialExtensions(effect: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_clustered_forward_effect_get_material_extensions", effect);
  }

  public override setClusteredForwardMaterialExtensions(
    effect: NativeHandle, extensions: NativeHandle,
  ): void {
    this.routes.invoke("cna_clustered_forward_effect_set_material_extensions", effect, extensions);
  }

  public override hasClusteredForwardLightProbe(effect: NativeHandle): boolean {
    return this.mem.bool("cna_clustered_forward_effect_has_light_probe", effect);
  }

  public override clearClusteredForwardLightProbe(effect: NativeHandle): void {
    this.routes.invoke("cna_clustered_forward_effect_clear_light_probe", effect);
  }

  public override setClusteredForwardLightProbe(effect: NativeHandle, probe: NativeHandle): void {
    this.routes.invoke("cna_clustered_forward_effect_set_light_probe", effect, probe);
  }

  public override setClusteredForwardLightProbeVolume(
    effect: NativeHandle, volume: NativeHandle,
  ): void {
    this.routes.invoke("cna_clustered_forward_effect_set_light_probe_volume", effect, volume);
  }

  public override createAreaLightBrdfTable(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_area_light_brdf_table_create", graphicsDevice);
  }

  public override destroyAreaLightBrdfTable(table: NativeHandle): void {
    this.routes.invoke("cna_area_light_brdf_table_destroy", table);
  }

  public override getAreaLightBrdfTableTexture(table: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_area_light_brdf_table_get_texture", table);
  }

  public override getAreaLightBrdfTableSize(table: NativeHandle): number {
    return this.mem.int("cna_area_light_brdf_table_get_size", table);
  }

  public override getAreaLightBrdfTableSampleCount(table: NativeHandle): number {
    return this.mem.int("cna_area_light_brdf_table_get_sample_count", table);
  }

  public override getAreaLightBrdfLookupGlsl(): string {
    return this.mem.probedString("cna_area_light_brdf_table_copy_lookup_glsl");
  }

  public override getAreaLightLobeScale(roughness: number): number {
    return this.mem.float("cna_area_light_shading_lobe_scale_for", roughness);
  }

  public override getAreaLightShadingGlsl(): string {
    return this.mem.probedString("cna_area_light_shading_copy_shading_glsl");
  }

  public override hasClusteredForwardAreaLight(effect: NativeHandle): boolean {
    return this.mem.bool("cna_clustered_forward_effect_has_area_light", effect);
  }

  public override clearClusteredForwardAreaLight(effect: NativeHandle): void {
    this.routes.invoke("cna_clustered_forward_effect_clear_area_light", effect);
  }

  public override createTransparentDrawList(): NativeHandle {
    return this.routes.outHandle("cna_transparent_draw_list_create");
  }

  public override destroyTransparentDrawList(list: NativeHandle): void {
    this.routes.invoke("cna_transparent_draw_list_destroy", list);
  }

  public override clearTransparentDrawList(list: NativeHandle): void {
    this.routes.invoke("cna_transparent_draw_list_clear", list);
  }

  public override getTransparentDrawListCount(list: NativeHandle): number {
    return this.mem.u64AsNumber("cna_transparent_draw_list_get_count", list);
  }

  public override drawTransparentDrawListSorted(list: NativeHandle, view: readonly number[]): void {
    this.mem.withMatrix(
      view,
      (viewPointer) => this.routes.invoke(
          "cna_transparent_draw_list_draw_sorted", list, viewPointer,
      ),
    );
  }

  public override destroyWeightedBlendedTransparency(transparency: NativeHandle): void {
    this.routes.invoke("cna_weighted_blended_transparency_destroy", transparency);
  }

  public override isWeightedBlendedTransparencySupported(transparency: NativeHandle): boolean {
    return this.mem.bool("cna_weighted_blended_transparency_is_supported", transparency);
  }

  public override getWeightedBlendedTransparencyUnsupportedReason(
    transparency: NativeHandle,
  ): string {
    return this.mem.probedString(
      "cna_weighted_blended_transparency_copy_unsupported_reason", transparency,
    );
  }

  public override resizeWeightedBlendedTransparency(
    transparency: NativeHandle, width: number, height: number,
  ): void {
    this.routes.invoke(
      "cna_weighted_blended_transparency_resize", transparency, Math.trunc(width),
      Math.trunc(height),
    );
  }

  public override endWeightedBlendedTransparency(transparency: NativeHandle): void {
    this.routes.invoke("cna_weighted_blended_transparency_end", transparency);
  }

  public override resolveWeightedBlendedTransparency(
    transparency: NativeHandle, width: number, height: number,
  ): void {
    this.routes.invoke(
      "cna_weighted_blended_transparency_resolve", transparency, Math.trunc(width),
      Math.trunc(height),
    );
  }

  public override isWeightedBlendedTransparencyAccumulating(transparency: NativeHandle): boolean {
    return this.mem.bool("cna_weighted_blended_transparency_is_accumulating", transparency);
  }

  public override getWeightedBlendedAccumulationTexture(transparency: NativeHandle): NativeHandle {
    return this.routes.outHandle(
      "cna_weighted_blended_transparency_get_accumulation_texture_ext", transparency,
    );
  }

  public override getWeightedBlendedRevealageTexture(transparency: NativeHandle): NativeHandle {
    return this.routes.outHandle(
      "cna_weighted_blended_transparency_get_revealage_texture_ext", transparency,
    );
  }

  public override isShaderEffectValid(effect: NativeHandle): boolean {
    return this.mem.bool("cna_shader_effect_is_valid", effect);
  }

  public override shaderEffectHasRenderer(effect: NativeHandle): boolean {
    return this.mem.bool("cna_shader_effect_has_renderer", effect);
  }

  public override getShaderEffectCompileError(effect: NativeHandle): string {
    return this.mem.probedString("cna_shader_effect_copy_compile_error_ext", effect);
  }

  public override setShaderEffectUniformFloat(
    effect: NativeHandle, name: string, value: number,
  ): void {
    this.mem.withStringView(
      name,
      (namePointer) => this.routes.invoke(
          "cna_shader_effect_set_uniform_float", effect, namePointer, value,
      ),
    );
  }

  public override setShaderEffectUniformInt32(
    effect: NativeHandle, name: string, value: number,
  ): void {
    this.mem.withStringView(
      name,
      (namePointer) => this.routes.invoke(
          "cna_shader_effect_set_uniform_int32", effect, namePointer, Math.trunc(value),
      ),
    );
  }

  public override setShaderEffectTexture2D(
    effect: NativeHandle, unit: number, texture: NativeHandle,
  ): void {
    this.routes.invoke("cna_shader_effect_set_texture2d", effect, Math.trunc(unit), texture);
  }

  public override setShaderEffectTextureCube(
    effect: NativeHandle, unit: number, texture: NativeHandle,
  ): void {
    this.routes.invoke("cna_shader_effect_set_texture_cube", effect, Math.trunc(unit), texture);
  }

  public override setShaderEffectTexture3D(
    effect: NativeHandle, unit: number, texture: NativeHandle,
  ): void {
    this.routes.invoke("cna_shader_effect_set_texture3d", effect, Math.trunc(unit), texture);
  }

  public override getShaderEffectWorld(effect: NativeHandle): readonly number[] {
    return this.mem.matrix("cna_shader_effect_get_world", effect);
  }

  public override setShaderEffectWorld(effect: NativeHandle, value: readonly number[]): void {
    this.mem.withMatrix(
      value,
      (valuePointer) => this.routes.invoke("cna_shader_effect_set_world", effect, valuePointer),
    );
  }

  public override getShaderEffectView(effect: NativeHandle): readonly number[] {
    return this.mem.matrix("cna_shader_effect_get_view", effect);
  }

  public override setShaderEffectView(effect: NativeHandle, value: readonly number[]): void {
    this.mem.withMatrix(
      value,
      (valuePointer) => this.routes.invoke("cna_shader_effect_set_view", effect, valuePointer),
    );
  }

  public override getShaderEffectProjection(effect: NativeHandle): readonly number[] {
    return this.mem.matrix("cna_shader_effect_get_projection", effect);
  }

  public override setShaderEffectProjection(effect: NativeHandle, value: readonly number[]): void {
    this.mem.withMatrix(
      value,
      (valuePointer) => this.routes.invoke(
          "cna_shader_effect_set_projection", effect, valuePointer,
      ),
    );
  }

  public override createRenderTargetPool(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_render_target_pool_create", graphicsDevice);
  }

  public override acquirePooledRenderTarget(
    pool: NativeHandle, width: number, height: number, format: number, depthFormat: number,
    slot: number,
  ): NativeHandle {
    return this.routes.outHandle(
      "cna_render_target_pool_acquire", pool, Math.trunc(width), Math.trunc(height), format,
      depthFormat, Math.trunc(slot),
    );
  }

  public override resetRenderTargetPool(pool: NativeHandle): void {
    this.routes.invoke("cna_render_target_pool_reset", pool);
  }

  public override destroyRenderTargetPool(pool: NativeHandle): void {
    this.routes.invoke("cna_render_target_pool_destroy", pool);
  }

  public override createShaderEffectFactory(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_shader_effect_factory_create", graphicsDevice);
  }

  public override shaderEffectFactoryContains(factory: NativeHandle, name: string): boolean {
    return this.mem.withStringView(
      name,
      (namePointer) => this.mem.bool("cna_shader_effect_factory_contains", factory, namePointer),
    );
  }

  public override clearShaderEffectFactory(factory: NativeHandle): void {
    this.routes.invoke("cna_shader_effect_factory_clear", factory);
  }

  public override destroyShaderEffectFactory(factory: NativeHandle): void {
    this.routes.invoke("cna_shader_effect_factory_destroy", factory);
  }

  public override setEffectShadowsEnabled(effect: NativeHandle, value: boolean): void {
    this.routes.invoke("cna_effect_set_shadows_enabled_ext", effect, value ? 1 : 0);
  }

  public override isEffectShadowsEnabled(effect: NativeHandle): boolean {
    return this.mem.bool("cna_effect_is_shadows_enabled_ext", effect);
  }

  public override setEffectShadowDepthBias(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_effect_set_shadow_depth_bias_ext", effect, value);
  }

  public override getEffectShadowDepthBias(effect: NativeHandle): number {
    return this.mem.float("cna_effect_get_shadow_depth_bias_ext", effect);
  }

  public override setEffectShadowFilterRadius(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_effect_set_shadow_filter_radius_ext", effect, Math.trunc(value));
  }

  public override getEffectShadowFilterRadius(effect: NativeHandle): number {
    return this.mem.int("cna_effect_get_shadow_filter_radius_ext", effect);
  }

  public override setEffectShadowMap(effect: NativeHandle, shadowMap: NativeHandle): void {
    this.routes.invoke("cna_effect_set_shadow_map_ext", effect, shadowMap);
  }

  public override getEffectShadowMap(effect: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_effect_get_shadow_map_ext", effect);
  }

  public override graphicsMemoryBarrierHas(mask: number, bit: number): boolean {
    return this.mem.bool("cna_graphics_memory_barrier_has", mask, bit);
  }

  public override getPostProcessChainTargetPool(chain: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_post_process_chain_get_target_pool", chain);
  }

  public override loadCubeLutFromFile(path: string): NativeHandle {
    return this.mem.withStringView(
      path, (pathPointer) => this.routes.outHandle("cna_cube_lut_load_from_file", pathPointer),
    );
  }

  public override getEngineLayerVersion(): number {
    return this.mem.int("cna_engine_layer_get_version");
  }

  public override getEngineLayerVersionString(): string {
    return this.mem.probedString("cna_engine_layer_copy_version_string");
  }

  public override createPbrMaterialExtensions(): NativeHandle {
    return this.routes.outHandle("cna_pbr_material_extensions_create");
  }

  public override destroyPbrMaterialExtensions(extensions: NativeHandle): void {
    this.routes.invoke("cna_pbr_material_extensions_destroy", extensions);
  }

  public override copyPbrMaterialExtensionsFrom(
    destination: NativeHandle, source: NativeHandle,
  ): void {
    this.routes.invoke("cna_pbr_material_extensions_copy_from", destination, source);
  }

  public override pbrMaterialExtensionsEquals(first: NativeHandle, second: NativeHandle): boolean {
    return this.mem.bool("cna_pbr_material_extensions_equals", first, second);
  }

  public override createPbrEffect(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_pbr_effect_create", graphicsDevice);
  }

  public override createSkinnedPbrEffect(graphicsDevice: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_skinned_pbr_effect_create", graphicsDevice);
  }

  public override getPbrEffectAlpha(effect: NativeHandle): number {
    return this.mem.float("cna_pbr_effect_get_alpha", effect);
  }

  public override getPbrEffectAlphaCutoff(effect: NativeHandle): number {
    return this.mem.float("cna_pbr_effect_get_alpha_cutoff_ext", effect);
  }

  public override getPbrEffectAlphaMode(effect: NativeHandle): number {
    return this.mem.u32("cna_pbr_effect_get_alpha_mode_ext", effect);
  }

  public override getPbrEffectDiffuseColor(effect: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_pbr_effect_get_diffuse_color", effect);
  }

  public override getPbrEffectDoubleSided(effect: NativeHandle): boolean {
    return this.mem.bool("cna_pbr_effect_get_double_sided_ext", effect);
  }

  public override getPbrEffectEmissiveFactor(effect: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_pbr_effect_get_emissive_factor", effect);
  }

  public override getPbrEffectEncodeOutputToSrgb(effect: NativeHandle): boolean {
    return this.mem.bool("cna_pbr_effect_get_encode_output_to_srgb_ext", effect);
  }

  public override getPbrEffectIor(effect: NativeHandle): number {
    return this.mem.float("cna_pbr_effect_get_ior_ext", effect);
  }

  public override getPbrEffectMetallicFactor(effect: NativeHandle): number {
    return this.mem.float("cna_pbr_effect_get_metallic_factor", effect);
  }

  public override getPbrEffectNormalScale(effect: NativeHandle): number {
    return this.mem.float("cna_pbr_effect_get_normal_scale_ext", effect);
  }

  public override getPbrEffectOcclusionStrength(effect: NativeHandle): number {
    return this.mem.float("cna_pbr_effect_get_occlusion_strength_ext", effect);
  }

  public override getPbrEffectRoughnessFactor(effect: NativeHandle): number {
    return this.mem.float("cna_pbr_effect_get_roughness_factor", effect);
  }

  public override getPbrEffectSpecularColorFactor(effect: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_pbr_effect_get_specular_color_factor_ext", effect);
  }

  public override getPbrEffectSpecularFactor(effect: NativeHandle): number {
    return this.mem.float("cna_pbr_effect_get_specular_factor_ext", effect);
  }

  /**
   * A texture slot, which answers **whether there is one** and then which -- two outputs, not one.
   *
   * A slot need not hold a texture, and CNA says so with a separate `CNA_Bool` rather than with an
   * invalid handle. Reading only the handle would turn "no texture" into whatever the allocation
   * held; an empty slot is `CNA_INVALID_HANDLE` here, which is what the public API reads as none.
   */
  public override getPbrEffectTexture(effect: NativeHandle, slot: number): NativeHandle {
    const scope = this.routes.scope();
    try {
      const present = scope.allocate(4);
      const handle = scope.allocate(8);
      this.routes.invoke("cna_pbr_effect_get_texture", effect, slot, present, handle);
      if (this.routes.view().getUint8(present) === 0) return 0n;
      return this.routes.view().getBigUint64(handle, true);
    } finally {
      scope.dispose();
    }
  }

  public override getPbrEffectVertexColorEnabled(effect: NativeHandle): boolean {
    return this.mem.bool("cna_pbr_effect_get_vertex_color_enabled_ext", effect);
  }

  public override getSkinnedPbrEffectWeightsPerVertex(effect: NativeHandle): number {
    return this.mem.int("cna_skinned_pbr_effect_get_weights_per_vertex", effect);
  }

  public override setPbrEffectAlpha(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_effect_set_alpha", effect, value);
  }

  public override setPbrEffectAlphaCutoff(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_effect_set_alpha_cutoff_ext", effect, value);
  }

  public override setPbrEffectAlphaMode(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_effect_set_alpha_mode_ext", effect, value);
  }

  public override setPbrEffectDiffuseColor(effect: NativeHandle, value: Vector3Snapshot): void {
    this.mem.withVector3(
      value,
      (valuePointer) => this.routes.invoke(
          "cna_pbr_effect_set_diffuse_color", effect, valuePointer,
      ),
    );
  }

  public override setPbrEffectDoubleSided(effect: NativeHandle, value: boolean): void {
    this.routes.invoke("cna_pbr_effect_set_double_sided_ext", effect, value ? 1 : 0);
  }

  public override setPbrEffectEmissiveFactor(effect: NativeHandle, value: Vector3Snapshot): void {
    this.mem.withVector3(
      value,
      (valuePointer) => this.routes.invoke(
          "cna_pbr_effect_set_emissive_factor", effect, valuePointer,
      ),
    );
  }

  public override setPbrEffectEncodeOutputToSrgb(effect: NativeHandle, value: boolean): void {
    this.routes.invoke("cna_pbr_effect_set_encode_output_to_srgb_ext", effect, value ? 1 : 0);
  }

  public override setPbrEffectIor(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_effect_set_ior_ext", effect, value);
  }

  public override setPbrEffectMetallicFactor(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_effect_set_metallic_factor", effect, value);
  }

  public override setPbrEffectNormalScale(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_effect_set_normal_scale_ext", effect, value);
  }

  public override setPbrEffectOcclusionStrength(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_effect_set_occlusion_strength_ext", effect, value);
  }

  public override setPbrEffectRoughnessFactor(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_effect_set_roughness_factor", effect, value);
  }

  public override setPbrEffectSpecularColorFactor(
    effect: NativeHandle, value: Vector3Snapshot,
  ): void {
    this.mem.withVector3(
      value,
      (valuePointer) => this.routes.invoke(
          "cna_pbr_effect_set_specular_color_factor_ext", effect, valuePointer,
      ),
    );
  }

  public override setPbrEffectSpecularFactor(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_effect_set_specular_factor_ext", effect, value);
  }

  public override setPbrEffectTexture(
    effect: NativeHandle, slot: number, texture: NativeHandle,
  ): void {
    this.routes.invoke("cna_pbr_effect_set_texture", effect, slot, texture);
  }

  public override setPbrEffectVertexColorEnabled(effect: NativeHandle, value: boolean): void {
    this.routes.invoke("cna_pbr_effect_set_vertex_color_enabled_ext", effect, value ? 1 : 0);
  }

  public override setSkinnedPbrEffectWeightsPerVertex(effect: NativeHandle, value: number): void {
    this.routes.invoke("cna_skinned_pbr_effect_set_weights_per_vertex", effect, Math.trunc(value));
  }

  public override getPbrExtensionAttenuationColor(extensions: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_pbr_material_extensions_get_attenuation_color", extensions);
  }

  public override getPbrExtensionAttenuationDistance(extensions: NativeHandle): number {
    return this.mem.float("cna_pbr_material_extensions_get_attenuation_distance", extensions);
  }

  public override getPbrExtensionClearcoatFactor(extensions: NativeHandle): number {
    return this.mem.float("cna_pbr_material_extensions_get_clearcoat_factor", extensions);
  }

  public override getPbrExtensionClearcoatNormalScale(extensions: NativeHandle): number {
    return this.mem.float("cna_pbr_material_extensions_get_clearcoat_normal_scale", extensions);
  }

  public override getPbrExtensionClearcoatNormalTexture(extensions: NativeHandle): NativeHandle {
    return this.routes.outHandle(
      "cna_pbr_material_extensions_get_clearcoat_normal_texture", extensions,
    );
  }

  public override getPbrExtensionClearcoatRoughness(extensions: NativeHandle): number {
    return this.mem.float("cna_pbr_material_extensions_get_clearcoat_roughness", extensions);
  }

  public override getPbrExtensionClearcoatRoughnessTexture(extensions: NativeHandle): NativeHandle {
    return this.routes.outHandle(
      "cna_pbr_material_extensions_get_clearcoat_roughness_texture", extensions,
    );
  }

  public override getPbrExtensionClearcoatTexture(extensions: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_pbr_material_extensions_get_clearcoat_texture", extensions);
  }

  public override getPbrExtensionIridescenceFactor(extensions: NativeHandle): number {
    return this.mem.float("cna_pbr_material_extensions_get_iridescence_factor", extensions);
  }

  public override getPbrExtensionIridescenceIor(extensions: NativeHandle): number {
    return this.mem.float("cna_pbr_material_extensions_get_iridescence_ior", extensions);
  }

  public override getPbrExtensionIridescenceTexture(extensions: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_pbr_material_extensions_get_iridescence_texture", extensions);
  }

  public override getPbrExtensionIridescenceThicknessMaximum(extensions: NativeHandle): number {
    return this.mem.float(
      "cna_pbr_material_extensions_get_iridescence_thickness_maximum", extensions,
    );
  }

  public override getPbrExtensionIridescenceThicknessMinimum(extensions: NativeHandle): number {
    return this.mem.float(
      "cna_pbr_material_extensions_get_iridescence_thickness_minimum", extensions,
    );
  }

  public override getPbrExtensionIridescenceThicknessTexture(
    extensions: NativeHandle,
  ): NativeHandle {
    return this.routes.outHandle(
      "cna_pbr_material_extensions_get_iridescence_thickness_texture", extensions,
    );
  }

  public override getPbrExtensionSheenColorFactor(extensions: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_pbr_material_extensions_get_sheen_color_factor", extensions);
  }

  public override getPbrExtensionSheenColorTexture(extensions: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_pbr_material_extensions_get_sheen_color_texture", extensions);
  }

  public override getPbrExtensionSheenRoughness(extensions: NativeHandle): number {
    return this.mem.float("cna_pbr_material_extensions_get_sheen_roughness", extensions);
  }

  public override getPbrExtensionSheenRoughnessTexture(extensions: NativeHandle): NativeHandle {
    return this.routes.outHandle(
      "cna_pbr_material_extensions_get_sheen_roughness_texture", extensions,
    );
  }

  public override getPbrExtensionSubsurfaceColor(extensions: NativeHandle): Vector3Snapshot {
    return this.mem.vector3("cna_pbr_material_extensions_get_subsurface_color", extensions);
  }

  public override getPbrExtensionSubsurfaceWrap(extensions: NativeHandle): number {
    return this.mem.float("cna_pbr_material_extensions_get_subsurface_wrap", extensions);
  }

  public override getPbrExtensionThicknessFactor(extensions: NativeHandle): number {
    return this.mem.float("cna_pbr_material_extensions_get_thickness_factor", extensions);
  }

  public override getPbrExtensionThicknessTexture(extensions: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_pbr_material_extensions_get_thickness_texture", extensions);
  }

  public override getPbrExtensionTransmissionFactor(extensions: NativeHandle): number {
    return this.mem.float("cna_pbr_material_extensions_get_transmission_factor", extensions);
  }

  public override getPbrExtensionTransmissionTexture(extensions: NativeHandle): NativeHandle {
    return this.routes.outHandle(
      "cna_pbr_material_extensions_get_transmission_texture", extensions,
    );
  }

  public override pbrExtensionIsIridescenceEnabled(extensions: NativeHandle): boolean {
    return this.mem.bool("cna_pbr_material_extensions_is_iridescence_enabled", extensions);
  }

  public override pbrExtensionIsNeutral(extensions: NativeHandle): boolean {
    return this.mem.bool("cna_pbr_material_extensions_is_neutral", extensions);
  }

  public override pbrExtensionIsSheenEnabled(extensions: NativeHandle): boolean {
    return this.mem.bool("cna_pbr_material_extensions_is_sheen_enabled", extensions);
  }

  public override pbrExtensionIsSubsurfaceEnabled(extensions: NativeHandle): boolean {
    return this.mem.bool("cna_pbr_material_extensions_is_subsurface_enabled", extensions);
  }

  public override pbrExtensionIsTransmissionEnabled(extensions: NativeHandle): boolean {
    return this.mem.bool("cna_pbr_material_extensions_is_transmission_enabled", extensions);
  }

  public override setPbrExtensionAttenuationColor(
    extensions: NativeHandle, value: Vector3Snapshot,
  ): void {
    this.mem.withVector3(
      value,
      (valuePointer) => this.routes.invoke(
          "cna_pbr_material_extensions_set_attenuation_color", extensions, valuePointer,
      ),
    );
  }

  public override setPbrExtensionAttenuationDistance(
    extensions: NativeHandle, value: number,
  ): void {
    this.routes.invoke("cna_pbr_material_extensions_set_attenuation_distance", extensions, value);
  }

  public override setPbrExtensionClearcoatFactor(extensions: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_material_extensions_set_clearcoat_factor", extensions, value);
  }

  public override setPbrExtensionClearcoatNormalScale(
    extensions: NativeHandle, value: number,
  ): void {
    this.routes.invoke("cna_pbr_material_extensions_set_clearcoat_normal_scale", extensions, value);
  }

  public override setPbrExtensionClearcoatNormalTexture(
    extensions: NativeHandle, texture: NativeHandle,
  ): void {
    this.routes.invoke(
      "cna_pbr_material_extensions_set_clearcoat_normal_texture", extensions, texture,
    );
  }

  public override setPbrExtensionClearcoatRoughness(extensions: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_material_extensions_set_clearcoat_roughness", extensions, value);
  }

  public override setPbrExtensionClearcoatRoughnessTexture(
    extensions: NativeHandle, texture: NativeHandle,
  ): void {
    this.routes.invoke(
      "cna_pbr_material_extensions_set_clearcoat_roughness_texture", extensions, texture,
    );
  }

  public override setPbrExtensionClearcoatTexture(
    extensions: NativeHandle, texture: NativeHandle,
  ): void {
    this.routes.invoke("cna_pbr_material_extensions_set_clearcoat_texture", extensions, texture);
  }

  public override setPbrExtensionIridescenceFactor(extensions: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_material_extensions_set_iridescence_factor", extensions, value);
  }

  public override setPbrExtensionIridescenceIor(extensions: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_material_extensions_set_iridescence_ior", extensions, value);
  }

  public override setPbrExtensionIridescenceTexture(
    extensions: NativeHandle, texture: NativeHandle,
  ): void {
    this.routes.invoke("cna_pbr_material_extensions_set_iridescence_texture", extensions, texture);
  }

  public override setPbrExtensionIridescenceThicknessMaximum(
    extensions: NativeHandle, value: number,
  ): void {
    this.routes.invoke(
      "cna_pbr_material_extensions_set_iridescence_thickness_maximum", extensions, value,
    );
  }

  public override setPbrExtensionIridescenceThicknessMinimum(
    extensions: NativeHandle, value: number,
  ): void {
    this.routes.invoke(
      "cna_pbr_material_extensions_set_iridescence_thickness_minimum", extensions, value,
    );
  }

  public override setPbrExtensionIridescenceThicknessTexture(
    extensions: NativeHandle, texture: NativeHandle,
  ): void {
    this.routes.invoke(
      "cna_pbr_material_extensions_set_iridescence_thickness_texture", extensions, texture,
    );
  }

  public override setPbrExtensionSheenColorFactor(
    extensions: NativeHandle, value: Vector3Snapshot,
  ): void {
    this.mem.withVector3(
      value,
      (valuePointer) => this.routes.invoke(
          "cna_pbr_material_extensions_set_sheen_color_factor", extensions, valuePointer,
      ),
    );
  }

  public override setPbrExtensionSheenColorTexture(
    extensions: NativeHandle, texture: NativeHandle,
  ): void {
    this.routes.invoke("cna_pbr_material_extensions_set_sheen_color_texture", extensions, texture);
  }

  public override setPbrExtensionSheenRoughness(extensions: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_material_extensions_set_sheen_roughness", extensions, value);
  }

  public override setPbrExtensionSheenRoughnessTexture(
    extensions: NativeHandle, texture: NativeHandle,
  ): void {
    this.routes.invoke(
      "cna_pbr_material_extensions_set_sheen_roughness_texture", extensions, texture,
    );
  }

  public override setPbrExtensionSubsurfaceColor(
    extensions: NativeHandle, value: Vector3Snapshot,
  ): void {
    this.mem.withVector3(
      value,
      (valuePointer) => this.routes.invoke(
          "cna_pbr_material_extensions_set_subsurface_color", extensions, valuePointer,
      ),
    );
  }

  public override setPbrExtensionSubsurfaceWrap(extensions: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_material_extensions_set_subsurface_wrap", extensions, value);
  }

  public override setPbrExtensionThicknessFactor(extensions: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_material_extensions_set_thickness_factor", extensions, value);
  }

  public override setPbrExtensionThicknessTexture(
    extensions: NativeHandle, texture: NativeHandle,
  ): void {
    this.routes.invoke("cna_pbr_material_extensions_set_thickness_texture", extensions, texture);
  }

  public override setPbrExtensionTransmissionFactor(extensions: NativeHandle, value: number): void {
    this.routes.invoke("cna_pbr_material_extensions_set_transmission_factor", extensions, value);
  }

  public override setPbrExtensionTransmissionTexture(
    extensions: NativeHandle, texture: NativeHandle,
  ): void {
    this.routes.invoke("cna_pbr_material_extensions_set_transmission_texture", extensions, texture);
  }
}
