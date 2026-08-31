/**
 * CNA's sensors: the accelerometer, and what the platform says about the rest.
 *
 * XNA 4.0's selected profiles have no sensors at all — `Microsoft.Devices.Sensors` was Windows
 * Phone, and neither the Windows runtime nor the LIVE set this package projects declares one. So
 * this is CNA surface, on its own subpath, and it borrows XNA's *shape* without pretending to be
 * XNA's API.
 *
 * ## A missing sensor is not a sensor reading zero
 *
 * That is the whole design rule here, and it is the one a naive projection gets wrong. A phone lying
 * flat reads roughly (0, 0, −1) g; a machine with no accelerometer at all reads nothing. Returning
 * three zeroes for the second would let a game integrate an orientation that was never measured, so:
 *
 * - {@link CnaSensors.GetSupport} answers what the platform has, before anything is created;
 * - {@link Accelerometer.State} is a {@link SensorState}, and `NotSupported`, `NoPermissions` and
 *   `Disabled` are all distinct from `NoData` — "cannot" and "not yet" are different answers;
 * - {@link Accelerometer.IsDataValid} gates {@link Accelerometer.CurrentValue}, which refuses rather
 *   than inventing a reading when there is none.
 *
 * ## Lifetimes
 *
 * A sensor is an owned native object and a child of the running game — CNA reaches the platform
 * through the game handle, because this ABI has no device handle of its own. `Dispose` releases it,
 * twice is harmless, and using it afterwards refuses by name.
 */

import { getBackend } from "../../internal/backend.js";
import type { CnaSensorBackend } from "../../internal/backend.js";
import { NativeUnavailableError } from "../../internal/native-error.js";
import {
  ArgumentOutOfRangeException,
  InvalidOperationException,
  ObjectDisposedException,
} from "../../internal/exceptions.js";
import type { IDisposable } from "../../Microsoft/Xna/Framework/Contracts.js";
import { Matrix } from "../../Microsoft/Xna/Framework/Matrix.js";
import { Quaternion } from "../../Microsoft/Xna/Framework/Quaternion.js";
import { TimeSpan } from "../../Microsoft/Xna/Framework/TimeSpan.js";
import { Vector3 } from "../../Microsoft/Xna/Framework/Vector3.js";
import type { NativeHandle } from "../../internal/ownership.js";

/**
 * What a sensor is currently doing.
 *
 * Five of the six are ways of not producing data, and they are kept apart on purpose: a game that
 * offers tilt controls wants to hide the option for `NotSupported`, ask for permission on
 * `NoPermissions`, tell the player to enable it on `Disabled`, and simply wait on `Initializing`
 * or `NoData`.
 */
export enum SensorState {
  /** This device has no such sensor. */
  NotSupported = 0,
  /** Running and producing readings. */
  Ready = 1,
  /** Starting up; readings are coming. */
  Initializing = 2,
  /** Present and started, but with nothing to report yet. */
  NoData = 3,
  /** Present, but the application has not been permitted to read it. */
  NoPermissions = 4,
  /** Present and permitted, but switched off. */
  Disabled = 5,
}

/** Which sensor families the platform has. */
export interface SensorSupport {
  readonly Accelerometer: boolean;
  readonly Compass: boolean;
  readonly Gyroscope: boolean;
  readonly Motion: boolean;
}

/** One accelerometer reading. */
export interface AccelerometerReading {
  /**
   * Acceleration in **g** per axis, not metres per second squared. A device at rest reads about one
   * g along whichever axis points away from the ground.
   */
  readonly Acceleration: Vector3;
  /**
   * When the reading was taken, in 100-nanosecond ticks since 0001-01-01 — the runtime's own epoch,
   * not the Unix one. A `bigint` because a real timestamp does not survive a JavaScript number,
   * and a reading's identity is its timestamp.
   */
  readonly TimestampTicks: bigint;
  /** The timestamp's offset from UTC, in the same ticks. Subtract it from the timestamp for UTC. */
  readonly TimestampOffset: TimeSpan;
}

function sensors(operation: string): CnaSensorBackend {
  const backend = getBackend().Sensors;
  if (!backend) {
    throw new NativeUnavailableError(
      `${operation} requires a CNA backend with the sensor routes; ` +
      "load the Node-API backend with LoadNodeNativeBackend",
    );
  }
  return backend;
}

const handles = new WeakMap<Accelerometer, NativeHandle>();

function handleOf(sensor: Accelerometer, operation: string): NativeHandle {
  const handle = handles.get(sensor);
  if (handle == null) throw new ObjectDisposedException(`Accelerometer.${operation}`);
  return handle;
}

/**
 * The device's accelerometer.
 *
 * Constructing one is possible on a device that has none — CNA allows it, and the state says
 * `NotSupported` — so a game can build its options screen without branching first. Reading a value
 * when there is none refuses.
 */
export class Accelerometer implements IDisposable {
  public constructor() {
    handles.set(this, sensors("new Accelerometer()").createAccelerometer());
  }

  /** Whether the sensor has been released. */
  public get IsDisposed(): boolean { return !handles.has(this); }

  /** What the sensor is doing. `Ready` is the only state that produces readings. */
  public get State(): SensorState {
    return sensors("Accelerometer.State")
      .getAccelerometerState(handleOf(this, "State")).State as SensorState;
  }

  /** Whether {@link CurrentValue} has something to return. */
  public get IsDataValid(): boolean {
    return sensors("Accelerometer.IsDataValid")
      .getAccelerometerState(handleOf(this, "IsDataValid")).IsDataValid;
  }

  /**
   * How often the platform is asked to update.
   *
   * A request rather than a guarantee: a platform is free to deliver more slowly, and reading this
   * back tells you what it accepted.
   */
  public get TimeBetweenUpdates(): TimeSpan {
    return TimeSpan.FromTicks(
      sensors("Accelerometer.TimeBetweenUpdates")
        .getAccelerometerState(handleOf(this, "TimeBetweenUpdates")).TimeBetweenUpdatesTicks,
    );
  }
  public set TimeBetweenUpdates(value: TimeSpan) {
    if (value == null) throw new ArgumentOutOfRangeException("value");
    sensors("Accelerometer.TimeBetweenUpdates")
      .setAccelerometerInterval(handleOf(this, "TimeBetweenUpdates"), value.Ticks);
  }

  /**
   * The most recent reading.
   *
   * Refuses when there is none rather than returning zeroes: a device with no accelerometer and a
   * device lying perfectly still are different situations, and only one of them has a measurement
   * behind it.
   */
  public get CurrentValue(): AccelerometerReading {
    const handle = handleOf(this, "CurrentValue");
    const backend = sensors("Accelerometer.CurrentValue");
    if (!backend.getAccelerometerState(handle).IsDataValid) {
      throw new InvalidOperationException(
        "the accelerometer has no valid reading; check State and IsDataValid first",
      );
    }
    const reading = backend.getAccelerometerReading(handle);
    return Object.freeze({
      Acceleration: new Vector3(reading.X, reading.Y, reading.Z),
      TimestampTicks: reading.TimestampTicks,
      TimestampOffset: TimeSpan.FromTicks(reading.TimestampOffsetTicks),
    });
  }

  /** Starts delivering readings. Refuses where the platform has no accelerometer. */
  public Start(): void {
    sensors("Accelerometer.Start").startAccelerometer(handleOf(this, "Start"));
  }

  /** Stops delivering readings. */
  public Stop(): void {
    sensors("Accelerometer.Stop").stopAccelerometer(handleOf(this, "Stop"));
  }

  /** Releases the sensor. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = handles.get(this);
    if (handle == null) return;
    handles.delete(this);
    sensors("Accelerometer.Dispose").destroyAccelerometer(handle);
  }
}

/** What the platform has, asked before anything is constructed. */
export const CnaSensors = {
  /**
   * Which sensor families this device has.
   *
   * Needs a live `Game`: CNA reaches the platform through the game handle, because this ABI has no
   * device handle of its own, which is also where a game would ask.
   */
  GetSupport(): SensorSupport {
    return Object.freeze({ ...sensors("CnaSensors.GetSupport").getSensorSupport() });
  },
} as const;

/**
 * One compass reading.
 *
 * Two headings, and they are different measurements rather than two names for one: `MagneticHeading`
 * points at magnetic north, `TrueHeading` at the geographic pole, and the difference between them
 * is the local declination the platform applies. `HeadingAccuracy` is how far off the platform
 * believes it might be, in degrees.
 */
export interface CompassReading {
  readonly HeadingAccuracy: number;
  readonly MagneticHeading: number;
  readonly TrueHeading: number;
  /** The raw magnetometer vector in microteslas, before any heading was computed from it. */
  readonly MagnetometerReading: Vector3;
  readonly TimestampTicks: bigint;
  readonly TimestampOffset: TimeSpan;
}

/** One gyroscope reading: the rate the device is turning about each axis, in radians per second. */
export interface GyroscopeReading {
  readonly RotationRate: Vector3;
  readonly TimestampTicks: bigint;
  readonly TimestampOffset: TimeSpan;
}

/**
 * A fused orientation, expressed three ways at once.
 *
 * The Euler angles, the quaternion and the rotation matrix all describe the same orientation. They
 * are all carried because each is what some caller needs and converting between them loses
 * precision or gimbal information; nothing here derives one from another.
 */
export interface AttitudeReading {
  readonly Pitch: number;
  readonly Roll: number;
  readonly Yaw: number;
  readonly Quaternion: Quaternion;
  readonly RotationMatrix: Matrix;
  readonly TimestampTicks: bigint;
  readonly TimestampOffset: TimeSpan;
}

/**
 * One motion reading: a fused attitude plus the three vectors it was fused from.
 *
 * `DeviceAcceleration` is the acceleration the device is *being given*, with gravity already taken
 * out — which is why `Gravity` is reported separately rather than left mixed in. A game that wants
 * raw acceleration should read the {@link Accelerometer}; this sensor is the platform's own fusion.
 */
export interface MotionReading {
  readonly Attitude: AttitudeReading;
  readonly DeviceAcceleration: Vector3;
  readonly DeviceRotationRate: Vector3;
  readonly Gravity: Vector3;
  readonly TimestampTicks: bigint;
  readonly TimestampOffset: TimeSpan;
}

const compassHandles = new WeakMap<Compass, NativeHandle>();
const gyroscopeHandles = new WeakMap<Gyroscope, NativeHandle>();
const motionHandles = new WeakMap<Motion, NativeHandle>();

function requireHandle<T extends object>(
  map: WeakMap<T, NativeHandle>, sensor: T, operation: string, name: string,
): NativeHandle {
  const handle = map.get(sensor);
  if (handle == null) throw new ObjectDisposedException(`${name}.${operation}`);
  return handle;
}

function vector(value: { readonly X: number; readonly Y: number; readonly Z: number }): Vector3 {
  return new Vector3(value.X, value.Y, value.Z);
}

/**
 * The device's compass.
 *
 * Same shape and same rule as {@link Accelerometer}: constructing one on a device that has none is
 * allowed so a game can build its options screen, and reading a value when there is none refuses
 * rather than returning a heading of zero — which is a perfectly plausible heading and therefore
 * the worst possible thing to return for "no measurement".
 */
export class Compass implements IDisposable {
  public constructor() {
    compassHandles.set(this, sensors("new Compass()").createCompass());
  }

  /** Whether the sensor has been released. */
  public get IsDisposed(): boolean { return !compassHandles.has(this); }

  /** What the sensor is doing. `Ready` is the only state that produces readings. */
  public get State(): SensorState {
    return sensors("Compass.State")
      .getCompassState(requireHandle(compassHandles, this, "State", "Compass")) as SensorState;
  }

  /** Whether {@link CurrentValue} has something to return. */
  public get IsDataValid(): boolean {
    return sensors("Compass.IsDataValid")
      .getCompassIsDataValid(requireHandle(compassHandles, this, "IsDataValid", "Compass"));
  }

  /** How often the platform is asked to update. A request, not a guarantee. */
  public get TimeBetweenUpdates(): TimeSpan {
    return TimeSpan.FromTicks(sensors("Compass.TimeBetweenUpdates")
      .getCompassInterval(requireHandle(compassHandles, this, "TimeBetweenUpdates", "Compass")));
  }
  public set TimeBetweenUpdates(value: TimeSpan) {
    if (value == null) throw new ArgumentOutOfRangeException("value");
    sensors("Compass.TimeBetweenUpdates").setCompassInterval(
      requireHandle(compassHandles, this, "TimeBetweenUpdates", "Compass"), value.Ticks,
    );
  }

  /** The most recent reading. Refuses when there is none. */
  public get CurrentValue(): CompassReading {
    const handle = requireHandle(compassHandles, this, "CurrentValue", "Compass");
    const backend = sensors("Compass.CurrentValue");
    if (!backend.getCompassIsDataValid(handle)) {
      throw new InvalidOperationException(
        "the compass has no valid reading; check State and IsDataValid first",
      );
    }
    const reading = backend.getCompassReading(handle);
    return Object.freeze({
      HeadingAccuracy: reading.HeadingAccuracy,
      MagneticHeading: reading.MagneticHeading,
      TrueHeading: reading.TrueHeading,
      MagnetometerReading: vector(reading.MagnetometerReading),
      TimestampTicks: reading.TimestampTicks,
      TimestampOffset: TimeSpan.FromTicks(reading.TimestampOffsetTicks),
    });
  }

  /** Starts delivering readings. Refuses where the platform has no compass. */
  public Start(): void {
    sensors("Compass.Start").startCompass(requireHandle(compassHandles, this, "Start", "Compass"));
  }

  /** Stops delivering readings. */
  public Stop(): void {
    sensors("Compass.Stop").stopCompass(requireHandle(compassHandles, this, "Stop", "Compass"));
  }

  /** Releases the sensor. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = compassHandles.get(this);
    if (handle == null) return;
    compassHandles.delete(this);
    sensors("Compass.Dispose").destroyCompass(handle);
  }
}

/** The device's gyroscope: how fast it is turning, rather than which way up it is. */
export class Gyroscope implements IDisposable {
  public constructor() {
    gyroscopeHandles.set(this, sensors("new Gyroscope()").createGyroscope());
  }

  public get IsDisposed(): boolean { return !gyroscopeHandles.has(this); }

  public get State(): SensorState {
    return sensors("Gyroscope.State")
      .getGyroscopeState(requireHandle(gyroscopeHandles, this, "State", "Gyroscope")) as SensorState;
  }

  public get IsDataValid(): boolean {
    return sensors("Gyroscope.IsDataValid")
      .getGyroscopeIsDataValid(requireHandle(gyroscopeHandles, this, "IsDataValid", "Gyroscope"));
  }

  public get TimeBetweenUpdates(): TimeSpan {
    return TimeSpan.FromTicks(sensors("Gyroscope.TimeBetweenUpdates").getGyroscopeInterval(
      requireHandle(gyroscopeHandles, this, "TimeBetweenUpdates", "Gyroscope"),
    ));
  }
  public set TimeBetweenUpdates(value: TimeSpan) {
    if (value == null) throw new ArgumentOutOfRangeException("value");
    sensors("Gyroscope.TimeBetweenUpdates").setGyroscopeInterval(
      requireHandle(gyroscopeHandles, this, "TimeBetweenUpdates", "Gyroscope"), value.Ticks,
    );
  }

  /**
   * The most recent reading. Refuses when there is none.
   *
   * A rotation rate of zero is what a device sitting still reports, so returning zeroes for "no
   * gyroscope" would be indistinguishable from a real measurement.
   */
  public get CurrentValue(): GyroscopeReading {
    const handle = requireHandle(gyroscopeHandles, this, "CurrentValue", "Gyroscope");
    const backend = sensors("Gyroscope.CurrentValue");
    if (!backend.getGyroscopeIsDataValid(handle)) {
      throw new InvalidOperationException(
        "the gyroscope has no valid reading; check State and IsDataValid first",
      );
    }
    const reading = backend.getGyroscopeReading(handle);
    return Object.freeze({
      RotationRate: vector(reading.RotationRate),
      TimestampTicks: reading.TimestampTicks,
      TimestampOffset: TimeSpan.FromTicks(reading.TimestampOffsetTicks),
    });
  }

  public Start(): void {
    sensors("Gyroscope.Start")
      .startGyroscope(requireHandle(gyroscopeHandles, this, "Start", "Gyroscope"));
  }

  public Stop(): void {
    sensors("Gyroscope.Stop")
      .stopGyroscope(requireHandle(gyroscopeHandles, this, "Stop", "Gyroscope"));
  }

  public Dispose(): void {
    const handle = gyroscopeHandles.get(this);
    if (handle == null) return;
    gyroscopeHandles.delete(this);
    sensors("Gyroscope.Dispose").destroyGyroscope(handle);
  }
}

/** The platform's own sensor fusion: an attitude, and the three vectors it was fused from. */
export class Motion implements IDisposable {
  public constructor() {
    motionHandles.set(this, sensors("new Motion()").createMotion());
  }

  public get IsDisposed(): boolean { return !motionHandles.has(this); }

  public get State(): SensorState {
    return sensors("Motion.State")
      .getMotionState(requireHandle(motionHandles, this, "State", "Motion")) as SensorState;
  }

  public get IsDataValid(): boolean {
    return sensors("Motion.IsDataValid")
      .getMotionIsDataValid(requireHandle(motionHandles, this, "IsDataValid", "Motion"));
  }

  /**
   * Whether the attitude's yaw is measured from magnetic north.
   *
   * Without a magnetometer the platform can still fuse an attitude, but its yaw is relative to
   * wherever the device happened to be pointing when the sensor started. A game drawing a compass
   * rose needs to know which of those it has.
   */
  public get IsAttitudeNorthReferenced(): boolean {
    return sensors("Motion.IsAttitudeNorthReferenced")
      .getMotionIsNorthReferenced(
        requireHandle(motionHandles, this, "IsAttitudeNorthReferenced", "Motion"),
      );
  }

  public get TimeBetweenUpdates(): TimeSpan {
    return TimeSpan.FromTicks(sensors("Motion.TimeBetweenUpdates")
      .getMotionInterval(requireHandle(motionHandles, this, "TimeBetweenUpdates", "Motion")));
  }
  public set TimeBetweenUpdates(value: TimeSpan) {
    if (value == null) throw new ArgumentOutOfRangeException("value");
    sensors("Motion.TimeBetweenUpdates").setMotionInterval(
      requireHandle(motionHandles, this, "TimeBetweenUpdates", "Motion"), value.Ticks,
    );
  }

  /** The most recent reading. Refuses when there is none. */
  public get CurrentValue(): MotionReading {
    const handle = requireHandle(motionHandles, this, "CurrentValue", "Motion");
    const backend = sensors("Motion.CurrentValue");
    if (!backend.getMotionIsDataValid(handle)) {
      throw new InvalidOperationException(
        "the motion sensor has no valid reading; check State and IsDataValid first",
      );
    }
    const reading = backend.getMotionReading(handle);
    const q = reading.Attitude.Quaternion;
    const m = reading.Attitude.RotationMatrix;
    return Object.freeze({
      Attitude: Object.freeze({
        Pitch: reading.Attitude.Pitch,
        Roll: reading.Attitude.Roll,
        Yaw: reading.Attitude.Yaw,
        Quaternion: new Quaternion(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 0),
        RotationMatrix: new Matrix(
          m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 0,
          m[4] ?? 0, m[5] ?? 0, m[6] ?? 0, m[7] ?? 0,
          m[8] ?? 0, m[9] ?? 0, m[10] ?? 0, m[11] ?? 0,
          m[12] ?? 0, m[13] ?? 0, m[14] ?? 0, m[15] ?? 0,
        ),
        TimestampTicks: reading.Attitude.TimestampTicks,
        TimestampOffset: TimeSpan.FromTicks(reading.Attitude.TimestampOffsetTicks),
      }),
      DeviceAcceleration: vector(reading.DeviceAcceleration),
      DeviceRotationRate: vector(reading.DeviceRotationRate),
      Gravity: vector(reading.Gravity),
      TimestampTicks: reading.TimestampTicks,
      TimestampOffset: TimeSpan.FromTicks(reading.TimestampOffsetTicks),
    });
  }

  public Start(): void {
    sensors("Motion.Start").startMotion(requireHandle(motionHandles, this, "Start", "Motion"));
  }

  public Stop(): void {
    sensors("Motion.Stop").stopMotion(requireHandle(motionHandles, this, "Stop", "Motion"));
  }

  public Dispose(): void {
    const handle = motionHandles.get(this);
    if (handle == null) return;
    motionHandles.delete(this);
    sensors("Motion.Dispose").destroyMotion(handle);
  }
}

/**
 * CNA's own deterministic sensor injection, for tests.
 *
 * A build machine has no compass, no gyroscope and no motion sensor, so without these the only
 * honest claim about any of them would be "absent" — which is the whole of the accelerometer's
 * evidence today. CNA publishes `_ext` hooks that install a synthetic backend and push a reading
 * through the real routes, so the **data path** can be proved: a value with real components,
 * through CNA, into the public API.
 *
 * What that produces is **injection evidence, not hardware evidence.** Nothing here measures a
 * physical device, and anything asserting on it should say so.
 */
export const CnaSensorTestHooks = {
  /** Installs or removes a synthetic compass backend and says whether it reports support. */
  SetCompassBackend(compass: Compass, installed: boolean, supported: boolean): void {
    sensors("CnaSensorTestHooks.SetCompassBackend").setCompassTestBackend(
      requireHandle(compassHandles, compass, "SetCompassBackend", "Compass"),
      Boolean(installed), Boolean(supported),
    );
  },

  /** Pushes one synthetic compass reading through CNA's own update path. */
  InjectCompassReading(compass: Compass, reading: CompassReading): void {
    if (reading == null) throw new ArgumentOutOfRangeException("reading");
    sensors("CnaSensorTestHooks.InjectCompassReading").injectCompassReading(
      requireHandle(compassHandles, compass, "InjectCompassReading", "Compass"),
      {
        HeadingAccuracy: reading.HeadingAccuracy,
        MagneticHeading: reading.MagneticHeading,
        TrueHeading: reading.TrueHeading,
        MagnetometerReading: {
          X: reading.MagnetometerReading.X,
          Y: reading.MagnetometerReading.Y,
          Z: reading.MagnetometerReading.Z,
        },
        TimestampTicks: reading.TimestampTicks,
        TimestampOffsetTicks: reading.TimestampOffset.Ticks,
      },
    );
  },

  /** Tells a gyroscope to report itself supported or not. */
  SetGyroscopeSupported(gyroscope: Gyroscope, supported: boolean): void {
    sensors("CnaSensorTestHooks.SetGyroscopeSupported").setGyroscopeSupported(
      requireHandle(gyroscopeHandles, gyroscope, "SetGyroscopeSupported", "Gyroscope"),
      Boolean(supported),
    );
  },

  /** Pushes one synthetic rotation rate through CNA's own update path. */
  InjectGyroscopeReading(gyroscope: Gyroscope, rotationRate: Vector3): void {
    if (rotationRate == null) throw new ArgumentOutOfRangeException("rotationRate");
    sensors("CnaSensorTestHooks.InjectGyroscopeReading").injectGyroscopeReading(
      requireHandle(gyroscopeHandles, gyroscope, "InjectGyroscopeReading", "Gyroscope"),
      rotationRate.X, rotationRate.Y, rotationRate.Z,
    );
  },

  /** Installs or removes a synthetic motion backend, including whether its yaw is north-referenced. */
  SetMotionBackend(
    motion: Motion, installed: boolean, supported: boolean, northReferenced: boolean,
  ): void {
    sensors("CnaSensorTestHooks.SetMotionBackend").setMotionTestBackend(
      requireHandle(motionHandles, motion, "SetMotionBackend", "Motion"),
      Boolean(installed), Boolean(supported), Boolean(northReferenced),
    );
  },

  /** Pushes one synthetic motion reading through CNA's own update path. */
  InjectMotionReading(motion: Motion, reading: MotionReading): void {
    if (reading == null) throw new ArgumentOutOfRangeException("reading");
    const matrix = reading.Attitude.RotationMatrix;
    sensors("CnaSensorTestHooks.InjectMotionReading").injectMotionReading(
      requireHandle(motionHandles, motion, "InjectMotionReading", "Motion"),
      {
        Attitude: {
          Pitch: reading.Attitude.Pitch,
          Roll: reading.Attitude.Roll,
          Yaw: reading.Attitude.Yaw,
          Quaternion: [
            reading.Attitude.Quaternion.X, reading.Attitude.Quaternion.Y,
            reading.Attitude.Quaternion.Z, reading.Attitude.Quaternion.W,
          ],
          RotationMatrix: [
            matrix.M11, matrix.M12, matrix.M13, matrix.M14,
            matrix.M21, matrix.M22, matrix.M23, matrix.M24,
            matrix.M31, matrix.M32, matrix.M33, matrix.M34,
            matrix.M41, matrix.M42, matrix.M43, matrix.M44,
          ],
          TimestampTicks: reading.Attitude.TimestampTicks,
          TimestampOffsetTicks: reading.Attitude.TimestampOffset.Ticks,
        },
        DeviceAcceleration: {
          X: reading.DeviceAcceleration.X,
          Y: reading.DeviceAcceleration.Y,
          Z: reading.DeviceAcceleration.Z,
        },
        DeviceRotationRate: {
          X: reading.DeviceRotationRate.X,
          Y: reading.DeviceRotationRate.Y,
          Z: reading.DeviceRotationRate.Z,
        },
        Gravity: { X: reading.Gravity.X, Y: reading.Gravity.Y, Z: reading.Gravity.Z },
        TimestampTicks: reading.TimestampTicks,
        TimestampOffsetTicks: reading.TimestampOffset.Ticks,
      },
    );
  },
} as const;
