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
 * ## Microphones, which a browser does have
 *
 * SDL3's Emscripten backend enumerates recording devices, and headless Chromium reports two with a
 * default among them -- measured, not assumed. So the microphone family is bound here rather than
 * refused: names, headset flags, sample rates, states and buffer durations all answer, and
 * `Microphone.Start` is accepted. Whether a browser will actually *deliver* samples depends on the
 * page having been granted microphone permission, which is a browser rule this binding neither
 * bypasses nor pretends about -- the same shape as the WebAudio gesture rule above.
 *
 * ## What is not here
 *
 * XACT, 3D positioning and dynamic buffers are outside this slice. They refuse by name through
 * the generated `CnaAudioBackendBase` rather than pretending to work. (XACT is bound, in its own
 * facade: `src/internal/wasm/xact.ts`.)
 */

import { CnaAudioBackendBase } from "../backend-base.js";
import type {
  AudioEmitterSnapshot, AudioListenerSnapshot, MicrophoneSnapshot, SoundEffectInstanceSnapshot,
} from "../backend.js";
import { CnaResult } from "../cna-results.js";
import type { NativeHandle, NativeResourceLifetime } from "../ownership.js";
import { WasmEngineMemory } from "./graphics-ext-core.js";
import { outBool, outI32, outI64 } from "./marshal.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct, WasmCnaError, WasmStruct, type WasmRouteTable } from "./module.js";

export class WasmAudioBackend extends CnaAudioBackendBase {
  readonly #mem: WasmEngineMemory;
  get #routes(): WasmRouteTable { return this.#mem.routes; }

  readonly #game: () => NativeHandle;
  readonly #parent: () => NativeResourceLifetime;

  public constructor(
    routes: WasmRouteTable, game: () => NativeHandle, parent: () => NativeResourceLifetime,
  ) {
    super();
    this.#mem = new WasmEngineMemory(routes);
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

  /**
   * Every microphone the platform enumerates.
   *
   * The default index is asked once rather than per device: CNA answers it for the *platform*, and
   * asking it inside the loop would be one route call per microphone for one answer.
   */
  public getMicrophones(): readonly MicrophoneSnapshot[] {
    const game = this.#game();
    const count = Number(this.#routes.outU64("cna_microphone_get_count", game));
    const scope = this.#routes.scope();
    let defaultIndex = -1;
    try {
      const index = scope.allocate(8);
      const available = scope.allocate(4);
      this.#routes.invoke("cna_microphone_get_default_index_ext", game, index, available);
      if (this.#routes.view().getUint8(available) !== 0) {
        defaultIndex = Number(this.#routes.view().getBigUint64(index, true));
      }
    } finally {
      scope.dispose();
    }
    return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
      Index: index,
      Name: this.#routes.copyString(
        "cna_microphone_get_name_size_at", "cna_microphone_copy_name_at", game, BigInt(index),
      ),
      IsHeadset: outBool(this.#routes, "cna_microphone_get_is_headset_at", game, BigInt(index)),
      SampleRate: outI32(this.#routes, "cna_microphone_get_sample_rate_at", game, BigInt(index)),
      State: this.#routes.outU32("cna_microphone_get_state_at", game, BigInt(index)),
      BufferDurationTicks:
        outI64(this.#routes, "cna_microphone_get_buffer_duration_ticks_at", game, BigInt(index)),
      IsDefault: index === defaultIndex,
    })));
  }

  public setMicrophoneBufferDurationTicks(index: number, ticks: bigint): void {
    this.#routes.invoke(
      "cna_microphone_set_buffer_duration_ticks_at", this.#game(), BigInt(Math.trunc(index)), ticks,
    );
  }

  public startMicrophone(index: number): void {
    this.#routes.invoke("cna_microphone_start_at", this.#game(), BigInt(Math.trunc(index)));
  }

  public stopMicrophone(index: number): void {
    this.#routes.invoke("cna_microphone_stop_at", this.#game(), BigInt(Math.trunc(index)));
  }

  /**
   * Captured bytes, up to `count`.
   *
   * CNA writes how many it produced, which is what is returned: a microphone that has captured
   * less than a caller asked for is the ordinary case, and answering the requested length would
   * hand a game silence it would mix.
   */
  public getMicrophoneData(index: number, count: number): Uint8Array {
    const requested = Math.max(Math.trunc(count), 0);
    if (requested === 0) return new Uint8Array();
    const scope = this.#routes.scope();
    try {
      const buffer = scope.allocate(requested);
      const written = scope.allocate(8);
      this.#routes.invoke(
        "cna_microphone_get_data_at",
        this.#game(), BigInt(Math.trunc(index)), buffer, BigInt(requested), written,
      );
      const produced = Number(this.#routes.view().getBigUint64(written, true));
      return new Uint8Array(this.#routes.module.HEAPU8.subarray(buffer, buffer + produced));
    } finally {
      scope.dispose();
    }
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

  // --- three-dimensional audio, and the dynamic instance a game feeds -----------------------------
  //
  // These were outside the first slice for the same reason the rest of it was: nobody had needed
  // them yet. Nothing here is renderer-dependent -- the browser's audio platform is SDL3 through
  // Emscripten, and CNA answers about it the same way it does anywhere.

  public override createSoundEffectFromEncoded(encoded: Uint8Array): NativeHandle {
    const scope = this.#routes.scope();
    try {
      return this.#routes.outHandle(
        "cna_sound_effect_create_from_encoded_ext", this.#game(),
        scope.allocateBytes(encoded), BigInt(encoded.byteLength),
      );
    } finally {
      scope.dispose();
    }
  }

  public override getDistanceScale(): number {
    return this.#mem.float("cna_sound_effect_get_distance_scale", this.#game());
  }

  public override setDistanceScale(value: number): void {
    this.#routes.invoke("cna_sound_effect_set_distance_scale", this.#game(), value);
  }

  public override getDopplerScale(): number {
    return this.#mem.float("cna_sound_effect_get_doppler_scale", this.#game());
  }

  public override setDopplerScale(value: number): void {
    this.#routes.invoke("cna_sound_effect_set_doppler_scale", this.#game(), value);
  }

  public override getSpeedOfSound(): number {
    return this.#mem.float("cna_sound_effect_get_speed_of_sound", this.#game());
  }

  public override setSpeedOfSound(value: number): void {
    this.#routes.invoke("cna_sound_effect_set_speed_of_sound", this.#game(), value);
  }

  /**
   * Positions one instance against however many listeners a game has.
   *
   * XNA's `Apply3D` takes one listener or an array; CNA's route takes the array and its count, so
   * the single-listener overload is the array of one rather than a second route.
   */
  public override applySoundEffectInstance3D(
    instance: NativeHandle,
    listeners: readonly AudioListenerSnapshot[],
    emitter: AudioEmitterSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      // Both structures are growable, and their `struct_size` comes from the **measured wasm32
      // layout** rather than from CNA's own initialiser. That is the same thing the Node-API
      // bridge does with `sizeof`, which a WebAssembly binding cannot use -- and it keeps the
      // browser slice a subset of Node's rather than reaching two routes Node never needs. Every
      // other field is written explicitly below, so the initialiser's defaults are not wanted.
      const layout = WASM_STRUCT_LAYOUTS.CNA_AudioListener;
      const buffer = scope.allocate(layout.size * Math.max(listeners.length, 1));
      listeners.forEach((listener, index) => {
        const structure = new WasmStruct(
          this.#routes.module, "CNA_AudioListener", buffer + layout.size * index);
        structure.setU32("struct_size", layout.size).setU32("struct_version", 1);
        this.#writeAudioVectors(structure, listener);
      });
      const emitterStructure = allocateStruct(this.#routes.module, scope, "CNA_AudioEmitter");
      this.#writeAudioVectors(emitterStructure, emitter);
      emitterStructure.setF32("doppler_scale", emitter.DopplerScale);
      this.#routes.invoke(
        "cna_sound_effect_instance_apply_3d_multi_ext", instance, buffer,
        BigInt(listeners.length), emitterStructure.pointer,
      );
    } finally {
      scope.dispose();
    }
  }

  public override createDynamicSoundEffectInstance(
    sampleRate: number, channels: number,
  ): NativeHandle {
    return this.#routes.outHandle(
      "cna_dynamic_sound_effect_instance_create", this.#game(), Math.trunc(sampleRate), channels);
  }

  public override getDynamicPendingBufferCount(instance: NativeHandle): number {
    return this.#mem.int(
      "cna_dynamic_sound_effect_instance_get_pending_buffer_count", instance);
  }

  public override submitDynamicBuffer(
    instance: NativeHandle, buffer: Uint8Array, offset: number, count: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_dynamic_sound_effect_instance_submit_buffer", instance,
        scope.allocateBytes(buffer), BigInt(buffer.byteLength),
        Math.trunc(offset), Math.trunc(count),
      );
    } finally {
      scope.dispose();
    }
  }

  /** The four vectors a listener and an emitter share, written at their measured offsets. */
  #writeAudioVectors(structure: WasmStruct, values: AudioListenerSnapshot): void {
    for (const [field, value] of [
      ["forward", values.Forward], ["position", values.Position],
      ["up", values.Up], ["velocity", values.Velocity],
    ] as const) {
      structure.setF32Array(field, [value.X, value.Y, value.Z]);
    }
  }

}
