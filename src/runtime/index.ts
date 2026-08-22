import { getBackend } from "../internal/backend.js";
export { NativeUnavailableError } from "../internal/native-error.js";
import { NativeUnavailableError } from "../internal/native-error.js";

export interface RuntimeStatus {
  readonly Backend: "unavailable" | "wasm" | "node-native";
  readonly IsAvailable: boolean;
  readonly AbiVersion: string | null;
  readonly Detail: string;
}

/** Whether a real CNA backend is currently loaded. This is a live ESM binding. */
export let bindingsAvailable = false;

/** Returns an immutable snapshot of backend availability without exposing the backend itself. */
export function GetRuntimeStatus(): RuntimeStatus {
  const backend = getBackend();
  bindingsAvailable = backend.IsAvailable;
  return Object.freeze({
    Backend: backend.Kind,
    IsAvailable: backend.IsAvailable,
    AbiVersion: backend.AbiVersion,
    Detail: backend.Detail,
  });
}

export function requireNative(): void {
  const status = GetRuntimeStatus();
  if (!status.IsAvailable) {
    throw new NativeUnavailableError(status.Detail);
  }
}
