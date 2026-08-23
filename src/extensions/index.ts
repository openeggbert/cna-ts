import { GetRuntimeStatus, NativeUnavailableError } from "../runtime/index.js";

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
