// SPDX-License-Identifier: MS-PL
//
// The clipboard's reads, the attached-device inventory, and a power reading that does not need
// CNA's extended device layer.
//
// This file runs against **either** renderer and asserts a different thing about each, because the
// interesting claim is different in each case:
//
//   * with a windowed library and a display, the clipboard must actually round-trip, at least one
//     keyboard must be enumerated by name, and the power reading must be a real one;
//   * with the headless library, every one of those must answer *emptily and successfully* — no
//     clipboard, no devices — which is the evidence that nothing here fabricates a device.
//
// A run that finds neither library says so and skips, rather than passing on nothing.
//
// ```sh
// CNA_WINDOWED_LIBRARY=/path/to/libcna_c_api.so CNA_NODE_BRIDGE=build/cna_node_bridge.node \
//   xvfb-run -a node --test test/input-devices.integration.mjs
// ```

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { Game, GraphicsDeviceManager, LoadNodeNativeBackend } from "../dist/index.js";
import { CnaDevices, PowerState } from "../dist/extensions/devices/index.js";

const windowed = process.env.CNA_WINDOWED_LIBRARY;
const headless = process.env.CNA_NATIVE_LIBRARY;
const display = process.env.DISPLAY;

const mode = windowed && display ? "windowed" : (headless ? "headless" : null);
const library = mode === "windowed" ? windowed : headless;
const skip = mode
  ? false
  : (windowed
    ? "CNA_WINDOWED_LIBRARY is set but there is no DISPLAY; run under xvfb-run"
    : "set CNA_WINDOWED_LIBRARY (with a display) or CNA_NATIVE_LIBRARY");

const storageHome = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-input-devices-"));
process.env.XDG_DATA_HOME = storageHome;
after(() => fs.rmSync(storageHome, { recursive: true, force: true }));

const evidence = Object.create(null);

if (!skip) {
  await LoadNodeNativeBackend({
    CnaLibrary: path.resolve(library),
    BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
  });

  const WRITTEN = "cna-ts clipboard round trip — éü中";

  class DeviceProbeGame extends Game {
    constructor() {
      super();
      this.graphics = new GraphicsDeviceManager(this);
    }

    Draw(_gameTime) {
      const record = (name, body) => {
        try { evidence[name] = body(); }
        catch (error) { evidence[name] = { failed: `${error?.constructor?.name}: ${error?.message}` }; }
      };

      record("clipboard", () => {
        const before = CnaDevices.HasClipboardText();
        const emptied = (() => {
          // Writing an empty string must make HasClipboardText false where there is a clipboard
          // at all, which is what makes the two reads independent of each other rather than one
          // derived from the other.
          CnaDevices.SetClipboardText("");
          return CnaDevices.HasClipboardText();
        })();
        // SetClipboardText reports whether the platform took the request, which is not the same as
        // whether the clipboard changed. Reading it back is the only way to know, and until these
        // routes existed a consumer could not.
        const accepted = CnaDevices.SetClipboardText(WRITTEN);
        const has = CnaDevices.HasClipboardText();
        const text = CnaDevices.GetClipboardText();
        return { before, emptied, accepted, has, text, roundTripped: text === WRITTEN };
      });

      record("inventory", () => ({
        mice: CnaDevices.GetAttachedMice().map((d) => ({ Id: d.Id.toString(), Name: d.Name })),
        keyboards: CnaDevices.GetAttachedKeyboards()
          .map((d) => ({ Id: d.Id.toString(), Name: d.Name })),
        touch: CnaDevices.GetAttachedTouchDevices()
          .map((d) => ({ Id: d.Id.toString(), Name: d.Name })),
      }));

      record("power", () => {
        const power = CnaDevices.GetHostPower();
        let extensionLayer = null;
        try { extensionLayer = CnaDevices.IsAvailable(); }
        catch (error) { extensionLayer = `${error?.constructor?.name}`; }
        return {
          State: power.State,
          BatteryPercent: power.BatteryPercent,
          SecondsRemaining: power.SecondsRemaining,
          extensionLayer,
        };
      });

      this.Exit();
    }
  }

  const game = new DeviceProbeGame();
  await game.Run();
  game.Dispose();
}

function claim(name) {
  const value = evidence[name];
  assert.ok(
    value != null && value.failed == null,
    `the "${name}" measurement did not run: ${value?.failed ?? "absent"}`,
  );
  return value;
}

test("the clipboard reads answer, and say what they answered", { skip }, () => {
  const seen = claim("clipboard");
  assert.equal(typeof seen.before, "boolean");
  assert.equal(typeof seen.has, "boolean");
  assert.equal(typeof seen.text, "string");
  if (mode === "windowed") {
    assert.equal(
      seen.roundTripped, true,
      "on a real platform the clipboard must return exactly what was written, non-ASCII " +
      `included: ${JSON.stringify(seen.text)}`,
    );
    assert.equal(seen.has, true, "and must then report that it holds text");
    assert.equal(
      seen.emptied, false,
      "while an empty clipboard reports false -- so HasClipboardText tracks the clipboard rather " +
      "than answering a constant",
    );
  } else {
    assert.equal(
      seen.text, "",
      "a headless session has no clipboard, so the read is an empty string rather than a " +
      "failure -- and nothing here invents one",
    );
    assert.equal(seen.has, false);
  }
});

test("the device inventory reports the platform's own devices, or none", { skip }, () => {
  const seen = claim("inventory");
  for (const list of [seen.mice, seen.keyboards, seen.touch]) {
    assert.ok(Array.isArray(list));
    for (const device of list) {
      assert.equal(typeof device.Id, "string");
      assert.ok(device.Name.length > 0, "an enumerated device always carries a name");
    }
  }
  if (mode === "windowed") {
    assert.ok(
      seen.keyboards.length >= 1,
      `a windowed session enumerates at least one keyboard: ${JSON.stringify(seen.keyboards)}`,
    );
    assert.ok(
      seen.mice.length >= 1,
      `and at least one mouse: ${JSON.stringify(seen.mice)}`,
    );
    const ids = [...seen.mice, ...seen.keyboards].map((d) => d.Id);
    assert.equal(new Set(ids).size, ids.length, "each device has its own identifier");
  } else {
    assert.deepEqual(
      [seen.mice.length, seen.keyboards.length, seen.touch.length], [0, 0, 0],
      "a headless session enumerates nothing, which is an answer rather than a failure",
    );
  }
});

test("host power answers without the extended device layer", { skip }, () => {
  const seen = claim("power");
  assert.ok(
    Object.values(PowerState).includes(seen.State),
    `State must be a PowerState: ${seen.State}`,
  );
  for (const [name, value] of [
    ["BatteryPercent", seen.BatteryPercent], ["SecondsRemaining", seen.SecondsRemaining],
  ]) {
    assert.ok(
      value === null || (Number.isInteger(value) && value >= 0),
      `${name} is a non-negative integer or null, never -1: ${value}`,
    );
  }
  if (mode === "headless") {
    // HEADLESS has no power source to report, so both readings must be *absent* rather than any
    // number at all. This is what separates a real reading from a field that echoes something
    // else: State is Unknown here, and a BatteryPercent that came from State would be 1.
    assert.equal(seen.State, PowerState.Unknown);
    assert.equal(seen.BatteryPercent, null, "no battery is reported, so the charge is absent");
    assert.equal(seen.SecondsRemaining, null);
  }
  if (seen.BatteryPercent !== null) {
    assert.ok(seen.BatteryPercent >= 0 && seen.BatteryPercent <= 100);
  }
  if (mode === "windowed") {
    // The point of this route: it answers on a CNA built with CNA_DEVICES=OFF, where all three of
    // the extension's own power readers refuse. If the layer happens to be present, that is not a
    // failure -- but the reading must still be a real one either way.
    assert.notEqual(
      seen.State, PowerState.Error,
      "a real platform reports a state rather than an error",
    );
  }
});
