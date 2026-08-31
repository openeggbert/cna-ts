/**
 * CNA's extended input layer: raw joysticks and force feedback.
 *
 * XNA had neither. `GamePad` is a *mapped* controller — four sticks, two triggers and a fixed
 * button set — and `SetVibration` is two motors with no way to ask whether they exist. CNA models
 * the hardware underneath that: a joystick with however many axes, buttons, hats and trackballs it
 * actually has, and a haptic device with a capability set, effect slots and a gain.
 *
 * ```ts
 * import { Joysticks, Haptics } from "cna-ts/extensions/input";
 *
 * for (const joystick of Joysticks.Enumerate()) {
 *   const state = Joysticks.CaptureState(joystick.Id);
 *   console.log(joystick.Name, state.Axes.length, state.Buttons.length);
 * }
 * ```
 *
 * ## Why these are not `GamePad`
 *
 * A joystick's axes are raw device axes, its identity is the platform's GUID, and it may carry
 * hats and trackballs a `GamePadState` has no member for. Folding one into the XNA type would
 * either drop that data or invent a mapping the caller could not correct, so these stay here and
 * `Microsoft.Xna.Framework.Input` keeps saying exactly what XNA said. A game that wants the mapped
 * view keeps calling `GamePad`; a game that wants a flight stick's eleventh axis comes here.
 *
 * The same goes for haptics. `GamePad.SetVibration` is XNA's two-motor call and stays as it is;
 * {@link Haptics} is CNA's richer device, and it reports what it can do before a caller asks it to.
 *
 * ## Ownership
 *
 * A **captured joystick state is a snapshot**: CNA hands back a handle, this package reads its four
 * arrays and releases it before returning, so there is nothing to dispose and nothing to leak. An
 * **opened haptic device is not**: it has a real lifetime and {@link HapticDevice} is an explicit
 * `Dispose`, like every other native owner in this package.
 *
 * ## Absence
 *
 * A host with no joystick reports no joysticks. `Enumerate` returns an empty list rather than
 * throwing, because "there are none" is an answer a game acts on, while a host with no *support*
 * at all is a different thing again and CNA says so through its own result codes.
 */

import { getBackend } from "../../internal/backend.js";
import type { CnaExtendedInputBackend } from "../../internal/backend.js";
import { NativeUnavailableError } from "../../internal/native-error.js";
import { ArgumentException, ObjectDisposedException } from "../../internal/exceptions.js";
import type { IDisposable } from "../../Microsoft/Xna/Framework/Contracts.js";
import type { NativeHandle } from "../../internal/ownership.js";
import { Point } from "../../Microsoft/Xna/Framework/Point.js";

/**
 * What kind of device a joystick reports itself to be.
 *
 * Wire values proved against `input_joystick.h`. This is the platform's own guess and is often
 * `Unknown`; it is a hint for a UI, not something to branch input handling on.
 */
export enum JoystickType {
  Unknown = 0,
  GamePad = 1,
  Wheel = 2,
  ArcadeStick = 3,
  FlightStick = 4,
  DancePad = 5,
  Guitar = 6,
  DrumKit = 7,
  ArcadePad = 8,
  Throttle = 9,
}

/** The nine positions a hat switch can report. */
export enum JoystickHatPosition {
  Centered = 0,
  Up = 1,
  Right = 2,
  Down = 3,
  Left = 4,
  RightUp = 5,
  RightDown = 6,
  LeftUp = 7,
  LeftDown = 8,
}

/**
 * The effect kinds a haptic device supports, as a flag set.
 *
 * `Gain`, `Autocenter`, `Status` and `Pause` are device *properties* rather than effects; they
 * share the flag set because that is how the platform reports them.
 */
export enum HapticFeature {
  None = 0,
  Constant = 0x00000001,
  Sine = 0x00000002,
  Square = 0x00000004,
  Triangle = 0x00000008,
  SawtoothUp = 0x00000010,
  SawtoothDown = 0x00000020,
  Ramp = 0x00000040,
  Spring = 0x00000080,
  Damper = 0x00000100,
  Inertia = 0x00000200,
  Friction = 0x00000400,
  LeftRight = 0x00000800,
  Custom = 0x00008000,
  Gain = 0x00010000,
  Autocenter = 0x00020000,
  Status = 0x00040000,
  Pause = 0x00080000,
}

/** One joystick as CNA enumerates it. */
export interface JoystickDevice {
  /** The platform's identifier, which is what every other joystick call takes. */
  readonly Id: number;
  readonly Name: string;
  readonly Type: JoystickType;
}

/** What a joystick reports about itself, including its power state where the platform knows it. */
export interface JoystickCapabilities {
  readonly Name: string;
  /** The platform's stable identity for this device model, as its GUID text. */
  readonly Guid: string;
  readonly AxisCount: number;
  readonly ButtonCount: number;
  readonly HatCount: number;
  readonly BallCount: number;
  readonly Type: JoystickType;
  /** A `PowerState` as `cna-ts/extensions/devices` names them. */
  readonly PowerState: number;
  /** Charge percentage, or a negative value where the platform does not report one. */
  readonly PowerPercent: number;
  readonly IsConnected: boolean;
}

/**
 * One captured joystick state: every axis, button, hat and trackball the device has.
 *
 * A snapshot, not a live view. The arrays are ordinary JavaScript arrays copied out of CNA before
 * the native state was released, so they outlive the call and nothing has to be disposed.
 */
export interface JoystickState {
  /** Each axis in its raw `int16` range, -32768 through 32767. */
  readonly Axes: readonly number[];
  readonly Buttons: readonly boolean[];
  readonly Hats: readonly JoystickHatPosition[];
  /** Each trackball's relative motion since the last capture. */
  readonly Balls: readonly Point[];
}

/** What an opened haptic device can do. */
export interface HapticCapabilities {
  /** The supported effects and properties, as a {@link HapticFeature} flag set. */
  readonly Features: HapticFeature;
  readonly AxisCount: number;
  readonly MaxEffects: number;
  readonly MaxEffectsPlaying: number;
  readonly IsOpen: boolean;
  /** Whether the simple rumble interface works on this device. */
  readonly RumbleSupported: boolean;
}

function input(operation: string): CnaExtendedInputBackend {
  const backend = getBackend().ExtendedInput;
  if (!backend) {
    throw new NativeUnavailableError(
      `${operation} requires a CNA backend with the extended input routes; ` +
      "load the Node-API backend with LoadNodeNativeBackend",
    );
  }
  return backend;
}

function requireIndex(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new ArgumentException(`${what} must be a non-negative integer`);
  }
  return value;
}

/**
 * The host's raw joysticks.
 *
 * Every call needs a running game, because a joystick is a property of the platform a game opened
 * rather than of the process.
 */
export const Joysticks = {
  /** How many joysticks the platform currently sees. */
  get Count(): number { return input("Joysticks.Count").getJoystickCount(); },

  /** Every joystick, in the platform's own order. */
  Enumerate(): readonly JoystickDevice[] {
    const backend = input("Joysticks.Enumerate");
    const count = backend.getJoystickCount();
    const devices: JoystickDevice[] = [];
    for (let index = 0; index < count; index += 1) {
      const info = backend.getJoystickInfoAt(index);
      devices.push(Object.freeze({
        Id: info.Id,
        Name: backend.getJoystickNameAt(index),
        Type: info.Type as JoystickType,
      }));
    }
    return Object.freeze(devices);
  },

  /** What one joystick reports about itself. */
  GetCapabilities(id: number): JoystickCapabilities {
    const backend = input("Joysticks.GetCapabilities");
    requireIndex(id, "id");
    const capabilities = backend.getJoystickCapabilities(id);
    return Object.freeze({
      Name: backend.getJoystickCapabilitiesName(id),
      Guid: backend.getJoystickCapabilitiesGuid(id),
      AxisCount: capabilities.AxisCount,
      ButtonCount: capabilities.ButtonCount,
      HatCount: capabilities.HatCount,
      BallCount: capabilities.BallCount,
      Type: capabilities.Type as JoystickType,
      PowerState: capabilities.PowerState,
      PowerPercent: capabilities.PowerPercent,
      IsConnected: capabilities.IsConnected,
    });
  },

  /**
   * Captures one joystick's current state.
   *
   * The native snapshot is read whole and released before this returns, so what a caller holds is
   * plain data with no lifetime attached — the same shape `Keyboard.GetState` has, for the same
   * reason.
   */
  CaptureState(id: number): JoystickState {
    requireIndex(id, "id");
    const state = input("Joysticks.CaptureState").captureJoystickState(id);
    return Object.freeze({
      Axes: Object.freeze([...state.Axes]),
      Buttons: Object.freeze([...state.Buttons]),
      Hats: Object.freeze(state.Hats.map((value) => value as JoystickHatPosition)),
      Balls: Object.freeze(state.Balls.map((ball) => new Point(ball.X, ball.Y))),
    });
  },
} as const;

const deviceHandles = new WeakMap<HapticDevice, NativeHandle>();

function deviceHandle(device: HapticDevice, operation: string): NativeHandle {
  const handle = deviceHandles.get(device);
  if (handle == null) throw new ObjectDisposedException(`HapticDevice.${operation}`);
  return handle;
}

/**
 * An opened force-feedback device.
 *
 * This owns a native lifetime — a haptic device is opened, held and closed — so it is an explicit
 * `Dispose`. Every operation reports whether the device **accepted** it rather than returning
 * nothing, because a haptic request is exactly the kind of thing a device can decline and a game
 * uses that answer to decide whether to offer the setting at all.
 */
export class HapticDevice implements IDisposable {
  private constructor(handle: NativeHandle) { deviceHandles.set(this, handle); }

  /** The device's own name, as the platform reports it. */
  public get Name(): string {
    return input("HapticDevice.Name").getHapticName(deviceHandle(this, "Name"));
  }

  /** Whether the device is still open. */
  public get IsOpen(): boolean {
    return input("HapticDevice.IsOpen").getHapticIsOpen(deviceHandle(this, "IsOpen"));
  }

  /** What this device supports. Ask before playing rather than after being refused. */
  public get Capabilities(): HapticCapabilities {
    const capabilities = input("HapticDevice.Capabilities")
      .getHapticCapabilities(deviceHandle(this, "Capabilities"));
    return Object.freeze({
      Features: capabilities.Features as HapticFeature,
      AxisCount: capabilities.AxisCount,
      MaxEffects: capabilities.MaxEffects,
      MaxEffectsPlaying: capabilities.MaxEffectsPlaying,
      IsOpen: capabilities.IsOpen,
      RumbleSupported: capabilities.RumbleSupported,
    });
  }

  /** Prepares the simple rumble interface. Returns whether the device accepted it. */
  public InitializeRumble(): boolean {
    return input("HapticDevice.InitializeRumble")
      .initHapticRumble(deviceHandle(this, "InitializeRumble"));
  }

  /**
   * Plays a rumble at `strength` (0 through 1) for `lengthMilliseconds`.
   *
   * @returns whether the device accepted the request.
   */
  public PlayRumble(strength: number, lengthMilliseconds: number): boolean {
    if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
      throw new ArgumentException("strength must be between 0 and 1");
    }
    if (!Number.isInteger(lengthMilliseconds) || lengthMilliseconds < 0) {
      throw new ArgumentException("lengthMilliseconds must be a non-negative integer");
    }
    return input("HapticDevice.PlayRumble")
      .playHapticRumble(deviceHandle(this, "PlayRumble"), strength, lengthMilliseconds);
  }

  /** Stops any rumble in progress. Returns whether the device accepted it. */
  public StopRumble(): boolean {
    return input("HapticDevice.StopRumble").stopHapticRumble(deviceHandle(this, "StopRumble"));
  }

  /**
   * Sets the device's master gain, 0 through 100.
   *
   * Only meaningful where {@link HapticCapabilities.Features} carries {@link HapticFeature.Gain};
   * elsewhere the device declines and this returns false.
   */
  public SetGain(gain: number): boolean {
    if (!Number.isInteger(gain) || gain < 0 || gain > 100) {
      throw new ArgumentException("gain must be an integer between 0 and 100");
    }
    return input("HapticDevice.SetGain").setHapticGain(deviceHandle(this, "SetGain"), gain);
  }

  /** Whether this device has been released. */
  public get IsDisposed(): boolean { return !deviceHandles.has(this); }

  /**
   * Closes and releases the device. Idempotent.
   *
   * Both halves happen here: CNA distinguishes closing a device from releasing its handle, and a
   * caller has no reason to hold a closed one, so this does both in that order.
   */
  public Dispose(): void {
    const handle = deviceHandles.get(this);
    if (handle == null) return;
    deviceHandles.delete(this);
    const backend = input("HapticDevice.Dispose");
    try {
      backend.disposeHapticDevice(handle);
    } finally {
      backend.destroyHapticDevice(handle);
    }
  }

  /** @internal Used by {@link Haptics} to construct an opened device. */
  public static adoptForInternalUse(handle: NativeHandle): HapticDevice {
    const Constructor = HapticDevice as unknown as { new (value: NativeHandle): HapticDevice };
    return new Constructor(handle);
  }
}

/** The host's force-feedback devices. */
export const Haptics = {
  /** How many haptic devices the platform currently sees. */
  get Count(): number { return input("Haptics.Count").getHapticCount(); },

  /** Every haptic device's identifier and name, in the platform's own order. */
  Enumerate(): readonly { readonly Id: number; readonly Name: string }[] {
    const backend = input("Haptics.Enumerate");
    const count = backend.getHapticCount();
    const devices: { Id: number; Name: string }[] = [];
    for (let index = 0; index < count; index += 1) {
      devices.push({ Id: backend.getHapticIdAt(index), Name: backend.getHapticNameAt(index) });
    }
    return Object.freeze(devices.map((device) => Object.freeze(device)));
  },

  /** Whether a joystick has force feedback, asked before trying to open it. */
  IsJoystickHaptic(joystickId: number): boolean {
    requireIndex(joystickId, "joystickId");
    return input("Haptics.IsJoystickHaptic").isJoystickHaptic(joystickId);
  },

  /** Opens a haptic device by its own identifier. The caller owns the result. */
  Open(id: number): HapticDevice {
    requireIndex(id, "id");
    return HapticDevice.adoptForInternalUse(input("Haptics.Open").openHaptic(id));
  },

  /** Opens the haptic device belonging to a joystick. The caller owns the result. */
  OpenFromJoystick(joystickId: number): HapticDevice {
    requireIndex(joystickId, "joystickId");
    return HapticDevice.adoptForInternalUse(
      input("Haptics.OpenFromJoystick").openHapticFromJoystick(joystickId),
    );
  },
} as const;
