// SPDX-License-Identifier: MS-PL
//
// The extended-graphics members whose arguments or answers are CNA structures.
//
// Seventeen structures cross this boundary -- a PBR material with twenty-five members, a pipeline
// settings block with forty-seven, two glTF sources, two light descriptions, a cascade state, a
// BRDF table entry, two indirect-draw argument blocks and a cullable instance -- and every one of
// them is **growable**: `struct_size` selects which fields CNA reads, so a zeroed buffer asks it to
// read a structure of no size. Every marshaller below therefore begins with CNA's own initializer.
//
// The marshallers are paired field by field between the C declaration and the TypeScript snapshot,
// by name, and the pairing is required to be **total in both directions**: a snapshot member with
// no field, or a field with no member, is an error rather than a silently dropped value. The one
// exception is `CNA_PbrMaterial`, whose defaults query answers a structure whose texture handles
// are always invalid and whose snapshot is the values half of it.
//
// Three naming facts had to be written down rather than worked around: CNA suffixes several fields
// `_ext` where the member has no suffix, spells one of them `doff_number`, and spells a `CNA_Bool`
// as one byte where its neighbouring enumeration is four.

import type {
  AreaLightBrdfTermsSnapshot, AreaLightSnapshot, BlendStateSnapshot, BoundingSphereSnapshot,
  ClusterBoundsSnapshot, ClusteredContributionSnapshot, ClusteredLightSnapshot,
  CullableInstanceSnapshot, DebugVertexSnapshot, DirectionalLightSnapshot,
  GltfExtensionSourceSnapshot, GltfExtensionTexturesSnapshot, GltfMaterialSourceSnapshot,
  GltfMaterialTexturesSnapshot, GpuCullableInstanceSnapshot, ImageBasedLightSnapshot,
  IndirectDrawArgumentsSnapshot, IndirectDrawIndexedArgumentsSnapshot, PbrMaterialDefaults,
  PbrMaterialExtSnapshot, PipelineSettingsSnapshot, PointLightSnapshot, PunctualLightSnapshot,
  RasterizerStateSnapshot, RenderPipelineSettingsDefaults, RenderPipelineStatisticsSnapshot,
  ShadowCascadeStateSnapshot, SpotLightSnapshot, TextureTransformSnapshot, Vector2Snapshot,
  Vector3Snapshot, Vector4Snapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmGraphicsExtensionCore } from "./graphics-ext-core.js";
import { WASM_CALLBACK_SIGNATURES, WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct, WasmStruct, type WasmScope } from "./module.js";

/** A `CNA_Vector2` nested inside a structure, read at its measured offset. */
function readVector2(structure: WasmStruct, field: string): Vector2Snapshot {
  const [X, Y] = structure.getF32Array(field) as [number, number];
  return { X, Y };
}

function writeVector2(structure: WasmStruct, field: string, value: Vector2Snapshot): void {
  structure.setF32Array(field, [value.X, value.Y]);
}

function readVector3(structure: WasmStruct, field: string): Vector3Snapshot {
  const [X, Y, Z] = structure.getF32Array(field) as [number, number, number];
  return { X, Y, Z };
}

function writeVector3(structure: WasmStruct, field: string, value: Vector3Snapshot): void {
  structure.setF32Array(field, [value.X, value.Y, value.Z]);
}

function readVector4(structure: WasmStruct, field: string): Vector4Snapshot {
  const [X, Y, Z, W] = structure.getF32Array(field) as [number, number, number, number];
  return { X, Y, Z, W };
}

function writeVector4(structure: WasmStruct, field: string, value: Vector4Snapshot): void {
  structure.setF32Array(field, [value.X, value.Y, value.Z, value.W]);
}

/** A `CNA_BoundingBox` nested inside a structure: two `CNA_Vector3`s at their own offsets. */
function readBounds(structure: WasmStruct, field: string): ClusterBoundsSnapshot {
  const values = structure.getF32Array(field);
  return {
    Min: { X: values[0] as number, Y: values[1] as number, Z: values[2] as number },
    Max: { X: values[3] as number, Y: values[4] as number, Z: values[5] as number },
  };
}

function writeBounds(structure: WasmStruct, field: string, value: ClusterBoundsSnapshot): void {
  structure.setF32Array(field, [
    value.Min.X, value.Min.Y, value.Min.Z, value.Max.X, value.Max.Y, value.Max.Z,
  ]);
}

export abstract class WasmEngineStructures extends WasmGraphicsExtensionCore {
  public override getDefaultPbrMaterial(): PbrMaterialDefaults {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocPbrMaterialDefaults(scope);
      this.routes.invoke("cna_pbr_material_init", structure.pointer);
      return this.#readPbrMaterialDefaults(structure);
    } finally {
      scope.dispose();
    }
  }

  public override getDefaultRenderPipelineSettings(): RenderPipelineSettingsDefaults {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocRenderPipelineSettingsDefaults(scope);
      this.routes.invoke("cna_render_pipeline_settings_init", structure.pointer);
      return this.#readRenderPipelineSettingsDefaults(structure);
    } finally {
      scope.dispose();
    }
  }

  public override getDefaultPbrMaterialExt(): PbrMaterialExtSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocPbrMaterialExt(scope);
      this.routes.invoke("cna_pbr_material_ext_init", structure.pointer);
      return this.#readPbrMaterialExt(structure);
    } finally {
      scope.dispose();
    }
  }

  public override getDefaultTextureTransform(): TextureTransformSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocTextureTransform(scope);
      this.routes.invoke("cna_texture_transform_ext_init", structure.pointer);
      return this.#readTextureTransform(structure);
    } finally {
      scope.dispose();
    }
  }

  public override getPbrMaterialExtText(material: PbrMaterialExtSnapshot): string {
    return this.#withPbrMaterialExt(
      material,
      (
        materialPointer) => this.mem.probedString("cna_pbr_material_ext_copy_to_string",
        materialPointer,
      ),
    );
  }

  public override applyPbrMaterialState(
    material: PbrMaterialExtSnapshot, device: NativeHandle,
  ): void {
    this.#withPbrMaterialExt(
      material,
      (
        materialPointer) => this.routes.invoke("cna_pbr_material_apply_state", materialPointer,
        device,
      ),
    );
  }

  public override getDefaultPipelineSettings(): PipelineSettingsSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocPipelineSettings(scope);
      this.routes.invoke("cna_render_pipeline_settings_ext_init", structure.pointer);
      return this.#readPipelineSettings(structure);
    } finally {
      scope.dispose();
    }
  }

  public override getPipelineSettings(pipeline: NativeHandle): PipelineSettingsSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocPipelineSettings(scope);
      this.routes.invoke("cna_render_pipeline_get_settings", pipeline, structure.pointer);
      return this.#readPipelineSettings(structure);
    } finally {
      scope.dispose();
    }
  }

  public override setPipelineSettings(
    pipeline: NativeHandle, settings: PipelineSettingsSnapshot,
  ): void {
    this.#withPipelineSettings(
      settings,
      (
        settingsPointer) => this.routes.invoke("cna_render_pipeline_set_settings", pipeline,
        settingsPointer,
      ),
    );
  }

  /**
   * The auto exposure applied to a settings block, **in place**.
   *
   * The route takes one structure and edits it; there is no second one to fill. Generated as a
   * two-structure call because its TypeScript answer is a settings block, and caught by
   * `verify-route-calls.mjs` as three arguments for a two-parameter route.
   */
  public override applyAutoExposureToSettings(
    autoExposure: NativeHandle, settings: PipelineSettingsSnapshot,
  ): PipelineSettingsSnapshot {
    return this.#editPipelineSettings(
      settings, (pointer) => this.routes.invoke(
        "cna_auto_exposure_ext_apply_to", autoExposure, pointer));
  }

  public override getDefaultAreaLight(): AreaLightSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocAreaLight(scope);
      this.routes.invoke("cna_area_light_ext_init", structure.pointer);
      return this.#readAreaLight(structure);
    } finally {
      scope.dispose();
    }
  }

  public override isAreaLightValid(light: AreaLightSnapshot): boolean {
    return this.#withAreaLight(
      light, (lightPointer) => this.mem.bool("cna_area_light_ext_is_valid", lightPointer),
    );
  }

  public override evaluateAreaLightBrdf(
    roughness: number, cosTheta: number, sampleCount: number,
  ): AreaLightBrdfTermsSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocAreaLightBrdfTerms(scope);
      this.routes.invoke(
        "cna_area_light_brdf_table_evaluate", roughness, cosTheta, Math.trunc(sampleCount),
        structure.pointer,
      );
      return this.#readAreaLightBrdfTerms(structure);
    } finally {
      scope.dispose();
    }
  }

  public override createDefaultPunctualLight(): PunctualLightSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocPunctualLight(scope);
      this.routes.invoke("cna_punctual_light_ext_init", structure.pointer);
      return this.#readPunctualLight(structure);
    } finally {
      scope.dispose();
    }
  }

  public override createDefaultShadowCascadeState(): ShadowCascadeStateSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocShadowCascadeState(scope);
      this.routes.invoke("cna_shadow_cascade_state_ext_init", structure.pointer);
      return this.#readShadowCascadeState(structure);
    } finally {
      scope.dispose();
    }
  }

  public override createDefaultImageBasedLight(): ImageBasedLightSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocImageBasedLight(scope);
      this.routes.invoke("cna_image_based_light_ext_init", structure.pointer);
      return this.#readImageBasedLight(structure);
    } finally {
      scope.dispose();
    }
  }

  public override isImageBasedLightValid(light: ImageBasedLightSnapshot): boolean {
    return this.#withImageBasedLight(
      light, (lightPointer) => this.mem.bool("cna_image_based_light_ext_is_valid", lightPointer),
    );
  }

  public override setEffectPunctualLight(effect: NativeHandle, light: PunctualLightSnapshot): void {
    this.#withPunctualLight(
      light,
      (
        lightPointer) => this.routes.invoke("cna_effect_set_punctual_light_ext", effect,
        lightPointer,
      ),
    );
  }

  public override getEffectPunctualLight(effect: NativeHandle): PunctualLightSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocPunctualLight(scope);
      this.routes.invoke("cna_effect_get_punctual_light_ext", effect, structure.pointer);
      return this.#readPunctualLight(structure);
    } finally {
      scope.dispose();
    }
  }

  public override setEffectShadowCascades(
    effect: NativeHandle, state: ShadowCascadeStateSnapshot,
  ): void {
    this.#withShadowCascadeState(
      state,
      (
        statePointer) => this.routes.invoke("cna_effect_set_shadow_cascades_ext", effect,
        statePointer,
      ),
    );
  }

  public override getEffectShadowCascades(effect: NativeHandle): ShadowCascadeStateSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocShadowCascadeState(scope);
      this.routes.invoke("cna_effect_get_shadow_cascades_ext", effect, structure.pointer);
      return this.#readShadowCascadeState(structure);
    } finally {
      scope.dispose();
    }
  }

  public override setEffectImageBasedLight(
    effect: NativeHandle, light: ImageBasedLightSnapshot,
  ): void {
    this.#withImageBasedLight(
      light,
      (
        lightPointer) => this.routes.invoke("cna_effect_set_image_based_light_ext", effect,
        lightPointer,
      ),
    );
  }

  public override getEffectImageBasedLight(effect: NativeHandle): ImageBasedLightSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocImageBasedLight(scope);
      this.routes.invoke("cna_effect_get_image_based_light_ext", effect, structure.pointer);
      return this.#readImageBasedLight(structure);
    } finally {
      scope.dispose();
    }
  }

  public override createDefaultIndirectDrawArguments(): IndirectDrawArgumentsSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocIndirectDrawArguments(scope);
      this.routes.invoke("cna_indirect_draw_arguments_init", structure.pointer);
      return this.#readIndirectDrawArguments(structure);
    } finally {
      scope.dispose();
    }
  }

  public override createDefaultGpuCullableInstance(): GpuCullableInstanceSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocGpuCullableInstance(scope);
      this.routes.invoke("cna_gpu_cullable_instance_init", structure.pointer);
      return this.#readGpuCullableInstance(structure);
    } finally {
      scope.dispose();
    }
  }

  public override applyPbrEffectMaterial(
    effect: NativeHandle, material: PbrMaterialExtSnapshot,
  ): void {
    this.#withPbrMaterialExt(
      material,
      (
        materialPointer) => this.routes.invoke("cna_pbr_effect_apply_material", effect,
        materialPointer,
      ),
    );
  }

  public override extractPbrEffectMaterial(effect: NativeHandle): PbrMaterialExtSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocPbrMaterialExt(scope);
      this.routes.invoke("cna_pbr_effect_extract_material", effect, structure.pointer);
      return this.#readPbrMaterialExt(structure);
    } finally {
      scope.dispose();
    }
  }

  public override applySkinnedPbrEffectMaterial(
    effect: NativeHandle, material: PbrMaterialExtSnapshot,
  ): void {
    this.#withPbrMaterialExt(
      material,
      (
        materialPointer) => this.routes.invoke("cna_skinned_pbr_effect_apply_material", effect,
        materialPointer,
      ),
    );
  }

  public override getDefaultGltfMaterialSource(): GltfMaterialSourceSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocGltfMaterialSource(scope);
      this.routes.invoke("cna_gltf_material_source_ext_init", structure.pointer);
      return this.#readGltfMaterialSource(structure);
    } finally {
      scope.dispose();
    }
  }

  public override getDefaultGltfMaterialTextures(): GltfMaterialTexturesSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocGltfMaterialTextures(scope);
      this.routes.invoke("cna_gltf_material_textures_ext_init", structure.pointer);
      return this.#readGltfMaterialTextures(structure);
    } finally {
      scope.dispose();
    }
  }

  public override pbrMaterialExtEquals(
    first: PbrMaterialExtSnapshot, second: PbrMaterialExtSnapshot,
  ): boolean {
    return this.#withPbrMaterialExt(
      first,
      (
        firstPointer) => this.#withPbrMaterialExt(second,
        (
          secondPointer) => this.mem.bool("cna_pbr_material_ext_equals",
          firstPointer,
          secondPointer,
        ),
      ),
    );
  }

  public override setFrustumCullerCamera(
    culler: NativeHandle, view: readonly number[], projection: readonly number[],
  ): void {
    this.mem.withMatrix(
      view,
      (
        viewPointer) => this.mem.withMatrix(projection,
        (
          projectionPointer) => this.routes.invoke("cna_frustum_culler_ext_set_camera",
          culler,
          viewPointer,
          projectionPointer,
        ),
      ),
    );
  }

  public override gpuInstanceCullerCull(
    culler: NativeHandle, view: readonly number[], projection: readonly number[],
    indexCount: number, firstIndex: number, baseVertex: number,
  ): void {
    this.mem.withMatrix(
      view,
      (
        viewPointer) => this.mem.withMatrix(projection,
        (
          projectionPointer) => this.routes.invoke("cna_gpu_instance_culler_cull",
          culler,
          viewPointer,
          projectionPointer,
          Math.trunc(indexCount),
          Math.trunc(firstIndex),
          Math.trunc(baseVertex),
        ),
      ),
    );
  }

  public override beginDebugDraw(
    debug: NativeHandle, view: readonly number[], projection: readonly number[],
  ): void {
    this.mem.withMatrix(
      view,
      (
        viewPointer) => this.mem.withMatrix(projection,
        (
          projectionPointer) => this.routes.invoke("cna_debug_draw_begin",
          debug,
          viewPointer,
          projectionPointer,
        ),
      ),
    );
  }

  public override addDebugDrawLine(
    debug: NativeHandle, from: Vector3Snapshot, to: Vector3Snapshot, color: number,
  ): void {
    this.mem.withVector3(
      from,
      (
        fromPointer) => this.mem.withVector3(to,
        (
          toPointer) => this.routes.invoke("cna_debug_draw_add_line",
          debug,
          fromPointer,
          toPointer,
          color,
        ),
      ),
    );
  }

  public override setPipelineCamera(
    pipeline: NativeHandle, view: readonly number[], projection: readonly number[],
    nearPlane: number, farPlane: number,
  ): void {
    this.mem.withMatrix(
      view,
      (
        viewPointer) => this.mem.withMatrix(projection,
        (
          projectionPointer) => this.routes.invoke("cna_render_pipeline_set_camera",
          pipeline,
          viewPointer,
          projectionPointer,
          nearPlane,
          farPlane,
        ),
      ),
    );
  }

  public override setPipelineSkyboxCamera(
    pipeline: NativeHandle, view: readonly number[], projection: readonly number[],
  ): void {
    this.mem.withMatrix(
      view,
      (
        viewPointer) => this.mem.withMatrix(projection,
        (
          projectionPointer) => this.routes.invoke("cna_render_pipeline_set_skybox_camera",
          pipeline,
          viewPointer,
          projectionPointer,
        ),
      ),
    );
  }

  /**
   * Adopts an assignment computed elsewhere: two `int32_t` arrays, each with its own count.
   *
   * The offsets and the indices are different lengths -- one per cluster and one per
   * reference -- so a single count would be wrong for one of them, and the generated call
   * passed neither.
   */
  public override adoptClusteredLightAssignment(
    assignment: NativeHandle, lightCount: number, offsets: readonly number[],
    indices: readonly number[],
  ): void {
    const scope = this.routes.scope();
    try {
      this.routes.invoke(
        "cna_clustered_light_assignment_adopt", assignment, Math.trunc(lightCount),
        this.#int32s(scope, offsets), BigInt(offsets.length),
        this.#int32s(scope, indices), BigInt(indices.length),
      );
    } finally {
      scope.dispose();
    }
  }

  public override beginClusteredForwardEffect(
    effect: NativeHandle, world: readonly number[], view: readonly number[],
    projection: readonly number[], cameraPosition: Vector3Snapshot, lights: NativeHandle,
  ): void {
    this.mem.withMatrix(
      world,
      (
        worldPointer) => this.mem.withMatrix(view,
        (
          viewPointer) => this.mem.withMatrix(projection,
          (
            projectionPointer) => this.mem.withVector3(cameraPosition,
            (
              cameraPositionPointer) => this.routes.invoke("cna_clustered_forward_effect_begin",
              effect,
              worldPointer,
              viewPointer,
              projectionPointer,
              cameraPositionPointer,
              lights,
            ),
          ),
        ),
      ),
    );
  }

  public override getAreaLightContribution(
    light: AreaLightSnapshot, surface: Vector3Snapshot, normal: Vector3Snapshot,
    cameraPosition: Vector3Snapshot, baseColor: Vector3Snapshot, metallic: number,
    roughness: number,
  ): Vector3Snapshot {
    return this.#withAreaLight(
      light,
      (
        lightPointer) => this.mem.withVector3(surface,
        (
          surfacePointer) => this.mem.withVector3(normal,
          (
            normalPointer) => this.mem.withVector3(cameraPosition,
            (
              cameraPositionPointer) => this.mem.withVector3(baseColor,
              (
                baseColorPointer) => this.mem.vector3("cna_area_light_shading_contribution",
                lightPointer,
                surfacePointer,
                normalPointer,
                cameraPositionPointer,
                baseColorPointer,
                metallic,
                roughness,
              ),
            ),
          ),
        ),
      ),
    );
  }

  public override createShaderEffect(
    graphicsDevice: NativeHandle, vertexSource: string, fragmentSource: string,
  ): NativeHandle {
    return this.mem.withStringView(
      vertexSource,
      (
        vertexSourcePointer) => this.mem.withStringView(fragmentSource,
        (
          fragmentSourcePointer) => this.routes.outHandle("cna_shader_effect_create",
          graphicsDevice,
          vertexSourcePointer,
          fragmentSourcePointer,
        ),
      ),
    );
  }

  public override setShaderEffectUniformMatrix(
    effect: NativeHandle, name: string, value: readonly number[],
  ): void {
    this.mem.withStringView(
      name,
      (
        namePointer) => this.mem.withMatrix(value,
        (
          valuePointer) => this.routes.invoke("cna_shader_effect_set_uniform_matrix",
          effect,
          namePointer,
          valuePointer,
        ),
      ),
    );
  }

  public override setShaderEffectUniformVector3(
    effect: NativeHandle, name: string, value: Vector3Snapshot,
  ): void {
    this.mem.withStringView(
      name,
      (
        namePointer) => this.mem.withVector3(value,
        (
          valuePointer) => this.routes.invoke("cna_shader_effect_set_uniform_vector3",
          effect,
          namePointer,
          valuePointer,
        ),
      ),
    );
  }

  public override setShaderEffectUniformVector2(
    effect: NativeHandle, name: string, value: Vector2Snapshot,
  ): void {
    this.mem.withStringView(
      name,
      (
        namePointer) => this.mem.withVector2(value,
        (
          valuePointer) => this.routes.invoke("cna_shader_effect_set_uniform_vector2",
          effect,
          namePointer,
          valuePointer,
        ),
      ),
    );
  }

  public override acquireFactoryShaderEffect(
    factory: NativeHandle, name: string, vertexSource: string, fragmentSource: string,
  ): NativeHandle {
    return this.mem.withStringView(
      name,
      (
        namePointer) => this.mem.withStringView(vertexSource,
        (
          vertexSourcePointer) => this.mem.withStringView(fragmentSource,
          (
            fragmentSourcePointer) => this.routes.outHandle("cna_shader_effect_factory_acquire",
            factory,
            namePointer,
            vertexSourcePointer,
            fragmentSourcePointer,
          ),
        ),
      ),
    );
  }

  public override scopedRenderTargetHasRecordedPrevious(scope: NativeHandle): boolean {
    return this.mem.bool("cna_scoped_render_target_get_has_recorded_previous", scope);
  }

  public override setFrustumCullerViewProjection(
    culler: NativeHandle, viewProjection: readonly number[],
  ): void {
    this.mem.withMatrix(
      viewProjection,
      (
        viewProjectionPointer) => this.routes.invoke("cna_frustum_culler_ext_set_view_projection",
        culler,
        viewProjectionPointer,
      ),
    );
  }

  public override getGpuInstanceCullerInstanceLookupGlsl(): string {
    return this.mem.probedString("cna_gpu_instance_culler_copy_instance_lookup_glsl");
  }

  public override getHdrDisplayColorSpace(output: NativeHandle): number {
    return this.mem.u32("cna_hdr_display_output_get_color_space", output);
  }

  public override setHdrDisplayColorSpace(output: NativeHandle, value: number): void {
    this.routes.invoke("cna_hdr_display_output_set_color_space", output, value);
  }

  public override hdrRec709ToRec2020(color: Vector3Snapshot): Vector3Snapshot {
    return this.mem.withVector3(
      color,
      (colorPointer) => this.mem.vector3("cna_hdr_display_output_rec709_to_rec2020", colorPointer),
    );
  }

  public override measureAutoExposureLuminance(
    autoExposure: NativeHandle, scene: NativeHandle,
  ): number {
    return this.mem.float("cna_auto_exposure_ext_measure_average_luminance", autoExposure, scene);
  }

  public override setAutoExposureAdaptationSpeeds(
    autoExposure: NativeHandle, brighteningPerSecond: number, darkeningPerSecond: number,
  ): void {
    this.routes.invoke(
      "cna_auto_exposure_ext_set_adaptation_speeds",
      autoExposure,
      brighteningPerSecond,
      darkeningPerSecond,
    );
  }

  public override setAutoExposureRange(
    autoExposure: NativeHandle, minimum: number, maximum: number,
  ): void {
    this.routes.invoke("cna_auto_exposure_ext_set_exposure_range", autoExposure, minimum, maximum);
  }

  /** Normalises a settings block **in place**, which is the shape all three of these share. */
  public override normalizePipelineSettings(
    settings: PipelineSettingsSnapshot,
  ): PipelineSettingsSnapshot {
    return this.#editPipelineSettings(
      settings, (pointer) => this.routes.invoke("cna_render_pipeline_settings_ext_normalize", pointer));
  }

  /** The quality preset applied to a caller's settings, in place. */
  public override applyPipelineQualityPreset(
    settings: PipelineSettingsSnapshot,
  ): PipelineSettingsSnapshot {
    return this.#editPipelineSettings(
      settings, (pointer) => this.routes.invoke("cna_render_pipeline_settings_ext_apply_render_quality_preset", pointer));
  }

  public override setPipelineDepthNormalInputs(
    pipeline: NativeHandle, depth: NativeHandle, normals: NativeHandle,
  ): void {
    this.routes.invoke("cna_render_pipeline_set_depth_normal_inputs", pipeline, depth, normals);
  }

  public override setPipelineVelocityInput(pipeline: NativeHandle, velocity: NativeHandle): void {
    this.routes.invoke("cna_render_pipeline_set_velocity_input_ext", pipeline, velocity);
  }

  public override getPipelineSceneTargetFormat(pipeline: NativeHandle): number {
    return this.mem.u32("cna_render_pipeline_get_scene_target_format", pipeline);
  }

  public override getPipelinePassTimingCount(pipeline: NativeHandle): number {
    return this.mem.u64AsNumber("cna_render_pipeline_get_pass_timing_count_ext", pipeline);
  }

  public override getPipelinePassTimingName(pipeline: NativeHandle, index: number): string {
    return this.mem.probedString(
      "cna_render_pipeline_copy_pass_timing_name_ext",
      pipeline,
      Math.trunc(index),
    );
  }

  public override getClusteredLightLookupGlsl(): string {
    return this.mem.probedString("cna_clustered_light_buffer_copy_light_lookup_glsl");
  }

  public override setClusteredForwardOpaqueFrame(effect: NativeHandle, frame: NativeHandle): void {
    this.routes.invoke("cna_clustered_forward_effect_set_opaque_frame", effect, frame);
  }

  public override clusteredVolumeAttenuation(
    attenuationColor: Vector3Snapshot, attenuationDistance: number, thickness: number,
  ): Vector3Snapshot {
    return this.mem.withVector3(
      attenuationColor,
      (
        attenuationColorPointer) => this.mem.vector3(
          "cna_clustered_forward_effect_volume_attenuation",
        attenuationColorPointer,
        attenuationDistance,
        thickness,
      ),
    );
  }

  public override addDebugDrawClusterSliceGizmo(
    debug: NativeHandle, grid: NativeHandle, inverseView: readonly number[], color: number,
  ): void {
    this.mem.withMatrix(
      inverseView,
      (
        inverseViewPointer) => this.routes.invoke("cna_debug_draw_add_cluster_slice_gizmo",
        debug,
        grid,
        inverseViewPointer,
        color,
      ),
    );
  }

  public override createAreaLightBrdfTableWithSize(
    graphicsDevice: NativeHandle, size: number, sampleCount: number,
  ): NativeHandle {
    return this.routes.outHandle(
      "cna_area_light_brdf_table_create_with_size",
      graphicsDevice,
      Math.trunc(size),
      Math.trunc(sampleCount),
    );
  }

  public override setClusteredForwardAreaLight(
    effect: NativeHandle, light: AreaLightSnapshot, table: NativeHandle,
  ): void {
    this.#withAreaLight(
      light,
      (
        lightPointer) => this.routes.invoke("cna_clustered_forward_effect_set_area_light",
        effect,
        lightPointer,
        table,
      ),
    );
  }

  public override getCameraPositionOfView(view: readonly number[]): Vector3Snapshot {
    return this.mem.withMatrix(
      view,
      (
        viewPointer) => this.mem.vector3("cna_transparent_draw_list_camera_position_of",
        viewPointer,
      ),
    );
  }

  public override createWeightedBlendedTransparency(
    graphicsDevice: NativeHandle, width: number, height: number,
  ): NativeHandle {
    return this.routes.outHandle(
      "cna_weighted_blended_transparency_create",
      graphicsDevice,
      Math.trunc(width),
      Math.trunc(height),
    );
  }

  public override beginWeightedBlendedTransparency(
    transparency: NativeHandle, farPlane: number,
  ): void {
    this.routes.invoke("cna_weighted_blended_transparency_begin", transparency, farPlane);
  }

  public override getWeightedBlendedAccumulationGlsl(): string {
    return this.mem.probedString("cna_weighted_blended_transparency_copy_accumulation_glsl");
  }

  public override getWeightedBlendedWeight(
    viewDepth: number, alpha: number, farPlane: number,
  ): number {
    return this.mem.float("cna_weighted_blended_transparency_weight", viewDepth, alpha, farPlane);
  }

  public override setShaderEffectUniformFloatArray(
    effect: NativeHandle, name: string, values: readonly number[],
  ): void {
    const scope = this.routes.scope();
    try {
      const buffer = this.#floats(scope, values);
      this.mem.withStringView(name, (namePointer) => this.routes.invoke(
        "cna_shader_effect_set_uniform_float_array", effect, namePointer, buffer, BigInt(values.length)));
    } finally {
      scope.dispose();
    }
  }

  public override setShaderEffectUniformVec3Array(
    effect: NativeHandle, name: string, values: readonly number[],
  ): void {
    const scope = this.routes.scope();
    try {
      const buffer = this.#floats(scope, values);
      this.mem.withStringView(name, (namePointer) => this.routes.invoke(
        "cna_shader_effect_set_uniform_vec3_array", effect, namePointer, buffer, values.length));
    } finally {
      scope.dispose();
    }
  }

  public override setShaderEffectUniformMat4Array(
    effect: NativeHandle, name: string, values: readonly number[],
  ): void {
    const scope = this.routes.scope();
    try {
      const buffer = this.#floats(scope, values);
      this.mem.withStringView(name, (namePointer) => this.routes.invoke(
        "cna_shader_effect_set_uniform_mat4_array", effect, namePointer, buffer, values.length));
    } finally {
      scope.dispose();
    }
  }

  public override getRenderTargetPoolTargetCount(pool: NativeHandle): number {
    return this.mem.u64AsNumber("cna_render_target_pool_get_target_count", pool);
  }

  public override getRenderTargetPoolEstimatedBytes(pool: NativeHandle): number {
    return this.mem.u64AsNumber("cna_render_target_pool_get_estimated_bytes", pool);
  }

  public override getShaderEffectFactoryCompileCount(factory: NativeHandle): number {
    return this.mem.u64AsNumber("cna_shader_effect_factory_get_compile_count", factory);
  }

  public override setEffectLightViewProjection(
    effect: NativeHandle, value: readonly number[],
  ): void {
    this.mem.withMatrix(
      value,
      (
        valuePointer) => this.routes.invoke("cna_effect_set_light_view_projection_ext",
        effect,
        valuePointer,
      ),
    );
  }

  public override getEffectLightViewProjection(effect: NativeHandle): readonly number[] {
    return this.mem.matrix("cna_effect_get_light_view_projection_ext", effect);
  }

  public override createDefaultIndirectDrawIndexedArguments(

  ): IndirectDrawIndexedArgumentsSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocIndirectDrawIndexedArguments(scope);
      this.routes.invoke("cna_indirect_draw_indexed_arguments_init", structure.pointer);
      return this.#readIndirectDrawIndexedArguments(structure);
    } finally {
      scope.dispose();
    }
  }

  public override drawPrimitivesIndirect(
    graphicsDevice: NativeHandle, primitiveType: number, argumentBuffer: NativeHandle,
    argumentByteOffset: number,
  ): void {
    this.routes.invoke(
      "cna_graphics_device_draw_primitives_indirect_ext",
      graphicsDevice,
      primitiveType,
      argumentBuffer,
      Math.trunc(argumentByteOffset),
    );
  }

  public override drawIndexedPrimitivesIndirect(
    graphicsDevice: NativeHandle, primitiveType: number, argumentBuffer: NativeHandle,
    argumentByteOffset: number,
  ): void {
    this.routes.invoke(
      "cna_graphics_device_draw_indexed_primitives_indirect_ext",
      graphicsDevice,
      primitiveType,
      argumentBuffer,
      Math.trunc(argumentByteOffset),
    );
  }

  public override extractSkinnedPbrEffectMaterial(effect: NativeHandle): PbrMaterialExtSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocPbrMaterialExt(scope);
      this.routes.invoke("cna_skinned_pbr_effect_extract_material", effect, structure.pointer);
      return this.#readPbrMaterialExt(structure);
    } finally {
      scope.dispose();
    }
  }

  public override getPbrMaterialExtensionsText(extensions: NativeHandle): string {
    return this.mem.probedString("cna_pbr_material_extensions_copy_to_string", extensions);
  }

  public override getDefaultGltfExtensionSource(): GltfExtensionSourceSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocGltfExtensionSource(scope);
      this.routes.invoke("cna_gltf_material_extension_source_ext_init", structure.pointer);
      return this.#readGltfExtensionSource(structure);
    } finally {
      scope.dispose();
    }
  }

  public override getDefaultGltfExtensionTextures(): GltfExtensionTexturesSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocGltfExtensionTextures(scope);
      this.routes.invoke("cna_gltf_material_extension_textures_ext_init", structure.pointer);
      return this.#readGltfExtensionTextures(structure);
    } finally {
      scope.dispose();
    }
  }

  /** Two structures in and one out, all three growable and all three initialised first. */
  public override buildGltfPbrMaterial(
    source: GltfMaterialSourceSnapshot, textures: GltfMaterialTexturesSnapshot,
  ): PbrMaterialExtSnapshot {
    return this.#withGltfMaterialSource(source, (sourcePointer) => {
      return this.#withGltfMaterialTextures(textures, (texturesPointer) => {
        const scope = this.routes.scope();
        try {
        const structure = this.#allocPbrMaterialExt(scope);
        this.routes.invoke(
          "cna_gltf_material_bridge_build_material",
          sourcePointer,
          texturesPointer,
          structure.pointer,
        );
        return this.#readPbrMaterialExt(structure);
        } finally {
          scope.dispose();
        }
      });
    });
  }

  public override buildGltfPbrMaterialExtensions(
    source: GltfExtensionSourceSnapshot, textures: GltfExtensionTexturesSnapshot,
    extensions: NativeHandle,
  ): void {
    this.#withGltfExtensionSource(
      source,
      (
        sourcePointer) => this.#withGltfExtensionTextures(textures,
        (
          texturesPointer) => this.routes.invoke("cna_gltf_material_bridge_build_extensions",
          sourcePointer,
          texturesPointer,
          extensions,
        ),
      ),
    );
  }

  public override getPbrEffectTextureCoordinateSet(effect: NativeHandle, slot: number): number {
    return this.mem.int("cna_pbr_effect_get_texture_coordinate_set_ext", effect, slot);
  }

  public override getPbrEffectTextureIsSrgb(effect: NativeHandle, slot: number): boolean {
    return this.mem.bool("cna_pbr_effect_get_texture_is_srgb_ext", effect, slot);
  }

  public override getPbrEffectTextureTransform(
    effect: NativeHandle, slot: number,
  ): TextureTransformSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocTextureTransform(scope);
      this.routes.invoke(
        "cna_pbr_effect_get_texture_transform_ext",
        effect,
        slot,
        structure.pointer,
      );
      return this.#readTextureTransform(structure);
    } finally {
      scope.dispose();
    }
  }

  public override setPbrEffectTextureCoordinateSet(
    effect: NativeHandle, slot: number, value: number,
  ): void {
    this.routes.invoke(
      "cna_pbr_effect_set_texture_coordinate_set_ext",
      effect,
      slot,
      Math.trunc(value),
    );
  }

  public override setPbrEffectTextureIsSrgb(
    effect: NativeHandle, slot: number, value: boolean,
  ): void {
    this.routes.invoke("cna_pbr_effect_set_texture_is_srgb_ext", effect, slot, value ? 1 : 0);
  }

  public override setPbrEffectTextureTransform(
    effect: NativeHandle, slot: number, transform: TextureTransformSnapshot,
  ): void {
    this.#withTextureTransform(
      transform,
      (
        transformPointer) => this.routes.invoke("cna_pbr_effect_set_texture_transform_ext",
        effect,
        slot,
        transformPointer,
      ),
    );
  }

  /** Reads a `CNA_RenderPipelineFrameStatisticsEXT` a route has written. */
  #readRenderPipelineStatistics(structure: WasmStruct): RenderPipelineStatisticsSnapshot {
    return {
      PassesRun: structure.getI32("passes_run"),
      TargetSwitches: structure.getI32("target_switches"),
      LastFramePassCount: structure.getI32("passes_run"),
      UsedSceneTarget: structure.getU8("used_scene_target") !== 0,
      DrewSkybox: structure.getU8("drew_skybox") !== 0,
      GpuMemoryEstimateBytes: structure.getU64("gpu_memory_estimate_bytes"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withRenderPipelineStatistics<T>(
    values: RenderPipelineStatisticsSnapshot, body: (pointer: number) => T,
  ): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(
        this.routes.module, scope, "CNA_RenderPipelineFrameStatisticsEXT");
    structure
      .setI32("passes_run", Math.trunc(values.PassesRun))
      .setI32("target_switches", Math.trunc(values.TargetSwitches))
      .setI32("passes_run", Math.trunc(values.LastFramePassCount))
      .setU8("used_scene_target", values.UsedSceneTarget ? 1 : 0)
      .setU8("drew_skybox", values.DrewSkybox ? 1 : 0)
      .setU64("gpu_memory_estimate_bytes", values.GpuMemoryEstimateBytes);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocRenderPipelineStatistics(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(
      this.routes.module, scope, "CNA_RenderPipelineFrameStatisticsEXT");
    return structure;
  }

  /** Reads a `CNA_PbrMaterialEXT` a route has written. */
  #readPbrMaterialExt(structure: WasmStruct): PbrMaterialExtSnapshot {
    return {
      AlbedoTexture: structure.getU64("albedo_texture"),
      NormalTexture: structure.getU64("normal_texture"),
      MetallicRoughnessTexture: structure.getU64("metallic_roughness_texture"),
      AmbientOcclusionTexture: structure.getU64("ambient_occlusion_texture"),
      EmissiveTexture: structure.getU64("emissive_texture"),
      SpecularTexture: structure.getU64("specular_texture"),
      SpecularColorTexture: structure.getU64("specular_color_texture"),
      AlbedoColor: structure.getU32("albedo_color"),
      EmissiveFactor: readVector3(structure, "emissive_factor"),
      SpecularColorFactor: readVector3(structure, "specular_color_factor"),
      MetallicFactor: structure.getF32("metallic_factor"),
      RoughnessFactor: structure.getF32("roughness_factor"),
      NormalScale: structure.getF32("normal_scale"),
      OcclusionStrength: structure.getF32("occlusion_strength"),
      Ior: structure.getF32("ior"),
      SpecularFactor: structure.getF32("specular_factor"),
      AlphaCutoff: structure.getF32("alpha_cutoff"),
      AlphaMode: structure.getU32("alpha_mode"),
      DoubleSided: structure.getU8("double_sided") !== 0,
      BaseColorTextureSrgb: structure.getU8("base_color_texture_srgb") !== 0,
      EmissiveTextureSrgb: structure.getU8("emissive_texture_srgb") !== 0,
      SpecularColorTextureSrgb: structure.getU8("specular_color_texture_srgb") !== 0,
      OutputEncodedToSrgb: structure.getU8("output_encoded_to_srgb") !== 0,
      TextureCoordinateSets: structure.getI32Array("texture_coordinate_sets"),
      TextureTransforms: this.#readTextureTransformArray(structure, "texture_transforms"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withPbrMaterialExt<T>(values: PbrMaterialExtSnapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_PbrMaterialEXT");
      this.routes.invoke("cna_pbr_material_ext_init", structure.pointer);
    structure
      .setU64("albedo_texture", values.AlbedoTexture)
      .setU64("normal_texture", values.NormalTexture)
      .setU64("metallic_roughness_texture", values.MetallicRoughnessTexture)
      .setU64("ambient_occlusion_texture", values.AmbientOcclusionTexture)
      .setU64("emissive_texture", values.EmissiveTexture)
      .setU64("specular_texture", values.SpecularTexture)
      .setU64("specular_color_texture", values.SpecularColorTexture)
      .setU32("albedo_color", values.AlbedoColor >>> 0)
      .setF32("metallic_factor", values.MetallicFactor)
      .setF32("roughness_factor", values.RoughnessFactor)
      .setF32("normal_scale", values.NormalScale)
      .setF32("occlusion_strength", values.OcclusionStrength)
      .setF32("ior", values.Ior)
      .setF32("specular_factor", values.SpecularFactor)
      .setF32("alpha_cutoff", values.AlphaCutoff)
      .setU32("alpha_mode", values.AlphaMode)
      .setU8("double_sided", values.DoubleSided ? 1 : 0)
      .setU8("base_color_texture_srgb", values.BaseColorTextureSrgb ? 1 : 0)
      .setU8("emissive_texture_srgb", values.EmissiveTextureSrgb ? 1 : 0)
      .setU8("specular_color_texture_srgb", values.SpecularColorTextureSrgb ? 1 : 0)
      .setU8("output_encoded_to_srgb", values.OutputEncodedToSrgb ? 1 : 0);
    writeVector3(structure, "emissive_factor", values.EmissiveFactor);
    writeVector3(structure, "specular_color_factor", values.SpecularColorFactor);
    structure.setI32Array("texture_coordinate_sets", values.TextureCoordinateSets);
    this.#writeTextureTransformArray(structure, "texture_transforms", values.TextureTransforms);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocPbrMaterialExt(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_PbrMaterialEXT");
    this.routes.invoke("cna_pbr_material_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_PbrMaterial` a route has written. */
  #readPbrMaterialDefaults(structure: WasmStruct): PbrMaterialDefaults {
    return {
      MetallicFactor: structure.getF32("metallic_factor"),
      RoughnessFactor: structure.getF32("roughness_factor"),
      NormalScale: structure.getF32("normal_scale"),
      OcclusionStrength: structure.getF32("occlusion_strength"),
      AlphaCutoff: structure.getF32("alpha_cutoff"),
      AlphaBlendEnabled: structure.getU8("alpha_blend_enabled") !== 0,
      AlbedoColor: structure.getU32("albedo_color"),
      EmissiveColor: structure.getU32("emissive_color"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withPbrMaterialDefaults<T>(values: PbrMaterialDefaults, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_PbrMaterial");
      this.routes.invoke("cna_pbr_material_init", structure.pointer);
    structure
      .setF32("metallic_factor", values.MetallicFactor)
      .setF32("roughness_factor", values.RoughnessFactor)
      .setF32("normal_scale", values.NormalScale)
      .setF32("occlusion_strength", values.OcclusionStrength)
      .setF32("alpha_cutoff", values.AlphaCutoff)
      .setU8("alpha_blend_enabled", values.AlphaBlendEnabled ? 1 : 0)
      .setU32("albedo_color", values.AlbedoColor >>> 0)
      .setU32("emissive_color", values.EmissiveColor >>> 0);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocPbrMaterialDefaults(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_PbrMaterial");
    this.routes.invoke("cna_pbr_material_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_TextureTransformEXT` a route has written. */
  #readTextureTransform(structure: WasmStruct): TextureTransformSnapshot {
    return {
      Offset: readVector2(structure, "offset"),
      Scale: readVector2(structure, "scale"),
      Rotation: structure.getF32("rotation"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withTextureTransform<T>(values: TextureTransformSnapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_TextureTransformEXT");
      this.routes.invoke("cna_texture_transform_ext_init", structure.pointer);
    structure
      .setF32("rotation", values.Rotation);
    writeVector2(structure, "offset", values.Offset);
    writeVector2(structure, "scale", values.Scale);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocTextureTransform(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_TextureTransformEXT");
    this.routes.invoke("cna_texture_transform_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_RenderPipelineSettingsEXT` a route has written. */
  #readPipelineSettings(structure: WasmStruct): PipelineSettingsSnapshot {
    return {
      HdrEnabled: structure.getU8("hdr_enabled") !== 0,
      Exposure: structure.getF32("exposure"),
      Gamma: structure.getF32("gamma"),
      TonemappingMode: structure.getU32("tonemapping_mode"),
      BloomEnabled: structure.getU8("bloom_enabled") !== 0,
      BloomIntensity: structure.getF32("bloom_intensity"),
      BloomThreshold: structure.getF32("bloom_threshold"),
      BloomIterations: structure.getI32("bloom_iterations"),
      SsaoEnabled: structure.getU8("ssao_enabled") !== 0,
      TransparencyMode: structure.getU32("transparency_mode"),
      SsaoRadius: structure.getF32("ssao_radius"),
      SsaoIntensity: structure.getF32("ssao_intensity"),
      SsaoSampleCount: structure.getI32("ssao_sample_count"),
      SsrEnabled: structure.getU8("ssr_enabled") !== 0,
      SsrMaxDistance: structure.getF32("ssr_max_distance"),
      SsrStepCount: structure.getI32("ssr_step_count"),
      SsrThickness: structure.getF32("ssr_thickness"),
      SsrDepthBias: structure.getF32("ssr_depth_bias"),
      SsrEdgeFade: structure.getF32("ssr_edge_fade"),
      VolumetricFogDensity: structure.getF32("volumetric_fog_density"),
      LightShaftThreshold: structure.getF32("light_shaft_threshold"),
      LightShaftIntensity: structure.getF32("light_shaft_intensity"),
      LightShaftDecay: structure.getF32("light_shaft_decay"),
      HeightFogDensity: structure.getF32("height_fog_density"),
      HeightFogFalloff: structure.getF32("height_fog_falloff"),
      HeightFogBaseHeight: structure.getF32("height_fog_base_height"),
      MotionBlurStrength: structure.getF32("motion_blur_strength"),
      MotionBlurMaxDistance: structure.getF32("motion_blur_max_distance"),
      ChromaticAberrationStrength: structure.getF32("chromatic_aberration_strength"),
      FilmGrainIntensity: structure.getF32("film_grain_intensity"),
      LensFlareThreshold: structure.getF32("lens_flare_threshold"),
      LensFlareIntensity: structure.getF32("lens_flare_intensity"),
      LensFlareDispersal: structure.getF32("lens_flare_dispersal"),
      ColorGradeEnabled: structure.getU8("color_grade_enabled") !== 0,
      ColorGradeStrength: structure.getF32("color_grade_strength"),
      DofEnabled: structure.getU8("dof_enabled") !== 0,
      DofFocusDistance: structure.getF32("dof_focus_distance"),
      DofFocalLength: structure.getF32("dof_focal_length"),
      DofFNumber: structure.getF32("doff_number"),
      DofMaxRadius: structure.getF32("dof_max_radius"),
      SsrRoughnessBlur: structure.getF32("ssr_roughness_blur"),
      SsrIntensity: structure.getF32("ssr_intensity"),
      FxaaEnabled: structure.getU8("fxaa_enabled") !== 0,
      FxaaEdgeThresholdExt: structure.getF32("fxaa_edge_threshold_ext"),
      RenderQuality: structure.getU32("render_quality"),
      ShadowQuality: structure.getU32("shadow_quality"),
      ShadowsEnabled: structure.getU8("shadows_enabled") !== 0,
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withPipelineSettings<T>(values: PipelineSettingsSnapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_RenderPipelineSettingsEXT");
      this.routes.invoke("cna_render_pipeline_settings_ext_init", structure.pointer);
    structure
      .setU8("hdr_enabled", values.HdrEnabled ? 1 : 0)
      .setF32("exposure", values.Exposure)
      .setF32("gamma", values.Gamma)
      .setU32("tonemapping_mode", values.TonemappingMode)
      .setU8("bloom_enabled", values.BloomEnabled ? 1 : 0)
      .setF32("bloom_intensity", values.BloomIntensity)
      .setF32("bloom_threshold", values.BloomThreshold)
      .setI32("bloom_iterations", Math.trunc(values.BloomIterations))
      .setU8("ssao_enabled", values.SsaoEnabled ? 1 : 0)
      .setU32("transparency_mode", values.TransparencyMode)
      .setF32("ssao_radius", values.SsaoRadius)
      .setF32("ssao_intensity", values.SsaoIntensity)
      .setI32("ssao_sample_count", Math.trunc(values.SsaoSampleCount))
      .setU8("ssr_enabled", values.SsrEnabled ? 1 : 0)
      .setF32("ssr_max_distance", values.SsrMaxDistance)
      .setI32("ssr_step_count", Math.trunc(values.SsrStepCount))
      .setF32("ssr_thickness", values.SsrThickness)
      .setF32("ssr_depth_bias", values.SsrDepthBias)
      .setF32("ssr_edge_fade", values.SsrEdgeFade)
      .setF32("volumetric_fog_density", values.VolumetricFogDensity)
      .setF32("light_shaft_threshold", values.LightShaftThreshold)
      .setF32("light_shaft_intensity", values.LightShaftIntensity)
      .setF32("light_shaft_decay", values.LightShaftDecay)
      .setF32("height_fog_density", values.HeightFogDensity)
      .setF32("height_fog_falloff", values.HeightFogFalloff)
      .setF32("height_fog_base_height", values.HeightFogBaseHeight)
      .setF32("motion_blur_strength", values.MotionBlurStrength)
      .setF32("motion_blur_max_distance", values.MotionBlurMaxDistance)
      .setF32("chromatic_aberration_strength", values.ChromaticAberrationStrength)
      .setF32("film_grain_intensity", values.FilmGrainIntensity)
      .setF32("lens_flare_threshold", values.LensFlareThreshold)
      .setF32("lens_flare_intensity", values.LensFlareIntensity)
      .setF32("lens_flare_dispersal", values.LensFlareDispersal)
      .setU8("color_grade_enabled", values.ColorGradeEnabled ? 1 : 0)
      .setF32("color_grade_strength", values.ColorGradeStrength)
      .setU8("dof_enabled", values.DofEnabled ? 1 : 0)
      .setF32("dof_focus_distance", values.DofFocusDistance)
      .setF32("dof_focal_length", values.DofFocalLength)
      .setF32("doff_number", values.DofFNumber)
      .setF32("dof_max_radius", values.DofMaxRadius)
      .setF32("ssr_roughness_blur", values.SsrRoughnessBlur)
      .setF32("ssr_intensity", values.SsrIntensity)
      .setU8("fxaa_enabled", values.FxaaEnabled ? 1 : 0)
      .setF32("fxaa_edge_threshold_ext", values.FxaaEdgeThresholdExt)
      .setU32("render_quality", values.RenderQuality)
      .setU32("shadow_quality", values.ShadowQuality)
      .setU8("shadows_enabled", values.ShadowsEnabled ? 1 : 0);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocPipelineSettings(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_RenderPipelineSettingsEXT");
    this.routes.invoke("cna_render_pipeline_settings_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_RenderPipelineSettings` a route has written. */
  #readRenderPipelineSettingsDefaults(structure: WasmStruct): RenderPipelineSettingsDefaults {
    return {
      Exposure: structure.getF32("exposure"),
      Gamma: structure.getF32("gamma"),
      BloomIntensity: structure.getF32("bloom_intensity"),
      TonemappingMode: structure.getU32("tonemapping_mode"),
      RenderQuality: structure.getU32("render_quality"),
      ShadowQuality: structure.getU32("shadow_quality"),
      HdrEnabled: structure.getU8("hdr_enabled") !== 0,
      BloomEnabled: structure.getU8("bloom_enabled") !== 0,
      SsaoEnabled: structure.getU8("ssao_enabled") !== 0,
      ShadowsEnabled: structure.getU8("shadows_enabled") !== 0,
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withRenderPipelineSettingsDefaults<T>(
    values: RenderPipelineSettingsDefaults,
    body: (pointer: number) => T,
  ): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_RenderPipelineSettings");
      this.routes.invoke("cna_render_pipeline_settings_init", structure.pointer);
    structure
      .setF32("exposure", values.Exposure)
      .setF32("gamma", values.Gamma)
      .setF32("bloom_intensity", values.BloomIntensity)
      .setU32("tonemapping_mode", values.TonemappingMode)
      .setU32("render_quality", values.RenderQuality)
      .setU32("shadow_quality", values.ShadowQuality)
      .setU8("hdr_enabled", values.HdrEnabled ? 1 : 0)
      .setU8("bloom_enabled", values.BloomEnabled ? 1 : 0)
      .setU8("ssao_enabled", values.SsaoEnabled ? 1 : 0)
      .setU8("shadows_enabled", values.ShadowsEnabled ? 1 : 0);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocRenderPipelineSettingsDefaults(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_RenderPipelineSettings");
    this.routes.invoke("cna_render_pipeline_settings_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_PunctualLightEXT` a route has written. */
  #readPunctualLight(structure: WasmStruct): PunctualLightSnapshot {
    return {
      Kind: structure.getU32("kind"),
      Position: readVector3(structure, "position"),
      Direction: readVector3(structure, "direction"),
      DiffuseColor: readVector3(structure, "diffuse_color"),
      Range: structure.getF32("range"),
      InnerAngle: structure.getF32("inner_angle"),
      OuterAngle: structure.getF32("outer_angle"),
      ShadowDepthBias: structure.getF32("shadow_depth_bias"),
      ShadowCube: structure.getU64("shadow_cube"),
      ShadowMap: structure.getU64("shadow_map"),
      ShadowViewProjection: structure.getF32Array("shadow_view_projection"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withPunctualLight<T>(values: PunctualLightSnapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_PunctualLightEXT");
      this.routes.invoke("cna_punctual_light_ext_init", structure.pointer);
    structure
      .setU32("kind", values.Kind)
      .setF32("range", values.Range)
      .setF32("inner_angle", values.InnerAngle)
      .setF32("outer_angle", values.OuterAngle)
      .setF32("shadow_depth_bias", values.ShadowDepthBias)
      .setU64("shadow_cube", values.ShadowCube)
      .setU64("shadow_map", values.ShadowMap);
    writeVector3(structure, "position", values.Position);
    writeVector3(structure, "direction", values.Direction);
    writeVector3(structure, "diffuse_color", values.DiffuseColor);
    structure.setF32Array("shadow_view_projection", values.ShadowViewProjection);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocPunctualLight(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_PunctualLightEXT");
    this.routes.invoke("cna_punctual_light_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_ShadowCascadeStateEXT` a route has written. */
  #readShadowCascadeState(structure: WasmStruct): ShadowCascadeStateSnapshot {
    return {
      Count: structure.getI32("count"),
      BlendBand: structure.getF32("blend_band"),
      WorldToAtlas: this.#readMatrixArray(structure, "world_to_atlas"),
      SplitDistance: structure.getF32Array("split_distance"),
      CameraView: structure.getF32Array("camera_view"),
      DebugTint: structure.getU8("debug_tint") !== 0,
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withShadowCascadeState<T>(values: ShadowCascadeStateSnapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_ShadowCascadeStateEXT");
      this.routes.invoke("cna_shadow_cascade_state_ext_init", structure.pointer);
    structure
      .setI32("count", Math.trunc(values.Count))
      .setF32("blend_band", values.BlendBand)
      .setU8("debug_tint", values.DebugTint ? 1 : 0);
    this.#writeMatrixArray(structure, "world_to_atlas", values.WorldToAtlas);
    structure.setF32Array("split_distance", values.SplitDistance);
    structure.setF32Array("camera_view", values.CameraView);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocShadowCascadeState(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_ShadowCascadeStateEXT");
    this.routes.invoke("cna_shadow_cascade_state_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_ImageBasedLightEXT` a route has written. */
  #readImageBasedLight(structure: WasmStruct): ImageBasedLightSnapshot {
    return {
      Irradiance: structure.getU64("irradiance"),
      PrefilteredSpecular: structure.getU64("prefiltered_specular"),
      BrdfLut: structure.getU64("brdf_lut"),
      PrefilteredMipCount: structure.getI32("prefiltered_mip_count"),
      Intensity: structure.getF32("intensity"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withImageBasedLight<T>(values: ImageBasedLightSnapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_ImageBasedLightEXT");
      this.routes.invoke("cna_image_based_light_ext_init", structure.pointer);
    structure
      .setU64("irradiance", values.Irradiance)
      .setU64("prefiltered_specular", values.PrefilteredSpecular)
      .setU64("brdf_lut", values.BrdfLut)
      .setI32("prefiltered_mip_count", Math.trunc(values.PrefilteredMipCount))
      .setF32("intensity", values.Intensity);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocImageBasedLight(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_ImageBasedLightEXT");
    this.routes.invoke("cna_image_based_light_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_AreaLightEXT` a route has written. */
  #readAreaLight(structure: WasmStruct): AreaLightSnapshot {
    return {
      Shape: structure.getU32("shape"),
      TwoSided: structure.getU8("two_sided") !== 0,
      Position: readVector3(structure, "position"),
      RightAxis: readVector3(structure, "right_axis"),
      UpAxis: readVector3(structure, "up_axis"),
      Color: readVector3(structure, "color"),
      Intensity: structure.getF32("intensity"),
      Range: structure.getF32("range"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withAreaLight<T>(values: AreaLightSnapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_AreaLightEXT");
      this.routes.invoke("cna_area_light_ext_init", structure.pointer);
    structure
      .setU32("shape", values.Shape)
      .setU8("two_sided", values.TwoSided ? 1 : 0)
      .setF32("intensity", values.Intensity)
      .setF32("range", values.Range);
    writeVector3(structure, "position", values.Position);
    writeVector3(structure, "right_axis", values.RightAxis);
    writeVector3(structure, "up_axis", values.UpAxis);
    writeVector3(structure, "color", values.Color);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocAreaLight(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_AreaLightEXT");
    this.routes.invoke("cna_area_light_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_AreaLightBrdfTerms` a route has written. */
  #readAreaLightBrdfTerms(structure: WasmStruct): AreaLightBrdfTermsSnapshot {
    return {
      Magnitude: structure.getF32("magnitude"),
      Fresnel: structure.getF32("fresnel"),
      AverageTangent: structure.getF32("average_tangent"),
      AverageNormal: structure.getF32("average_normal"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withAreaLightBrdfTerms<T>(values: AreaLightBrdfTermsSnapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_AreaLightBrdfTerms");
    structure
      .setF32("magnitude", values.Magnitude)
      .setF32("fresnel", values.Fresnel)
      .setF32("average_tangent", values.AverageTangent)
      .setF32("average_normal", values.AverageNormal);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocAreaLightBrdfTerms(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_AreaLightBrdfTerms");
    return structure;
  }

  /** Reads a `CNA_GltfMaterialSourceEXT` a route has written. */
  #readGltfMaterialSource(structure: WasmStruct): GltfMaterialSourceSnapshot {
    return {
      BaseColorFactor: readVector4(structure, "base_color_factor"),
      MetallicFactor: structure.getF32("metallic_factor"),
      RoughnessFactor: structure.getF32("roughness_factor"),
      EmissiveFactor: readVector3(structure, "emissive_factor"),
      NormalScale: structure.getF32("normal_scale"),
      OcclusionStrength: structure.getF32("occlusion_strength"),
      Ior: structure.getF32("ior_ext"),
      SpecularFactor: structure.getF32("specular_factor_ext"),
      SpecularColorFactor: readVector3(structure, "specular_color_factor_ext"),
      AlphaMode: structure.getU32("alpha_mode"),
      AlphaCutoff: structure.getF32("alpha_cutoff"),
      DoubleSided: structure.getU8("double_sided") !== 0,
      TextureCoordinateSets: structure.getI32Array("texture_coordinate_sets_ext"),
      TextureTransforms: this.#readTextureTransformArray(structure, "texture_transforms_ext"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withGltfMaterialSource<T>(values: GltfMaterialSourceSnapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_GltfMaterialSourceEXT");
      this.routes.invoke("cna_gltf_material_source_ext_init", structure.pointer);
    structure
      .setF32("metallic_factor", values.MetallicFactor)
      .setF32("roughness_factor", values.RoughnessFactor)
      .setF32("normal_scale", values.NormalScale)
      .setF32("occlusion_strength", values.OcclusionStrength)
      .setF32("ior_ext", values.Ior)
      .setF32("specular_factor_ext", values.SpecularFactor)
      .setU32("alpha_mode", values.AlphaMode)
      .setF32("alpha_cutoff", values.AlphaCutoff)
      .setU8("double_sided", values.DoubleSided ? 1 : 0);
    writeVector4(structure, "base_color_factor", values.BaseColorFactor);
    writeVector3(structure, "emissive_factor", values.EmissiveFactor);
    writeVector3(structure, "specular_color_factor_ext", values.SpecularColorFactor);
    structure.setI32Array("texture_coordinate_sets_ext", values.TextureCoordinateSets);
    this.#writeTextureTransformArray(structure, "texture_transforms_ext", values.TextureTransforms);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocGltfMaterialSource(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_GltfMaterialSourceEXT");
    this.routes.invoke("cna_gltf_material_source_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_GltfMaterialTexturesEXT` a route has written. */
  #readGltfMaterialTextures(structure: WasmStruct): GltfMaterialTexturesSnapshot {
    return {
      Slots: structure.getU64Array("slots"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withGltfMaterialTextures<T>(
    values: GltfMaterialTexturesSnapshot,
    body: (pointer: number) => T,
  ): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_GltfMaterialTexturesEXT");
      this.routes.invoke("cna_gltf_material_textures_ext_init", structure.pointer);
    structure.setU64Array("slots", values.Slots);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocGltfMaterialTextures(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_GltfMaterialTexturesEXT");
    this.routes.invoke("cna_gltf_material_textures_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_GltfMaterialExtensionSourceEXT` a route has written. */
  #readGltfExtensionSource(structure: WasmStruct): GltfExtensionSourceSnapshot {
    return {
      ClearcoatFactor: structure.getF32("clearcoat_factor_ext"),
      ClearcoatRoughnessFactor: structure.getF32("clearcoat_roughness_factor_ext"),
      SheenColorFactor: readVector3(structure, "sheen_color_factor_ext"),
      SheenRoughnessFactor: structure.getF32("sheen_roughness_factor_ext"),
      TransmissionFactor: structure.getF32("transmission_factor_ext"),
      ThicknessFactor: structure.getF32("thickness_factor_ext"),
      AttenuationDistance: structure.getF32("attenuation_distance_ext"),
      AttenuationColor: readVector3(structure, "attenuation_color_ext"),
      IridescenceFactor: structure.getF32("iridescence_factor_ext"),
      IridescenceIor: structure.getF32("iridescence_ior_ext"),
      IridescenceThicknessMinimum: structure.getF32("iridescence_thickness_minimum_ext"),
      IridescenceThicknessMaximum: structure.getF32("iridescence_thickness_maximum_ext"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withGltfExtensionSource<T>(
    values: GltfExtensionSourceSnapshot,
    body: (pointer: number) => T,
  ): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(
        this.routes.module, scope, "CNA_GltfMaterialExtensionSourceEXT",
      );
      this.routes.invoke("cna_gltf_material_extension_source_ext_init", structure.pointer);
    structure
      .setF32("clearcoat_factor_ext", values.ClearcoatFactor)
      .setF32("clearcoat_roughness_factor_ext", values.ClearcoatRoughnessFactor)
      .setF32("sheen_roughness_factor_ext", values.SheenRoughnessFactor)
      .setF32("transmission_factor_ext", values.TransmissionFactor)
      .setF32("thickness_factor_ext", values.ThicknessFactor)
      .setF32("attenuation_distance_ext", values.AttenuationDistance)
      .setF32("iridescence_factor_ext", values.IridescenceFactor)
      .setF32("iridescence_ior_ext", values.IridescenceIor)
      .setF32("iridescence_thickness_minimum_ext", values.IridescenceThicknessMinimum)
      .setF32("iridescence_thickness_maximum_ext", values.IridescenceThicknessMaximum);
    writeVector3(structure, "sheen_color_factor_ext", values.SheenColorFactor);
    writeVector3(structure, "attenuation_color_ext", values.AttenuationColor);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocGltfExtensionSource(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(
      this.routes.module, scope, "CNA_GltfMaterialExtensionSourceEXT",
    );
    this.routes.invoke("cna_gltf_material_extension_source_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_GltfMaterialExtensionTexturesEXT` a route has written. */
  #readGltfExtensionTextures(structure: WasmStruct): GltfExtensionTexturesSnapshot {
    return {
      Clearcoat: structure.getU64("clearcoat"),
      ClearcoatRoughness: structure.getU64("clearcoat_roughness"),
      ClearcoatNormal: structure.getU64("clearcoat_normal"),
      SheenColor: structure.getU64("sheen_color"),
      SheenRoughness: structure.getU64("sheen_roughness"),
      Transmission: structure.getU64("transmission"),
      Thickness: structure.getU64("thickness"),
      Iridescence: structure.getU64("iridescence"),
      IridescenceThickness: structure.getU64("iridescence_thickness"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withGltfExtensionTextures<T>(
    values: GltfExtensionTexturesSnapshot,
    body: (pointer: number) => T,
  ): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(
        this.routes.module, scope, "CNA_GltfMaterialExtensionTexturesEXT",
      );
      this.routes.invoke("cna_gltf_material_extension_textures_ext_init", structure.pointer);
    structure
      .setU64("clearcoat", values.Clearcoat)
      .setU64("clearcoat_roughness", values.ClearcoatRoughness)
      .setU64("clearcoat_normal", values.ClearcoatNormal)
      .setU64("sheen_color", values.SheenColor)
      .setU64("sheen_roughness", values.SheenRoughness)
      .setU64("transmission", values.Transmission)
      .setU64("thickness", values.Thickness)
      .setU64("iridescence", values.Iridescence)
      .setU64("iridescence_thickness", values.IridescenceThickness);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocGltfExtensionTextures(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(
      this.routes.module, scope, "CNA_GltfMaterialExtensionTexturesEXT",
    );
    this.routes.invoke("cna_gltf_material_extension_textures_ext_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_IndirectDrawArguments` a route has written. */
  #readIndirectDrawArguments(structure: WasmStruct): IndirectDrawArgumentsSnapshot {
    return {
      VertexCount: structure.getU32("vertex_count"),
      InstanceCount: structure.getU32("instance_count"),
      FirstVertex: structure.getU32("first_vertex"),
      BaseInstance: structure.getU32("base_instance"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withIndirectDrawArguments<T>(
    values: IndirectDrawArgumentsSnapshot,
    body: (pointer: number) => T,
  ): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_IndirectDrawArguments");
      this.routes.invoke("cna_indirect_draw_arguments_init", structure.pointer);
    structure
      .setU32("vertex_count", values.VertexCount)
      .setU32("instance_count", values.InstanceCount)
      .setU32("first_vertex", values.FirstVertex)
      .setU32("base_instance", values.BaseInstance);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocIndirectDrawArguments(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_IndirectDrawArguments");
    this.routes.invoke("cna_indirect_draw_arguments_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_IndirectDrawIndexedArguments` a route has written. */
  #readIndirectDrawIndexedArguments(structure: WasmStruct): IndirectDrawIndexedArgumentsSnapshot {
    return {
      IndexCount: structure.getU32("index_count"),
      InstanceCount: structure.getU32("instance_count"),
      FirstIndex: structure.getU32("first_index"),
      BaseVertex: structure.getI32("base_vertex"),
      BaseInstance: structure.getU32("base_instance"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withIndirectDrawIndexedArguments<T>(
    values: IndirectDrawIndexedArgumentsSnapshot,
    body: (pointer: number) => T,
  ): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(
        this.routes.module, scope, "CNA_IndirectDrawIndexedArguments",
      );
      this.routes.invoke("cna_indirect_draw_indexed_arguments_init", structure.pointer);
    structure
      .setU32("index_count", values.IndexCount)
      .setU32("instance_count", values.InstanceCount)
      .setU32("first_index", values.FirstIndex)
      .setI32("base_vertex", Math.trunc(values.BaseVertex))
      .setU32("base_instance", values.BaseInstance);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocIndirectDrawIndexedArguments(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_IndirectDrawIndexedArguments");
    this.routes.invoke("cna_indirect_draw_indexed_arguments_init", structure.pointer);
    return structure;
  }

  /** Reads a `CNA_GpuCullableInstance` a route has written. */
  #readGpuCullableInstance(structure: WasmStruct): GpuCullableInstanceSnapshot {
    return {
      World: structure.getF32Array("world"),
      Bounds: readBounds(structure, "bounds"),
    };
  }

  /**
   * Writes one, after CNA's own initializer has filled it.
   *
   * The initializer runs first because these structures are growable: `struct_size` selects which
   * fields CNA reads, and a zeroed one asks it to read a structure of no size.
   */
  #withGpuCullableInstance<T>(
    values: GpuCullableInstanceSnapshot,
    body: (pointer: number) => T,
  ): T {
    const scope = this.routes.scope();
    try {
      const structure = allocateStruct(this.routes.module, scope, "CNA_GpuCullableInstance");
      this.routes.invoke("cna_gpu_cullable_instance_init", structure.pointer);
    structure.setF32Array("world", values.World);
    writeBounds(structure, "bounds", values.Bounds);
      return body(structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** Allocates one, initialised, for a route that fills it. */
  #allocGpuCullableInstance(scope: WasmScope): WasmStruct {
    const structure = allocateStruct(this.routes.module, scope, "CNA_GpuCullableInstance");
    this.routes.invoke("cna_gpu_cullable_instance_init", structure.pointer);
    return structure;
  }

  /**
   * A fixed-size array of `CNA_TextureTransformEXT` nested in a structure.
   *
   * The count comes from the field's own measured size divided by the transform's, so a material
   * that grows a texture slot is read correctly without this file changing.
   */
  #readTextureTransformArray(structure: WasmStruct, field: string): TextureTransformSnapshot[] {
    const stride = WASM_STRUCT_LAYOUTS.CNA_TextureTransformEXT.size;
    return this.#nested(structure, field, stride, (entry) => this.#readTextureTransform(entry));
  }

  #writeTextureTransformArray(
    structure: WasmStruct, field: string, values: readonly TextureTransformSnapshot[],
  ): void {
    const stride = WASM_STRUCT_LAYOUTS.CNA_TextureTransformEXT.size;
    this.#eachNested(structure, field, stride, (entry, index) => {
      const value = values[index];
      if (value === undefined) return;
      writeVector2(entry, "offset", value.Offset);
      writeVector2(entry, "scale", value.Scale);
      entry.setF32("rotation", value.Rotation);
    });
  }

  /** The same for an array of `CNA_Matrix`, which is sixteen floats an entry. */
  #readMatrixArray(structure: WasmStruct, field: string): number[][] {
    const entry = this.#field(structure, field);
    const view = this.routes.view();
    const count = Math.floor(entry.size / WASM_STRUCT_LAYOUTS.CNA_Matrix.size);
    return Array.from({ length: count }, (_, index) => Array.from(
      { length: 16 },
      (__, element) => view.getFloat32(
        structure.pointer + entry.offset + index * WASM_STRUCT_LAYOUTS.CNA_Matrix.size
        + element * 4, true),
    ));
  }

  #writeMatrixArray(
    structure: WasmStruct, field: string, values: readonly (readonly number[])[],
  ): void {
    const entry = this.#field(structure, field);
    const view = this.routes.view();
    const count = Math.floor(entry.size / WASM_STRUCT_LAYOUTS.CNA_Matrix.size);
    for (let index = 0; index < count; index += 1) {
      const matrix = values[index];
      for (let element = 0; element < 16; element += 1) {
        view.setFloat32(
          structure.pointer + entry.offset + index * WASM_STRUCT_LAYOUTS.CNA_Matrix.size
          + element * 4, matrix?.[element] ?? 0, true);
      }
    }
  }

  #nested<T>(
    structure: WasmStruct, field: string, stride: number, read: (entry: WasmStruct) => T,
  ): T[] {
    const entry = this.#field(structure, field);
    const count = Math.floor(entry.size / stride);
    return Array.from({ length: count }, (_, index) => read(new WasmStruct(
      this.routes.module, "CNA_TextureTransformEXT",
      structure.pointer + entry.offset + index * stride)));
  }

  #eachNested(
    structure: WasmStruct, field: string, stride: number,
    write: (entry: WasmStruct, index: number) => void,
  ): void {
    const entry = this.#field(structure, field);
    const count = Math.floor(entry.size / stride);
    for (let index = 0; index < count; index += 1) {
      write(new WasmStruct(
        this.routes.module, "CNA_TextureTransformEXT",
        structure.pointer + entry.offset + index * stride), index);
    }
  }

  /** A field's measured offset and size, from the structure's own layout. */
  #field(structure: WasmStruct, field: string): { offset: number; size: number } {
    const entry = structure.layout.fields[field];
    if (!entry) throw new Error(`the measured layout has no field ${field}`);
    return entry;
  }


  // --- the members whose shape is an array, a callback, or two structures at once --------------
  //
  // Everything above this line is one structure in or one out. These are the rest: a culler handed
  // a whole array of bounds and answering an array of indices, a debug draw whose vertices come
  // back as a counted buffer, three routes that drive a caller's callback, and the two contribution
  // routes whose sixteen arguments are five vectors and eleven scalars spelled out because C has no
  // defaults.

  public override destroyRenderPipeline(pipeline: NativeHandle): void {
    this.routes.invoke("cna_render_pipeline_destroy", pipeline);
  }

  /**
   * The pipeline's frame statistics: one structure and two scalars, from three routes.
   *
   * `LastFramePassCount` is deliberately its own route rather than the structure's `passes_run`.
   * They are the same number today; reading it from the route the public accessor names keeps them
   * separable if CNA ever makes them different.
   */
  public override getRenderPipelineStatistics(
    pipeline: NativeHandle,
  ): RenderPipelineStatisticsSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocRenderPipelineStatistics(scope);
      this.routes.invoke("cna_render_pipeline_get_statistics", pipeline, structure.pointer);
      return {
        ...this.#readRenderPipelineStatistics(structure),
        LastFramePassCount: this.mem.int(
          "cna_render_pipeline_get_last_frame_pass_count", pipeline),
        GpuMemoryEstimateBytes: BigInt(this.mem.u64AsNumber(
          "cna_render_pipeline_get_gpu_memory_estimate_bytes", pipeline)),
      };
    } finally {
      scope.dispose();
    }
  }

  public override getPbrMaterialExtHashCode(material: PbrMaterialExtSnapshot): bigint {
    return this.#withPbrMaterialExt(material, (pointer) => {
      const scope = this.routes.scope();
      try {
        const out = scope.allocate(8);
        this.routes.invoke("cna_pbr_material_ext_get_hash_code", pointer, out);
        return this.routes.view().getBigUint64(out, true);
      } finally {
        scope.dispose();
      }
    });
  }

  public override getPbrMaterialExtensionsHashCode(extensions: NativeHandle): bigint {
    const scope = this.routes.scope();
    try {
      const out = scope.allocate(8);
      this.routes.invoke("cna_pbr_material_extensions_get_hash_code", extensions, out);
      return this.routes.view().getBigUint64(out, true);
    } finally {
      scope.dispose();
    }
  }

  // --- the device's own state, read back --------------------------------------------------------

  public override getDeviceBlendState(device: NativeHandle): BlendStateSnapshot {
    const scope = this.routes.scope();
    try {
      const state = allocateStruct(this.routes.module, scope, "CNA_BlendState");
      this.routes.invoke("cna_graphics_device_get_blend_state", device, state.pointer);
      return {
        AlphaBlendFunction: state.getU32("alpha_blend_function"),
        AlphaDestinationBlend: state.getU32("alpha_destination_blend"),
        AlphaSourceBlend: state.getU32("alpha_source_blend"),
        ColorBlendFunction: state.getU32("color_blend_function"),
        ColorDestinationBlend: state.getU32("color_destination_blend"),
        ColorSourceBlend: state.getU32("color_source_blend"),
        ColorWriteChannels: state.getU32("color_write_channels"),
        ColorWriteChannels1: state.getU32("color_write_channels1"),
        ColorWriteChannels2: state.getU32("color_write_channels2"),
        ColorWriteChannels3: state.getU32("color_write_channels3"),
        BlendFactor: state.getU32("blend_factor"),
        MultiSampleMask: state.getI32("multi_sample_mask"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override getDeviceRasterizerState(device: NativeHandle): RasterizerStateSnapshot {
    const scope = this.routes.scope();
    try {
      const state = allocateStruct(this.routes.module, scope, "CNA_RasterizerState");
      this.routes.invoke("cna_graphics_device_get_rasterizer_state", device, state.pointer);
      return {
        CullMode: state.getU32("cull_mode"),
        FillMode: state.getU32("fill_mode"),
        DepthBias: state.getF32("depth_bias"),
        SlopeScaleDepthBias: state.getF32("slope_scale_depth_bias"),
        MultiSampleAntiAlias: state.getU8("multi_sample_anti_alias") !== 0,
        ScissorTestEnable: state.getU8("scissor_test_enable") !== 0,
      };
    } finally {
      scope.dispose();
    }
  }

  // --- the frustum culler, which takes arrays and answers arrays --------------------------------

  public override isFrustumCullerBoxVisible(
    culler: NativeHandle, box: ClusterBoundsSnapshot,
  ): boolean {
    const scope = this.routes.scope();
    try {
      return this.mem.bool(
        "cna_frustum_culler_ext_is_box_visible", culler, this.mem.writeBounds(scope, box));
    } finally {
      scope.dispose();
    }
  }

  public override isFrustumCullerSphereVisible(
    culler: NativeHandle, sphere: BoundingSphereSnapshot,
  ): boolean {
    const scope = this.routes.scope();
    try {
      return this.mem.bool(
        "cna_frustum_culler_ext_is_sphere_visible", culler, this.#writeSphere(scope, sphere));
    } finally {
      scope.dispose();
    }
  }

  /** The indices of the boxes that survive, counted through the copy route first. */
  public override frustumCullerCullBoxes(
    culler: NativeHandle, bounds: readonly ClusterBoundsSnapshot[],
  ): readonly number[] {
    const scope = this.routes.scope();
    try {
      const buffer = this.#writeBoundsArray(scope, bounds);
      return this.#u64Indices(
        "cna_frustum_culler_ext_cull_boxes", [culler, buffer, BigInt(bounds.length)],
        bounds.length);
    } finally {
      scope.dispose();
    }
  }

  public override frustumCullerCullSpheres(
    culler: NativeHandle, bounds: readonly BoundingSphereSnapshot[],
  ): readonly number[] {
    const scope = this.routes.scope();
    try {
      const buffer = this.#writeSphereArray(scope, bounds);
      return this.#u64Indices(
        "cna_frustum_culler_ext_cull_spheres", [culler, buffer, BigInt(bounds.length)],
        bounds.length);
    } finally {
      scope.dispose();
    }
  }

  /** The transforms that survive, which come back as matrices rather than as indices. */
  public override frustumCullerCullTransforms(
    culler: NativeHandle, transforms: readonly (readonly number[])[],
    bounds: readonly ClusterBoundsSnapshot[],
  ): readonly (readonly number[])[] {
    const scope = this.routes.scope();
    try {
      const stride = WASM_STRUCT_LAYOUTS.CNA_Matrix.size;
      const input = scope.allocate(stride * Math.max(transforms.length, 1));
      const view = this.routes.view();
      transforms.forEach((matrix, index) => {
        for (let element = 0; element < 16; element += 1) {
          view.setFloat32(input + index * stride + element * 4, matrix[element] ?? 0, true);
        }
      });
      const boundsBuffer = this.#writeBoundsArray(scope, bounds);
      const destination = scope.allocate(stride * Math.max(transforms.length, 1));
      const written = scope.allocate(8);
      this.routes.invoke(
        "cna_frustum_culler_ext_cull_transforms", culler, input, BigInt(transforms.length),
        boundsBuffer, BigInt(bounds.length), destination, BigInt(transforms.length), written,
      );
      const count = Number(this.routes.view().getBigUint64(written, true));
      const memory = this.routes.view();
      return Array.from({ length: count }, (_, index) => Array.from(
        { length: 16 },
        (__, element) => memory.getFloat32(destination + index * stride + element * 4, true),
      ));
    } finally {
      scope.dispose();
    }
  }

  /**
   * The instances the GPU culler tests.
   *
   * The culler itself answers `is_supported` false on WebGL 2.0, and upstream finding 20 records
   * that where it does run it keeps everything. Both are facts about CNA and the renderer; the
   * instances still have to reach it correctly for either to be observable.
   */
  public override setGpuInstanceCullerInstances(
    culler: NativeHandle, instances: readonly CullableInstanceSnapshot[],
  ): void {
    const scope = this.routes.scope();
    try {
      const layout = WASM_STRUCT_LAYOUTS.CNA_GpuCullableInstance;
      const buffer = scope.allocate(layout.size * Math.max(instances.length, 1));
      instances.forEach((instance, index) => {
        const structure = new WasmStruct(
          this.routes.module, "CNA_GpuCullableInstance", buffer + layout.size * index);
        this.routes.invoke("cna_gpu_cullable_instance_init", structure.pointer);
        structure.setF32Array("world", instance.World);
        writeBounds(structure, "bounds", instance.Bounds);
      });
      this.routes.invoke(
        "cna_gpu_instance_culler_set_instances", culler, buffer, BigInt(instances.length));
    } finally {
      scope.dispose();
    }
  }

  // --- the debug draw ---------------------------------------------------------------------------

  public override addDebugDrawBox(
    debug: NativeHandle, bounds: ClusterBoundsSnapshot, color: number,
  ): void {
    const scope = this.routes.scope();
    try {
      this.routes.invoke(
        "cna_debug_draw_add_box", debug, this.mem.writeBounds(scope, bounds), color >>> 0);
    } finally {
      scope.dispose();
    }
  }

  public override addDebugDrawBoundingSphere(
    debug: NativeHandle, sphere: BoundingSphereSnapshot, color: number, segments: number,
  ): void {
    const scope = this.routes.scope();
    try {
      this.routes.invoke(
        "cna_debug_draw_add_bounding_sphere", debug, this.#writeSphere(scope, sphere),
        color >>> 0, Math.trunc(segments),
      );
    } finally {
      scope.dispose();
    }
  }

  public override addDebugDrawPointLightGizmo(
    debug: NativeHandle, light: PointLightSnapshot, color: number,
  ): void {
    const scope = this.routes.scope();
    try {
      this.routes.invoke(
        "cna_debug_draw_add_point_light_gizmo", debug, this.#writePointLight(scope, light),
        color >>> 0);
    } finally {
      scope.dispose();
    }
  }

  public override addDebugDrawSpotLightGizmo(
    debug: NativeHandle, light: SpotLightSnapshot, color: number, segments: number,
  ): void {
    const scope = this.routes.scope();
    try {
      this.routes.invoke(
        "cna_debug_draw_add_spot_light_gizmo", debug, this.#writeSpotLight(scope, light),
        color >>> 0, Math.trunc(segments),
      );
    } finally {
      scope.dispose();
    }
  }

  public override addDebugDrawDirectionalLightGizmo(
    debug: NativeHandle, light: DirectionalLightSnapshot, at: Vector3Snapshot, length: number,
    color: number,
  ): void {
    const scope = this.routes.scope();
    try {
      this.mem.withVector3(at, (atPointer) => this.routes.invoke(
        "cna_debug_draw_add_directional_light_gizmo", debug,
        this.#writeDirectionalLight(scope, light), atPointer, length, color >>> 0,
      ));
    } finally {
      scope.dispose();
    }
  }

  /** Every vertex the debug draw accumulated, at the measured `CNA_VertexPositionColor` stride. */
  public override getDebugDrawVertices(
    debug: NativeHandle, depthTested: boolean,
  ): readonly DebugVertexSnapshot[] {
    const layout = WASM_STRUCT_LAYOUTS.CNA_VertexPositionColor;
    return this.mem.probedArray(
      "cna_debug_draw_copy_vertices", [debug, depthTested ? 1 : 0], layout.size,
      (base, written) => {
        const view = this.routes.view();
        return Array.from({ length: written }, (_, index) => {
          const at = base + layout.size * index;
          return {
            Position: {
              X: view.getFloat32(at + layout.fields.position.offset, true),
              Y: view.getFloat32(at + layout.fields.position.offset + 4, true),
              Z: view.getFloat32(at + layout.fields.position.offset + 8, true),
            },
            Color: view.getUint32(at + layout.fields.color.offset, true),
          };
        });
      });
  }

  // --- the pipeline's settings text and its timings ---------------------------------------------

  /**
   * Applies a settings string in place, and answers how many settings it changed.
   *
   * The structure is both the input and the output -- CNA edits it -- so it is read back out of
   * the same buffer the text was applied to rather than out of a second one.
   */
  public override applyPipelineSettingsFromString(
    settings: PipelineSettingsSnapshot, text: string,
  ): { readonly Applied: number; readonly Settings: PipelineSettingsSnapshot } {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocPipelineSettings(scope);
      this.#writePipelineSettingsInto(structure, settings);
      const applied = scope.allocate(4);
      this.mem.withStringView(text, (view) => this.routes.invoke(
        "cna_render_pipeline_settings_ext_apply_from_string", structure.pointer, view, applied));
      return {
        Applied: this.routes.view().getInt32(applied, true),
        Settings: this.#readPipelineSettings(structure),
      };
    } finally {
      scope.dispose();
    }
  }

  public override getPipelinePassTiming(
    pipeline: NativeHandle, index: number,
  ): { readonly Milliseconds: number; readonly SampleCount: number } {
    const scope = this.routes.scope();
    try {
      const timing = allocateStruct(this.routes.module, scope, "CNA_PassTimingEXT");
      this.routes.invoke(
        "cna_render_pipeline_get_pass_timing_ext", pipeline, BigInt(Math.trunc(index)),
        timing.pointer);
      return {
        Milliseconds: timing.getF64("milliseconds"),
        SampleCount: timing.getI32("sample_count"),
      };
    } finally {
      scope.dispose();
    }
  }

  // --- the clustered GPU builder and the shading contribution -----------------------------------

  /**
   * The GPU cluster builder, which answers `is_supported` **false** on WebGL 2.0.
   *
   * Bound because it is how a consumer asks and CNA's refusal is the honest answer. The CPU
   * assignment beside it is a different object and works here.
   */
  public override assignClusteredLightCompute(
    compute: NativeHandle, grid: NativeHandle, view: readonly number[],
    bounds: readonly BoundingSphereSnapshot[], assignment: NativeHandle,
  ): void {
    const scope = this.routes.scope();
    try {
      this.routes.invoke(
        "cna_clustered_light_compute_assign", compute, grid,
        this.mem.writeMatrix(scope, view), this.#writeSphereArray(scope, bounds),
        BigInt(bounds.length), assignment,
      );
    } finally {
      scope.dispose();
    }
  }

  /**
   * One light's contribution to one surface point: sixteen arguments, five of them vectors.
   *
   * C has no default arguments, so every effect the canonical overload defaults is spelled out.
   * The snapshot carries them all and this passes them all, in the order the declaration gives.
   */
  public override clusteredLightContribution(
    inputs: ClusteredContributionSnapshot,
  ): Vector3Snapshot {
    const scope = this.routes.scope();
    try {
      return this.mem.vector3(
        "cna_clustered_forward_effect_contribution",
        this.#writeClusteredLight(scope, inputs.Light),
        this.#writeVector(scope, inputs.Surface), this.#writeVector(scope, inputs.Normal),
        this.#writeVector(scope, inputs.CameraPosition), this.#writeVector(scope, inputs.BaseColor),
        inputs.Metallic, inputs.Roughness, inputs.Clearcoat, inputs.ClearcoatRoughness,
        this.#writeVector(scope, inputs.SheenColor), inputs.SheenRoughness, inputs.Iridescence,
        inputs.IridescenceIor, inputs.IridescenceThickness,
        this.#writeVector(scope, inputs.SubsurfaceColor), inputs.SubsurfaceWrap,
      );
    } finally {
      scope.dispose();
    }
  }

  /** The same, with the effects taken from a material-extensions object rather than spelled out. */
  public override clusteredLightContributionWithExtensions(
    inputs: ClusteredContributionSnapshot, extensions: NativeHandle,
  ): Vector3Snapshot {
    const scope = this.routes.scope();
    try {
      return this.mem.vector3(
        "cna_clustered_forward_effect_contribution_with_extensions",
        this.#writeClusteredLight(scope, inputs.Light),
        this.#writeVector(scope, inputs.Surface), this.#writeVector(scope, inputs.Normal),
        this.#writeVector(scope, inputs.CameraPosition), this.#writeVector(scope, inputs.BaseColor),
        inputs.Metallic, inputs.Roughness, extensions,
      );
    } finally {
      scope.dispose();
    }
  }

  // --- area lights ------------------------------------------------------------------------------

  public override getAreaLightBrdfTableGenerationMilliseconds(table: NativeHandle): number {
    const scope = this.routes.scope();
    try {
      const out = scope.allocate(8);
      this.routes.invoke(
        "cna_area_light_brdf_table_get_generation_milliseconds", table, out);
      return this.routes.view().getFloat64(out, true);
    } finally {
      scope.dispose();
    }
  }

  /** The four corners of the light as seen from a surface point, written into caller memory. */
  public override getAreaLightQuad(
    light: AreaLightSnapshot, surface: Vector3Snapshot,
  ): readonly Vector3Snapshot[] {
    return this.#withAreaLight(light, (lightPointer) =>
      this.mem.withVector3(surface, (surfacePointer) => {
        const scope = this.routes.scope();
        try {
          const stride = WASM_STRUCT_LAYOUTS.CNA_Vector3.size;
          const quad = scope.allocate(stride * 4);
          this.routes.invoke(
            "cna_area_light_shading_quad_of", lightPointer, surfacePointer, quad);
          const view = this.routes.view();
          return Array.from({ length: 4 }, (_, index) => ({
            X: view.getFloat32(quad + index * stride, true),
            Y: view.getFloat32(quad + index * stride + 4, true),
            Z: view.getFloat32(quad + index * stride + 8, true),
          }));
        } finally {
          scope.dispose();
        }
      }));
  }

  public override getAreaLightCoverage(
    quad: readonly Vector3Snapshot[], surface: Vector3Snapshot, lobeAxis: Vector3Snapshot,
    lobeScale: number, twoSided: boolean,
  ): number {
    const scope = this.routes.scope();
    try {
      const stride = WASM_STRUCT_LAYOUTS.CNA_Vector3.size;
      const buffer = scope.allocate(stride * Math.max(quad.length, 1));
      const view = this.routes.view();
      quad.forEach((corner, index) => {
        view.setFloat32(buffer + index * stride, corner.X, true);
        view.setFloat32(buffer + index * stride + 4, corner.Y, true);
        view.setFloat32(buffer + index * stride + 8, corner.Z, true);
      });
      return this.mem.float(
        "cna_area_light_shading_coverage", buffer, this.#writeVector(scope, surface),
        this.#writeVector(scope, lobeAxis), lobeScale, twoSided ? 1 : 0,
      );
    } finally {
      scope.dispose();
    }
  }

  // --- the transparency list --------------------------------------------------------------------

  /**
   * Submits one draw into the sorted list, running the caller's own draw inside CNA's call.
   *
   * The callback is rooted for exactly this submission and removed in a `finally`, and a
   * JavaScript exception is held rather than allowed to unwind into compiled C -- the same
   * contract the light-probe baker's capture callback keeps.
   */
  public override submitTransparentDraw(
    list: NativeHandle, bounds: ClusterBoundsSnapshot, draw: () => void,
  ): void {
    this.#withContextCallback(draw, (callback) => {
      const scope = this.routes.scope();
      try {
        this.routes.invoke(
          "cna_transparent_draw_list_submit", list, this.mem.writeBounds(scope, bounds),
          callback, 0);
      } finally {
        scope.dispose();
      }
    });
  }

  /** The order the list would draw in, as indices into it. */
  public override getTransparentDrawListSortedOrder(
    list: NativeHandle, view: readonly number[],
  ): readonly number[] {
    const count = this.mem.u64AsNumber("cna_transparent_draw_list_get_count", list);
    if (count === 0) return [];
    const scope = this.routes.scope();
    try {
      const destination = scope.allocate(count * 4);
      const written = scope.allocate(8);
      this.routes.invoke(
        "cna_transparent_draw_list_copy_sorted_order_ext", list,
        this.mem.writeMatrix(scope, view), destination, BigInt(count), written,
      );
      const memory = this.routes.view();
      const total = Number(memory.getBigUint64(written, true));
      return Array.from({ length: total }, (_, index) =>
        memory.getInt32(destination + index * 4, true));
    } finally {
      scope.dispose();
    }
  }

  public override getTransparentDrawSortKey(
    bounds: ClusterBoundsSnapshot, cameraPosition: Vector3Snapshot,
  ): number {
    const scope = this.routes.scope();
    try {
      return this.mem.float(
        "cna_transparent_draw_list_sort_key", this.mem.writeBounds(scope, bounds),
        this.#writeVector(scope, cameraPosition),
      );
    } finally {
      scope.dispose();
    }
  }

  // --- the shader effect's remaining uniforms ---------------------------------------------------

  /** A `CNA_Vector4` taken **by value**, which wasm32 lowers as a pointer to a caller copy. */
  public override setShaderEffectUniformVector4(
    effect: NativeHandle, name: string, value: Vector4Snapshot,
  ): void {
    const scope = this.routes.scope();
    try {
      const vector = scope.allocate(16);
      const view = this.routes.view();
      view.setFloat32(vector, value.X, true);
      view.setFloat32(vector + 4, value.Y, true);
      view.setFloat32(vector + 8, value.Z, true);
      view.setFloat32(vector + 12, value.W, true);
      this.mem.withStringView(name, (nameView) => this.routes.invoke(
        "cna_shader_effect_set_uniform_vector4", effect, nameView, vector));
    } finally {
      scope.dispose();
    }
  }

  public override setShaderEffectUniformVector2Array(
    effect: NativeHandle, name: string, values: readonly Vector2Snapshot[],
  ): void {
    const scope = this.routes.scope();
    try {
      const stride = WASM_STRUCT_LAYOUTS.CNA_Vector2.size;
      const buffer = scope.allocate(stride * Math.max(values.length, 1));
      const view = this.routes.view();
      values.forEach((value, index) => {
        view.setFloat32(buffer + index * stride, value.X, true);
        view.setFloat32(buffer + index * stride + 4, value.Y, true);
      });
      this.mem.withStringView(name, (nameView) => this.routes.invoke(
        "cna_shader_effect_set_uniform_vector2_array", effect, nameView, buffer,
        BigInt(values.length)));
    } finally {
      scope.dispose();
    }
  }

  /** A uniform block: an array of `CNA_StringView` and a parallel array of offsets. */
  public override declareShaderEffectUniformBlock(
    effect: NativeHandle, blockSizeBytes: number, names: readonly string[],
    offsets: readonly number[],
  ): void {
    if (names.length !== offsets.length) {
      throw new RangeError(
        `a uniform block has one offset per name: ${names.length} names, ` +
        `${offsets.length} offsets`);
    }
    const scope = this.routes.scope();
    try {
      const layout = WASM_STRUCT_LAYOUTS.CNA_StringView;
      const views = scope.allocate(layout.size * Math.max(names.length, 1));
      names.forEach((name, index) => {
        const text = scope.allocateUtf8(name);
        new WasmStruct(this.routes.module, "CNA_StringView", views + layout.size * index)
          .setPointer("data", text.pointer)
          .setU64("byte_length", BigInt(text.byteLength));
      });
      const offsetBuffer = scope.allocate(4 * Math.max(offsets.length, 1));
      const view = this.routes.view();
      offsets.forEach((offset, index) => {
        view.setInt32(offsetBuffer + index * 4, Math.trunc(offset), true);
      });
      this.routes.invoke(
        "cna_shader_effect_declare_uniform_block_ext", effect, Math.trunc(blockSizeBytes),
        views, offsetBuffer, BigInt(names.length),
      );
    } finally {
      scope.dispose();
    }
  }

  // --- the pipeline's two scene callbacks -------------------------------------------------------

  /**
   * The shadow scene: a map, a light, the bounds it covers, and the caller's own caster draw.
   *
   * `null` clears the callback, which is how a pipeline stops drawing casters -- and the function
   * pointer for the previous one is released with it, so a page that clears the scene does not
   * leave a table entry pointing at a closure it has forgotten.
   */
  public override setRenderPipelineShadowScene(
    pipeline: NativeHandle, shadowMap: NativeHandle, light: DirectionalLightSnapshot,
    sceneBounds: ClusterBoundsSnapshot, drawCasters: (() => void) | null,
  ): void {
    const scope = this.routes.scope();
    try {
      const callback = drawCasters == null
        ? 0 : this.#retainSceneCallback(pipeline, "shadow", drawCasters);
      if (drawCasters == null) this.#releaseSceneCallback(pipeline, "shadow");
      this.routes.invoke(
        "cna_render_pipeline_set_shadow_scene", pipeline, shadowMap,
        this.#writeDirectionalLight(scope, light), this.mem.writeBounds(scope, sceneBounds),
        callback, 0,
      );
    } finally {
      scope.dispose();
    }
  }

  public override setRenderPipelineTransparentScene(
    pipeline: NativeHandle, draw: (() => void) | null,
  ): void {
    const callback = draw == null
      ? 0 : this.#retainSceneCallback(pipeline, "transparent", draw);
    if (draw == null) this.#releaseSceneCallback(pipeline, "transparent");
    this.routes.invoke("cna_render_pipeline_set_transparent_scene", pipeline, callback, 0);
  }

  // --- the skinned PBR effect's bone palette ----------------------------------------------------

  public override getSkinnedPbrEffectBoneTransforms(
    effect: NativeHandle, count: number,
  ): readonly (readonly number[])[] {
    const stride = WASM_STRUCT_LAYOUTS.CNA_Matrix.size;
    const scope = this.routes.scope();
    try {
      const destination = scope.allocate(stride * Math.max(Math.trunc(count), 1));
      const written = scope.allocate(8);
      this.routes.invoke(
        "cna_skinned_pbr_effect_copy_bone_transforms", effect, BigInt(Math.trunc(count)),
        destination, BigInt(Math.trunc(count)), written,
      );
      const view = this.routes.view();
      const total = Number(view.getBigUint64(written, true));
      return Array.from({ length: total }, (_, index) => Array.from(
        { length: 16 },
        (__, element) => view.getFloat32(destination + index * stride + element * 4, true),
      ));
    } finally {
      scope.dispose();
    }
  }

  public override setSkinnedPbrEffectBoneTransforms(
    effect: NativeHandle, transforms: readonly (readonly number[])[],
  ): void {
    const scope = this.routes.scope();
    try {
      const stride = WASM_STRUCT_LAYOUTS.CNA_Matrix.size;
      const buffer = scope.allocate(stride * Math.max(transforms.length, 1));
      const view = this.routes.view();
      transforms.forEach((matrix, index) => {
        if (matrix.length !== 16) {
          throw new RangeError(`bone ${index} is ${matrix.length} floats, not sixteen`);
        }
        for (let element = 0; element < 16; element += 1) {
          view.setFloat32(buffer + index * stride + element * 4, matrix[element] as number, true);
        }
      });
      this.routes.invoke(
        "cna_skinned_pbr_effect_set_bone_transforms", effect, buffer,
        BigInt(transforms.length));
    } finally {
      scope.dispose();
    }
  }

  // --- the shapes these members share -----------------------------------------------------------

  #writeVector(scope: WasmScope, value: Vector3Snapshot): number {
    return this.mem.writeVector3(scope, [value.X, value.Y, value.Z]);
  }

  #writeSphere(scope: WasmScope, sphere: BoundingSphereSnapshot): number {
    const layout = WASM_STRUCT_LAYOUTS.CNA_BoundingSphere;
    const pointer = scope.allocate(layout.size);
    const view = this.routes.view();
    view.setFloat32(pointer + layout.fields.center.offset, sphere.Center.X, true);
    view.setFloat32(pointer + layout.fields.center.offset + 4, sphere.Center.Y, true);
    view.setFloat32(pointer + layout.fields.center.offset + 8, sphere.Center.Z, true);
    view.setFloat32(pointer + layout.fields.radius.offset, sphere.Radius, true);
    return pointer;
  }

  #writeSphereArray(scope: WasmScope, spheres: readonly BoundingSphereSnapshot[]): number {
    const layout = WASM_STRUCT_LAYOUTS.CNA_BoundingSphere;
    const buffer = scope.allocate(layout.size * Math.max(spheres.length, 1));
    const view = this.routes.view();
    spheres.forEach((sphere, index) => {
      const at = buffer + layout.size * index;
      view.setFloat32(at + layout.fields.center.offset, sphere.Center.X, true);
      view.setFloat32(at + layout.fields.center.offset + 4, sphere.Center.Y, true);
      view.setFloat32(at + layout.fields.center.offset + 8, sphere.Center.Z, true);
      view.setFloat32(at + layout.fields.radius.offset, sphere.Radius, true);
    });
    return buffer;
  }

  #writeBoundsArray(scope: WasmScope, bounds: readonly ClusterBoundsSnapshot[]): number {
    const layout = WASM_STRUCT_LAYOUTS.CNA_BoundingBox;
    const buffer = scope.allocate(layout.size * Math.max(bounds.length, 1));
    bounds.forEach((box, index) => {
      writeBounds(
        new WasmStruct(this.routes.module, "CNA_BoundingBox", buffer + layout.size * index),
        "min", box);
    });
    return buffer;
  }

  /** A route answering `uint64_t` indices, counted through its own copy route first. */
  #u64Indices(
    route: string, leading: readonly (number | bigint)[], capacity: number,
  ): readonly number[] {
    const scope = this.routes.scope();
    try {
      const destination = scope.allocate(8 * Math.max(capacity, 1));
      const written = scope.allocate(8);
      this.routes.invoke(route, ...leading, destination, BigInt(capacity), written);
      const view = this.routes.view();
      const count = Number(view.getBigUint64(written, true));
      return Array.from({ length: count }, (_, index) =>
        Number(view.getBigUint64(destination + index * 8, true)));
    } finally {
      scope.dispose();
    }
  }

  #writePointLight(scope: WasmScope, light: PointLightSnapshot): number {
    const structure = allocateStruct(this.routes.module, scope, "CNA_PointLightEXT");
    this.routes.invoke("cna_point_light_ext_init", structure.pointer);
    structure
      .setF32Array("position", [light.Position.X, light.Position.Y, light.Position.Z])
      .setF32Array("color", [light.Color.X, light.Color.Y, light.Color.Z])
      .setF32("intensity", light.Intensity)
      .setF32("range", light.Range)
      .setU8("casts_shadows", light.CastsShadows ? 1 : 0);
    return structure.pointer;
  }

  #writeSpotLight(scope: WasmScope, light: SpotLightSnapshot): number {
    const structure = allocateStruct(this.routes.module, scope, "CNA_SpotLightEXT");
    this.routes.invoke("cna_spot_light_ext_init", structure.pointer);
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

  #writeDirectionalLight(scope: WasmScope, light: DirectionalLightSnapshot): number {
    const structure = allocateStruct(this.routes.module, scope, "CNA_DirectionalLightEXT");
    this.routes.invoke("cna_directional_light_ext_init", structure.pointer);
    structure
      .setF32Array("direction", [light.Direction.X, light.Direction.Y, light.Direction.Z])
      .setF32Array("color", [light.Color.X, light.Color.Y, light.Color.Z])
      .setF32("intensity", light.Intensity);
    return structure.pointer;
  }

  #writeClusteredLight(scope: WasmScope, light: ClusteredLightSnapshot): number {
    const structure = allocateStruct(this.routes.module, scope, "CNA_ClusteredLightEXT");
    this.routes.invoke("cna_clustered_light_ext_init", structure.pointer);
    structure
      .setU32("type", light.Type)
      .setU8("casts_shadows", light.CastsShadows ? 1 : 0)
      .setF32Array("position", [light.Position.X, light.Position.Y, light.Position.Z])
      .setF32Array("direction", [light.Direction.X, light.Direction.Y, light.Direction.Z])
      .setF32Array("color", [light.Color.X, light.Color.Y, light.Color.Z])
      .setF32("intensity", light.Intensity)
      .setF32("range", light.Range)
      .setF32("inner_angle", light.InnerAngle)
      .setF32("outer_angle", light.OuterAngle);
    return structure.pointer;
  }

  /**
   * A context-only callback rooted for one call, released in a `finally`.
   *
   * A JavaScript exception is held rather than allowed to unwind into compiled C: the callback
   * answers `CNA_RESULT_CALLBACK`, CNA stops what it is doing the way its contract says, and the
   * error is rethrown here.
   */
  #withContextCallback(handler: () => void, body: (callback: number) => void): void {
    let pending: unknown = null;
    const pointer = this.routes.module.addFunction(
      ((_context: number): number => {
        try {
          handler();
          return 0;
        } catch (error) {
          pending = error;
          return 9;
        }
      }) as never,
      WASM_CALLBACK_SIGNATURES.CNA_ContextCallback,
    );
    try {
      body(pointer);
      if (pending != null) throw pending;
    } finally {
      this.routes.module.removeFunction(pointer);
    }
  }

  /**
   * A scene callback the pipeline keeps, rooted until it is replaced or cleared.
   *
   * Unlike the one above, this outlives the call that installs it: the pipeline holds it and calls
   * it once a frame. So the function-table entry is keyed by pipeline and slot, and installing a
   * new one releases the old one rather than leaking it.
   */
  #retainSceneCallback(pipeline: NativeHandle, slot: string, handler: () => void): number {
    const key = `${pipeline}:${slot}`;
    const existing = this.#sceneCallbacks.get(key);
    if (existing !== undefined) this.routes.module.removeFunction(existing);
    const pointer = this.routes.module.addFunction(
      ((_context: number): number => {
        try {
          handler();
          return 0;
        } catch {
          // There is no frame boundary to rethrow at: CNA calls this from inside its own frame,
          // and the caller who installed it is long gone. Refuse the frame rather than unwind.
          return 9;
        }
      }) as never,
      WASM_CALLBACK_SIGNATURES.CNA_ContextCallback,
    );
    this.#sceneCallbacks.set(key, pointer);
    return pointer;
  }

  #releaseSceneCallback(pipeline: NativeHandle, slot: string): void {
    const key = `${pipeline}:${slot}`;
    const existing = this.#sceneCallbacks.get(key);
    if (existing === undefined) return;
    this.routes.module.removeFunction(existing);
    this.#sceneCallbacks.delete(key);
  }

  readonly #sceneCallbacks = new Map<string, number>();

  /** Writes a settings block into a structure the caller already allocated and initialised. */
  #writePipelineSettingsInto(structure: WasmStruct, values: PipelineSettingsSnapshot): void {
    this.#withPipelineSettings(values, (pointer) => {
      const layout = WASM_STRUCT_LAYOUTS.CNA_RenderPipelineSettingsEXT;
      this.routes.module.HEAPU8.copyWithin(
        structure.pointer, pointer, pointer + layout.size);
    });
  }


  /** A settings block CNA edits in place, written in and read back out of one buffer. */
  #editPipelineSettings(
    settings: PipelineSettingsSnapshot, body: (pointer: number) => void,
  ): PipelineSettingsSnapshot {
    const scope = this.routes.scope();
    try {
      const structure = this.#allocPipelineSettings(scope);
      this.#writePipelineSettingsInto(structure, settings);
      body(structure.pointer);
      return this.#readPipelineSettings(structure);
    } finally {
      scope.dispose();
    }
  }

  /** A variable-length `float` array, which is not a matrix however alike their types look. */
  #floats(scope: WasmScope, values: readonly number[]): number {
    const buffer = scope.allocate(4 * Math.max(values.length, 1));
    const view = this.routes.view();
    values.forEach((value, index) => view.setFloat32(buffer + index * 4, value, true));
    return buffer;
  }

  #int32s(scope: WasmScope, values: readonly number[]): number {
    const buffer = scope.allocate(4 * Math.max(values.length, 1));
    const view = this.routes.view();
    values.forEach((value, index) => view.setInt32(buffer + index * 4, Math.trunc(value), true));
    return buffer;
  }

}
