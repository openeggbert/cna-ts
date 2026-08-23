import { EventDispatcher } from "../../../../internal/events.js";
import { ArgumentNullException, ArgumentOutOfRangeException, ObjectDisposedException } from "../../../../internal/exceptions.js";
import type { XnaEvent } from "../Contracts.js";
import { EventArgs } from "../EventArgs.js";
import { TimeSpan } from "../TimeSpan.js";
import { SongCollection, songCollectionItemsForInternalUse } from "./Collections.js";
import { MediaState } from "./Enums.js";
import { Song, songUriForInternalUse } from "./MediaObjects.js";
import { mediaBackendForInternalUse } from "./MediaServices.js";

const activeSongEvents = new EventDispatcher<unknown, EventArgs>();
const mediaStateEvents = new EventDispatcher<unknown, EventArgs>();
let queueSongs: readonly Song[] = Object.freeze([]);
let activeSongIndex = -1;
let state = MediaState.Stopped;
let volume = Math.fround(1);
let muted = false;
let repeating = false;
let shuffled = false;
let visualizationEnabled = false;

function songSnapshots(songs: readonly Song[]) {
  return songs.map((song) => {
    if (song == null) throw new ArgumentNullException("song");
    if (song.IsDisposed) throw new ObjectDisposedException("Song");
    const uri = songUriForInternalUse(song);
    if (!uri) throw new TypeError("The song has no playable URI");
    return Object.freeze({ Name: song.Name, Uri: uri.href });
  });
}

function setQueue(songs: readonly Song[], index: number): void {
  queueSongs = Object.freeze([...songs]);
  activeSongIndex = index;
}

function transition(next: MediaState, activeChanged: boolean): void {
  const stateChanged = state !== next;
  state = next;
  if (activeChanged) activeSongEvents.Dispatch(null, EventArgs.Empty);
  if (stateChanged) mediaStateEvents.Dispatch(null, EventArgs.Empty);
}

export class MediaQueue {
  private constructor() {}
  public get Count(): number { return queueSongs.length; }
  public get ActiveSong(): Song { return queueSongs[activeSongIndex] as Song; }
  public get ActiveSongIndex(): number { return activeSongIndex; }
  public set ActiveSongIndex(value: number) {
    if (!Number.isInteger(value) || value < 0 || value >= queueSongs.length) {
      throw new ArgumentOutOfRangeException("value");
    }
    if (activeSongIndex === value) return;
    activeSongIndex = value;
    activeSongEvents.Dispatch(null, EventArgs.Empty);
  }
  public Get(index: number): Song {
    if (!Number.isInteger(index) || index < 0 || index >= queueSongs.length) {
      throw new ArgumentOutOfRangeException("index");
    }
    return queueSongs[index];
  }
}

const queue = Object.create(MediaQueue.prototype) as MediaQueue;

export class MediaPlayer {
  private constructor() {}
  public static readonly ActiveSongChanged: XnaEvent<unknown, EventArgs> = activeSongEvents;
  public static readonly MediaStateChanged: XnaEvent<unknown, EventArgs> = mediaStateEvents;

  public static get State(): MediaState { return state; }
  public static get Volume(): number { return volume; }
  public static set Volume(value: number) {
    const next = Math.fround(Math.min(1, Math.max(0, value)));
    mediaBackendForInternalUse().setVolume(next);
    volume = next;
  }
  public static get IsMuted(): boolean { return muted; }
  public static set IsMuted(value: boolean) { const next = Boolean(value); mediaBackendForInternalUse().setMuted(next); muted = next; }
  public static get IsRepeating(): boolean { return repeating; }
  public static set IsRepeating(value: boolean) { const next = Boolean(value); mediaBackendForInternalUse().setRepeating(next); repeating = next; }
  public static get IsShuffled(): boolean { return shuffled; }
  public static set IsShuffled(value: boolean) { const next = Boolean(value); mediaBackendForInternalUse().setShuffled(next); shuffled = next; }
  public static get IsVisualizationEnabled(): boolean { return visualizationEnabled; }
  public static set IsVisualizationEnabled(value: boolean) {
    const next = Boolean(value);
    mediaBackendForInternalUse().setVisualizationEnabled(next);
    visualizationEnabled = next;
  }
  public static get GameHasControl(): boolean { return mediaBackendForInternalUse().getGameHasControl(); }
  public static get PlayPosition(): TimeSpan {
    return TimeSpan.FromTicks(mediaBackendForInternalUse().getPlayPositionTicks());
  }
  public static get Queue(): MediaQueue { return queue; }

  public static Play(song: Song): void;
  public static Play(songs: SongCollection): void;
  public static Play(songs: SongCollection, index: number): void;
  public static Play(songOrSongs: Song | SongCollection, index = 0): void {
    const songs = songOrSongs instanceof SongCollection
      ? songCollectionItemsForInternalUse(songOrSongs)
      : [songOrSongs];
    if (songs.length === 0) throw new ArgumentOutOfRangeException("songs");
    if (!Number.isInteger(index) || index < 0 || index >= songs.length) {
      throw new ArgumentOutOfRangeException("index");
    }
    mediaBackendForInternalUse().playSongs(songSnapshots(songs), index);
    const changed = queueSongs[activeSongIndex] !== songs[index];
    setQueue(songs, index);
    transition(MediaState.Playing, changed);
  }

  public static Pause(): void {
    mediaBackendForInternalUse().pause();
    if (state === MediaState.Playing) transition(MediaState.Paused, false);
  }
  public static Resume(): void {
    mediaBackendForInternalUse().resume();
    if (state === MediaState.Paused) transition(MediaState.Playing, false);
  }
  public static Stop(): void {
    mediaBackendForInternalUse().stop();
    transition(MediaState.Stopped, false);
  }
  public static MoveNext(): void { MediaPlayer.move(1); }
  public static MovePrevious(): void { MediaPlayer.move(-1); }

  private static move(delta: number): void {
    const backend = mediaBackendForInternalUse();
    if (delta > 0) backend.moveNext(); else backend.movePrevious();
    if (queueSongs.length === 0) return;
    let next = activeSongIndex + delta;
    if (next < 0 || next >= queueSongs.length) {
      if (!repeating) {
        transition(MediaState.Stopped, false);
        return;
      }
      next = (next + queueSongs.length) % queueSongs.length;
    }
    activeSongIndex = next;
    activeSongEvents.Dispatch(null, EventArgs.Empty);
  }

  public static GetVisualizationData(visualizationData: VisualizationData): void {
    if (visualizationData == null) throw new ArgumentNullException("visualizationData");
    const result = mediaBackendForInternalUse().getVisualizationData();
    setVisualizationDataForInternalUse(visualizationData, result.Frequencies, result.Samples);
  }
}

type VisualizationState = {
  readonly FrequencyValues: number[];
  readonly SampleValues: number[];
  readonly Frequencies: ReadonlyArray<number>;
  readonly Samples: ReadonlyArray<number>;
};
const visualizationStates = new WeakMap<VisualizationData, VisualizationState>();

function readonlyView(values: number[]): ReadonlyArray<number> {
  return new Proxy(values, {
    set() { throw new TypeError("Visualization data is read-only"); },
    deleteProperty() { throw new TypeError("Visualization data is read-only"); },
  });
}

export class VisualizationData {
  public constructor() {
    const frequencies = new Array<number>(256).fill(0);
    const samples = new Array<number>(256).fill(0);
    visualizationStates.set(this, {
      FrequencyValues: frequencies,
      SampleValues: samples,
      Frequencies: readonlyView(frequencies),
      Samples: readonlyView(samples),
    });
  }
  public get Frequencies(): ReadonlyArray<number> {
    return (visualizationStates.get(this) as VisualizationState).Frequencies;
  }
  public get Samples(): ReadonlyArray<number> {
    return (visualizationStates.get(this) as VisualizationState).Samples;
  }
}

function setVisualizationDataForInternalUse(
  target: VisualizationData,
  frequencies: readonly number[],
  samples: readonly number[],
): void {
  if (frequencies.length !== 256 || samples.length !== 256) {
    throw new RangeError("CNA visualization data must contain exactly 256 frequencies and samples");
  }
  const state = visualizationStates.get(target) as VisualizationState;
  for (let index = 0; index < 256; index += 1) {
    state.FrequencyValues[index] = Math.fround(frequencies[index]);
    state.SampleValues[index] = Math.fround(samples[index]);
  }
}
