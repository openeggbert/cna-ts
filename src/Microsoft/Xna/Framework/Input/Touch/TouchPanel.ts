import { getBackend } from "../../../../../internal/backend.js";
import { int32 } from "../../../../../internal/input.js";
import { DisplayOrientation } from "../../DisplayOrientation.js";
import { GestureType } from "./Enums.js";
import type { TouchCollection } from "./TouchCollection.js";
import type { GestureSample, TouchPanelCapabilities } from "./TouchValues.js";

let displayWidth = 0;
let displayHeight = 0;
let displayOrientation = DisplayOrientation.Default;
let enabledGestures = GestureType.None;

/** XNA touch configuration plus hardware polling through the active private backend. */
export class TouchPanel {
  private constructor() {}

  public static GetCapabilities(): TouchPanelCapabilities {
    return getBackend().getTouchCapabilities();
  }

  public static GetState(): TouchCollection { return getBackend().getTouchState(); }
  public static ReadGesture(): GestureSample { return getBackend().readGesture(); }

  public static get DisplayWidth(): number { return displayWidth; }
  public static set DisplayWidth(value: number) { displayWidth = int32(value); }
  public static get DisplayHeight(): number { return displayHeight; }
  public static set DisplayHeight(value: number) { displayHeight = int32(value); }
  public static get DisplayOrientation(): DisplayOrientation { return displayOrientation; }
  public static set DisplayOrientation(value: DisplayOrientation) { displayOrientation = value; }
  public static get EnabledGestures(): GestureType { return enabledGestures; }
  public static set EnabledGestures(value: GestureType) { enabledGestures = value; }
  public static get IsGestureAvailable(): boolean { return getBackend().isGestureAvailable(); }
  public static get WindowHandle(): bigint { return getBackend().touchWindowHandle; }
  public static set WindowHandle(value: bigint) { getBackend().setTouchWindowHandle(value); }
}
