// SPDX-License-Identifier: MS-PL
//
// CNA's particle systems, and the two pure functions that make them checkable.
//
// This family draws into whatever single target is bound, so unlike the prepass beside it there is
// nothing here that upstream finding 30 takes away: a browser can run the simulation and read the
// texels back.
//
// What makes the picture predictable rather than merely present is that CNA exposes its own
// simulation as scalars. `cna_particle_system_random` is the generator every spawn draws from, and
// `cna_particle_system_step` advances one particle by one frame -- both pure, both reached by a
// different route from the system that uses them. So a test can integrate a particle forward in
// JavaScript through CNA's own step function and compare it, component by component, to what the
// system holds after the same number of updates.
//
// **Soft particles are upstream finding 12 and are not claimed here.**
// `cna_particle_system_set_depth_input_ext` and `cna_particle_system_set_softness_ext` are bound,
// because they are how a consumer asks; both are accepted and the softness round-trips. What CNA
// draws is unchanged by either, measured on OPENGLES3 over both extremes of the depth image. The
// browser suite asserts that unchangedness rather than skipping it, so a repair fails and says so.

import { CnaParticleBackendBase } from "../backend-base.js";
import type {
  ParticleEmitterSettingsSnapshot, ParticleSnapshot, Vector3Snapshot, Vector4Snapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmEngineMemory } from "./graphics-ext-core.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { WasmStruct, type WasmRouteTable, type WasmScope } from "./module.js";

export class WasmParticleBackend extends CnaParticleBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's particle slice; ` +
      "the Node-API backend implements it",
    );
  }

  // --- the system ---------------------------------------------------------------------------------

  public override createParticleSystemAtDefaultCapacity(device: NativeHandle): NativeHandle {
    return this.#mem.create("cna_particle_system_create", device);
  }

  public override createParticleSystem(device: NativeHandle, capacity: number): NativeHandle {
    return this.#mem.create(
      "cna_particle_system_create_with_capacity", device, Math.trunc(capacity));
  }

  public override destroyParticleSystem(system: NativeHandle): void {
    this.#routes.invoke("cna_particle_system_destroy", system);
  }

  public override resetParticleSystem(system: NativeHandle): void {
    this.#routes.invoke("cna_particle_system_reset", system);
  }

  public override updateParticleSystem(system: NativeHandle, elapsedSeconds: number): void {
    this.#routes.invoke("cna_particle_system_update", system, elapsedSeconds);
  }

  public override getParticleSystemCapacity(system: NativeHandle): number {
    return this.#mem.int("cna_particle_system_get_capacity", system);
  }

  public override getParticleSystemActiveCount(system: NativeHandle): number {
    return this.#mem.int("cna_particle_system_get_active_count", system);
  }

  public override particleSystemUsesCompute(system: NativeHandle): boolean {
    return this.#mem.bool("cna_particle_system_uses_compute", system);
  }

  public override isParticleSimulationForcedOnCpu(system: NativeHandle): boolean {
    return this.#mem.bool("cna_particle_system_is_simulation_on_cpu_ext", system);
  }

  public override setParticleSimulationOnCpu(system: NativeHandle, forced: boolean): void {
    this.#routes.invoke("cna_particle_system_set_simulation_on_cpu_ext", system, forced ? 1 : 0);
  }

  public override isParticleEmissionRateClamped(system: NativeHandle): boolean {
    return this.#mem.bool("cna_particle_system_is_emission_rate_clamped", system);
  }

  public override getParticleSystemUnsupportedReason(system: NativeHandle): string {
    return this.#mem.probedString("cna_particle_system_copy_unsupported_reason", system);
  }

  /** The billboards, into whatever target is bound. A null texture is CNA's own default. */
  public override drawParticleSystem(
    system: NativeHandle, view: readonly number[], projection: readonly number[],
    texture: NativeHandle,
  ): void {
    this.#mem.withMatrix(view, (viewPointer) =>
      this.#mem.withMatrix(projection, (projectionPointer) => this.#routes.invoke(
        "cna_particle_system_draw", system, viewPointer, projectionPointer, texture,
      )));
  }

  // --- soft particles, which is upstream finding 12 -------------------------------------------------

  /**
   * The depth image particles fade against, borrowed, with the far plane it was normalised by.
   *
   * Bound because it is how a consumer asks, not because it works: CNA stores both, reads the
   * softness back, and draws a byte-identical picture whether the depth image is all zeros, all
   * ones, or absent. Finding 12 in `docs/upstream-cna-findings.md`.
   */
  public override setParticleDepthInput(
    system: NativeHandle, depth: NativeHandle, farPlane: number,
  ): void {
    this.#routes.invoke("cna_particle_system_set_depth_input_ext", system, depth, farPlane);
  }

  public override getParticleSoftness(system: NativeHandle): number {
    return this.#mem.float("cna_particle_system_get_softness_ext", system);
  }

  public override setParticleSoftness(system: NativeHandle, softness: number): void {
    this.#routes.invoke("cna_particle_system_set_softness_ext", system, softness);
  }

  public override getParticleLookupGlsl(): string {
    return this.#mem.probedString("cna_particle_system_copy_particle_lookup_glsl");
  }

  // --- the emitter ---------------------------------------------------------------------------------

  public override getParticleEmitterSettings(
    system: NativeHandle,
  ): ParticleEmitterSettingsSnapshot {
    return this.#withSettingsBuffer((settings) => {
      this.#routes.invoke("cna_particle_system_get_settings", system, settings.pointer);
      return this.#readSettings(settings);
    });
  }

  public override setParticleEmitterSettings(
    system: NativeHandle, settings: ParticleEmitterSettingsSnapshot,
  ): void {
    this.#withSettingsBuffer((buffer) => {
      this.#writeSettings(buffer, settings);
      this.#routes.invoke("cna_particle_system_set_settings", system, buffer.pointer);
    });
  }

  /** Whatever CNA's own initializer writes, which is what an unconfigured emitter emits. */
  public override getDefaultParticleEmitterSettings(): ParticleEmitterSettingsSnapshot {
    return this.#withSettingsBuffer((settings) => this.#readSettings(settings));
  }

  public override getDefaultParticle(): ParticleSnapshot {
    const scope = this.#routes.scope();
    try {
      const particle = this.#allocateParticle(scope);
      this.#routes.invoke("cna_particle_init", particle.pointer);
      return this.#readParticle(particle);
    } finally {
      scope.dispose();
    }
  }

  /** Every live particle, counted through the copy route first. */
  public override copyParticles(system: NativeHandle): readonly ParticleSnapshot[] {
    const layout = WASM_STRUCT_LAYOUTS.CNA_Particle;
    return this.#mem.probedArray(
      "cna_particle_system_copy_particles_ext", [system], layout.size, (base, written) => {
        const particles: ParticleSnapshot[] = [];
        for (let index = 0; index < written; index += 1) {
          particles.push(this.#readParticle(
            new WasmStruct(this.#routes.module, "CNA_Particle", base + layout.size * index)));
        }
        return particles;
      });
  }

  // --- the simulation, as scalars -------------------------------------------------------------------

  /** The generator every spawn draws from: one seed in, one unit fraction out. */
  public override particleRandom(seed: number): number {
    return this.#mem.float("cna_particle_system_random", seed >>> 0);
  }

  /**
   * One particle advanced by one frame, in place.
   *
   * The particle is copied in, stepped by CNA, and copied back out, so a caller integrating a
   * trajectory forward is running CNA's own arithmetic rather than a reimplementation of it. That
   * is what lets a test predict where a system's particles will be after a given number of
   * updates instead of recognising where they went.
   */
  public override stepParticle(
    particle: ParticleSnapshot, index: number,
    settings: ParticleEmitterSettingsSnapshot, elapsedSeconds: number,
  ): ParticleSnapshot {
    const scope = this.#routes.scope();
    try {
      const buffer = this.#allocateParticle(scope);
      this.#writeParticle(buffer, particle);
      const settingsBuffer = new WasmStruct(
        this.#routes.module, "CNA_ParticleEmitterSettings",
        scope.allocate(WASM_STRUCT_LAYOUTS.CNA_ParticleEmitterSettings.size),
      );
      this.#routes.invoke("cna_particle_emitter_settings_init", settingsBuffer.pointer);
      this.#writeSettings(settingsBuffer, settings);
      this.#routes.invoke(
        "cna_particle_system_step", buffer.pointer, Math.trunc(index),
        settingsBuffer.pointer, elapsedSeconds,
      );
      return this.#readParticle(buffer);
    } finally {
      scope.dispose();
    }
  }

  // --- the two structures ---------------------------------------------------------------------------

  /**
   * A settings buffer that CNA's own initializer fills before anything is written into it.
   *
   * `CNA_ParticleEmitterSettings` is growable -- its `struct_size` selects which fields CNA reads
   * -- so a zeroed one asks CNA to read a structure of no size. The initializer is the only thing
   * that can set that field correctly for the ABI in front of this backend, which is why every
   * path through here starts with it rather than with a `fill(0)`.
   */
  #withSettingsBuffer<T>(body: (settings: WasmStruct) => T): T {
    const scope = this.#routes.scope();
    try {
      const settings = new WasmStruct(
        this.#routes.module, "CNA_ParticleEmitterSettings",
        scope.allocate(WASM_STRUCT_LAYOUTS.CNA_ParticleEmitterSettings.size),
      );
      this.#routes.invoke("cna_particle_emitter_settings_init", settings.pointer);
      return body(settings);
    } finally {
      scope.dispose();
    }
  }

  #allocateParticle(scope: WasmScope): WasmStruct {
    return new WasmStruct(
      this.#routes.module, "CNA_Particle", scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Particle.size));
  }

  #readSettings(settings: WasmStruct): ParticleEmitterSettingsSnapshot {
    return {
      Position: this.#vector3(settings, "position"),
      Direction: this.#vector3(settings, "direction"),
      Gravity: this.#vector3(settings, "gravity"),
      StartColor: this.#vector4(settings, "start_color"),
      EndColor: this.#vector4(settings, "end_color"),
      ConeAngle: settings.getF32("cone_angle"),
      Speed: settings.getF32("speed"),
      SpeedVariance: settings.getF32("speed_variance"),
      Lifetime: settings.getF32("lifetime"),
      LifetimeVariance: settings.getF32("lifetime_variance"),
      Drag: settings.getF32("drag"),
      EmissionRate: settings.getF32("emission_rate"),
      StartSize: settings.getF32("start_size"),
      EndSize: settings.getF32("end_size"),
    };
  }

  /** Writes every member except `struct_size` and `struct_version`, which are CNA's to decide. */
  #writeSettings(settings: WasmStruct, values: ParticleEmitterSettingsSnapshot): void {
    this.#setVector3(settings, "position", values.Position);
    this.#setVector3(settings, "direction", values.Direction);
    this.#setVector3(settings, "gravity", values.Gravity);
    this.#setVector4(settings, "start_color", values.StartColor);
    this.#setVector4(settings, "end_color", values.EndColor);
    settings.setF32("cone_angle", values.ConeAngle)
      .setF32("speed", values.Speed)
      .setF32("speed_variance", values.SpeedVariance)
      .setF32("lifetime", values.Lifetime)
      .setF32("lifetime_variance", values.LifetimeVariance)
      .setF32("drag", values.Drag)
      .setF32("emission_rate", values.EmissionRate)
      .setF32("start_size", values.StartSize)
      .setF32("end_size", values.EndSize);
  }

  #readParticle(particle: WasmStruct): ParticleSnapshot {
    return {
      Position: this.#vector4(particle, "position"),
      Velocity: this.#vector4(particle, "velocity"),
      State: this.#vector4(particle, "state"),
    };
  }

  #writeParticle(particle: WasmStruct, values: ParticleSnapshot): void {
    this.#setVector4(particle, "position", values.Position);
    this.#setVector4(particle, "velocity", values.Velocity);
    this.#setVector4(particle, "state", values.State);
  }

  /** The field's own measured size decides how many floats come back, not a count written here. */
  #vector3(structure: WasmStruct, field: string): Vector3Snapshot {
    const [X, Y, Z] = structure.getF32Array(field) as [number, number, number];
    return { X, Y, Z };
  }

  #vector4(structure: WasmStruct, field: string): Vector4Snapshot {
    const [X, Y, Z, W] = structure.getF32Array(field) as [number, number, number, number];
    return { X, Y, Z, W };
  }

  #setVector3(structure: WasmStruct, field: string, value: Vector3Snapshot): void {
    structure.setF32Array(field, [value.X, value.Y, value.Z]);
  }

  #setVector4(structure: WasmStruct, field: string, value: Vector4Snapshot): void {
    structure.setF32Array(field, [value.X, value.Y, value.Z, value.W]);
  }
}
