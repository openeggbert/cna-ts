// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaXactBackend`: XACT's audio engine, banks and cues.
//
// **The fixture problem, and why it is not one.** Every route in this family needs authored XACT
// assets, and the ones a game ships are proprietary: an XGS settings file, an XSB sound bank and an
// XWB wave bank come out of Microsoft's cross-platform audio tool, and downloading somebody's is
// not an option. But the formats are documented by CNA's own parser and CNA's demo *writes* them,
// so this package writes them too -- `test/fixtures/xact.mjs` generates a settings file with two
// categories and a variable, a wave bank of synthesised sine tones, and a sound bank of cues over
// them. Nothing copyrighted is downloaded and nothing is stubbed: the bytes CNA parses are real
// XACT bytes, authored here.
//
// That is what makes this family bindable rather than `BLOCKED_FIXTURE`. What a browser still does
// not get is *audible* playback without a user gesture, which is the same WebAudio rule the
// sound-effect slice records, so cue **state** is what the browser suite asserts.
//
// ## Ownership, which XACT has more of than any other family here
//
// An engine is **OWNED**. A sound bank and a wave bank are **OWNED** but are also
// **RETAINED_DEPENDENCY** on their engine -- CNA refuses to destroy an engine whose banks are still
// in use, and `getSoundBankIsInUse` is how a consumer finds out. A category is **OWNED** by the
// caller even though it names something the engine owns, which is why `destroyAudioCategory`
// exists and does not stop the engine using that category. A cue from `getCue` is **OWNED**; a cue
// played through `playCue` is the bank's and never reaches a caller.

import { CnaXactBackendBase } from "../backend-base.js";
import type {
  AudioEmitterSnapshot, AudioListenerSnapshot, CueSnapshot, RendererDetailSnapshot,
} from "../backend.js";
import type { NativeHandle, NativeResourceLifetime } from "../ownership.js";
import { outBool, outF32, outI32, withStringView } from "./marshal.js";
import { allocateStruct, WasmStruct, type WasmRouteTable } from "./module.js";

export class WasmXactBackend extends CnaXactBackendBase {
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

  /** XACT objects are children of the running game, as sound effects are. */
  public override get ParentLifetime(): NativeResourceLifetime { return this.#parent(); }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's XACT family`);
  }

  // ---- the engine ----------------------------------------------------------------------------

  /**
   * XNA's three `AudioEngine` constructors, which CNA splits into two routes.
   *
   * The simple route is used when neither optional argument is given rather than passing defaults
   * to the long one: a look-ahead of zero and an empty renderer id are *requests*, not absences,
   * and CNA treats them differently from not asking.
   */
  public override createAudioEngine(
    settingsFile: string, lookAheadTicks?: bigint, rendererId?: string,
  ): NativeHandle {
    if (lookAheadTicks === undefined && rendererId === undefined) {
      return withStringView(this.#routes, settingsFile, (file) =>
        this.#routes.outHandle("cna_audio_engine_create", this.#game(), file));
    }
    return withStringView(this.#routes, settingsFile, (file) =>
      withStringView(this.#routes, rendererId ?? "", (renderer) => this.#routes.outHandle(
        "cna_audio_engine_create_with_renderer",
        this.#game(), file, lookAheadTicks ?? 0n, renderer,
      )));
  }

  public override destroyAudioEngine(engine: NativeHandle): void {
    this.#routes.invoke("cna_audio_engine_destroy", engine);
  }

  public override getAudioEngineIsDisposed(engine: NativeHandle): boolean {
    return outBool(this.#routes, "cna_audio_engine_get_is_disposed", engine);
  }

  /** Every audio renderer the engine can see, by friendly name and id. */
  public override getAudioEngineRendererDetails(
    engine: NativeHandle,
  ): readonly RendererDetailSnapshot[] {
    const count = Number(this.#routes.outU64("cna_audio_engine_get_renderer_count", engine));
    return Array.from({ length: count }, (_, index) => ({
      FriendlyName: this.#routes.copyString(
        "cna_audio_engine_get_renderer_friendly_name_size",
        "cna_audio_engine_copy_renderer_friendly_name",
        engine, BigInt(index),
      ),
      RendererId: this.#routes.copyString(
        "cna_audio_engine_get_renderer_id_size", "cna_audio_engine_copy_renderer_id",
        engine, BigInt(index),
      ),
    }));
  }

  public override getAudioEngineGlobalVariable(engine: NativeHandle, name: string): number {
    return withStringView(this.#routes, name, (view) =>
      outF32(this.#routes, "cna_audio_engine_get_global_variable", engine, view));
  }

  public override setAudioEngineGlobalVariable(
    engine: NativeHandle, name: string, value: number,
  ): void {
    withStringView(this.#routes, name, (view) =>
      this.#routes.invoke("cna_audio_engine_set_global_variable", engine, view, value));
  }

  public override updateAudioEngine(engine: NativeHandle): void {
    this.#routes.invoke("cna_audio_engine_update", engine);
  }

  // ---- categories ----------------------------------------------------------------------------

  public override getAudioCategory(engine: NativeHandle, name: string): NativeHandle {
    return withStringView(this.#routes, name, (view) =>
      this.#routes.outHandle("cna_audio_engine_get_category", engine, view));
  }

  public override destroyAudioCategory(category: NativeHandle): void {
    this.#routes.invoke("cna_audio_category_destroy", category);
  }

  public override getAudioCategoryName(category: NativeHandle): string {
    return this.#routes.copyString(
      "cna_audio_category_get_name_size", "cna_audio_category_copy_name", category,
    );
  }

  public override pauseAudioCategory(category: NativeHandle): void {
    this.#routes.invoke("cna_audio_category_pause", category);
  }

  public override resumeAudioCategory(category: NativeHandle): void {
    this.#routes.invoke("cna_audio_category_resume", category);
  }

  public override setAudioCategoryVolume(category: NativeHandle, value: number): void {
    this.#routes.invoke("cna_audio_category_set_volume", category, value);
  }

  public override stopAudioCategory(category: NativeHandle, options: number): void {
    this.#routes.invoke("cna_audio_category_stop", category, Math.trunc(options));
  }

  /**
   * XNA's `AudioCategory.Equals`, which is CNA's own comparison rather than handle identity.
   *
   * Two handles for one category are different numbers, so comparing them here would answer
   * `false` for a category compared with itself fetched twice.
   */
  public override audioCategoriesEqual(left: NativeHandle, right: NativeHandle): boolean {
    return outBool(this.#routes, "cna_audio_category_equals", left, right);
  }

  public override getAudioCategoryHashCode(category: NativeHandle): number {
    return outI32(this.#routes, "cna_audio_category_get_hash_code", category);
  }

  // ---- sound banks ---------------------------------------------------------------------------

  public override createSoundBank(engine: NativeHandle, filename: string): NativeHandle {
    return withStringView(this.#routes, filename, (view) =>
      this.#routes.outHandle("cna_sound_bank_create", engine, view));
  }

  public override destroySoundBank(bank: NativeHandle): void {
    this.#routes.invoke("cna_sound_bank_destroy", bank);
  }

  public override getSoundBankIsDisposed(bank: NativeHandle): boolean {
    return outBool(this.#routes, "cna_sound_bank_get_is_disposed", bank);
  }

  public override getSoundBankIsInUse(bank: NativeHandle): boolean {
    return outBool(this.#routes, "cna_sound_bank_get_is_in_use", bank);
  }

  public override getCue(bank: NativeHandle, name: string): NativeHandle {
    return withStringView(this.#routes, name, (view) =>
      this.#routes.outHandle("cna_sound_bank_get_cue", bank, view));
  }

  public override playCue(bank: NativeHandle, name: string): void {
    withStringView(this.#routes, name, (view) =>
      this.#routes.invoke("cna_sound_bank_play_cue", bank, view));
  }

  public override playCue3D(
    bank: NativeHandle, name: string,
    listener: AudioListenerSnapshot, emitter: AudioEmitterSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      const listenerStruct = this.#listener(scope, listener);
      const emitterStruct = this.#emitter(scope, emitter);
      withStringView(this.#routes, name, (view) => this.#routes.invoke(
        "cna_sound_bank_play_cue_3d", bank, view, listenerStruct, emitterStruct,
      ));
    } finally {
      scope.dispose();
    }
  }

  // ---- wave banks ----------------------------------------------------------------------------

  public override createWaveBank(engine: NativeHandle, filename: string): NativeHandle {
    return withStringView(this.#routes, filename, (view) =>
      this.#routes.outHandle("cna_wave_bank_create", engine, view));
  }

  public override createStreamingWaveBank(
    engine: NativeHandle, filename: string, offset: number, packetSize: number,
  ): NativeHandle {
    return withStringView(this.#routes, filename, (view) => this.#routes.outHandle(
      "cna_wave_bank_create_streaming", engine, view, Math.trunc(offset), Math.trunc(packetSize),
    ));
  }

  public override destroyWaveBank(bank: NativeHandle): void {
    this.#routes.invoke("cna_wave_bank_destroy", bank);
  }

  public override getWaveBankIsDisposed(bank: NativeHandle): boolean {
    return outBool(this.#routes, "cna_wave_bank_get_is_disposed", bank);
  }

  public override getWaveBankIsInUse(bank: NativeHandle): boolean {
    return outBool(this.#routes, "cna_wave_bank_get_is_in_use", bank);
  }

  public override getWaveBankIsPrepared(bank: NativeHandle): boolean {
    return outBool(this.#routes, "cna_wave_bank_get_is_prepared", bank);
  }

  // ---- cues ----------------------------------------------------------------------------------

  public override destroyCue(cue: NativeHandle): void {
    this.#routes.invoke("cna_cue_destroy", cue);
  }

  /** Eight flags in one `CNA_CueInfo`, which is one route rather than eight. */
  public override getCueInfo(cue: NativeHandle): CueSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_CueInfo");
      this.#routes.invoke("cna_cue_get_info", cue, info.pointer);
      return {
        IsCreated: info.getU8("is_created") !== 0,
        IsDisposed: info.getU8("is_disposed") !== 0,
        IsPaused: info.getU8("is_paused") !== 0,
        IsPlaying: info.getU8("is_playing") !== 0,
        IsPrepared: info.getU8("is_prepared") !== 0,
        IsPreparing: info.getU8("is_preparing") !== 0,
        IsStopped: info.getU8("is_stopped") !== 0,
        IsStopping: info.getU8("is_stopping") !== 0,
      };
    } finally {
      scope.dispose();
    }
  }

  public override getCueName(cue: NativeHandle): string {
    return this.#routes.copyString("cna_cue_get_name_size", "cna_cue_copy_name", cue);
  }

  public override applyCue3D(
    cue: NativeHandle, listener: AudioListenerSnapshot, emitter: AudioEmitterSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_cue_apply_3d", cue, this.#listener(scope, listener), this.#emitter(scope, emitter),
      );
    } finally {
      scope.dispose();
    }
  }

  public override getCueVariable(cue: NativeHandle, name: string): number {
    return withStringView(this.#routes, name, (view) =>
      outF32(this.#routes, "cna_cue_get_variable", cue, view));
  }

  public override setCueVariable(cue: NativeHandle, name: string, value: number): void {
    withStringView(this.#routes, name, (view) =>
      this.#routes.invoke("cna_cue_set_variable", cue, view, value));
  }

  public override playCueHandle(cue: NativeHandle): void {
    this.#routes.invoke("cna_cue_play", cue);
  }

  public override pauseCue(cue: NativeHandle): void {
    this.#routes.invoke("cna_cue_pause", cue);
  }

  public override resumeCue(cue: NativeHandle): void {
    this.#routes.invoke("cna_cue_resume", cue);
  }

  public override stopCue(cue: NativeHandle, options: number): void {
    this.#routes.invoke("cna_cue_stop", cue, Math.trunc(options));
  }

  // ---- 3D positioning ------------------------------------------------------------------------

  /** Writes a `CNA_AudioListener`: a position and an orientation basis, plus a velocity. */
  #listener(
    scope: ReturnType<WasmRouteTable["scope"]>, snapshot: AudioListenerSnapshot,
  ): number {
    const listener = allocateStruct(this.#routes.module, scope, "CNA_AudioListener");
    this.#vector3(listener.nested("position", "CNA_Vector3"), snapshot.Position);
    this.#vector3(listener.nested("forward", "CNA_Vector3"), snapshot.Forward);
    this.#vector3(listener.nested("up", "CNA_Vector3"), snapshot.Up);
    this.#vector3(listener.nested("velocity", "CNA_Vector3"), snapshot.Velocity);
    return listener.pointer;
  }

  /** Writes a `CNA_AudioEmitter`, which is a listener plus the two scale factors XNA gives it. */
  #emitter(
    scope: ReturnType<WasmRouteTable["scope"]>, snapshot: AudioEmitterSnapshot,
  ): number {
    const emitter = allocateStruct(this.#routes.module, scope, "CNA_AudioEmitter");
    this.#vector3(emitter.nested("position", "CNA_Vector3"), snapshot.Position);
    this.#vector3(emitter.nested("forward", "CNA_Vector3"), snapshot.Forward);
    this.#vector3(emitter.nested("up", "CNA_Vector3"), snapshot.Up);
    this.#vector3(emitter.nested("velocity", "CNA_Vector3"), snapshot.Velocity);
    emitter.setF32("doppler_scale", snapshot.DopplerScale);
    return emitter.pointer;
  }

  /** Writes a `CNA_Vector3` a caller allocated. */
  #vector3(
    target: WasmStruct,
    value: { readonly X: number; readonly Y: number; readonly Z: number },
  ): void {
    target.setF32("x", value.X).setF32("y", value.Y).setF32("z", value.Z);
  }
}
