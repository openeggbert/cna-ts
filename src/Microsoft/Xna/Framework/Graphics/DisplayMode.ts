import { InvalidOperationException } from "../../../../internal/exceptions.js";
import { Rectangle } from "../Rectangle.js";
import { SurfaceFormat } from "./DeviceEnums.js";

interface DisplayModeState {
  readonly Width: number;
  readonly Height: number;
  readonly Format: SurfaceFormat;
}

const states = new WeakMap<DisplayMode, DisplayModeState>();

function stateOf(value: DisplayMode): DisplayModeState {
  const state = states.get(value);
  if (!state) throw new InvalidOperationException("DisplayMode instances are created by a CNA graphics backend");
  return state;
}

/** Immutable display-mode snapshot returned by a graphics adapter. */
export class DisplayMode {
  private constructor() {
    throw new InvalidOperationException("DisplayMode instances are created by a CNA graphics backend");
  }

  public get Format(): SurfaceFormat { return stateOf(this).Format; }
  public get Height(): number { return stateOf(this).Height; }
  public get Width(): number { return stateOf(this).Width; }

  public get AspectRatio(): number {
    const state = stateOf(this);
    return state.Width === 0 || state.Height === 0
      ? 0
      : Math.fround(state.Width / state.Height);
  }

  public get TitleSafeArea(): Rectangle {
    return new Rectangle(0, 0, this.Width, this.Height);
  }

  public ToString(): string {
    return `{Width:${this.Width} Height:${this.Height} Format:${SurfaceFormat[this.Format]} ` +
      `AspectRatio:${this.AspectRatio}}`;
  }
}

/** Package-internal construction route used by concrete CNA graphics backends. */
export function createDisplayModeForInternalUse(
  width: number,
  height: number,
  format: SurfaceFormat,
): DisplayMode {
  const result = Object.create(DisplayMode.prototype) as DisplayMode;
  states.set(result, {
    Width: Math.trunc(width),
    Height: Math.trunc(height),
    Format: format,
  });
  return result;
}
