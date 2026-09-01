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

import { CnaGraphicsExtensionBackendBase } from "../backend-base.js";
import type { PostProcessFrameSnapshot, Vector3Snapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct, WasmScope, WasmStruct, type WasmRouteTable } from "./module.js";

/** `CNA_RESULT_BUFFER_TOO_SMALL`, which a capacity probe answers with rather than failing on. */
const CNA_RESULT_BUFFER_TOO_SMALL = 14;

export class WasmGraphicsExtensionBackend extends CnaGraphicsExtensionBackendBase {
  readonly #routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#routes = routes;
  }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's extended-graphics slice, which ` +
      "covers the fullscreen blit and colour grading; the Node-API backend implements the rest",
    );
  }

  // --- the fullscreen blit ---------------------------------------------------------------------

  public override createFullscreenPass(device: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_fullscreen_pass_create", device);
  }

  public override destroyFullscreenPass(pass: NativeHandle): void {
    this.#routes.invoke("cna_fullscreen_pass_destroy", pass);
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
    this.#routes.invoke(
      "cna_fullscreen_pass_draw", pass, source, destination, effect, width, height, 0,
    );
  }

  public override drawFullscreenPassOverCurrentTarget(
    pass: NativeHandle, source: NativeHandle, effect: NativeHandle,
    width: number, height: number,
  ): void {
    this.#routes.invoke(
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
    const scope = this.#routes.scope();
    try {
      const context = new WasmStruct(
        this.#routes.module, "CNA_PostProcessContext",
        scope.allocate(WASM_STRUCT_LAYOUTS.CNA_PostProcessContext.size),
      );
      this.#routes.invoke("cna_post_process_context_init", context.pointer);
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
      this.#routes.invoke("cna_post_process_pass_apply", pass, context.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override getPostProcessPassName(pass: NativeHandle): string {
    return this.#probedString("cna_post_process_pass_copy_name", pass);
  }

  public override isPostProcessPassSupported(
    pass: NativeHandle, device: NativeHandle,
  ): boolean {
    return this.#bool("cna_post_process_pass_is_supported", pass, device);
  }

  public override destroyPostProcessPass(pass: NativeHandle): void {
    this.#routes.invoke("cna_post_process_pass_destroy", pass);
  }

  // --- colour grading --------------------------------------------------------------------------

  public override createColorGradePass(device: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_color_grade_pass_create", device);
  }

  public override createIdentityLutTexture(device: NativeHandle, size: number): NativeHandle {
    return this.#routes.outHandle(
      "cna_color_grade_pass_create_identity_lut", device, Math.trunc(size),
    );
  }

  public override getColorGradeInterpolation(pass: NativeHandle): number {
    return this.#routes.outU32("cna_color_grade_pass_get_interpolation", pass);
  }

  public override setColorGradeInterpolation(pass: NativeHandle, interpolation: number): void {
    this.#routes.invoke("cna_color_grade_pass_set_interpolation", pass, interpolation);
  }

  public override getColorGradeLut(pass: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_color_grade_pass_get_lut", pass);
  }

  public override setColorGradeLut(pass: NativeHandle, lut: NativeHandle): void {
    this.#routes.invoke("cna_color_grade_pass_set_lut", pass, lut);
  }

  public override getColorGradeVolumeLut(pass: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_color_grade_pass_get_volume_lut", pass);
  }

  public override setColorGradeVolumeLut(pass: NativeHandle, lut: NativeHandle): void {
    this.#routes.invoke("cna_color_grade_pass_set_volume_lut", pass, lut);
  }

  public override getColorGradeStrength(pass: NativeHandle): number {
    return this.#float("cna_color_grade_pass_get_strength", pass);
  }

  public override setColorGradeStrength(pass: NativeHandle, strength: number): void {
    this.#routes.invoke("cna_color_grade_pass_set_strength", pass, strength);
  }

  /** Pure arithmetic on two integers: which cube size a strip of these dimensions describes. */
  public override lutSizeForStrip(width: number, height: number): number {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(4);
      this.#routes.invoke(
        "cna_color_grade_pass_lut_size_for_strip", Math.trunc(width), Math.trunc(height), out,
      );
      return this.#routes.view().getInt32(out, true);
    } finally {
      scope.dispose();
    }
  }

  // --- the `.cube` table itself -----------------------------------------------------------------

  public override parseCubeLut(text: string): NativeHandle {
    return this.#withStringView(text, (view) => this.#routes.outHandle("cna_cube_lut_parse", view));
  }

  public override destroyCubeLut(lut: NativeHandle): void {
    this.#routes.invoke("cna_cube_lut_destroy", lut);
  }

  public override getCubeLutSize(lut: NativeHandle): number {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(4);
      this.#routes.invoke("cna_cube_lut_get_size", lut, out);
      return this.#routes.view().getInt32(out, true);
    } finally {
      scope.dispose();
    }
  }

  public override getCubeLutEntry(
    lut: NativeHandle, red: number, green: number, blue: number,
  ): Vector3Snapshot {
    return this.#vector3(
      "cna_cube_lut_get_entry", lut, Math.trunc(red), Math.trunc(green), Math.trunc(blue),
    );
  }

  public override getCubeLutDomainMin(lut: NativeHandle): Vector3Snapshot {
    return this.#vector3("cna_cube_lut_get_domain_min", lut);
  }

  public override getCubeLutDomainMax(lut: NativeHandle): Vector3Snapshot {
    return this.#vector3("cna_cube_lut_get_domain_max", lut);
  }

  public override isCubeLutUnitDomain(lut: NativeHandle): boolean {
    return this.#bool("cna_cube_lut_is_unit_domain", lut);
  }

  public override getCubeLutTitle(lut: NativeHandle): string {
    return this.#probedString("cna_cube_lut_copy_title", lut);
  }

  public override createCubeLutStripTexture(
    lut: NativeHandle, device: NativeHandle,
  ): NativeHandle {
    return this.#routes.outHandle("cna_cube_lut_create_strip_texture", lut, device);
  }

  public override createCubeLutVolumeTexture(
    lut: NativeHandle, device: NativeHandle,
  ): NativeHandle {
    return this.#routes.outHandle("cna_cube_lut_create_volume_texture", lut, device);
  }

  // --- the four output shapes this slice reads -------------------------------------------------

  /**
   * A string whose length is probed through the copy route itself.
   *
   * Most of this ABI answers a string through a `..._byte_count` route and a `..._copy_` route.
   * The engine layer's two here have no count route: the copy route reports the required length
   * when called with a null destination and zero capacity, which `WasmRouteTable.copyString`
   * cannot express. Reading it with a fixed buffer instead would truncate a longer name silently.
   *
   * The probe's own result is **not** required to be success. Measured: with a null destination
   * `cna_post_process_pass_copy_name` answers `SUCCESS` and `cna_cube_lut_copy_title` answers
   * `BUFFER_TOO_SMALL` (14), both having written the required length. Treating the second as a
   * failure -- which this did at first, and the browser suite caught -- loses a title CNA was
   * perfectly willing to give. The Node-API backend accepts both for the same two routes.
   */
  #probedString(route: string, handle: NativeHandle): string {
    const scope = this.#routes.scope();
    try {
      const lengthOut = scope.allocate(8);
      const probe = this.#routes.call(route, handle, 0, 0n, lengthOut);
      if (probe !== 0 && probe !== CNA_RESULT_BUFFER_TOO_SMALL) {
        this.#routes.invoke(route, handle, 0, 0n, lengthOut);
      }
      const byteLength = Number(this.#routes.view().getBigUint64(lengthOut, true));
      if (byteLength === 0) return "";
      // One byte more than the length: `cna_cube_lut_copy_title` refuses a capacity equal to it,
      // and capacity is an upper bound everywhere in this ABI, so the extra byte costs nothing.
      const buffer = scope.allocate(byteLength + 1);
      const writtenOut = scope.allocate(8);
      this.#routes.invoke(route, handle, buffer, BigInt(byteLength + 1), writtenOut);
      const written = Number(this.#routes.view().getBigUint64(writtenOut, true));
      return new TextDecoder().decode(
        this.#routes.module.HEAPU8.subarray(buffer, buffer + written));
    } finally {
      scope.dispose();
    }
  }

  /** A `CNA_Bool*` output, which is one byte rather than four. */
  #bool(route: string, ...args: readonly (number | bigint)[]): boolean {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(4);
      this.#routes.invoke(route, ...args, out);
      return this.#routes.view().getUint8(out) !== 0;
    } finally {
      scope.dispose();
    }
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

  #vector3(route: string, ...args: readonly (number | bigint)[]): Vector3Snapshot {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Vector3.size);
      this.#routes.invoke(route, ...args, out);
      const view = this.#routes.view();
      return { X: view.getFloat32(out, true), Y: view.getFloat32(out + 4, true), Z: view.getFloat32(out + 8, true) };
    } finally {
      scope.dispose();
    }
  }

  /**
   * A `CNA_StringView` passed by value, which wasm32 lowers as a pointer to a caller-owned copy --
   * the convention `docs/wasm-backend.md` records this backend measuring rather than assuming.
   */
  #withStringView<T>(value: string, body: (pointer: number) => T): T {
    const scope = new WasmScope(this.#routes.module);
    try {
      const text = scope.allocateUtf8(value);
      const view = allocateStruct(this.#routes.module, scope, "CNA_StringView", false);
      view.setPointer("data", text.pointer).setU64("byte_length", BigInt(text.byteLength));
      return body(view.pointer);
    } finally {
      scope.dispose();
    }
  }
}
