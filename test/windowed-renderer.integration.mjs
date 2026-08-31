#!/usr/bin/env node

/**
 * The same public XNA API on a **windowed, GPU-backed** CNA renderer.
 *
 * Everything else this package qualifies on Node runs against a HEADLESS renderer, which is honest
 * but leaves a real question open: does the binding's drawing path produce pixels, or only reach
 * routes that return success? This answers it by clearing a render target to an exact colour and
 * reading every texel back — the same evidence the browser slice produces on WebGL2, on the desktop
 * this time.
 *
 * It is opt-in and skips with a reason, because it needs three things the default qualification
 * does not: a CNA library built with a windowed renderer (`CNA_WINDOWED_LIBRARY`), a display for it
 * to open a window on, and a bridge built against the same ABI. Run it under `xvfb-run` on a host
 * with no screen.
 *
 * ```sh
 * CNA_WINDOWED_LIBRARY=/path/to/libcna_c_api.so CNA_NODE_BRIDGE=build/cna_node_bridge.node \
 *   xvfb-run -a node --test test/windowed-renderer.integration.mjs
 * ```
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import {
  Color,
  Game,
  Graphics,
  GraphicsDeviceManager,
  LoadNodeNativeBackend,
  Vector2,
} from "../dist/index.js";
import * as extensionsModule from "../dist/extensions/index.js";

const library = process.env.CNA_WINDOWED_LIBRARY;
const display = process.env.DISPLAY;
const skip = library
  ? (display ? false : "no DISPLAY; run this under xvfb-run or on a session with a screen")
  : "set CNA_WINDOWED_LIBRARY to a CNA library built with a windowed renderer";

const storageHome = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-windowed-"));
after(() => fs.rmSync(storageHome, { recursive: true, force: true }));
process.env.XDG_DATA_HOME = storageHome;

if (!skip) {
  await LoadNodeNativeBackend({
    CnaLibrary: path.resolve(library),
    BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
  });
}

/** The exact colour the render target is cleared to; every channel distinct, none of them 0 or 255. */
const CLEAR = new Color(12, 34, 56, 255);

class WindowedProbeGame extends Game {
  constructor(frames) {
    super();
    this.graphics = new GraphicsDeviceManager(this);
    this.graphics.PreferredBackBufferWidth = 320;
    this.graphics.PreferredBackBufferHeight = 240;
    this.frameTarget = frames;
    this.frames = 0;
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const device = this.GraphicsDevice;
    this.spriteBatch = new Graphics.SpriteBatch(device);
    this.texture = new Graphics.Texture2D(device, 2, 2);
    this.texture.SetData([Color.Red, Color.Green, Color.Blue, Color.White]);

    const renderer = extensionsModule.GetRendererInfo();
    this.evidence.renderer = {
      name: renderer.Name,
      type: renderer.RendererType,
      maxTextureDimension: renderer.MaxTextureDimension,
      capabilityFlags: renderer.CapabilityFlags.toString(16),
    };

    // The whole reason this file exists: an off-screen target, cleared through the public API and
    // read back texel by texel. On HEADLESS this cannot be asked; on a real renderer it is the
    // difference between "the route returned success" and "the GPU produced these pixels".
    const target = new Graphics.RenderTarget2D(device, 4, 4);
    try {
      device.SetRenderTarget(target);
      this.evidence.boundCount = device.GetRenderTargets().length;
      device.Clear(CLEAR);
      device.SetRenderTarget(null);
      this.evidence.unboundCount = device.GetRenderTargets().length;
      const readback = new Array(16);
      target.GetData(readback);
      this.evidence.targetPixels = readback.map((color) => color.PackedValue);
      this.evidence.targetInfo = {
        width: target.Width,
        height: target.Height,
        isContentLost: target.IsContentLost,
      };
    } finally {
      target.Dispose();
    }

    // The window, which HEADLESS has none of. Title and client bounds are real state here, so a
    // write followed by a read is evidence rather than a round trip through this package.
    const window = this.Window;
    const record = (name, body) => {
      try {
        this.evidence[name] = body();
      } catch (error) {
        this.evidence[name] = `${error.constructor.name}: ${(error.message ?? "").slice(0, 70)}`;
      }
    };
    record("windowTitleRoundTrip", () => {
      const original = window.Title;
      window.Title = "cna-ts windowed qualification";
      const written = window.Title;
      window.Title = original;
      return { written, restored: window.Title === original };
    });
    record("windowBounds", () => {
      const bounds = window.ClientBounds;
      return { width: bounds.Width, height: bounds.Height };
    });
    record("windowHandleIsBigInt", () => typeof window.Handle === "bigint");
    record("windowScreenDeviceName", () => window.ScreenDeviceName);
    record("windowAllowUserResizing", () => {
      const original = window.AllowUserResizing;
      window.AllowUserResizing = !original;
      const flipped = window.AllowUserResizing;
      window.AllowUserResizing = original;
      return { original, flipped, restored: window.AllowUserResizing === original };
    });
    record("windowOrientation", () => window.CurrentOrientation);

    // The graphics adapter, which needs a live device and therefore a callback like this one.
    record("adapter", () => {
      const adapter = Graphics.GraphicsAdapter.DefaultAdapter;
      const mode = adapter.CurrentDisplayMode;
      return {
        count: Graphics.GraphicsAdapter.Adapters.length,
        description: adapter.Description,
        deviceName: adapter.DeviceName,
        modeWidth: mode.Width,
        modeHeight: mode.Height,
        modeFormat: mode.Format,
        supportedModes: [...adapter.SupportedDisplayModes].length,
        reach: adapter.IsProfileSupported(Graphics.GraphicsProfile.Reach),
        hiDef: adapter.IsProfileSupported(Graphics.GraphicsProfile.HiDef),
        isDeviceAdapter: device.Adapter === adapter,
      };
    });

    // A stock effect on a renderer that has real shaders. HEADLESS constructs one and refuses to
    // execute it, so this is a branch the default qualification cannot reach.
    const basic = new Graphics.BasicEffect(device);
    try {
      basic.VertexColorEnabled = true;
      const pass = basic.CurrentTechnique.Passes.Get(0);
      try {
        pass.Apply();
        this.evidence.stockEffectApply = "SUCCESS";
      } catch (error) {
        this.evidence.stockEffectApply = `result ${error.cnaResult}`;
      }
    } finally {
      basic.Dispose();
    }
    super.LoadContent();
  }

  Draw(gameTime) {
    this.GraphicsDevice.Clear(Color.CornflowerBlue);
    this.spriteBatch.Begin();
    this.spriteBatch.Draw(this.texture, new Vector2(16, 16), Color.White);
    this.spriteBatch.End();
    this.frames += 1;
    if (this.frames >= this.frameTarget) this.Exit();
    super.Draw(gameTime);
  }

  UnloadContent() {
    this.spriteBatch?.Dispose();
    this.texture?.Dispose();
    super.UnloadContent();
  }
}

/**
 * Renderers whose render-target readback is currently broken upstream, and the exact symptom.
 *
 * `docs/upstream-cna-findings.md` item 7: OPENGLES3 answers every render-target readback with
 * zeros, while an ordinary texture readback on the same device is correct and while SDL_RENDERER
 * and SOFTWARE produce the exact texels. Listing it here rather than skipping the assertion means
 * **the defect is asserted**: when CNA repairs it, this file fails and says so, which is the only
 * way a recorded defect stops being silently permanent.
 */
const READBACK_DEFECTIVE = new Set(["OPENGLES3"]);

test("a windowed CNA renderer produces the exact pixels the public API asked for", { skip }, async () => {
  const game = new WindowedProbeGame(60);
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // The renderer is a real one, and it says so itself rather than being labelled here.
  assert.notEqual(evidence.renderer.name, "HEADLESS", "this file is for a windowed renderer");
  assert.ok(evidence.renderer.maxTextureDimension >= 2048, "a real GPU reports a real texture limit");

  assert.equal(evidence.boundCount, 1);
  assert.equal(evidence.unboundCount, 0);
  assert.deepEqual([evidence.targetInfo.width, evidence.targetInfo.height], [4, 4]);
  assert.equal(evidence.targetInfo.isContentLost, false);

  const expected = CLEAR.PackedValue;
  assert.equal(evidence.targetPixels.length, 16);
  let readback;
  if (READBACK_DEFECTIVE.has(evidence.renderer.name)) {
    // Asserted, not skipped. Every texel is zero -- not merely "not the expected colour" -- which
    // is the shape of a read from an unbound framebuffer rather than of a wrong clear.
    assert.deepEqual(
      evidence.targetPixels, new Array(16).fill(0),
      `${evidence.renderer.name} is recorded as returning zeros; a different answer means the ` +
      "upstream defect changed and docs/upstream-cna-findings.md item 7 needs re-measuring",
    );
    readback = "DEFECTIVE_ZEROS";
  } else {
    // Sixteen texels, each exactly the colour Clear was given. This is the assertion that
    // separates a drawing path from a dispatch path.
    assert.deepEqual(evidence.targetPixels, new Array(16).fill(expected));
    readback = "EXACT";
  }

  assert.equal(game.frames, 60);
  console.log(
    `CNA_TS_WINDOWED_RENDERER=PASS RENDERER=${evidence.renderer.name} ` +
    `MAX_TEXTURE=${evidence.renderer.maxTextureDimension} ` +
    `CAPABILITY_FLAGS=0x${evidence.renderer.capabilityFlags} ` +
    `RENDER_TARGET_READBACK=${readback} STOCK_EFFECT_APPLY=${evidence.stockEffectApply}`,
  );
});

test("a windowed CNA renderer reports a real graphics adapter", { skip }, async () => {
  const game = new WindowedProbeGame(2);
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // GraphicsAdapter needs a live device, so a windowed renderer is where it can be asked for real.
  const adapter = evidence.adapter;
  assert.equal(typeof adapter, "object", `adapter read failed: ${adapter}`);
  assert.ok(adapter.count >= 1, "a windowed renderer reports at least one adapter");
  assert.equal(typeof adapter.description, "string");
  assert.ok(adapter.description.length > 0);
  assert.equal(typeof adapter.deviceName, "string");
  assert.ok(adapter.modeWidth > 0 && adapter.modeHeight > 0);
  assert.equal(adapter.modeFormat, Graphics.SurfaceFormat.Color);
  assert.ok(adapter.supportedModes >= 1);
  assert.equal(typeof adapter.reach, "boolean");
  assert.equal(typeof adapter.hiDef, "boolean");
  if (adapter.hiDef) assert.equal(adapter.reach, true, "HiDef implies Reach");
  assert.equal(adapter.isDeviceAdapter, true, "the device's adapter is the default one");
  console.log(
    `CNA_TS_WINDOWED_ADAPTER=PASS RENDERER=${evidence.renderer.name} ` +
    `ADAPTERS=${adapter.count} MODE=${adapter.modeWidth}x${adapter.modeHeight} ` +
    `MODES=${adapter.supportedModes} REACH=${adapter.reach} HIDEF=${adapter.hiDef}`,
  );
});

test("a windowed CNA GameWindow reports and accepts real state", { skip }, async () => {
  const game = new WindowedProbeGame(2);
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // The title is the clearest write-then-read on a window: HEADLESS has none, so this branch is
  // unreachable in the default qualification.
  const title = evidence.windowTitleRoundTrip;
  assert.equal(typeof title, "object", `window title failed: ${title}`);
  assert.equal(title.written, "cna-ts windowed qualification", "the title CNA reports is the one set");
  assert.equal(title.restored, true, "and it can be put back");

  const bounds = evidence.windowBounds;
  assert.equal(typeof bounds, "object", `client bounds failed: ${bounds}`);
  // Measured rather than assumed, because the renderers disagree and both answers are honest.
  // OPENGLES3 and SDL_RENDERER report the 320x240 the manager asked for; SOFTWARE reports 0x0,
  // because it presents through a surface rather than a sized client area. So what is asserted is:
  // the numbers are non-negative, and *where a renderer reports a client area at all* it is the one
  // the GraphicsDeviceManager requested -- which is the part that would break if the request never
  // reached the window.
  assert.ok(Number.isInteger(bounds.width) && bounds.width >= 0, `bad width ${bounds.width}`);
  assert.ok(Number.isInteger(bounds.height) && bounds.height >= 0, `bad height ${bounds.height}`);
  if (bounds.width > 0) {
    assert.deepEqual(
      [bounds.width, bounds.height], [320, 240],
      "a renderer that reports a client area must report the requested one",
    );
  }

  assert.equal(evidence.windowHandleIsBigInt, true, "a native window handle stays a bigint");
  assert.equal(typeof evidence.windowScreenDeviceName, "string");
  assert.equal(typeof evidence.windowOrientation, "number");

  // AllowUserResizing is a real platform flag on a windowed renderer. Whether the platform accepts
  // the flip is its business; what is asserted is that the value is read back rather than
  // remembered here, and that the original is restored either way.
  const resizing = evidence.windowAllowUserResizing;
  assert.equal(typeof resizing, "object", `resizing failed: ${resizing}`);
  assert.equal(typeof resizing.original, "boolean");
  assert.equal(typeof resizing.flipped, "boolean");
  assert.equal(resizing.restored, true);
  console.log(
    `CNA_TS_WINDOWED_WINDOW=PASS RENDERER=${evidence.renderer.name} ` +
    `CLIENT=${bounds.width}x${bounds.height} SCREEN=${evidence.windowScreenDeviceName} ` +
    `RESIZING_FLIPPED=${resizing.original !== resizing.flipped}`,
  );
});

test("a windowed CNA renderer runs 600 frames without drift", { skip }, async () => {
  const game = new WindowedProbeGame(600);
  await game.Run();
  const frames = game.frames;
  const effect = game.evidence.stockEffectApply;
  game.Dispose();
  assert.equal(frames, 600);
  // A stock effect either applies for real here or names the result it refused with. Both are
  // recorded; neither is assumed.
  assert.ok(
    effect === "SUCCESS" || /^result \d+$/.test(effect),
    `unexpected stock-effect evidence ${effect}`,
  );
});
