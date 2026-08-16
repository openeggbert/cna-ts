/** Error raised while the canonical CNA WebAssembly/native ABI is absent. */
export class NativeUnavailableError extends Error {
  constructor(message = "CNA native/WebAssembly ABI is not available yet") {
    super(message);
    this.name = "NativeUnavailableError";
  }
}

/** Whether canonical CNA ABI exports have been loaded. */
export const bindingsAvailable = false;

/** Fail explicitly instead of pretending the native engine exists. */
export function requireNative() {
  throw new NativeUnavailableError();
}
