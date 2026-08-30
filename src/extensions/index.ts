import { GetRuntimeStatus, NativeUnavailableError } from "../runtime/index.js";
import type { VideoPlayer } from "../Microsoft/Xna/Framework/Media/Video.js";
import {
  resolveVideoPlayerHandleForInternalUse,
  videoPlayerBackendForInternalUse,
} from "../Microsoft/Xna/Framework/Media/Video.js";
import type { XnaType } from "../Microsoft/Xna/Framework/Contracts.js";
import type { ContentTypeReaderOfT } from
  "../Microsoft/Xna/Framework/Content/ContentTypeReader.js";
import { registerContentTypeReaderForInternalUse } from
  "../Microsoft/Xna/Framework/Content/ContentTypeReaderManager.js";

export interface RendererInfo {
  readonly Name: string;
  readonly Backend: "wasm" | "node-native";
  readonly RendererType: number;
  readonly CapabilityFlags: bigint;
  readonly MaxTextureDimension: number;
}

/** CNA-specific diagnostics intentionally kept outside Microsoft.Xna.Framework.*. */
export function GetRendererInfo(): RendererInfo {
  const status = GetRuntimeStatus();
  if (!status.IsAvailable || status.Backend === "unavailable") {
    throw new NativeUnavailableError(status.Detail);
  }
  if (status.RendererInfo == null) {
    throw new NativeUnavailableError(
      "Renderer information is unavailable until a real graphics-device callback has executed",
    );
  }
  return Object.freeze({
    ...status.RendererInfo,
    Backend: status.Backend,
  });
}

/**
 * Registers a TypeScript reader token for the CLR reader name serialized in an XNB reader table.
 * The returned function removes exactly this registration and is safe to call more than once.
 */
export function RegisterContentTypeReader<T>(
  serializedName: string,
  readerType: new () => ContentTypeReaderOfT<T>,
  targetType: XnaType<T>,
): () => void {
  return registerContentTypeReaderForInternalUse(serializedName, readerType, targetType);
}

/**
 * What a {@link VideoPlayer} currently holds, with the identity XNA's API has no way to express.
 *
 * XNA owns two frame textures and alternates between them, so a game can tell frames apart by which
 * texture it got. CNA decodes into one texture in place, so handle identity says nothing: two calls
 * against one undecoded frame look exactly like two calls across an advance. CNA answers that with
 * a monotonic decode generation, and this is where a consumer reads it — outside
 * `Microsoft.Xna.Framework`, because XNA has no such member and inventing one there would be a
 * different API wearing XNA's name.
 *
 * `Generation` counts decoded frames for the player's whole life. It never restarts: neither `Stop`
 * nor playing a different video resets it, which is exactly what lets inequality mean "the frame
 * changed" rather than "playback began again".
 */
export interface CnaVideoFrame {
  /** Whether the player holds a decoded frame at all. Absence is a state, not a failure. */
  readonly IsAvailable: boolean;
  /** Decoded frames since the player was created; zero before the first. Monotonic. */
  readonly Generation: bigint;
  /** The held frame's presentation timestamp in seconds; negative when there is none. */
  readonly PresentationTimeSeconds: number;
}

/** Reads {@link CnaVideoFrame} for a player, without taking or holding its frame texture. */
export function GetVideoFrameIdentity(player: VideoPlayer): CnaVideoFrame {
  if (player == null) throw new TypeError("player is required");
  const frame = videoPlayerBackendForInternalUse(player)
    .getVideoPlayerFrame(resolveVideoPlayerHandleForInternalUse(player));
  return Object.freeze({
    IsAvailable: frame.IsAvailable,
    Generation: frame.Generation,
    PresentationTimeSeconds: frame.PresentationTimeSeconds,
  });
}
