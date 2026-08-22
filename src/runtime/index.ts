import { getBackend } from "../internal/backend.js";

/** Error raised when an operation needs a CNA backend that has not been loaded. */
export class NativeUnavailableError extends Error {
  public constructor(
    message =
      "No CNA WebAssembly or Node backend is loaded; pure XNA value APIs remain available",
  ) {
    super(message);
    this.name = "NativeUnavailableError";
  }
}

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
