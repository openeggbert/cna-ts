import { ArgumentNullException } from "../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../internal/native-error.js";
import { getBackend } from "../../../internal/backend.js";

/** Platform title-storage entry point; path resolution is delegated to a real runtime backend. */
export abstract class TitleContainer {
  private constructor() {}

  public static OpenStream(name: string): Uint8Array {
    if (name == null) throw new ArgumentNullException("name");
    if (name.length === 0) throw new RangeError("name cannot be empty");
    const normalized = name.replaceAll("\\", "/");
    const segments = normalized.split("/");
    if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) ||
        segments.some((segment) => segment === "..")) {
      throw new RangeError("name must remain within title storage");
    }
    const open = getBackend().openTitleStream;
    if (!open) throw new NativeUnavailableError("TitleContainer.OpenStream requires a CNA title-storage route");
    return open.call(getBackend(), normalized);
  }
}
