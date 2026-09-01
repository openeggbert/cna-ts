// SPDX-License-Identifier: MS-PL
//
// The depth/normal prepass, which is what the rest of the screen-space engine layer reads from.
//
// SSAO, screen-space reflections, depth of field, motion blur, contact shadows, aerial perspective
// and the decal projector all consume a linear-depth image and most of them a normal image too.
// Binding those passes without this one leaves a browser holding eleven passes with nothing to
// feed them, so this is the family the previous one depends on rather than a new direction.
//
// Two upstream findings live here and neither is repaired in TypeScript.
//
// **Finding 13.** The packed encoding is written in powers of 256 -- `shift = (2^24, 2^16, 256, 1)`
// and a `1/256` mask -- while the eight-bit `Color` target it is stored in holds `round(c*255)/255`.
// The arithmetic is good to 2^-24 and the storage delivers about `0.5/255`, which is no better than
// writing the depth into a single channel and not packing at all. `packLinearDepth` and
// `unpackLinearDepth` are bound exactly as CNA wrote them, and the browser suite runs the same
// 2001-point sweep the windowed suite does, through the same shared oracle, so the finding is
// demonstrated on this backend rather than assumed to carry over.
//
// **Finding 14.** `begin`, `end` and `resize` answer `CNA_RESULT_INTERNAL` (12) for the three
// ordering mistakes their header documents as `CNA_RESULT_INVALID_STATE` (3), because
// `CallWithExceptionBarrier` has no `std::logic_error` arm in these three routes and CNA's own
// render pipeline, in the same file, does. The codes are passed through unchanged. Translating
// them here would make this package's documentation true and CNA's behaviour invisible.

import { CnaDepthNormalPrepassBackendBase } from "../backend-base.js";
import type { ColorSnapshot, PackedDepthSnapshot, Vector2Snapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmEngineMemory } from "./graphics-ext-core.js";
import type { WasmRouteTable } from "./module.js";

/** A value no depth channel can hold, so an output CNA never writes is visible rather than zero. */
const POISONED_FLOAT = -1234.5;

export class WasmDepthNormalPrepassBackend extends CnaDepthNormalPrepassBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's depth/normal prepass slice; ` +
      "the Node-API backend implements it",
    );
  }

  // --- the prepass itself ------------------------------------------------------------------------

  public override createDepthNormalPrepass(
    device: NativeHandle, width: number, height: number, encoding: number,
  ): NativeHandle {
    return this.#mem.create(
      "cna_depth_normal_prepass_create", device,
      Math.trunc(width), Math.trunc(height), encoding,
    );
  }

  public override destroyDepthNormalPrepass(prepass: NativeHandle): void {
    this.#routes.invoke("cna_depth_normal_prepass_destroy", prepass);
  }

  public override resizeDepthNormalPrepass(
    prepass: NativeHandle, width: number, height: number,
  ): void {
    this.#routes.invoke(
      "cna_depth_normal_prepass_resize", prepass, Math.trunc(width), Math.trunc(height));
  }

  public override getDepthNormalPrepassPassCount(prepass: NativeHandle): number {
    return this.#mem.int("cna_depth_normal_prepass_get_pass_count", prepass);
  }

  /**
   * Opens one pass, binding its targets and its camera.
   *
   * The two matrices are by pointer, sixteen floats each in CNA's row order -- the same shape the
   * post-process context takes, so the two cannot disagree about what a `CNA_Matrix` is.
   */
  public override beginDepthNormalPrepass(
    prepass: NativeHandle, passIndex: number, view: readonly number[],
    projection: readonly number[], nearPlane: number, farPlane: number,
  ): void {
    this.#mem.withMatrix(view, (viewPointer) =>
      this.#mem.withMatrix(projection, (projectionPointer) => this.#routes.invoke(
        "cna_depth_normal_prepass_begin", prepass, Math.trunc(passIndex),
        viewPointer, projectionPointer, nearPlane, farPlane,
      )));
  }

  public override endDepthNormalPrepass(prepass: NativeHandle): void {
    this.#routes.invoke("cna_depth_normal_prepass_end", prepass);
  }

  // --- what it wrote, all three borrowed from the prepass -----------------------------------------

  /**
   * The linear-depth image. Borrowed: the prepass keeps the target and the caller releases only
   * the borrow, which is what the public `DepthNormalPrepass` does through its own texture cache.
   */
  public override getDepthNormalPrepassDepthTexture(prepass: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_depth_normal_prepass_get_depth_texture", prepass);
  }

  public override getDepthNormalPrepassNormalTexture(prepass: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_depth_normal_prepass_get_normal_texture", prepass);
  }

  /** `CNA_INVALID_HANDLE` where velocity was never enabled, which the public API reads as null. */
  public override getDepthNormalPrepassVelocityTexture(prepass: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_depth_normal_prepass_get_velocity_texture_ext", prepass);
  }

  public override getDepthNormalPrepassEffect(prepass: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_depth_normal_prepass_get_prepass_effect", prepass);
  }

  public override getSkinnedDepthNormalPrepassEffect(prepass: NativeHandle): NativeHandle {
    return this.#routes.outHandle(
      "cna_depth_normal_prepass_get_skinned_prepass_effect", prepass);
  }

  // --- what it decided -----------------------------------------------------------------------------

  public override isDepthNormalPrepassSupported(
    prepass: NativeHandle, device: NativeHandle,
  ): boolean {
    return this.#mem.bool("cna_depth_normal_prepass_is_supported", prepass, device);
  }

  public override isDepthNormalPrepassUsingMultipleRenderTargets(prepass: NativeHandle): boolean {
    return this.#mem.bool("cna_depth_normal_prepass_is_using_multiple_render_targets", prepass);
  }

  public override isDepthNormalPrepassDepthPacked(prepass: NativeHandle): boolean {
    return this.#mem.bool("cna_depth_normal_prepass_is_depth_packed", prepass);
  }

  /** Which encoding `DepthEncoding.Automatic` chooses here, asked of the device rather than named. */
  public override deviceUsesPackedDepth(device: NativeHandle): boolean {
    return this.#mem.bool("cna_depth_normal_prepass_uses_packed_depth_ext", device);
  }

  public override getDepthNormalPrepassRoughness(prepass: NativeHandle): number {
    return this.#mem.float("cna_depth_normal_prepass_get_roughness", prepass);
  }

  public override setDepthNormalPrepassRoughness(
    prepass: NativeHandle, roughness: number,
  ): void {
    this.#routes.invoke("cna_depth_normal_prepass_set_roughness", prepass, roughness);
  }

  public override isDepthNormalPrepassVelocityEnabled(prepass: NativeHandle): boolean {
    return this.#mem.bool("cna_depth_normal_prepass_is_velocity_enabled_ext", prepass);
  }

  public override setDepthNormalPrepassVelocityEnabled(
    prepass: NativeHandle, enabled: boolean,
  ): void {
    this.#routes.invoke(
      "cna_depth_normal_prepass_set_velocity_enabled_ext", prepass, enabled ? 1 : 0);
  }

  /** Where a rigid object was last frame, which is what makes its velocity non-zero. */
  public override setDepthNormalPrepassPreviousWorld(
    prepass: NativeHandle, world: readonly number[],
  ): void {
    this.#mem.withMatrix(world, (pointer) =>
      this.#routes.invoke("cna_depth_normal_prepass_set_previous_world_ext", prepass, pointer));
  }

  public override setDepthNormalPrepassPreviousCamera(
    prepass: NativeHandle, view: readonly number[], projection: readonly number[],
  ): void {
    this.#mem.withMatrix(view, (viewPointer) =>
      this.#mem.withMatrix(projection, (projectionPointer) => this.#routes.invoke(
        "cna_depth_normal_prepass_set_previous_camera_ext", prepass,
        viewPointer, projectionPointer,
      )));
  }

  // --- the arithmetic, which is the same everywhere and is where finding 13 lives -----------------

  public override getDepthDecodeGlsl(packed: boolean): string {
    return this.#mem.probedString("cna_depth_normal_prepass_copy_depth_decode_glsl", packed ? 1 : 0);
  }

  public override getVelocityDecodeGlsl(): string {
    return this.#mem.probedString("cna_depth_normal_prepass_copy_velocity_decode_glsl");
  }

  /**
   * Whether a velocity texel carries a velocity at all, which is its alpha below 128.
   *
   * `CNA_Color` is a four-byte structure taken **by value**, and wasm32 lowers a multi-field
   * aggregate as a pointer to a caller-owned copy -- the same convention `CNA_StringView` follows
   * and the one `docs/wasm-backend.md` records this backend measuring rather than assuming.
   */
  public override velocityTexelHasVelocity(texel: ColorSnapshot): boolean {
    return this.#mem.withColor(texel, (pointer) =>
      this.#mem.bool("cna_depth_normal_prepass_has_velocity_ext", pointer));
  }

  /** The UV delta a velocity texel encodes: each channel out of 255, centred and doubled. */
  public override decodeVelocityTexel(texel: ColorSnapshot): Vector2Snapshot {
    return this.#mem.withColor(texel, (pointer) =>
      this.#mem.vector2("cna_depth_normal_prepass_decode_velocity_ext", pointer));
  }

  /**
   * CNA's own encoder, with four separate `float*` outputs rather than a structure.
   *
   * All four are poisoned first. A route that wrote three of them would otherwise be read as
   * having written whatever this binding had left in the fourth, and the channel that carries the
   * least significant bits is exactly the one a test is least likely to notice.
   */
  public override packLinearDepth(value: number): PackedDepthSnapshot {
    const scope = this.#routes.scope();
    try {
      const outputs = [scope.allocate(4), scope.allocate(4), scope.allocate(4), scope.allocate(4)];
      const before = this.#routes.view();
      for (const out of outputs) before.setFloat32(out, POISONED_FLOAT, true);
      this.#routes.invoke("cna_depth_normal_prepass_pack_depth", value, ...outputs);
      const view = this.#routes.view();
      const [r, g, b, a] = outputs.map((out) => view.getFloat32(out, true));
      return { R: r, G: g, B: b, A: a };
    } finally {
      scope.dispose();
    }
  }

  public override unpackLinearDepth(r: number, g: number, b: number, a: number): number {
    return this.#mem.float("cna_depth_normal_prepass_unpack_depth", r, g, b, a);
  }

}
