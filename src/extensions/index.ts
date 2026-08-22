import { GetRuntimeStatus, NativeUnavailableError } from "../runtime/index.js";

export interface RendererInfo {
  readonly Name: string;
  readonly Backend: "wasm" | "node-native";
}

/** CNA-specific diagnostics intentionally kept outside Microsoft.Xna.Framework.*. */
export function GetRendererInfo(): RendererInfo {
  const status = GetRuntimeStatus();
  if (!status.IsAvailable || status.Backend === "unavailable") {
    throw new NativeUnavailableError(status.Detail);
  }
  return Object.freeze({ Name: "CNA", Backend: status.Backend });
}
