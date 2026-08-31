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
  BoundingBox,
  Color,
  Game,
  Graphics,
  GraphicsDeviceManager,
  LoadNodeNativeBackend,
  Matrix,
  Vector2,
  Vector3,
} from "../dist/index.js";

/** A Matrix as the sixteen numbers a projection needs, in the order XNA names them. */
function matrixRow(matrix) {
  return [
    matrix.M11, matrix.M12, matrix.M13, matrix.M14,
    matrix.M21, matrix.M22, matrix.M23, matrix.M24,
    matrix.M31, matrix.M32, matrix.M33, matrix.M34,
    matrix.M41, matrix.M42, matrix.M43, matrix.M44,
  ];
}
import * as extensionsModule from "../dist/extensions/index.js";
import * as computeModule from "../dist/extensions/graphics/index.js";

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
    const record = (name, body) => {
      try {
        this.evidence[name] = body();
      } catch (error) {
        this.evidence[name] = `${error.constructor.name}: ${(error.message ?? "").slice(0, 70)}`;
      }
    };

    // --- the engine layer's compute path ------------------------------------------------------
    //
    // The strongest evidence this file can produce: a shader that computes a different value for
    // every element of a GPU buffer, from the element's own initial value, from two uniforms and
    // from its invocation index. Every one of those four inputs is separately load-bearing, so a
    // dispatch that silently did nothing, ignored a uniform, ignored the index, or overwrote every
    // element with one value all fail here rather than round-tripping.
    record("compute", () => {
      const {
        ComputeShader, GpuTimer, GraphicsCapability, GraphicsDeviceCapabilities,
        GraphicsMemoryBarrier, StorageBuffer,
      } = computeModule;

      const supported = GraphicsDeviceCapabilities.Supports(
        device, GraphicsCapability.ComputeShaders,
      );
      // Every capability, paired with its bit index, so the test can check each answer against the
      // renderer's own capability bitmask -- a different CNA route entirely. That is what shows the
      // argument reaching CNA, without this file having to guess which capabilities a given
      // renderer happens to have.
      const capabilities = Object.entries(GraphicsCapability)
        .filter(([, bit]) => typeof bit === "number")
        .map(([name, bit]) => [name, bit, GraphicsDeviceCapabilities.Supports(device, bit)]);
      const result = { supported, capabilities };
      if (!supported) return result;

      result.limits = {
        countX: GraphicsDeviceCapabilities.MaxComputeWorkGroupCount(device, 0),
        sizeX: GraphicsDeviceCapabilities.MaxComputeWorkGroupSize(device, 0),
        sizeZ: GraphicsDeviceCapabilities.MaxComputeWorkGroupSize(device, 2),
        invocations: GraphicsDeviceCapabilities.MaxComputeWorkGroupInvocations(device),
      };

      // 64 floats, each element a different value, so nothing below can pass by coincidence.
      const COUNT = 64;
      const seed = Float32Array.from({ length: COUNT }, (_, i) => i + 1);
      const buffer = StorageBuffer.CreateTyped(device, COUNT, 4);
      try {
        result.shape = {
          byteSize: buffer.ByteSize,
          elementCount: buffer.ElementCount,
          elementByteSize: buffer.ElementByteSize,
        };

        // Upload and read straight back, before any shader runs: this separates "the buffer holds
        // what was written" from "the dispatch changed it".
        buffer.SetElements(seed, 4);
        result.uploaded = [...buffer.GetFloats(COUNT)];

        // A buffer that declared four-byte elements refuses an eight-byte read.
        try {
          buffer.GetElements(COUNT, 8);
          result.mismatch = "ACCEPTED";
        } catch (error) {
          result.mismatch = `result ${error.cnaResult}`;
        }

        const shader = new ComputeShader(device, [
          "#version 310 es",
          "layout(local_size_x = 16) in;",
          "layout(std430, binding = 0) buffer Values { float values[]; };",
          "uniform int uOffset;",
          "uniform float uScale;",
          "void main() {",
          "  uint i = gl_GlobalInvocationID.x;",
          "  values[i] = values[i] * uScale + float(uOffset) + float(i);",
          "}",
        ].join("\n"));
        try {
          result.shaderValid = shader.IsValid;
          result.compileError = shader.CompileError;
          result.imageBinding = shader.IsImageBindingSupported;

          const run = (scale, offset, groups) => {
            buffer.SetElements(seed, 4);
            shader.BindStorageBuffer(0, buffer);
            shader.SetUniform("uOffset", offset);
            shader.SetUniform("uScale", scale, true);
            shader.Dispatch(groups);
            shader.Barrier(GraphicsMemoryBarrier.All);
            return [...buffer.GetFloats(COUNT)];
          };

          // 16 threads per group x 4 groups = all 64 elements.
          result.computed = run(3, 7, 4);
          // Different uniforms, so the same input must produce a different output.
          result.recomputed = run(0.5, -2, 4);
          // Half the groups, so exactly the first 32 elements may change: this is what proves the
          // dispatch count reaches the GPU rather than being ignored.
          result.halfDispatch = run(3, 7, 2);
        } finally {
          shader.Dispose();
        }

        // A shader that cannot compile. CNA's header documents a successful create with an
        // inspectable log; what it does today is refuse. Recorded either way, never assumed.
        try {
          const broken = new ComputeShader(device, "#version 310 es\nvoid main() { nonsense }\n");
          result.brokenShader = { created: true, valid: broken.IsValid, log: broken.CompileError };
          broken.Dispose();
        } catch (error) {
          result.brokenShader = { created: false, cnaResult: error.cnaResult };
        }
      } finally {
        buffer.Dispose();
      }
      result.disposedBufferRefuses = (() => {
        const gone = StorageBuffer.CreateTyped(device, 4, 4);
        gone.Dispose();
        try {
          gone.ByteSize;
          return false;
        } catch {
          return true;
        }
      })();

      // The work-group limits above were read on a device nothing had drawn on yet, because that
      // is the only time OPENGLES3 answers them at all. Measured here rather than worked around:
      // the first draw zeroes every one of them for the rest of the device's life, while the
      // capability query keeps reporting compute support and dispatches keep computing exactly.
      // See docs/upstream-cna-findings.md.
      device.Clear(CLEAR);
      result.afterDraw = {
        countX: GraphicsDeviceCapabilities.MaxComputeWorkGroupCount(device, 0),
        sizeX: GraphicsDeviceCapabilities.MaxComputeWorkGroupSize(device, 0),
        invocations: GraphicsDeviceCapabilities.MaxComputeWorkGroupInvocations(device),
        stillSupported: GraphicsDeviceCapabilities.Supports(
          device, GraphicsCapability.ComputeShaders,
        ),
      };

      // A GPU timer measures work the GPU has actually finished, so it cannot be read in the same
      // callback that submits it. This one is kept alive and driven from Draw below, across real
      // frames, which is the only way to get a measurement rather than a "not ready yet".
      const timer = new GpuTimer(device);
      result.timer = { supported: timer.IsSupported, reason: timer.UnsupportedReason };
      if (result.timer.supported) {
        result.timer.openBeforeAnyFrame = timer.IsOpen;
        this.gpuTimer = timer;
      } else {
        timer.Dispose();
      }
      return result;
    });

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

    // --- the engine layer's shadow depth pass -------------------------------------------------
    //
    // A real depth pass, read back texel by texel. The scene is one axis-aligned quad, placed
    // asymmetrically in both x and z and at a known height, so where its shadow lands and how deep
    // it is are both predictions the test can compute from CNA's own reported light transform --
    // not numbers copied out of a previous run.
    record("shadow", () => {
      const {
        IsGraphicsExtensionLayerAvailable, ShadowMap, ShadowMapMath, ShadowQuality,
        GraphicsDeviceCapabilities,
      } = computeModule;
      // Two of the three windowed renderers here are built with the engine layer compiled out, and
      // then there is no shadow map to create at all. That is a different boundary from a renderer
      // that has one it cannot cast with, and the test checks it against a second route rather
      // than taking the refusal's word for it.
      let map;
      try {
        map = new ShadowMap(device, ShadowQuality.Low);
      } catch (error) {
        return {
          layerAbsent: true,
          cnaResult: error.cnaResult,
          extensionLayer: IsGraphicsExtensionLayerAvailable(),
        };
      }
      try {
        const result = {
          supported: map.IsSupported,
          // Casting and sampling are separate CNA capabilities; a frame that draws shadows needs
          // both, so both are recorded rather than one standing in for the other.
          sampling: GraphicsDeviceCapabilities.SupportsShadowSampling(device),
          size: map.Size,
        };
        if (!result.supported) return result;

        const light = {
          Direction: new Vector3(0, -1, 0), Color: new Vector3(1, 1, 1), Intensity: 1,
        };
        // Asymmetric on all three axes, so the light transform has real translation terms and a
        // pass that quietly ignored the scene bounds cannot land on the same matrix anyway.
        const bounds = new BoundingBox(new Vector3(-10, -4, -6), new Vector3(6, 12, 14));
        // The same light and the same bounds through CNA's two *pure* shadow-maths routes, which
        // take them as plain values and touch no shadow map at all. The test multiplies these
        // itself and checks the pass agrees.
        const view = ShadowMapMath.ComputeLightView(light, bounds);
        result.math = {
          view: matrixRow(view),
          projection: matrixRow(ShadowMapMath.ComputeLightProjection(view, bounds)),
        };
        // The occluder: x in [-8,-2] and z in [-8,2]. Different extents on the two axes and
        // off-centre on both, so a transform that swapped or mirrored an axis moves it.
        // Well inside the scene box on every axis, at two heights that are also inside it.
        const QUAD = { X0: -8, X1: -2, Z0: -4, Z1: 6, High: 8, Low: 0 };
        const white = new Color(255, 255, 255, 255);
        const quadAt = (y) => {
          const at = (x, z) => new Graphics.VertexPositionColor(new Vector3(x, y, z), white);
          return [
            at(QUAD.X0, QUAD.Z0), at(QUAD.X1, QUAD.Z0), at(QUAD.X1, QUAD.Z1),
            at(QUAD.X0, QUAD.Z0), at(QUAD.X1, QUAD.Z1), at(QUAD.X0, QUAD.Z1),
          ];
        };

        const texture = map.ShadowTexture;
        result.texture = {
          width: texture.Width, height: texture.Height, format: texture.Format,
          cached: map.ShadowTexture === texture,
        };
        const texels = new Float32Array(texture.Width * texture.Height);
        const survey = () => {
          texture.GetData(texels);
          let low = Infinity, high = -Infinity, occluded = 0;
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (let index = 0; index < texels.length; index += 1) {
            const depth = texels[index];
            if (depth < low) low = depth;
            if (depth > high) high = depth;
            // 1.0 is the far plane the pass cleared to; anything nearer is a caster.
            if (depth < 1) {
              occluded += 1;
              const x = index % texture.Width, y = Math.floor(index / texture.Width);
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
          return { low, high, occluded, minX, maxX, minY, maxY };
        };

        // 1. An empty pass clears the whole map to the far plane.
        map.Begin(light, bounds);
        result.lightViewProjection = matrixRow(map.LightViewProjection);
        map.End();
        result.cleared = survey();

        // 2. The occluder at two heights. The light points straight down, so the higher quad must
        //    record the smaller depth, and both must cover exactly the same texels.
        const castAt = (y) => {
          map.Begin(light, bounds);
          map.ApplyCaster();
          device.DrawUserPrimitives(
            Graphics.PrimitiveType.TriangleList, quadAt(y), 0, 2,
          );
          map.End();
          return survey();
        };
        result.quad = QUAD;
        result.high = castAt(QUAD.High);
        result.low = castAt(QUAD.Low);

        // 3. The same draw outside the pass must not reach the map at all: End has to have
        //    unbound it. Cleared first so a stale earlier result cannot pass for one.
        map.Begin(light, bounds);
        map.End();
        device.DrawUserPrimitives(Graphics.PrimitiveType.TriangleList, quadAt(QUAD.High), 0, 2);
        result.outsidePass = survey();

        // 4. The caster effects, which CNA lends rather than gives.
        //
        // They are told apart by what they rasterise, not by their handles: the rigid program
        // reads only a position, while the skinned one wants bone indices and weights that these
        // vertices do not carry, so applying it to the same rigid geometry writes nothing at all.
        const caster = map.CasterEffect;
        const drawUnder = (effect) => {
          map.Begin(light, bounds);
          effect.CurrentTechnique.Passes.Get(0).Apply();
          device.DrawUserPrimitives(
            Graphics.PrimitiveType.TriangleList, quadAt(QUAD.High), 0, 2,
          );
          map.End();
          return survey().occluded;
        };
        result.effects = {
          casterCached: map.CasterEffect === caster,
          techniques: [caster.CurrentTechnique.Name, map.SkinnedCasterEffect.CurrentTechnique.Name],
          rigidDraws: drawUnder(caster),
          skinnedDraws: drawUnder(map.SkinnedCasterEffect),
        };

        // 5. Pass ordering, refused by CNA rather than by this binding.
        const refusal = (body) => {
          try {
            body();
            return "ACCEPTED";
          } catch (error) {
            return `${error.cnaResult}: ${(error.message ?? "").split(": ").pop()}`;
          }
        };
        result.ordering = {
          endWithoutBegin: refusal(() => map.End()),
          applyOutsidePass: refusal(() => map.ApplyCaster()),
          skinnedOutsidePass: refusal(() => map.ApplySkinnedCaster([Matrix.Identity], 4)),
        };
        map.Begin(light, bounds);
        result.ordering.beginTwice = refusal(() => map.Begin(light, bounds));
        result.ordering.emptyPalette = refusal(() => map.ApplySkinnedCaster([], 4));
        result.ordering.skinnedInsidePass =
          refusal(() => map.ApplySkinnedCaster([Matrix.Identity], 4));
        map.End();
        return result;
      } finally {
        map.Dispose();
      }
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
    // The GPU timer wraps one real frame's drawing and is then polled on every later frame, which
    // is how a non-blocking timer query is meant to be used: the result becomes available some
    // frames after the work was submitted.
    const timing = this.evidence.compute?.timer;
    const timer = this.gpuTimer;
    const measuring = timer != null && this.frames === 0;
    if (measuring) timer.Begin();

    this.GraphicsDevice.Clear(Color.CornflowerBlue);
    this.spriteBatch.Begin();
    this.spriteBatch.Draw(this.texture, new Vector2(16, 16), Color.White);
    this.spriteBatch.End();

    if (measuring) {
      timer.End();
      timing.openInsideFrame = true;
      timing.openAfterEnd = timer.IsOpen;
    }
    if (timer != null && this.frames >= 1 && !timing.collected) {
      if (timer.Poll()) {
        timing.collected = true;
        timing.collectedOnFrame = this.frames;
        timing.samples = timer.SampleCount;
        timing.milliseconds = timer.LastMilliseconds;
      }
    }

    this.frames += 1;
    if (this.frames >= this.frameTarget) this.Exit();
    super.Draw(gameTime);
  }

  UnloadContent() {
    this.spriteBatch?.Dispose();
    this.texture?.Dispose();
    this.gpuTimer?.Dispose();
    super.UnloadContent();
  }
}

/*
 * Every renderer here reads a render target back correctly.
 *
 * That was not true earlier: `docs/upstream-cna-findings.md` item 7 recorded OPENGLES3 answering
 * every render-target readback with zeros, and this file asserted those zeros rather than skipping
 * the check -- which is what made the repair visible the moment it landed. CNA fixed it in
 * 48ab0de7f, "separate frame context handoff from operation leases", and the assertion below is
 * now the ordinary one again.
 */

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
  // Sixteen texels, each exactly the colour Clear was given. This is the assertion that separates
  // a drawing path from a dispatch path, and it now holds on every renderer this file runs on.
  assert.deepEqual(
    evidence.targetPixels, new Array(16).fill(expected),
    `${evidence.renderer.name} did not read its render target back exactly`,
  );
  const readback = "EXACT";

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

test("a windowed CNA renderer computes exact results on the GPU", { skip }, async () => {
  // Enough frames for a non-blocking GPU timer query to resolve; the compute work itself is done
  // in LoadContent.
  const game = new WindowedProbeGame(30);
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  const compute = evidence.compute;
  assert.equal(typeof compute, "object", `compute probe failed: ${compute}`);
  assert.equal(typeof compute.supported, "boolean");
  // The capability query answers per capability rather than returning one constant. Every windowed
  // renderer here draws in 3D, and none of the three implements wire frame, so the two together
  // show the argument reaching CNA.
  assert.equal(compute.capabilities.length, 19, "every GraphicsCapability is asked");
  // Each per-capability answer must equal the matching bit of the renderer's own capability
  // bitmask, which reaches this test through a different CNA route (GetRendererInfo). Nineteen
  // independent agreements: a query that answered one constant for every argument, or that read
  // the wrong capability for an index, disagrees with the mask on any renderer whose bits are not
  // all alike.
  const mask = BigInt(`0x${evidence.renderer.capabilityFlags}`);
  for (const [name, bit, answered] of compute.capabilities) {
    assert.equal(
      answered, ((mask >> BigInt(bit)) & 1n) === 1n,
      `${name} (bit ${bit}) disagrees with the renderer's own capability mask`,
    );
  }
  assert.equal(
    compute.capabilities.find(([name]) => name === "ComputeShaders")?.[2], compute.supported,
    "the enum member and the query must name the same capability",
  );
  // How much discrimination that actually buys depends on the renderer, and the weakest case is
  // still checked: OPENGLES3 sets all nineteen bits, SOFTWARE sets eight of them (0x1af7) and
  // SDL_RENDERER exactly one (0x1000, additive blending only). On the latter two a query that
  // answered one constant, or that read a neighbouring capability, disagrees immediately.
  assert.equal(
    compute.capabilities.filter(([, , answered]) => answered).length,
    [...mask.toString(2)].filter((bit) => bit === "1").length,
    "as many capabilities answer true as the renderer's mask has bits set",
  );

  if (!compute.supported) {
    // An honest boundary, not a skip: this renderer says it cannot compute, and nothing below is
    // claimed of it.
    console.log(
      `CNA_TS_WINDOWED_COMPUTE=NOT_SUPPORTED_RENDERER RENDERER=${evidence.renderer.name}`,
    );
    return;
  }

  // Limits a renderer that computes must be able to state.
  assert.ok(compute.limits.countX > 0 && compute.limits.sizeX > 0);
  assert.ok(compute.limits.invocations >= 16, "a compute renderer takes at least one 16-wide group");
  assert.ok(
    compute.limits.sizeX >= compute.limits.sizeZ,
    "the per-axis limits are read per axis, not one value repeated",
  );

  // The limits survive a draw. They did not once: `docs/upstream-cna-findings.md` item 9 recorded
  // all three going to zero at the first Clear and never coming back, while the capability query
  // kept reporting compute support -- a contradiction CNA's own
  // ComputeTest.TheCapabilityAndTheLimitsAgreeWithEachOther checks for and missed, because its
  // fixture never draws first. This file asserted the zeros rather than working around them, and
  // that is what made the repair visible; it landed in 48ab0de7f with the readback fix. What is
  // asserted now is the agreement itself, on both sides of a draw.
  assert.deepEqual(
    [compute.afterDraw.countX, compute.afterDraw.sizeX, compute.afterDraw.invocations],
    [compute.limits.countX, compute.limits.sizeX, compute.limits.invocations],
    "the work-group limits must not change because something drew",
  );
  assert.equal(
    compute.afterDraw.stillSupported, true,
    "and the capability query still agrees with them",
  );

  // The buffer's declared shape, read back from CNA rather than remembered here.
  assert.deepEqual(
    [compute.shape.elementCount, compute.shape.elementByteSize, compute.shape.byteSize],
    [64, 4, 256],
  );
  // A typed buffer refuses a transfer whose element size disagrees with its own.
  assert.equal(compute.mismatch, "result 1", "an element-size mismatch is INVALID_ARGUMENT");

  const seed = Array.from({ length: 64 }, (_, i) => i + 1);
  // Before any shader ran, the buffer holds exactly what was uploaded. This is what makes the next
  // assertion evidence about the *dispatch* rather than about the upload.
  assert.deepEqual(compute.uploaded, seed);

  assert.equal(compute.shaderValid, true, `the shader did not compile: ${compute.compileError}`);
  assert.equal(compute.compileError, "", "a shader that compiled has an empty log");

  // values[i] = values[i] * uScale + uOffset + i, with values[i] seeded to i + 1.
  //
  // Every element is a different number, and it depends on the element's own seed, on both
  // uniforms and on the invocation index. A dispatch that did nothing leaves the seed; one that
  // ignored uScale or uOffset produces a different sequence; one that ignored the index produces a
  // constant. All four failures are distinguishable here.
  assert.deepEqual(
    compute.computed, Array.from({ length: 64 }, (_, i) => 4 * i + 10),
    "the GPU must compute (i + 1) * 3 + 7 + i for every element",
  );
  assert.notDeepEqual(compute.computed, seed, "a dispatch that did nothing would leave the seed");

  // The same shader and the same seed with different uniforms must produce a different answer, or
  // the uniforms never reached the program.
  assert.deepEqual(
    compute.recomputed, Array.from({ length: 64 }, (_, i) => 1.5 * i - 1.5),
    "the GPU must compute (i + 1) * 0.5 - 2 + i for every element",
  );

  // Half the work groups: exactly the first 32 elements are computed and the last 32 keep their
  // seed. This is the assertion a dispatch count that never reached the GPU cannot survive.
  assert.deepEqual(
    compute.halfDispatch,
    [...Array.from({ length: 32 }, (_, i) => 4 * i + 10), ...seed.slice(32)],
    "two 16-wide groups must touch exactly 32 elements",
  );

  assert.equal(typeof compute.imageBinding, "boolean");
  assert.equal(compute.disposedBufferRefuses, true, "a disposed buffer refuses by name");

  // A shader that cannot compile. `engine_layer.h` documents a successful create whose log is then
  // readable; CNA refuses the create instead. Asserted as it is, so the day it changes this file
  // says so -- see docs/upstream-cna-findings.md.
  assert.equal(
    compute.brokenShader.created, false,
    "CNA now creates a handle for a shader that does not compile; upstream finding 8 is fixed and " +
    "ComputeShader.IsValid/CompileError can be exercised directly",
  );
  assert.equal(compute.brokenShader.cnaResult, 12, "the exception barrier reports INTERNAL");

  // A GPU timer on a renderer that has one, driven across real frames.
  const timer = compute.timer;
  assert.equal(typeof timer.supported, "boolean");
  if (!timer.supported) {
    assert.ok(timer.reason.length > 0, "an unsupported timer says why it cannot measure");
  } else {
    assert.equal(timer.reason, "", "a supported timer has nothing to explain");
    assert.equal(timer.openBeforeAnyFrame, false, "a fresh timer has no measurement open");
    assert.equal(timer.openInsideFrame, true, "the timer wrapped a real frame's drawing");
    assert.equal(timer.openAfterEnd, false, "End closes the measurement");
    // The point of a GPU timer: a number that came from the GPU. A frame that clears and draws a
    // sprite takes a nonzero, sub-second time on any renderer that can time at all.
    assert.equal(timer.collected, true, "a timed frame must produce a result within the run");
    assert.ok(timer.collectedOnFrame >= 1, "the result arrives on a later frame than it was asked");
    assert.equal(timer.samples, 1, "one Begin/End pair is one sample");
    assert.ok(
      Number.isFinite(timer.milliseconds) && timer.milliseconds > 0 && timer.milliseconds < 1000,
      `a timed frame must take a real, sub-second duration, got ${timer.milliseconds}`,
    );
  }

  console.log(
    `CNA_TS_WINDOWED_COMPUTE=PASS RENDERER=${evidence.renderer.name} ` +
    `WORK_GROUP=${compute.limits.sizeX}x${compute.limits.invocations} ` +
    `DISPATCH_EXACT=PASS UNIFORMS_REACH_PROGRAM=PASS PARTIAL_DISPATCH=PASS ` +
    `IMAGE_BINDING=${compute.imageBinding} ` +
    `GPU_TIMER=${timer.supported ? `${timer.milliseconds.toFixed(4)}ms@frame${timer.collectedOnFrame}` : "unsupported"}`,
  );
});

test("a windowed CNA renderer writes a shadow map the light transform predicts", { skip }, async () => {
  const game = new WindowedProbeGame(2);
  await game.Run();
  const shadow = game.evidence.shadow;
  game.Dispose();

  assert.equal(typeof shadow, "object", `shadow probe failed: ${shadow}`);

  if (shadow.layerAbsent) {
    // The engine layer is compiled out of this build, so there is no shadow map to make. An honest
    // boundary, and checked as one: CNA's own NOT_SUPPORTED, agreeing with the separate route that
    // reports whether the layer is present at all.
    assert.equal(shadow.cnaResult, 6, "a build without the engine layer refuses with NOT_SUPPORTED");
    assert.equal(
      shadow.extensionLayer, false,
      "and the layer-availability route agrees the layer is absent",
    );
    console.log("CNA_TS_WINDOWED_SHADOW=NO_ENGINE_LAYER");
    return;
  }

  assert.equal(typeof shadow.supported, "boolean");
  assert.equal(typeof shadow.sampling, "boolean");
  // Two separate CNA capabilities, asked separately. They are allowed to differ -- a renderer can
  // rasterise a depth pass it cannot then sample -- so neither is asserted to equal the other.
  assert.ok(shadow.size > 0, "a shadow map states its texture size");

  if (!shadow.supported) {
    // An honest boundary, not a skip: this renderer says it cannot run a depth pass.
    console.log(`CNA_TS_WINDOWED_SHADOW=NOT_SUPPORTED_RENDERER SIZE=${shadow.size}`);
    return;
  }

  // The texture CNA lends is the shadow map itself, at the size the quality tier chose, in a
  // single-channel float format -- which is why the depths below can be read as floats at all.
  assert.deepEqual(
    [shadow.texture.width, shadow.texture.height], [shadow.size, shadow.size],
    "the lent depth texture is the shadow map's own texture",
  );
  assert.equal(shadow.texture.format, Graphics.SurfaceFormat.Single);
  assert.equal(shadow.texture.cached, true, "the borrow is taken once, not once per read");

  // An empty pass clears the entire map to the far plane. Exactly -- not approximately, and not
  // "mostly": every one of the map's texels.
  assert.deepEqual(
    [shadow.cleared.low, shadow.cleared.high, shadow.cleared.occluded], [1, 1, 0],
    "Begin/End with nothing drawn leaves every texel at the far plane",
  );

  /*
   * The oracle.
   *
   * The test knows two things CNA was never told together: where the occluder is in world space,
   * and the light view-projection CNA reported for this pass. Multiplying one by the other gives
   * clip space; the viewport mapping gives the texel the corner lands on and the depth it records.
   * Nothing here is a remembered measurement, so a binding that transposed the matrix, dropped a
   * row, mixed up the axes, ignored the light direction or ignored the scene bounds moves the
   * predicted rectangle away from the rendered one instead of moving both together.
   */
  /*
   * First, cross-route agreement on the transform itself.
   *
   * `Begin` computed its light view-projection inside CNA from the light and the scene bounds this
   * test chose. `ComputeLightView` and `ComputeLightProjection` are pure routes that take the same
   * two values and touch no shadow map, and their product must be that same matrix. The test does
   * the multiply itself, so three CNA routes and one local arithmetic identity have to agree. A
   * `Begin` that dropped the bounds, read a light field from the wrong place, or sent a stale or
   * zeroed struct produces a different matrix here and cannot be rescued by the geometry checks
   * below -- those use CNA's own reported matrix, and would move with it.
   */
  const multiply = (left, right) => {
    const product = new Array(16).fill(0);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) sum += left[row * 4 + k] * right[k * 4 + column];
        product[row * 4 + column] = sum;
      }
    }
    return product;
  };
  const expectedTransform = multiply(shadow.math.view, shadow.math.projection);
  for (let index = 0; index < 16; index += 1) {
    assert.ok(
      Math.abs(shadow.lightViewProjection[index] - expectedTransform[index]) < 1e-5,
      `the pass transform disagrees with view * projection at element ${index}: ` +
      `${shadow.lightViewProjection[index]} vs ${expectedTransform[index]}`,
    );
  }
  // And it is a real transform, not an identity or a zero matrix that would agree trivially.
  assert.ok(
    shadow.lightViewProjection.slice(12, 15).some((value) => Math.abs(value) > 1e-3),
    "an asymmetric scene box gives the light transform real translation terms",
  );

  const m = shadow.lightViewProjection;
  const project = (x, y, z) => {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return {
      X: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      Y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      Z: (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    };
  };
  const toTexel = (ndc) => ({
    // Clip space is [-1,1] on both axes; the texture's first row is the top, which is +1.
    X: (ndc.X * 0.5 + 0.5) * shadow.size,
    Y: (0.5 - ndc.Y * 0.5) * shadow.size,
    // and depth is the same [-1,1] mapped onto the [0,1] a depth buffer stores.
    Depth: (ndc.Z + 1) / 2,
  });
  const predict = (y) => {
    const corners = [
      toTexel(project(shadow.quad.X0, y, shadow.quad.Z0)),
      toTexel(project(shadow.quad.X1, y, shadow.quad.Z0)),
      toTexel(project(shadow.quad.X1, y, shadow.quad.Z1)),
      toTexel(project(shadow.quad.X0, y, shadow.quad.Z1)),
    ];
    const xs = corners.map((corner) => corner.X);
    const ys = corners.map((corner) => corner.Y);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
      depth: corners[0].Depth,
    };
  };

  for (const [label, height] of [["high", shadow.quad.High], ["low", shadow.quad.Low]]) {
    const measured = shadow[label];
    const expected = predict(height);
    // The rectangle is not square: a swapped or mirrored axis lands somewhere else entirely.
    assert.ok(
      Math.abs((expected.maxX - expected.minX) - (expected.maxY - expected.minY)) > 32,
      "the occluder must project to a rectangle that is clearly not square",
    );
    // Rendered texel centres fall inside the predicted rectangle, within the one texel that
    // rasterisation of a partly covered edge texel can shift a boundary.
    for (const [name, got, want] of [
      ["minX", measured.minX, expected.minX], ["maxX", measured.maxX, expected.maxX],
      ["minY", measured.minY, expected.minY], ["maxY", measured.maxY, expected.maxY],
    ]) {
      assert.ok(
        Math.abs(got - want) <= 1.5,
        `${label} shadow ${name}: rendered ${got}, light transform predicts ${want.toFixed(2)}`,
      );
    }
    // And it is filled, not merely bounded: both triangles of the quad rasterised.
    const area = (expected.maxX - expected.minX) * (expected.maxY - expected.minY);
    assert.ok(
      Math.abs(measured.occluded - area) / area < 0.02,
      `${label} shadow covers ${measured.occluded} texels; the predicted rectangle is ${area.toFixed(0)}`,
    );
    // The recorded depth is the projected depth, to float precision -- the quad is flat and
    // perpendicular to the light, so every occluded texel holds the same value.
    assert.ok(
      Math.abs(measured.low - expected.depth) < 1e-5,
      `${label} shadow records depth ${measured.low}; the light transform predicts ${expected.depth}`,
    );
    assert.equal(measured.high, 1, "everything the occluder misses stays at the far plane");
  }

  // The light points straight down, so raising the occluder must bring it nearer the light.
  assert.ok(
    shadow.high.low < shadow.low.low,
    `the higher quad must record the smaller depth: ${shadow.high.low} vs ${shadow.low.low}`,
  );
  // And by exactly as much as the projection's depth scale says those heights are worth.
  const heightGap = shadow.quad.High - shadow.quad.Low;
  const perUnit = predict(0).depth - predict(1).depth;
  assert.ok(
    Math.abs((shadow.low.low - shadow.high.low) - perUnit * heightGap) < 1e-5,
    `${heightGap} world units apart must record ${(perUnit * heightGap).toFixed(6)} of depth, ` +
    `not ${(shadow.low.low - shadow.high.low).toFixed(6)}`,
  );
  // Both heights cover the same texels: only the depth changed.
  assert.deepEqual(
    [shadow.high.minX, shadow.high.maxX, shadow.high.minY, shadow.high.maxY, shadow.high.occluded],
    [shadow.low.minX, shadow.low.maxX, shadow.low.minY, shadow.low.maxY, shadow.low.occluded],
    "moving the occluder along the light's axis must not move its shadow",
  );

  // End really unbinds the map: the same draw, outside the pass, reaches none of it.
  assert.deepEqual(
    [shadow.outsidePass.low, shadow.outsidePass.high, shadow.outsidePass.occluded], [1, 1, 0],
    "a draw outside Begin/End must not write to the shadow map",
  );

  // The lent effects are two genuinely different programs, taken once each.
  assert.equal(shadow.effects.casterCached, true, "the caster borrow is taken once");
  assert.equal(shadow.effects.techniques.length, 2);
  // The rigid caster shades the same rectangle the pass routes did.
  assert.equal(
    shadow.effects.rigidDraws, shadow.high.occluded,
    "the lent rigid caster rasterises the same geometry the pass does",
  );
  // The skinned one cannot: it wants per-vertex bone indices and weights, and these vertices carry
  // a position and a colour. Nothing reaches the map. That is what separates the two getters --
  // their handles cannot, because CNA hands out a fresh handle for every borrow of either.
  assert.equal(
    shadow.effects.skinnedDraws, 0,
    "the skinned caster must not rasterise geometry that carries no bone weights",
  );

  // CNA refuses out-of-order use itself, and the binding reports its refusal rather than
  // pre-empting it with one of its own.
  for (const key of ["endWithoutBegin", "applyOutsidePass", "skinnedOutsidePass"]) {
    assert.match(
      shadow.ordering[key], /no shadow pass is open$/,
      `${key} must be refused by CNA, not accepted`,
    );
  }
  assert.match(shadow.ordering.beginTwice, /a shadow pass is already open$/);
  assert.match(shadow.ordering.emptyPalette, /^1: /, "an empty bone palette is an argument error");
  assert.match(shadow.ordering.emptyPalette, /between 1 and 72 matrices$/);
  assert.equal(
    shadow.ordering.skinnedInsidePass, "ACCEPTED",
    "a one-bone palette inside an open pass is accepted",
  );

  console.log(
    `CNA_TS_WINDOWED_SHADOW=OK SIZE=${shadow.size} SAMPLING=${shadow.sampling} ` +
    `DEPTH_HIGH=${shadow.high.low} DEPTH_LOW=${shadow.low.low} TEXELS=${shadow.high.occluded}`,
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
