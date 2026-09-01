// SPDX-License-Identifier: MS-PL
//
// The decal projector, which is the first consumer of the prepass that draws something.
//
// A decal is a box in world space. The pass reads the prepass depth image, unprojects each screen
// texel back to a view position, transforms it into the decal's local space with the inverse of
// the decal's world matrix, and paints where that local position lands inside the unit box --
// optionally rejecting surfaces whose normal faces too far from the decal's axis.
//
// Which is why this family arrives with the prepass rather than before it. `DecalPass` documents,
// from a measurement in the windowed suite, that a `Texture2D` filled with `SetData` does **not**
// work as its depth input: the pass draws its depth buffer as a full-screen sprite and takes its
// screen mapping from that sprite, and an uploaded texture and a render target disagree about
// which row is the top. Handed the exact bytes the prepass wrote, uploaded into an ordinary
// texture, the pass finds no surface anywhere. So a browser could not have been given honest decal
// evidence before it could run a prepass.
//
// `cna_decal_pass_is_inside_decal_box` is the oracle the projection is checked against: a pure
// predicate, `|x| <= 0.5 && |y| <= 0.5 && |z| <= 0.5`, reached by a different route from the
// shader that applies it.

import { CnaDecalBackendBase } from "../backend-base.js";
import type { Vector3Snapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmEngineMemory } from "./graphics-ext-core.js";
import type { WasmRouteTable } from "./module.js";

export class WasmDecalBackend extends CnaDecalBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's decal slice; ` +
      "the Node-API backend implements it",
    );
  }

  public override createDecalPass(device: NativeHandle): NativeHandle {
    return this.#mem.create("cna_decal_pass_create", device);
  }

  public override destroyDecalPass(pass: NativeHandle): void {
    this.#routes.invoke("cna_decal_pass_destroy", pass);
  }

  public override getDecalOpacity(pass: NativeHandle): number {
    return this.#mem.float("cna_decal_pass_get_opacity", pass);
  }

  public override setDecalOpacity(pass: NativeHandle, opacity: number): void {
    this.#routes.invoke("cna_decal_pass_set_opacity", pass, opacity);
  }

  public override getDecalTint(pass: NativeHandle): Vector3Snapshot {
    return this.#mem.vector3("cna_decal_pass_get_tint", pass);
  }

  public override setDecalTint(pass: NativeHandle, tint: Vector3Snapshot): void {
    this.#mem.withVector3(tint, (pointer) =>
      this.#routes.invoke("cna_decal_pass_set_tint", pass, pointer));
  }

  public override getDecalMaxSlopeAngle(pass: NativeHandle): number {
    return this.#mem.float("cna_decal_pass_get_max_slope_angle", pass);
  }

  public override setDecalMaxSlopeAngle(pass: NativeHandle, radians: number): void {
    this.#routes.invoke("cna_decal_pass_set_max_slope_angle", pass, radians);
  }

  /**
   * The depth and normal images, both borrowed and neither owned.
   *
   * `0n` is the honest absence for either: with no depth the pass has nothing to unproject and
   * paints nothing, and with no normals the slope test is skipped and every surface takes the
   * decal whichever way it faces. Both are behaviours a test can tell apart, so neither is
   * substituted for by an empty texture.
   */
  public override setDecalPrepassInputs(
    pass: NativeHandle, depth: NativeHandle, normals: NativeHandle,
  ): void {
    this.#routes.invoke("cna_decal_pass_set_prepass_inputs", pass, depth, normals);
  }

  /**
   * The camera the pass unprojects with, and the far plane the stored depth was normalised by.
   *
   * CNA **ignores a non-positive far plane** rather than refusing it -- the unprojection divides
   * by it -- so a successful call is not proof that anything changed. That is the public API's
   * documented behaviour and it is not repaired here.
   */
  public override setDecalCamera(
    pass: NativeHandle, view: readonly number[], projection: readonly number[], farPlane: number,
  ): void {
    this.#mem.withMatrix(view, (viewPointer) =>
      this.#mem.withMatrix(projection, (projectionPointer) => this.#routes.invoke(
        "cna_decal_pass_set_camera", pass, viewPointer, projectionPointer, farPlane,
      )));
  }

  public override drawDecal(
    pass: NativeHandle, decal: NativeHandle, decalWorld: readonly number[],
    width: number, height: number,
  ): void {
    this.#mem.withMatrix(decalWorld, (pointer) => this.#routes.invoke(
      "cna_decal_pass_draw", pass, decal, pointer, Math.trunc(width), Math.trunc(height),
    ));
  }

  /** CNA's own unit-box predicate, which is what the projected footprint is checked against. */
  public override isInsideDecalBox(decalLocalPosition: Vector3Snapshot): boolean {
    return this.#mem.withVector3(decalLocalPosition, (pointer) =>
      this.#mem.bool("cna_decal_pass_is_inside_decal_box", pointer));
  }
}
