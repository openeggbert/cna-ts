import type { CnaXactBackend } from "../../../../internal/backend.js";
import { getBackend } from "../../../../internal/backend.js";
import { EventDispatcher } from "../../../../internal/events.js";
import {
  ArgumentNullException,
  InvalidOperationException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime, type NativeHandle } from "../../../../internal/ownership.js";
import type { IDisposable, IEquatable, XnaEvent } from "../Contracts.js";
import { EventArgs } from "../EventArgs.js";
import { TimeSpan } from "../TimeSpan.js";
import { AudioEmitter, AudioListener } from "./AudioSpatial.js";
import { AudioStopOptions } from "./Enums.js";
import { createRendererDetailForInternalUse, RendererDetail } from "./RendererDetail.js";
import {
  audioEmitterSnapshotForInternalUse,
  audioListenerSnapshotForInternalUse,
} from "./SoundEffectInstance.js";

function xactBackend(): CnaXactBackend {
  const backend = getBackend().Xact;
  if (!backend) {
    throw new NativeUnavailableError("Authored XACT audio requires a loaded CNA backend with XACT routes");
  }
  return backend;
}

function nonempty(value: string, name: string): string {
  if (value == null || value.length === 0) throw new ArgumentNullException(name);
  return value;
}

type EngineState = {
  readonly Backend: CnaXactBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly Events: EventDispatcher<unknown, EventArgs>;
  readonly Dependants: Array<WeakRef<IDisposable>>;
};

const engineStates = new WeakMap<AudioEngine, EngineState>();

function engineState(engine: AudioEngine, active = true): EngineState {
  const state = engineStates.get(engine);
  if (!state || (active && state.Lifetime.State !== "active")) {
    throw new ObjectDisposedException("AudioEngine");
  }
  return state;
}

function registerDependant(engine: AudioEngine, dependant: IDisposable): void {
  const state = engineState(engine);
  state.Dependants.splice(
    0,
    state.Dependants.length,
    ...state.Dependants.filter((entry) => entry.deref() !== undefined),
  );
  state.Dependants.push(new WeakRef(dependant));
}

export class AudioEngine implements IDisposable {
  public static readonly ContentVersion = 39;
  public readonly Disposing: XnaEvent<unknown, EventArgs>;

  public constructor(settingsFile: string);
  public constructor(settingsFile: string, lookAheadTime: TimeSpan, rendererId: string);
  public constructor(settingsFile: string, lookAheadTime?: TimeSpan, rendererId?: string) {
    settingsFile = nonempty(settingsFile, "settingsFile");
    const backend = xactBackend();
    const handle = lookAheadTime === undefined
      ? backend.createAudioEngine(settingsFile)
      : backend.createAudioEngine(settingsFile, lookAheadTime.Ticks, rendererId ?? "");
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: backend.ParentLifetime,
      Release: (value) => backend.destroyAudioEngine(value),
      Label: "AudioEngine",
    });
    const events = new EventDispatcher<unknown, EventArgs>();
    engineStates.set(this, { Backend: backend, Lifetime: lifetime, Events: events, Dependants: [] });
    this.Disposing = events;
  }

  public get IsDisposed(): boolean {
    const state = engineStates.get(this);
    if (!state || state.Lifetime.State !== "active") return true;
    return state.Backend.getAudioEngineIsDisposed(state.Lifetime.Handle);
  }

  public get RendererDetails(): ReadonlyArray<RendererDetail> {
    const state = engineState(this);
    return Object.freeze(state.Backend.getAudioEngineRendererDetails(state.Lifetime.Handle).map(
      (value) => createRendererDetailForInternalUse(value.FriendlyName, value.RendererId),
    ));
  }

  public GetCategory(name: string): AudioCategory {
    const state = engineState(this);
    const handle = state.Backend.getAudioCategory(state.Lifetime.Handle, nonempty(name, "name"));
    return createAudioCategoryForInternalUse(this, handle);
  }

  public GetGlobalVariable(name: string): number {
    const state = engineState(this);
    return state.Backend.getAudioEngineGlobalVariable(state.Lifetime.Handle, nonempty(name, "name"));
  }

  public SetGlobalVariable(name: string, value: number): void {
    const state = engineState(this);
    state.Backend.setAudioEngineGlobalVariable(state.Lifetime.Handle, nonempty(name, "name"), Math.fround(value));
  }

  public Update(): void {
    const state = engineState(this);
    state.Backend.updateAudioEngine(state.Lifetime.Handle);
  }

  public Dispose(): void {
    const state = engineStates.get(this);
    if (!state || state.Lifetime.State !== "active") return;
    const dependants = state.Dependants.map((entry) => entry.deref()).filter(
      (value): value is IDisposable => value !== undefined,
    );
    state.Dependants.length = 0;
    const errors: unknown[] = [];
    for (const dependant of dependants.reverse()) {
      try { dependant.Dispose(); } catch (error) { errors.push(error); }
    }
    try { state.Lifetime.Dispose(); } catch (error) { errors.push(error); }
    try { state.Events.Dispatch(this, EventArgs.Empty); } catch (error) { errors.push(error); }
    if (errors.length > 0) throw new AggregateError(errors, "failed to dispose AudioEngine");
  }
}

type CategoryState = {
  readonly Backend: CnaXactBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly ParentOwner: AudioEngine;
};

const categoryStates = new WeakMap<AudioCategory, CategoryState>();

function categoryState(category: AudioCategory): CategoryState {
  const state = categoryStates.get(category);
  if (!state) throw new InvalidOperationException("The audio category is uninitialized");
  state.Lifetime.AssertActive();
  return state;
}

export class AudioCategory implements IEquatable<AudioCategory> {
  public get Name(): string {
    const state = categoryState(this);
    return state.Backend.getAudioCategoryName(state.Lifetime.Handle);
  }

  public Pause(): void {
    const state = categoryState(this);
    state.Backend.pauseAudioCategory(state.Lifetime.Handle);
  }
  public Resume(): void {
    const state = categoryState(this);
    state.Backend.resumeAudioCategory(state.Lifetime.Handle);
  }
  public SetVolume(volume: number): void {
    const state = categoryState(this);
    state.Backend.setAudioCategoryVolume(state.Lifetime.Handle, Math.fround(volume));
  }
  public Stop(options: AudioStopOptions): void {
    const state = categoryState(this);
    state.Backend.stopAudioCategory(state.Lifetime.Handle, options);
  }

  public Equals(obj: unknown): boolean;
  public Equals(other: AudioCategory): boolean;
  public Equals(obj: unknown): boolean {
    if (!(obj instanceof AudioCategory)) return false;
    const left = categoryState(this);
    const right = categoryState(obj);
    return left.Backend === right.Backend &&
      left.Backend.audioCategoriesEqual(left.Lifetime.Handle, right.Lifetime.Handle);
  }

  public GetHashCode(): number {
    const state = categoryState(this);
    return state.Backend.getAudioCategoryHashCode(state.Lifetime.Handle);
  }

  public ToString(): string { return this.Name; }
}

function createAudioCategoryForInternalUse(engine: AudioEngine, handle: NativeHandle): AudioCategory {
  const result = Object.create(AudioCategory.prototype) as AudioCategory;
  const parent = engineState(engine);
  const lifetime = new NativeResourceLifetime({
    Handle: handle,
    Ownership: "owned",
    Parent: parent.Lifetime,
    Release: (value) => parent.Backend.destroyAudioCategory(value),
    Label: "AudioCategory",
  });
  categoryStates.set(result, { Backend: parent.Backend, Lifetime: lifetime, ParentOwner: engine });
  return result;
}

type BankState = {
  readonly Backend: CnaXactBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly ParentOwner: AudioEngine;
  readonly Events: EventDispatcher<unknown, EventArgs>;
};

const soundBankStates = new WeakMap<SoundBank, BankState>();
const waveBankStates = new WeakMap<WaveBank, BankState>();

function soundBankState(bank: SoundBank, active = true): BankState {
  const state = soundBankStates.get(bank);
  if (!state || (active && state.Lifetime.State !== "active")) {
    throw new ObjectDisposedException("SoundBank");
  }
  return state;
}

function waveBankState(bank: WaveBank, active = true): BankState {
  const state = waveBankStates.get(bank);
  if (!state || (active && state.Lifetime.State !== "active")) {
    throw new ObjectDisposedException("WaveBank");
  }
  return state;
}

export class SoundBank implements IDisposable {
  public readonly Disposing: XnaEvent<unknown, EventArgs>;

  public constructor(audioEngine: AudioEngine, filename: string) {
    if (audioEngine == null) throw new ArgumentNullException("audioEngine");
    const parent = engineState(audioEngine);
    const handle = parent.Backend.createSoundBank(
      parent.Lifetime.Handle,
      nonempty(filename, "filename"),
    );
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: parent.Lifetime,
      Release: (value) => parent.Backend.destroySoundBank(value),
      Label: "SoundBank",
    });
    const events = new EventDispatcher<unknown, EventArgs>();
    soundBankStates.set(this, {
      Backend: parent.Backend,
      Lifetime: lifetime,
      ParentOwner: audioEngine,
      Events: events,
    });
    this.Disposing = events;
    registerDependant(audioEngine, this);
  }

  public get IsDisposed(): boolean {
    const state = soundBankStates.get(this);
    if (!state || state.Lifetime.State !== "active") return true;
    return state.Backend.getSoundBankIsDisposed(state.Lifetime.Handle);
  }
  public get IsInUse(): boolean {
    const state = soundBankState(this);
    return state.Backend.getSoundBankIsInUse(state.Lifetime.Handle);
  }

  public GetCue(name: string): Cue {
    const state = soundBankState(this);
    const handle = state.Backend.getCue(state.Lifetime.Handle, nonempty(name, "name"));
    return createCueForInternalUse(state.ParentOwner, handle);
  }

  public PlayCue(name: string): void;
  public PlayCue(name: string, listener: AudioListener, emitter: AudioEmitter): void;
  public PlayCue(name: string, listener?: AudioListener, emitter?: AudioEmitter): void {
    const state = soundBankState(this);
    name = nonempty(name, "name");
    if (listener === undefined && emitter === undefined) {
      state.Backend.playCue(state.Lifetime.Handle, name);
      return;
    }
    if (listener == null) throw new ArgumentNullException("listener");
    if (emitter == null) throw new ArgumentNullException("emitter");
    state.Backend.playCue3D(
      state.Lifetime.Handle,
      name,
      audioListenerSnapshotForInternalUse(listener),
      audioEmitterSnapshotForInternalUse(emitter),
    );
  }

  public Dispose(): void {
    const state = soundBankStates.get(this);
    if (!state || state.Lifetime.State !== "active") return;
    state.Lifetime.Dispose();
    state.Events.Dispatch(this, EventArgs.Empty);
  }
}

export class WaveBank implements IDisposable {
  public readonly Disposing: XnaEvent<unknown, EventArgs>;

  public constructor(audioEngine: AudioEngine, nonStreamingWaveBankFilename: string);
  public constructor(
    audioEngine: AudioEngine,
    streamingWaveBankFilename: string,
    offset: number,
    packetsize: number,
  );
  public constructor(audioEngine: AudioEngine, filename: string, offset?: number, packetsize?: number) {
    if (audioEngine == null) throw new ArgumentNullException("audioEngine");
    const parent = engineState(audioEngine);
    filename = nonempty(filename, offset === undefined
      ? "nonStreamingWaveBankFilename"
      : "streamingWaveBankFilename");
    const handle = offset === undefined
      ? parent.Backend.createWaveBank(parent.Lifetime.Handle, filename)
      : parent.Backend.createStreamingWaveBank(
        parent.Lifetime.Handle,
        filename,
        Math.trunc(offset),
        Math.trunc(packetsize as number),
      );
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: parent.Lifetime,
      Release: (value) => parent.Backend.destroyWaveBank(value),
      Label: "WaveBank",
    });
    const events = new EventDispatcher<unknown, EventArgs>();
    waveBankStates.set(this, {
      Backend: parent.Backend,
      Lifetime: lifetime,
      ParentOwner: audioEngine,
      Events: events,
    });
    this.Disposing = events;
    registerDependant(audioEngine, this);
  }

  public get IsDisposed(): boolean {
    const state = waveBankStates.get(this);
    if (!state || state.Lifetime.State !== "active") return true;
    return state.Backend.getWaveBankIsDisposed(state.Lifetime.Handle);
  }
  public get IsInUse(): boolean {
    const state = waveBankState(this);
    return state.Backend.getWaveBankIsInUse(state.Lifetime.Handle);
  }
  public get IsPrepared(): boolean {
    const state = waveBankState(this);
    return state.Backend.getWaveBankIsPrepared(state.Lifetime.Handle);
  }

  public Dispose(): void {
    const state = waveBankStates.get(this);
    if (!state || state.Lifetime.State !== "active") return;
    state.Lifetime.Dispose();
    state.Events.Dispatch(this, EventArgs.Empty);
  }
}

type CueState = {
  readonly Backend: CnaXactBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly ParentOwner: AudioEngine;
  readonly Events: EventDispatcher<unknown, EventArgs>;
};

const cueStates = new WeakMap<Cue, CueState>();

function cueState(cue: Cue, active = true): CueState {
  const state = cueStates.get(cue);
  if (!state || (active && state.Lifetime.State !== "active")) {
    throw new ObjectDisposedException("Cue");
  }
  return state;
}

export class Cue implements IDisposable {
  public readonly Disposing: XnaEvent<unknown, EventArgs>;

  private constructor(events: EventDispatcher<unknown, EventArgs>) { this.Disposing = events; }

  public get Name(): string {
    const state = cueState(this);
    return state.Backend.getCueName(state.Lifetime.Handle);
  }
  public get IsCreated(): boolean { const s = cueState(this); return s.Backend.getCueInfo(s.Lifetime.Handle).IsCreated; }
  public get IsDisposed(): boolean {
    const state = cueStates.get(this);
    if (!state || state.Lifetime.State !== "active") return true;
    return state.Backend.getCueInfo(state.Lifetime.Handle).IsDisposed;
  }
  public get IsPaused(): boolean { const s = cueState(this); return s.Backend.getCueInfo(s.Lifetime.Handle).IsPaused; }
  public get IsPlaying(): boolean { const s = cueState(this); return s.Backend.getCueInfo(s.Lifetime.Handle).IsPlaying; }
  public get IsPrepared(): boolean { const s = cueState(this); return s.Backend.getCueInfo(s.Lifetime.Handle).IsPrepared; }
  public get IsPreparing(): boolean { const s = cueState(this); return s.Backend.getCueInfo(s.Lifetime.Handle).IsPreparing; }
  public get IsStopped(): boolean { const s = cueState(this); return s.Backend.getCueInfo(s.Lifetime.Handle).IsStopped; }
  public get IsStopping(): boolean { const s = cueState(this); return s.Backend.getCueInfo(s.Lifetime.Handle).IsStopping; }

  public Apply3D(listener: AudioListener, emitter: AudioEmitter): void {
    const state = cueState(this);
    state.Backend.applyCue3D(
      state.Lifetime.Handle,
      audioListenerSnapshotForInternalUse(listener),
      audioEmitterSnapshotForInternalUse(emitter),
    );
  }
  public GetVariable(name: string): number {
    const state = cueState(this);
    return state.Backend.getCueVariable(state.Lifetime.Handle, nonempty(name, "name"));
  }
  public SetVariable(name: string, value: number): void {
    const state = cueState(this);
    state.Backend.setCueVariable(state.Lifetime.Handle, nonempty(name, "name"), Math.fround(value));
  }
  public Play(): void { const s = cueState(this); s.Backend.playCueHandle(s.Lifetime.Handle); }
  public Pause(): void { const s = cueState(this); s.Backend.pauseCue(s.Lifetime.Handle); }
  public Resume(): void { const s = cueState(this); s.Backend.resumeCue(s.Lifetime.Handle); }
  public Stop(options: AudioStopOptions): void {
    const state = cueState(this);
    state.Backend.stopCue(state.Lifetime.Handle, options);
  }
  public Dispose(): void {
    const state = cueStates.get(this);
    if (!state || state.Lifetime.State !== "active") return;
    state.Lifetime.Dispose();
    state.Events.Dispatch(this, EventArgs.Empty);
  }
}

function createCueForInternalUse(engine: AudioEngine, handle: NativeHandle): Cue {
  const parent = engineState(engine);
  const events = new EventDispatcher<unknown, EventArgs>();
  const result = Object.create(Cue.prototype) as Cue;
  Object.defineProperty(result, "Disposing", {
    value: events,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  const lifetime = new NativeResourceLifetime({
    Handle: handle,
    Ownership: "owned",
    Parent: parent.Lifetime,
    Release: (value) => parent.Backend.destroyCue(value),
    Label: "Cue",
  });
  cueStates.set(result, {
    Backend: parent.Backend,
    Lifetime: lifetime,
    ParentOwner: engine,
    Events: events,
  });
  registerDependant(engine, result);
  return result;
}
