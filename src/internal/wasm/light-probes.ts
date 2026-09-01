// SPDX-License-Identifier: MS-PL
//
// Light probes: the nine spherical-harmonic coefficients that stand in for the light arriving at a
// point, the grid of them that covers a volume, and the baker that fills either from a scene.
//
// This family divides cleanly by how much of it a browser can check.
//
// **The probe and the volume are pure.** No device, no draw: a probe is nine `CNA_Vector3`s and
// twelve visibility scalars, `cna_light_probe_ext_irradiance` reconstructs the irradiance for a
// normal out of them, and `cna_light_probe_volume_ext_irradiance` trilinearly interpolates eight
// probes around a point. Both are arithmetic a test predicts rather than recognises: give a probe
// a known set of coefficients and the irradiance for a given normal is a number, not a picture.
//
// **The baker is not.** `cna_light_probe_baker_is_supported` answered **true** here, asked of the
// running artifact, and a bake captures six faces through a callback CNA drives -- with CNA's own
// target bound for the face it is drawing. So the callback must not bind a render target of its
// own, must not let a JavaScript exception unwind into compiled C, and must not outlive the bake.
// `#withSceneDraw` is where those three are enforced.

import { CnaLightProbeBackendBase } from "../backend-base.js";
import type { ClusterBoundsSnapshot, SceneFaceDraw, Vector3Snapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmEngineMemory } from "./graphics-ext-core.js";
import { WASM_CALLBACK_SIGNATURES, WASM_STRUCT_LAYOUTS } from "./layout.js";
import type { WasmRouteTable, WasmScope } from "./module.js";

export class WasmLightProbeBackend extends CnaLightProbeBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's light-probe slice; ` +
      "the Node-API backend implements it",
    );
  }

  public override createLightProbe(): NativeHandle {
    return this.#routes.outHandle("cna_light_probe_ext_create");
  }

  public override destroyLightProbe(probe: NativeHandle): void {
    this.#routes.invoke("cna_light_probe_ext_destroy", probe);
  }

  public override copyLightProbeFrom(destination: NativeHandle, source: NativeHandle): void {
    this.#routes.invoke("cna_light_probe_ext_copy_from", destination, source);
  }

  public override getLightProbePosition(probe: NativeHandle): Vector3Snapshot {
    return this.#mem.vector3("cna_light_probe_ext_get_position", probe);
  }

  public override getLightProbeCoefficient(probe: NativeHandle, index: number): Vector3Snapshot {
    return this.#mem.vector3("cna_light_probe_ext_get_coefficient", probe, Math.trunc(index));
  }

  public override setLightProbeVisibility(
    probe: NativeHandle, direction: number, mean: number, meanSquared: number,
  ): void {
    this.#routes.invoke("cna_light_probe_ext_set_visibility", probe, direction, mean, meanSquared);
  }

  public override getLightProbeVisibilityMean(probe: NativeHandle, direction: number): number {
    return this.#mem.float("cna_light_probe_ext_get_visibility_mean", probe, direction);
  }

  public override getLightProbeVisibilityMeanSquared(
    probe: NativeHandle, direction: number,
  ): number {
    return this.#mem.float("cna_light_probe_ext_get_visibility_mean_squared", probe, direction);
  }

  public override lightProbeHasVisibility(probe: NativeHandle): boolean {
    return this.#mem.bool("cna_light_probe_ext_has_visibility", probe);
  }

  public override isLightProbeZero(probe: NativeHandle): boolean {
    return this.#mem.bool("cna_light_probe_ext_is_zero", probe);
  }

  public override scaleLightProbe(probe: NativeHandle, factor: number): void {
    this.#routes.invoke("cna_light_probe_ext_scale", probe, factor);
  }

  public override lightProbeEquals(first: NativeHandle, second: NativeHandle): boolean {
    return this.#mem.bool("cna_light_probe_ext_equals", first, second);
  }

  public override getLightProbeEvaluationGlsl(): string {
    return this.#mem.probedString("cna_light_probe_ext_copy_evaluation_glsl");
  }

  public override destroyLightProbeVolume(volume: NativeHandle): void {
    this.#routes.invoke("cna_light_probe_volume_ext_destroy", volume);
  }

  public override getLightProbeVolumeCountX(volume: NativeHandle): number {
    return this.#mem.int("cna_light_probe_volume_ext_get_count_x", volume);
  }

  public override getLightProbeVolumeCountY(volume: NativeHandle): number {
    return this.#mem.int("cna_light_probe_volume_ext_get_count_y", volume);
  }

  public override getLightProbeVolumeCountZ(volume: NativeHandle): number {
    return this.#mem.int("cna_light_probe_volume_ext_get_count_z", volume);
  }

  public override getLightProbeVolumeProbeCount(volume: NativeHandle): number {
    return this.#mem.int("cna_light_probe_volume_ext_get_probe_count", volume);
  }

  public override getLightProbeVolumeProbePosition(
    volume: NativeHandle, x: number, y: number, z: number,
  ): Vector3Snapshot {
    return this.#mem.vector3("cna_light_probe_volume_ext_get_probe_position", volume, x, y, z);
  }

  public override getLightProbeVolumeProbe(
    volume: NativeHandle, x: number, y: number, z: number, into: NativeHandle,
  ): void {
    this.#routes.invoke("cna_light_probe_volume_ext_get_probe", volume, x, y, z, into);
  }

  public override setLightProbeVolumeProbe(
    volume: NativeHandle, x: number, y: number, z: number, probe: NativeHandle,
  ): void {
    this.#routes.invoke("cna_light_probe_volume_ext_set_probe", volume, x, y, z, probe);
  }

  public override isLightProbeVolumeZero(volume: NativeHandle): boolean {
    return this.#mem.bool("cna_light_probe_volume_ext_is_zero", volume);
  }

  public override createLightProbeBaker(device: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_light_probe_baker_create", device);
  }

  public override destroyLightProbeBaker(baker: NativeHandle): void {
    this.#routes.invoke("cna_light_probe_baker_destroy", baker);
  }

  public override isLightProbeBakerSupported(baker: NativeHandle): boolean {
    return this.#mem.bool("cna_light_probe_baker_is_supported", baker);
  }

  public override getLightProbeBakerFaceSize(baker: NativeHandle): number {
    return this.#mem.int("cna_light_probe_baker_get_face_size", baker);
  }

  public override getLightProbeBakerFaceCount(): number {
    return this.#mem.int("cna_light_probe_baker_face_count");
  }

  public override getLightProbeBakerNearPlane(baker: NativeHandle): number {
    return this.#mem.float("cna_light_probe_baker_get_near_plane", baker);
  }

  public override getLightProbeBakerFarPlane(baker: NativeHandle): number {
    return this.#mem.float("cna_light_probe_baker_get_far_plane", baker);
  }

  public override setLightProbeBakerPlanes(
    baker: NativeHandle, nearPlane: number, farPlane: number,
  ): void {
    this.#routes.invoke("cna_light_probe_baker_set_planes", baker, nearPlane, farPlane);
  }

  // --- the routes that take a vector, a box, or a callback --------------------------------------

  public override createLightProbeAt(position: Vector3Snapshot): NativeHandle {
    return this.#mem.withVector3(position, (pointer) =>
      this.#routes.outHandle("cna_light_probe_ext_create_at", pointer));
  }

  public override setLightProbePosition(probe: NativeHandle, position: Vector3Snapshot): void {
    this.#mem.withVector3(position, (pointer) =>
      this.#routes.invoke("cna_light_probe_ext_set_position", probe, pointer));
  }

  public override setLightProbeCoefficient(
    probe: NativeHandle, index: number, value: Vector3Snapshot,
  ): void {
    this.#mem.withVector3(value, (pointer) => this.#routes.invoke(
      "cna_light_probe_ext_set_coefficient", probe, Math.trunc(index), pointer));
  }

  /** All nine spherical-harmonic coefficients, counted through the copy route first. */
  public override copyLightProbeCoefficients(probe: NativeHandle): readonly Vector3Snapshot[] {
    const stride = WASM_STRUCT_LAYOUTS.CNA_Vector3.size;
    return this.#mem.probedArray(
      "cna_light_probe_ext_copy_coefficients", [probe], stride, (base, written) => {
        const view = this.#routes.view();
        return Array.from({ length: written }, (_, index) => ({
          X: view.getFloat32(base + index * stride, true),
          Y: view.getFloat32(base + index * stride + 4, true),
          Z: view.getFloat32(base + index * stride + 8, true),
        }));
      });
  }

  /**
   * The irradiance those coefficients reconstruct for one normal.
   *
   * CNA's own evaluation of the same second-order basis a shader would evaluate, so a test with a
   * known set of coefficients predicts this arithmetically rather than recognising it.
   */
  public override lightProbeIrradiance(
    probe: NativeHandle, normal: Vector3Snapshot,
  ): Vector3Snapshot {
    return this.#mem.withVector3(normal, (pointer) =>
      this.#mem.vector3("cna_light_probe_ext_irradiance", probe, pointer));
  }

  public override lightProbeVisibilityWeight(
    probe: NativeHandle, direction: Vector3Snapshot, distance: number,
  ): number {
    return this.#mem.withVector3(direction, (pointer) => this.#mem.float(
      "cna_light_probe_ext_visibility_weight", probe, pointer, distance));
  }

  // --- the volume, which is a grid of probes over a box -----------------------------------------

  public override createLightProbeVolume(
    bounds: ClusterBoundsSnapshot, countX: number, countY: number, countZ: number,
  ): NativeHandle {
    const scope = this.#routes.scope();
    try {
      return this.#routes.outHandle(
        "cna_light_probe_volume_ext_create", this.#mem.writeBounds(scope, bounds),
        Math.trunc(countX), Math.trunc(countY), Math.trunc(countZ),
      );
    } finally {
      scope.dispose();
    }
  }

  public override getLightProbeVolumeBounds(volume: NativeHandle): ClusterBoundsSnapshot {
    return this.#mem.bounds("cna_light_probe_volume_ext_get_bounds", volume);
  }

  public override lightProbeVolumeContains(
    volume: NativeHandle, position: Vector3Snapshot,
  ): boolean {
    return this.#mem.withVector3(position, (pointer) =>
      this.#mem.bool("cna_light_probe_volume_ext_contains", volume, pointer));
  }

  /** Trilinear interpolation of the eight probes around a point, written into a caller's probe. */
  public override sampleLightProbeVolume(
    volume: NativeHandle, position: Vector3Snapshot, into: NativeHandle,
  ): void {
    this.#mem.withVector3(position, (pointer) => this.#routes.invoke(
      "cna_light_probe_volume_ext_sample_probe", volume, pointer, into));
  }

  public override lightProbeVolumeIrradiance(
    volume: NativeHandle, position: Vector3Snapshot, normal: Vector3Snapshot,
  ): Vector3Snapshot {
    return this.#mem.withVector3(position, (positionPointer) =>
      this.#mem.withVector3(normal, (normalPointer) => this.#mem.vector3(
        "cna_light_probe_volume_ext_irradiance", volume, positionPointer, normalPointer)));
  }

  // --- the baker, whose capture callback is CNA's frame and not this binding's ------------------

  public override createLightProbeBakerWithFaceSize(
    device: NativeHandle, faceSize: number,
  ): NativeHandle {
    return this.#routes.outHandle(
      "cna_light_probe_baker_create_with_face_size", device, Math.trunc(faceSize));
  }

  public override getLightProbeBakerFaceView(
    baker: NativeHandle, face: number, position: Vector3Snapshot,
  ): readonly number[] {
    return this.#mem.withVector3(position, (pointer) => this.#mem.matrix(
      "cna_light_probe_baker_face_view", baker, Math.trunc(face), pointer));
  }

  public override bakeLightProbe(
    baker: NativeHandle, position: Vector3Snapshot, draw: SceneFaceDraw,
  ): NativeHandle {
    return this.#withSceneDraw(draw, (callback) => this.#mem.withVector3(position, (pointer) =>
      this.#routes.outHandle(
        "cna_light_probe_baker_bake_probe", baker, pointer, callback, 0)));
  }

  /**
   * Bakes every probe in a volume, and answers **how many times the callback ran**.
   *
   * That number is not one of CNA's outputs -- the route has none. It is the count of scene draws
   * the bake asked for, which is six per probe, and it is what the Node-API bridge reports for the
   * same call. Counting it here rather than inventing a return keeps the two backends answering
   * the same question.
   */
  public override bakeLightProbeVolumeLight(
    baker: NativeHandle, volume: NativeHandle, draw: SceneFaceDraw,
  ): number {
    return this.#countedBake("cna_light_probe_baker_bake_light", baker, volume, draw);
  }

  public override bakeLightProbeVolumeVisibility(
    baker: NativeHandle, volume: NativeHandle, draw: SceneFaceDraw,
  ): number {
    return this.#countedBake("cna_light_probe_baker_bake_visibility", baker, volume, draw);
  }

  #countedBake(
    route: string, baker: NativeHandle, volume: NativeHandle, draw: SceneFaceDraw,
  ): number {
    let calls = 0;
    const counted: SceneFaceDraw = (view, projection) => {
      calls += 1;
      draw(view, projection);
    };
    this.#withSceneDraw(counted, (callback) => {
      this.#routes.invoke(route, baker, volume, callback, 0);
    });
    return calls;
  }

  /**
   * Roots a scene-draw callback for exactly the bake that uses it, and no longer.
   *
   * Three things this has to get right, and each is a way a browser page dies otherwise.
   *
   * The function pointer is **removed in a `finally`**, so a bake that throws does not leave a
   * table entry pointing at a closure the page has forgotten about. A JavaScript exception is
   * **held rather than allowed to unwind into compiled C** -- the callback returns and the error
   * is rethrown after the bake, which is the same contract the game's lifecycle callbacks use.
   * And the callback **rebinds no render target**: CNA has its own capture target bound for the
   * face being drawn, and binding another inside the callback would capture the wrong image into
   * a probe that reports success.
   */
  #withSceneDraw<T>(draw: SceneFaceDraw, body: (callback: number) => T): T {
    let pending: unknown = null;
    const pointer = this.#routes.module.addFunction(
      ((view: number, projection: number, _context: number): void => {
        if (pending != null) return;
        try {
          draw(this.#readMatrix(view), this.#readMatrix(projection));
        } catch (error) {
          pending = error;
        }
      }) as never,
      WASM_CALLBACK_SIGNATURES.CNA_LightProbeSceneDrawCallback,
    );
    try {
      const result = body(pointer);
      if (pending != null) throw pending;
      return result;
    } finally {
      this.#routes.module.removeFunction(pointer);
    }
  }

  #readMatrix(pointer: number): number[] {
    const view = this.#routes.view();
    return Array.from({ length: 16 }, (_, index) => view.getFloat32(pointer + index * 4, true));
  }

}
