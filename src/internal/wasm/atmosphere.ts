// SPDX-License-Identifier: MS-PL
//
// The sky: an analytic atmosphere, a skybox, and the processor that turns one panorama into the
// maps a physically-based shader reads.
//
// `cna_atmospheric_sky_is_supported` answers **true** on a WebGL 2.0 context with an artifact built
// `-DCNA_CNAEXT=ON`, asked of the running artifact rather than inferred, so this family is bound
// rather than classified.
//
// The sky is checkable because CNA ships its own model as a scalar. `cna_atmospheric_sky_radiance`
// is the same arithmetic the shader does, as a pure function of a view direction, a sun direction
// and a turbidity, and `cna_skybox_compute_view_ray` says which direction a screen point looks
// along. Together they turn "the sky changed" into "this texel is the colour CNA says that ray is".
//
// **Upstream finding 15 governs one getter here.** `cna_skybox_get_environment` mints a *new owned*
// handle aliasing the skybox, so a caller who reads it and drops the answer leaves the game
// counting a graphics resource it can no longer name -- and `cna_game_destroy` then refuses for the
// rest of the process. `cna_render_pipeline_get_skybox` documents the identical contract and hands
// back the caller's own handle instead, so releasing *that* one destroys a skybox the caller still
// owns. The two cannot both be released the same way, and the public API's ownership decision is
// what keeps a browser game destroyable; this backend passes each handle through unchanged.

import { CnaAtmosphereBackendBase } from "../backend-base.js";
import type { Vector2Snapshot, Vector3Snapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmEngineMemory } from "./graphics-ext-core.js";
import type { WasmRouteTable } from "./module.js";

/** Written into a `float*` output before the call, so one CNA never writes is visible. */
const POISONED_FLOAT = -1234.5;

export class WasmAtmosphereBackend extends CnaAtmosphereBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's atmosphere slice; ` +
      "the Node-API backend implements it",
    );
  }

  public override createAtmosphericSky(device: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_atmospheric_sky_create", device);
  }

  public override destroyAtmosphericSky(sky: NativeHandle): void {
    this.#routes.invoke("cna_atmospheric_sky_destroy", sky);
  }

  public override isAtmosphericSkySupported(sky: NativeHandle): boolean {
    return this.#mem.bool("cna_atmospheric_sky_is_supported", sky);
  }

  public override getAtmosphericSkySunDirection(sky: NativeHandle): Vector3Snapshot {
    return this.#mem.vector3("cna_atmospheric_sky_get_sun_direction", sky);
  }

  public override getAtmosphericSkyTurbidity(sky: NativeHandle): number {
    return this.#mem.float("cna_atmospheric_sky_get_turbidity", sky);
  }

  public override setAtmosphericSkyTurbidity(sky: NativeHandle, turbidity: number): void {
    this.#routes.invoke("cna_atmospheric_sky_set_turbidity", sky, turbidity);
  }

  public override getAtmosphericSkyIntensity(sky: NativeHandle): number {
    return this.#mem.float("cna_atmospheric_sky_get_intensity", sky);
  }

  public override setAtmosphericSkyIntensity(sky: NativeHandle, intensity: number): void {
    this.#routes.invoke("cna_atmospheric_sky_set_intensity", sky, intensity);
  }

  public override getAtmosphericSkyModelGlsl(): string {
    return this.#mem.probedString("cna_atmospheric_sky_copy_model_glsl");
  }

  public override createSkybox(device: NativeHandle, environment: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_skybox_create", device, environment);
  }

  public override destroySkybox(skybox: NativeHandle): void {
    this.#routes.invoke("cna_skybox_destroy", skybox);
  }

  public override isSkyboxSupported(skybox: NativeHandle): boolean {
    return this.#mem.bool("cna_skybox_is_supported", skybox);
  }

  public override getSkyboxEnvironment(skybox: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_skybox_get_environment", skybox);
  }

  public override setSkyboxEnvironment(skybox: NativeHandle, environment: NativeHandle): void {
    this.#routes.invoke("cna_skybox_set_environment", skybox, environment);
  }

  public override setSkyboxOwnedEnvironment(skybox: NativeHandle, environment: NativeHandle): void {
    this.#routes.invoke("cna_skybox_set_owned_environment", skybox, environment);
  }

  public override getSkyboxYaw(skybox: NativeHandle): number {
    return this.#mem.float("cna_skybox_get_yaw", skybox);
  }

  public override setSkyboxYaw(skybox: NativeHandle, radians: number): void {
    this.#routes.invoke("cna_skybox_set_yaw", skybox, radians);
  }

  public override getSkyboxIntensity(skybox: NativeHandle): number {
    return this.#mem.float("cna_skybox_get_intensity", skybox);
  }

  public override setSkyboxIntensity(skybox: NativeHandle, intensity: number): void {
    this.#routes.invoke("cna_skybox_set_intensity", skybox, intensity);
  }

  public override getSkyboxTint(skybox: NativeHandle): Vector3Snapshot {
    return this.#mem.vector3("cna_skybox_get_tint", skybox);
  }

  public override createEnvironmentProcessor(device: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_environment_processor_create", device);
  }

  public override destroyEnvironmentProcessor(processor: NativeHandle): void {
    this.#routes.invoke("cna_environment_processor_destroy", processor);
  }

  public override generateBrdfLut(processor: NativeHandle, size: number, sampleCount: number): NativeHandle {
    return this.#routes.outHandle("cna_environment_processor_generate_brdf_lut", processor, Math.trunc(size), Math.trunc(sampleCount));
  }

  public override mipForRoughness(roughness: number, mipCount: number): number {
    return this.#mem.float("cna_environment_processor_mip_for_roughness", roughness, Math.trunc(mipCount));
  }

  public override roughnessForMip(mip: number, mipCount: number): number {
    return this.#mem.float("cna_environment_processor_roughness_for_mip", mip, Math.trunc(mipCount));
  }

  public override hammersleyPoint(index: number, count: number): Vector2Snapshot {
    return this.#mem.vector2("cna_environment_processor_hammersley", Math.trunc(index), Math.trunc(count));
  }

  public override cubeFaceDirection(face: number, u: number, v: number): Vector3Snapshot {
    return this.#mem.vector3("cna_environment_processor_face_direction", face, u, v);
  }

  public override getRenderPipelineSkybox(pipeline: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_render_pipeline_get_skybox", pipeline);
  }

  public override setRenderPipelineSkybox(pipeline: NativeHandle, skybox: NativeHandle): void {
    this.#routes.invoke("cna_render_pipeline_set_skybox", pipeline, skybox);
  }

  // --- the routes that take a matrix, a vector or several outputs -------------------------------

  /**
   * The sky over whatever target is bound. Nothing is drawn where the renderer cannot run it, and
   * `IsSupported` is the route that says so rather than this one failing.
   */
  public override drawAtmosphericSky(
    sky: NativeHandle, view: readonly number[], projection: readonly number[],
    width: number, height: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_atmospheric_sky_draw", sky, this.#mem.writeMatrix(scope, view),
        this.#mem.writeMatrix(scope, projection), Math.trunc(width), Math.trunc(height),
      );
    } finally {
      scope.dispose();
    }
  }

  public override setAtmosphericSkySunDirection(
    sky: NativeHandle, direction: Vector3Snapshot,
  ): void {
    this.#mem.withVector3(direction, (pointer) =>
      this.#routes.invoke("cna_atmospheric_sky_set_sun_direction", sky, pointer));
  }

  /**
   * CNA's own sky model, as a pure function of two directions and a turbidity.
   *
   * This is what makes a drawn sky checkable: the same arithmetic the shader does, reached by a
   * route that touches no device, so a rendered texel is compared with CNA's answer for the ray
   * that texel looks along rather than with a picture taken earlier.
   */
  public override atmosphericSkyRadiance(
    viewDirection: Vector3Snapshot, sunDirection: Vector3Snapshot, turbidity: number,
  ): Vector3Snapshot {
    return this.#mem.withVector3(viewDirection, (view) =>
      this.#mem.withVector3(sunDirection, (sun) =>
        this.#mem.vector3("cna_atmospheric_sky_radiance", view, sun, turbidity)));
  }

  public override drawSkybox(
    skybox: NativeHandle, view: readonly number[], projection: readonly number[],
    width: number, height: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_skybox_draw", skybox, this.#mem.writeMatrix(scope, view),
        this.#mem.writeMatrix(scope, projection), Math.trunc(width), Math.trunc(height),
      );
    } finally {
      scope.dispose();
    }
  }

  public override setSkyboxTint(skybox: NativeHandle, tint: Vector3Snapshot): void {
    this.#mem.withVector3(tint, (pointer) =>
      this.#routes.invoke("cna_skybox_set_tint", skybox, pointer));
  }

  /** Which way a screen point looks, which is the other half of checking a drawn sky. */
  public override computeSkyboxViewRay(
    view: readonly number[], projection: readonly number[],
    ndcX: number, ndcY: number, yaw: number,
  ): Vector3Snapshot {
    const scope = this.#routes.scope();
    try {
      return this.#mem.vector3(
        "cna_skybox_compute_view_ray", this.#mem.writeMatrix(scope, view),
        this.#mem.writeMatrix(scope, projection), ndcX, ndcY, yaw,
      );
    } finally {
      scope.dispose();
    }
  }

  // --- the environment processor, which turns one image into the maps a PBR shader reads ---------

  public override convertEquirectangular(
    processor: NativeHandle, panorama: NativeHandle, faceSize: number,
  ): NativeHandle {
    return this.#routes.outHandle(
      "cna_environment_processor_convert_equirectangular", processor, panorama,
      Math.trunc(faceSize));
  }

  public override generateIrradianceCube(
    processor: NativeHandle, environment: NativeHandle, size: number, sampleCount: number,
  ): NativeHandle {
    return this.#routes.outHandle(
      "cna_environment_processor_generate_irradiance", processor, environment,
      Math.trunc(size), Math.trunc(sampleCount));
  }

  public override generatePrefilteredSpecular(
    processor: NativeHandle, environment: NativeHandle, baseSize: number, mipCount: number,
    sampleCount: number,
  ): NativeHandle {
    return this.#routes.outHandle(
      "cna_environment_processor_generate_prefiltered_specular", processor, environment,
      Math.trunc(baseSize), Math.trunc(mipCount), Math.trunc(sampleCount));
  }

  public override generateProbeFromEnvironment(
    processor: NativeHandle, environment: NativeHandle, position: Vector3Snapshot,
  ): NativeHandle {
    return this.#mem.withVector3(position, (pointer) => this.#routes.outHandle(
      "cna_environment_processor_generate_probe", processor, environment, pointer));
  }

  /** The GGX importance sample a prefilter integrates over: pure, and its own oracle. */
  public override importanceSampleGgx(
    x: number, y: number, normal: Vector3Snapshot, roughness: number,
  ): Vector3Snapshot {
    return this.#mem.withVector3(normal, (pointer) => this.#mem.vector3(
      "cna_environment_processor_importance_sample_ggx", x, y, pointer, roughness));
  }

  /** Where a direction lands on an equirectangular panorama: two `float*` outputs, both poisoned. */
  public override directionToEquirectangular(direction: Vector3Snapshot): Vector2Snapshot {
    const scope = this.#routes.scope();
    try {
      const u = scope.allocate(4);
      const v = scope.allocate(4);
      const before = this.#routes.view();
      before.setFloat32(u, POISONED_FLOAT, true);
      before.setFloat32(v, POISONED_FLOAT, true);
      this.#mem.withVector3(direction, (pointer) =>
        this.#routes.invoke("cna_environment_processor_direction_to_equirectangular", pointer, u, v));
      const view = this.#routes.view();
      return { X: view.getFloat32(u, true), Y: view.getFloat32(v, true) };
    } finally {
      scope.dispose();
    }
  }
}
