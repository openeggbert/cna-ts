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

// The graphics module graph contains a cycle that only resolves in one direction, and this subpath
// is one of the two entry points that can enter it from the wrong end.
//
// `RenderTarget2D extends Texture2D`, `GraphicsDevice` needs both as values (`instanceof` in
// `SetRenderTarget`), and `Texture2D` needs `GraphicsDevice`'s internal accessors -- so
// `GraphicsDevice -> RenderTargets -> Texture2D -> GraphicsDevice` is a genuine cycle. It
// evaluates cleanly entered at `GraphicsDevice`, because `Texture2D` only *calls* those accessors
// and never runs them at module scope. Entered at `Texture2D` it does not: `RenderTargets` reaches
// `class RenderTarget2D extends Texture2D` while `Texture2D` is still initialising, and throws
// `ReferenceError: Cannot access 'Texture2D' before initialization`.
//
// A consumer whose FIRST import is this subpath entered at `Texture2D` and got exactly that, on a
// published export, which `test/package-entry-points.test.mjs` now cold-imports every one of in a
// process of its own so no future subpath can reintroduce it quietly. This import fixes the order
// and is deliberately a bare side-effect one -- nothing here needs a binding from it.
import "../../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import { getBackend } from "../../internal/backend.js";
import type {
  CnaDeviceBackend,
  CnaInputDeviceInventoryBackend,
} from "../../internal/backend.js";
import { CnaResult } from "../../internal/cna-results.js";
import { NativeUnavailableError } from "../../internal/native-error.js";
import { InvalidOperationException } from "../../internal/exceptions.js";
import { Rectangle } from "../../Microsoft/Xna/Framework/Rectangle.js";
import type { IDisposable } from "../../Microsoft/Xna/Framework/Contracts.js";
import type { Texture2D } from "../../Microsoft/Xna/Framework/Graphics/Texture2D.js";
import { resolveTexture2DHandleForInternalUse } from
  "../../Microsoft/Xna/Framework/Graphics/Texture2D.js";
import type { NativeHandle } from "../../internal/ownership.js";

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

/** One mouse, keyboard or touch device the platform currently enumerates. */
export interface AttachedInputDevice {
  /** The identifier CNA tracks the device by. Stable while the device stays attached. */
  readonly Id: bigint;
  /** The platform's own name for it, such as `"Virtual core pointer (seat0)"`. */
  readonly Name: string;
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

/**
 * The `input_devices.h` boundary, which CNA's *extended* device layer does not gate.
 *
 * Kept separate from {@link devices} on purpose: the clipboard's reads, the attached-device
 * inventory and {@link CnaDevices.GetHostPower} all answer on a CNA built without the extension
 * layer, and gating them behind {@link CnaDevices.IsAvailable} would refuse where CNA does not.
 */
function inventory(operation: string): CnaInputDeviceInventoryBackend {
  const backend = getBackend().InputDeviceInventory;
  if (!backend) {
    throw new NativeUnavailableError(
      `${operation} requires a CNA backend with the input-device routes; ` +
      "load the Node-API backend with LoadNodeNativeBackend",
    );
  }
  return backend;
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

function readInventory(
  count: number,
  at: (index: number) => { readonly Id: bigint; readonly Name: string },
): readonly AttachedInputDevice[] {
  const result: AttachedInputDevice[] = [];
  for (let index = 0; index < count; index += 1) {
    const device = at(index);
    result.push(Object.freeze({ Id: device.Id, Name: device.Name }));
  }
  return Object.freeze(result);
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

  /**
   * The host's power supply, without needing the extended device layer.
   *
   * {@link GetHostInfo} reports the same three values, but only where {@link IsAvailable} is true.
   * This route is not gated on that layer, and the difference is real rather than theoretical:
   * measured on a CNA built with `CNA_DEVICES=OFF`, this answers a 79% battery while all three of
   * the extension's power readers refuse with `NOT_SUPPORTED`.
   *
   * A `null` charge or time means the platform reports none — the ordinary answer on a desktop
   * with no battery — and is deliberately not `-1`, which a threshold comparison would read as
   * "nearly flat".
   */
  GetHostPower(): HostPower {
    const power = inventory("CnaDevices.GetHostPower").getHostPowerInfo();
    return Object.freeze({
      State: power.State as PowerState,
      BatteryPercent: power.BatteryPercent,
      SecondsRemaining: power.SecondsRemaining,
    });
  },

  /**
   * The system clipboard's current text, or an empty string when it holds none.
   *
   * The clipboard is process-external state: another application can change it between any two
   * calls, so this is a read of *now* rather than of anything this program put there.
   *
   * Unlike {@link SetClipboardText} this does not need the extended device layer — CNA deliberately
   * does not duplicate the clipboard reads into that layer, because both canonical types wrap one
   * platform clipboard.
   */
  GetClipboardText(): string {
    return inventory("CnaDevices.GetClipboardText").getClipboardText();
  },

  /**
   * Whether the clipboard currently holds non-empty text.
   *
   * Cheaper than reading it when the answer is all that is needed, and the honest way to check
   * whether a {@link SetClipboardText} took: that call reports whether the platform *accepted* the
   * request, not whether the clipboard changed.
   */
  HasClipboardText(): boolean {
    return inventory("CnaDevices.HasClipboardText").getClipboardHasText();
  },

  /**
   * Every mouse the platform currently enumerates, with the name it knows each by.
   *
   * This is the *inventory*, not input: `Microsoft.Xna.Framework.Input.Mouse` reads the one
   * logical cursor XNA has, and this says what hardware is behind it. A headless session
   * enumerates nothing, which is an answer rather than a failure.
   */
  GetAttachedMice(): readonly AttachedInputDevice[] {
    const backend = inventory("CnaDevices.GetAttachedMice");
    return readInventory(
      backend.getAttachedMouseCount(), (index) => backend.getAttachedMouseAt(index),
    );
  },

  /** Every keyboard the platform currently enumerates. */
  GetAttachedKeyboards(): readonly AttachedInputDevice[] {
    const backend = inventory("CnaDevices.GetAttachedKeyboards");
    return readInventory(
      backend.getAttachedKeyboardCount(), (index) => backend.getAttachedKeyboardAt(index),
    );
  },

  /** Every touch device the platform currently enumerates. */
  GetAttachedTouchDevices(): readonly AttachedInputDevice[] {
    const backend = inventory("CnaDevices.GetAttachedTouchDevices");
    return readInventory(
      backend.getAttachedTouchDeviceCount(), (index) => backend.getAttachedTouchDeviceAt(index),
    );
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
   * Returns whether the platform took the request. That is **not** the same as the clipboard
   * having changed — a headless session with no clipboard, or a browser awaiting a user gesture,
   * takes the request and leaves the clipboard alone. {@link GetClipboardText} and
   * {@link HasClipboardText} are how the outcome is checked, and CNA's own documentation says to
   * check it if it matters.
   *
   * Two CNA routes write one platform clipboard. The extended device layer's carries an explicit
   * acceptance flag and is used where that layer is present; the ungated one is used otherwise, so
   * that a CNA built without the layer can write the clipboard it can already read. Both mean the
   * same thing by their answer.
   */
  SetClipboardText(text: string): boolean {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    const extended = getBackend().Devices;
    if (extended != null) {
      try {
        return extended.setClipboardText(text);
      } catch (error) {
        // NOT_SUPPORTED here means the layer is declared but built out; fall through to the
        // ungated route rather than refusing a write CNA can still perform.
        if ((error as { cnaResult?: number } | null)?.cnaResult !== CnaResult.NotSupported) {
          throw error;
        }
      }
    }
    inventory("CnaDevices.SetClipboardText").setClipboardTextUngated(text);
    return true;
  },

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


/* --- the camera ---------------------------------------------------------------------------------
 *
 * Enumeration says what cameras exist; this is opening one and reading a frame out of it. XNA 4.0
 * had no camera at all -- Windows Phone's `PhotoCamera` was a separate Silverlight type -- so this
 * is modern CNA surface, and it lives here rather than anywhere near
 * `Microsoft.Xna.Framework`.
 */

/** What a camera is doing, or why it is not doing anything. */
export enum CameraState {
  /** The platform has no camera concept at all. */
  NotSupported = 0,
  /** Opened but not yet producing. */
  Closed = 1,
  /** Starting up. */
  Opening = 2,
  /** The user or the platform refused access. */
  Denied = 3,
  /** Producing frames. */
  Ready = 4,
  /** It was producing and stopped -- unplugged, or taken by something else. */
  Lost = 5,
}

/**
 * The platform's default camera.
 *
 * Opening one succeeds even where there is no camera: {@link State} is what says which case it is,
 * and on a platform that asks permission, opening is what triggers the prompt. Frames are copied
 * into a {@link Texture2D} **the caller owns and keeps** -- the opposite of a video player's
 * borrowed per-frame texture -- so nothing here is invalidated by the next call.
 *
 * The texture's size must already equal the camera's frame size. CNA refuses a mismatch rather
 * than resizing, and reports it the same way it reports having no frame ready, so read
 * {@link FrameWidth} and {@link FrameHeight} first.
 */
export class CnaCamera implements IDisposable {
  readonly #backend: CnaDeviceBackend;
  #handle: NativeHandle | null;
  readonly #isTestBackend: boolean;

  private constructor(backend: CnaDeviceBackend, handle: NativeHandle, isTestBackend: boolean) {
    this.#backend = backend;
    this.#handle = handle;
    this.#isTestBackend = isTestBackend;
    cameraHandles.set(this, handle);
  }

  /** Opens the platform's default camera. */
  public static Open(): CnaCamera {
    const backend = devices("CnaCamera.Open");
    return new CnaCamera(backend, backend.createCamera(), false);
  }

  /**
   * Opens a camera backed by CNA's own deterministic test backend.
   *
   * CNA offers this as a second creation route rather than a switch, because the canonical class
   * takes its backend as a constructor argument. It is what makes the refused, denied and lost
   * states reachable at all: no verification machine has a camera. A frame published through
   * {@link CnaCameraTestHooks} still travels the real acquisition path — this is injection
   * evidence, not hardware evidence.
   *
   * **Do not open the platform camera afterwards.** Against CNA 0.21.0, disposing a test camera
   * and then calling {@link CnaCamera.Open} crashes the process: the C ABI installs the test
   * provider as a process-wide platform override holding a raw pointer into the camera resource,
   * and destroying that resource frees the provider without clearing the override. Reproduced in
   * plain C and recorded in `docs/upstream-cna-findings.md`; this package cannot work around a
   * dangling pointer inside CNA, so it says so instead.
   */
  public static OpenForTests(): CnaCamera {
    const backend = devices("CnaCamera.OpenForTests");
    return new CnaCamera(backend, backend.createTestCamera(), true);
  }

  /** Whether the camera has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  /** Whether this camera came from {@link OpenForTests}. */
  public get IsTestBackend(): boolean { return this.#isTestBackend; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the camera is disposed");
    return this.#handle;
  }

  /** What the camera is doing. */
  public get State(): CameraState {
    return this.#backend.getCameraState(this.#active()) as CameraState;
  }

  /** The width of the frames this camera produces; zero before a format is known. */
  public get FrameWidth(): number {
    return this.#backend.getCameraFrameWidth(this.#active());
  }

  /** The height of the frames this camera produces; zero before a format is known. */
  public get FrameHeight(): number {
    return this.#backend.getCameraFrameHeight(this.#active());
  }

  /**
   * Copies the next available frame into a texture the caller owns.
   *
   * Answers `false` when no frame is ready, which is ordinary rather than a failure — and, because
   * CNA does not distinguish them, also when the texture's size does not match the frame.
   */
  public TryAcquireFrame(texture: Texture2D): boolean {
    if (texture == null) throw new TypeError("texture is required");
    return this.#backend.tryAcquireCameraFrame(
      this.#active(), resolveTexture2DHandleForInternalUse(texture),
    );
  }

  /** Releases the camera and closes the device. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    cameraHandles.delete(this);
    this.#backend.destroyCamera(handle);
  }
}

const cameraHandles = new WeakMap<CnaCamera, NativeHandle>();

function testCameraHandle(camera: CnaCamera, operation: string): NativeHandle {
  if (!(camera instanceof CnaCamera)) throw new TypeError("camera must be a CnaCamera");
  if (!camera.IsTestBackend) {
    throw new InvalidOperationException(
      `${operation} is only for a camera opened with CnaCamera.OpenForTests`,
    );
  }
  const handle = cameraHandles.get(camera);
  if (handle == null) throw new NativeUnavailableError("the camera is disposed");
  return handle;
}

/**
 * CNA's own deterministic camera injection.
 *
 * These publish into CNA's test backend, not into this package: a frame set here is read back
 * through the same acquisition route a real camera's frame travels. They refuse a camera that
 * was not opened with {@link CnaCamera.OpenForTests}, so a test cannot quietly fabricate a
 * reading for a real device.
 */
export const CnaCameraTestHooks = {
  /** Sets the state CNA's test backend reports. */
  SetState(camera: CnaCamera, state: CameraState): void {
    if (!Number.isInteger(state) || state < 0 || state > CameraState.Lost) {
      throw new RangeError("state must be a CameraState");
    }
    devices("CnaCameraTestHooks.SetState").setTestCameraState(
      testCameraHandle(camera, "CnaCameraTestHooks.SetState"), state,
    );
  },

  /**
   * Publishes a frame, which also reports the camera ready and fixes its frame size — what a real
   * camera does when it starts producing. The frame stays available until it is replaced.
   */
  SetFrame(camera: CnaCamera, width: number, height: number, rgba: Uint8Array): void {
    const handle = testCameraHandle(camera, "CnaCameraTestHooks.SetFrame");
    for (const [name, value] of [["width", width], ["height", height]] as const) {
      if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative integer`);
      }
    }
    if (!(rgba instanceof Uint8Array)) throw new TypeError("rgba must be a Uint8Array");
    if (rgba.length !== width * height * 4) {
      throw new RangeError(
        `a ${width}x${height} frame needs ${width * height * 4} bytes, got ${rgba.length}`,
      );
    }
    devices("CnaCameraTestHooks.SetFrame").setTestCameraFrame(handle, width, height, rgba);
  },

  /** Clears the frame and closes the camera. */
  ClearFrame(camera: CnaCamera): void {
    devices("CnaCameraTestHooks.ClearFrame").setTestCameraFrame(
      testCameraHandle(camera, "CnaCameraTestHooks.ClearFrame"), 0, 0, null,
    );
  },
} as const;
