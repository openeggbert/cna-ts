import type { CnaAudioBackend } from "../../../../internal/backend.js";
import { getBackend } from "../../../../internal/backend.js";
import {
  ArgumentException,
  ArgumentOutOfRangeException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime } from "../../../../internal/ownership.js";
import type { IDisposable } from "../Contracts.js";
import { TimeSpan } from "../TimeSpan.js";
import { AudioChannels } from "./Enums.js";
import { NoAudioHardwareException } from "./AudioExceptions.js";
import {
  initializeSoundEffectInstanceForInternalUse,
  SoundEffectInstance,
} from "./SoundEffectInstance.js";

type SoundEffectState = {
  readonly Backend: CnaAudioBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly Duration: TimeSpan;
  Name: string;
};

const states = new WeakMap<SoundEffect, SoundEffectState>();
const f32 = Math.fround;
const FLOAT_EPSILON = 1.401298464324817e-45;

let masterVolume = f32(1);
let distanceScale = f32(1);
let dopplerScale = f32(1);
let speedOfSound = f32(343.5);

function audioBackend(): CnaAudioBackend {
  const audio = getBackend().Audio;
  if (!audio) {
    throw new NativeUnavailableError("SoundEffect requires a loaded CNA backend with audio routes");
  }
  return audio;
}

function isCnaNotSupported(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    (error as { cnaResult?: unknown }).cnaResult === 6;
}

function stateOf(effect: SoundEffect, active = true): SoundEffectState {
  const state = states.get(effect);
  if (!state) throw new ObjectDisposedException("SoundEffect");
  if (active && state.Lifetime.State !== "active") throw new ObjectDisposedException("SoundEffect");
  return state;
}

function int32(value: number, name: string): number {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new ArgumentOutOfRangeException(name);
  }
  return value;
}

function validateSampleRate(sampleRate: number): number {
  sampleRate = int32(sampleRate, "sampleRate");
  if (sampleRate < 8000 || sampleRate > 48000) {
    throw new ArgumentOutOfRangeException("sampleRate");
  }
  return sampleRate;
}

function validateChannels(channels: AudioChannels): AudioChannels {
  if (channels !== AudioChannels.Mono && channels !== AudioChannels.Stereo) {
    throw new ArgumentOutOfRangeException("channels");
  }
  return channels;
}

function snapshotBytes(buffer: number[]): Uint8Array {
  if (!Array.isArray(buffer) || buffer.length === 0) {
    throw new ArgumentException("The audio buffer cannot be null or empty");
  }
  const result = new Uint8Array(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    const value = buffer[index];
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new ArgumentException("The audio buffer must contain bytes");
    }
    result[index] = value;
  }
  return result;
}

function validatePcm(
  buffer: number[],
  offset: number,
  count: number,
  sampleRate: number,
  channels: AudioChannels,
  loopStart: number,
  loopLength: number,
): { Bytes: Uint8Array; Offset: number; Count: number; SampleRate: number; Channels: AudioChannels; LoopStart: number; LoopLength: number } {
  sampleRate = validateSampleRate(sampleRate);
  channels = validateChannels(channels);
  const bytes = snapshotBytes(buffer);
  offset = int32(offset, "offset");
  count = int32(count, "count");
  loopStart = int32(loopStart, "loopStart");
  loopLength = int32(loopLength, "loopLength");
  const blockAlign = 2 * channels;
  if (bytes.length % blockAlign !== 0) throw new ArgumentException("The audio buffer is invalid");
  if (offset < 0 || offset >= bytes.length || offset % blockAlign !== 0) {
    throw new ArgumentException("The audio buffer offset is invalid");
  }
  const end = offset + count;
  if (!Number.isSafeInteger(end) || count <= 0 || end > bytes.length || count % blockAlign !== 0) {
    throw new ArgumentException("The offset and count do not describe a valid buffer range");
  }
  const loopEnd = loopStart + loopLength;
  if (!Number.isSafeInteger(loopEnd) || loopStart < 0 || loopLength < 0 || loopEnd > count / blockAlign) {
    throw new ArgumentException("The loop region is invalid");
  }
  return { Bytes: bytes, Offset: offset, Count: count, SampleRate: sampleRate, Channels: channels, LoopStart: loopStart, LoopLength: loopLength };
}

function validateRange(value: number, minimum: number, maximum: number, name: string): number {
  if (value < minimum || value > maximum || Number.isNaN(value)) {
    throw new ArgumentOutOfRangeException(name);
  }
  return f32(value);
}

export class SoundEffect implements IDisposable {
  public constructor(buffer: number[], sampleRate: number, channels: AudioChannels);
  public constructor(
    buffer: number[], offset: number, count: number, sampleRate: number,
    channels: AudioChannels, loopStart: number, loopLength: number,
  );
  public constructor(
    buffer: number[],
    offsetOrSampleRate: number,
    countOrChannels: number,
    sampleRate?: number,
    channels?: AudioChannels,
    loopStart = 0,
    loopLength = 0,
  ) {
    let prepared;
    if (sampleRate === undefined) {
      prepared = validatePcm(
        buffer,
        0,
        Array.isArray(buffer) ? buffer.length : 0,
        offsetOrSampleRate,
        countOrChannels as AudioChannels,
        0,
        0,
      );
    } else {
      prepared = validatePcm(
        buffer, offsetOrSampleRate, countOrChannels, sampleRate, channels as AudioChannels,
        loopStart, loopLength,
      );
    }
    const backend = audioBackend();
    let handle;
    try {
      handle = backend.createSoundEffect(
        prepared.Bytes, prepared.Offset, prepared.Count, prepared.SampleRate,
        prepared.Channels, prepared.LoopStart, prepared.LoopLength,
      );
    } catch (error) {
      if (isCnaNotSupported(error)) throw new NoAudioHardwareException("No audio hardware is available", error as Error);
      throw error;
    }
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: backend.ParentLifetime,
      Release: (value) => backend.destroySoundEffect(value),
      Label: "SoundEffect",
    });
    states.set(this, {
      Backend: backend,
      Lifetime: lifetime,
      Duration: TimeSpan.FromTicks(backend.getSoundEffectDurationTicks(handle)),
      Name: backend.getSoundEffectName(handle),
    });
  }

  public static FromStream(stream: Uint8Array): SoundEffect {
    if (stream == null) throw new TypeError("stream cannot be null");
    if (!(stream instanceof Uint8Array) || stream.byteLength === 0) {
      throw new ArgumentException("stream must contain encoded audio bytes");
    }
    const backend = audioBackend();
    let handle;
    try {
      handle = backend.createSoundEffectFromEncoded(new Uint8Array(stream));
    } catch (error) {
      if (isCnaNotSupported(error)) throw new NoAudioHardwareException("Encoded audio is unavailable", error as Error);
      throw error;
    }
    const result = Object.create(SoundEffect.prototype) as SoundEffect;
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: backend.ParentLifetime,
      Release: (value) => backend.destroySoundEffect(value),
      Label: "SoundEffect",
    });
    states.set(result, {
      Backend: backend,
      Lifetime: lifetime,
      Duration: TimeSpan.FromTicks(backend.getSoundEffectDurationTicks(handle)),
      Name: backend.getSoundEffectName(handle),
    });
    return result;
  }

  public static GetSampleDuration(
    sizeInBytes: number,
    sampleRate: number,
    channels: AudioChannels,
  ): TimeSpan {
    sizeInBytes = int32(sizeInBytes, "sizeInBytes");
    if (sizeInBytes < 0) throw new ArgumentException("sizeInBytes cannot be negative");
    sampleRate = validateSampleRate(sampleRate);
    channels = validateChannels(channels);
    if (sizeInBytes === 0) return TimeSpan.Zero;
    const sampleCount = Math.trunc(sizeInBytes / (2 * channels));
    const milliseconds = f32(f32(f32(sampleCount) * f32(1000)) / f32(sampleRate));
    return TimeSpan.FromMilliseconds(milliseconds);
  }

  public static GetSampleSizeInBytes(
    duration: TimeSpan,
    sampleRate: number,
    channels: AudioChannels,
  ): number {
    if (duration == null) throw new TypeError("duration cannot be null");
    const milliseconds = duration.TotalMilliseconds;
    if (milliseconds < 0 || milliseconds > 0x7fff_ffff) {
      throw new ArgumentOutOfRangeException("duration");
    }
    sampleRate = validateSampleRate(sampleRate);
    channels = validateChannels(channels);
    if (duration.Ticks === 0n) return 0;
    const samples = Math.trunc(milliseconds * f32(f32(sampleRate) / f32(1000)));
    const bytes = (samples + samples % channels) * (2 * channels);
    if (!Number.isSafeInteger(bytes) || bytes > 0x7fff_ffff) {
      throw new ArgumentOutOfRangeException("duration");
    }
    return bytes;
  }

  public static get MasterVolume(): number { return masterVolume; }
  public static set MasterVolume(value: number) {
    const next = validateRange(value, 0, 1, "value");
    getBackend().Audio?.setMasterVolume(next);
    masterVolume = next;
  }
  public static get DistanceScale(): number { return distanceScale; }
  public static set DistanceScale(value: number) {
    if (value < 0 || Number.isNaN(value)) throw new ArgumentOutOfRangeException("value");
    const next = f32(Math.max(value, FLOAT_EPSILON));
    getBackend().Audio?.setDistanceScale(next);
    distanceScale = next;
  }
  public static get DopplerScale(): number { return dopplerScale; }
  public static set DopplerScale(value: number) {
    if (value < 0 || Number.isNaN(value)) throw new ArgumentOutOfRangeException("value");
    const next = f32(value);
    getBackend().Audio?.setDopplerScale(next);
    dopplerScale = next;
  }
  public static get SpeedOfSound(): number { return speedOfSound; }
  public static set SpeedOfSound(value: number) {
    if (value <= 0 || Number.isNaN(value)) throw new ArgumentOutOfRangeException("value");
    const next = f32(value);
    getBackend().Audio?.setSpeedOfSound(next);
    speedOfSound = next;
  }

  public get Duration(): TimeSpan { return TimeSpan.FromTicks(stateOf(this, false).Duration.Ticks); }
  public get IsDisposed(): boolean { return states.get(this)?.Lifetime.State !== "active"; }
  public get Name(): string { return stateOf(this, false).Name; }
  public set Name(value: string) {
    if (value == null) throw new TypeError("value cannot be null");
    const state = stateOf(this);
    state.Backend.setSoundEffectName(state.Lifetime.Handle, value);
    state.Name = value;
  }

  public CreateInstance(): SoundEffectInstance {
    const state = stateOf(this);
    const handle = state.Backend.createSoundEffectInstance(state.Lifetime.Handle);
    const result = new SoundEffectInstance();
    initializeSoundEffectInstanceForInternalUse(result, state.Backend, handle, state.Lifetime, this);
    return result;
  }

  public Play(): boolean;
  public Play(volume: number, pitch: number, pan: number): boolean;
  public Play(volume = 1, pitch = 0, pan = 0): boolean {
    const state = stateOf(this);
    volume = validateRange(volume, 0, 1, "volume");
    pitch = validateRange(pitch, -1, 1, "pitch");
    pan = validateRange(pan, -1, 1, "pan");
    return state.Backend.playSoundEffect(state.Lifetime.Handle, volume, pitch, pan);
  }

  public Dispose(): void { states.get(this)?.Lifetime.Dispose(); }
}
