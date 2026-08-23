import { ArgumentNullException } from "../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../internal/native-error.js";

/** Platform title-storage entry point; path resolution is delegated to a real runtime backend. */
export abstract class TitleContainer {
  private constructor() {}

  public static OpenStream(name: string): Uint8Array {
    if (name == null) throw new ArgumentNullException("name");
    if (name.length === 0) throw new RangeError("name cannot be empty");
    throw new NativeUnavailableError("TitleContainer.OpenStream requires a CNA title-storage route");
  }
}
