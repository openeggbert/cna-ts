#!/usr/bin/env node

/**
 * Proves `GamePad` and `TouchPanel` in a real browser, through the public XNA API.
 *
 * The main browser harness runs a fixed number of frames and reports at the end. Input cannot be
 * proved that way: what matters is what `Microsoft.Xna.Framework.Input` answers *between* one frame
 * and the next while a browser event is delivered. So `test/wasm/browser-input-page.html` exposes
 * one frame at a time and this driver interleaves real browser input with real CNA frames.
 *
 * ## What "real" means here, exactly
 *
 * **Touch** is genuine browser input: Chromium's own touch emulation is enabled for the context and
 * the points are dispatched through `Input.dispatchTouchEvent`, so the page receives ordinary
 * trusted `touchstart`/`touchmove`/`touchend` events. SDL3's Emscripten platform turns them into
 * SDL finger events, CNA turns those into its touch collection, and this package projects that as
 * XNA's `TouchCollection`. Nothing along that path is stubbed.
 *
 * **Gamepad** has no equivalent driver-level emulation — neither Playwright nor the DevTools
 * protocol can attach a virtual controller. What *is* real is the integration point: SDL3's
 * Emscripten joystick driver reads `navigator.getGamepads()`, so replacing that one browser API
 * before the module loads drives the entire genuine chain beneath it — Emscripten's gamepad glue,
 * SDL3's joystick driver, CNA's input services, the C ABI, this backend and the XNA facade. The
 * device is emulated at the browser boundary; nothing below it is. This is deliberately labelled
 * rather than described as hardware evidence, and the first test below is the honesty anchor: with
 * no controller present, the facade must say so rather than invent one.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WASM_DIR = process.env.CNA_WASM_ARTIFACT_DIR
  ? path.resolve(process.env.CNA_WASM_ARTIFACT_DIR)
  : path.join(ROOT, "../../cnanext/cmake-build-tswasm/modules/c-api");
const PAGE = path.join(ROOT, "test/wasm/browser-input-page.html");
const DIST = path.join(ROOT, "dist");

const TYPES = new Map(Object.entries({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
}));

/** XNA's numbering, which is not the obvious one: Released is 1 and Moved is 3. */
const TouchLocationState = { Invalid: 0, Released: 1, Pressed: 2, Moved: 3 };
/** `GamePadType.GamePad`. */
const GAMEPAD_TYPE_GAMEPAD = 1;
/** The canvas is this size, and the viewport is set to match so a CSS pixel is a canvas pixel. */
const CANVAS = { width: 320, height: 240 };

function missing() {
  if (!fs.existsSync(path.join(WASM_DIR, "cna_c_api.mjs"))) {
    return `no CNA C ABI wasm artifact at ${WASM_DIR}; build the cna_c_api_wasm target and set CNA_WASM_ARTIFACT_DIR`;
  }
  if (!fs.existsSync(path.join(DIST, "index.js"))) return "run npm run build first";
  return null;
}

async function importPlaywright() {
  const candidates = [];
  if (process.env.CNA_PLAYWRIGHT_MODULE) candidates.push(process.env.CNA_PLAYWRIGHT_MODULE);
  candidates.push("playwright");
  candidates.push(path.resolve(path.dirname(process.execPath), "../lib/node_modules/playwright/index.mjs"));
  for (const candidate of candidates) {
    try {
      const specifier = candidate.startsWith(".") || path.isAbsolute(candidate)
        ? pathToFileURL(candidate).href
        : candidate;
      return await import(specifier);
    } catch {
      continue;
    }
  }
  return null;
}

function serve() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let file = null;
    if (url.pathname === "/" || url.pathname === "/index.html") file = PAGE;
    else if (url.pathname.startsWith("/cna-ts/")) file = path.join(DIST, url.pathname.slice("/cna-ts/".length));
    else if (url.pathname.startsWith("/wasm/")) file = path.join(WASM_DIR, url.pathname.slice("/wasm/".length));
    if (file == null || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": TYPES.get(path.extname(file)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const blocked = missing();
const playwright = blocked ? null : await importPlaywright();
const skip = blocked ?? (playwright ? false : "playwright is not installed");

/**
 * Installs an emulated Gamepad API device. Emscripten's gamepad glue caches
 * `navigator.getGamepads()` into `JSEvents.lastGamepadState` each time SDL samples, so mutating the
 * single object this returns is what a physical stick movement looks like from the runtime's side.
 */
function gamepadInitScript() {
  return () => {
    const pad = {
      index: 0,
      // The "STANDARD GAMEPAD" marker is what the browser mapping is called; SDL3 uses the id.
      id: "CNA-TS Emulated Pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)",
      connected: true,
      mapping: "standard",
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    globalThis.__cnaPad = pad;
    navigator.getGamepads = () => [pad];
    // Standard-mapping button indexes, so a test says "A" rather than "6".
    globalThis.__cnaPadPress = (index, value) => {
      pad.buttons[index] = { pressed: value > 0, touched: value > 0, value };
      pad.timestamp = performance.now();
    };
    globalThis.__cnaPadAxes = (axes) => {
      pad.axes = axes.slice();
      pad.timestamp = performance.now();
    };
  };
}

/**
 * Runs one scenario in a fresh browser and returns everything it observed. Each scenario launches
 * exactly one browser, because launching Chromium and instantiating a nineteen-megabyte module per
 * assertion would dominate the suite's runtime for no extra evidence.
 */
async function runScenario({ withGamepad, drive }) {
  const { server, port } = await serve();
  const browser = await playwright.chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
  });
  try {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { ...CANVAS },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const runtimeLog = /^\[(INFO|DEBUG|TRACE|WARN|WARNING|EXPERIMENT)\]\[[A-Z]+\] /;
    const mixerNotice = /^\[AudioMixer\] Requested format=0x[0-9a-f]+ channels=\d+ freq=\d+; /;
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (runtimeLog.test(text) || mixerNotice.test(text)) return;
      consoleErrors.push(text);
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));
    if (withGamepad) await page.addInitScript(gamepadInitScript());

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    await page.waitForFunction(
      () => globalThis.__cnaInput && globalThis.__cnaInput.status !== "loading",
      undefined,
      { timeout: 180_000 },
    );
    const ready = await page.evaluate(() => ({
      status: globalThis.__cnaInput.status,
      error: globalThis.__cnaInput.error ?? null,
      backend: globalThis.__cnaInput.backend ?? null,
      abiVersion: globalThis.__cnaInput.abiVersion ?? null,
    }));
    assert.equal(ready.status, "ready", ready.error ?? "");

    // A game has to exist before any input route can be reached, which is itself the contract:
    // input is a property of a running game, not of a loaded module.
    await page.evaluate(() => globalThis.__cnaInput.pump(3));
    const observations = await drive({
      page,
      cdp: await context.newCDPSession(page),
      pump: (count) => page.evaluate((n) => globalThis.__cnaInput.pump(n), count),
      gamePad: () => page.evaluate(() => globalThis.__cnaInput.gamePadState()),
      gamePadCapabilities: () => page.evaluate(() => globalThis.__cnaInput.gamePadCapabilities()),
      gamePadCapabilitiesFor: (player) =>
        page.evaluate((p) => globalThis.__cnaInput.gamePadCapabilitiesFor(p), player),
      touch: () => page.evaluate(() => globalThis.__cnaInput.touchState()),
      touchPanel: () => page.evaluate(() => globalThis.__cnaInput.touchPanelDisplay()),
      setVibration: (left, right) =>
        page.evaluate(([l, r]) => globalThis.__cnaInput.setVibration(l, r), [left, right]),
    });
    const disposed = await page.evaluate(() => globalThis.__cnaInput.finish());
    const errors = await page.evaluate(() => globalThis.__cnaInput.errors);
    return { observations, consoleErrors, errors, disposed, ready };
  } finally {
    await browser.close();
    server.close();
  }
}

/** Shared scenario runs, awaited by several tests each so one browser serves several assertions. */
let withoutPad = null;
let withPad = null;
let touchRun = null;

function noGamepadScenario() {
  withoutPad ??= runScenario({
    withGamepad: false,
    drive: async ({ gamePad, gamePadCapabilities, gamePadCapabilitiesFor, touch, touchPanel, setVibration, pump }) => {
      await pump(5);
      return {
        state: await gamePad(),
        capabilities: await gamePadCapabilities(),
        // XNA numbers PlayerIndex One = 0 through Four = 3, and CNA uses the same numbering --
        // the contract verifier proves that with a _Static_assert. Every slot must be reported
        // empty rather than throwing.
        perPlayer: await Promise.all([0, 1, 2, 3].map((player) => gamePadCapabilitiesFor(player))),
        touch: await touch(),
        touchPanel: await touchPanel(),
        vibration: await setVibration(1, 1),
      };
    },
  });
  return withoutPad;
}

function gamepadScenario() {
  withPad ??= runScenario({
    withGamepad: true,
    drive: async ({ page, gamePad, gamePadCapabilities, setVibration, pump }) => {
      await pump(5);
      const idle = await gamePad();
      const capabilities = await gamePadCapabilities();
      // Standard mapping: 0 = A, 1 = B, 6 = left trigger, 12 = D-pad up.
      // Axes: 0/1 = left stick X/Y, 2/3 = right stick X/Y, Y down-positive in the browser.
      await page.evaluate(() => {
        globalThis.__cnaPadPress(0, 1);
        globalThis.__cnaPadPress(6, 0.5);
        globalThis.__cnaPadPress(12, 1);
        globalThis.__cnaPadAxes([0.5, -0.25, -0.75, 0.125]);
      });
      await pump(5);
      const pressed = await gamePad();
      await page.evaluate(() => {
        globalThis.__cnaPadPress(0, 0);
        globalThis.__cnaPadPress(6, 0);
        globalThis.__cnaPadPress(12, 0);
        globalThis.__cnaPadAxes([0, 0, 0, 0]);
      });
      await pump(5);
      const released = await gamePad();
      return { idle, capabilities, pressed, released, vibration: await setVibration(0.5, 0.5) };
    },
  });
  return withPad;
}

function touchScenario() {
  touchRun ??= runScenario({
    withGamepad: false,
    drive: async ({ cdp, pump, touch }) => {
      const before = await touch();
      const dispatch = (type, points) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

      // `pump` returns whole per-frame samples; only the touch half is of interest here.
      const touchFrames = async (count) => (await pump(count)).map((sample) => sample.touch);

      await dispatch("touchStart", [{ x: 40, y: 50, id: 1 }]);
      const down = await touchFrames(2);
      await dispatch("touchMove", [{ x: 90, y: 120, id: 1 }]);
      const moved = await touchFrames(2);
      // A second finger, so identity and ordering are exercised rather than assumed.
      await dispatch("touchStart", [{ x: 90, y: 120, id: 1 }, { x: 200, y: 30, id: 2 }]);
      const twoDown = await touchFrames(2);
      await dispatch("touchEnd", [{ x: 90, y: 120, id: 1 }]);
      const oneLifted = await touchFrames(2);
      await dispatch("touchEnd", []);
      const allLifted = await touchFrames(3);
      return { before, down, moved, twoDown, oneLifted, allLifted };
    },
  });
  return touchRun;
}

/** Float32 round-trips a JavaScript double, so exact equality is the wrong assertion. */
function closeTo(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

test("a browser with no controller reports no controller", { skip }, async () => {
  const { observations, consoleErrors, errors } = await noGamepadScenario();
  // The honesty anchor for the whole file. Headless Chromium has no gamepad attached, and the
  // facade must say exactly that: not throw, not invent a device, not report a disconnected pad as
  // a connected one with zeroed axes. A game asking "is player one here" gets "no".
  assert.equal(observations.state.isConnected, false);
  assert.equal(observations.capabilities.isConnected, false);
  for (const [index, capabilities] of observations.perPlayer.entries()) {
    assert.equal(capabilities.isConnected, false, `player ${index + 1} reported a controller`);
  }
  // A disconnected controller's analog state is zero *because XNA says so*, which is only
  // meaningful beside the IsConnected answer above.
  for (const [name, value] of Object.entries({
    leftX: observations.state.leftX,
    leftY: observations.state.leftY,
    leftTrigger: observations.state.leftTrigger,
  })) {
    closeTo(value, 0, 0, `${name} on an absent controller`);
  }
  assert.equal(observations.state.a, false);
  // Vibration on an absent controller is refused rather than silently accepted.
  assert.equal(observations.vibration, false);
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("a browser with no touch input reports an empty TouchPanel", { skip }, async () => {
  const { observations } = await noGamepadScenario();
  assert.equal(observations.touch.count, 0);
  assert.deepEqual(observations.touch.touches, []);
  assert.equal(observations.touch.isReadOnly, true, "XNA's TouchCollection is always read-only");
  assert.deepEqual(observations.touch.enumeratedIds, []);
  // No gesture has been enabled or performed, so none is available. That is a real answer from
  // `cna_touch_panel_get_is_gesture_available`, not a managed default.
  assert.equal(observations.touchPanel.isGestureAvailable, false);
  assert.equal(observations.touchPanel.enabledGestures, 0, "GestureType.None");
});

test("an emulated Gamepad API device reaches GamePad.GetCapabilities", { skip }, async () => {
  const { observations, consoleErrors, errors } = await gamepadScenario();
  const capabilities = observations.capabilities;
  assert.equal(capabilities.isConnected, true);
  assert.equal(capabilities.gamePadType, GAMEPAD_TYPE_GAMEPAD, "GamePadType.GamePad");
  // The standard browser mapping has all of these; a capability table that simply answered true to
  // everything would fail on the three below it.
  assert.equal(capabilities.hasAButton, true);
  assert.equal(capabilities.hasBButton, true);
  assert.equal(capabilities.hasStartButton, true);
  assert.equal(capabilities.hasDPadUpButton, true);
  assert.equal(capabilities.hasLeftXThumbStick, true);
  assert.equal(capabilities.hasRightYThumbStick, true);
  assert.equal(capabilities.hasLeftTrigger, true);
  assert.equal(capabilities.hasRightTrigger, true);
  // And the honest negatives: the browser's standard mapping exposes no rumble motors to SDL and
  // no voice channel, so CNA reports none and this package passes that through unchanged.
  assert.equal(capabilities.hasLeftVibrationMotor, false);
  assert.equal(capabilities.hasRightVibrationMotor, false);
  assert.equal(capabilities.hasVoiceSupport, false);
  assert.equal(observations.idle.isConnected, true);
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("button, thumbstick and trigger values reach GamePadState exactly", { skip }, async () => {
  const { observations } = await gamepadScenario();
  const { idle, pressed, released } = observations;

  // Buttons. A was pressed and B was not, so a state that reported every button pressed fails.
  assert.equal(idle.a, false, "nothing was pressed before the driver pressed it");
  assert.equal(pressed.a, true);
  assert.equal(pressed.b, false);
  assert.equal(pressed.dpadUp, true);
  assert.equal(pressed.dpadDown, false);
  // IsButtonDown/IsButtonUp are what a game actually calls, and they must agree with Buttons.A.
  assert.equal(pressed.aDown, true);
  assert.equal(pressed.aUp, false);
  assert.equal(idle.aDown, false);
  assert.equal(idle.aUp, true);

  // Thumbsticks. The browser reports Y down-positive and XNA reports Y up-positive, so the sign of
  // both Y axes must be inverted somewhere between the two -- and it is CNA that does it. Asserting
  // the raw magnitude *and* the sign is what catches a backend that forgot.
  closeTo(pressed.leftX, 0.5, 1e-4, "left stick X");
  closeTo(pressed.leftY, 0.25, 1e-4, "left stick Y is inverted from the browser's -0.25");
  closeTo(pressed.rightX, -0.75, 1e-4, "right stick X");
  closeTo(pressed.rightY, -0.125, 1e-4, "right stick Y is inverted from the browser's +0.125");

  // Triggers are analog: the left one was pulled halfway and the right one not at all.
  closeTo(pressed.leftTrigger, 0.5, 1e-4, "left trigger");
  assert.equal(pressed.rightTrigger, 0, "the right trigger was never pulled");

  // The packet number is XNA's "did anything change" counter and must actually move.
  assert.ok(
    pressed.packetNumber > idle.packetNumber,
    `packet number did not advance: ${idle.packetNumber} -> ${pressed.packetNumber}`,
  );

  // Releasing has to be observable too, or the test would pass against a backend that latched.
  assert.equal(released.a, false);
  assert.equal(released.dpadUp, false);
  // Compared by magnitude rather than by identity: the released Y axes come back as negative zero,
  // because CNA negates the browser's zero to convert to XNA's up-positive convention. That is the
  // inversion asserted above still doing its job, so it is accepted rather than papered over.
  for (const [name, value] of Object.entries({
    leftX: released.leftX, leftY: released.leftY,
    rightX: released.rightX, rightY: released.rightY,
    leftTrigger: released.leftTrigger,
  })) {
    closeTo(value, 0, 0, `${name} after release`);
  }
  assert.ok(Object.is(released.leftY, -0) || Object.is(released.leftY, 0),
    "the released Y axis is a zero of one sign or the other, never a stale value");
  assert.ok(released.packetNumber > pressed.packetNumber, "release did not advance the packet number");
});

test("SetVibration reports the browser's real answer rather than a plausible one", { skip }, async () => {
  const { observations } = await gamepadScenario();
  // The standard browser mapping exposes no rumble to SDL3's Emscripten joystick driver, so CNA
  // cannot vibrate and says so. A backend that returned true here would be lying to a game that
  // uses the return value to decide whether to offer a haptics setting.
  assert.equal(observations.vibration, false);
});

test("a browser touch reaches TouchPanel with XNA's press/move/release states", { skip }, async () => {
  const { observations, consoleErrors, errors } = await touchScenario();

  // Before any touch there is no touch device at all, which is distinct from a device with no
  // fingers on it -- SDL only creates the device when the first finger arrives.
  assert.equal(observations.before.count, 0);
  assert.equal(observations.before.isConnected, false, "no touch device exists before the first touch");

  // Press. XNA numbers Released = 1, Pressed = 2, Moved = 3, which is worth stating because the
  // obvious ordering is wrong.
  const down = observations.down[0];
  assert.equal(down.isConnected, true, "the touch device exists once a finger has arrived");
  assert.equal(down.count, 1);
  assert.equal(down.touches[0].state, TouchLocationState.Pressed);
  assert.equal(down.touches[0].id, 1);
  closeTo(down.touches[0].x, 40, 1.5, "press X");
  closeTo(down.touches[0].y, 50, 1.5, "press Y");
  // A brand-new touch has no previous location, and XNA's accessor must say so rather than
  // returning a zeroed one that looks like a real sample at the origin.
  assert.equal(down.touches[0].previous.has, false);
  assert.equal(down.touches[0].previous.state, TouchLocationState.Invalid);
  // The frame after the press, with no new event, is Moved at the same place: the finger is still
  // down. That is XNA's semantics and it is what distinguishes a state machine from an event log.
  assert.equal(observations.down[1].touches[0].state, TouchLocationState.Moved);
  assert.equal(observations.down[1].touches[0].previous.has, true);
  assert.equal(observations.down[1].touches[0].previous.state, TouchLocationState.Pressed);

  // Move, with the same identifier: an id that changed would mean a game could not track a drag.
  const moved = observations.moved[0];
  assert.equal(moved.touches[0].id, 1, "the identifier survives the move");
  assert.equal(moved.touches[0].state, TouchLocationState.Moved);
  closeTo(moved.touches[0].x, 90, 1.5, "move X");
  closeTo(moved.touches[0].y, 120, 1.5, "move Y");
  // The previous location is where the finger was, not where it is: this is the assertion a
  // backend that reported the current position twice would fail.
  assert.equal(moved.touches[0].previous.has, true);
  closeTo(moved.touches[0].previous.x, 40, 1.5, "previous X is the press position");
  closeTo(moved.touches[0].previous.y, 50, 1.5, "previous Y is the press position");
  assert.ok(
    moved.touches[0].x > moved.touches[0].previous.x &&
    moved.touches[0].y > moved.touches[0].previous.y,
    "the finger moved down and to the right, and the collection must show it",
  );

  // Two fingers, distinct identifiers, both reported.
  const twoDown = observations.twoDown[0];
  assert.equal(twoDown.count, 2);
  assert.deepEqual(twoDown.touches.map((touch) => touch.id).sort(), [1, 2]);
  assert.deepEqual(twoDown.enumeratedIds, twoDown.touches.map((touch) => touch.id),
    "the XNA enumerator visits the same identifiers in the same order as the indexer");
  const second = twoDown.touches.find((touch) => touch.id === 2);
  assert.equal(second.state, TouchLocationState.Pressed, "the new finger is Pressed, not Moved");
  closeTo(second.x, 200, 1.5, "second finger X");
  closeTo(second.y, 30, 1.5, "second finger Y");

  // Lifting one finger leaves the other, and the lifted one is reported Released once.
  const oneLifted = observations.oneLifted[0];
  const lifted = oneLifted.touches.find((touch) => touch.id === 1);
  assert.ok(lifted, "the lifted finger is reported for exactly one frame");
  assert.equal(lifted.state, TouchLocationState.Released);
  assert.ok(oneLifted.touches.some((touch) => touch.id === 2 && touch.state === TouchLocationState.Moved),
    "the finger still down stays down");

  // And after everything is lifted the collection empties and stays empty.
  const last = observations.allLifted[observations.allLifted.length - 1];
  assert.equal(last.count, 0);
  assert.deepEqual(last.touches, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("the input harness game disposes deterministically", { skip }, async () => {
  for (const scenario of [noGamepadScenario, gamepadScenario, touchScenario]) {
    const { disposed, ready } = await scenario();
    assert.equal(disposed, true);
    assert.equal(ready.backend, "wasm");
    assert.match(ready.abiVersion, /^0\.21\./);
  }
});
