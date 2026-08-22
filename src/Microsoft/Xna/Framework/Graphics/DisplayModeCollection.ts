import { InvalidOperationException } from "../../../../internal/exceptions.js";
import { SurfaceFormat } from "./DeviceEnums.js";
import type { DisplayMode } from "./DisplayMode.js";

const modesByCollection = new WeakMap<DisplayModeCollection, readonly DisplayMode[]>();

function modesOf(value: DisplayModeCollection): readonly DisplayMode[] {
  const modes = modesByCollection.get(value);
  if (!modes) {
    throw new InvalidOperationException("DisplayModeCollection instances are created by a CNA graphics backend");
  }
  return modes;
}

/** Snapshot of display modes reported by one CNA graphics adapter. */
export class DisplayModeCollection implements Iterable<DisplayMode> {
  private constructor() {
    throw new InvalidOperationException(
      "DisplayModeCollection instances are created by a CNA graphics backend",
    );
  }

  public Get(format: SurfaceFormat): Iterable<DisplayMode> {
    return modesOf(this).filter((mode) => mode.Format === format);
  }

  public GetEnumerator(): IterableIterator<DisplayMode> {
    return modesOf(this)[Symbol.iterator]();
  }

  public [Symbol.iterator](): IterableIterator<DisplayMode> {
    return this.GetEnumerator();
  }
}

/** Package-internal construction route used by concrete CNA graphics backends. */
export function createDisplayModeCollectionForInternalUse(
  modes: Iterable<DisplayMode>,
): DisplayModeCollection {
  const result = Object.create(DisplayModeCollection.prototype) as DisplayModeCollection;
  modesByCollection.set(result, Object.freeze([...modes]));
  return result;
}
