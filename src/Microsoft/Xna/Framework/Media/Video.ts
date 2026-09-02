import type { CnaVideoBackend } from "../../../../internal/backend.js";
import { getBackend } from "../../../../internal/backend.js";
import {
  ArgumentNullException,
  ArgumentOutOfRangeException,
  InvalidOperationException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime, type NativeHandle } from "../../../../internal/ownership.js";
import type { IDisposable } from "../Contracts.js";
import { SurfaceFormat } from "../Graphics/DeviceEnums.js";
import { Texture2D } from "../Graphics/Texture2D.js";
import { TimeSpan } from "../TimeSpan.js";
import { MediaState, VideoSoundtrackType } from "./Enums.js";
import {
  liveGraphicsDeviceForInternalUse,
} from "../../../../internal/graphics-device-registry.js";

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
  /**
   * The facade handed out by the last {@link VideoPlayer.GetTexture}, and the CNA generation it was
   * made from. CNA's frame texture is valid only until the next call on that player, so the facade
   * is invalidated the moment anything else touches it rather than left to dangle.
   */
  Frame: { readonly Texture: Texture2D; readonly Generation: bigint } | null;
};

const playerStates = new WeakMap<VideoPlayer, PlayerState>();

function playerState(player: VideoPlayer, active = true): PlayerState {
  const state = playerStates.get(player);
  if (!state || (active && state.Lifetime.State !== "active")) {
    throw new ObjectDisposedException("VideoPlayer");
  }
  return state;
}

/**
 * Retires the borrowed frame facade, because whatever is about to happen may replace CNA's frame.
 *
 * The texture is a **borrowed** view of a player-owned object: disposing the facade releases
 * nothing, it only stops the facade answering. That is the whole point -- a stale view must fail
 * by name rather than reach a handle CNA has already reused for a different frame.
 */
function invalidateFrame(state: PlayerState): void {
  state.FrameGeneration += 1;
  const frame = state.Frame;
  if (frame == null) return;
  state.Frame = null;
  frame.Texture.Dispose();
}

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
      Frame: null,
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

  /**
   * The frame the player currently holds, as a **borrowed** `Texture2D`.
   *
   * XNA owns two frame textures and alternates between them, so its callers can rely on two stable
   * identities. CNA decodes into one texture in place and hands back a fresh handle on every ask,
   * which makes "the same frame twice" and "the frame advanced" indistinguishable by handle alone.
   * `cna_video_player_get_frame_ext` settles that with a monotonic decode generation, and this is
   * what makes a safe projection possible at all.
   *
   * So the texture returned here is a non-owning view, not an owned resource: disposing it releases
   * nothing, and it is retired — refusing by name afterwards — as soon as anything else touches the
   * player, which is exactly the window CNA says the handle is valid for. Asking twice without
   * touching the player in between returns the *same* object while the generation is unchanged, so
   * a game can compare identity rather than re-uploading a frame it already has.
   *
   * Draw with it or copy its pixels before calling anything else on the player.
   */
  public GetTexture(): Texture2D {
    const state = playerState(this);
    if (state.Video == null) throw new InvalidOperationException("No video has been played");
    const frame = state.Backend.getVideoPlayerFrame(state.Lifetime.Handle);
    const existing = state.Frame;
    if (existing != null) {
      // Same decoded frame, same object. A new facade over the same pixels would make a consumer
      // think the frame had advanced.
      if (existing.Generation === frame.Generation) return existing.Texture;
      invalidateFrame(state);
    }
    if (!frame.IsAvailable) {
      throw new InvalidOperationException(
        "the VideoPlayer holds no decoded frame yet; CNA reports no frame texture",
      );
    }
    const device = liveGraphicsDeviceForInternalUse();
    if (device == null) {
      throw new NativeUnavailableError(
        "VideoPlayer.GetTexture needs a live GraphicsDevice to present the frame through",
      );
    }
    const video = state.Video;
    // The sixth argument is the implementation-only adoption channel the public overloads do not
    // declare; borrowed, because the player owns this texture and reuses it for the next decoded
    // frame, and an owned facade would destroy a texture CNA is still decoding into.
    const texture = new (Texture2D as unknown as new (
      graphicsDevice: typeof device,
      width: number,
      height: number,
      mipMap: boolean,
      format: SurfaceFormat,
      adopted: {
        readonly Handle: NativeHandle;
        readonly LevelCount: number;
        readonly Ownership: "borrowed";
        readonly Label: string;
      },
    ) => Texture2D)(
      device, video.Width, video.Height, false, SurfaceFormat.Color,
      { Handle: frame.Texture, LevelCount: 1, Ownership: "borrowed", Label: "VideoPlayer frame" },
    );
    state.Frame = { Texture: texture, Generation: frame.Generation };
    return texture;
  }

  public Dispose(): void {
    const state = playerStates.get(this);
    if (!state || state.Lifetime.State !== "active") return;
    invalidateFrame(state);
    state.Lifetime.Dispose();
  }
}

/** @internal The player's own handle, for the extension that reports CNA's frame identity. */
export function resolveVideoPlayerHandleForInternalUse(player: VideoPlayer): NativeHandle {
  return playerState(player).Lifetime.Handle;
}

/** @internal The backend the player was created against. */
export function videoPlayerBackendForInternalUse(player: VideoPlayer): CnaVideoBackend {
  return playerState(player).Backend;
}
