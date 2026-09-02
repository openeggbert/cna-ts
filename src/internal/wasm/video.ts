// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaVideoBackend`: XNA's `VideoPlayer`.
//
// **Decoding is blocked upstream, and precisely.** CNA's video backend is FFmpeg, and
// `modules/CMakeLists.txt` puts `EMSCRIPTEN` in the list of targets that are deliberately outside
// that integration -- `CNA_ENABLE_VIDEO=ON` is a configure-time *fatal error* on this toolchain,
// not a flag nobody set. So no artifact this package can build decodes a frame, and no fixture can
// change that. The blocker is `BLOCKED_PLATFORM` on CNA's own terms.
//
// What still works is the player: it is created, it holds looping, mute and volume, it reports its
// state and position, and it is destroyed. Those are what this file binds, because they are
// answers CNA gives without a decoder and a consumer can act on -- and because leaving the whole
// family refusing would have made "the player cannot be constructed" and "the video cannot be
// decoded" the same message.
//
// **A frame is a borrowed alias, and its generation is what makes it trackable.** The texture in
// `getVideoPlayerFrame` belongs to the player and is valid only until the next call on it;
// `Generation` counts decoded frames and never restarts, so "the same frame asked for twice" and
// "the frame advanced" are distinguishable without comparing pixels. Nothing here wraps that
// texture as a stable `Texture2D`, because the lifetime does not support one.
//
// Ownership: a player is **OWNED** and released by `destroyVideoPlayer`. A `Video` is the caller's
// and is **RETAINED_DEPENDENCY** while playing. The frame texture is **TRANSIENT_CALLBACK_VIEW**.

import { CnaVideoBackendBase } from "../backend-base.js";
import type { VideoFrameSnapshot, VideoPlayerSnapshot } from "../backend.js";
import type { NativeHandle, NativeResourceLifetime } from "../ownership.js";
import { outI64 } from "./marshal.js";
import { allocateStruct, type WasmRouteTable } from "./module.js";

export class WasmVideoBackend extends CnaVideoBackendBase {
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

  /** A player is a child of the running game, so a game that ends releases it deterministically. */
  public override get ParentLifetime(): NativeResourceLifetime { return this.#parent(); }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's video family`);
  }

  public override createVideoPlayer(): NativeHandle {
    return this.#routes.outHandle("cna_video_player_create", this.#game());
  }

  public override destroyVideoPlayer(player: NativeHandle): void {
    this.#routes.invoke("cna_video_player_destroy", player);
  }

  public override getVideoPlayerInfo(player: NativeHandle): VideoPlayerSnapshot {
    return {
      State: this.#routes.outU32("cna_video_player_get_state", player),
      PlayPositionTicks: outI64(this.#routes, "cna_video_player_get_play_position_ticks", player),
    };
  }

  /** The player's current frame: a borrowed texture, its generation and its presentation time. */
  public override getVideoPlayerFrame(player: NativeHandle): VideoFrameSnapshot {
    const scope = this.#routes.scope();
    try {
      const frame = allocateStruct(this.#routes.module, scope, "CNA_VideoFrameEXT");
      this.#routes.invoke("cna_video_player_get_frame_ext", player, frame.pointer);
      return {
        Texture: frame.getU64("texture"),
        Generation: frame.getU64("generation"),
        PresentationTimeSeconds: frame.getF64("presentation_time"),
        IsAvailable: frame.getU8("available") !== 0,
      };
    } finally {
      scope.dispose();
    }
  }

  public override setVideoPlayerLooped(player: NativeHandle, value: boolean): void {
    this.#routes.invoke("cna_video_player_set_is_looped", player, value ? 1 : 0);
  }

  public override setVideoPlayerMuted(player: NativeHandle, value: boolean): void {
    this.#routes.invoke("cna_video_player_set_is_muted", player, value ? 1 : 0);
  }

  public override setVideoPlayerVolume(player: NativeHandle, value: number): void {
    this.#routes.invoke("cna_video_player_set_volume", player, value);
  }

  public override playVideo(player: NativeHandle, video: NativeHandle): void {
    this.#routes.invoke("cna_video_player_play", player, video);
  }

  public override pauseVideo(player: NativeHandle): void {
    this.#routes.invoke("cna_video_player_pause", player);
  }

  public override resumeVideo(player: NativeHandle): void {
    this.#routes.invoke("cna_video_player_resume", player);
  }

  public override stopVideo(player: NativeHandle): void {
    this.#routes.invoke("cna_video_player_stop", player);
  }
}
