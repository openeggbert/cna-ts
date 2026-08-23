import type { CnaAudioBackend, MicrophoneSnapshot } from "../../../../internal/backend.js";
import { getBackend } from "../../../../internal/backend.js";
import { EventDispatcher } from "../../../../internal/events.js";
import {
  ArgumentException,
  ArgumentOutOfRangeException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { XnaEvent } from "../Contracts.js";
import { EventArgs } from "../EventArgs.js";
import { TimeSpan } from "../TimeSpan.js";
import { AudioChannels, MicrophoneState } from "./Enums.js";
import { SoundEffect } from "./SoundEffect.js";

const cache = new WeakMap<CnaAudioBackend, Map<number, Microphone>>();
const states = new WeakMap<Microphone, { Backend: CnaAudioBackend; Snapshot: MicrophoneSnapshot }>();

function microphoneBackend(): CnaAudioBackend {
  const audio = getBackend().Audio;
  if (!audio?.getMicrophones) {
    throw new NativeUnavailableError("Microphone enumeration is unavailable on the loaded backend");
  }
  return audio;
}

function refresh(microphone: Microphone): { Backend: CnaAudioBackend; Snapshot: MicrophoneSnapshot } {
  const current = states.get(microphone);
  if (!current?.Backend.getMicrophones) {
    throw new NativeUnavailableError("Microphone state is unavailable on the loaded backend");
  }
  const snapshot = current.Backend.getMicrophones().find((value) => value.Index === current.Snapshot.Index);
  if (!snapshot) throw new NativeUnavailableError("The microphone is no longer connected");
  current.Snapshot = snapshot;
  return current;
}

export class Microphone {
  readonly #bufferReady = new EventDispatcher<unknown, EventArgs>();
  public readonly BufferReady: XnaEvent<unknown, EventArgs> = this.#bufferReady;
  public readonly Name: string;

  private constructor(backend: CnaAudioBackend, snapshot: MicrophoneSnapshot) {
    this.Name = snapshot.Name;
    states.set(this, { Backend: backend, Snapshot: snapshot });
  }

  private static wrappers(): readonly Microphone[] {
    const backend = microphoneBackend();
    const snapshots = backend.getMicrophones?.() ?? [];
    let entries = cache.get(backend);
    if (!entries) {
      entries = new Map();
      cache.set(backend, entries);
    }
    return Object.freeze(snapshots.map((snapshot) => {
      let microphone = entries.get(snapshot.Index);
      if (!microphone) {
        microphone = new Microphone(backend, snapshot);
        entries.set(snapshot.Index, microphone);
      } else {
        const state = states.get(microphone);
        if (state) state.Snapshot = snapshot;
      }
      return microphone;
    }));
  }

  public static get All(): ReadonlyArray<Microphone> { return Microphone.wrappers(); }
  public static get Default(): Microphone {
    return Microphone.wrappers().find((value) => states.get(value)?.Snapshot.IsDefault) as Microphone;
  }

  public get BufferDuration(): TimeSpan {
    return TimeSpan.FromTicks(refresh(this).Snapshot.BufferDurationTicks);
  }
  public set BufferDuration(value: TimeSpan) {
    if (value == null) throw new TypeError("value cannot be null");
    const state = refresh(this);
    if (!state.Backend.setMicrophoneBufferDurationTicks) {
      throw new NativeUnavailableError("Microphone buffer configuration is unavailable");
    }
    state.Backend.setMicrophoneBufferDurationTicks(state.Snapshot.Index, value.Ticks);
  }
  public get IsHeadset(): boolean { return refresh(this).Snapshot.IsHeadset; }
  public get SampleRate(): number { return refresh(this).Snapshot.SampleRate; }
  public get State(): MicrophoneState { return refresh(this).Snapshot.State as MicrophoneState; }

  public Start(): void {
    const state = refresh(this);
    if (!state.Backend.startMicrophone) throw new NativeUnavailableError("Microphone capture is unavailable");
    state.Backend.startMicrophone(state.Snapshot.Index);
  }

  public Stop(): void {
    const state = refresh(this);
    if (!state.Backend.stopMicrophone) throw new NativeUnavailableError("Microphone capture is unavailable");
    state.Backend.stopMicrophone(state.Snapshot.Index);
  }

  public GetData(buffer: number[]): number;
  public GetData(buffer: number[], offset: number, count: number): number;
  public GetData(buffer: number[], offset = 0, count?: number): number {
    if (!Array.isArray(buffer)) throw new ArgumentException("buffer cannot be null");
    count ??= buffer.length;
    if (!Number.isInteger(offset) || offset < 0) throw new ArgumentOutOfRangeException("offset");
    if (!Number.isInteger(count) || count < 0 || offset + count > buffer.length) {
      throw new ArgumentOutOfRangeException("count");
    }
    if (count === 0) return 0;
    const state = refresh(this);
    if (!state.Backend.getMicrophoneData) throw new NativeUnavailableError("Microphone capture is unavailable");
    const bytes = state.Backend.getMicrophoneData(state.Snapshot.Index, count);
    for (let index = 0; index < bytes.length; index += 1) buffer[offset + index] = bytes[index];
    return bytes.length;
  }

  public GetSampleDuration(sizeInBytes: number): TimeSpan {
    return SoundEffect.GetSampleDuration(sizeInBytes, this.SampleRate, AudioChannels.Mono);
  }

  public GetSampleSizeInBytes(duration: TimeSpan): number {
    return SoundEffect.GetSampleSizeInBytes(duration, this.SampleRate, AudioChannels.Mono);
  }
}
