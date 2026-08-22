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
