// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaSensorBackend`: accelerometer, compass, gyroscope and motion.
//
// The rule that shapes this family, and it is CNA's rather than this file's: **a sensor that is not
// there is not a sensor reading zero.** Support is asked separately from state, and every reading
// route on an unsupported sensor answers `CNA_RESULT_INVALID_STATE` with a message saying to check
// `IsSupported` first. Headless Chromium has no physical sensors of any kind, so on this host
// every one of the four answers *unsupported* -- and that is measured evidence about the host, not
// a gap in the binding.
//
// What makes the family testable anyway is that CNA ships its own synthetic backends:
// `cna_compass_set_test_backend_ext`, `cna_motion_set_test_backend_ext`,
// `cna_gyroscope_set_supported_for_tests_ext` and the four `..._inject_synthetic_update_ext`
// routes. Evidence gathered through those is labelled `SYNTHETIC_BACKEND_VERIFIED` wherever it is
// recorded, never `PHYSICAL_SENSOR_VERIFIED`: what it proves is that the binding marshals a
// reading correctly in both directions, which is exactly the thing a binding can be wrong about.
//
// Ownership: a sensor handle is **OWNED** and released by its `destroy` route. `dispose` is
// separate and is XNA's `IDisposable` rather than a release -- CNA keeps the handle valid and
// answers `disposed` afterwards -- which is why both exist on this boundary.

import { CnaSensorBackendBase } from "../backend-base.js";
import type {
  AccelerometerReadingSnapshot,
  CompassReadingSnapshot,
  GyroscopeReadingSnapshot,
  MotionReadingSnapshot,
  SensorStateSnapshot,
  SensorSupportSnapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { outBool, outI64 } from "./marshal.js";
import { allocateStruct, WasmStruct, type WasmRouteTable } from "./module.js";

export class WasmSensorBackend extends CnaSensorBackendBase {
  readonly #routes: WasmRouteTable;
  readonly #game: () => NativeHandle;

  public constructor(routes: WasmRouteTable, game: () => NativeHandle) {
    super();
    this.#routes = routes;
    this.#game = game;
  }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's sensor family`);
  }

  /** Four independent questions, asked of the game rather than of any sensor object. */
  public override getSensorSupport(): SensorSupportSnapshot {
    return {
      Accelerometer: outBool(this.#routes, "cna_accelerometer_get_is_supported", this.#game()),
      Compass: outBool(this.#routes, "cna_compass_get_is_supported", this.#game()),
      Gyroscope: outBool(this.#routes, "cna_gyroscope_get_is_supported", this.#game()),
      Motion: outBool(this.#routes, "cna_motion_get_is_supported", this.#game()),
    };
  }

  // ---- accelerometer -----------------------------------------------------------------------

  public override createAccelerometer(): NativeHandle {
    return this.#routes.outHandle("cna_accelerometer_create", this.#game());
  }

  public override destroyAccelerometer(sensor: NativeHandle): void {
    this.#routes.invoke("cna_accelerometer_destroy", sensor);
  }

  public override startAccelerometer(sensor: NativeHandle): void {
    this.#routes.invoke("cna_accelerometer_start", sensor);
  }

  public override stopAccelerometer(sensor: NativeHandle): void {
    this.#routes.invoke("cna_accelerometer_stop", sensor);
  }

  /**
   * The accelerometer's whole state in one snapshot, which is three routes.
   *
   * The other three sensors expose these separately on this boundary; the accelerometer is the one
   * XNA shipped, and its public projection reads all three together every frame.
   */
  public override getAccelerometerState(sensor: NativeHandle): SensorStateSnapshot {
    return {
      State: this.#routes.outU32("cna_accelerometer_get_state", sensor),
      IsDataValid: outBool(this.#routes, "cna_accelerometer_get_is_data_valid", sensor),
      TimeBetweenUpdatesTicks:
        outI64(this.#routes, "cna_accelerometer_get_time_between_updates_ticks", sensor),
    };
  }

  public override setAccelerometerInterval(sensor: NativeHandle, ticks: bigint): void {
    this.#routes.invoke("cna_accelerometer_set_time_between_updates_ticks", sensor, ticks);
  }

  public override getAccelerometerReading(
    sensor: NativeHandle,
  ): AccelerometerReadingSnapshot {
    const scope = this.#routes.scope();
    try {
      const reading = allocateStruct(this.#routes.module, scope, "CNA_AccelerometerReading");
      this.#routes.invoke("cna_accelerometer_get_current_value", sensor, reading.pointer);
      const acceleration = reading.nested("acceleration", "CNA_Vector3");
      const timestamp = this.#timestamp(reading);
      return {
        X: acceleration.getF32("x"),
        Y: acceleration.getF32("y"),
        Z: acceleration.getF32("z"),
        ...timestamp,
      };
    } finally {
      scope.dispose();
    }
  }

  // ---- compass -----------------------------------------------------------------------------

  public override createCompass(): NativeHandle {
    return this.#routes.outHandle("cna_compass_create", this.#game());
  }

  public override destroyCompass(sensor: NativeHandle): void {
    this.#routes.invoke("cna_compass_destroy", sensor);
  }

  public override startCompass(sensor: NativeHandle): void {
    this.#routes.invoke("cna_compass_start", sensor);
  }

  public override stopCompass(sensor: NativeHandle): void {
    this.#routes.invoke("cna_compass_stop", sensor);
  }

  public override disposeCompass(sensor: NativeHandle): void {
    this.#routes.invoke("cna_compass_dispose", sensor);
  }

  public override getCompassState(sensor: NativeHandle): number {
    return this.#routes.outU32("cna_compass_get_state", sensor);
  }

  public override getCompassIsDataValid(sensor: NativeHandle): boolean {
    return outBool(this.#routes, "cna_compass_get_is_data_valid", sensor);
  }

  public override getCompassReading(sensor: NativeHandle): CompassReadingSnapshot {
    const scope = this.#routes.scope();
    try {
      const reading = this.#initialised(scope, "CNA_CompassReading", "cna_compass_reading_init");
      this.#routes.invoke("cna_compass_get_current_value", sensor, reading.pointer);
      return {
        HeadingAccuracy: reading.getF64("heading_accuracy"),
        MagneticHeading: reading.getF64("magnetic_heading"),
        TrueHeading: reading.getF64("true_heading"),
        MagnetometerReading: this.#vector3(reading, "magnetometer_reading"),
        ...this.#timestamp(reading),
      };
    } finally {
      scope.dispose();
    }
  }

  public override getCompassInterval(sensor: NativeHandle): bigint {
    return outI64(this.#routes, "cna_compass_get_time_between_updates_ticks", sensor);
  }

  public override setCompassInterval(sensor: NativeHandle, ticks: bigint): void {
    this.#routes.invoke("cna_compass_set_time_between_updates_ticks", sensor, ticks);
  }

  /** Writes a whole `CNA_CompassReading` and hands it to CNA's synthetic backend. */
  public override injectCompassReading(
    sensor: NativeHandle, snapshot: CompassReadingSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      const reading = this.#initialised(scope, "CNA_CompassReading", "cna_compass_reading_init");
      reading.setF64("heading_accuracy", snapshot.HeadingAccuracy);
      reading.setF64("magnetic_heading", snapshot.MagneticHeading);
      reading.setF64("true_heading", snapshot.TrueHeading);
      this.#writeVector3(reading, "magnetometer_reading", snapshot.MagnetometerReading);
      this.#writeTimestamp(reading, snapshot);
      this.#routes.invoke("cna_compass_inject_synthetic_update_ext", sensor, reading.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override setCompassTestBackend(
    sensor: NativeHandle, installed: boolean, supported: boolean,
  ): void {
    this.#routes.invoke(
      "cna_compass_set_test_backend_ext", sensor, installed ? 1 : 0, supported ? 1 : 0,
    );
  }

  // ---- gyroscope ---------------------------------------------------------------------------

  public override createGyroscope(): NativeHandle {
    return this.#routes.outHandle("cna_gyroscope_create", this.#game());
  }

  public override destroyGyroscope(sensor: NativeHandle): void {
    this.#routes.invoke("cna_gyroscope_destroy", sensor);
  }

  public override startGyroscope(sensor: NativeHandle): void {
    this.#routes.invoke("cna_gyroscope_start", sensor);
  }

  public override stopGyroscope(sensor: NativeHandle): void {
    this.#routes.invoke("cna_gyroscope_stop", sensor);
  }

  public override disposeGyroscope(sensor: NativeHandle): void {
    this.#routes.invoke("cna_gyroscope_dispose", sensor);
  }

  public override getGyroscopeState(sensor: NativeHandle): number {
    return this.#routes.outU32("cna_gyroscope_get_state", sensor);
  }

  public override getGyroscopeIsDataValid(sensor: NativeHandle): boolean {
    return outBool(this.#routes, "cna_gyroscope_get_is_data_valid", sensor);
  }

  public override getGyroscopeReading(sensor: NativeHandle): GyroscopeReadingSnapshot {
    const scope = this.#routes.scope();
    try {
      const reading = this.#initialised(
        scope, "CNA_GyroscopeReading", "cna_gyroscope_reading_init",
      );
      this.#routes.invoke("cna_gyroscope_get_current_value", sensor, reading.pointer);
      return {
        RotationRate: this.#vector3(reading, "rotation_rate"),
        ...this.#timestamp(reading),
      };
    } finally {
      scope.dispose();
    }
  }

  public override getGyroscopeInterval(sensor: NativeHandle): bigint {
    return outI64(this.#routes, "cna_gyroscope_get_time_between_updates_ticks", sensor);
  }

  public override setGyroscopeInterval(sensor: NativeHandle, ticks: bigint): void {
    this.#routes.invoke("cna_gyroscope_set_time_between_updates_ticks", sensor, ticks);
  }

  /** Three axes rather than a structure: the gyroscope's injection route takes floats. */
  public override injectGyroscopeReading(
    sensor: NativeHandle, x: number, y: number, z: number,
  ): void {
    this.#routes.invoke("cna_gyroscope_inject_synthetic_update_ext", sensor, x, y, z);
  }

  public override setGyroscopeSupported(sensor: NativeHandle, supported: boolean): void {
    this.#routes.invoke("cna_gyroscope_set_supported_for_tests_ext", sensor, supported ? 1 : 0);
  }

  // ---- motion ------------------------------------------------------------------------------

  public override createMotion(): NativeHandle {
    return this.#routes.outHandle("cna_motion_create", this.#game());
  }

  public override destroyMotion(sensor: NativeHandle): void {
    this.#routes.invoke("cna_motion_destroy", sensor);
  }

  public override startMotion(sensor: NativeHandle): void {
    this.#routes.invoke("cna_motion_start", sensor);
  }

  public override stopMotion(sensor: NativeHandle): void {
    this.#routes.invoke("cna_motion_stop", sensor);
  }

  public override disposeMotion(sensor: NativeHandle): void {
    this.#routes.invoke("cna_motion_dispose", sensor);
  }

  public override getMotionState(sensor: NativeHandle): number {
    return this.#routes.outU32("cna_motion_get_state", sensor);
  }

  public override getMotionIsDataValid(sensor: NativeHandle): boolean {
    return outBool(this.#routes, "cna_motion_get_is_data_valid", sensor);
  }

  public override getMotionIsNorthReferenced(sensor: NativeHandle): boolean {
    return outBool(this.#routes, "cna_motion_get_is_attitude_north_referenced_ext", sensor);
  }

  public override getMotionReading(sensor: NativeHandle): MotionReadingSnapshot {
    const scope = this.#routes.scope();
    try {
      const reading = this.#initialised(scope, "CNA_MotionReading", "cna_motion_reading_init");
      this.#routes.invoke("cna_motion_get_current_value", sensor, reading.pointer);
      const attitude = reading.nested("attitude", "CNA_AttitudeReading");
      return {
        Attitude: {
          Pitch: attitude.getF32("pitch"),
          Roll: attitude.getF32("roll"),
          Yaw: attitude.getF32("yaw"),
          Quaternion: attitude.getF32Array("quaternion"),
          RotationMatrix: attitude.getF32Array("rotation_matrix"),
          ...this.#timestamp(attitude),
        },
        DeviceAcceleration: this.#vector3(reading, "device_acceleration"),
        DeviceRotationRate: this.#vector3(reading, "device_rotation_rate"),
        Gravity: this.#vector3(reading, "gravity"),
        ...this.#timestamp(reading),
      };
    } finally {
      scope.dispose();
    }
  }

  public override getMotionInterval(sensor: NativeHandle): bigint {
    return outI64(this.#routes, "cna_motion_get_time_between_updates_ticks", sensor);
  }

  public override setMotionInterval(sensor: NativeHandle, ticks: bigint): void {
    this.#routes.invoke("cna_motion_set_time_between_updates_ticks", sensor, ticks);
  }

  /** A fused reading, attitude and all, written whole into CNA's synthetic backend. */
  public override injectMotionReading(
    sensor: NativeHandle, snapshot: MotionReadingSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      const reading = this.#initialised(scope, "CNA_MotionReading", "cna_motion_reading_init");
      const attitude = reading.nested("attitude", "CNA_AttitudeReading");
      attitude.setF32("pitch", snapshot.Attitude.Pitch);
      attitude.setF32("roll", snapshot.Attitude.Roll);
      attitude.setF32("yaw", snapshot.Attitude.Yaw);
      attitude.setF32Array("quaternion", snapshot.Attitude.Quaternion);
      attitude.setF32Array("rotation_matrix", snapshot.Attitude.RotationMatrix);
      this.#writeTimestamp(attitude, snapshot.Attitude);
      this.#writeVector3(reading, "device_acceleration", snapshot.DeviceAcceleration);
      this.#writeVector3(reading, "device_rotation_rate", snapshot.DeviceRotationRate);
      this.#writeVector3(reading, "gravity", snapshot.Gravity);
      this.#writeTimestamp(reading, snapshot);
      this.#routes.invoke("cna_motion_inject_synthetic_update_ext", sensor, reading.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override setMotionTestBackend(
    sensor: NativeHandle, installed: boolean, supported: boolean, northReferenced: boolean,
  ): void {
    this.#routes.invoke(
      "cna_motion_set_test_backend_ext",
      sensor, installed ? 1 : 0, supported ? 1 : 0, northReferenced ? 1 : 0,
    );
  }

  // ---- shared shapes -----------------------------------------------------------------------

  /**
   * A reading structure CNA has initialised itself.
   *
   * The `..._reading_init` routes are not decoration: `CNA_MotionReading` carries a nested
   * `CNA_AttitudeReading` with its *own* `struct_size`, and CNA validates both. Writing the outer
   * header and leaving the inner one zero is refused, and letting CNA write them means this file
   * never spells either size.
   */
  #initialised(
    scope: ReturnType<WasmRouteTable["scope"]>,
    name: "CNA_CompassReading" | "CNA_GyroscopeReading" | "CNA_MotionReading",
    initRoute: string,
  ): WasmStruct {
    const reading = allocateStruct(this.#routes.module, scope, name, false);
    this.#routes.invoke(initRoute, reading.pointer);
    return reading;
  }

  /**
   * Reads the `CNA_DateTimeOffset` nested in a reading: ticks since 0001-01-01, plus an offset.
   *
   * The readings that have one are `CNA_AccelerometerReading`, `CNA_CompassReading`,
   * `CNA_GyroscopeReading`, `CNA_MotionReading` and `CNA_AttitudeReading`, all named here because
   * the field lives on them rather than on the timestamp.
   */
  #timestamp(
    reading: WasmStruct,
  ): { TimestampTicks: bigint; TimestampOffsetTicks: bigint } {
    const timestamp = reading.nested("timestamp", "CNA_DateTimeOffset");
    return {
      TimestampTicks: timestamp.getI64("ticks"),
      TimestampOffsetTicks: timestamp.getI64("offset_ticks"),
    };
  }

  /**
   * Writes that same `CNA_DateTimeOffset`, into a `CNA_CompassReading`, a `CNA_MotionReading` or
   * the `CNA_AttitudeReading` inside one.
   */
  #writeTimestamp(
    reading: WasmStruct,
    snapshot: { readonly TimestampTicks: bigint; readonly TimestampOffsetTicks: bigint },
  ): void {
    const timestamp = reading.nested("timestamp", "CNA_DateTimeOffset");
    timestamp.setI64("ticks", snapshot.TimestampTicks);
    timestamp.setI64("offset_ticks", snapshot.TimestampOffsetTicks);
  }

  /**
   * Reads a `CNA_Vector3` nested in a `CNA_CompassReading`, `CNA_GyroscopeReading` or
   * `CNA_MotionReading`.
   */
  #vector3(
    reading: WasmStruct, field: string,
  ): { readonly X: number; readonly Y: number; readonly Z: number } {
    const vector = reading.nested(field, "CNA_Vector3");
    return { X: vector.getF32("x"), Y: vector.getF32("y"), Z: vector.getF32("z") };
  }

  /** Writes a `CNA_Vector3` nested in a `CNA_CompassReading` or a `CNA_MotionReading`. */
  #writeVector3(
    reading: WasmStruct,
    field: string,
    value: { readonly X: number; readonly Y: number; readonly Z: number },
  ): void {
    const vector = reading.nested(field, "CNA_Vector3");
    vector.setF32("x", value.X).setF32("y", value.Y).setF32("z", value.Z);
  }
}
