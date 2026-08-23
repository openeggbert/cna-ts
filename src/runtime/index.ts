import { getBackend, setBackendForInternalUse } from "../internal/backend.js";
export { NativeUnavailableError } from "../internal/native-error.js";
import { NativeUnavailableError } from "../internal/native-error.js";
import { NodeNativeBackend } from "../internal/node-native-backend.js";

export interface RuntimeStatus {
  readonly Backend: "unavailable" | "wasm" | "node-native";
  readonly IsAvailable: boolean;
  readonly AbiVersion: string | null;
  readonly Detail: string;
  readonly ImportedSymbolCount: number | null;
  readonly RendererInfo: RuntimeRendererInfo | null;
}

export interface RuntimeRendererInfo {
  readonly Name: string;
  readonly RendererType: number;
  readonly CapabilityFlags: bigint;
  readonly MaxTextureDimension: number;
}

export interface NodeNativeLoadOptions {
  readonly CnaLibrary: string;
  readonly BridgeModule: string;
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
    ImportedSymbolCount: "ImportedSymbolCount" in backend &&
      typeof backend.ImportedSymbolCount === "number"
      ? backend.ImportedSymbolCount
      : null,
    RendererInfo: "RendererInfo" in backend && backend.RendererInfo != null
      ? Object.freeze({ ...backend.RendererInfo }) as RuntimeRendererInfo
      : null,
  });
}

/** Loads an explicitly built Node-API adapter and an exact CNA ABI 0.7.0 shared library. */
export async function LoadNodeNativeBackend(options: NodeNativeLoadOptions): Promise<RuntimeStatus> {
  if (options == null || typeof options.CnaLibrary !== "string" || options.CnaLibrary.length === 0) {
    throw new TypeError("CnaLibrary must be a non-empty path");
  }
  if (typeof options.BridgeModule !== "string" || options.BridgeModule.length === 0) {
    throw new TypeError("BridgeModule must be a non-empty path");
  }
  const nodeModuleSpecifier: string = "node:module";
  const nodeModule = await import(nodeModuleSpecifier) as {
    createRequire(url: string): (path: string) => unknown;
  };
  const require = nodeModule.createRequire(import.meta.url);
  const bridge = require(options.BridgeModule) as ConstructorParameters<typeof NodeNativeBackend>[0];
  setBackendForInternalUse(new NodeNativeBackend(bridge, options.CnaLibrary));
  bindingsAvailable = true;
  return GetRuntimeStatus();
}

export function requireNative(): void {
  const status = GetRuntimeStatus();
  if (!status.IsAvailable) {
    throw new NativeUnavailableError(status.Detail);
  }
}
