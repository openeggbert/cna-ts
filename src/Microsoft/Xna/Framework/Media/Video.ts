import type { CnaVideoBackend } from "../../../../internal/backend.js";
import { getBackend } from "../../../../internal/backend.js";
import { ArgumentNullException, ArgumentOutOfRangeException, ObjectDisposedException } from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime, type NativeHandle } from "../../../../internal/ownership.js";
import type { IDisposable } from "../Contracts.js";
import type { Texture2D } from "../Graphics/Texture2D.js";
import { TimeSpan } from "../TimeSpan.js";
import { MediaState, VideoSoundtrackType } from "./Enums.js";

type VideoState = {
  readonly Handle: NativeHandle;
  readonly Duration: TimeSpan;
  readonly FramesPerSecond: number;
  readonly Height: number;
  readonly Width: number;
  readonly SoundtrackType: VideoSoundtrackType;
};

const videoStates = new WeakMap<Video, VideoState>();

function videoState(video: Video): VideoState {
  const state = videoStates.get(video);
  if (!state) throw new NativeUnavailableError("Video assets must be created by a CNA content backend");
  return state;
}

export class Video {
  private constructor() {}
  public get Duration(): TimeSpan { return TimeSpan.FromTicks(videoState(this).Duration.Ticks); }
  public get FramesPerSecond(): number { return videoState(this).FramesPerSecond; }
  public get Height(): number { return videoState(this).Height; }
  public get Width(): number { return videoState(this).Width; }
  public get VideoSoundtrackType(): VideoSoundtrackType { return videoState(this).SoundtrackType; }
}

export function createVideoForInternalUse(
  handle: NativeHandle,
  durationTicks: bigint,
  framesPerSecond: number,
  width: number,
  height: number,
  soundtrackType: VideoSoundtrackType,
): Video {
  const result = Object.create(Video.prototype) as Video;
  videoStates.set(result, {
    Handle: handle,
    Duration: TimeSpan.FromTicks(durationTicks),
    FramesPerSecond: Math.fround(framesPerSecond),
    Width: width,
    Height: height,
    SoundtrackType: soundtrackType,
  });
  return result;
}

type PlayerState = {
  readonly Backend: CnaVideoBackend;
  readonly Lifetime: NativeResourceLifetime;
  Video: Video | null;
  IsLooped: boolean;
  IsMuted: boolean;
  Volume: number;
  FrameGeneration: number;
};

const playerStates = new WeakMap<VideoPlayer, PlayerState>();

function playerState(player: VideoPlayer, active = true): PlayerState {
  const state = playerStates.get(player);
  if (!state || (active && state.Lifetime.State !== "active")) {
    throw new ObjectDisposedException("VideoPlayer");
  }
  return state;
}

function invalidateFrame(state: PlayerState): void { state.FrameGeneration += 1; }

export class VideoPlayer implements IDisposable {
  public constructor() {
    const backend = getBackend().Video;
    if (!backend) throw new NativeUnavailableError("VideoPlayer is unavailable on the loaded CNA backend");
    const handle = backend.createVideoPlayer();
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: backend.ParentLifetime,
      Release: (value) => backend.destroyVideoPlayer(value),
      Label: "VideoPlayer",
    });
    playerStates.set(this, {
      Backend: backend,
      Lifetime: lifetime,
      Video: null,
      IsLooped: false,
      IsMuted: false,
      Volume: Math.fround(1),
      FrameGeneration: 0,
    });
  }

  public get IsDisposed(): boolean { return playerStates.get(this)?.Lifetime.State !== "active"; }
  public get Video(): Video { return playerState(this, false).Video as Video; }
  public get State(): MediaState {
    const state = playerState(this);
    invalidateFrame(state);
    return state.Backend.getVideoPlayerInfo(state.Lifetime.Handle).State as MediaState;
  }
  public get IsLooped(): boolean { return playerState(this, false).IsLooped; }
  public set IsLooped(value: boolean) {
    const state = playerState(this);
    state.Backend.setVideoPlayerLooped(state.Lifetime.Handle, Boolean(value));
    state.IsLooped = Boolean(value);
    invalidateFrame(state);
  }
  public get IsMuted(): boolean { return playerState(this, false).IsMuted; }
  public set IsMuted(value: boolean) {
    const state = playerState(this);
    state.Backend.setVideoPlayerMuted(state.Lifetime.Handle, Boolean(value));
    state.IsMuted = Boolean(value);
    invalidateFrame(state);
  }
  public get Volume(): number { return playerState(this, false).Volume; }
  public set Volume(value: number) {
    if (value < 0 || value > 1) throw new ArgumentOutOfRangeException("value");
    const state = playerState(this);
    value = Math.fround(value);
    state.Backend.setVideoPlayerVolume(state.Lifetime.Handle, value);
    state.Volume = value;
    invalidateFrame(state);
  }
  public get PlayPosition(): TimeSpan {
    const state = playerState(this);
    invalidateFrame(state);
    return TimeSpan.FromTicks(state.Backend.getVideoPlayerInfo(state.Lifetime.Handle).PlayPositionTicks);
  }

  public Play(video: Video): void {
    if (video == null) throw new ArgumentNullException("video");
    const state = playerState(this);
    state.Backend.playVideo(state.Lifetime.Handle, videoState(video).Handle);
    state.Video = video;
    invalidateFrame(state);
  }
  public Pause(): void { const s = playerState(this); s.Backend.pauseVideo(s.Lifetime.Handle); invalidateFrame(s); }
  public Resume(): void { const s = playerState(this); s.Backend.resumeVideo(s.Lifetime.Handle); invalidateFrame(s); }
  public Stop(): void { const s = playerState(this); s.Backend.stopVideo(s.Lifetime.Handle); invalidateFrame(s); }

  public GetTexture(): Texture2D {
    const state = playerState(this);
    invalidateFrame(state);
    if (state.Video == null) throw new NativeUnavailableError("No video has been played");
    throw new NativeUnavailableError(
      "CNA returns a player-owned transient frame texture; CNA-TS has no non-owning Texture2D facade yet",
    );
  }

  public Dispose(): void {
    const state = playerStates.get(this);
    if (!state || state.Lifetime.State !== "active") return;
    invalidateFrame(state);
    state.Lifetime.Dispose();
  }
}
