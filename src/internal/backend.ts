export type BackendKind = "unavailable" | "wasm" | "node-native";

export interface CnaBackend {
  readonly Kind: BackendKind;
  readonly IsAvailable: boolean;
  readonly AbiVersion: string | null;
  readonly Detail: string;
}

class UnavailableBackend implements CnaBackend {
  public readonly Kind = "unavailable";
  public readonly IsAvailable = false;
  public readonly AbiVersion = null;
  public readonly Detail =
    "CNA publishes experimental C ABI 0.7.0 headers, but this package has no loaded WebAssembly or Node backend artifact";
}

let activeBackend: CnaBackend = new UnavailableBackend();

export function getBackend(): CnaBackend {
  return activeBackend;
}

export function setBackendForInternalUse(backend: CnaBackend): void {
  activeBackend = backend;
}
