/**
 * The WebAssembly backend's `CnaAudioBackend` facade: sound effects in a browser.
 *
 * A game without sound is not much of a game, and this is the boundary XNA's `SoundEffect` and
 * `SoundEffectInstance` sit on. Everything a browser consumer writes is the same public class a
 * Node consumer writes; what differs is only which object answers underneath.
 *
 * ## Where the audio actually goes
 *
 * CNA's Emscripten build routes SDL3 audio to WebAudio, and a browser will not start a WebAudio
 * context until the page has had a user gesture. That is a browser rule, not a CNA one, so nothing
 * here pretends otherwise: creating a sound effect, reading its duration, making instances and
 * driving their state all work regardless, and whether a sample is *audible* depends on the page
 * having been interacted with. `SoundEffect.Play` returns whether the runtime accepted it, which is
 * the honest answer to give a caller who cannot be told more.
 *
 * ## What is not here
 *
 * XACT, microphones, 3D positioning and dynamic buffers are outside this slice. They refuse by
 * name through the generated `CnaAudioBackendBase` rather than pretending to work.
 */

import { CnaAudioBackendBase } from "../backend-base.js";
import type { SoundEffectInstanceSnapshot } from "../backend.js";
import { CnaResult } from "../cna-results.js";
import type { NativeHandle, NativeResourceLifetime } from "../ownership.js";
import { allocateStruct, WasmCnaError, type WasmRouteTable } from "./module.js";

export class WasmAudioBackend extends CnaAudioBackendBase {
  readonly #routes: WasmRouteTable;
  readonly #game: () => NativeHandle;
  readonly #parent: () => NativeResourceLifetime;

  public constructor(
    routes: WasmRouteTable, game: () => NativeHandle, parent: () => NativeResourceLifetime,
  ) {
    super();
    this.#routes = routes;
    this.#game = game;
    this.#parent = parent;
  }

  /**
   * Every sound effect is a child of the running game, so a game that goes away takes its audio
   * with it deterministically rather than leaving handles behind for CNA to refuse later.
   */
  public override get ParentLifetime(): NativeResourceLifetime { return this.#parent(); }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's audio slice; ` +
      "the Node-API backend implements it",
    );
  }

  public override createSoundEffect(
    pcmBytes: Uint8Array, offset: number, count: number, sampleRate: number, channels: number,
    loopStart: number, loopLength: number,
  ): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_SoundEffectCreateInfo");
      info.setU32("sample_rate", sampleRate).setU32("channels", channels);
      const bytes = scope.allocateBytes(pcmBytes);
      return this.#routes.outHandle(
        "cna_sound_effect_create_pcm16_range_ext",
        this.#game(), info.pointer, bytes, BigInt(pcmBytes.byteLength),
        offset, count, loopStart, loopLength,
      );
    } finally {
      scope.dispose();
    }
  }

  public override getSoundEffectDurationTicks(soundEffect: NativeHandle): bigint {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(8);
      this.#routes.invoke("cna_sound_effect_get_duration_ticks", soundEffect, out);
      return this.#routes.view().getBigInt64(out, true);
    } finally {
      scope.dispose();
    }
  }

  public override getSoundEffectName(soundEffect: NativeHandle): string {
    return this.#routes.copyString(
      "cna_sound_effect_get_name_size", "cna_sound_effect_copy_name", soundEffect,
    );
  }

  public override setSoundEffectName(soundEffect: NativeHandle, value: string): void {
    const scope = this.#routes.scope();
    try {
      // A CNA_StringView by value, which Emscripten lowers to a pointer to the structure.
      const text = scope.allocateUtf8(value);
      const view = allocateStruct(this.#routes.module, scope, "CNA_StringView", false);
      view.setPointer("data", text.pointer).setU64("byte_length", BigInt(text.byteLength));
      this.#routes.invoke("cna_sound_effect_set_name", soundEffect, view.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override createSoundEffectInstance(soundEffect: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_sound_effect_create_instance", soundEffect);
  }

  public override playSoundEffect(
    soundEffect: NativeHandle, volume: number, pitch: number, pan: number,
  ): boolean {
    const scope = this.#routes.scope();
    try {
      const played = scope.allocate(1);
      this.#routes.invoke(
        "cna_sound_effect_play_with_settings", soundEffect, volume, pitch, pan, played,
      );
      // Whether the runtime accepted the sample, not whether anyone heard it: a page that has had
      // no user gesture has a suspended audio context, and CNA cannot report that from here.
      return this.#routes.module.HEAPU8[played] !== 0;
    } finally {
      scope.dispose();
    }
  }

  public override destroySoundEffect(soundEffect: NativeHandle): void {
    this.#routes.invoke("cna_sound_effect_destroy", soundEffect);
  }

  public override getMasterVolume(): number {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(4);
      this.#routes.invoke("cna_sound_effect_get_master_volume", this.#game(), out);
      return this.#routes.view().getFloat32(out, true);
    } finally {
      scope.dispose();
    }
  }

  public override setMasterVolume(value: number): void {
    this.#routes.invoke("cna_sound_effect_set_master_volume", this.#game(), value);
  }

  public override playSoundEffectInstance(instance: NativeHandle): void {
    this.#routes.invoke("cna_sound_effect_instance_play", instance);
  }

  public override pauseSoundEffectInstance(instance: NativeHandle): void {
    this.#routes.invoke("cna_sound_effect_instance_pause", instance);
  }

  public override resumeSoundEffectInstance(instance: NativeHandle): void {
    this.#routes.invoke("cna_sound_effect_instance_resume", instance);
  }

  public override stopSoundEffectInstance(instance: NativeHandle, immediate: boolean): void {
    this.#routes.invoke("cna_sound_effect_instance_stop", instance, immediate ? 1 : 0);
  }

  public override getSoundEffectInstanceInfo(instance: NativeHandle): SoundEffectInstanceSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_SoundEffectInstanceInfo");
      this.#routes.invoke("cna_sound_effect_instance_get_info", instance, info.pointer);
      return {
        State: info.getU32("state"),
        IsLooped: info.getU8("is_looped") !== 0,
        Volume: info.getF32("volume"),
        Pitch: info.getF32("pitch"),
        Pan: info.getF32("pan"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override setSoundEffectInstanceVolume(instance: NativeHandle, value: number): void {
    this.#routes.invoke("cna_sound_effect_instance_set_volume", instance, value);
  }

  public override setSoundEffectInstancePitch(instance: NativeHandle, value: number): void {
    this.#routes.invoke("cna_sound_effect_instance_set_pitch", instance, value);
  }

  public override setSoundEffectInstancePan(instance: NativeHandle, value: number): void {
    this.#routes.invoke("cna_sound_effect_instance_set_pan", instance, value);
  }

  public override setSoundEffectInstanceLooped(instance: NativeHandle, value: boolean): void {
    this.#routes.invoke("cna_sound_effect_instance_set_is_looped", instance, value ? 1 : 0);
  }

  public override destroySoundEffectInstance(instance: NativeHandle): void {
    const result = this.#routes.call("cna_sound_effect_instance_destroy", instance);
    if (result === CnaResult.Success) return;
    throw new WasmCnaError("cna_sound_effect_instance_destroy", result, this.#routes.lastError());
  }
}
