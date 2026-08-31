/**
 * The `cna-ts/extensions/input` data path, covered without hardware.
 *
 * `test/native-cna.integration.mjs` drives these families against a real CNA library, and on a
 * build machine that answer is honest but thin: with no joystick attached, every array is empty, so
 * a defect that read the hats out of the buttons is invisible there. That was measured by planting
 * exactly that defect and watching the integration suite stay green.
 *
 * So this file supplies the shape the hardware would: a deterministic backend whose four joystick
 * arrays are all different lengths with all different values, and whose haptic device answers each
 * operation differently. That is a *managed* projection test — it proves this package reads what the
 * boundary gave it, in the right order, into the right fields. It deliberately does not claim
 * anything about a physical device; that stays hardware-pending, and the integration suite is where
 * the real library's absence-reporting is asserted.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { getBackend, setBackendForInternalUse } from "../dist/internal/backend.js";
import { NativeUnavailableError, Point } from "../dist/index.js";
import {
  HapticDevice,
  HapticFeature,
  Haptics,
  Joysticks,
  JoystickHatPosition,
  JoystickType,
} from "../dist/extensions/input/index.js";

function backendWith(previous, values) {
  const result = Object.create(previous);
  Object.assign(result, {
    Kind: "node-native",
    IsAvailable: true,
    AbiVersion: "0.21.0-test",
    Detail: "deterministic extended-input backend",
    ...values,
  });
  return result;
}

/**
 * Two joysticks with different everything, and one haptic device.
 *
 * The four state arrays have four different lengths — 3 axes, 5 buttons, 2 hats, 1 ball — so any
 * substitution of one for another changes the length and is caught. Their values are distinct too,
 * so a substitution between two arrays that happened to match in length would still be caught.
 */
function inputHarness() {
  const released = [];
  const devices = [
    { Id: 7, Type: JoystickType.FlightStick, Name: "Test Flight Stick" },
    { Id: 9, Type: JoystickType.Wheel, Name: "Test Wheel" },
  ];
  const state = {
    Axes: [-32768, 0, 32767],
    Buttons: [true, false, true, true, false],
    Hats: [JoystickHatPosition.LeftDown, JoystickHatPosition.Right],
    Balls: [{ X: -4, Y: 11 }],
  };
  const backend = {
    getJoystickCount: () => devices.length,
    getJoystickInfoAt: (index) => ({ Id: devices[index].Id, Type: devices[index].Type }),
    getJoystickNameAt: (index) => devices[index].Name,
    getJoystickCapabilities: (id) => ({
      AxisCount: 3, ButtonCount: 5, HatCount: 2, BallCount: 1,
      Type: id === 7 ? JoystickType.FlightStick : JoystickType.Wheel,
      PowerState: 3, PowerPercent: 62, IsConnected: true,
    }),
    getJoystickCapabilitiesName: (id) => `capabilities-${id}`,
    getJoystickCapabilitiesGuid: (id) => `guid-${id}`,
    captureJoystickState: () => state,
    getHapticCount: () => 1,
    getHapticIdAt: () => 4,
    getHapticNameAt: () => "Test Rumble Pack",
    isJoystickHaptic: (id) => id === 7,
    openHaptic: (id) => BigInt(1000 + id),
    openHapticFromJoystick: (id) => BigInt(2000 + id),
    getHapticCapabilities: () => ({
      Features: HapticFeature.LeftRight | HapticFeature.Gain,
      AxisCount: 2, MaxEffects: 16, MaxEffectsPlaying: 4, IsOpen: true, RumbleSupported: true,
    }),
    getHapticName: () => "Test Rumble Pack",
    getHapticIsOpen: () => true,
    // Four operations, four different answers, so a projection that returned the same one for all
    // of them would fail rather than round-trip.
    initHapticRumble: () => true,
    playHapticRumble: (_device, strength, length) => strength === 0.5 && length === 250,
    stopHapticRumble: () => false,
    setHapticGain: (_device, gain) => gain === 75,
    disposeHapticDevice: (handle) => released.push(["dispose", handle]),
    destroyHapticDevice: (handle) => released.push(["destroy", handle]),
  };
  return { backend, released, state, devices };
}

function withInput(body) {
  const previous = getBackend();
  const harness = inputHarness();
  setBackendForInternalUse(backendWith(previous, { ExtendedInput: harness.backend }));
  try {
    body(harness);
  } finally {
    setBackendForInternalUse(previous);
  }
}

test("extended input lives outside the strict XNA surface", async () => {
  const xna = await import("../dist/xna.js");
  for (const name of ["Joysticks", "Haptics", "HapticDevice", "JoystickType"]) {
    assert.equal(name in xna, false, `${name} must not leak into the strict XNA surface`);
  }
  const input = xna.Microsoft.Xna.Framework.Input;
  for (const name of ["Joysticks", "Haptics", "JoystickHatPosition"]) {
    assert.equal(name in input, false, `${name} must not appear in Microsoft.Xna.Framework.Input`);
  }
});

test("every extended-input entry point refuses truthfully with no backend loaded", () => {
  for (const call of [
    () => Joysticks.Count,
    () => Joysticks.Enumerate(),
    () => Joysticks.GetCapabilities(0),
    () => Joysticks.CaptureState(0),
    () => Haptics.Count,
    () => Haptics.Enumerate(),
    () => Haptics.IsJoystickHaptic(0),
    () => Haptics.Open(0),
    () => Haptics.OpenFromJoystick(0),
  ]) {
    assert.throws(call, NativeUnavailableError);
  }
});

test("a joystick's four state arrays are read into their own fields", () => {
  withInput(({ state }) => {
    const captured = Joysticks.CaptureState(7);
    // Four different lengths, so substituting any array for any other changes the length.
    assert.deepEqual(
      [captured.Axes.length, captured.Buttons.length, captured.Hats.length, captured.Balls.length],
      [3, 5, 2, 1],
    );
    // And four different value sets, so a substitution between equal-length arrays would still be
    // caught. This is what the hardware-less integration run cannot check.
    assert.deepEqual([...captured.Axes], state.Axes);
    assert.deepEqual([...captured.Buttons], state.Buttons);
    assert.deepEqual([...captured.Hats], state.Hats);
    assert.equal(captured.Hats[0], JoystickHatPosition.LeftDown);
    assert.equal(captured.Hats[1], JoystickHatPosition.Right);
    // A trackball's motion becomes an XNA Point, with the two components the right way round.
    assert.equal(captured.Balls.length, 1);
    assert.ok(captured.Balls[0] instanceof Point);
    assert.equal(captured.Balls[0].X, -4);
    assert.equal(captured.Balls[0].Y, 11);
    // The snapshot is frozen and is a copy: mutating the backend's array afterwards must not
    // change what a caller already holds.
    assert.equal(Object.isFrozen(captured.Axes), true);
    state.Axes[0] = 123;
    assert.equal(captured.Axes[0], -32768, "a captured state is a copy, not a view");
  });
});

test("enumeration pairs each joystick's identity with its own name and type", () => {
  withInput(({ devices }) => {
    const enumerated = Joysticks.Enumerate();
    assert.equal(enumerated.length, 2);
    // Two devices with different ids, names and types: a projection that read index 0's name for
    // both, or paired a name with the wrong id, fails here.
    assert.deepEqual(enumerated.map((device) => device.Id), [7, 9]);
    assert.deepEqual(enumerated.map((device) => device.Name), devices.map((device) => device.Name));
    assert.deepEqual(
      enumerated.map((device) => device.Type), [JoystickType.FlightStick, JoystickType.Wheel],
    );
    assert.equal(Object.isFrozen(enumerated), true);

    const capabilities = Joysticks.GetCapabilities(7);
    assert.equal(capabilities.Name, "capabilities-7");
    assert.equal(capabilities.Guid, "guid-7", "the name and the GUID are separate routes");
    assert.deepEqual(
      [capabilities.AxisCount, capabilities.ButtonCount, capabilities.HatCount, capabilities.BallCount],
      [3, 5, 2, 1],
    );
    assert.equal(capabilities.Type, JoystickType.FlightStick);
    assert.equal(capabilities.PowerPercent, 62);
    assert.equal(capabilities.IsConnected, true);
    // The second device's capabilities must be its own, not the first's.
    assert.equal(Joysticks.GetCapabilities(9).Guid, "guid-9");
    assert.equal(Joysticks.GetCapabilities(9).Type, JoystickType.Wheel);
  });
});

test("a haptic device reports each operation's own answer and disposes once", () => {
  withInput(({ released }) => {
    assert.equal(Haptics.Count, 1);
    assert.deepEqual([...Haptics.Enumerate()], [{ Id: 4, Name: "Test Rumble Pack" }]);
    assert.equal(Haptics.IsJoystickHaptic(7), true);
    assert.equal(Haptics.IsJoystickHaptic(9), false, "the identifier reaches the route");

    const device = Haptics.Open(4);
    assert.ok(device instanceof HapticDevice);
    assert.equal(device.Name, "Test Rumble Pack");
    assert.equal(device.IsOpen, true);
    const capabilities = device.Capabilities;
    assert.equal(capabilities.Features, HapticFeature.LeftRight | HapticFeature.Gain);
    assert.equal((capabilities.Features & HapticFeature.Spring) !== 0, false);
    assert.deepEqual(
      [capabilities.AxisCount, capabilities.MaxEffects, capabilities.MaxEffectsPlaying], [2, 16, 4],
    );

    // Four operations with four different answers. A projection that returned the same value for
    // all of them, or that dropped an argument, fails here rather than round-tripping.
    assert.equal(device.InitializeRumble(), true);
    assert.equal(device.PlayRumble(0.5, 250), true, "both arguments reach the route");
    assert.equal(device.PlayRumble(0.25, 250), false, "a different strength is a different call");
    assert.equal(device.StopRumble(), false);
    assert.equal(device.SetGain(75), true);
    assert.equal(device.SetGain(10), false);

    // Disposal closes *and* releases, in that order, exactly once.
    device.Dispose();
    device.Dispose();
    assert.equal(device.IsDisposed, true);
    assert.deepEqual(released, [["dispose", 1004n], ["destroy", 1004n]]);
    assert.throws(() => device.PlayRumble(0.5, 10), /HapticDevice\.PlayRumble/);
    assert.throws(() => device.Capabilities, /HapticDevice\.Capabilities/);
  });
});

test("out-of-range arguments are refused before they reach CNA", () => {
  withInput(() => {
    for (const call of [
      () => Joysticks.GetCapabilities(-1),
      () => Joysticks.CaptureState(1.5),
      () => Haptics.Open(-1),
      () => Haptics.OpenFromJoystick(Number.NaN),
      () => Haptics.IsJoystickHaptic(-2),
    ]) {
      assert.throws(call, /must be a non-negative integer/);
    }
    const device = Haptics.Open(4);
    try {
      // A rumble strength is a fraction and a gain is a percentage; both bounds are this package's
      // rather than CNA's, so they hold on any host.
      assert.throws(() => device.PlayRumble(-0.1, 10), /strength must be between 0 and 1/);
      assert.throws(() => device.PlayRumble(1.5, 10), /strength must be between 0 and 1/);
      assert.throws(() => device.PlayRumble(0.5, -1), /lengthMilliseconds/);
      assert.throws(() => device.SetGain(101), /gain must be an integer between 0 and 100/);
      assert.throws(() => device.SetGain(-1), /gain must be an integer between 0 and 100/);
    } finally {
      device.Dispose();
    }
  });
});
