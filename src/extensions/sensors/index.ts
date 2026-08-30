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
