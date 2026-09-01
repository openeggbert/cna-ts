// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaGraphicsExtensionBackend` facade: colour grading, and the
// fullscreen blit under it.
//
// CNA's extended graphics layer is 857 C routes behind one interface, and until now the browser
// backend had none of them -- `getBackend().GraphicsExtensions` was absent, so every public engine
// API in `cna-ts/extensions/graphics` failed in a browser with "CNA extended graphics requires a
// loaded backend". That refusal was correct twice over: the binding had no slice, and the default
// artifact is built `CNA_CNAEXT=OFF`, which compiles the layer out and leaves every one of those
// routes answering `NOT_SUPPORTED`.
//
// The second half changed. An artifact built with `-DCNA_CNAEXT=ON` has the layer, measured rather
// than inferred: `cna_instanced_renderer_ext_get_instance_stride` answers `0` and a stride of `64`
// there and `CNA_RESULT_NOT_SUPPORTED` on the default build. So the binding's own refusal became
// the only thing standing between a browser consumer and an engine API they had already shipped
// the artifact for.
//
// **This is one family, not 857 routes.** `ColorGradePass` was chosen because its output is
// exactly predictable rather than merely plausible: a size-2 `.cube` whose transfer is the channel
// rotation (r,g,b) -> (b,r,g) is linear in each channel, so trilinear interpolation of the eight
// corners reproduces it exactly for every input -- which means the browser can assert the graded
// texels arithmetically instead of comparing them to a previous run. `FullscreenPass` comes with
// it because it is the same family's identity operation and the control the graded result is read
// against. Everything else in the interface still refuses by name through
// `CnaGraphicsExtensionBackendBase`, so a consumer reaching past this slice is told which member
// is missing rather than getting a silent wrong answer.

import type {
  PassTimingSnapshot, PostProcessFrameSnapshot, Vector3Snapshot, VertexElementSnapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { CNA_RESULT_BUFFER_TOO_SMALL } from "./graphics-ext-core.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct, WasmStruct } from "./module.js";
import { WasmPostProcessPasses } from "./post-process.js";

export class WasmGraphicsExtensionBackend extends WasmPostProcessPasses {

  // --- the fullscreen blit ---------------------------------------------------------------------

  public override createFullscreenPass(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_fullscreen_pass_create", device);
  }

  public override destroyFullscreenPass(pass: NativeHandle): void {
    this.routes.invoke("cna_fullscreen_pass_destroy", pass);
  }

  /**
   * The trailing `CNA_SamplerState*` is null, which CNA reads as its own default.
   *
   * Deliberately not a zeroed structure: a zeroed `CNA_SamplerState` is a *particular* sampler --
   * point filtering with wrap addressing and no anisotropy -- and passing one would silently
   * choose it. Null asks for whatever CNA considers correct for a blit, which is what the
   * Node-API backend passes for the same call.
   */
  public override drawFullscreenPass(
    pass: NativeHandle, source: NativeHandle, destination: NativeHandle, effect: NativeHandle,
    width: number, height: number,
  ): void {
    this.routes.invoke(
      "cna_fullscreen_pass_draw", pass, source, destination, effect, width, height, 0,
    );
  }

  public override drawFullscreenPassOverCurrentTarget(
    pass: NativeHandle, source: NativeHandle, effect: NativeHandle,
    width: number, height: number,
  ): void {
    this.routes.invoke(
      "cna_fullscreen_pass_draw_over_current_target", pass, source, effect, width, height, 0,
    );
  }

  // --- the post-process pass every pass in the family is one of -------------------------------

  /**
   * One pass over one frame.
   *
   * `CNA_PostProcessContext` is filled by CNA's own initializer first and then overwritten, rather
   * than zeroed and populated. That is not tidiness: the structure is *growable*, its
   * `struct_size` selects which fields CNA reads, and four of its members are matrices whose
   * correct absent value is the identity rather than zero. A zeroed context asks a pass that
   * reconstructs world position to divide by a singular projection.
   */
  public override applyPostProcessPass(
    pass: NativeHandle, frame: PostProcessFrameSnapshot,
  ): void {
    this.#withPostProcessContext(frame, (pointer) => {
      this.routes.invoke("cna_post_process_pass_apply", pass, pointer);
    });
  }

  /** The context one pass and a whole chain both take, built once so the two cannot disagree. */
  #withPostProcessContext<T>(frame: PostProcessFrameSnapshot, body: (pointer: number) => T): T {
    const scope = this.routes.scope();
    try {
      const context = new WasmStruct(
        this.routes.module, "CNA_PostProcessContext",
        scope.allocate(WASM_STRUCT_LAYOUTS.CNA_PostProcessContext.size),
      );
      this.routes.invoke("cna_post_process_context_init", context.pointer);
      context.setU64("source", frame.Source)
        .setU64("source_depth", frame.SourceDepth)
        .setU64("source_normals", frame.SourceNormals)
        .setU64("source_velocity", frame.SourceVelocity)
        .setU64("destination", frame.Destination)
        .setI32("width", Math.trunc(frame.Width))
        .setI32("height", Math.trunc(frame.Height))
        .setF32("elapsed_seconds", frame.ElapsedSeconds)
        .setF32("near_plane", frame.NearPlane)
        .setF32("far_plane", frame.FarPlane)
        .setU8("has_previous_frame", frame.HasPreviousFrame ? 1 : 0);
      // Each matrix is optional and absent means the identity the initializer already wrote, so
      // only the ones the caller supplied are overwritten.
      const matrices: readonly [string, readonly number[] | null][] = [
        ["projection", frame.Projection],
        ["inverse_projection", frame.InverseProjection],
        ["inverse_view", frame.InverseView],
        ["previous_view_projection", frame.PreviousViewProjection],
      ];
      for (const [field, values] of matrices) {
        if (values != null) context.setF32Array(field, values);
      }
      return body(context.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override getPostProcessPassName(pass: NativeHandle): string {
    return this.probedString("cna_post_process_pass_copy_name", pass);
  }

  public override isPostProcessPassSupported(
    pass: NativeHandle, device: NativeHandle,
  ): boolean {
    return this.bool("cna_post_process_pass_is_supported", pass, device);
  }

  public override destroyPostProcessPass(pass: NativeHandle): void {
    this.routes.invoke("cna_post_process_pass_destroy", pass);
  }

  // --- the chain the passes run in ---------------------------------------------------------------

  public override createPostProcessChain(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_post_process_chain_create", device);
  }

  public override destroyPostProcessChain(chain: NativeHandle): void {
    this.routes.invoke("cna_post_process_chain_destroy", chain);
  }

  /**
   * A borrowed pass. The caller keeps its lifetime, which is the transfer this slice offers.
   *
   * `addOwnedPostProcessPass` is deliberately **not** implemented here, and the reason is upstream
   * rather than effort: `cna_post_process_chain_add_owned_pass` releases the pass handle without
   * decrementing `RuntimeState::ownedGraphicsResourceCount`, so `cna_game_destroy` afterwards
   * refuses -- for every later game in the runtime, not only the one that owned the pass (finding
   * 1 in docs/upstream-cna-findings.md). In a page, a game that cannot be destroyed is a worse
   * outcome than a refusal that names itself, and `Add` does everything the chain needs. When CNA
   * repairs it, this becomes an ordinary two-line addition.
   */
  public override addPostProcessPass(chain: NativeHandle, pass: NativeHandle): void {
    this.routes.invoke("cna_post_process_chain_add_pass", chain, pass);
  }

  public override clearPostProcessChain(chain: NativeHandle): void {
    this.routes.invoke("cna_post_process_chain_clear", chain);
  }

  public override resetPostProcessChainTargets(chain: NativeHandle): void {
    this.routes.invoke("cna_post_process_chain_reset_targets", chain);
  }

  public override getPostProcessChainPassCount(chain: NativeHandle): number {
    const scope = this.routes.scope();
    try {
      const out = scope.allocate(4);
      this.routes.invoke("cna_post_process_chain_get_pass_count", chain, out);
      return this.routes.view().getInt32(out, true);
    } finally {
      scope.dispose();
    }
  }

  public override getPostProcessChainGpuTimingEnabled(chain: NativeHandle): boolean {
    return this.bool("cna_post_process_chain_is_gpu_timing_enabled", chain);
  }

  public override setPostProcessChainGpuTimingEnabled(
    chain: NativeHandle, value: boolean,
  ): void {
    this.routes.invoke("cna_post_process_chain_set_gpu_timing_enabled", chain, value ? 1 : 0);
  }

  /** The whole chain over one frame, through the same context one pass takes. */
  public override applyPostProcessChain(
    chain: NativeHandle, frame: PostProcessFrameSnapshot,
  ): void {
    this.#withPostProcessContext(frame, (pointer) => {
      this.routes.invoke("cna_post_process_chain_apply", chain, pointer);
    });
  }

  /**
   * What each pass cost, averaged.
   *
   * The name is read separately from the value because a C structure cannot own a string, so a
   * timing is two calls rather than one. `sample_count` is zero for a pass that has not been timed
   * -- which is what a chain answers with GPU timing off -- and that zero is reported rather than
   * turned into an absent entry.
   */
  public override getPostProcessChainPassTimings(
    chain: NativeHandle,
  ): readonly PassTimingSnapshot[] {
    const count = Number(
      this.routes.outU64("cna_post_process_chain_get_pass_timing_count", chain),
    );
    const timings: PassTimingSnapshot[] = [];
    for (let index = 0; index < count; index += 1) {
      const scope = this.routes.scope();
      let sampleCount = 0, milliseconds = 0;
      try {
        const timing = allocateStruct(this.routes.module, scope, "CNA_PassTimingEXT");
        this.routes.invoke(
          "cna_post_process_chain_get_pass_timing", chain, BigInt(index), timing.pointer,
        );
        sampleCount = timing.getI32("sample_count");
        milliseconds = timing.getF64("milliseconds");
      } finally {
        scope.dispose();
      }
      timings.push({
        Name: this.probedString(
          "cna_post_process_chain_copy_pass_timing_name", chain, BigInt(index)),
        SampleCount: sampleCount,
        Milliseconds: milliseconds,
      });
    }
    return timings;
  }

  // --- colour grading --------------------------------------------------------------------------

  public override createColorGradePass(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_color_grade_pass_create", device);
  }

  public override createIdentityLutTexture(device: NativeHandle, size: number): NativeHandle {
    return this.routes.outHandle(
      "cna_color_grade_pass_create_identity_lut", device, Math.trunc(size),
    );
  }

  public override getColorGradeInterpolation(pass: NativeHandle): number {
    return this.u32("cna_color_grade_pass_get_interpolation", pass);
  }

  public override setColorGradeInterpolation(pass: NativeHandle, interpolation: number): void {
    this.routes.invoke("cna_color_grade_pass_set_interpolation", pass, interpolation);
  }

  public override getColorGradeLut(pass: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_color_grade_pass_get_lut", pass);
  }

  public override setColorGradeLut(pass: NativeHandle, lut: NativeHandle): void {
    this.routes.invoke("cna_color_grade_pass_set_lut", pass, lut);
  }

  public override getColorGradeVolumeLut(pass: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_color_grade_pass_get_volume_lut", pass);
  }

  public override setColorGradeVolumeLut(pass: NativeHandle, lut: NativeHandle): void {
    this.routes.invoke("cna_color_grade_pass_set_volume_lut", pass, lut);
  }

  public override getColorGradeStrength(pass: NativeHandle): number {
    return this.float("cna_color_grade_pass_get_strength", pass);
  }

  public override setColorGradeStrength(pass: NativeHandle, strength: number): void {
    this.routes.invoke("cna_color_grade_pass_set_strength", pass, strength);
  }

  /** Pure arithmetic on two integers: which cube size a strip of these dimensions describes. */
  public override lutSizeForStrip(width: number, height: number): number {
    const scope = this.routes.scope();
    try {
      const out = scope.allocate(4);
      this.routes.invoke(
        "cna_color_grade_pass_lut_size_for_strip", Math.trunc(width), Math.trunc(height), out,
      );
      return this.routes.view().getInt32(out, true);
    } finally {
      scope.dispose();
    }
  }

  // --- the `.cube` table itself -----------------------------------------------------------------

  public override parseCubeLut(text: string): NativeHandle {
    return this.withStringView(text, (view) => this.routes.outHandle("cna_cube_lut_parse", view));
  }

  public override destroyCubeLut(lut: NativeHandle): void {
    this.routes.invoke("cna_cube_lut_destroy", lut);
  }

  public override getCubeLutSize(lut: NativeHandle): number {
    const scope = this.routes.scope();
    try {
      const out = scope.allocate(4);
      this.routes.invoke("cna_cube_lut_get_size", lut, out);
      return this.routes.view().getInt32(out, true);
    } finally {
      scope.dispose();
    }
  }

  public override getCubeLutEntry(
    lut: NativeHandle, red: number, green: number, blue: number,
  ): Vector3Snapshot {
    return this.vector3(
      "cna_cube_lut_get_entry", lut, Math.trunc(red), Math.trunc(green), Math.trunc(blue),
    );
  }

  public override getCubeLutDomainMin(lut: NativeHandle): Vector3Snapshot {
    return this.vector3("cna_cube_lut_get_domain_min", lut);
  }

  public override getCubeLutDomainMax(lut: NativeHandle): Vector3Snapshot {
    return this.vector3("cna_cube_lut_get_domain_max", lut);
  }

  public override isCubeLutUnitDomain(lut: NativeHandle): boolean {
    return this.bool("cna_cube_lut_is_unit_domain", lut);
  }

  public override getCubeLutTitle(lut: NativeHandle): string {
    return this.probedString("cna_cube_lut_copy_title", lut);
  }

  public override createCubeLutStripTexture(
    lut: NativeHandle, device: NativeHandle,
  ): NativeHandle {
    return this.routes.outHandle("cna_cube_lut_create_strip_texture", lut, device);
  }

  public override createCubeLutVolumeTexture(
    lut: NativeHandle, device: NativeHandle,
  ): NativeHandle {
    return this.routes.outHandle("cna_cube_lut_create_volume_texture", lut, device);
  }

  // --- the rest of the post-process family -------------------------------------------------------
  //
  // Each of these is a `PostProcessPass`, so `applyPostProcessPass`, the chain and the frame
  // context above already serve them; what each adds is its own creation and its own parameters.
  // They are here rather than left refusing because two of them come with CNA's *own* scalar
  // oracle -- `cna_tonemap_pass_tonemap_channel` and `cna_bloom_pass_extract_channel` are pure
  // functions of the same arithmetic the shaders do -- so a browser can compare a rendered texel
  // against CNA's answer for that texel rather than against a number read off a previous run.

  public override createBlitPass(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_blit_pass_create", device);
  }

  public override createTonemapPass(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_tonemap_pass_create", device);
  }

  public override getTonemapMode(pass: NativeHandle): number {
    return this.u32("cna_tonemap_pass_get_mode", pass);
  }

  public override setTonemapMode(pass: NativeHandle, mode: number): void {
    this.routes.invoke("cna_tonemap_pass_set_mode", pass, mode);
  }

  public override getTonemapExposure(pass: NativeHandle): number {
    return this.float("cna_tonemap_pass_get_exposure", pass);
  }

  public override setTonemapExposure(pass: NativeHandle, exposure: number): void {
    this.routes.invoke("cna_tonemap_pass_set_exposure", pass, exposure);
  }

  public override getTonemapGamma(pass: NativeHandle): number {
    return this.float("cna_tonemap_pass_get_gamma", pass);
  }

  public override setTonemapGamma(pass: NativeHandle, gamma: number): void {
    this.routes.invoke("cna_tonemap_pass_set_gamma", pass, gamma);
  }

  public override getTonemapDebandEnabled(pass: NativeHandle): boolean {
    return this.bool("cna_tonemap_pass_is_deband_enabled", pass);
  }

  public override setTonemapDebandEnabled(pass: NativeHandle, enabled: boolean): void {
    this.routes.invoke("cna_tonemap_pass_set_deband_enabled", pass, enabled ? 1 : 0);
  }

  public override getTonemapDebandStrength(pass: NativeHandle): number {
    return this.float("cna_tonemap_pass_get_deband_strength", pass);
  }

  public override setTonemapDebandStrength(pass: NativeHandle, strength: number): void {
    this.routes.invoke("cna_tonemap_pass_set_deband_strength", pass, strength);
  }

  /**
   * CNA's own answer for one channel, which is what makes the rendered image checkable.
   *
   * The same arithmetic the tonemapping shader does, as a pure function reached by a different
   * route. A test comparing rendered texels to this is comparing two implementations of one
   * specification, rather than comparing a picture to a picture taken earlier.
   */
  public override tonemapChannel(
    mode: number, value: number, exposure: number, gamma: number,
  ): number {
    return this.float("cna_tonemap_pass_tonemap_channel", mode, value, exposure, gamma);
  }

  public override createBloomPass(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_bloom_pass_create", device);
  }

  public override getBloomThreshold(pass: NativeHandle): number {
    return this.float("cna_bloom_pass_get_threshold", pass);
  }

  public override setBloomThreshold(pass: NativeHandle, threshold: number): void {
    this.routes.invoke("cna_bloom_pass_set_threshold", pass, threshold);
  }

  public override getBloomIntensity(pass: NativeHandle): number {
    return this.float("cna_bloom_pass_get_intensity", pass);
  }

  public override setBloomIntensity(pass: NativeHandle, intensity: number): void {
    this.routes.invoke("cna_bloom_pass_set_intensity", pass, intensity);
  }

  public override getBloomIterations(pass: NativeHandle): number {
    return this.int("cna_bloom_pass_get_iterations", pass);
  }

  public override setBloomIterations(pass: NativeHandle, iterations: number): void {
    this.routes.invoke("cna_bloom_pass_set_iterations", pass, Math.trunc(iterations));
  }

  public override resetBloomTargets(pass: NativeHandle): void {
    this.routes.invoke("cna_bloom_pass_reset_targets", pass);
  }

  public override bloomIterationsForQuality(quality: number): number {
    return this.int("cna_bloom_pass_iterations_for_quality", quality);
  }

  /** How much of one channel survives the bright-pass threshold; CNA's own scalar. */
  public override extractBloomChannel(value: number, threshold: number): number {
    return this.float("cna_bloom_pass_extract_channel", value, threshold);
  }

  public override createFxaaPass(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_fxaa_pass_create", device);
  }

  public override getFxaaEdgeThreshold(pass: NativeHandle): number {
    return this.float("cna_fxaa_pass_get_edge_threshold", pass);
  }

  public override setFxaaEdgeThreshold(pass: NativeHandle, threshold: number): void {
    this.routes.invoke("cna_fxaa_pass_set_edge_threshold", pass, threshold);
  }

  public override fxaaEdgeThresholdForQuality(quality: number): number {
    return this.float("cna_fxaa_pass_edge_threshold_for_quality", quality);
  }

  /** The pass's own fragment shader source: a string route that takes nothing before its buffer. */
  public override getFxaaFragmentGlsl(): string {
    return this.probedString("cna_fxaa_pass_copy_fragment_glsl");
  }

  public override createChromaticAberrationPass(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_chromatic_aberration_pass_create", device);
  }

  public override getChromaticAberrationStrength(pass: NativeHandle): number {
    return this.float("cna_chromatic_aberration_pass_get_strength", pass);
  }

  public override setChromaticAberrationStrength(pass: NativeHandle, strength: number): void {
    this.routes.invoke("cna_chromatic_aberration_pass_set_strength", pass, strength);
  }

  public override createFilmGrainPass(device: NativeHandle): NativeHandle {
    return this.routes.outHandle("cna_film_grain_pass_create", device);
  }

  public override getFilmGrainIntensity(pass: NativeHandle): number {
    return this.float("cna_film_grain_pass_get_intensity", pass);
  }

  public override setFilmGrainIntensity(pass: NativeHandle, intensity: number): void {
    this.routes.invoke("cna_film_grain_pass_set_intensity", pass, intensity);
  }

  // --- the instancing stream's layout, which a caller has to match exactly ----------------------

  /**
   * The two vertex declarations an instancing stream takes, and their strides.
   *
   * Pure computation -- they describe the layer's own shaders and touch no device -- and useful
   * whether or not `InstancedRenderer` itself is reachable, which in a browser it is not: it draws
   * a `ModelMeshPart`, and native model mesh parts arrive through a native content manager this
   * package deliberately does not have. A page building its own instance stream still has to
   * describe it **identically** to what the layer reads, and copying the elements from CNA is how
   * that gets checked rather than assumed.
   */
  public override getInstancedRendererInstanceElements(): readonly VertexElementSnapshot[] {
    return this.#vertexElements("cna_instanced_renderer_ext_copy_instance_elements");
  }

  public override getInstancedRendererInstanceStride(): number {
    return this.int("cna_instanced_renderer_ext_get_instance_stride");
  }

  public override getInstancedRendererTintElements(): readonly VertexElementSnapshot[] {
    return this.#vertexElements("cna_instanced_renderer_ext_copy_tint_elements");
  }

  public override getInstancedRendererTintStride(): number {
    return this.int("cna_instanced_renderer_ext_get_tint_stride");
  }

  /** A `CNA_VertexElement` array, counted first and then copied. */
  #vertexElements(route: string): VertexElementSnapshot[] {
    const layout = WASM_STRUCT_LAYOUTS.CNA_VertexElement;
    return this.probedArray(route, [], layout.size, (base, written) => {
      const elements: VertexElementSnapshot[] = [];
      for (let index = 0; index < written; index += 1) {
        const element = new WasmStruct(
          this.routes.module, "CNA_VertexElement", base + layout.size * index,
        );
        elements.push({
          Offset: element.getI32("offset"),
          VertexElementFormat: element.getU32("format"),
          VertexElementUsage: element.getU32("usage"),
          UsageIndex: element.getI32("usage_index"),
        });
      }
      return elements;
    });
  }

}
