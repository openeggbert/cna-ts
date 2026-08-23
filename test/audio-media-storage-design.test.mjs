import assert from "node:assert/strict";
import test from "node:test";

import {
  Audio, Design, FrameworkDispatcher, Media, Storage, TimeSpan, Vector3,
} from "../dist/index.js";
import { FileMode } from "../dist/IO/index.js";
import { getBackend, setBackendForInternalUse } from "../dist/internal/backend.js";
import { NativeResourceLifetime } from "../dist/internal/ownership.js";

function backendWith(previous, values) {
  const result = Object.create(previous);
  Object.assign(result, {
    Kind: "node-native",
    IsAvailable: true,
    AbiVersion: "0.7.0-test",
    Detail: "deterministic subsystem backend",
    ...values,
  });
  return result;
}

function audioHarness() {
  let next = 1000n;
  const released = [];
  const effects = new Map();
  const instances = new Map();
  const parent = new NativeResourceLifetime({
    Handle: next++, Ownership: "owned", Release: (handle) => released.push(`backend:${handle}`),
  });
  const audio = {
    ParentLifetime: parent,
    createSoundEffect(bytes, offset, count, rate, channels) {
      const handle = next++;
      effects.set(handle, { bytes: new Uint8Array(bytes), offset, count, rate, channels, name: "" });
      return handle;
    },
    createSoundEffectFromEncoded(bytes) {
      const handle = next++;
      effects.set(handle, { bytes: new Uint8Array(bytes), offset: 0, count: bytes.length, rate: 8000, channels: 1, name: "" });
      return handle;
    },
    getSoundEffectDurationTicks(handle) {
      const value = effects.get(handle);
      return BigInt(Math.trunc(value.count / (2 * value.channels) * 10_000_000 / value.rate));
    },
    getSoundEffectName(handle) { return effects.get(handle).name; },
    setSoundEffectName(handle, value) { effects.get(handle).name = value; },
    createSoundEffectInstance() {
      const handle = next++;
      instances.set(handle, { State: 2, IsLooped: false, Volume: 1, Pitch: 0, Pan: 0, pending: [] });
      return handle;
    },
    playSoundEffect() { return true; },
    destroySoundEffect(handle) { released.push(`effect:${handle}`); effects.delete(handle); },
    getMasterVolume() { return 1; }, setMasterVolume() {},
    getDistanceScale() { return 1; }, setDistanceScale() {},
    getDopplerScale() { return 1; }, setDopplerScale() {},
    getSpeedOfSound() { return 343.5; }, setSpeedOfSound() {},
    playSoundEffectInstance(handle) { instances.get(handle).State = 0; },
    pauseSoundEffectInstance(handle) { const value = instances.get(handle); if (value.State === 0) value.State = 1; },
    resumeSoundEffectInstance(handle) { instances.get(handle).State = 0; },
    stopSoundEffectInstance(handle) { instances.get(handle).State = 2; },
    getSoundEffectInstanceInfo(handle) { return { ...instances.get(handle) }; },
    setSoundEffectInstanceVolume(handle, value) { instances.get(handle).Volume = value; },
    setSoundEffectInstancePitch(handle, value) { instances.get(handle).Pitch = value; },
    setSoundEffectInstancePan(handle, value) { instances.get(handle).Pan = value; },
    setSoundEffectInstanceLooped(handle, value) { instances.get(handle).IsLooped = value; },
    applySoundEffectInstance3D(_handle, listeners) {
      if (listeners.length !== 1) throw new Error("multiple listeners are unsupported");
    },
    destroySoundEffectInstance(handle) { released.push(`instance:${handle}`); instances.delete(handle); },
    createDynamicSoundEffectInstance() {
      const handle = next++;
      instances.set(handle, { State: 2, IsLooped: false, Volume: 1, Pitch: 0, Pan: 0, pending: [] });
      return handle;
    },
    getDynamicPendingBufferCount(handle) { return instances.get(handle).pending.length; },
    submitDynamicBuffer(handle, bytes, offset, count) {
      instances.get(handle).pending.push(new Uint8Array(bytes.slice(offset, offset + count)));
    },
  };
  function pump() {
    for (const value of instances.values()) {
      if (value.State === 0 && value.pending.length > 0) value.pending.shift();
    }
  }
  return { audio, effects, instances, released, parent, pump };
}

function xactHarness() {
  let next = 2000n;
  const released = [];
  const names = new Map();
  const parent = new NativeResourceLifetime({
    Handle: next++, Ownership: "owned", Release: (handle) => released.push(`backend:${handle}`),
  });
  const make = (kind, name = kind) => {
    const handle = next++;
    names.set(handle, name);
    return handle;
  };
  const release = (kind, handle) => {
    released.push(`${kind}:${handle}`);
    names.delete(handle);
  };
  const cueInfo = () => ({
    IsCreated: true, IsDisposed: false, IsPaused: false, IsPlaying: false,
    IsPrepared: true, IsPreparing: false, IsStopped: true, IsStopping: false,
  });
  const xact = {
    ParentLifetime: parent,
    createAudioEngine: () => make("engine"),
    destroyAudioEngine: (handle) => release("engine", handle),
    getAudioEngineIsDisposed: () => false,
    getAudioEngineRendererDetails: () => [{ FriendlyName: "NULL", RendererId: "null" }],
    getAudioEngineGlobalVariable(_handle, name) { if (name === "unknown") throw new Error("unknown global variable"); return 1; },
    setAudioEngineGlobalVariable(_handle, name) { if (name === "unknown") throw new Error("unknown global variable"); },
    updateAudioEngine() {},
    getAudioCategory(_handle, name) { if (name === "unknown") throw new Error("unknown category"); return make("category", name); },
    destroyAudioCategory: (handle) => release("category", handle),
    getAudioCategoryName: (handle) => names.get(handle),
    pauseAudioCategory() {}, resumeAudioCategory() {}, setAudioCategoryVolume() {}, stopAudioCategory() {},
    audioCategoriesEqual: (left, right) => left === right,
    getAudioCategoryHashCode: (handle) => Number(handle),
    createSoundBank: () => make("sound-bank"),
    destroySoundBank: (handle) => release("sound-bank", handle),
    getSoundBankIsDisposed: () => false, getSoundBankIsInUse: () => false,
    getCue: (_handle, name) => make("cue", name),
    playCue() {}, playCue3D() {},
    createWaveBank: () => make("wave-bank"),
    createStreamingWaveBank: () => make("wave-bank"),
    destroyWaveBank: (handle) => release("wave-bank", handle),
    getWaveBankIsDisposed: () => false, getWaveBankIsInUse: () => false, getWaveBankIsPrepared: () => true,
    destroyCue: (handle) => release("cue", handle),
    getCueInfo: cueInfo,
    getCueName: (handle) => names.get(handle),
    applyCue3D() {},
    getCueVariable(_handle, name) { if (name === "unknown") throw new Error("unknown cue variable"); return 0.5; },
    setCueVariable() {}, playCueHandle() {}, pauseCue() {}, resumeCue() {}, stopCue() {},
  };
  return { parent, released, xact };
}

test("SoundEffect ownership, cached state, Apply3D and dynamic pump behavior", () => {
  const previous = getBackend();
  const harness = audioHarness();
  setBackendForInternalUse(backendWith(previous, {
    Audio: harness.audio,
    updateFrameworkDispatcher: harness.pump,
  }));
  try {
    const source = [0, 1, 2, 3];
    const effect = new Audio.SoundEffect(source, 8000, Audio.AudioChannels.Mono);
    source[0] = 255;
    assert.equal([...harness.effects.values()][0].bytes[0], 0, "PCM is snapshotted before native use");
    assert.equal(effect.Duration.Ticks, 2500n);
    assert.equal(effect.IsDisposed, false);

    const instance = effect.CreateInstance();
    assert.equal(instance.State, Audio.SoundState.Stopped);
    instance.Pause();
    assert.equal(instance.State, Audio.SoundState.Stopped);
    instance.Volume = 0.25;
    instance.Pitch = -0.5;
    instance.Pan = 0.75;
    instance.IsLooped = true;
    instance.Apply3D(new Audio.AudioListener(), new Audio.AudioEmitter());
    assert.throws(() => instance.Apply3D([], new Audio.AudioEmitter()), /multiple listeners/);
    instance.Resume();
    assert.equal(instance.State, Audio.SoundState.Playing);
    instance.Stop(false);
    assert.equal(instance.State, Audio.SoundState.Stopped);
    instance.Play();
    instance.Play();
    assert.throws(() => instance.IsLooped = false, /cannot be changed/);

    effect.Dispose();
    assert.equal(effect.IsDisposed, true);
    assert.equal(instance.IsDisposed, true);
    assert.equal(instance.Volume, 0.25);
    assert.equal(instance.Pitch, -0.5);
    assert.equal(instance.Pan, 0.75);
    assert.equal(instance.IsLooped, true);
    assert.throws(() => instance.State, /disposed/i);
    assert.throws(() => instance.Play(), /disposed/i);
    instance.Dispose();
    effect.Dispose();
    assert.deepEqual(harness.released.slice(0, 2).map((value) => value.split(":")[0]), ["instance", "effect"]);

    const dynamic = new Audio.DynamicSoundEffectInstance(8000, Audio.AudioChannels.Mono);
    const pcm = new Array(16).fill(0);
    dynamic.SubmitBuffer(pcm);
    dynamic.SubmitBuffer(pcm);
    assert.equal(dynamic.PendingBufferCount, 2);
    let first = 0;
    let second = 0;
    const selfRemoving = () => { first += 1; dynamic.BufferNeeded.Remove(selfRemoving); };
    dynamic.BufferNeeded.Add(selfRemoving);
    dynamic.BufferNeeded.Add(() => { second += 1; if (second === 1) dynamic.SubmitBuffer(pcm); });
    dynamic.Play();
    FrameworkDispatcher.Update();
    assert.equal(first, 1);
    assert.equal(second, 1);
    assert.equal(dynamic.PendingBufferCount, 2, "reentrant SubmitBuffer is retained");
    FrameworkDispatcher.Update();
    assert.equal(first, 1, "self-unsubscription takes effect on the next dispatch");
    assert.equal(second, 2);
    dynamic.Dispose();
    dynamic.Dispose();

    const throwing = new Audio.DynamicSoundEffectInstance(8000, Audio.AudioChannels.Mono);
    throwing.BufferNeeded.Add(() => { throw new Error("handler failure"); });
    throwing.Play();
    assert.throws(() => FrameworkDispatcher.Update(), /handler failure/);
    throwing.Dispose();
  } finally {
    harness.parent.Dispose();
    setBackendForInternalUse(previous);
  }
});

test("AudioEngine owns categories, banks and cues without requiring authored assets", () => {
  const previous = getBackend();
  const harness = xactHarness();
  setBackendForInternalUse(backendWith(previous, { Xact: harness.xact }));
  try {
    assert.throws(() => new Audio.AudioEngine(""), /settingsFile/);
    const engine = new Audio.AudioEngine("fixture.xgs");
    const category = engine.GetCategory("music");
    const soundBank = new Audio.SoundBank(engine, "fixture.xsb");
    const waveBank = new Audio.WaveBank(engine, "fixture.xwb");
    const cue = soundBank.GetCue("theme");
    assert.equal(category.Name, "music");
    assert.equal(cue.Name, "theme");
    assert.equal(waveBank.IsPrepared, true);
    assert.throws(() => engine.GetCategory("unknown"), /unknown category/);
    assert.throws(() => engine.GetGlobalVariable("unknown"), /unknown global variable/);

    cue.Dispose();
    cue.Dispose();
    engine.Dispose();
    engine.Dispose();
    assert.equal(engine.IsDisposed, true);
    assert.equal(soundBank.IsDisposed, true);
    assert.equal(waveBank.IsDisposed, true);
    assert.equal(cue.IsDisposed, true);
    assert.throws(() => category.Name, /disposed/i);
    assert.throws(() => engine.Update(), /disposed/i);
    assert.deepEqual(
      harness.released.map((value) => value.split(":")[0]).sort(),
      ["category", "cue", "engine", "sound-bank", "wave-bank"].sort(),
    );
  } finally {
    harness.parent.Dispose();
    setBackendForInternalUse(previous);
  }
});

test("Media collections keep identity and MediaPlayer owns one global queue", async () => {
  const previous = getBackend();
  const calls = [];
  const mediaBackend = {
    getAvailableMediaSources: () => [],
    playSongs(songs, index) { calls.push(["play", songs.map((value) => value.Uri), index]); },
    pause() { calls.push(["pause"]); }, resume() { calls.push(["resume"]); },
    stop() { calls.push(["stop"]); }, moveNext() { calls.push(["next"]); }, movePrevious() { calls.push(["previous"]); },
    setVolume(value) { calls.push(["volume", value]); }, setMuted(value) { calls.push(["muted", value]); },
    setRepeating(value) { calls.push(["repeat", value]); }, setShuffled(value) { calls.push(["shuffle", value]); },
    setVisualizationEnabled(value) { calls.push(["visualization", value]); },
    getGameHasControl: () => true,
    getPlayPositionTicks: () => 1234n,
    getVisualizationData: () => ({ Frequencies: new Array(256).fill(0.25), Samples: new Array(256).fill(-0.5) }),
    update() {},
  };
  setBackendForInternalUse(backendWith(previous, { Media: mediaBackend }));
  try {
    const { createSongCollectionForInternalUse } = await import("../dist/Microsoft/Xna/Framework/Media/Collections.js");
    const first = Media.Song.FromUri("first", new URL("file:///tmp/first.ogg"));
    const second = Media.Song.FromUri("second", new URL("file:///tmp/second.ogg"));
    const songs = createSongCollectionForInternalUse([first, second]);
    assert.equal(songs.Count, 2);
    assert.equal(songs.Get(0), first);
    assert.equal([...songs][1], second);
    assert.equal(songs.GetEnumerator().next().value, first);

    const library = new Media.MediaLibrary();
    assert.equal(library.Songs, library.Songs);
    assert.equal(library.Albums, library.Albums);
    assert.equal(library.Artists, library.Artists);
    assert.equal(library.Genres, library.Genres);
    assert.equal(library.Playlists, library.Playlists);
    assert.equal(library.Pictures, library.Pictures);
    assert.equal(library.SavedPictures, library.SavedPictures);
    assert.equal(library.RootPictureAlbum, null, "no host picture root is fabricated");
    assert.equal(library.GetPictureFromToken("missing"), null);
    assert.throws(() => library.SavePicture("fake.png", [1, 2, 3]), /unavailable/i);

    const queue = Media.MediaPlayer.Queue;
    assert.equal(queue, Media.MediaPlayer.Queue);
    const events = [];
    const active = () => events.push("active");
    const state = () => events.push("state");
    Media.MediaPlayer.ActiveSongChanged.Add(active);
    Media.MediaPlayer.MediaStateChanged.Add(state);
    Media.MediaPlayer.Play(songs, 1);
    assert.equal(Media.MediaPlayer.State, Media.MediaState.Playing);
    assert.equal(queue.Count, 2);
    assert.equal(queue.ActiveSong, second);
    assert.deepEqual(events, ["active", "state"]);
    Media.MediaPlayer.Pause();
    Media.MediaPlayer.Resume();
    Media.MediaPlayer.MovePrevious();
    assert.equal(queue.ActiveSong, first);
    Media.MediaPlayer.Volume = 2;
    Media.MediaPlayer.IsMuted = true;
    Media.MediaPlayer.IsRepeating = true;
    Media.MediaPlayer.IsShuffled = true;
    assert.equal(Media.MediaPlayer.Volume, 1);
    assert.equal(Media.MediaPlayer.PlayPosition.Ticks, 1234n);
    assert.equal(Media.MediaPlayer.GameHasControl, true);

    const visualization = new Media.VisualizationData();
    const frequencies = visualization.Frequencies;
    Media.MediaPlayer.GetVisualizationData(visualization);
    assert.equal(visualization.Frequencies, frequencies);
    assert.equal(visualization.Frequencies.length, 256);
    assert.equal(visualization.Frequencies[0], 0.25);
    assert.throws(() => visualization.Frequencies[0] = 9, TypeError);
    Media.MediaPlayer.Stop();
    Media.MediaPlayer.ActiveSongChanged.Remove(active);
    Media.MediaPlayer.MediaStateChanged.Remove(state);
    songs.Dispose();
    songs.Dispose();
    assert.equal(songs.IsDisposed, true);
    assert.throws(() => songs.Get(0), /disposed/i);
    first.Dispose();
    second.Dispose();
    library.Dispose();
    library.Dispose();
    assert.equal(library.IsDisposed, true);
    assert.throws(() => library.Songs, /disposed/i);
    assert.equal(calls[0][0], "play");
  } finally {
    setBackendForInternalUse(previous);
  }
});

function selector() {
  return new Promise((resolve, reject) => {
    let operation;
    operation = Storage.StorageDevice.BeginShowSelector((result) => {
      try { resolve(Storage.StorageDevice.EndShowSelector(result)); } catch (error) { reject(error); }
    }, null);
    assert.equal(operation.AsyncState, null);
  });
}

function openContainer(device, name) {
  return new Promise((resolve, reject) => {
    device.BeginOpenContainer(name, (result) => {
      try { resolve(device.EndOpenContainer(result)); } catch (error) { reject(error); }
    }, null);
  });
}

test("StorageDevice isolates Node storage and enforces container-relative paths", async () => {
  const device = await selector();
  assert.equal(device.IsConnected, true);
  assert.ok(device.TotalSpace > 0n);
  assert.ok(device.FreeSpace > 0n);
  const container = await openContainer(device, "tests");
  assert.equal(await openContainer(device, "tests"), container);
  container.CreateDirectory("saves");
  assert.equal(container.DirectoryExists("saves"), true);
  assert.deepEqual(container.GetDirectoryNames("sav*"), ["saves"]);
  container.CreateFile("slot.dat");
  assert.equal(container.FileExists("slot.dat"), true);
  assert.deepEqual(container.GetFileNames("*.dat"), ["slot.dat"]);
  assert.equal(container.OpenFile("slot.dat", FileMode.Open).byteLength, 0);
  assert.throws(() => container.CreateDirectory("../escape"), /escapes/);
  container.DeleteFile("slot.dat");
  container.DeleteDirectory("saves");
  assert.equal(container.FileExists("slot.dat"), false);
  let disposed = 0;
  container.Disposing.Add(() => disposed += 1);
  container.Dispose();
  container.Dispose();
  assert.equal(disposed, 1);
  assert.throws(() => container.GetFileNames(), /disposed/i);
  device.DeleteContainer("tests");
});

test("Design converters parse, format, decompose and recreate XNA math values", () => {
  const context = {};
  const culture = { ListSeparator: ";", DecimalSeparator: "," };
  const vectorConverter = new Design.Vector3Converter();
  assert.equal(vectorConverter.CanConvertFrom(context, String), true);
  const vector = vectorConverter.ConvertFrom(context, culture, "1,5; 2,5; 3,5");
  assert.ok(vector instanceof Vector3);
  assert.equal(vector.X, 1.5);
  assert.equal(vectorConverter.ConvertTo(context, culture, vector, String), "1,5; 2,5; 3,5");
  assert.deepEqual([...vectorConverter.GetProperties(context, vector, [])], ["X", "Y", "Z"]);
  const recreated = vectorConverter.CreateInstance(context, new Map([["X", 7], ["Y", 8], ["Z", 9]]));
  assert.deepEqual([recreated.X, recreated.Y, recreated.Z], [7, 8, 9]);

  const colorConverter = new Design.ColorConverter();
  const color = colorConverter.ConvertFrom(context, { ListSeparator: "," }, "1, 2, 3, 4");
  assert.deepEqual([color.R, color.G, color.B, color.A], [1, 2, 3, 4]);
  const boxConverter = new Design.BoundingBoxConverter();
  const box = boxConverter.ConvertFrom(context, { ListSeparator: "," }, "-1, -2, -3, 4, 5, 6");
  assert.deepEqual([box.Min.X, box.Min.Y, box.Min.Z, box.Max.X, box.Max.Y, box.Max.Z], [-1, -2, -3, 4, 5, 6]);
  assert.equal(new Design.RectangleConverter().CanConvertFrom(context, String), false);
});
