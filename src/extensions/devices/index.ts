/**
 * The host itself: CNA's extended device layer.
 *
 * XNA modelled a console and a Windows PC and almost nothing about the machine underneath — it had
 * no way to ask how many cores it was running on, whether it was on a battery, what the display's
 * safe area was, which languages the user reads, or which cameras exist. CNA does, so this lives
 * here rather than inside `Microsoft.Xna.Framework`, where none of it belongs.
 *
 * ```ts
 * import { CnaDevices } from "cna-ts/extensions/devices";
 *
 * if (CnaDevices.IsAvailable()) {
 *   const host = CnaDevices.GetHostInfo();
 *   if (host.Power.State === PowerState.OnBattery) reduceFrameRate();
 * }
 * ```
 *
 * ## Availability is asked, not inferred
 *
 * Every route here exists in every CNA build and answers not-supported where the extension layer
 * was compiled out, so a refusal means "this build has no device layer", never "this machine has no
 * battery". {@link CnaDevices.IsAvailable} is the question that separates them, and it is the one
 * to ask before offering a feature that needs any of this.
 *
 * A value that is genuinely absent is reported as absent. A machine with no battery answers
 * {@link PowerState.NoBattery} rather than nought per cent; a windowless session answers a zero
 * content scale and an empty safe area, which is CNA's own answer and not a failure.
 *
 * ## These readers need a live `Game`
 *
 * CNA addresses the host's window, display and power through the game handle, because this ABI has
 * no window handle of its own. So every reader below except {@link CnaDevices.IsAvailable} asks
 * from inside a running game — which is where a game would ask anyway, in `LoadContent` or once per
 * frame. With no active game they refuse rather than answering about a window that does not exist.
 *
 * ## No raw handles
 *
 * Nothing here hands out a CNA handle, and nothing here is disposable: every reader returns a
 * copied immutable snapshot of what the host looked like when it was asked. Cameras are enumerated
 * by name and facing rather than by index alone, because CNA does not promise an index stays
 * attached to the same physical device across a re-enumeration.
 */

import { getBackend } from "../../internal/backend.js";
import type { CnaDeviceBackend } from "../../internal/backend.js";
import { NativeUnavailableError } from "../../internal/native-error.js";
import { Rectangle } from "../../Microsoft/Xna/Framework/Rectangle.js";

/**
 * The host's power state.
 *
 * One identity shared with a controller's battery, because CNA declares it once and reuses it: the
 * same six values answer both questions, and a consumer that handles one handles the other.
 */
export enum PowerState {
  /** The platform reported an error rather than a state. */
  Error = 0,
  /** The platform cannot tell. */
  Unknown = 1,
  /** Running on battery, and discharging. */
  OnBattery = 2,
  /** Plugged in, with no battery fitted at all. */
  NoBattery = 3,
  /** Plugged in and charging. */
  Charging = 4,
  /** Plugged in and fully charged. */
  Charged = 5,
}

/** Which way a camera faces, as far as the platform knows. */
export enum CameraPosition {
  Unknown = 0,
  FrontFacing = 1,
  BackFacing = 2,
}

/** The host's power supply. */
export interface HostPower {
  readonly State: PowerState;
  /**
   * Charge remaining, from 0 to 100, or `null` when the platform does not report one — which is
   * the ordinary answer with no battery fitted, not a failure.
   */
  readonly BatteryPercent: number | null;
  /** Seconds of charge remaining, or `null` when the platform does not estimate one. */
  readonly SecondsRemaining: number | null;
}

/** The window's display, as the platform describes it. */
export interface HostDisplay {
  /**
   * The display's content scale factor, or zero in a headless or windowless session. Zero is CNA's
   * own answer there, not an error.
   */
  readonly ContentScale: number;
  /**
   * The area of the window that is guaranteed visible — inside a notch, a rounded corner or a
   * system bar. Empty where the platform has no safe-area concept.
   */
  readonly SafeArea: Rectangle;
}

/** What the machine is. */
export interface HostInfo {
  /** Logical CPU cores, as the platform counts them. */
  readonly LogicalCpuCoreCount: number;
  /** Installed memory in megabytes. */
  readonly SystemRamMegabytes: number;
  readonly Power: HostPower;
  readonly Display: HostDisplay;
}

/** One entry of the user's preferred-locale list, in the platform's own preference order. */
export interface PreferredLocale {
  /** An ISO 639 language code, such as `"en"`. */
  readonly Language: string;
  /** An ISO 3166 country code, such as `"GB"`, or an empty string when the locale names none. */
  readonly Country: string;
}

/** One camera the platform knows about. */
export interface CameraDevice {
  /** The platform's own name for it. */
  readonly Name: string;
  readonly Position: CameraPosition;
}

/** The host's cameras, and whether the platform has a camera concept at all. */
export interface CameraInventory {
  /**
   * Whether cameras are a thing on this platform. `false` with an empty {@link Devices} means the
   * platform has no camera support; `true` with an empty list means it has support and none
   * attached, which is a different situation and worth telling apart.
   */
  readonly IsSupported: boolean;
  readonly Devices: readonly CameraDevice[];
}

function devices(operation: string): CnaDeviceBackend {
  const backend = getBackend().Devices;
  if (!backend) {
    throw new NativeUnavailableError(
      `${operation} requires a CNA backend with the extended device routes; ` +
      "load the Node-API backend with LoadNodeNativeBackend",
    );
  }
  return backend;
}

/** Readers for the host CNA is running on. Every one is a snapshot; none owns anything. */
export const CnaDevices = {
  /**
   * Whether this CNA build contains the extended device layer.
   *
   * Ask before anything else here. Without it every reader below refuses, and that refusal is about
   * the build rather than about the machine.
   */
  IsAvailable(): boolean {
    return devices("CnaDevices.IsAvailable").isDeviceExtensionLayerAvailable();
  },

  /** What the machine is: its cores, its memory, its power supply and its display. */
  GetHostInfo(): HostInfo {
    const info = devices("CnaDevices.GetHostInfo").getHostDeviceInfo();
    return Object.freeze({
      LogicalCpuCoreCount: info.LogicalCpuCoreCount,
      SystemRamMegabytes: info.SystemRamMegabytes,
      Power: Object.freeze({
        State: info.PowerState as PowerState,
        // CNA reports a negative percentage or a negative time where the platform gives none. An
        // absent charge is null rather than -1: a consumer comparing against a threshold would
        // otherwise read "no battery" as "nearly flat".
        BatteryPercent: info.BatteryPercent < 0 ? null : info.BatteryPercent,
        SecondsRemaining: info.SecondsRemaining < 0 ? null : info.SecondsRemaining,
      }),
      Display: Object.freeze({
        ContentScale: info.ContentScale,
        SafeArea: new Rectangle(
          info.SafeArea.X, info.SafeArea.Y, info.SafeArea.Width, info.SafeArea.Height,
        ),
      }),
    });
  },

  /** The user's preferred languages, most preferred first. */
  GetPreferredLocales(): readonly PreferredLocale[] {
    return Object.freeze(
      devices("CnaDevices.GetPreferredLocales").getPreferredLocales()
        .map((locale) => Object.freeze({ Language: locale.Language, Country: locale.Country })),
    );
  },

  /**
   * Puts text on the system clipboard.
   *
   * Returns whether the platform accepted it. A platform with no clipboard answers `false`, which
   * is a state rather than an error — this is not a call worth wrapping in a try.
   */
  SetClipboardText(text: string): boolean {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    return devices("CnaDevices.SetClipboardText").setClipboardText(text);
  },

  /** The cameras attached to the host, and whether the platform supports any. */
  GetCameras(): CameraInventory {
    const inventory = devices("CnaDevices.GetCameras").getCameras();
    return Object.freeze({
      IsSupported: inventory.IsSupported,
      Devices: Object.freeze(inventory.Devices.map((camera) => Object.freeze({
        Name: camera.Name,
        Position: camera.Position as CameraPosition,
      }))),
    });
  },
} as const;
