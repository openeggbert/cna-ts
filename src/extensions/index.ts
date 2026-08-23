import { GetRuntimeStatus, NativeUnavailableError } from "../runtime/index.js";
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
