import { getBackend, setBackendForInternalUse } from "../internal/backend.js";
export { NativeUnavailableError } from "../internal/native-error.js";
import { NativeUnavailableError } from "../internal/native-error.js";
import { NodeNativeBackend } from "../internal/node-native-backend.js";
import { WasmBackend } from "../internal/wasm/wasm-backend.js";
import type { CnaWasmModule } from "../internal/wasm/module.js";

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

/**
 * Loads an explicitly built Node-API adapter and a CNA shared library whose reported ABI falls in
 * the generation this package targets. A library outside that window is rejected rather than used.
 */
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

/**
 * How to reach an instantiated CNA C ABI WebAssembly module.
 *
 * The package never fetches a `.wasm` on its own: where the artifact lives, and how a page is
 * allowed to load it, are the consumer's decisions. Pass the module the Emscripten factory returned,
 * or the factory itself when the page wants this call to await it.
 */
export interface WasmBackendLoadOptions {
  /** An already-instantiated `cna_c_api` module. */
  readonly Module?: object;
  /** The `createCnaCApi` factory exported by `cna_c_api.mjs`. */
  readonly Factory?: (options?: object) => Promise<object>;
  /** Options handed to the factory, such as `{ canvas }` for a game. */
  readonly FactoryOptions?: object;
}

/**
 * Loads the WebAssembly backend over an instantiated CNA C ABI module.
 *
 * The public XNA objects are unchanged: `Game`, `GraphicsDeviceManager`, `Texture2D`, `SpriteBatch`
 * and the input snapshots are the same classes a Node consumer uses. A browser owns its event loop,
 * so drive `Game.RunOneFrame` from `requestAnimationFrame` rather than calling `Game.Run`, which
 * this backend refuses by design.
 */
export async function LoadWasmBackend(options: WasmBackendLoadOptions): Promise<RuntimeStatus> {
  if (options == null) throw new TypeError("WasmBackendLoadOptions is required");
  let instantiated = options.Module;
  if (instantiated == null) {
    if (typeof options.Factory !== "function") {
      throw new TypeError("pass either an instantiated Module or the Emscripten Factory");
    }
    instantiated = options.FactoryOptions === undefined
      ? await options.Factory()
      : await options.Factory(options.FactoryOptions);
  }
  setBackendForInternalUse(new WasmBackend(instantiated as CnaWasmModule));
  bindingsAvailable = true;
  return GetRuntimeStatus();
}
