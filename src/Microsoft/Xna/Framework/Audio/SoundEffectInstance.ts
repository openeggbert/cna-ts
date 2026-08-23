import type {
  AudioEmitterSnapshot,
  AudioListenerSnapshot,
  CnaAudioBackend,
} from "../../../../internal/backend.js";
import {
  ArgumentNullException,
  ArgumentOutOfRangeException,
  InvalidOperationException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import { NativeResourceLifetime, type NativeHandle } from "../../../../internal/ownership.js";
import type { IDisposable } from "../Contracts.js";
import type { Vector3 } from "../Vector3.js";
import { AudioEmitter, AudioListener } from "./AudioSpatial.js";
import { SoundState } from "./Enums.js";

type SoundEffectInstanceState = {
  readonly Backend: CnaAudioBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly ParentOwner: object | null;
  Volume: number;
  Pitch: number;
  Pan: number;
  IsLooped: boolean;
  HasPlayed: boolean;
  Dynamic: boolean;
  OnDispose: (() => void) | null;
};

const states = new WeakMap<SoundEffectInstance, SoundEffectInstanceState>();
const f32 = Math.fround;

function stateOf(instance: SoundEffectInstance, active = true): SoundEffectInstanceState {
  const state = states.get(instance);
  if (!state || (active && state.Lifetime.State !== "active")) {
    throw new ObjectDisposedException(instance.constructor.name);
  }
  return state;
}

function vector(value: Vector3) {
  return Object.freeze({ X: f32(value.X), Y: f32(value.Y), Z: f32(value.Z) });
}

export function audioListenerSnapshotForInternalUse(listener: AudioListener): AudioListenerSnapshot {
  if (listener == null) throw new ArgumentNullException("listener");
  return Object.freeze({
    Forward: vector(listener.Forward),
    Position: vector(listener.Position),
    Up: vector(listener.Up),
    Velocity: vector(listener.Velocity),
  });
}

export function audioEmitterSnapshotForInternalUse(emitter: AudioEmitter): AudioEmitterSnapshot {
  if (emitter == null) throw new ArgumentNullException("emitter");
  return Object.freeze({
    Forward: vector(emitter.Forward),
    Position: vector(emitter.Position),
    Up: vector(emitter.Up),
    Velocity: vector(emitter.Velocity),
    DopplerScale: f32(emitter.DopplerScale),
  });
}

function ranged(value: number, minimum: number, maximum: number): number {
  if (value < minimum || value > maximum || Number.isNaN(value)) {
    throw new ArgumentOutOfRangeException("value");
  }
  return f32(value);
}

export class SoundEffectInstance implements IDisposable {
  public get IsDisposed(): boolean { return states.get(this)?.Lifetime.State !== "active"; }

  public get IsLooped(): boolean { return stateOf(this, false).IsLooped; }
  public set IsLooped(value: boolean) {
    const state = stateOf(this);
    if (state.Dynamic && value) {
      throw new InvalidOperationException("A DynamicSoundEffectInstance cannot be looped");
    }
    if (state.HasPlayed) {
      throw new InvalidOperationException("IsLooped cannot be changed after playback has begun");
    }
    state.Backend.setSoundEffectInstanceLooped(state.Lifetime.Handle, Boolean(value));
    state.IsLooped = Boolean(value);
  }

  public get Pan(): number { return stateOf(this, false).Pan; }
  public set Pan(value: number) {
    const state = stateOf(this);
    value = ranged(value, -1, 1);
    state.Backend.setSoundEffectInstancePan(state.Lifetime.Handle, value);
    state.Pan = value;
  }

  public get Pitch(): number { return stateOf(this, false).Pitch; }
  public set Pitch(value: number) {
    const state = stateOf(this);
    value = ranged(value, -1, 1);
    state.Backend.setSoundEffectInstancePitch(state.Lifetime.Handle, value);
    state.Pitch = value;
  }

  public get State(): SoundState {
    const state = stateOf(this);
    return state.Backend.getSoundEffectInstanceInfo(state.Lifetime.Handle).State as SoundState;
  }

  public get Volume(): number { return stateOf(this, false).Volume; }
  public set Volume(value: number) {
    const state = stateOf(this);
    value = ranged(value, 0, 1);
    state.Backend.setSoundEffectInstanceVolume(state.Lifetime.Handle, value);
    state.Volume = value;
  }

  public Apply3D(listener: AudioListener, emitter: AudioEmitter): void;
  public Apply3D(listeners: AudioListener[], emitter: AudioEmitter): void;
  public Apply3D(listenerOrListeners: AudioListener | AudioListener[], emitter: AudioEmitter): void {
    const state = stateOf(this);
    if (listenerOrListeners == null) throw new ArgumentNullException("listeners");
    const listeners = Array.isArray(listenerOrListeners)
      ? listenerOrListeners.map((listener) => audioListenerSnapshotForInternalUse(listener))
      : [audioListenerSnapshotForInternalUse(listenerOrListeners)];
    state.Backend.applySoundEffectInstance3D(
      state.Lifetime.Handle,
      Object.freeze(listeners),
      audioEmitterSnapshotForInternalUse(emitter),
    );
  }

  public Pause(): void {
    const state = stateOf(this);
    state.Backend.pauseSoundEffectInstance(state.Lifetime.Handle);
  }

  public Play(): void {
    const state = stateOf(this);
    state.Backend.playSoundEffectInstance(state.Lifetime.Handle);
    state.HasPlayed = true;
  }

  public Resume(): void {
    const state = stateOf(this);
    state.Backend.resumeSoundEffectInstance(state.Lifetime.Handle);
    state.HasPlayed = true;
  }

  public Stop(): void;
  public Stop(immediate: boolean): void;
  public Stop(immediate = true): void {
    const state = stateOf(this);
    state.Backend.stopSoundEffectInstance(state.Lifetime.Handle, Boolean(immediate));
  }

  public Dispose(): void {
    const state = states.get(this);
    if (!state) return;
    state.OnDispose?.();
    state.OnDispose = null;
    state.Lifetime.Dispose();
  }
}

export function initializeSoundEffectInstanceForInternalUse(
  instance: SoundEffectInstance,
  backend: CnaAudioBackend,
  handle: NativeHandle,
  parent: NativeResourceLifetime,
  parentOwner: object | null = null,
  dynamic = false,
  onDispose: (() => void) | null = null,
): void {
  if (states.has(instance)) throw new InvalidOperationException("SoundEffectInstance is already initialized");
  const lifetime = new NativeResourceLifetime({
    Handle: handle,
    Ownership: "owned",
    Parent: parent,
    Release: (value) => backend.destroySoundEffectInstance(value),
    Label: dynamic ? "DynamicSoundEffectInstance" : "SoundEffectInstance",
  });
  states.set(instance, {
    Backend: backend,
    Lifetime: lifetime,
    ParentOwner: parentOwner,
    Volume: f32(1),
    Pitch: f32(0),
    Pan: f32(0),
    IsLooped: false,
    HasPlayed: false,
    Dynamic: dynamic,
    OnDispose: onDispose,
  });
}

export function soundEffectInstanceStateForInternalUse(
  instance: SoundEffectInstance,
): Readonly<SoundEffectInstanceState> {
  return stateOf(instance);
}
