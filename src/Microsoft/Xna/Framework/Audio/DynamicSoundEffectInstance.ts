import type { CnaAudioBackend } from "../../../../internal/backend.js";
import { getBackend } from "../../../../internal/backend.js";
import { EventDispatcher } from "../../../../internal/events.js";
import {
  ArgumentException,
  ArgumentOutOfRangeException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import { registerFrameworkPumpCallback } from "../../../../internal/framework-pump.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { XnaEvent } from "../Contracts.js";
import { EventArgs } from "../EventArgs.js";
import { TimeSpan } from "../TimeSpan.js";
import { AudioChannels } from "./Enums.js";
import { NoAudioHardwareException } from "./AudioExceptions.js";
import {
  initializeSoundEffectInstanceForInternalUse,
  SoundEffectInstance,
  soundEffectInstanceStateForInternalUse,
} from "./SoundEffectInstance.js";
import { SoundEffect } from "./SoundEffect.js";

type DynamicState = {
  readonly Backend: CnaAudioBackend;
  readonly Events: EventDispatcher<unknown, EventArgs>;
  readonly UnregisterPump: () => void;
  readonly SampleRate: number;
  readonly Channels: AudioChannels;
};

const states = new WeakMap<DynamicSoundEffectInstance, DynamicState>();

function stateOf(instance: DynamicSoundEffectInstance): DynamicState {
  const state = states.get(instance);
  if (!state || instance.IsDisposed) throw new ObjectDisposedException("DynamicSoundEffectInstance");
  return state;
}

function validateRate(value: number): number {
  if (!Number.isInteger(value) || value < 8000 || value > 48000) {
    throw new ArgumentOutOfRangeException("sampleRate");
  }
  return value;
}

function validateChannels(value: AudioChannels): AudioChannels {
  if (value !== AudioChannels.Mono && value !== AudioChannels.Stereo) {
    throw new ArgumentOutOfRangeException("channels");
  }
  return value;
}

function isNotSupported(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    (error as { cnaResult?: unknown }).cnaResult === 6;
}

export class DynamicSoundEffectInstance extends SoundEffectInstance {
  public readonly BufferNeeded: XnaEvent<unknown, EventArgs>;

  public constructor(sampleRate: number, channels: AudioChannels) {
    super();
    sampleRate = validateRate(sampleRate);
    channels = validateChannels(channels);
    const backend = getBackend().Audio;
    if (!backend) {
      throw new NativeUnavailableError(
        "DynamicSoundEffectInstance requires a loaded CNA backend with audio routes",
      );
    }
    let handle;
    try {
      handle = backend.createDynamicSoundEffectInstance(sampleRate, channels);
    } catch (error) {
      if (isNotSupported(error)) throw new NoAudioHardwareException("No audio hardware is available", error as Error);
      throw error;
    }
    const events = new EventDispatcher<unknown, EventArgs>();
    const unregister = registerFrameworkPumpCallback(() => {
      if (this.IsDisposed) return;
      if (backend.getDynamicPendingBufferCount(handle) <= 2) {
        events.Dispatch(this, EventArgs.Empty);
      }
    });
    initializeSoundEffectInstanceForInternalUse(
      this, backend, handle, backend.ParentLifetime, null, true, unregister,
    );
    states.set(this, {
      Backend: backend,
      Events: events,
      UnregisterPump: unregister,
      SampleRate: sampleRate,
      Channels: channels,
    });
    this.BufferNeeded = events;
  }

  public override get IsLooped(): boolean {
    soundEffectInstanceStateForInternalUse(this);
    return false;
  }
  public override set IsLooped(value: boolean) { super.IsLooped = value; }

  public get PendingBufferCount(): number {
    const state = stateOf(this);
    return state.Backend.getDynamicPendingBufferCount(
      soundEffectInstanceStateForInternalUse(this).Lifetime.Handle,
    );
  }

  public GetSampleDuration(sizeInBytes: number): TimeSpan {
    const state = stateOf(this);
    return SoundEffect.GetSampleDuration(sizeInBytes, state.SampleRate, state.Channels);
  }

  public GetSampleSizeInBytes(duration: TimeSpan): number {
    const state = stateOf(this);
    return SoundEffect.GetSampleSizeInBytes(duration, state.SampleRate, state.Channels);
  }

  public override Play(): void { super.Play(); }

  public SubmitBuffer(buffer: number[]): void;
  public SubmitBuffer(buffer: number[], offset: number, count: number): void;
  public SubmitBuffer(buffer: number[], offset = 0, count?: number): void {
    const state = stateOf(this);
    if (!Array.isArray(buffer) || buffer.length === 0) {
      throw new ArgumentException("The audio buffer is invalid");
    }
    const bytes = new Uint8Array(buffer.length);
    for (let index = 0; index < buffer.length; index += 1) {
      const value = buffer[index];
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new ArgumentException("The audio buffer is invalid");
      }
      bytes[index] = value;
    }
    count ??= bytes.length;
    const blockAlign = 2 * state.Channels;
    if (!Number.isInteger(offset) || offset < 0 || offset >= bytes.length || offset % blockAlign !== 0) {
      throw new ArgumentException("The audio buffer offset is invalid");
    }
    if (!Number.isInteger(count) || count <= 0 || offset + count > bytes.length || count % blockAlign !== 0) {
      throw new ArgumentException("The offset and count do not describe a valid buffer range");
    }
    state.Backend.submitDynamicBuffer(
      soundEffectInstanceStateForInternalUse(this).Lifetime.Handle,
      bytes,
      offset,
      count,
    );
  }

}
