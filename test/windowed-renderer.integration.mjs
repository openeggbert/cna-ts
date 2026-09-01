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
  BoundingFrustum,
  Color,
  Game,
  Graphics,
  GraphicsDeviceManager,
  LoadNodeNativeBackend,
  Matrix,
  Rectangle,
  Vector2,
  Vector3,
  Vector4,
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
import { CnaResult } from "../dist/internal/cna-results.js";
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

    // --- the engine layer's particle draw -----------------------------------------------------
    //
    // Particles are simulated on the CPU with every source of variance turned off and no speed at
    // all, so every particle in a system sits exactly on its emitter. That makes the draw
    // predictable to the texel: each system paints one square, at the point the camera puts its
    // emitter, as wide as its particle size. Two systems at different places and different sizes,
    // one camera move, and one system with nothing alive.
    record("particles", () => {
      const {
        IsGraphicsExtensionLayerAvailable, ParticleShaderSource, ParticleSystem,
      } = computeModule;
      const SIZE = 128;
      const CLEARED = new Color(12, 34, 56, 255);
      const owned = [];
      try {
        try {
          owned.push(new ParticleSystem(device, 1));
        } catch (error) {
          // No engine layer in this build; there is no particle system to make.
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        const emitter = (position, particleSize, emissionRate) => {
          const system = new ParticleSystem(device, 32);
          owned.push(system);
          // The CPU path, so the same numbers come back on a renderer with compute and one without.
          system.ForceSimulationOnCpu(true);
          system.Settings = {
            ...system.Settings,
            Position: position,
            Direction: new Vector3(0, 1, 0),
            Gravity: Vector3.Zero,
            StartColor: new Vector4(1, 1, 1, 1),
            EndColor: new Vector4(1, 1, 1, 1),
            ConeAngle: 0,
            Speed: 0,
            SpeedVariance: 0,
            Lifetime: 100,
            LifetimeVariance: 0,
            Drag: 0,
            EmissionRate: emissionRate,
            StartSize: particleSize,
            EndSize: particleSize,
          };
          system.Reset();
          system.Update(0.5);
          return system;
        };
        // Asymmetric on both screen axes, different sizes, and neither at the origin.
        const NEAR = { Position: new Vector3(3, 2, -4), Size: 1 };
        const FAR = { Position: new Vector3(-6, -3, 0), Size: 2 };
        const near = emitter(NEAR.Position, NEAR.Size, 40);
        const far = emitter(FAR.Position, FAR.Size, 40);
        const idle = emitter(new Vector3(0, 0, 0), 1, 0);

        const settings = near.Settings;
        const result = {
          size: SIZE,
          near: { ...NEAR, position: [NEAR.Position.X, NEAR.Position.Y, NEAR.Position.Z] },
          far: { ...FAR, position: [FAR.Position.X, FAR.Position.Y, FAR.Position.Z] },
          // The settings CNA holds, read back rather than remembered.
          settings: {
            position: [settings.Position.X, settings.Position.Y, settings.Position.Z],
            speed: settings.Speed, coneAngle: settings.ConeAngle, startSize: settings.StartSize,
          },
          counts: { near: near.ActiveCount, far: far.ActiveCount, idle: idle.ActiveCount },
          // Every particle in a system, distinct positions only: they must all be on the emitter.
          nearPositions: [...new Set(
            near.ToArray().map((p) => `${p.Position.X},${p.Position.Y},${p.Position.Z}`),
          )],
          defaultCapacity: (() => {
            const system = ParticleSystem.AtDefaultCapacity(device);
            try {
              return system.Capacity;
            } finally {
              system.Dispose();
            }
          })(),
          bindingPoint: ParticleShaderSource.BindingPoint,
          glsl: ParticleShaderSource.Glsl,
          softness: (() => {
            const before = near.Softness;
            near.Softness = 2.5;
            const set = near.Softness;
            near.Softness = -3;
            return { before, set, floored: near.Softness };
          })(),
        };

        const target = new Graphics.RenderTarget2D(device, SIZE, SIZE);
        owned.push(target);
        const texture = new Graphics.Texture2D(device, 2, 2);
        owned.push(texture);
        // One flat colour, so a painted texel is unmistakably the particle texture's.
        texture.SetData([Color.Red, Color.Red, Color.Red, Color.Red]);
        result.particleColor = Color.Red.PackedValue;
        result.clearedColor = CLEARED.PackedValue;

        const projection = Matrix.CreateOrthographic(20, 20, 0.1, 100);
        const pixels = new Array(SIZE * SIZE);
        // Connected regions of non-cleared texels, so two emitters are two findings rather than
        // one bounding box around both.
        const blobs = (view, systems) => {
          device.SetRenderTarget(target);
          try {
            device.Clear(CLEARED);
            for (const system of systems) system.Draw(view, projection, texture);
          } finally {
            // Unbound even when a draw refuses, so the frame can still be presented and the
            // failure that matters is the one that gets reported.
            device.SetRenderTarget(null);
          }
          target.GetData(pixels);
          const found = [];
          const visited = new Uint8Array(SIZE * SIZE);
          const painted = (index) => pixels[index].PackedValue !== CLEARED.PackedValue;
          for (let index = 0; index < SIZE * SIZE; index += 1) {
            if (visited[index] || !painted(index)) continue;
            const stack = [index];
            visited[index] = 1;
            let count = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            const colours = new Set();
            while (stack.length > 0) {
              const at = stack.pop();
              const x = at % SIZE, y = Math.floor(at / SIZE);
              count += 1;
              colours.add(pixels[at].PackedValue);
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
                const next = ny * SIZE + nx;
                if (!visited[next] && painted(next)) {
                  visited[next] = 1;
                  stack.push(next);
                }
              }
            }
            found.push({ count, minX, maxX, minY, maxY, colours: [...colours] });
          }
          return found.sort((left, right) => left.minX - right.minX);
        };

        const matrixOf = (matrix) => matrixRow(matrix);
        const straightOn = Matrix.CreateLookAt(new Vector3(0, 0, 20), Vector3.Zero, Vector3.Up);
        // The same scene from two units to the right; everything must slide left by exactly that.
        const CAMERA_SHIFT = 2;
        const shifted = Matrix.CreateLookAt(
          new Vector3(CAMERA_SHIFT, 0, 20), new Vector3(CAMERA_SHIFT, 0, 0), Vector3.Up,
        );
        result.projection = matrixOf(projection);
        result.straightOn = { view: matrixOf(straightOn), blobs: blobs(straightOn, [near, far]) };
        result.idleOnly = blobs(straightOn, [idle]);
        result.shifted = {
          view: matrixOf(shifted), shift: CAMERA_SHIFT, blobs: blobs(shifted, [near, far]),
        };
        // Each alone, so a blob belongs to the system that drew it rather than to the pair.
        result.nearOnly = blobs(straightOn, [near]);
        result.farOnly = blobs(straightOn, [far]);

        /*
         * The soft-particle fade, asserted as it currently behaves rather than skipped.
         *
         * `docs/upstream-cna-findings.md` item 12: the depth input and the softness reach CNA,
         * store, and read back, and the drawn picture does not change -- not with a depth image of
         * zeros, which should erase the particle entirely. The GPU draw path is the one running,
         * which the texel counts below show, so this is not a fallback to the path that has no
         * fade. Asserting it is what makes a repair visible the day it lands, the way items 7 and 9
         * were noticed.
         */
        const gpu = new ParticleSystem(device, 8);
        owned.push(gpu);
        gpu.Settings = { ...near.Settings, StartSize: 4, EndSize: 4, Position: Vector3.Zero };
        gpu.Reset();
        gpu.Update(0.5);
        const depth = new Graphics.RenderTarget2D(device, SIZE, SIZE);
        owned.push(depth);
        device.SetRenderTarget(depth);
        try {
          // Every pixel at the camera: nothing should survive a fade against this.
          device.Clear(new Color(0, 0, 0, 255));
        } finally {
          device.SetRenderTarget(null);
        }
        const fade = { usesCompute: gpu.UsesCompute, cpu: blobs(straightOn, [near]) };
        fade.withoutDepth = blobs(straightOn, [gpu]);
        gpu.Softness = 50;
        fade.softness = gpu.Softness;
        gpu.SetDepthInput(depth, 100);
        fade.withNearDepth = blobs(straightOn, [gpu]);
        gpu.SetDepthInput(null, 100);
        fade.afterClearing = blobs(straightOn, [gpu]);
        result.fade = fade;

        const refusal = (body) => {
          try {
            body();
            return "ACCEPTED";
          } catch (error) {
            return `${error.constructor.name}`;
          }
        };
        result.refusals = {
          nullTexture: refusal(() => near.Draw(straightOn, projection, null)),
          disposedTexture: refusal(() => {
            const gone = new Graphics.Texture2D(device, 1, 1);
            gone.Dispose();
            near.Draw(straightOn, projection, gone);
          }),
          disposedSystem: refusal(() => {
            const gone = new ParticleSystem(device, 1);
            gone.Dispose();
            gone.Draw(straightOn, projection, texture);
          }),
        };
        return result;
      } finally {
        for (const resource of owned.reverse()) resource.Dispose();
      }
    });

    // --- the depth/normal prepass, and the decal projector that reads it -----------------------
    //
    // These two are measured together because they are one pipeline: the prepass rasterises linear
    // depth and view-space normals for a scene, and the decal projector reads those two buffers
    // back and unprojects every screen texel into a decal's own box.
    //
    // The oracle is CNA's own rasteriser. The same world rectangle is drawn three ways in the same
    // frame, into the same render target, read back by the same routine: by a stock `BasicEffect`,
    // by the prepass, and -- as a decal box over that rectangle -- by the decal projector. Whatever
    // this renderer's screen and readback conventions are, they cancel between the three, because
    // all three measurements share them.
    record("prepassAndDecals", () => {
      const {
        DecalPass, DepthEncoding, DepthNormalPrepass, DepthNormalPrepassMath,
        IsGraphicsExtensionLayerAvailable,
      } = computeModule;
      // Deliberately not square, and not a power of two on either axis: the target's width and
      // height are separate arguments to the decal draw, and a pass that swapped them would land
      // on the same texels in a square picture.
      const WIDTH = 80;
      const HEIGHT = 48;
      const NEAR = 1;
      const FAR = 100;
      // The camera sits ten units up the +Z axis looking at the origin, with a 90-degree vertical
      // field of view and a square aspect, so a plane at view depth d spans d world units per unit
      // of device coordinate -- which is what lets the test turn a texel into a world point.
      const EYE = 10;
      const CLEARED = new Color(12, 34, 56, 255);
      // Asymmetric on both screen axes and off-centre on both: a mirrored or swapped axis moves it.
      const RECT = { X0: -6, X1: 10, Y0: -6, Y1: -1, Z: 0 };
      const owned = [];
      try {
        let prepass;
        try {
          prepass = new DepthNormalPrepass(device, WIDTH, HEIGHT, DepthEncoding.Automatic);
        } catch (error) {
          // No engine layer in this build; there is no prepass and no decal pass to make.
          let decalResult = "NOT_ATTEMPTED";
          try {
            new DecalPass(device).Dispose();
            decalResult = "ACCEPTED";
          } catch (decalError) {
            decalResult = decalError.cnaResult;
          }
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            decalCnaResult: decalResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        owned.push(prepass);

        const result = {
          // The pure routes first. None of these needs a device, and the encoding is what makes a
          // read-back depth texel mean a number rather than four bytes.
          maths: {
            devicePacked: DepthNormalPrepassMath.UsesPackedDepth(device),
            packHalf: DepthNormalPrepassMath.PackDepth(0.5),
            // 1.0 is clamped one step short before packing, because fract(1.0) is zero and an
            // unclamped far plane would read back as the nearest possible surface.
            packOne: DepthNormalPrepassMath.PackDepth(1),
            unpackHalf: DepthNormalPrepassMath.UnpackDepth(0, 0, 0, 0.5),
            roundTrip: (() => {
              const packed = DepthNormalPrepassMath.PackDepth(0.375);
              return DepthNormalPrepassMath.UnpackDepth(packed.R, packed.G, packed.B, packed.A);
            })(),
            packedGlsl: DepthNormalPrepassMath.DepthDecodeGlsl(true),
            plainGlsl: DepthNormalPrepassMath.DepthDecodeGlsl(false),
            velocityGlsl: DepthNormalPrepassMath.VelocityDecodeGlsl(),
            // Alpha zero means "this texel carries a velocity", inverted on purpose so a shared
            // white clear already reads as "nothing here".
            hasVelocity: DepthNormalPrepassMath.HasVelocity(new Color(200, 100, 0, 0)),
            hasNoVelocity: DepthNormalPrepassMath.HasVelocity(new Color(200, 100, 0, 255)),
            decodedVelocity: (() => {
              const velocity = DepthNormalPrepassMath.DecodeVelocity(new Color(255, 0, 0, 0));
              return [velocity.X, velocity.Y];
            })(),
            insideOrigin: DecalPass.IsInsideDecalBox(new Vector3(0, 0, 0)),
            insideCorner: DecalPass.IsInsideDecalBox(new Vector3(0.5, -0.5, 0.5)),
            outsideOnOneAxis: DecalPass.IsInsideDecalBox(new Vector3(0.51, 0, 0)),
          },
          prepass: {
            supported: prepass.IsSupported,
            passCount: prepass.PassCount,
            multipleRenderTargets: prepass.IsUsingMultipleRenderTargets,
            depthPacked: prepass.IsDepthPacked,
            velocityEnabled: prepass.IsVelocityEnabled,
            roughness: prepass.Roughness,
          },
          rect: RECT,
          width: WIDTH,
          height: HEIGHT,
          near: NEAR,
          far: FAR,
          eye: EYE,
          clearedColor: CLEARED.PackedValue,
          decalColor: Color.Red.PackedValue,
        };

        // Roughness is clamped rather than refused, which is what the canonical setter does.
        prepass.Roughness = 0.25;
        result.prepass.roughnessSet = prepass.Roughness;
        prepass.Roughness = 5;
        result.prepass.roughnessClamped = prepass.Roughness;
        prepass.Roughness = -1;
        result.prepass.roughnessFloored = prepass.Roughness;
        prepass.Roughness = 0;

        const depthTexture = prepass.DepthTexture;
        result.prepass.textures = {
          depth: [depthTexture.Width, depthTexture.Height, depthTexture.Format],
          depthCached: prepass.DepthTexture === depthTexture,
          normal: [prepass.NormalTexture.Width, prepass.NormalTexture.Height],
          // Velocity is off, and an absent buffer is an absence rather than an empty one.
          velocity: prepass.VelocityTexture === null ? "null" : "present",
        };
        try {
          result.prepass.effects = [
            prepass.PrepassEffect.CurrentTechnique.Name,
            prepass.SkinnedPrepassEffect.CurrentTechnique.Name,
          ];
        } catch (error) {
          result.prepass.effects = `${error.constructor.name}: ${(error.message ?? "").slice(0, 80)}`;
        }

        const view = Matrix.CreateLookAt(new Vector3(0, 0, EYE), Vector3.Zero, Vector3.Up);
        const projection =
          Matrix.CreatePerspectiveFieldOfView(Math.PI / 2, WIDTH / HEIGHT, NEAR, FAR);
        result.view = matrixRow(view);
        result.projection = matrixRow(projection);

        const quad = (make) => [
          make(RECT.X0, RECT.Y0), make(RECT.X1, RECT.Y0), make(RECT.X1, RECT.Y1),
          make(RECT.X0, RECT.Y0), make(RECT.X1, RECT.Y1), make(RECT.X0, RECT.Y1),
        ];
        const survey = (pixels, painted) => {
          let count = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          const colours = new Set();
          for (let index = 0; index < pixels.length; index += 1) {
            if (!painted(pixels[index], index)) continue;
            count += 1;
            colours.add(pixels[index].PackedValue);
            const x = index % WIDTH, y = Math.floor(index / WIDTH);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
          return { count, minX, maxX, minY, maxY, colours: [...colours] };
        };

        // 1. The oracle: the same rectangle rasterised by a stock effect, which is neither the
        //    prepass nor the decal pass and shares no code with either.
        const target = new Graphics.RenderTarget2D(device, WIDTH, HEIGHT);
        owned.push(target);
        const basic = new Graphics.BasicEffect(device);
        owned.push(basic);
        basic.VertexColorEnabled = true;
        basic.World = Matrix.Identity;
        basic.View = view;
        basic.Projection = projection;
        // Both faces, so the answer does not depend on which way the quad happens to wind.
        device.RasterizerState = Graphics.RasterizerState.CullNone;
        const pixels = new Array(WIDTH * HEIGHT);
        device.SetRenderTarget(target);
        try {
          device.Clear(CLEARED);
          basic.CurrentTechnique.Passes.Get(0).Apply();
          device.DrawUserPrimitives(
            Graphics.PrimitiveType.TriangleList,
            quad((x, y) => new Graphics.VertexPositionColor(
              new Vector3(x, y, RECT.Z), new Color(0, 255, 0, 255))),
            0, 2,
          );
        } finally {
          // Unbound even when the draw refuses, so a failure surfaces here rather than later as a
          // frame that cannot be presented.
          device.SetRenderTarget(null);
        }
        target.GetData(pixels);
        result.rasterised = survey(pixels, (texel) => texel.PackedValue !== CLEARED.PackedValue);

        // 2. The prepass, filling its own two buffers with the same rectangle.
        for (let index = 0; index < prepass.PassCount; index += 1) {
          prepass.Begin(index, view, projection, NEAR, FAR);
          try {
            prepass.PrepassEffect.CurrentTechnique.Passes.Get(0).Apply();
            device.DrawUserPrimitives(
              Graphics.PrimitiveType.TriangleList,
              quad((x, y) => new Graphics.VertexPositionNormalTexture(
                new Vector3(x, y, RECT.Z), new Vector3(0, 0, 1), Vector2.Zero)),
              0, 2,
            );
          } finally {
            prepass.End();
          }
        }
        const depthPixels = new Array(WIDTH * HEIGHT);
        depthTexture.GetData(depthPixels);
        const normalPixels = new Array(WIDTH * HEIGHT);
        prepass.NormalTexture.GetData(normalPixels);
        const linearDepth = (texel) => DepthNormalPrepassMath.UnpackDepth(
          texel.R / 255, texel.G / 255, texel.B / 255, texel.A / 255,
        );
        // Every distinct depth in the buffer, with its texel count: a surface and a far plane, and
        // nothing in between, is what one flat quad against an empty background has to produce.
        const depths = new Map();
        for (const texel of depthPixels) {
          const key = linearDepth(texel).toFixed(5);
          depths.set(key, (depths.get(key) ?? 0) + 1);
        }
        result.depthHistogram = [...depths.entries()].sort((left, right) => right[1] - left[1]);
        // Which texels carry a surface at all -- the mask the decal projector's own discard uses,
        // and the mask the test's prediction has to use with it.
        result.surfaceMask = depthPixels.map((texel) => linearDepth(texel) < 0.99);
        result.prepassOccupied = survey(depthPixels, (texel) => linearDepth(texel) < 0.99);
        result.normalsInside = [...new Set(depthPixels.map((texel, index) => {
          if (linearDepth(texel) >= 0.99) return null;
          const normal = normalPixels[index];
          return `${normal.R},${normal.G},${normal.B},${normal.A}`;
        }).filter((entry) => entry !== null))];
        // One clear serves the whole bound set, so an untouched normal texel carries the depth
        // buffer's white rather than the facing-camera value a separate clear would have written.
        result.clearedNormal = (() => {
          const normal = normalPixels[0];
          return [normal.R, normal.G, normal.B, normal.A];
        })();

        // 3. The decal projector, reading exactly the two buffers the prepass just wrote.
        const pass = new DecalPass(device);
        owned.push({ Dispose: () => pass.Dispose() });
        result.decalDefaults = {
          opacity: pass.Opacity,
          maxSlopeAngle: pass.MaxSlopeAngle,
          tint: (() => { const tint = pass.Tint; return [tint.X, tint.Y, tint.Z]; })(),
        };
        pass.Opacity = 0.5;
        result.decalDefaults.opacitySet = pass.Opacity;
        pass.Opacity = 2;
        result.decalDefaults.opacityClamped = pass.Opacity;
        pass.Opacity = -1;
        result.decalDefaults.opacityFloored = pass.Opacity;
        pass.Opacity = 1;
        // The tint takes what it is given, with no clamp: above one brightens an HDR frame.
        pass.Tint = new Vector3(0.25, 2, -1);
        result.decalDefaults.tintSet = (() => {
          const tint = pass.Tint;
          return [tint.X, tint.Y, tint.Z];
        })();
        pass.Tint = new Vector3(1, 1, 1);
        pass.MaxSlopeAngle = 10;
        result.decalDefaults.slopeClamped = pass.MaxSlopeAngle;
        pass.MaxSlopeAngle = -1;
        result.decalDefaults.slopeFloored = pass.MaxSlopeAngle;
        pass.MaxSlopeAngle = result.decalDefaults.maxSlopeAngle;

        const decalTexture = new Graphics.Texture2D(device, 2, 2);
        owned.push(decalTexture);
        // One flat colour, so a painted texel is unmistakably the decal's.
        decalTexture.SetData([Color.Red, Color.Red, Color.Red, Color.Red]);

        pass.SetCamera(view, projection, FAR);
        pass.SetPrepassInputs(depthTexture, null);
        const project = (world) => {
          device.SetRenderTarget(target);
          try {
            device.Clear(CLEARED);
            pass.Draw(decalTexture, world, WIDTH, HEIGHT);
          } finally {
            device.SetRenderTarget(null);
          }
          target.GetData(pixels);
          // The box's own transform travels with the picture, so the test can invert it and ask
          // CNA which texels should have been painted rather than deriving the region by hand.
          return {
            ...survey(pixels, (texel) => texel.PackedValue !== CLEARED.PackedValue),
            world: matrixRow(world),
          };
        };
        // A decal box is the unit cube its world transform places and sizes, so a box over the
        // rectangle is a scale by the rectangle's extents and a translation to its centre.
        const box = (cx, cy, cz, sx, sy, sz, yaw = 0) => Matrix.Multiply(
          Matrix.Multiply(Matrix.CreateScale(sx, sy, sz), Matrix.CreateRotationY(yaw)),
          Matrix.CreateTranslation(cx, cy, cz),
        );
        const SPAN_X = RECT.X1 - RECT.X0;
        const SPAN_Y = RECT.Y1 - RECT.Y0;
        const MID_X = (RECT.X0 + RECT.X1) / 2;
        const MID_Y = (RECT.Y0 + RECT.Y1) / 2;
        const OVER_RECT = box(MID_X, MID_Y, RECT.Z, SPAN_X, SPAN_Y, 6);
        result.overRect = project(OVER_RECT);
        // Half as wide, same centre and same height: only one axis of the box changed.
        result.halfWide = project(box(MID_X, MID_Y, RECT.Z, SPAN_X / 2, SPAN_Y, 6));
        // Two quarter-sized boxes in opposite corners of the same surface. Each has to find its
        // own corner: a projection that had lost the translation would put both in the middle.
        result.upperRight = project(box(
          MID_X + SPAN_X / 4, MID_Y + SPAN_Y / 4, RECT.Z, SPAN_X / 3, SPAN_Y / 3, 6,
        ));
        result.lowerLeft = project(box(
          MID_X - SPAN_X / 4, MID_Y - SPAN_Y / 4, RECT.Z, SPAN_X / 3, SPAN_Y / 3, 6,
        ));
        // A long thin box rolled thirty degrees about the view axis, which paints a diagonal band
        // across the surface. Nothing about a band is expressible as a rectangle, so this is the
        // case that says the box's rotation reaches the projection at all -- and CNA's own box
        // test predicts it while an extent written out here could not.
        result.rotated = project(Matrix.Multiply(
          Matrix.Multiply(
            Matrix.CreateScale(SPAN_X * 1.5, SPAN_Y / 4, 6),
            Matrix.CreateRotationZ(Math.PI / 6),
          ),
          Matrix.CreateTranslation(MID_X, MID_Y, RECT.Z),
        ));
        // Thin, and nowhere near the surface: the box test is what keeps a decal off geometry it
        // was not meant for, so this must paint nothing.
        result.awayFromSurface = project(box(MID_X, MID_Y, RECT.Z + 3, SPAN_X, SPAN_Y, 1));
        // Half opacity, which composites rather than replaces.
        result.halfOpacity = (() => {
          pass.Opacity = 0.5;
          const painted = project(OVER_RECT);
          pass.Opacity = 1;
          return painted;
        })();
        // A green tint on a red decal leaves nothing: the tint multiplies channel by channel.
        result.greenTint = (() => {
          pass.Tint = new Vector3(0, 1, 0);
          const painted = project(OVER_RECT);
          pass.Tint = new Vector3(1, 1, 1);
          return painted;
        })();
        // No depth buffer at all: nothing to unproject, so nothing is painted and nothing fails.
        result.noDepth = (() => {
          pass.SetPrepassInputs(null, null);
          const painted = project(OVER_RECT);
          pass.SetPrepassInputs(depthTexture, null);
          return painted;
        })();

        /*
         * The same depths, handed over as an ordinary uploaded texture instead of the prepass's
         * own target.
         *
         * The pass draws its depth input as a full-screen sprite and takes its screen mapping from
         * that sprite's texture coordinates, so the input's orientation is the pass's orientation.
         * An uploaded `Texture2D` and a render target do not agree about which row is the top on
         * this renderer, and the picture comes out mirrored -- measured here rather than left for a
         * caller to discover, and documented on `SetPrepassInputs`.
         */
        const uploadedDepth = (rows) => {
          const uploaded = new Graphics.Texture2D(device, WIDTH, HEIGHT);
          owned.push(uploaded);
          uploaded.SetData(rows);
          pass.SetPrepassInputs(uploaded, null);
          const painted = project(OVER_RECT);
          pass.SetPrepassInputs(depthTexture, null);
          return painted;
        };
        result.uploadedInput = uploadedDepth(depthPixels);
        // And the same bytes with their rows reversed, which is the positive half of the same
        // measurement: turn the image over and the pass finds the surface exactly where the
        // prepass's own buffer put it.
        result.uploadedFlipped = uploadedDepth(Array.from(
          { length: WIDTH * HEIGHT },
          (_, index) => depthPixels[
            (HEIGHT - 1 - Math.floor(index / WIDTH)) * WIDTH + (index % WIDTH)
          ],
        ));

        // 4. The slope test, which exists only when normals are supplied.
        //
        // The decal projects along its own +Z, so a surface that takes it faces back along that
        // axis. Unrotated, this box points +Z -- at the camera -- and the surface the prepass drew
        // faces the camera too, so the two face the same way and every texel is rejected. Turned
        // through half a turn the decal projects into the surface and every texel is taken.
        pass.SetPrepassInputs(depthTexture, prepass.NormalTexture);
        result.axisTowardCamera = project(OVER_RECT);
        const INTO_SURFACE = box(3, -2, 0, 8, 4, 6, Math.PI);
        result.axisIntoSurface = project(INTO_SURFACE);
        // And a surface tilted past the limit is dropped, while widening the limit takes it back.
        // Same buffers, same box, one number different between the last two.
        const tilted = (degrees) => {
          const texture = new Graphics.Texture2D(device, WIDTH, HEIGHT);
          owned.push(texture);
          const radians = (degrees * Math.PI) / 180;
          const encode = (component) => Math.round((component * 0.5 + 0.5) * 255);
          texture.SetData(new Array(WIDTH * HEIGHT).fill(new Color(
            encode(Math.sin(radians)), encode(0), encode(Math.cos(radians)), 255,
          )));
          return texture;
        };
        pass.SetPrepassInputs(depthTexture, tilted(60));
        result.tilted60 = project(INTO_SURFACE);
        pass.SetPrepassInputs(depthTexture, tilted(80));
        result.tilted80 = project(INTO_SURFACE);
        result.tilted80Widened = (() => {
          pass.MaxSlopeAngle = (85 * Math.PI) / 180;
          const painted = project(INTO_SURFACE);
          pass.MaxSlopeAngle = result.decalDefaults.maxSlopeAngle;
          return painted;
        })();
        pass.SetPrepassInputs(depthTexture, null);

        // 5. What the typed surface refuses before CNA ever sees it, and what CNA refuses itself.
        // CNA's own refusals arrive as an error carrying the result code it answered with; the
        // binding's own arrive as an ordinary TypeScript error class. Reporting whichever it is
        // keeps the two apart, so a refusal invented here cannot pass for one of CNA's.
        const refusal = (body) => {
          try {
            body();
            return "ACCEPTED";
          } catch (error) {
            return error.cnaResult ?? error.constructor.name;
          }
        };
        result.refusals = {
          nullDecal: refusal(() => pass.Draw(null, OVER_RECT, WIDTH, HEIGHT)),
          zeroWidth: refusal(() => pass.Draw(decalTexture, OVER_RECT, 0, HEIGHT)),
          openTwice: refusal(() => {
            prepass.Begin(0, view, projection, NEAR, FAR);
            try {
              prepass.Begin(0, view, projection, NEAR, FAR);
            } finally {
              prepass.End();
            }
          }),
          endWithoutBegin: refusal(() => prepass.End()),
          // Depth is normalised by the far plane, so a range that cannot normalise is refused
          // rather than corrected into a buffer that looks plausible and is lit from the wrong
          // depth.
          invertedPlanes: refusal(() => {
            prepass.Begin(0, view, projection, 50, 10);
            prepass.End();
          }),
          resizeInsidePass: refusal(() => {
            prepass.Begin(0, view, projection, NEAR, FAR);
            try {
              prepass.Resize(32, 32);
            } finally {
              prepass.End();
            }
          }),
        };
        const spare = new DecalPass(device);
        spare.Dispose();
        result.refusals.disposedPass =
          refusal(() => spare.Draw(decalTexture, OVER_RECT, WIDTH, HEIGHT));
        return result;
      } finally {
        for (const resource of owned.reverse()) {
          try {
            resource.Dispose();
          } catch {
            // A cleanup failure must not replace the failure that matters.
          }
        }
      }
    });

    // --- light probes, baked from a real scene ---------------------------------------------------
    //
    // The baker renders six faces per probe and projects what it read back onto nine
    // spherical-harmonic coefficients. That makes a bake checkable without agreeing with CNA about
    // any convention: light exactly one face, and the probe has to be brightest looking that way
    // and darkest looking the other. Which face is lit is decided *inside* the callback, by
    // matching the view CNA handed over against the one FaceView reports -- so the callback's own
    // behaviour is the evidence that each face got its own camera.
    record("lightProbes", () => {
      const {
        IsGraphicsExtensionLayerAvailable, LightProbe, LightProbeBaker, LightProbeVolume,
      } = computeModule;
      const FACE_SIZE = 16;
      const NEAR = 0.5;
      const FAR = 40;
      const owned = [];
      try {
        let baker;
        try {
          baker = new LightProbeBaker(device, FACE_SIZE);
        } catch (error) {
          // No engine layer in this build; there is no baker to make.
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        owned.push(baker);
        baker.SetPlanes(NEAR, FAR);
        const result = {
          supported: baker.IsSupported,
          faceSize: baker.FaceSize,
          faceCount: LightProbeBaker.FaceCount,
          planes: [baker.NearPlane, baker.FarPlane],
        };
        if (!result.supported) return result;

        const ORIGIN = new Vector3(0, 0, 0);
        const faceViewsAt = (position) => Array.from(
          { length: LightProbeBaker.FaceCount },
          (_, face) => matrixRow(baker.FaceView(face, position)),
        );
        const sameMatrix = (left, right) =>
          left.every((value, index) => Math.abs(value - right[index]) < 1e-5);
        // Which of the cameras this is, decided by the matrix rather than by a counter: a bake that
        // handed the same view to every face, or the faces in another order, cannot pass this.
        const identify = (view, views) => views.findIndex((candidate) => sameMatrix(view, candidate));

        const bakeWith = (paint, from = ORIGIN) => {
          const views = faceViewsAt(from);
          const order = [];
          const projections = [];
          const probe = baker.BakeProbe(from, (view, projection) => {
            const face = identify(matrixRow(view), views);
            order.push(face);
            projections.push(matrixRow(projection));
            device.Clear(paint(face));
          });
          owned.push(probe);
          return {
            order,
            projections,
            position: [probe.Position.X, probe.Position.Y, probe.Position.Z],
            isZero: probe.IsZero,
            coefficients: probe.ToArray().map((value) => [value.X, value.Y, value.Z]),
            // The six axis directions, which is where a single lit face shows up as a difference.
            irradiance: [
              [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
            ].map((axis) => {
              const value = probe.Irradiance(new Vector3(...axis));
              return [value.X, value.Y, value.Z];
            }),
          };
        };
        const BLACK = new Color(0, 0, 0, 255);
        const WHITE = new Color(255, 255, 255, 255);
        // Half the brightest byte, so the radiance is a known fraction of the white one and the
        // coefficients have to scale with it.
        const HALF = new Color(128, 128, 128, 255);
        result.halfFraction = 128 / 255;
        result.onlyFirstFace = bakeWith((face) => (face === 0 ? WHITE : BLACK));
        result.onlySecondFace = bakeWith((face) => (face === 1 ? WHITE : BLACK));
        result.onlyFifthFace = bakeWith((face) => (face === 4 ? WHITE : BLACK));
        result.firstFaceHalf = bakeWith((face) => (face === 0 ? HALF : BLACK));
        result.allDark = bakeWith(() => BLACK);
        result.allBright = bakeWith(() => WHITE);
        // The same scene captured from somewhere that is not the origin. The callback recognises a
        // face only when the view matches FaceView for *that* point, so a bake that captured from
        // the origin instead cannot identify a single one of the six.
        result.awayFromOrigin = bakeWith(
          (face) => (face === 0 ? WHITE : BLACK), new Vector3(3, -2, 1),
        );
        // The projection the test builds itself, which every face has to have been given.
        result.expectedProjection = matrixRow(
          Matrix.CreatePerspectiveFieldOfView(Math.PI / 2, 1, NEAR, FAR),
        );

        // --- a volume, where each probe has to be baked from its own place --------------------
        //
        // Two probes eight units apart. The callback works out which probe it is being asked to
        // draw for by matching the view against the face cameras for each position, and lights the
        // scene only for one of them. A bake that captured both from the same point, or that reused
        // one capture for the whole volume, lights both.
        const volume = new LightProbeVolume(
          new BoundingBox(new Vector3(-4, 0, 0), new Vector3(4, 0, 0)), 2, 1, 1,
        );
        owned.push(volume);
        result.volume = {
          counts: [volume.CountX, volume.CountY, volume.CountZ],
          positions: [0, 1].map((x) => {
            const position = volume.GetProbePosition(x, 0, 0);
            return [position.X, position.Y, position.Z];
          }),
          zeroBefore: volume.IsZero,
        };
        const cellViews = [0, 1].map(
          (x) => faceViewsAt(volume.GetProbePosition(x, 0, 0)),
        );
        const seenCells = [];
        result.volume.faceDraws = baker.BakeLight(volume, (view) => {
          const row = matrixRow(view);
          const cell = cellViews.findIndex((views) => identify(row, views) >= 0);
          seenCells.push(cell);
          device.Clear(cell === 0 ? WHITE : BLACK);
        });
        result.volume.seenCells = seenCells;
        result.volume.zeroAfter = volume.IsZero;
        result.volume.probes = [0, 1].map((x) => {
          const probe = volume.GetProbe(x, 0, 0);
          owned.push(probe);
          const position = probe.Position;
          const up = probe.Irradiance(new Vector3(0, 1, 0));
          return {
            isZero: probe.IsZero,
            position: [position.X, position.Y, position.Z],
            irradianceUp: [up.X, up.Y, up.Z],
          };
        });

        // --- visibility, which is a distance rather than a colour ------------------------------
        //
        // The red channel of a face is read as a fraction of the far plane, so painting every face
        // one known byte makes the recorded mean an exact number this test can compute. A uniform
        // face also makes the mean squared exactly the mean squared, which is the floor CNA applies.
        const DISTANCE_BYTE = 64;
        result.visibility = { byte: DISTANCE_BYTE, farPlane: FAR };
        // Set first, so the light bake below can be shown to keep it.
        const marked = new LightProbe();
        owned.push(marked);
        marked.SetVisibility(3, 7, 60);
        volume.SetProbe(1, 0, 0, marked);
        result.visibility.faceDraws = baker.BakeVisibility(
          volume, () => { device.Clear(new Color(DISTANCE_BYTE, 0, 0, 255)); },
        );
        result.visibility.recorded = [0, 1].map((x) => {
          const probe = volume.GetProbe(x, 0, 0);
          owned.push(probe);
          return {
            has: probe.HasVisibility,
            means: Array.from({ length: 6 }, (_, face) => probe.GetVisibilityMean(face)),
            meanSquared: probe.GetVisibilityMeanSquared(0),
          };
        });
        // And a light bake after it keeps what the visibility bake recorded: the two are separate
        // passes and either may be run without the other.
        baker.BakeLight(volume, () => { device.Clear(WHITE); });
        result.visibility.afterLightBake = (() => {
          const probe = volume.GetProbe(0, 0, 0);
          owned.push(probe);
          return {
            means: Array.from({ length: 6 }, (_, face) => probe.GetVisibilityMean(face)),
            isZero: probe.IsZero,
          };
        })();

        // --- what the boundary refuses ----------------------------------------------------------
        const refusal = (body) => {
          try {
            body();
            return "ACCEPTED";
          } catch (error) {
            return error.cnaResult ?? error.constructor.name;
          }
        };
        // An exception from the scene is carried out of the bake and rethrown, rather than
        // unwinding through CNA while it holds a bound render target.
        result.callbackThrew = (() => {
          try {
            baker.BakeProbe(ORIGIN, () => { throw new RangeError("from the scene"); });
            return "ACCEPTED";
          } catch (error) {
            return `${error.constructor.name}: ${error.message}`;
          }
        })();
        // And the device is still usable afterwards, which is what says nothing was left bound.
        result.usableAfterThrow = (() => {
          const probe = bakeWith((face) => (face === 0 ? WHITE : BLACK));
          return probe.irradiance;
        })();
        result.refusals = {
          nullCallback: refusal(() => baker.BakeProbe(ORIGIN, null)),
          disposedBaker: refusal(() => {
            const spare = new LightProbeBaker(device, 4);
            spare.Dispose();
            spare.BakeProbe(ORIGIN, () => {});
          }),
        };
        return result;
      } finally {
        for (const resource of owned.reverse()) {
          try {
            resource.Dispose();
          } catch {
            // A cleanup failure must not replace the failure that matters.
          }
        }
      }
    });

    // --- the atmosphere: a drawn sky against the model that drew it -------------------------------
    //
    // The strongest form this file can take. CNA ships the scattering model twice -- once as the
    // GLSL the sky's shader runs, and once as `cna_atmospheric_sky_radiance`, evaluated on the CPU
    // without a device -- and it ships a third route, `cna_skybox_compute_view_ray`, that says which
    // way a screen point looks. So every texel of a rendered sky has a prediction assembled from two
    // CNA routes that never touch the GPU, and the picture either agrees with it or does not.
    record("atmosphere", () => {
      const {
        AtmosphericSky, AtmosphericSkyMath, EnvironmentProcessor, IsGraphicsExtensionLayerAvailable,
        RenderPipeline, Skybox,
      } = computeModule;
      const SIZE = 32;
      const owned = [];
      try {
        let sky;
        try {
          sky = new AtmosphericSky(device);
        } catch (error) {
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        owned.push(sky);
        const result = { size: SIZE, supported: sky.IsSupported };
        if (!result.supported) return result;

        const target = new Graphics.RenderTarget2D(device, SIZE, SIZE);
        owned.push(target);
        const pixels = new Array(SIZE * SIZE);
        // A camera looking along -Z with a square 90-degree frustum, so a device coordinate is a
        // tangent offset and the sky fills the target from horizon to well above it.
        const view = Matrix.CreateLookAt(Vector3.Zero, new Vector3(0, 0, -1), Vector3.Up);
        const projection = Matrix.CreatePerspectiveFieldOfView(Math.PI / 2, 1, 0.1, 100);
        result.view = matrixRow(view);
        result.projection = matrixRow(projection);
        const drawSky = () => {
          device.SetRenderTarget(target);
          try {
            device.Clear(new Color(0, 0, 0, 255));
            sky.Draw(view, projection, SIZE, SIZE);
          } finally {
            device.SetRenderTarget(null);
          }
          target.GetData(pixels);
          return pixels.map((texel) => [texel.R, texel.G, texel.B, texel.A]);
        };
        // The prediction, from the two routes that never touch the GPU: which way each texel looks,
        // and what the model says arrives from there.
        const predictSky = (sunDirection, turbidity, intensity) => {
          const predicted = new Array(SIZE * SIZE);
          for (let y = 0; y < SIZE; y += 1) {
            for (let x = 0; x < SIZE; x += 1) {
              const ndcX = ((x + 0.5) / SIZE) * 2 - 1;
              const ndcY = ((y + 0.5) / SIZE) * 2 - 1;
              const ray = AtmosphericSkyMath.ViewRay(view, projection, ndcX, ndcY, 0);
              const radiance = AtmosphericSkyMath.Radiance(ray, sunDirection, turbidity);
              predicted[y * SIZE + x] = [radiance.X, radiance.Y, radiance.Z].map(
                (channel) => Math.round(Math.min(Math.max(channel * intensity, 0), 1) * 255),
              );
            }
          }
          return predicted;
        };

        const NOON = new Vector3(0, -1, 0);
        // Light travelling down and to the left, so the sun itself is up and to the right --
        // inside this camera's 90-degree frustum rather than off the edge of it, which is what
        // makes the two halves of the picture different.
        const LOW_EAST = new Vector3(-0.6, -0.2, 0.8);
        const MIDNIGHT = new Vector3(0, 1, 0);
        // The last two are deliberately dim: at full intensity a turbid sky saturates the target,
        // and a clipped picture cannot show that haze brightens it. These two do not clip, so the
        // comparison between them is about the model rather than about the eight bits.
        const cases = [
          ["noon", NOON, 3, 1],
          ["lowSun", LOW_EAST, 1, 0.2],
          ["halfDim", NOON, 1, 0.1],
          ["night", MIDNIGHT, 3, 1],
          ["clearDim", NOON, 1, 0.2],
          ["hazyDim", NOON, 8, 0.2],
        ];
        result.cases = {};
        for (const [name, sunDirection, turbidity, intensity] of cases) {
          sky.SunDirection = sunDirection;
          sky.Turbidity = turbidity;
          sky.Intensity = intensity;
          result.cases[name] = {
            sun: [sky.SunDirection.X, sky.SunDirection.Y, sky.SunDirection.Z],
            turbidity: sky.Turbidity,
            intensity: sky.Intensity,
            drawn: drawSky(),
            predicted: predictSky(sunDirection, turbidity, intensity),
          };
        }
        sky.SunDirection = NOON;
        sky.Turbidity = 3;
        sky.Intensity = 1;

        // --- the captured sky ------------------------------------------------------------------
        //
        // Six faces, six flat colours, six cameras. Which cube-map convention CNA uses is not
        // assumed: what the test asserts is that the six directions produce six *different* flat
        // colours, each one of the six that were uploaded -- a bijection -- and that turning the sky
        // through a right angle moves one face's colour to where another's was.
        const FACE_COLOURS = [
          new Color(200, 20, 20, 255), new Color(20, 200, 20, 255), new Color(20, 20, 200, 255),
          new Color(200, 200, 20, 255), new Color(200, 20, 200, 255), new Color(20, 200, 200, 255),
        ];
        const environment = new Graphics.TextureCube(device, 4, false, Graphics.SurfaceFormat.Color);
        owned.push(environment);
        for (const [face, colour] of FACE_COLOURS.entries()) {
          environment.SetData(face, new Array(16).fill(colour));
        }
        const skybox = new Skybox(device, environment);
        owned.push(skybox);
        result.skybox = {
          supported: skybox.IsSupported,
          hasEnvironment: skybox.HasEnvironment,
          faceColours: FACE_COLOURS.map((colour) => colour.PackedValue),
        };
        if (result.skybox.supported) {
          const AXES = [
            [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
          ];
          const drawSkybox = (forward) => {
            const up = Math.abs(forward[1]) > 0.5 ? new Vector3(0, 0, 1) : Vector3.Up;
            const axisView = Matrix.CreateLookAt(Vector3.Zero, new Vector3(...forward), up);
            device.SetRenderTarget(target);
            try {
              device.Clear(new Color(0, 0, 0, 255));
              skybox.Draw(axisView, projection, SIZE, SIZE);
            } finally {
              device.SetRenderTarget(null);
            }
            target.GetData(pixels);
            // The middle of the picture. A ninety-degree frustum reaches past a cube face's own
            // forty-five degrees at the corners, so the edges of the image genuinely look at
            // neighbouring faces -- the middle quarter is the part that is all one face, and it is
            // what says the camera is looking at a flat face rather than across a seam.
            const centre = pixels[SIZE * (SIZE / 2) + SIZE / 2];
            const middle = new Set();
            for (let y = SIZE / 2 - 4; y < SIZE / 2 + 4; y += 1) {
              for (let x = SIZE / 2 - 4; x < SIZE / 2 + 4; x += 1) {
                middle.add(pixels[y * SIZE + x].PackedValue);
              }
            }
            return {
              centre: centre.PackedValue,
              middleColours: middle.size,
              distinctColours: new Set(pixels.map((texel) => texel.PackedValue)).size,
            };
          };
          result.skybox.axes = AXES.map(drawSkybox);
          // Turned a right angle about the up axis, so what was ahead is now to one side.
          skybox.Yaw = Math.PI / 2;
          result.skybox.turned = AXES.map(drawSkybox);
          skybox.Yaw = 0;
          // Intensity and tint multiply what was sampled, which is arithmetic on a flat face.
          skybox.Intensity = 0.5;
          result.skybox.dimmed = drawSkybox([0, 0, -1]);
          skybox.Intensity = 1;
          skybox.Tint = new Vector3(1, 0, 0);
          result.skybox.tinted = drawSkybox([0, 0, -1]);
          skybox.Tint = new Vector3(1, 1, 1);
          // With no environment there is nothing to sample, so the target keeps its clear.
          skybox.SetEnvironment(null);
          result.skybox.detached = drawSkybox([0, 0, -1]);
          result.skybox.detachedHasEnvironment = skybox.HasEnvironment;
          skybox.SetEnvironment(environment);
          result.skybox.reattached = drawSkybox([0, 0, -1]);
        }

        // --- the owned transfer, which consumes the caller's cube map ---------------------------
        const processor = new EnvironmentProcessor(device);
        owned.push(processor);
        const panorama = new Graphics.Texture2D(device, 8, 4);
        owned.push(panorama);
        panorama.SetData(Array.from(
          { length: 32 }, (_, index) => new Color(index * 8, 255 - index * 8, 128, 255),
        ));
        const generated = processor.ConvertEquirectangular(panorama, 8);
        result.generated = { size: generated.Size, levels: generated.LevelCount };
        const owning = new Skybox(device);
        owned.push(owning);
        owning.SetOwnedEnvironment(generated);
        result.transfer = {
          hasEnvironment: owning.HasEnvironment,
          // The wrapper handed over owns nothing now: using it again would be a use after free and
          // disposing it a double one, so it refuses both by name.
          cubeRefusesUse: (() => {
            try {
              generated.SetData(0, new Array(64).fill(Color.White));
              return "ACCEPTED";
            } catch (error) {
              return error.constructor.name;
            }
          })(),
          cubeDisposeIsSafe: (() => {
            try {
              generated.Dispose();
              return "ACCEPTED";
            } catch (error) {
              return error.constructor.name;
            }
          })(),
        };

        // --- and the pipeline's own borrow --------------------------------------------------------
        result.pipeline = (() => {
          const pipeline = new RenderPipeline(device);
          owned.push(pipeline);
          const before = pipeline.Skybox;
          pipeline.Skybox = skybox;
          const after = pipeline.Skybox;
          pipeline.Skybox = null;
          return {
            beforeIsNull: before === null,
            // The same object back, not a wrapper around a fresh borrow.
            sameObject: after === skybox,
            clearedIsNull: pipeline.Skybox === null,
          };
        })();

        const refusal = (body) => {
          try {
            body();
            return "ACCEPTED";
          } catch (error) {
            return error.cnaResult ?? error.constructor.name;
          }
        };
        result.refusals = {
          zeroWidth: refusal(() => sky.Draw(view, projection, 0, SIZE)),
          zeroHeight: refusal(() => skybox.Draw(view, projection, SIZE, 0)),
          disposedSky: refusal(() => {
            const spare = new AtmosphericSky(device);
            spare.Dispose();
            spare.Draw(view, projection, SIZE, SIZE);
          }),
        };
        return result;
      } finally {
        for (const resource of owned.reverse()) {
          try {
            resource.Dispose();
          } catch (error) {
            // A cleanup failure must not replace the failure that matters, but it is recorded:
            // a resource that will not release is exactly what leaves a game undestroyable.
            (this.evidence.atmosphereCleanup ??= []).push(
              `${error.constructor.name}: ${(error.message ?? "").slice(0, 90)}`,
            );
          }
        }
      }
    });

    // --- the other three shadow passes ------------------------------------------------------------
    //
    // A cascade, a spot cone and a point light's cube. Each has pure maths beside it that was
    // verified separately and touches no pass at all, so each pass can be checked against those
    // rather than against numbers recorded here: a cascade's splits against
    // ComputeCascadeSplitDistances, a spot's transform against ComputeSpotLightView times
    // ComputeSpotLightProjection, and a cube's face size against CubeSizeForQuality.
    record("otherShadowPasses", () => {
      const {
        CascadedShadowMap, CubeShadowMap, IsGraphicsExtensionLayerAvailable, ShadowMapMath,
        ShadowQuality, SpotShadowMap,
      } = computeModule;
      const NEAR = 1;
      const FAR = 200;
      const CASCADES = 3;
      const owned = [];
      try {
        let cascaded;
        try {
          cascaded = new CascadedShadowMap(device, ShadowQuality.Low, CASCADES);
        } catch (error) {
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        owned.push(cascaded);

        // A camera that looks across a wide scene, so the three cascades are three different
        // slices rather than three copies of one.
        const cameraView = Matrix.CreateLookAt(new Vector3(0, 5, 20), Vector3.Zero, Vector3.Up);
        const cameraProjection =
          Matrix.CreatePerspectiveFieldOfView(Math.PI / 3, 4 / 3, NEAR, FAR);
        const light = {
          Direction: new Vector3(-0.4, -1, -0.3), Color: new Vector3(1, 1, 1), Intensity: 1,
        };
        const LAMBDA = 0.6;
        const result = {
          near: NEAR,
          far: FAR,
          cascadeCount: CASCADES,
          lambda: LAMBDA,
          cascaded: {
            supported: cascaded.IsSupported,
            count: cascaded.CascadeCount,
            size: cascaded.CascadeSize,
            defaultLambda: cascaded.SplitLambda,
            defaultBand: cascaded.BlendBand,
            defaultTint: cascaded.IsDebugTintEnabled,
          },
        };
        cascaded.SplitLambda = LAMBDA;
        cascaded.BlendBand = 0.25;
        cascaded.IsDebugTintEnabled = true;
        result.cascaded.set = {
          lambda: cascaded.SplitLambda,
          band: cascaded.BlendBand,
          tint: cascaded.IsDebugTintEnabled,
        };
        cascaded.IsDebugTintEnabled = false;
        result.cascaded.tintOff = cascaded.IsDebugTintEnabled;
        cascaded.Update(light, cameraView, cameraProjection);
        result.cascaded.splits = Array.from(
          { length: CASCADES }, (_, index) => cascaded.GetSplitDistance(index),
        );
        // The same four numbers through a pure route that touches no map at all.
        result.cascaded.pureSplits = [...ShadowMapMath.ComputeCascadeSplitDistances(
          NEAR, FAR, CASCADES, LAMBDA,
        )];
        result.cascaded.matrices = Array.from(
          { length: CASCADES }, (_, index) => matrixRow(cascaded.GetCascadeMatrix(index)),
        );
        // The same camera under a different light. The splits cannot move -- they are the camera's
        // -- but every cascade's transform must, because a cascade is framed from the light.
        cascaded.Update(
          { Direction: new Vector3(0.9, -0.4, 0.1), Color: new Vector3(1, 1, 1), Intensity: 1 },
          cameraView, cameraProjection,
        );
        result.cascaded.underOtherLight = {
          matrices: Array.from(
            { length: CASCADES }, (_, index) => matrixRow(cascaded.GetCascadeMatrix(index)),
          ),
          splits: Array.from({ length: CASCADES }, (_, index) =>
            cascaded.GetSplitDistance(index)),
        };
        cascaded.Update(light, cameraView, cameraProjection);
        result.cascaded.selections = [0.5, 10, 30, 50, 90, 150, 400].map(
          (depth) => [depth, cascaded.SelectCascade(depth)],
        );
        // Snapping is a pure function and quantises to the cascade's own texel: two centres less
        // than a texel apart land on the same one, and the result is a whole number of texels.
        const SNAP_RADIUS = 10;
        const SNAP_SIZE = 512;
        result.cascaded.snap = {
          radius: SNAP_RADIUS,
          size: SNAP_SIZE,
          first: (() => {
            const value = CascadedShadowMap.SnapToTexelGrid(
              new Vector3(1.234, 5.678, -9.1), SNAP_RADIUS, SNAP_SIZE,
            );
            return [value.X, value.Y, value.Z];
          })(),
          nearby: (() => {
            const value = CascadedShadowMap.SnapToTexelGrid(
              new Vector3(1.24, 5.68, -9.1), SNAP_RADIUS, SNAP_SIZE,
            );
            return [value.X, value.Y, value.Z];
          })(),
          farther: (() => {
            const value = CascadedShadowMap.SnapToTexelGrid(
              new Vector3(1.4, 5.9, -9.1), SNAP_RADIUS, SNAP_SIZE,
            );
            return [value.X, value.Y, value.Z];
          })(),
        };
        const cascadeTexture = cascaded.ShadowTexture;
        result.cascaded.texture = {
          width: cascadeTexture.Width, height: cascadeTexture.Height,
          format: cascadeTexture.Format, cached: cascaded.ShadowTexture === cascadeTexture,
        };
        try {
          result.cascaded.effect = cascaded.CasterEffect.CurrentTechnique.Name;
        } catch (error) {
          result.cascaded.effect = `${error.constructor.name}`;
        }

        // A ground quad, cast into one cascade at a time. Each cascade owns its own slice of the
        // atlas, so which columns darken is what says Begin bound the cascade it was asked for.
        if (result.cascaded.supported) {
          const white = new Color(255, 255, 255, 255);
          const quad = (extent) => {
            const at = (x, z) => new Graphics.VertexPositionColor(
              new Vector3(x, 0, z), white,
            );
            return [
              at(-extent, -extent), at(extent, -extent), at(extent, extent),
              at(-extent, -extent), at(extent, extent), at(-extent, extent),
            ];
          };
          const texels = new Float32Array(cascadeTexture.Width * cascadeTexture.Height);
          const castInto = (index, extent) => {
            device.RasterizerState = Graphics.RasterizerState.CullNone;
            cascaded.Begin(index);
            try {
              cascaded.CasterEffect.CurrentTechnique.Passes.Get(0).Apply();
              device.DrawUserPrimitives(
                Graphics.PrimitiveType.TriangleList, quad(extent), 0, 2,
              );
            } finally {
              cascaded.End();
            }
            return survey();
          };
          // Every slice of the atlas separately: how many texels in it are nearer than the far
          // plane, and the nearest depth among them. A pass writes into one cascade's viewport and
          // leaves the others exactly as they were, so comparing whole surveys between casts is
          // what shows which slice each Begin actually bound.
          const survey = () => {
            cascadeTexture.GetData(texels);
            const slices = Array.from({ length: CASCADES }, () => ({ occluded: 0, low: Infinity }));
            for (let position = 0; position < texels.length; position += 1) {
              const x = position % cascadeTexture.Width;
              const slice = slices[Math.floor(x / result.cascaded.size)];
              if (texels[position] >= 1) continue;
              slice.occluded += 1;
              if (texels[position] < slice.low) slice.low = texels[position];
            }
            return slices.map((slice) => [slice.occluded, slice.low === Infinity ? 1 : slice.low]);
          };
          const emptyPass = (index) => {
            cascaded.Begin(index);
            cascaded.End();
            return survey();
          };
          // Every step surveyed, so what each one did is measured rather than assumed: a fresh
          // atlas, then one empty pass, then another over a different cascade, then two real casts.
          result.cascaded.steps = {
            fresh: survey(),
            emptyFirst: emptyPass(0),
            emptyMiddle: emptyPass(1),
            castFirst: castInto(0, 6),
            castLast: castInto(CASCADES - 1, 60),
            emptyMiddleAgain: emptyPass(1),
          };
        }

        // --- the spot cone -------------------------------------------------------------------
        const spot = new SpotShadowMap(device, ShadowQuality.Low);
        owned.push(spot);
        const SPOT_LIGHT = {
          Position: new Vector3(2, 8, -3),
          Direction: new Vector3(0, -1, 0.2),
          Color: new Vector3(1, 1, 1),
          Intensity: 2,
          Range: 40,
          InnerAngle: 0.3,
          OuterAngle: 0.6,
        };
        result.spot = {
          supported: spot.IsSupported,
          quality: spot.Quality,
          size: spot.Size,
          sizeForQuality: ShadowMapMath.SizeForQuality(ShadowQuality.Low),
          defaultBias: spot.DepthBias,
        };
        spot.DepthBias = 0.0123;
        result.spot.biasSet = spot.DepthBias;
        spot.Begin(SPOT_LIGHT);
        spot.End();
        result.spot.position = [
          spot.LightPosition.X, spot.LightPosition.Y, spot.LightPosition.Z,
        ];
        result.spot.range = spot.LightRange;
        result.spot.lightViewProjection = matrixRow(spot.LightViewProjection);
        // The same light through the two pure routes, which take a clustered light and touch no
        // map. The test multiplies them itself and checks the pass agrees.
        const asClustered = {
          Type: computeModule.ClusteredLightType.Spot,
          Position: SPOT_LIGHT.Position,
          Direction: SPOT_LIGHT.Direction,
          Color: SPOT_LIGHT.Color,
          Intensity: SPOT_LIGHT.Intensity,
          Range: SPOT_LIGHT.Range,
          InnerAngle: SPOT_LIGHT.InnerAngle,
          OuterAngle: SPOT_LIGHT.OuterAngle,
          CastsShadows: true,
        };
        result.spot.pureView = matrixRow(ShadowMapMath.ComputeSpotLightView(asClustered));
        result.spot.pureProjection =
          matrixRow(ShadowMapMath.ComputeSpotLightProjection(asClustered));
        const spotTexture = spot.ShadowTexture;
        result.spot.texture = {
          width: spotTexture.Width, height: spotTexture.Height, format: spotTexture.Format,
        };
        try {
          result.spot.effect = spot.CasterEffect.CurrentTechnique.Name;
        } catch (error) {
          result.spot.effect = `${error.constructor.name}`;
        }
        if (result.spot.supported) {
          const texels = new Float32Array(spotTexture.Width * spotTexture.Height);
          const white = new Color(255, 255, 255, 255);
          const groundAt = (y) => {
            const at = (x, z) => new Graphics.VertexPositionColor(
              new Vector3(x, y, z), white,
            );
            return [at(-6, -6), at(6, -6), at(6, 6), at(-6, -6), at(6, 6), at(-6, 6)];
          };
          const cast = (y) => {
            device.RasterizerState = Graphics.RasterizerState.CullNone;
            spot.Begin(SPOT_LIGHT);
            try {
              spot.CasterEffect.CurrentTechnique.Passes.Get(0).Apply();
              device.DrawUserPrimitives(
                Graphics.PrimitiveType.TriangleList, groundAt(y), 0, 2,
              );
            } finally {
              spot.End();
            }
            spotTexture.GetData(texels);
            let occluded = 0, low = Infinity;
            for (const depth of texels) {
              if (depth < 1) {
                occluded += 1;
                if (depth < low) low = depth;
              }
            }
            return { occluded, low };
          };
          // A floor under the light, and the same floor raised towards it: nearer the light is a
          // smaller recorded depth, and the closer surface covers more of the cone.
          result.spot.castLow = cast(0);
          result.spot.castHigh = cast(4);
          spot.Begin(SPOT_LIGHT);
          spot.End();
          spotTexture.GetData(texels);
          result.spot.emptyPass = {
            low: texels.reduce((lowest, value) => Math.min(lowest, value), Infinity),
          };
        }

        // --- the point light's cube ------------------------------------------------------------
        const cube = new CubeShadowMap(device, ShadowQuality.Low);
        owned.push(cube);
        const POINT_LIGHT = {
          Position: new Vector3(-1, 3, 2), Color: new Vector3(1, 1, 1), Intensity: 1, Range: 25,
        };
        result.cube = {
          supported: cube.IsSupported,
          quality: cube.Quality,
          size: cube.Size,
          cubeSizeForQuality: ShadowMapMath.CubeSizeForQuality(ShadowQuality.Low),
          flatSizeForQuality: ShadowMapMath.SizeForQuality(ShadowQuality.Low),
          defaultBias: cube.DepthBias,
        };
        cube.DepthBias = 0.006;
        result.cube.biasSet = cube.DepthBias;
        cube.Update(POINT_LIGHT);
        result.cube.position = [
          cube.LightPosition.X, cube.LightPosition.Y, cube.LightPosition.Z,
        ];
        result.cube.range = cube.LightRange;
        const cubeTexture = cube.ShadowTexture;
        result.cube.texture = {
          size: cubeTexture.Size, format: cubeTexture.Format, levels: cubeTexture.LevelCount,
          cached: cube.ShadowTexture === cubeTexture,
        };
        try {
          result.cube.effect = cube.CasterEffect.CurrentTechnique.Name;
        } catch (error) {
          result.cube.effect = `${error.constructor.name}`;
        }
        const attempt = (body) => {
          try {
            body();
            return "ACCEPTED";
          } catch (error) {
            return error.cnaResult ?? error.constructor.name;
          }
        };
        result.cube.faces = Array.from({ length: 6 }, (_, face) => attempt(() => {
          cube.Begin(face);
          cube.End();
        }));
        // The managed TextureCube transfer covers exact Color elements only, and a shadow cube is
        // Single -- an honest boundary rather than a reinterpretation.
        result.cube.readBack = attempt(
          () => cubeTexture.GetData(0, new Array(cubeTexture.Size * cubeTexture.Size)),
        );

        result.refusals = {
          cascadeOutside: attempt(() => cascaded.GetCascadeMatrix(CASCADES)),
          splitOutside: attempt(() => cascaded.GetSplitDistance(-1)),
          beginOutside: attempt(() => {
            cascaded.Begin(CASCADES);
            cascaded.End();
          }),
          faceOutside: attempt(() => {
            cube.Begin(6);
            cube.End();
          }),
          fractionalCascade: attempt(() => cascaded.GetCascadeMatrix(0.5)),
          nullSpotLight: attempt(() => spot.Begin(null)),
          nullPointLight: attempt(() => cube.Update(null)),
        };
        const spare = new SpotShadowMap(device, ShadowQuality.Low);
        spare.Dispose();
        result.refusals.disposed = attempt(() => spare.Begin(SPOT_LIGHT));
        return result;
      } finally {
        for (const resource of owned.reverse()) {
          try {
            resource.Dispose();
          } catch (error) {
            (this.evidence.otherShadowCleanup ??= []).push(
              `${error.constructor.name}: ${(error.message ?? "").slice(0, 90)}`,
            );
          }
        }
      }
    });


    // --- the post-process passes, as pixels -------------------------------------------------------
    //
    // Every pass here is checked against something that is not the pass. The colour grade is
    // checked against a LUT this test wrote and can rotate in JavaScript; the tonemapper against
    // TonemapPass.TonemapChannel, whose own agreement with the published curves is established
    // separately in the headless suite; the CRT scanlines against source x (1 - intensity); and the
    // rest against the exact identities their own parameters promise. The source is a gradient with
    // every texel distinct and no symmetry, so a flip, a mirror or a transpose fails here.
    record("postProcess", () => {
      const {
        AsciiPostProcessEffect, BloomPass, ChromaticAberrationPass, ColorGradePass, CrtEffect,
        CrtMaskType, CubeLut, DepthEffect, DepthEffectMode, DitherMode, EffectPass, FilmGrainPass,
        FullscreenPass, FxaaPass, IsGraphicsExtensionLayerAvailable, LensFlarePass,
        LutInterpolation, MotionBlurPass, TonemapPass, TonemappingMode,
      } = computeModule;
      const N = 4;
      const owned = [];
      try {
        let blit;
        try {
          blit = new FullscreenPass(device);
        } catch (error) {
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        owned.push(blit);

        // Distinct in all three channels and in both axes, and not symmetric under any flip.
        const texels = [];
        for (let y = 0; y < N; y += 1) {
          for (let x = 0; x < N; x += 1) {
            texels.push(new Color(16 + x * 60, 8 + y * 70, 250 - (x + y) * 30, 255));
          }
        }
        const source = new Graphics.Texture2D(device, N, N);
        owned.push(source);
        source.SetData(texels);
        const read = (texture, count) => {
          const pixels = new Array(count);
          texture.GetData(pixels);
          return pixels.map((color) => [color.R, color.G, color.B, color.A]);
        };
        const sourcePixels = read(source, N * N);

        // Runs one pass over the gradient into its own target, and gives the target back.
        const through = (pass, tune) => {
          const destination = new Graphics.RenderTarget2D(device, N, N);
          try {
            tune?.(pass);
            pass.Apply({ Source: source, Destination: destination, Width: N, Height: N });
            return read(destination, N * N);
          } finally {
            destination.Dispose();
          }
        };
        const withPass = (make, tune) => {
          const pass = make();
          try {
            return through(pass, tune);
          } finally {
            pass.Dispose();
          }
        };

        const result = { source: sourcePixels };

        // --- the colour grade -------------------------------------------------------------------
        // A size-2 cube whose transfer is the channel rotation (r,g,b) -> (b,r,g). That map is
        // linear in each channel, so trilinear interpolation of the eight corners reproduces it
        // exactly for every input -- which is why the expected output can be computed here texel by
        // texel rather than sampled off a run.
        const corners = [
          [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
        ];
        const rotate = ([r, g, b]) => [b, r, g];
        const cube = CubeLut.Parse(
          ['TITLE "rotate"', "LUT_3D_SIZE 2", ...corners.map((c) => rotate(c).join(" "))].join("\n"),
        );
        owned.push(cube);
        const strip = cube.CreateStripTexture(device);
        owned.push(strip);
        const volume = cube.CreateVolumeTexture(device);
        owned.push(volume);
        result.lut = {
          stripSize: [strip.Width, strip.Height],
          volumeSize: [volume.Width, volume.Height, volume.Depth],
          size: cube.Size,
        };
        result.grade = {
          fullStrip: withPass(() => new ColorGradePass(device), (p) => {
            p.SetLut(strip);
            p.Strength = 1;
            p.Interpolation = LutInterpolation.Trilinear;
          }),
          fullVolume: withPass(() => new ColorGradePass(device), (p) => {
            p.SetVolumeLut(volume);
            p.Strength = 1;
          }),
          half: withPass(() => new ColorGradePass(device), (p) => {
            p.SetLut(strip);
            p.Strength = 0.5;
          }),
          zeroStrength: withPass(() => new ColorGradePass(device), (p) => {
            p.SetLut(strip);
            p.Strength = 0;
          }),
          noLut: withPass(() => new ColorGradePass(device), (p) => { p.Strength = 1; }),
        };
        // The pass reports which kind of table it holds, and forgets one when told to.
        const grade = new ColorGradePass(device);
        try {
          result.grade.hasNothing = [grade.HasLut, grade.HasVolumeLut];
          grade.SetLut(strip);
          result.grade.hasStrip = [grade.HasLut, grade.HasVolumeLut];
          grade.SetVolumeLut(volume);
          result.grade.hasBoth = [grade.HasLut, grade.HasVolumeLut];
          grade.SetLut(null);
          grade.SetVolumeLut(null);
          result.grade.hasNeitherAgain = [grade.HasLut, grade.HasVolumeLut];
          grade.Interpolation = LutInterpolation.Tetrahedral;
          result.grade.interpolation = grade.Interpolation;
          grade.Strength = 0.375;
          result.grade.strength = grade.Strength;
        } finally {
          grade.Dispose();
        }

        // --- the tonemapper ----------------------------------------------------------------------
        result.tonemap = {
          identity: withPass(() => new TonemapPass(device), (p) => {
            p.Mode = TonemappingMode.None;
            p.Exposure = 1;
            p.Gamma = 1;
          }),
          quarterExposure: withPass(() => new TonemapPass(device), (p) => {
            p.Mode = TonemappingMode.None;
            p.Exposure = 0.25;
            p.Gamma = 1;
          }),
          gammaTwo: withPass(() => new TonemapPass(device), (p) => {
            p.Mode = TonemappingMode.None;
            p.Exposure = 1;
            p.Gamma = 2;
          }),
          reinhard: withPass(() => new TonemapPass(device), (p) => {
            p.Mode = TonemappingMode.Reinhard;
            p.Exposure = 1;
            p.Gamma = 1;
          }),
          aces: withPass(() => new TonemapPass(device), (p) => {
            p.Mode = TonemappingMode.Aces;
            p.Exposure = 1;
            p.Gamma = 1;
          }),
        };

        // --- what each pass's own "off" setting promises -------------------------------------------
        // Each of these is an identity by construction, not by luck: a bloom of no intensity adds
        // nothing, a threshold above every channel extracts nothing, a blur of no strength moves
        // nothing. A pass that ignored its parameter would fail here even though it "worked".
        result.identities = {
          bloomNoIntensity: withPass(() => new BloomPass(device), (p) => {
            p.Intensity = 0;
            p.Threshold = 0.5;
          }),
          bloomThresholdAboveAll: withPass(() => new BloomPass(device), (p) => {
            p.Intensity = 1;
            p.Threshold = 2;
          }),
          motionBlurNoStrength: withPass(() => new MotionBlurPass(device), (p) => { p.Strength = 0; }),
          flareNoIntensity: withPass(() => new LensFlarePass(device), (p) => { p.Intensity = 0; }),
          flareThresholdAboveAll: withPass(() => new LensFlarePass(device), (p) => {
            p.Intensity = 1;
            p.Threshold = 2;
          }),
          aberrationNoStrength: withPass(
            () => new ChromaticAberrationPass(device), (p) => { p.Strength = 0; },
          ),
          grainNoIntensity: withPass(() => new FilmGrainPass(device), (p) => { p.Intensity = 0; }),
        };
        // A fullscreen pass with no effect is the layer's own blit, which must be an exact copy.
        const blitTarget = new Graphics.RenderTarget2D(device, N, N);
        try {
          blit.Draw(source, blitTarget, null, N, N);
          result.identities.blit = read(blitTarget, N * N);
        } finally {
          blitTarget.Dispose();
        }

        // --- the passes that must change something --------------------------------------------------
        result.changed = {
          bloom: withPass(() => new BloomPass(device), (p) => {
            p.Threshold = 0.5;
            p.Intensity = 1;
            p.Iterations = 1;
          }),
          aberration: withPass(
            () => new ChromaticAberrationPass(device), (p) => { p.Strength = 0.25; },
          ),
          grain: withPass(() => new FilmGrainPass(device), (p) => { p.Intensity = 0.5; }),
          fxaa: withPass(() => new FxaaPass(device)),
        };

        // --- the CRT effect, drawn through the fullscreen pass ---------------------------------------
        // A flat grey source, so the pattern the shader adds is the only thing in the output. Every
        // parameter is turned off first: that identity is what makes each later change attributable.
        const FLAT = 200;
        const GRID = 8;
        const flat = new Graphics.Texture2D(device, GRID, GRID);
        owned.push(flat);
        flat.SetData(new Array(GRID * GRID).fill(0).map(() => new Color(FLAT, FLAT, FLAT, 255)));
        const crtThrough = (tune) => {
          const effect = CrtEffect.Create(device);
          const target = new Graphics.RenderTarget2D(device, GRID, GRID);
          try {
            CrtEffect.SetScanlineIntensity(effect, 0);
            CrtEffect.SetCurvature(effect, 0);
            CrtEffect.SetVignetteIntensity(effect, 0);
            CrtEffect.SetMaskIntensity(effect, 0);
            tune?.(effect);
            blit.Draw(flat, target, effect, GRID, GRID);
            return read(target, GRID * GRID);
          } finally {
            target.Dispose();
            effect.Dispose();
          }
        };
        result.crt = {
          flatValue: FLAT,
          grid: GRID,
          allOff: crtThrough(),
          scanlinesHalf: crtThrough((e) => CrtEffect.SetScanlineIntensity(e, 0.5)),
          scanlinesQuarter: crtThrough((e) => CrtEffect.SetScanlineIntensity(e, 0.25)),
          vignette: crtThrough((e) => CrtEffect.SetVignetteIntensity(e, 1)),
        };
        const crtState = CrtEffect.Create(device);
        try {
          result.crt.defaults = [
            CrtEffect.GetScanlineIntensity(crtState), CrtEffect.GetCurvature(crtState),
            CrtEffect.GetVignetteIntensity(crtState), CrtEffect.GetMaskIntensity(crtState),
            CrtEffect.GetMaskType(crtState),
          ];
          // Every value here differs from the default it replaces, so a setter that did nothing
          // would be caught rather than agreeing with itself.
          CrtEffect.SetScanlineIntensity(crtState, 0.4375);
          CrtEffect.SetCurvature(crtState, 0.5);
          CrtEffect.SetVignetteIntensity(crtState, 0.75);
          CrtEffect.SetMaskIntensity(crtState, 0.125);
          CrtEffect.SetMaskType(crtState, CrtMaskType.ShadowMask);
          result.crt.set = [
            CrtEffect.GetScanlineIntensity(crtState), CrtEffect.GetCurvature(crtState),
            CrtEffect.GetVignetteIntensity(crtState), CrtEffect.GetMaskIntensity(crtState),
            CrtEffect.GetMaskType(crtState),
          ];
          result.crt.technique = crtState.CurrentTechnique.Name;
        } finally {
          crtState.Dispose();
        }

        const depthEffect = DepthEffect.Create(device);
        try {
          result.depthEffect = {
            defaults: [DepthEffect.GetMode(depthEffect), DepthEffect.GetDitherMode(depthEffect)],
            technique: depthEffect.CurrentTechnique.Name,
          };
          DepthEffect.SetMode(depthEffect, DepthEffectMode.Grayscale1Bit);
          DepthEffect.SetDitherMode(depthEffect, DitherMode.Bayer8X8);
          result.depthEffect.set = [
            DepthEffect.GetMode(depthEffect), DepthEffect.GetDitherMode(depthEffect),
          ];
        } finally {
          depthEffect.Dispose();
        }

        // --- the ASCII effect's grid ------------------------------------------------------------------
        // The grid comes from the SOURCE size over the cell size, not from the rectangle it is drawn
        // into: a 32x24 source in 8x12 cells is 4x2 no matter how large the destination is.
        const asciiSource = new Graphics.Texture2D(device, 32, 24);
        owned.push(asciiSource);
        asciiSource.SetData(new Array(32 * 24).fill(0).map(
          (_, i) => new Color(i % 256, (i * 3) % 256, (i * 7) % 256, 255),
        ));
        const asciiTarget = new Graphics.RenderTarget2D(device, 64, 48);
        const ascii = new AsciiPostProcessEffect(device);
        try {
          const before = ascii.LastGridDimensions;
          const drawWith = (width, height) => {
            ascii.SetCellSize(width, height);
            device.SetRenderTarget(asciiTarget);
            device.Clear(new Color(0, 0, 0, 255));
            try {
              ascii.Draw(asciiSource, new Rectangle(0, 0, 64, 48));
            } finally {
              device.SetRenderTarget(null);
            }
            const grid = ascii.LastGridDimensions;
            return [grid.Columns, grid.Rows];
          };
          result.ascii = {
            sourceSize: [asciiSource.Width, asciiSource.Height],
            destinationSize: [asciiTarget.Width, asciiTarget.Height],
            beforeAnyDraw: [before.Columns, before.Rows],
            cell8x12: drawWith(8, 12),
            cell4x4: drawWith(4, 4),
            cell16x8: drawWith(16, 8),
            defaultCell: (() => {
              const fresh = new AsciiPostProcessEffect(device);
              try {
                return [fresh.CellSize.Width, fresh.CellSize.Height, fresh.QuantizeMode];
              } finally {
                fresh.Dispose();
              }
            })(),
            isBorrowed: ascii.IsBorrowed,
          };
        } finally {
          ascii.Dispose();
          asciiTarget.Dispose();
        }

        // --- finding 17: the effect pass's borrow -------------------------------------------------------
        // cna_post_process_effect_pass_get_effect says "do not destroy it" and mints a registered
        // handle anyway. HasEffect releases it; this reads it either side of a detach and a
        // reattach, and the game's own clean shutdown at the end of this file is the other half of
        // the evidence -- a leaked borrow makes cna_game_destroy refuse for the rest of the process.
        const passEffect = CrtEffect.Create(device);
        try {
          const pass = new EffectPass(device, passEffect, "crt");
          try {
            result.effectPass = { name: pass.Name, supported: pass.IsSupportedOn(device) };
            result.effectPass.reads = [];
            for (let i = 0; i < 4; i += 1) result.effectPass.reads.push(pass.HasEffect);
            pass.SetEffect(null);
            result.effectPass.afterDetach = pass.HasEffect;
            pass.SetEffect(passEffect);
            result.effectPass.afterReattach = pass.HasEffect;
          } finally {
            pass.Dispose();
          }
        } finally {
          passEffect.Dispose();
        }
        // An owning pass takes the effect, so the caller's own Dispose must become a refusal
        // rather than a second release of the same object.
        const ownedEffect = CrtEffect.Create(device);
        const owningPass = EffectPass.CreateOwning(device, ownedEffect, "owned-crt");
        try {
          result.owningPass = { name: owningPass.Name, hasEffect: owningPass.HasEffect };
          try {
            ownedEffect.Dispose();
            result.owningPass.callerDisposeAfterTransfer = "SUCCEEDED";
          } catch (error) {
            result.owningPass.callerDisposeAfterTransfer = error.constructor.name;
          }
        } finally {
          owningPass.Dispose();
        }

        // --- the ASCII pass and the effect it lends -------------------------------------------------
        // The pass's effect is a borrow: setting through it changes the pass's own, and giving it
        // back does not destroy it.
        const asciiPass = new computeModule.AsciiPass(device);
        try {
          const lent = asciiPass.Effect;
          result.asciiPass = {
            name: asciiPass.Name,
            borrowed: lent.IsBorrowed,
            sameObjectTwice: asciiPass.Effect === lent,
            cellBefore: [lent.CellSize.Width, lent.CellSize.Height],
          };
          lent.SetCellSize(12, 16);
          lent.QuantizeMode = computeModule.AsciiQuantizeMode.BlackWhite;
          const again = asciiPass.Effect;
          result.asciiPass.cellAfter = [again.CellSize.Width, again.CellSize.Height];
          result.asciiPass.quantizeAfter = again.QuantizeMode;
        } finally {
          asciiPass.Dispose();
        }

        return result;
      } finally {
        for (const resource of owned.reverse()) {
          try {
            resource.Dispose();
          } catch (error) {
            (this.evidence.postProcessCleanup ??= []).push(
              `${error.constructor.name}: ${(error.message ?? "").slice(0, 90)}`,
            );
          }
        }
      }
    });

    // --- the physically-based effects on a real renderer -------------------------------------------
    //
    // The value semantics are qualified headless, where they belong. What only a GPU-backed
    // renderer can answer is whether a PBR effect is a real compiled effect there -- HEADLESS
    // constructs one and refuses to execute it -- and whether a material's state reaches CNA's
    // device rather than the wrapper's cached copy.
    record("pbrMaterial", () => {
      const {
        AlphaMode, CreatePbrMaterialExt, GltfMaterialBridge, IsGraphicsExtensionLayerAvailable,
        PbrEffect, PbrMaterialExtOperations, PbrMaterialExtensions, PbrTextureSlot,
        SkinnedPbrEffect,
      } = computeModule;
      const owned = [];
      try {
        let effect;
        try {
          effect = PbrEffect.Create(device);
        } catch (error) {
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        owned.push(effect);
        const skinned = SkinnedPbrEffect.Create(device);
        owned.push(skinned);
        const result = {
          technique: effect.CurrentTechnique.Name,
          passCount: effect.CurrentTechnique.Passes.Count,
          skinnedTechnique: skinned.CurrentTechnique.Name,
        };
        // A stock effect's pass applies for real here; HEADLESS answers not-supported.
        result.apply = (() => {
          try {
            effect.CurrentTechnique.Passes.Get(0).Apply();
            return "SUCCESS";
          } catch (error) {
            return `result ${error.cnaResult}`;
          }
        })();

        const texture = new Graphics.Texture2D(device, 2, 2);
        owned.push(texture);
        texture.SetData([
          new Color(200, 100, 40, 255), new Color(40, 200, 100, 255),
          new Color(100, 40, 200, 255), new Color(255, 255, 255, 255),
        ]);
        const material = CreatePbrMaterialExt();
        material.AlbedoColor = new Color(200, 100, 40, 128);
        material.MetallicFactor = 0.25;
        material.RoughnessFactor = 0.75;
        material.Ior = 1.75;
        material.AlphaMode = AlphaMode.Blend;
        material.DoubleSided = true;
        material.AlbedoTexture = texture;
        material.TextureCoordinateSets[PbrTextureSlot.Normal] = 1;
        PbrEffect.ApplyMaterial(effect, material);
        const extracted = PbrEffect.ExtractMaterial(effect);
        // A material carrying a texture cannot come back whole: CNA answers with a raw handle and
        // this layer will not invent an owner for it, so the extracted material's slots are empty.
        // What must be true is that *only* the slots differ, which is what the second comparison
        // says -- the same material with its slot cleared is the extracted one exactly.
        const withoutTexture = { ...material, AlbedoTexture: null };
        result.roundTrip = PbrMaterialExtOperations.Equals(withoutTexture, extracted);
        result.roundTripWithTexture = PbrMaterialExtOperations.Equals(material, extracted);
        result.throughAccessors = {
          metallic: PbrEffect.GetMetallicFactor(effect),
          ior: PbrEffect.GetIor(effect),
          alphaMode: PbrEffect.GetAlphaMode(effect),
          doubleSided: PbrEffect.GetDoubleSided(effect),
          normalSet: PbrEffect.GetTextureCoordinateSet(effect, PbrTextureSlot.Normal),
        };
        // Finding 19: the slots have two sources of truth. A texture applied with a material is
        // invisible to the slot getter, the setter's texture is invisible to the extractor, and a
        // material with an empty slot does not clear one the setter filled. All three rows are
        // asserted so a repair fails here rather than passing unnoticed.
        result.slots = {
          afterApplyWithTexture: PbrEffect.GetTexture(effect, PbrTextureSlot.BaseColor) !== 0n,
        };
        PbrEffect.SetTexture(effect, PbrTextureSlot.BaseColor, texture);
        result.slots.afterSetTexture =
          PbrEffect.GetTexture(effect, PbrTextureSlot.BaseColor) !== 0n;
        result.slots.extractedAfterSetTexture =
          PbrEffect.ExtractMaterial(effect).AlbedoTexture;
        PbrEffect.ApplyMaterial(effect, { ...material, AlbedoTexture: null });
        result.slots.afterEmptyApply =
          PbrEffect.GetTexture(effect, PbrTextureSlot.BaseColor) !== 0n;
        PbrEffect.SetTexture(effect, PbrTextureSlot.BaseColor, null);
        // A material's own state reaches CNA's device. Read back from CNA, and predicted from the
        // XNA states its implementation names rather than from numbers recorded here.
        PbrMaterialExtOperations.ApplyState(material, device);
        const blended = PbrMaterialExtOperations.ReadDeviceBlendState(device);
        const blendedCull = PbrMaterialExtOperations.ReadDeviceRasterizerState(device).CullMode;
        material.AlphaMode = AlphaMode.Opaque;
        material.DoubleSided = false;
        PbrMaterialExtOperations.ApplyState(material, device);
        const opaque = PbrMaterialExtOperations.ReadDeviceBlendState(device);
        const opaqueCull = PbrMaterialExtOperations.ReadDeviceRasterizerState(device).CullMode;
        result.state = {
          blendedSource: blended.ColorSourceBlend,
          blendedDestination: blended.ColorDestinationBlend,
          blendedCull,
          opaqueSource: opaque.ColorSourceBlend,
          opaqueDestination: opaque.ColorDestinationBlend,
          opaqueCull,
        };
        // The glTF bridge and the extension set both work here as they do headless.
        const source = GltfMaterialBridge.CreateSource();
        source.BaseColorFactor = new Vector4(1, 0.5, 0.25, 0.5);
        source.Ior = 1.75;
        const built = GltfMaterialBridge.BuildMaterial(
          source, GltfMaterialBridge.CreateTextures());
        result.bridge = {
          albedo: [built.AlbedoColor.R, built.AlbedoColor.G, built.AlbedoColor.B, built.AlbedoColor.A],
          ior: built.Ior,
        };
        const set = new PbrMaterialExtensions();
        try {
          const neutral = set.IsNeutral;
          set.ClearcoatFactor = 0.5;
          set.SetClearcoatTexture(texture);
          result.extensions = {
            neutral,
            afterEdit: set.IsNeutral,
            clearcoat: set.ClearcoatFactor,
            textureFilled: set.GetClearcoatTexture() !== 0n,
          };
          set.SetClearcoatTexture(null);
        } finally {
          set.Dispose();
        }
        // The skinned effect's own state, on a renderer that has real shaders.
        SkinnedPbrEffect.SetWeightsPerVertex(skinned, 2);
        SkinnedPbrEffect.SetBoneTransforms(
          skinned, [Matrix.Identity, Matrix.CreateTranslation(new Vector3(3, 4, 5))]);
        const bones = SkinnedPbrEffect.GetBoneTransforms(skinned, 2);
        result.skinned = {
          weights: SkinnedPbrEffect.GetWeightsPerVertex(skinned),
          count: bones.length,
          translation: [bones[1].M41, bones[1].M42, bones[1].M43],
        };
        return result;
      } finally {
        for (const resource of owned.reverse()) {
          try {
            resource.Dispose();
          } catch (error) {
            (this.evidence.pbrCleanup ??= []).push(
              `${error.constructor.name}: ${(error.message ?? "").slice(0, 90)}`,
            );
          }
        }
      }
    });

    // --- the volumetric and atmospheric screen-space passes ----------------------------------------
    //
    // Their arithmetic is qualified headless against the closed forms. What a renderer adds is
    // whether the shaders run at all, whether each pass's own "off" setting is an exact copy, and
    // -- the aerial pass alone -- whether it says which input it was missing rather than drawing a
    // wrong picture. That last one is a three-state ladder: no depth, then no camera, then nothing.
    record("volumetric", () => {
      const {
        AerialPerspectivePass, DepthNormalPrepassMath, HeightFogPass, IsGraphicsExtensionLayerAvailable,
        LightShaftPass, VolumetricFogPass,
      } = computeModule;
      const N = 4;
      const FAR = 100;
      const HEIGHT = 8;
      const owned = [];
      try {
        let aerial;
        try {
          aerial = new AerialPerspectivePass(device);
        } catch (error) {
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        owned.push(aerial);
        const fog = new HeightFogPass(device);
        owned.push(fog);
        const shafts = new LightShaftPass(device);
        owned.push(shafts);
        const volumetric = new VolumetricFogPass(device);
        owned.push(volumetric);

        const result = {
          names: [aerial.Name, fog.Name, shafts.Name, volumetric.Name],
          supported: [
            aerial.IsSupportedOn(device), fog.IsSupportedOn(device),
            shafts.IsSupportedOn(device), volumetric.IsSupportedOn(device),
          ],
          defaults: {
            aerial: [aerial.Turbidity, aerial.Intensity, aerial.ScaleHeight],
            aerialSun: [aerial.SunDirection.X, aerial.SunDirection.Y, aerial.SunDirection.Z],
            aerialFallback: aerial.FallbackReason,
            fog: [fog.Density, fog.Falloff, fog.BaseHeight],
            fogColor: [fog.Color.X, fog.Color.Y, fog.Color.Z],
            shafts: [shafts.Threshold, shafts.Intensity, shafts.Decay],
            shaftPosition: [shafts.LightScreenPosition.X, shafts.LightScreenPosition.Y],
            volumetric: [volumetric.Density, volumetric.Anisotropy, volumetric.Range],
          },
        };
        // Every setting written with a value no default equals, so a setter that did nothing shows.
        aerial.Turbidity = 3.5;
        aerial.Intensity = 0.75;
        aerial.ScaleHeight = 1200;
        aerial.SunDirection = new Vector3(0.1, 0.9, 0.2);
        fog.Density = 0.005;
        fog.Falloff = 0.25;
        fog.BaseHeight = 0;
        fog.Color = new Vector3(0.6, 0.7, 0.8);
        shafts.Threshold = 0.625;
        shafts.Intensity = 0.875;
        shafts.Decay = 0.9;
        shafts.LightScreenPosition = new Vector2(0.25, 0.75);
        volumetric.Density = 0.125;
        volumetric.Anisotropy = -0.4;
        volumetric.Range = 250;
        volumetric.SetLight(null, new Vector3(0, -1, 0), new Vector3(1, 0.9, 0.8));
        result.written = {
          aerial: [aerial.Turbidity, aerial.Intensity, aerial.ScaleHeight,
            aerial.SunDirection.X, aerial.SunDirection.Y, aerial.SunDirection.Z],
          fog: [fog.Density, fog.Falloff, fog.BaseHeight, fog.Color.X, fog.Color.Y, fog.Color.Z],
          shafts: [shafts.Threshold, shafts.Intensity, shafts.Decay,
            shafts.LightScreenPosition.X, shafts.LightScreenPosition.Y],
          volumetric: [volumetric.Density, volumetric.Anisotropy, volumetric.Range],
        };

        const source = new Graphics.Texture2D(device, N, N);
        owned.push(source);
        source.SetData(new Array(N * N).fill(0).map(() => new Color(200, 100, 40, 255)));
        // A depth image built with CNA's own packer, so the distances the shaders read are the
        // distances this test asked for rather than whatever raw bytes decode to.
        const depth = new Graphics.Texture2D(device, N, N);
        owned.push(depth);
        depth.SetData(new Array(N * N).fill(0).map((_, index) => {
          const packed = DepthNormalPrepassMath.PackDepth(0.2 + (index / (N * N)) * 0.5);
          return new Color(packed.R, packed.G, packed.B, packed.A);
        }));
        result.usesPackedDepth = DepthNormalPrepassMath.UsesPackedDepth(device);
        const read = (texture) => {
          const pixels = new Array(N * N);
          texture.GetData(pixels);
          return pixels.map((color) => [color.R, color.G, color.B]);
        };
        const sourcePixels = read(source);
        const run = (pass, extra) => {
          const destination = new Graphics.RenderTarget2D(device, N, N);
          try {
            pass.Apply({
              Source: source, Destination: destination, Width: N, Height: N, ...extra,
            });
            return read(destination);
          } finally {
            destination.Dispose();
          }
        };
        const copied = (pixels) => pixels.every(
          (texel, index) => texel.every((value, channel) => value === sourcePixels[index][channel]));

        // A level camera down -Z from a height, which is the branch of the closed form where a
        // ray neither climbs nor descends.
        const view = Matrix.CreateLookAt(
          new Vector3(0, HEIGHT, 0), new Vector3(0, HEIGHT, -10), Vector3.Up);
        const down = Matrix.CreateLookAt(
          new Vector3(0, HEIGHT, 0), new Vector3(0, 0, -10), Vector3.Up);
        const projection = Matrix.CreatePerspectiveFieldOfView(0.15, 1, 1, FAR);
        const camera = {
          SourceDepth: depth, NearPlane: 1, FarPlane: FAR, Projection: projection,
          InverseProjection: Matrix.Invert(projection), InverseView: Matrix.Invert(view),
        };

        // The aerial pass's three-state ladder.
        result.ladder = [];
        result.ladder.push({ drew: !copied(run(aerial, {})), reason: aerial.FallbackReason });
        result.ladder.push({
          drew: !copied(run(aerial, { SourceDepth: depth, NearPlane: 1, FarPlane: FAR })),
          reason: aerial.FallbackReason,
        });
        run(aerial, camera);
        result.ladder.push({ reason: aerial.FallbackReason });

        // Each pass's own "off" setting, which must be an exact copy.
        aerial.Intensity = 0;
        result.identities = { aerialNoIntensity: copied(run(aerial, camera)) };
        aerial.Intensity = 0.75;
        fog.Density = 0;
        result.identities.fogNoDensity = copied(run(fog, camera));
        shafts.Intensity = 0;
        result.identities.shaftsNoIntensity = copied(run(shafts, camera));
        shafts.Intensity = 0.875;
        volumetric.Density = 0;
        result.identities.volumetricNoDensity = copied(run(volumetric, camera));
        volumetric.Density = 0.125;
        result.identities.fogNoDepth = (() => {
          fog.Density = 0.005;
          return copied(run(fog, {}));
        })();

        // Turned on, the fog must move every texel towards its own colour, further at every step,
        // and a descending ray must gather more than a level one -- both signs the closed form
        // gives, neither of them a number recorded here.
        result.fogSweep = [0.001, 0.005, 0.02].map((density) => {
          fog.Density = density;
          return { density, pixels: run(fog, camera) };
        });
        fog.Density = 0.005;
        result.fogDescending = run(fog, { ...camera, InverseView: Matrix.Invert(down) });
        fog.Density = 5;
        result.fogSaturated = run(fog, camera);
        fog.Density = 0.005;
        result.shaftsDrew = !copied(run(shafts, camera));
        result.volumetricDrew = !copied(run(volumetric, camera));
        result.sourcePixels = sourcePixels;
        result.fogColorBytes = [
          Math.round(fog.Color.X * 255), Math.round(fog.Color.Y * 255),
          Math.round(fog.Color.Z * 255),
        ];
        return result;
      } finally {
        for (const resource of owned.reverse()) {
          try {
            resource.Dispose();
          } catch (error) {
            (this.evidence.volumetricCleanup ??= []).push(
              `${error.constructor.name}: ${(error.message ?? "").slice(0, 90)}`,
            );
          }
        }
      }
    });

    // --- the GPU instance culler, which is upstream finding 20 --------------------------------------
    //
    // Only a renderer with compute shaders can run it, and only OPENGLES3 here does. What is
    // recorded is the count it reads back beside what this package's own BoundingFrustum says
    // about the same boxes, so the two cullers are compared with each other rather than with a
    // number written down.
    record("gpuCulling", () => {
      const { GpuInstanceCuller, IsGraphicsExtensionLayerAvailable } = computeModule;
      const view = Matrix.CreateLookAt(new Vector3(0, 0, 10), Vector3.Zero, Vector3.Up);
      const projection = Matrix.CreatePerspectiveFieldOfView(Math.PI / 4, 1, 1, 100);
      const reference = new BoundingFrustum(Matrix.Multiply(view, projection));
      const unit = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
      const cases = {
        allInside: [Vector3.Zero, new Vector3(0, 0, -5), new Vector3(0, 0, -20)],
        allOutside: [new Vector3(10000, 0, 0), new Vector3(-10000, 0, 0), new Vector3(0, 10000, 0)],
        mixed: [Vector3.Zero, new Vector3(10000, 0, 0), new Vector3(0, 0, -20), new Vector3(0, 0, 5000)],
        none: [],
      };
      let probe;
      try {
        probe = new GpuInstanceCuller(device);
      } catch (error) {
        return {
          layerAbsent: true,
          cnaResult: error.cnaResult,
          extensionLayer: IsGraphicsExtensionLayerAvailable(),
        };
      }
      const result = { supported: probe.IsSupported, reason: probe.UnsupportedReason };
      probe.Dispose();
      result.glslLength = GpuInstanceCuller.InstanceLookupGlsl.length;
      result.glsl = GpuInstanceCuller.InstanceLookupGlsl;
      result.rows = [];
      for (const [name, places] of Object.entries(cases)) {
        const culler = new GpuInstanceCuller(device);
        try {
          culler.SetInstances(places.map((place) => ({
            World: Matrix.CreateTranslation(place), Bounds: unit,
          })));
          const cpuVisible = places.filter((place) => reference.Intersects(new BoundingBox(
            Vector3.Add(place, unit.Min), Vector3.Add(place, unit.Max)))).length;
          const row = {
            name, offered: places.length, instanceCount: culler.InstanceCount, cpuVisible,
            beforeCull: culler.VisibleCount,
          };
          try {
            culler.Cull(view, projection, 36, 0, 0);
            row.culled = "ACCEPTED";
            row.gpuVisible = culler.VisibleCount;
          } catch (error) {
            row.culled = `result ${error.cnaResult}`;
          }
          result.rows.push(row);
        } finally {
          culler.Dispose();
        }
      }
      // What a bad draw is refused for, which is what makes the accepted ones mean something.
      const culler = new GpuInstanceCuller(device);
      try {
        culler.SetInstances([{ World: Matrix.Identity, Bounds: unit }]);
        const attempt = (body) => {
          try {
            body();
            return "SUCCEEDED";
          } catch (error) {
            return `${error.constructor.name}:${error.cnaResult ?? "-"}`;
          }
        };
        result.refusals = {
          zeroIndexCount: attempt(() => culler.Cull(view, projection, 0, 0, 0)),
          negativeFirstIndex: attempt(() => culler.Cull(view, projection, 36, -1, 0)),
          fractionalCount: attempt(() => culler.Cull(view, projection, 1.5, 0, 0)),
          nullView: attempt(() => culler.Cull(null, projection, 36, 0, 0)),
        };
      } finally {
        culler.Dispose();
      }
      return result;
    });

    // --- automatic exposure, the display output object and spatial upscaling ------------------------
    //
    // The display's transfer chain is qualified headless against the published standards. What
    // needs a renderer is the auto exposure, which measures a scene with a compute shader and so
    // answers NOT_SUPPORTED on HEADLESS, and the two objects that draw.
    record("exposure", () => {
      const { AutoExposure, DisplayColorSpace, HdrDisplayOutput, IsGraphicsExtensionLayerAvailable,
        SpatialUpscalePass } = computeModule;
      const owned = [];
      try {
        const result = {};
        // The display output object first, because it constructs everywhere.
        let output;
        try {
          output = new HdrDisplayOutput(device);
        } catch (error) {
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        owned.push(output);
        result.display = {
          supported: output.IsSupported,
          defaults: [output.ColorSpace, output.PaperWhiteNits, output.PeakNits],
        };
        output.ColorSpace = DisplayColorSpace.Hdr10;
        output.PaperWhiteNits = 250;
        output.PeakNits = 1500;
        result.display.written = [output.ColorSpace, output.PaperWhiteNits, output.PeakNits];

        const N = 4;
        const scene = new Graphics.Texture2D(device, N, N);
        owned.push(scene);
        scene.SetData(new Array(N * N).fill(0).map(() => new Color(200, 100, 40, 255)));
        const destination = new Graphics.RenderTarget2D(device, N, N);
        owned.push(destination);
        const read = () => {
          const pixels = new Array(N * N);
          destination.GetData(pixels);
          return pixels.map((color) => [color.R, color.G, color.B]);
        };
        const sourcePixels = (() => {
          const pixels = new Array(N * N);
          scene.GetData(pixels);
          return pixels.map((color) => [color.R, color.G, color.B]);
        })();
        result.display.srgbIsACopy = (() => {
          output.ColorSpace = DisplayColorSpace.Srgb;
          try {
            output.Draw(scene, destination, N, N);
          } catch (error) {
            return `result ${error.cnaResult}`;
          }
          const drawn = read();
          return drawn.every((texel, index) =>
            texel.every((value, channel) => value === sourcePixels[index][channel]));
        })();
        result.display.hdr10Differs = (() => {
          output.ColorSpace = DisplayColorSpace.Hdr10;
          try {
            output.Draw(scene, destination, N, N);
          } catch (error) {
            return `result ${error.cnaResult}`;
          }
          const drawn = read();
          return !drawn.every((texel, index) =>
            texel.every((value, channel) => value === sourcePixels[index][channel]));
        })();

        // Spatial upscaling: at the same size the pass has nothing to do, and it says so.
        const upscale = new SpatialUpscalePass(device);
        owned.push(upscale);
        result.upscale = {
          defaults: [upscale.Sharpness, upscale.EdgeAdaptive],
        };
        upscale.Sharpness = 0.625;
        upscale.EdgeAdaptive = false;
        result.upscale.written = [upscale.Sharpness, upscale.EdgeAdaptive];
        // A hard vertical edge rather than a flat colour: an upscale of a flat field is that field
        // whatever the sizes are, so a flat source cannot tell a 4x4-to-8x8 draw from an
        // 8x8-to-4x4 one. An edge can, and it also says where the edge landed.
        const edged = new Graphics.Texture2D(device, N, N);
        owned.push(edged);
        edged.SetData(new Array(N * N).fill(0).map(
          (_, index) => (index % N) < N / 2
            ? new Color(0, 0, 0, 255) : new Color(255, 255, 255, 255)));
        const bigger = new Graphics.RenderTarget2D(device, N * 2, N * 2);
        owned.push(bigger);
        result.upscale.drew = (() => {
          device.SetRenderTarget(bigger);
          try {
            // A clear colour that is neither side of the edge, so anything the pass fails to
            // write shows up as itself.
            device.Clear(new Color(20, 20, 20, 255));
            upscale.Draw(edged, N, N, N * 2, N * 2);
          } catch (error) {
            return `result ${error.cnaResult}`;
          } finally {
            device.SetRenderTarget(null);
          }
          const pixels = new Array(N * 2 * N * 2);
          bigger.GetData(pixels);
          return pixels.map((color) => color.R);
        })();

        // The auto exposure, which needs compute shaders.
        let exposure;
        try {
          exposure = new AutoExposure(device);
        } catch (error) {
          result.exposure = { unsupported: `result ${error.cnaResult}` };
          return result;
        }
        owned.push(exposure);
        const dark = new Graphics.Texture2D(device, N, N);
        owned.push(dark);
        dark.SetData(new Array(N * N).fill(0).map(() => new Color(8, 8, 8, 255)));
        const bright = new Graphics.Texture2D(device, N, N);
        owned.push(bright);
        bright.SetData(new Array(N * N).fill(0).map(() => new Color(255, 255, 255, 255)));
        const state = {
          defaults: [
            exposure.Exposure, exposure.KeyValue,
            exposure.BrighteningSpeed, exposure.DarkeningSpeed,
          ],
          measuredBright: exposure.MeasureAverageLuminance(bright),
          measuredDark: exposure.MeasureAverageLuminance(dark),
        };
        exposure.SetAdaptationSpeeds(2, 0.5);
        state.speeds = [exposure.BrighteningSpeed, exposure.DarkeningSpeed];
        exposure.KeyValue = 0.25;
        state.key = exposure.KeyValue;
        // Adapting to a bright scene closes the exposure down, step by step, never past its target.
        exposure.Exposure = 1;
        state.towardsBright = [];
        for (let step = 0; step < 5; step += 1) {
          state.towardsBright.push(exposure.Update(bright, 0.5));
        }
        exposure.Exposure = 1;
        state.towardsDark = [];
        for (let step = 0; step < 5; step += 1) {
          state.towardsDark.push(exposure.Update(dark, 0.5));
        }
        // A longer step moves further than a shorter one towards the same target.
        exposure.Exposure = 1;
        state.oneShortStep = exposure.Update(bright, 0.1);
        exposure.Exposure = 1;
        state.oneLongStep = exposure.Update(bright, 2);
        // And the range clamps it however long it runs.
        exposure.Exposure = 1;
        exposure.SetExposureRange(0.9, 1.1);
        state.clamped = [];
        for (let step = 0; step < 6; step += 1) state.clamped.push(exposure.Update(bright, 5));
        result.exposure = state;
        return result;
      } finally {
        for (const resource of owned.reverse()) {
          try {
            resource.Dispose();
          } catch (error) {
            (this.evidence.exposureCleanup ??= []).push(
              `${error.constructor.name}: ${(error.message ?? "").slice(0, 90)}`,
            );
          }
        }
      }
    });

    // --- contact shadows on a real renderer ----------------------------------------------------------
    //
    // Its two decisions are qualified headless against their closed forms. What a renderer adds is
    // that the pass compiles, that its own off switch is an exact copy, and that it names which
    // input it was missing rather than drawing a wrong picture -- a three-state ladder like the
    // aerial pass's, and the second state names a different input from that one's.
    record("contactShadow", () => {
      const { ContactShadowPass, DepthNormalPrepassMath, IsGraphicsExtensionLayerAvailable } =
        computeModule;
      const N = 4;
      const owned = [];
      try {
        let pass;
        try {
          pass = new ContactShadowPass(device);
        } catch (error) {
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        owned.push(pass);
        const result = {
          name: pass.Name,
          supported: pass.IsSupportedOn(device),
          defaults: {
            direction: [
              pass.LightDirection.X, pass.LightDirection.Y, pass.LightDirection.Z,
            ],
            maxDistance: pass.MaxDistance,
            stepCount: pass.StepCount,
            thickness: pass.Thickness,
            intensity: pass.Intensity,
            bias: pass.Bias,
          },
          fallbackBeforeAnyFrame: pass.FallbackReason,
        };
        // Every value differs from the default it replaces, the step count included -- CNA's own
        // default is twelve, so writing twelve would have proved nothing.
        pass.LightDirection = new Vector3(0.1, -0.9, 0.2);
        pass.MaxDistance = 0.625;
        pass.StepCount = 20;
        pass.Thickness = 0.375;
        pass.Intensity = 0.875;
        pass.Bias = 0.03125;
        result.written = {
          direction: [pass.LightDirection.X, pass.LightDirection.Y, pass.LightDirection.Z],
          maxDistance: pass.MaxDistance,
          stepCount: pass.StepCount,
          thickness: pass.Thickness,
          intensity: pass.Intensity,
          bias: pass.Bias,
        };

        const source = new Graphics.Texture2D(device, N, N);
        owned.push(source);
        source.SetData(new Array(N * N).fill(0).map(() => new Color(200, 100, 40, 255)));
        const depth = new Graphics.Texture2D(device, N, N);
        owned.push(depth);
        depth.SetData(new Array(N * N).fill(0).map((_, index) => {
          const packed = DepthNormalPrepassMath.PackDepth(0.2 + (index / (N * N)) * 0.5);
          return new Color(packed.R, packed.G, packed.B, packed.A);
        }));
        const read = (texture) => {
          const pixels = new Array(N * N);
          texture.GetData(pixels);
          return pixels.map((color) => [color.R, color.G, color.B]);
        };
        const sourcePixels = read(source);
        const run = (extra) => {
          const destination = new Graphics.RenderTarget2D(device, N, N);
          try {
            pass.Apply({ Source: source, Destination: destination, Width: N, Height: N, ...extra });
            return read(destination);
          } finally {
            destination.Dispose();
          }
        };
        const copied = (pixels) => pixels.every(
          (texel, index) => texel.every((value, channel) => value === sourcePixels[index][channel]));

        const view = Matrix.CreateLookAt(new Vector3(0, 0, 10), Vector3.Zero, Vector3.Up);
        const projection = Matrix.CreatePerspectiveFieldOfView(Math.PI / 3, 1, 1, 100);
        const camera = {
          SourceDepth: depth, NearPlane: 1, FarPlane: 100, Projection: projection,
          InverseProjection: Matrix.Invert(projection), InverseView: Matrix.Invert(view),
        };
        result.ladder = [];
        result.ladder.push({ copied: copied(run({})), reason: pass.FallbackReason });
        result.ladder.push({
          copied: copied(run({ SourceDepth: depth, NearPlane: 1, FarPlane: 100 })),
          reason: pass.FallbackReason,
        });
        run(camera);
        result.ladder.push({ reason: pass.FallbackReason });
        pass.Intensity = 0;
        result.zeroIntensityIsACopy = copied(run(camera));
        return result;
      } finally {
        for (const resource of owned.reverse()) {
          try {
            resource.Dispose();
          } catch (error) {
            (this.evidence.contactShadowCleanup ??= []).push(
              `${error.constructor.name}: ${(error.message ?? "").slice(0, 90)}`,
            );
          }
        }
      }
    });

    record("transparency", () => {
      const { WeightedBlendedTransparency, IsGraphicsExtensionLayerAvailable } = computeModule;
      const N = 4;
      const owned = [];
      try {
        let oit;
        try {
          oit = new WeightedBlendedTransparency(device, N, N);
        } catch (error) {
          return {
            layerAbsent: true,
            cnaResult: error.cnaResult,
            extensionLayer: IsGraphicsExtensionLayerAvailable(),
          };
        }
        owned.push(oit);
        const result = { supported: oit.IsSupported, reason: oit.UnsupportedReason };
        if (!result.supported) return result;

        // A resize really reallocates: the next borrow is a different size.
        oit.Resize(N * 2, N + 1);
        const resized = oit.AccumulationTexture;
        result.resized = [resized.Width, resized.Height];
        resized.Dispose();
        oit.Resize(N, N);

        // Both lent targets, read for what CNA says they are and for what Begin left in them.
        // Read AFTER the bracket rather than before it, so the zeros below are the clear Begin
        // performed rather than whatever a fresh allocation happened to hold.
        // A half-float target reads back as HalfVector4 rather than Color, because that is the
        // element type its SurfaceFormat declares -- so this is the real contents of the buffer,
        // not an 8-bit projection of it.
        const describe = (texture) => {
          const shape = [texture.Width, texture.Height, texture.Format, texture.LevelCount];
          let texels;
          try {
            const pixels = new Array(texture.Width * texture.Height);
            texture.GetData(pixels);
            texels = pixels.map((value) => [value.constructor.name, value.PackedValue.toString()]);
          } catch (error) {
            texels = `${error.constructor.name}: ${(error.message ?? "").slice(0, 80)}`;
          }
          texture.Dispose();
          return { shape, texels };
        };

        // --- the resolve, to the pixels ------------------------------------------------------------
        // An empty accumulation: the bracket opens and closes with nothing drawn into it, so both
        // targets hold the zeros Begin cleared them to. A zero sum of logs exponentiates to a
        // revealage of exactly one, which is the resolve's "nothing covered this pixel" -- and it
        // discards rather than blending a zero contribution. So the target must come back holding
        // exactly what it was cleared to, texel for texel.
        //
        // The failure this distinguishes is not hypothetical: without the discard the same pixel
        // would take accumulation.rgb / max(accumulation.a, 1e-5) = 0 with an alpha of 1 - 1 = 0,
        // written with BlendState::Opaque -- that is, transparent black over the whole frame.
        oit.Begin(100);
        result.accumulatingInsideBracket = oit.IsAccumulating;
        oit.End();
        result.accumulation = describe(oit.AccumulationTexture);
        result.revealage = describe(oit.RevealageTexture);

        const target = new Graphics.RenderTarget2D(device, N, N);
        owned.push(target);
        const read = () => {
          const pixels = new Array(N * N);
          target.GetData(pixels);
          return pixels.map((color) => [color.R, color.G, color.B, color.A]);
        };
        // Cleared and resolved inside ONE binding. Binding a render target discards what it held,
        // so a clear in an earlier binding would be gone before the resolve ever ran -- and the
        // black frame that produced looked exactly like a resolve that had overwritten it.
        const clearedAndThen = (act) => {
          device.SetRenderTarget(target);
          device.Clear(CLEAR);
          act();
          device.SetRenderTarget(null);
          return read();
        };
        result.beforeResolve = clearedAndThen(() => {});
        result.afterEmptyResolve = clearedAndThen(() => oit.Resolve(N, N));
        // Twice in one binding, to show the early-out is a property of the empty accumulation
        // rather than of a resolve that has not run yet.
        result.afterTwoResolves = clearedAndThen(() => {
          oit.Resolve(N, N);
          oit.Resolve(N, N);
        });
        return result;
      } finally {
        for (const resource of owned.reverse()) {
          try {
            resource.Dispose();
          } catch (error) {
            (this.evidence.transparencyCleanup ??= []).push(
              `${error.constructor.name}: ${(error.message ?? "").slice(0, 90)}`,
            );
          }
        }
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

test("a windowed CNA renderer draws particles where the camera puts them", { skip }, async () => {
  const game = new WindowedProbeGame(2);
  await game.Run();
  const particles = game.evidence.particles;
  game.Dispose();

  assert.equal(typeof particles, "object", `particle probe failed: ${particles}`);
  if (particles.layerAbsent) {
    // The same honest boundary the shadow pass hits on these builds, checked the same way: CNA's
    // own NOT_SUPPORTED, agreeing with the separate route that reports whether the layer is there.
    assert.equal(particles.cnaResult, 6, "a build without the engine layer refuses with NOT_SUPPORTED");
    assert.equal(particles.extensionLayer, false, "and the layer-availability route agrees");
    console.log("CNA_TS_WINDOWED_PARTICLES=NO_ENGINE_LAYER");
    return;
  }

  // CNA's own default capacity, through the route that does not take one. The number is not
  // written here twice: tools/cna-abi/contract.json compiles a _Static_assert that
  // CNA_PARTICLE_SYSTEM_DEFAULT_CAPACITY is 1024 against CNA's headers.
  assert.equal(particles.defaultCapacity, 1024);
  // The binding point a particle vertex shader reads the pool at, agreeing with the GLSL CNA hands
  // out for exactly that purpose -- a macro and a shader string, from two different routes.
  assert.equal(particles.bindingPoint, 7);
  assert.match(
    particles.glsl, new RegExp(`binding\\s*=\\s*${particles.bindingPoint}\\b`),
    "CNA's particle GLSL declares the binding point the API states",
  );
  assert.match(particles.glsl, /std430/, "and it is the storage-buffer layout the simulation uses");

  // Softness is floored rather than refused, which is CNA's documented choice.
  assert.equal(particles.softness.before, 0);
  assert.equal(particles.softness.set, 2.5, "a softness round-trips");
  assert.equal(particles.softness.floored, 0, "and a negative one reads back as zero");

  // The scene, before anything is drawn: the settings CNA holds are the ones that were set, and
  // every particle is standing exactly on the emitter, which is what makes the draw predictable.
  assert.deepEqual(particles.settings.position, particles.near.position);
  assert.deepEqual(
    [particles.settings.speed, particles.settings.coneAngle], [0, 0],
    "no speed and no cone: every particle stays where it was born",
  );
  assert.deepEqual(
    particles.nearPositions, [particles.near.position.join(",")],
    "all 32 particles are on the emitter, and none anywhere else",
  );
  assert.equal(particles.counts.near, 32);
  assert.equal(particles.counts.far, 32);
  assert.equal(particles.counts.idle, 0, "an emission rate of zero brings nothing to life");

  /*
   * The oracle: where the camera puts a world point, and how big a world-space size is there.
   *
   * The view and the projection are the test's own -- built from XNA's CreateLookAt and
   * CreateOrthographic -- and the emitter positions and particle sizes are the test's too. What
   * CNA supplies is the picture. So a draw that ignored the view, ignored the projection, ignored
   * the emitter position, or ignored the particle size lands somewhere this cannot follow it.
   */
  const project = (view, projection, point) => {
    const through = (m, [x, y, z, w]) => [0, 1, 2, 3].map((column) =>
      m[column] * x + m[4 + column] * y + m[8 + column] * z + m[12 + column] * w);
    const clip = through(projection, through(view, [...point, 1]));
    return { X: clip[0] / clip[3], Y: clip[1] / clip[3] };
  };
  const expectBlob = (label, blob, view, emitter) => {
    const ndc = project(view, particles.projection, emitter.position);
    const centreX = (ndc.X * 0.5 + 0.5) * particles.size;
    const centreY = (0.5 - ndc.Y * 0.5) * particles.size;
    // A particle is a square that many world units across, and the orthographic width says how
    // many texels a world unit is worth.
    const worldPerNdc = particles.projection[0];
    const halfWidth = (emitter.Size * 0.5) * worldPerNdc * 0.5 * particles.size;
    assert.ok(halfWidth > 2, "the particle must be big enough for its extent to mean something");
    for (const [name, got, want] of [
      ["minX", blob.minX, centreX - halfWidth], ["maxX", blob.maxX, centreX + halfWidth],
      ["minY", blob.minY, centreY - halfWidth], ["maxY", blob.maxY, centreY + halfWidth],
    ]) {
      assert.ok(
        Math.abs(got - want) <= 1.5,
        `${label} ${name}: painted ${got}, the camera predicts ${want.toFixed(2)}`,
      );
    }
    // Solid, not an outline, and painted in the particle texture's colour alone.
    const area = 4 * halfWidth * halfWidth;
    assert.ok(
      Math.abs(blob.count - area) / area < 0.2,
      `${label} covers ${blob.count} texels; the predicted square is ${area.toFixed(0)}`,
    );
    assert.deepEqual(
      blob.colours, [particles.particleColor],
      `${label} is painted in the particle texture's colour and nothing else`,
    );
  };

  assert.equal(particles.straightOn.blobs.length, 2, "two emitters paint two separate regions");
  const [farBlob, nearBlob] = particles.straightOn.blobs;
  expectBlob("the far emitter", farBlob, particles.straightOn.view, particles.far);
  expectBlob("the near emitter", nearBlob, particles.straightOn.view, particles.near);
  // Different sizes, not one square drawn twice.
  assert.ok(
    farBlob.count > nearBlob.count * 2,
    "a particle twice as wide covers about four times the area",
  );

  // Each system's blob is its own.
  assert.equal(particles.nearOnly.length, 1);
  assert.equal(particles.farOnly.length, 1);
  assert.deepEqual(
    [particles.nearOnly[0].minX, particles.nearOnly[0].minY], [nearBlob.minX, nearBlob.minY],
    "drawing one system alone puts its square exactly where drawing both did",
  );
  assert.deepEqual(
    [particles.farOnly[0].minX, particles.farOnly[0].minY], [farBlob.minX, farBlob.minY],
  );

  // A system with nothing alive draws nothing and does not fail -- CNA says so, and it does.
  assert.deepEqual(particles.idleOnly, [], "an empty system paints no texel at all");

  // Move the camera, and both squares move by what the new view predicts.
  assert.equal(particles.shifted.blobs.length, 2);
  expectBlob("the shifted far emitter", particles.shifted.blobs[0], particles.shifted.view, particles.far);
  expectBlob("the shifted near emitter", particles.shifted.blobs[1], particles.shifted.view, particles.near);
  // And it really moved: a view the draw ignored would leave them where they were.
  const movedBy = particles.straightOn.blobs[0].minX - particles.shifted.blobs[0].minX;
  assert.ok(
    movedBy > 8,
    `a ${particles.shifted.shift}-unit camera move must shift the picture, not leave it (moved ${movedBy})`,
  );

  /*
   * Soft particles: `docs/upstream-cna-findings.md` item 12.
   *
   * The softness is set and reads back, the depth image says every pixel is at the camera, and the
   * particle is drawn exactly as it was with no depth input at all. When CNA repairs the fade this
   * fails, which is the point of asserting it.
   */
  const fade = particles.fade;
  assert.equal(fade.softness, 50, "the softness CNA holds is the one that was set");
  assert.equal(fade.withoutDepth.length, 1, "the system draws one square to begin with");
  if (fade.usesCompute) {
    // The GPU draw path really is the one running: it paints a different number of texels than the
    // CPU billboard path does for the same particle. So a fade that does nothing is a fade that
    // does nothing, not a quiet fallback to the path that never had one.
    assert.notEqual(
      fade.withoutDepth[0].count, fade.cpu[0].count,
      "the GPU and CPU draw paths must be distinguishable for this measurement to mean anything",
    );
    assert.deepEqual(
      fade.withNearDepth, fade.withoutDepth,
      "UPSTREAM FINDING 12 REPAIRED: a depth image of zeros now changes the drawn particle. " +
      "Update docs/upstream-cna-findings.md and assert the fade properly.",
    );
    assert.deepEqual(
      fade.afterClearing, fade.withoutDepth, "and clearing the depth input changes nothing either",
    );
  }

  // What the typed surface refuses before CNA ever sees it.
  assert.equal(particles.refusals.nullTexture, "TypeError");
  assert.equal(particles.refusals.disposedTexture, "ObjectDisposedException");
  assert.equal(particles.refusals.disposedSystem, "NativeUnavailableError");

  console.log(
    `CNA_TS_WINDOWED_PARTICLES=OK NEAR=${nearBlob.count}px@${nearBlob.minX},${nearBlob.minY} ` +
    `FAR=${farBlob.count}px@${farBlob.minX},${farBlob.minY} CAMERA_SHIFT=${movedBy}px ` +
    `DEFAULT_CAPACITY=${particles.defaultCapacity} BINDING=${particles.bindingPoint}`,
  );
});

test("a windowed CNA renderer projects a decal onto what its prepass drew", { skip }, async () => {
  const game = new WindowedProbeGame(2);
  try {
    await game.Run();
  } finally {
    game.Dispose();
  }
  const evidence = game.evidence.prepassAndDecals;
  assert.equal(typeof evidence, "object", `the prepass probe did not run: ${evidence}`);

  // Two of the three windowed renderers here are built with the engine layer compiled out. There
  // is then no prepass and no decal pass to make at all, which is a different boundary from a
  // renderer that has them and cannot compile their shaders -- and it is checked against the
  // separate route that reports whether the layer is present rather than taking a refusal's word.
  if (evidence.layerAbsent) {
    assert.equal(evidence.extensionLayer, false, "a refused create must mean the layer is absent");
    assert.equal(evidence.cnaResult, CnaResult.NotSupported);
    assert.equal(
      evidence.decalCnaResult, CnaResult.NotSupported,
      "and the decal pass is absent for the same reason, not for one of its own",
    );
    console.log("CNA_TS_WINDOWED_DECALS=LAYER_ABSENT");
    return;
  }

  const { DecalPass, DepthNormalPrepassMath } = computeModule;

  /*
   * The encoding first, because every depth number below is read through it.
   *
   * Depth is linear view depth divided by the far plane, packed eight bits to a channel most
   * significant first. Half packs into the alpha channel alone, which is what a shift of
   * (1/2^24, 1/2^16, 1/256, 1) means, and 1.0 is deliberately clamped one step short: fract(1.0)
   * is zero, so an unclamped far plane would pack to nothing and read back as the *nearest*
   * possible surface -- the exact inverse of what it means, applied to the commonest value in the
   * buffer.
   */
  const maths = evidence.maths;
  assert.equal(maths.devicePacked, true, "the automatic encoding packs depth on this renderer");
  assert.deepEqual(
    [maths.packHalf.R, maths.packHalf.G, maths.packHalf.B, maths.packHalf.A], [0, 0, 0, 0.5],
    "a half packs into the alpha channel and nothing else",
  );
  assert.equal(maths.packOne.R, 0, "1.0 is clamped short, so its top channel packs to zero");
  assert.ok(
    maths.packOne.A > 0.99 && maths.packOne.A < 1,
    `and its low channel stops short of one, not at it (${maths.packOne.A})`,
  );
  assert.equal(maths.unpackHalf, 0.5, "and unpacking that alpha gives the half back");
  assert.ok(
    Math.abs(maths.roundTrip - 0.375) < 1e-6,
    `pack and unpack are inverses to a part in 2^24 (${maths.roundTrip})`,
  );
  /*
   * And how much of that survives the target the prepass actually writes into:
   * `docs/upstream-cna-findings.md` item 13.
   *
   * The arithmetic is as good as advertised -- a sweep of the whole range never leaves the encoder
   * and its decoder more than 2^-24 apart. Put the channels through eight bits, which is what a
   * `Color` render target is, and the error is four hundred times larger, and the same as it would
   * be if the depth had simply been written into one channel: the packing buys nothing. The cause
   * is arithmetic and this demonstrates it rather than asserting it -- quantise to 256 levels
   * instead of 255 and the exact accuracy comes straight back, because 256 is the base the shifts
   * and masks are written in while an eight-bit UNORM target stores n/255.
   */
  const sweep = (quantise) => {
    let worst = 0;
    for (let step = 0; step <= 2000; step += 1) {
      const depth = (step / 2000) * 0.999;
      const packed = DepthNormalPrepassMath.PackDepth(depth);
      const decoded = DepthNormalPrepassMath.UnpackDepth(
        quantise(packed.R), quantise(packed.G), quantise(packed.B), quantise(packed.A),
      );
      worst = Math.max(worst, Math.abs(decoded - depth));
    }
    return worst;
  };
  const asWritten = sweep((value) => value);
  const asStored = sweep((value) => Math.round(value * 255) / 255);
  const atBase256 = sweep((value) => Math.min(255, Math.round(value * 256)) / 256);
  assert.ok(
    asWritten <= Math.pow(2, -24),
    `the encoder's own arithmetic is good to a part in 2^24 (${asWritten})`,
  );
  assert.ok(
    asStored > 100 * asWritten,
    "UPSTREAM FINDING 13 REPAIRED: the packing now survives an eight-bit target. " +
    "Update docs/upstream-cna-findings.md and tighten the depth assertions below",
  );
  assert.ok(
    Math.abs(asStored - 0.5 / 255) < 1e-5,
    `through eight bits the error is a half channel step, no better (${asStored})`,
  );
  assert.ok(
    Math.abs(atBase256 - asWritten) < 1e-9,
    `and 256 levels restores it exactly, which is where the loss comes from (${atBase256})`,
  );
  // The GLSL a game includes rather than reimplements. The packed form carries the unpacker; both
  // carry the reconstruction, so the encoding and its inverse cannot drift apart.
  assert.ok(maths.packedGlsl.includes("cnaUnpackDepth"), "the packed dialect carries its unpacker");
  assert.ok(
    !maths.plainGlsl.includes("cnaUnpackDepth"),
    "and the half-float dialect, which reads the red channel, does not",
  );
  for (const source of [maths.packedGlsl, maths.plainGlsl]) {
    assert.ok(
      source.includes("cnaDecodeLinearDepth") && source.includes("cnaViewPositionFromDepth"),
      "both dialects decode a texel and rebuild a view position from it",
    );
  }
  assert.ok(
    maths.velocityGlsl.includes("cnaEncodeVelocity") ||
    maths.velocityGlsl.includes("cnaDecodeVelocity"),
    "the velocity dialect names its codec",
  );
  // Alpha zero means "this texel carries a velocity" -- inverted, because one shared white clear
  // serves the whole bound target set and has to read as "nothing here".
  assert.equal(maths.hasVelocity, true, "a zero alpha marks a texel that carries a velocity");
  assert.equal(maths.hasNoVelocity, false, "and an opaque one marks a texel that does not");
  assert.deepEqual(
    maths.decodedVelocity, [1, -1], "a full red, empty green texel decodes to (1,-1)",
  );
  // The box is the unit cube on the origin, so its own membership test is exactly a half.
  assert.deepEqual(
    [maths.insideOrigin, maths.insideCorner, maths.outsideOnOneAxis], [true, true, false],
    "a decal box holds every point within a half of its origin, and no other",
  );

  const prepass = evidence.prepass;
  assert.equal(prepass.supported, true, "this renderer compiles the prepass shaders");
  assert.equal(prepass.depthPacked, true, "and stores depth packed, as the device query said");
  assert.equal(
    prepass.passCount, prepass.multipleRenderTargets ? 1 : 2,
    "a renderer with multiple render targets fills both buffers in one pass, otherwise two",
  );
  assert.equal(prepass.velocityEnabled, false, "velocity is off unless it is asked for");
  assert.deepEqual(
    [prepass.roughnessSet, prepass.roughnessClamped, prepass.roughnessFloored], [0.25, 1, 0],
    "roughness round-trips and is clamped into the unit range rather than refused",
  );
  assert.deepEqual(
    prepass.textures.depth, [evidence.width, evidence.height, prepass.textures.depth[2]],
    "the depth buffer is the size the prepass was made at, on both axes",
  );
  assert.equal(prepass.textures.depthCached, true, "the borrow is taken once, not once per read");
  assert.equal(
    prepass.textures.velocity, "null", "velocity is off, so there is no buffer -- not an empty one",
  );
  assert.deepEqual(
    prepass.effects, ["Default", "Default"], "both prepass programs are lent and both are real",
  );

  /*
   * The oracle, and what makes it one.
   *
   * `rasterised` is one flat quad drawn through a stock `BasicEffect`, which shares no code with
   * either object under test. `prepassOccupied` is the same quad drawn by the prepass. Both were
   * read out of a render target by the same routine in the same frame, so this renderer's screen
   * and readback conventions cancel between them: what is left is whether the prepass puts the
   * rectangle where the renderer puts it.
   */
  const WIDTH = evidence.width;
  const HEIGHT = evidence.height;
  const span = (region) => ({
    x0: region.minX, x1: region.maxX + 1, y0: region.minY, y1: region.maxY + 1,
  });
  const agree = (left, right, what, tolerance = 1.5) => {
    const a = span(left), b = span(right);
    for (const edge of ["x0", "x1", "y0", "y1"]) {
      assert.ok(
        Math.abs(a[edge] - b[edge]) <= tolerance,
        `${what}: ${edge} is ${a[edge]} against ${b[edge]}`,
      );
    }
  };
  assert.ok(evidence.rasterised.count > 200, "the stock effect drew the rectangle");
  agree(
    evidence.prepassOccupied, evidence.rasterised,
    "the prepass must put the rectangle where the renderer's own rasteriser puts it",
  );

  /*
   * And the depth it recorded is the one the camera implies, not merely a number below the far
   * plane. The quad is at the origin and the eye is ten units up +Z, so its view depth is ten and
   * the stored value is ten over the far plane -- to the precision the packing has, which comes
   * from CNA's own encoder rather than from a tolerance chosen here.
   */
  assert.equal(
    evidence.depthHistogram.length, 2,
    "one quad on an empty background is two depths and no others: " +
    JSON.stringify(evidence.depthHistogram),
  );
  const [[farKey, farCount], [surfaceKey, surfaceCount]] = evidence.depthHistogram;
  assert.equal(farCount + surfaceCount, WIDTH * HEIGHT);
  assert.equal(surfaceCount, evidence.prepassOccupied.count);
  assert.ok(Number(farKey) >= 1, `an untouched texel is at or beyond the far plane (${farKey})`);
  const storedDepth = Number(surfaceKey);
  const exactDepth = (evidence.eye - evidence.rect.Z) / evidence.far;
  const throughEightBits = (depth) => {
    const packed = DepthNormalPrepassMath.PackDepth(depth);
    const quantise = (value) => Math.round(value * 255) / 255;
    return DepthNormalPrepassMath.UnpackDepth(
      quantise(packed.R), quantise(packed.G), quantise(packed.B), quantise(packed.A),
    );
  };
  // What the GPU stored is exactly what CNA's own encoder predicts it would store -- packed, put
  // through an eight-bit target and read back. Not "close to a tenth": the number that round trip
  // produces for a tenth, computed here rather than remembered. The GPU agreeing with the model to
  // five decimals is what says the model is of CNA and not of this test.
  assert.ok(
    Math.abs(storedDepth - throughEightBits(exactDepth)) < 1e-5,
    `the GPU stored ${storedDepth}; CNA's own encoder predicts ${throughEightBits(exactDepth)}`,
  );
  assert.ok(
    Math.abs(storedDepth - exactDepth) < 0.5 / 255,
    `and that is within one channel step of the true ${exactDepth}`,
  );
  // The normals are the second half of the prepass, and they are exact rather than approximate: a
  // quad facing +Z in world space faces +Z in this camera's view space too, which encodes to
  // (0.5, 0.5, 1). The alpha is the inverted velocity flag.
  assert.deepEqual(
    evidence.normalsInside, ["128,128,255,0"],
    "every texel of a flat quad facing the camera carries the same encoded view normal",
  );
  // One clear serves a bound set, so an untouched normal texel carries the depth buffer's white.
  assert.deepEqual(evidence.clearedNormal, [255, 255, 255, 255]);

  /*
   * The decal projector, against a prediction that is not this test's arithmetic.
   *
   * For every texel the test reconstructs the world point the decal shader reconstructs -- the
   * camera is a 90-degree square frustum, so a plane at view depth d spans d world units per unit
   * of device coordinate -- transforms it by the inverse of the box's own world matrix, and asks
   * **CNA** whether that point is inside the box, through `IsInsideDecalBox`. So a rotated or
   * rescaled box needs no separate derivation and no geometry written out by hand here, and the
   * prediction is checked against the surface the prepass actually drew rather than against a
   * plane assumed to fill the screen.
   */
  const viewDepth = storedDepth * evidence.far;
  const surfaceZ = evidence.eye - viewDepth;
  const transform = (m, x, y, z) => ({
    X: m[0] * x + m[4] * y + m[8] * z + m[12],
    Y: m[1] * x + m[5] * y + m[9] * z + m[13],
    Z: m[2] * x + m[6] * y + m[10] * z + m[14],
  });
  const predict = (world) => {
    const inverse = matrixRow(Matrix.Invert(new Matrix(...world)));
    let count = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        // The rasteriser's convention, which `rasterised` above confirms: the first row is the top
        // of the screen, which is +1 in device coordinates. The frustum is ninety degrees
        // vertically and the target is wider than it is tall, so a unit of device coordinate is
        // worth the aspect ratio more world units across than it is down.
        if (!evidence.surfaceMask[y * WIDTH + x]) continue;
        const ndcX = ((x + 0.5) / WIDTH) * 2 - 1;
        const ndcY = 1 - ((y + 0.5) / HEIGHT) * 2;
        const local = transform(
          inverse, ndcX * viewDepth * (WIDTH / HEIGHT), ndcY * viewDepth, surfaceZ,
        );
        if (!DecalPass.IsInsideDecalBox(new Vector3(local.X, local.Y, local.Z))) continue;
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { count, minX, maxX, minY, maxY };
  };

  // Every case that must paint something paints it in the decal texture's colour and no other.
  for (const name of [
    "overRect", "halfWide", "upperRight", "lowerLeft", "rotated", "axisIntoSurface", "tilted60",
  ]) {
    const painted = evidence[name];
    assert.ok(painted.count > 0, `${name} must paint something`);
    assert.deepEqual(
      painted.colours, [evidence.decalColor],
      `${name} paints the decal texture's colour and nothing else`,
    );
  }

  /*
   * Where each one lands: exactly the texels CNA's own box test says, and no others.
   *
   * Five boxes, each a different shape or a different place, all against one surface. The counts
   * are exact rather than approximate -- these are the same texels, not merely the same
   * neighbourhood -- so a projection that lost the translation, the scale, the rotation, the
   * camera or the depth cannot land on any of them.
   */
  for (const name of ["overRect", "halfWide", "upperRight", "lowerLeft", "rotated"]) {
    const expected = predict(evidence[name].world);
    assert.ok(expected.count > 0, `the prediction for ${name} must cover something`);
    assert.equal(
      evidence[name].count, expected.count,
      `${name} must paint exactly the predicted texels: ` +
      `${evidence[name].count} against ${expected.count}`,
    );
    agree(evidence[name], expected, `${name} must land where CNA's own box test puts it`, 0);
  }
  // The rectangle is off centre on both axes, so none of this could survive a mirrored or swapped
  // axis: the prediction and the picture would be in different places.
  const offCentre = (lo, hi, extent) => Math.abs((lo + hi) / 2 - extent / 2);
  assert.ok(
    offCentre(evidence.overRect.minX, evidence.overRect.maxX, WIDTH) > 3 &&
    offCentre(evidence.overRect.minY, evidence.overRect.maxY, HEIGHT) > 3,
    "the surface is off centre on both axes, so a flipped axis lands somewhere else",
  );
  // Two boxes in opposite corners of the same surface are two different pictures. A projection
  // that had lost the box's translation would put them both in the same place.
  assert.ok(
    evidence.upperRight.minX > evidence.lowerLeft.maxX &&
    evidence.upperRight.maxY < evidence.lowerLeft.minY,
    "the two corner boxes must be in opposite corners, sharing no texel",
  );
  // And the rolled box paints a band rather than a rectangle. Every other case here fills its own
  // bounding box, because an axis-aligned box over a flat surface is a rectangle on screen; this
  // one covers well under three-quarters of its box, which is what a diagonal is. Its exact texels
  // were checked against the prediction above -- this is the shape saying so in one number.
  const filled = (region) =>
    region.count / ((region.maxX - region.minX + 1) * (region.maxY - region.minY + 1));
  assert.ok(
    filled(evidence.overRect) > 0.99,
    `an axis-aligned box fills its bounding box (${filled(evidence.overRect)})`,
  );
  assert.ok(
    filled(evidence.rotated) < 0.75 && evidence.rotated.count < evidence.overRect.count * 0.6,
    `a rolled box paints a diagonal band, not a rectangle (${evidence.rotated.count} texels ` +
    `filling ${filled(evidence.rotated)} of ${evidence.rotated.minX}..${evidence.rotated.maxX})`,
  );

  // The box test, which is the whole point of a decal box: a box nowhere near the surface paints
  // nothing, and neither does a pass with no depth buffer to unproject.
  assert.equal(
    evidence.awayFromSurface.count, 0, "a box the surface does not reach paints nothing",
  );
  assert.equal(predict(evidence.awayFromSurface.world).count, 0, "and CNA's own box test agrees");
  assert.equal(evidence.noDepth.count, 0, "with no depth buffer there is nothing to project onto");

  // Scale is the decal's size in world units, so halving one axis halves the picture on it.
  assert.ok(
    evidence.halfWide.count < evidence.overRect.count,
    "a box half as wide paints less than the full one",
  );
  assert.equal(
    evidence.halfWide.maxY - evidence.halfWide.minY,
    evidence.overRect.maxY - evidence.overRect.minY,
    "and exactly as tall, because only one axis changed",
  );

  /*
   * The one thing about the input a caller has to know, measured rather than left to be
   * discovered: **the prepass's own buffers are the depth input, and an upload of the same values
   * does not stand in for one.**
   *
   * Handed exactly the bytes the prepass wrote, uploaded into an ordinary `Texture2D`, the pass
   * finds no surface anywhere; handed them with their rows reversed it finds the whole surface
   * again, in the right columns and in rows that share none of the right ones. So the two kinds of
   * texture do not agree about the screen, and neither upload is the picture. No mechanism is
   * claimed here -- these are the measurements, and the rule they imply is the one
   * `SetPrepassInputs` documents.
   */
  assert.equal(
    evidence.uploadedInput.count, 0,
    "the same depths uploaded as an ordinary texture find no surface at all",
  );
  assert.equal(
    evidence.uploadedFlipped.count, evidence.overRect.count,
    "turning that upload over finds the surface again, and the same amount of it",
  );
  assert.deepEqual(
    [evidence.uploadedFlipped.minX, evidence.uploadedFlipped.maxX],
    [evidence.overRect.minX, evidence.overRect.maxX],
    "in the same columns",
  );
  assert.ok(
    evidence.uploadedFlipped.maxY < evidence.overRect.minY ||
    evidence.uploadedFlipped.minY > evidence.overRect.maxY,
    "and in rows that share none of the right ones: neither upload reproduces the picture, " +
    `${evidence.uploadedFlipped.minY}..${evidence.uploadedFlipped.maxY} against ` +
    `${evidence.overRect.minY}..${evidence.overRect.maxY}`,
  );

  /*
   * Opacity and tint, checked through the blend rather than through a getter.
   *
   * The pass composites `NonPremultiplied`, which is the one place in this layer where blending is
   * the point: a decal's own alpha is the mask that decides where it shows. So half opacity over a
   * known clear colour is an arithmetic identity, and the test computes it rather than remembering
   * a colour from a previous run.
   */
  const cleared = new Color(12, 34, 56, 255);
  assert.equal(evidence.clearedColor, cleared.PackedValue);
  assert.equal(evidence.halfOpacity.colours.length, 1);
  const packedBlend = evidence.halfOpacity.colours[0];
  const blended = new Color(
    packedBlend & 0xff, (packedBlend >>> 8) & 0xff,
    (packedBlend >>> 16) & 0xff, (packedBlend >>> 24) & 0xff,
  );
  for (const [channel, source] of [["R", 255], ["G", 0], ["B", 0]]) {
    const expected = source * 0.5 + cleared[channel] * 0.5;
    assert.ok(
      Math.abs(blended[channel] - expected) <= 1,
      `half opacity must composite ${channel}: ${blended[channel]} against ${expected}`,
    );
  }
  assert.ok(
    Math.abs(blended.A - (255 * 0.5 + 255 * 0.5 * 0.5)) <= 1,
    `and NonPremultiplied's own alpha rule: ${blended.A}`,
  );
  agree(evidence.halfOpacity, evidence.overRect, "opacity changes the colour, not the region", 0);
  // A green tint on a red decal is black, because the tint multiplies channel by channel.
  assert.deepEqual(
    evidence.greenTint.colours, [new Color(0, 0, 0, 255).PackedValue],
    "a green tint on a red decal leaves nothing of it",
  );
  agree(evidence.greenTint, evidence.overRect, "and it does not move the decal either", 0);

  /*
   * The slope test, which exists only when normals are supplied.
   *
   * The decal projects along its own +Z, so a surface that takes it faces back along that axis.
   * Unrotated the box points at the camera, the same way the surface does, and every texel is
   * rejected; turned through half a turn it projects into the surface and every texel is taken.
   * Then the surface is tilted, with the box left exactly where it was: 60 degrees is inside the
   * default 70-degree limit and shows, 80 is outside it and does not, and widening the limit to 85
   * brings the same picture back. One number changes between the last two.
   */
  assert.equal(
    evidence.axisTowardCamera.count, 0,
    "a decal projecting the same way the surface faces takes none of it",
  );
  assert.ok(evidence.axisIntoSurface.count > 0, "and one projecting into the surface takes it");
  assert.equal(evidence.tilted80.count, 0, "a surface tilted past the limit is dropped");
  agree(
    evidence.tilted60, evidence.axisIntoSurface,
    "a surface inside the limit takes the whole decal", 0,
  );
  agree(
    evidence.tilted80Widened, evidence.axisIntoSurface,
    "and widening the limit takes the same picture back, with nothing else changed", 0,
  );
  assert.ok(
    Math.abs(evidence.decalDefaults.maxSlopeAngle - (70 * Math.PI) / 180) < 1e-6,
    `the default limit is seventy degrees (${evidence.decalDefaults.maxSlopeAngle})`,
  );

  // The three setters, each guarded the way CNA guards it and not the way the others are.
  const defaults = evidence.decalDefaults;
  assert.deepEqual(
    [defaults.opacity, defaults.opacitySet, defaults.opacityClamped, defaults.opacityFloored],
    [1, 0.5, 1, 0],
    "opacity round-trips and is clamped into the unit range at both ends",
  );
  assert.deepEqual(defaults.tint, [1, 1, 1], "an untinted decal is white");
  assert.deepEqual(
    defaults.tintSet, [0.25, 2, -1],
    "and a tint is taken as given: above one brightens an HDR frame, so there is nothing to clamp",
  );
  assert.ok(
    Math.abs(defaults.slopeClamped - Math.PI / 2) < 1e-6,
    "a slope beyond a right angle is clamped to one: nothing faces further away than perpendicular",
  );
  assert.equal(defaults.slopeFloored, 0, "and a negative one is floored at zero");

  // What is refused, and by whom.
  assert.equal(evidence.refusals.nullDecal, "TypeError", "there is nothing to draw without a decal");
  assert.equal(evidence.refusals.zeroWidth, "RangeError");
  assert.equal(evidence.refusals.disposedPass, "NativeUnavailableError");
  /*
   * Four errors CNA raises itself, reported by the result code it answered with rather than
   * pre-empted here. A pass cannot be opened twice or closed unopened, a depth range that cannot
   * normalise is refused rather than quietly corrected into a buffer lit from the wrong depth, and
   * the targets cannot be resized while a pass is holding them.
   *
   * Three of the four answer the wrong code, and that is
   * `docs/upstream-cna-findings.md` item 14. The header documents `CNA_RESULT_INVALID_STATE` for
   * each of them; what comes back is `CNA_RESULT_INTERNAL`, which says "a bug in CNA" to a caller
   * whose only mistake was the order of two calls. The argument error is right, because a
   * `std::invalid_argument` is translated and a `std::logic_error` is not -- and CNA's own render
   * pipeline, in the same source file, catches exactly that and answers `INVALID_STATE`. Asserted
   * as it behaves, so a repair fails here and says so.
   */
  assert.deepEqual(
    [
      evidence.refusals.openTwice, evidence.refusals.endWithoutBegin,
      evidence.refusals.invertedPlanes, evidence.refusals.resizeInsidePass,
    ],
    [
      CnaResult.Internal, CnaResult.Internal, CnaResult.InvalidArgument, CnaResult.Internal,
    ],
    "UPSTREAM FINDING 14 REPAIRED: the three ordering refusals now answer INVALID_STATE. " +
    "Update docs/upstream-cna-findings.md and assert the documented codes",
  );

  console.log(
    `CNA_TS_WINDOWED_DECALS=OK SURFACE=${surfaceCount}px@${evidence.prepassOccupied.minX},` +
    `${evidence.prepassOccupied.minY} DEPTH=${storedDepth} ` +
    `DECAL=${evidence.overRect.count}px UPPER=${evidence.upperRight.count}px ` +
    `LOWER=${evidence.lowerLeft.count}px ROTATED=${evidence.rotated.count}px ` +
    `PACKED_PRECISION=${asStored.toExponential(3)} (finding 13)`,
  );
});

test("a windowed CNA renderer bakes a light probe out of the scene it drew", { skip }, async () => {
  const game = new WindowedProbeGame(2);
  try {
    await game.Run();
  } finally {
    game.Dispose();
  }
  const evidence = game.evidence.lightProbes;
  assert.equal(typeof evidence, "object", `the light probe probe did not run: ${evidence}`);

  if (evidence.layerAbsent) {
    assert.equal(evidence.extensionLayer, false, "a refused create must mean the layer is absent");
    assert.equal(evidence.cnaResult, CnaResult.NotSupported);
    console.log("CNA_TS_WINDOWED_LIGHT_PROBES=LAYER_ABSENT");
    return;
  }
  assert.equal(evidence.faceSize, 16, "the baker captures at the size it was asked for");
  assert.equal(evidence.faceCount, 6);
  assert.deepEqual(evidence.planes, [0.5, 40], "and with the capture range it was given");
  if (!evidence.supported) {
    // A renderer with the layer that still cannot read a target back. The native suite covers that
    // boundary in full; there is nothing to bake here.
    console.log("CNA_TS_WINDOWED_LIGHT_PROBES=BAKER_UNSUPPORTED");
    return;
  }

  /*
   * Every bake called the scene six times, once per face, in face order -- and each call was
   * identified from the *matrix* CNA handed over rather than from a counter, by matching it against
   * what FaceView reports for that face and that capture point. A bake that gave one camera to
   * every face, or the six in another order, cannot produce this list.
   */
  const bakes = [
    "onlyFirstFace", "onlySecondFace", "onlyFifthFace", "firstFaceHalf", "allDark", "allBright",
  ];
  for (const name of [...bakes, "awayFromOrigin"]) {
    const bake = evidence[name];
    assert.deepEqual(
      bake.order, [0, 1, 2, 3, 4, 5],
      `${name} must draw the six faces in order, each with its own camera`,
    );
    assert.deepEqual(
      bake.position, name === "awayFromOrigin" ? [3, -2, 1] : [0, 0, 0],
      "and the probe stands where it was captured",
    );
    for (const projection of bake.projections) {
      for (const [index, value] of projection.entries()) {
        assert.ok(
          Math.abs(value - evidence.expectedProjection[index]) < 1e-5,
          `${name} must capture through a square 90-degree frustum at element ${index}: ` +
          `${value} against ${evidence.expectedProjection[index]}`,
        );
      }
    }
  }

  /*
   * A scene of nothing bakes a probe of nothing, and a scene of everything bakes one that is the
   * same in every direction. Those two are the ends of the range every other bake sits inside.
   */
  assert.equal(evidence.allDark.isZero, true, "an unlit scene bakes a probe carrying no light");
  assert.deepEqual(
    evidence.allDark.irradiance, new Array(6).fill([0, 0, 0]),
    "and no irradiance in any direction",
  );
  assert.equal(evidence.allBright.isZero, false, "a fully lit scene bakes one carrying light");
  {
    const values = evidence.allBright.irradiance.map((value) => value[0]);
    const low = Math.min(...values), high = Math.max(...values);
    assert.ok(low > 0.5, `a fully lit scene is bright in every direction (${low})`);
    assert.ok(
      (high - low) / high < 0.05,
      `and nearly the same in every direction: ${low} to ${high}`,
    );
    // The directional coefficients cancel when every direction is equally bright, so the direct
    // term is what is left, and it is far larger than any of them.
    const [direct, ...rest] = evidence.allBright.coefficients.map((value) => Math.abs(value[0]));
    assert.ok(
      rest.every((value) => value < direct * 0.05),
      `an isotropic scene leaves the direct term alone: ${direct} against ${rest}`,
    );
  }

  /*
   * And the part that is the whole point: light one face and the probe knows which way it was.
   *
   * The six faces look down +X, -X, +Y, -Y, +Z and -Z, which the native suite proves from the
   * matrices themselves. So lighting face 0 must make the probe brightest looking along +X and
   * dimmest along -X, and lighting face 1 must reverse exactly that pair while leaving the others
   * where they were. Nothing here depends on which cube-face convention CNA uses: the two bakes are
   * compared against each other.
   */
  const AXES = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"];
  const brightestOf = (bake) => {
    const values = bake.irradiance.map((value) => value[0]);
    return values.indexOf(Math.max(...values));
  };
  const first = evidence.onlyFirstFace;
  const second = evidence.onlySecondFace;
  const fifth = evidence.onlyFifthFace;
  assert.equal(brightestOf(first), 0, `lighting face 0 must be brightest along ${AXES[0]}`);
  assert.equal(brightestOf(second), 1, `lighting face 1 must be brightest along ${AXES[1]}`);
  assert.equal(brightestOf(fifth), 4, `lighting face 4 must be brightest along ${AXES[4]}`);
  for (const [name, bake, lit, dark] of [
    ["face 0", first, 0, 1], ["face 1", second, 1, 0], ["face 4", fifth, 4, 5],
  ]) {
    const values = bake.irradiance.map((value) => value[0]);
    assert.ok(
      values[lit] > values[dark] * 10,
      `${name}: looking at the lit face is an order of magnitude brighter than away from it ` +
      `(${values[lit]} against ${values[dark]})`,
    );
  }
  // The first two bakes are the same scene mirrored, so their answers must be the same numbers
  // swapped: what +X reads in one, -X reads in the other.
  for (const [left, right] of [[0, 1], [2, 2], [3, 3], [4, 4], [5, 5]]) {
    assert.ok(
      Math.abs(first.irradiance[left][0] - second.irradiance[right][0]) < 1e-3,
      `the two opposite bakes must mirror each other at ${AXES[left]}/${AXES[right]}: ` +
      `${first.irradiance[left][0]} against ${second.irradiance[right][0]}`,
    );
  }
  // Grey rather than white on the same face scales every coefficient by exactly the fraction of a
  // full byte it was painted with. The projection is linear in the radiance it read, and this is
  // that linearity measured rather than assumed.
  for (const [index, coefficient] of evidence.firstFaceHalf.coefficients.entries()) {
    const full = first.coefficients[index];
    for (const channel of [0, 1, 2]) {
      const expected = full[channel] * evidence.halfFraction;
      assert.ok(
        Math.abs(coefficient[channel] - expected) < 1e-3,
        `coefficient ${index} channel ${channel} must scale with the radiance: ` +
        `${coefficient[channel]} against ${expected}`,
      );
    }
  }
  // Every bake is grey, because every scene was: a channel that had drifted would show here.
  for (const name of bakes) {
    for (const [red, green, blue] of evidence[name].coefficients) {
      assert.ok(
        Math.abs(red - green) < 1e-6 && Math.abs(green - blue) < 1e-6,
        `${name} bakes a grey scene as grey`,
      );
    }
  }

  /*
   * A volume, where each probe has to be captured from its own place.
   *
   * The scene is lit only when the callback recognises the cameras of the first cell, so a bake
   * that captured both probes from one point, or reused one capture across the volume, lights both.
   */
  const volume = evidence.volume;
  assert.deepEqual(volume.counts, [2, 1, 1]);
  assert.deepEqual(volume.positions, [[-4, 0, 0], [4, 0, 0]], "the two cells are eight units apart");
  assert.equal(volume.zeroBefore, true);
  assert.equal(volume.faceDraws, 12, "two probes, six faces each");
  assert.deepEqual(
    volume.seenCells, [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    "every face of the first probe was drawn from the first probe's place, then the second's",
  );
  assert.equal(volume.zeroAfter, false);
  assert.deepEqual(
    volume.probes.map((probe) => probe.position), volume.positions,
    "each baked probe stands in its own cell",
  );
  assert.equal(volume.probes[0].isZero, false, "the cell whose scene was lit carries light");
  assert.equal(volume.probes[1].isZero, true, "and the cell whose scene was dark carries none");

  /*
   * Visibility, which is a distance rather than a colour: the red channel of a face is read as a
   * fraction of the far plane. So painting every face one byte makes the recorded mean an exact
   * number, and a uniform face makes the mean squared exactly the mean squared.
   */
  const visibility = evidence.visibility;
  assert.equal(visibility.faceDraws, 12);
  const expectedDistance = (visibility.byte / 255) * visibility.farPlane;
  for (const [index, recorded] of visibility.recorded.entries()) {
    assert.equal(recorded.has, true, `probe ${index} recorded visibility`);
    for (const [face, mean] of recorded.means.entries()) {
      assert.ok(
        Math.abs(mean - expectedDistance) < 0.05,
        `probe ${index} face ${face}: ${mean} against the ${expectedDistance} the byte encodes`,
      );
    }
    assert.ok(
      Math.abs(recorded.meanSquared - recorded.means[0] ** 2) < 0.05,
      "a uniform face has no variance, so the mean squared is the mean squared: " +
      `${recorded.meanSquared} against ${recorded.means[0] ** 2}`,
    );
  }
  // And the light bake after it kept every distance: the two bakes are separate passes.
  assert.deepEqual(
    visibility.afterLightBake.means, visibility.recorded[0].means,
    "a light bake keeps whatever visibility each probe already carried",
  );
  assert.equal(visibility.afterLightBake.isZero, false, "while replacing the light it carried");

  // The scene's own exception comes back out of the bake, and the device still works afterwards --
  // which is what says CNA was not left holding a bound target.
  assert.equal(evidence.callbackThrew, "RangeError: from the scene");
  assert.deepEqual(
    evidence.usableAfterThrow, first.irradiance,
    "the same bake after a thrown callback produces the same probe",
  );
  // The bake away from the origin is the same scene through the same six cameras, moved: it must
  // produce the same probe, and it must have been captured from the point it was given.
  assert.deepEqual(
    evidence.awayFromOrigin.irradiance, first.irradiance,
    "the same scene captured from elsewhere bakes the same probe",
  );
  assert.equal(evidence.refusals.nullCallback, "TypeError");
  assert.equal(evidence.refusals.disposedBaker, "NativeUnavailableError");

  console.log(
    `CNA_TS_WINDOWED_LIGHT_PROBES=OK FACE=${evidence.faceSize}px ` +
    `PLUS_X=${first.irradiance[0][0].toFixed(4)} MINUS_X=${first.irradiance[1][0].toFixed(4)} ` +
    `ISOTROPIC=${evidence.allBright.irradiance[0][0].toFixed(4)} ` +
    `VOLUME_FACES=${volume.faceDraws} VISIBILITY=${visibility.recorded[0].means[0].toFixed(3)}`,
  );
});

test("a windowed CNA renderer draws the sky its own model predicts", { skip }, async () => {
  const game = new WindowedProbeGame(2);
  try {
    await game.Run();
  } finally {
    game.Dispose();
  }
  const evidence = game.evidence.atmosphere;
  assert.equal(typeof evidence, "object", `the atmosphere probe did not run: ${evidence}`);
  assert.equal(
    game.evidence.atmosphereCleanup, undefined,
    `every atmosphere resource released: ${JSON.stringify(game.evidence.atmosphereCleanup)}`,
  );

  if (evidence.layerAbsent) {
    assert.equal(evidence.extensionLayer, false, "a refused create must mean the layer is absent");
    assert.equal(evidence.cnaResult, CnaResult.NotSupported);
    console.log("CNA_TS_WINDOWED_ATMOSPHERE=LAYER_ABSENT");
    return;
  }
  if (!evidence.supported) {
    console.log("CNA_TS_WINDOWED_ATMOSPHERE=SKY_UNSUPPORTED");
    return;
  }

  /*
   * The acceptance: every texel of a drawn sky, against a prediction assembled from two CNA routes
   * that never touch the GPU.
   *
   * `cna_skybox_compute_view_ray` says which way each screen point looks, and
   * `cna_atmospheric_sky_radiance` is the same scattering model the shader runs, evaluated on the
   * CPU. So the shader and the model are two implementations of one formula, joined by a third
   * route, and this compares them a thousand texels at a time. A sky that ignored the sun, the
   * turbidity, the intensity or the camera cannot agree with it.
   */
  const SIZE = evidence.size;
  const summarise = (name) => {
    const { drawn, predicted } = evidence.cases[name];
    let exact = 0;
    let worst = 0;
    let worstAt = -1;
    for (let index = 0; index < drawn.length; index += 1) {
      let difference = 0;
      for (const channel of [0, 1, 2]) {
        difference = Math.max(difference, Math.abs(drawn[index][channel] - predicted[index][channel]));
      }
      if (difference === 0) exact += 1;
      if (difference > worst) {
        worst = difference;
        worstAt = index;
      }
      assert.equal(drawn[index][3], 255, `every sky texel is opaque (texel ${index})`);
    }
    return { exact, worst, worstAt, total: drawn.length };
  };
  const agreement = {};
  for (const name of Object.keys(evidence.cases)) {
    const summary = summarise(name);
    agreement[name] = summary;
    assert.equal(summary.total, SIZE * SIZE);
    assert.ok(
      summary.worst <= 1,
      `${name}: the drawn sky and the model disagree by ${summary.worst} at texel ` +
      `${summary.worstAt} — drawn ${evidence.cases[name].drawn[summary.worstAt]} against ` +
      `predicted ${evidence.cases[name].predicted[summary.worstAt]}`,
    );
    /*
     * The claim that matters is the one above: nowhere in the picture do the shader and the model
     * differ by more than one part in 255, which is the resolution the target has. Most texels are
     * bit-identical on top of that, and the fraction is asserted with room for the last bit of a
     * float32 evaluation on the CPU meeting a highp one on the GPU -- the two are different
     * machines running the same formula, not the same machine twice.
     */
    assert.ok(
      summary.exact / summary.total > 0.75,
      `${name}: only ${summary.exact} of ${summary.total} texels are bit-identical`,
    );
  }

  /*
   * And the picture is a sky rather than a flat fill, which is what makes the agreement above worth
   * anything: a shader that answered one constant would match a model that also answered one.
   */
  const channelOf = (texel) => texel[2];
  const rowMean = (drawn, row) => {
    let total = 0;
    for (let x = 0; x < SIZE; x += 1) total += channelOf(drawn[row * SIZE + x]);
    return total / SIZE;
  };
  const noon = evidence.cases.noon.drawn;
  assert.ok(
    new Set(noon.map((texel) => texel.join(","))).size > 50,
    "a drawn sky is a gradient rather than a flat fill",
  );
  // The camera looks at the horizon, so the bottom of the picture is nearer it and the top is
  // nearer the zenith -- and a horizontal ray passes through more air, so it is the brighter half.
  const topRows = (rowMean(noon, 0) + rowMean(noon, 1)) / 2;
  const bottomRows = (rowMean(noon, SIZE - 1) + rowMean(noon, SIZE - 2)) / 2;
  assert.ok(
    Math.abs(topRows - bottomRows) > 20,
    `the sky is graded from one edge to the other: ${topRows} against ${bottomRows}`,
  );

  // Night. The sun below the horizon leaves the whole picture an order of magnitude darker, and it
  // is the model that says so as well as the shader.
  const meanOf = (drawn) =>
    drawn.reduce((total, texel) => total + texel[0] + texel[1] + texel[2], 0) / drawn.length;
  assert.ok(
    meanOf(evidence.cases.noon.drawn) > meanOf(evidence.cases.night.drawn) * 10,
    `a sun below the horizon is far darker: ${meanOf(evidence.cases.noon.drawn)} against ` +
    meanOf(evidence.cases.night.drawn),
  );
  /*
   * Haze, on the pair drawn dim enough that neither saturates: more aerosol scatters more light
   * into the eye, and Mie's scattering has no wavelength dependence at all -- which is why haze is
   * white and why the same picture loses its colour as it gains its brightness.
   */
  const clear = evidence.cases.clearDim.drawn;
  const hazy = evidence.cases.hazyDim.drawn;
  const saturated = (drawn) =>
    drawn.filter((texel) => texel[0] === 255 || texel[1] === 255 || texel[2] === 255).length;
  assert.equal(saturated(clear) + saturated(hazy), 0, "neither dim picture clips");
  const colourfulness = (drawn) => {
    const at = (channel) => drawn.reduce((total, texel) => total + texel[channel], 0) / drawn.length;
    return at(2) / Math.max(at(0), 1);
  };
  /*
   * Aerosol changes the sky, and near the horizon it changes it in more than one direction at once:
   * the Mie term scatters more light into the eye, and the same term lengthens the path the
   * sunlight crosses to get here, which takes light away. Which one wins depends on where the
   * camera is pointing, and this test does not guess.
   *
   * What it asserts instead is the thing it is actually here to establish: that the **shader and
   * the model agree** about both, in sign and in size. Two implementations of one formula, on two
   * different machines, moving the same way when the turbidity changes -- and moving far enough
   * that agreeing is not free.
   */
  const clearPredicted = evidence.cases.clearDim.predicted;
  const hazyPredicted = evidence.cases.hazyDim.predicted;
  for (const [what, measure] of [["brightness", meanOf], ["colour", colourfulness]]) {
    const drawnChange = measure(hazy) - measure(clear);
    const modelledChange = measure(hazyPredicted) - measure(clearPredicted);
    assert.equal(
      Math.sign(drawnChange), Math.sign(modelledChange),
      `the drawn sky and the model must move the same way in ${what}: ` +
      `${drawnChange} drawn against ${modelledChange} modelled`,
    );
    assert.ok(
      Math.abs(drawnChange - modelledChange) < Math.abs(modelledChange) * 0.05 + 1,
      `and by the same amount: ${drawnChange} against ${modelledChange}`,
    );
  }
  assert.ok(
    Math.abs(meanOf(hazy) - meanOf(clear)) > 20,
    `and the turbidity really changed the picture: ${meanOf(hazy)} against ${meanOf(clear)}`,
  );
  assert.ok(
    colourfulness(clear) > 1 && colourfulness(hazy) > 1,
    `a scattering sky is blue rather than grey (${colourfulness(clear)}, ${colourfulness(hazy)})`,
  );
  // A low sun to one side makes one side of the picture the bright one, which a sun overhead does
  // not: the two halves of the noon sky are the same and the two halves of this one are not.
  const halves = (drawn) => {
    let left = 0, right = 0;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const value = drawn[y * SIZE + x].slice(0, 3).reduce((total, c) => total + c, 0);
        if (x < SIZE / 2) left += value;
        else right += value;
      }
    }
    return [left, right];
  };
  const [overheadLeft, overheadRight] = halves(evidence.cases.clearDim.drawn);
  const [lowLeft, lowRight] = halves(evidence.cases.lowSun.drawn);
  assert.ok(
    Math.abs(overheadLeft - overheadRight) / overheadLeft < 0.02,
    `a sun overhead lights both halves of the picture equally: ${overheadLeft} against ` +
    overheadRight,
  );
  assert.ok(
    lowRight > lowLeft * 1.2,
    `and a sun up to the right makes that half the bright one: ${lowLeft} against ${lowRight}`,
  );
  /*
   * Intensity is a plain multiplier, and half of it is half of every texel -- checked across the
   * whole picture rather than at three points, and between two exposures that both stay clear of
   * the target's ceiling, because a clipped texel is not evidence of anything.
   */
  {
    const bright = evidence.cases.clearDim.drawn;
    const half = evidence.cases.halfDim.drawn;
    const ratio = evidence.cases.halfDim.intensity / evidence.cases.clearDim.intensity;
    let compared = 0;
    for (let index = 0; index < bright.length; index += 1) {
      for (const channel of [0, 1, 2]) {
        const source = bright[index][channel];
        if (source < 20 || source > 250) continue;
        compared += 1;
        assert.ok(
          Math.abs(half[index][channel] - source * ratio) <= 2,
          `halving the intensity halves the texel: ${half[index][channel]} against ` +
          `${source * ratio} at texel ${index} channel ${channel}`,
        );
      }
    }
    assert.ok(compared > 1000, `and there were texels to compare (${compared})`);
  }
  // The setters that reached CNA are the ones the pictures were drawn with.
  assert.deepEqual(evidence.cases.noon.sun, [0, -1, 0]);
  assert.equal(evidence.cases.hazyDim.turbidity, 8);
  assert.equal(evidence.cases.clearDim.turbidity, 1, "and a turbidity of one is clamped-in air");
  // Read back through a float, so the tenth that went in comes back as the nearest one.
  assert.ok(
    Math.abs(evidence.cases.halfDim.intensity - 0.1) < 1e-7,
    `the intensity CNA holds is the one that was set (${evidence.cases.halfDim.intensity})`,
  );

  /*
   * The captured sky. Which cube-map convention CNA uses is not assumed: what is asserted is that
   * the six axes produce six *different* flat colours, each one of the six uploaded -- a bijection
   * -- and that turning the sky a right angle moves those colours between the axes.
   */
  const skybox = evidence.skybox;
  assert.equal(skybox.hasEnvironment, true, "a skybox made with a cube map has one");
  if (skybox.supported) {
    const seen = skybox.axes.map((axis) => axis.centre);
    for (const [index, axis] of skybox.axes.entries()) {
      assert.ok(
        skybox.faceColours.includes(axis.centre),
        `axis ${index} shows one of the six face colours, not ${axis.centre}`,
      );
      assert.equal(
        axis.middleColours, 1,
        `axis ${index} looks straight at one flat face, so the middle of the picture is one colour`,
      );
      assert.ok(
        axis.distinctColours > 1,
        `and its edges reach past that face, because a 90-degree frustum is wider than one ` +
        `(${axis.distinctColours} colours in all)`,
      );
    }
    assert.equal(new Set(seen).size, 6, "the six axes show six different faces");
    // Turning the sky a right angle about the up axis: the four faces around the equator move
    // round, and the two poles stay where they are.
    const turned = skybox.turned.map((axis) => axis.centre);
    assert.equal(new Set(turned).size, 6, "and still six different faces after turning");
    assert.notDeepEqual(turned, seen, "a right angle moves the sky");
    const moved = turned.filter((colour, index) => colour !== seen[index]).length;
    assert.equal(
      moved, 4,
      `a turn about the up axis moves the four equatorial faces and leaves the two poles (${moved})`,
    );
    // Intensity and tint multiply what was sampled, which is arithmetic on a flat face.
    const unpack = (packed) => [
      packed & 0xff, (packed >>> 8) & 0xff, (packed >>> 16) & 0xff,
    ];
    // Whichever face the last camera happened to look at; the arithmetic below is against that
    // rather than against a face index this test decided on.
    const facing = skybox.axes[5].centre;
    const straightOn = unpack(facing);
    const dimmed = unpack(skybox.dimmed.centre);
    const tinted = unpack(skybox.tinted.centre);
    for (const channel of [0, 1, 2]) {
      assert.ok(
        Math.abs(dimmed[channel] - straightOn[channel] * 0.5) <= 2,
        `half intensity halves channel ${channel}: ${dimmed[channel]} against ` +
        straightOn[channel] * 0.5,
      );
    }
    assert.deepEqual(
      [tinted[1], tinted[2]], [0, 0],
      "a red tint leaves nothing of the other two channels",
    );
    assert.ok(
      Math.abs(tinted[0] - straightOn[0]) <= 2, "and leaves the red one where it was",
    );
    // With no cube map there is nothing to sample, so the pass skips and the clear stands.
    assert.equal(
      skybox.detached.centre, new Color(0, 0, 0, 255).PackedValue,
      "a skybox with no environment draws nothing rather than failing",
    );
    assert.equal(skybox.detachedHasEnvironment, false);
    assert.equal(
      skybox.reattached.centre, facing, "and attaching it again brings the same sky back",
    );
  }

  /*
   * The owned transfer, which is the one route in this family that consumes a handle the caller
   * still holds. After it the wrapper owns nothing: using it is a use after free and disposing it
   * would be a double one, so it refuses the first and makes the second harmless.
   */
  assert.deepEqual(
    evidence.generated, [evidence.generated.size, evidence.generated.levels].length === 2
      ? { size: 8, levels: 1 } : evidence.generated,
    "the processor produced the cube map at the face size asked for",
  );
  assert.equal(evidence.transfer.hasEnvironment, true, "the skybox took the cube map");
  assert.match(
    evidence.transfer.cubeRefusesUse, /Exception|Error/,
    `the handed-over wrapper refuses further use: ${evidence.transfer.cubeRefusesUse}`,
  );
  assert.equal(
    evidence.transfer.cubeDisposeIsSafe, "ACCEPTED",
    "and disposing it is harmless rather than a second release",
  );

  // The pipeline borrows a skybox and gives back the object that was set.
  assert.deepEqual(
    evidence.pipeline, { beforeIsNull: true, sameObject: true, clearedIsNull: true },
    "a pipeline with no sky has none, takes one, gives back the same object, and lets it go",
  );

  assert.equal(evidence.refusals.zeroWidth, "RangeError");
  assert.equal(evidence.refusals.zeroHeight, "RangeError");
  assert.equal(evidence.refusals.disposedSky, "NativeUnavailableError");

  console.log(
    `CNA_TS_WINDOWED_ATMOSPHERE=OK TEXELS=${SIZE * SIZE} ` +
    Object.entries(agreement)
      .map(([name, summary]) => `${name}=${summary.exact}/${summary.total}`)
      .join(" ") +
    ` SKYBOX=${skybox.supported ? "6_FACES" : "UNSUPPORTED"}`,
  );
});

test("a windowed CNA renderer renders the cascaded, spot and cube shadow passes", { skip }, async () => {
  const game = new WindowedProbeGame(2);
  try {
    await game.Run();
  } finally {
    game.Dispose();
  }
  const evidence = game.evidence.otherShadowPasses;
  assert.equal(typeof evidence, "object", `the shadow-pass probe did not run: ${evidence}`);
  assert.equal(
    game.evidence.otherShadowCleanup, undefined,
    `every shadow pass released: ${JSON.stringify(game.evidence.otherShadowCleanup)}`,
  );

  if (evidence.layerAbsent) {
    assert.equal(evidence.extensionLayer, false, "a refused create must mean the layer is absent");
    assert.equal(evidence.cnaResult, CnaResult.NotSupported);
    console.log("CNA_TS_WINDOWED_SHADOW_PASSES=LAYER_ABSENT");
    return;
  }

  /*
   * The cascade, against the pure maths beside it.
   *
   * `ComputeCascadeSplitDistances` takes a near plane, a far plane, a count and a lambda and
   * touches no shadow map at all. The map computed its own splits from a camera the test built, so
   * the two have to be the same four numbers -- and a map that ignored the lambda, the camera or
   * the count cannot be.
   */
  const cascaded = evidence.cascaded;
  assert.equal(cascaded.count, evidence.cascadeCount, "the map holds the cascades it was asked for");
  assert.ok(cascaded.size > 0);
  assert.deepEqual(
    [cascaded.set.lambda, cascaded.set.band, cascaded.set.tint, cascaded.tintOff],
    [Math.fround(evidence.lambda), 0.25, true, false],
    "the split lambda, the blend band and the debug tint all round-trip",
  );
  assert.equal(cascaded.splits.length, evidence.cascadeCount);
  for (const [index, split] of cascaded.splits.entries()) {
    const pure = cascaded.pureSplits[index];
    assert.ok(
      Math.abs(split - pure) < Math.abs(pure) * 1e-4 + 1e-3,
      `cascade ${index} splits at ${split}; the pure route says ${pure}`,
    );
  }
  // And they are a real division of the range rather than three copies of the far plane.
  assert.ok(
    cascaded.splits[0] < cascaded.splits[1] && cascaded.splits[1] < cascaded.splits[2],
    `the splits increase: ${cascaded.splits}`,
  );
  assert.ok(
    Math.abs(cascaded.splits[cascaded.splits.length - 1] - evidence.far) < 1,
    "and the last one is the far plane",
  );
  // Which cascade a depth belongs to is the first split that reaches it, which the test works out
  // from the splits themselves rather than from a table.
  for (const [depth, selected] of cascaded.selections) {
    let expected = cascaded.splits.findIndex((split) => depth <= split);
    if (expected < 0) expected = cascaded.splits.length - 1;
    assert.equal(
      selected, expected,
      `a view depth of ${depth} belongs to cascade ${expected}, not ${selected}`,
    );
  }
  // Three cascades are three different transforms.
  for (let index = 1; index < cascaded.matrices.length; index += 1) {
    assert.notDeepEqual(
      cascaded.matrices[index], cascaded.matrices[index - 1],
      `cascade ${index} must have its own transform`,
    );
  }
  /*
   * And a cascade is framed from the light, not only from the camera: under a different light
   * direction, with the same camera, every transform moves and not one split does. That separation
   * is the whole shape of the update -- the camera decides where the slices are, the light decides
   * how each one is looked at.
   */
  for (const [index, matrix] of cascaded.underOtherLight.matrices.entries()) {
    assert.notDeepEqual(
      matrix, cascaded.matrices[index],
      `cascade ${index}'s transform must move when the light does`,
    );
  }
  assert.deepEqual(
    cascaded.underOtherLight.splits, cascaded.splits,
    "while the splits stay where the camera put them",
  );
  /*
   * Snapping, which is why a cascade does not shimmer. A centre is quantised to a whole number of
   * its own texels -- the texel being twice the radius over the cascade's size -- so two centres
   * less than a texel apart land on the same one and a centre further away does not.
   */
  const texel = (2 * cascaded.snap.radius) / cascaded.snap.size;
  assert.deepEqual(
    cascaded.snap.first, cascaded.snap.nearby,
    "two centres inside one texel snap to the same place",
  );
  assert.notDeepEqual(
    cascaded.snap.first, cascaded.snap.farther, "and two further apart do not",
  );
  for (const axis of [0, 1]) {
    const quotient = cascaded.snap.first[axis] / texel;
    assert.ok(
      Math.abs(quotient - Math.round(quotient)) < 1e-3,
      `the snapped centre is a whole number of texels on axis ${axis}: ${quotient}`,
    );
  }
  assert.equal(
    cascaded.snap.first[2], cascaded.snap.farther[2],
    "and the axis the light looks along is left alone",
  );
  // The atlas is the cascades side by side, which is what makes the columns below meaningful.
  assert.equal(
    cascaded.texture.width, cascaded.size * cascaded.count,
    "the atlas is one cascade wide per cascade",
  );
  assert.equal(cascaded.texture.height, cascaded.size);
  assert.equal(cascaded.texture.cached, true, "the borrow is taken once, not once per read");

  if (cascaded.supported) {
    assert.equal(cascaded.effect, "Default", "the caster program is lent and is real");
    /*
     * What each step did to the atlas, measured slice by slice.
     *
     * A fresh atlas is untouched storage reading as zero -- the nearest possible surface -- rather
     * than a cleared one. Then every step is compared against the one before it, so the assertions
     * are about *changes*: which cascade a `Begin` cleared, which one a cast wrote into, and which
     * ones neither touched. A `Begin` that ignored its argument fails every one of them.
     */
    const steps = cascaded.steps;
    const wholeSlice = cascaded.size * cascaded.size;
    assert.deepEqual(
      steps.fresh, new Array(cascaded.count).fill([wholeSlice, 0]),
      "a new atlas is untouched storage in every cascade, not a cleared one",
    );
    const changed = (before, after) =>
      after.map((slice, index) =>
        (slice[0] !== before[index][0] || slice[1] !== before[index][1] ? index : -1))
        .filter((index) => index >= 0);
    // The first pass clears the whole atlas, which is the one step that is not per-cascade: the
    // storage had never been written, so there is nothing to preserve in the other slices yet.
    assert.deepEqual(
      steps.emptyFirst, new Array(cascaded.count).fill([0, 1]),
      "the first pass leaves every cascade at the far plane",
    );
    assert.deepEqual(
      changed(steps.emptyFirst, steps.emptyMiddle), [],
      "a second empty pass over an already-cleared atlas changes nothing",
    );
    assert.deepEqual(
      changed(steps.emptyMiddle, steps.castFirst), [0],
      `casting into cascade 0 must change cascade 0 alone: ${JSON.stringify(steps.castFirst)}`,
    );
    assert.deepEqual(
      changed(steps.castFirst, steps.castLast), [cascaded.count - 1],
      `casting into the last cascade must change that one alone: ${JSON.stringify(steps.castLast)}`,
    );
    assert.deepEqual(
      steps.castLast[0], steps.castFirst[0],
      "and must leave the first cascade exactly as the first cast had it, which is what says a " +
      "Begin clears its own viewport rather than the whole atlas",
    );
    for (const [name, index] of [["castFirst", 0], ["castLast", cascaded.count - 1]]) {
      const [occluded, low] = steps[name][index];
      assert.ok(occluded > 0, `${name} darkened texels in cascade ${index}`);
      assert.ok(low >= 0 && low < 1, `and wrote a depth nearer than the far plane (${low})`);
    }
    // And the same property from the other direction: an empty pass over the middle cascade puts
    // that one back to the far plane and leaves the two that carry casters alone.
    assert.deepEqual(
      changed(steps.castLast, steps.emptyMiddleAgain), [],
      "the middle cascade was already clear, so clearing it again changes nothing",
    );
    assert.deepEqual(steps.emptyMiddleAgain[1], [0, 1]);
  }

  /*
   * The spot cone: its transform against the two pure routes, multiplied here.
   */
  const spot = evidence.spot;
  assert.equal(spot.size, spot.sizeForQuality, "a spot map is the flat map's size at its tier");
  assert.deepEqual(spot.position, [2, 8, -3], "the light's position round-trips through the pass");
  assert.equal(spot.range, 40);
  // A value that is not the default, so a setter that never reached CNA cannot pass by standing
  // still.
  assert.notEqual(spot.defaultBias, 0.0123);
  assert.ok(
    Math.abs(spot.biasSet - 0.0123) < 1e-6, `the depth bias round-trips (${spot.biasSet})`,
  );
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
  const expectedSpot = multiply(spot.pureView, spot.pureProjection);
  for (let index = 0; index < 16; index += 1) {
    assert.ok(
      Math.abs(spot.lightViewProjection[index] - expectedSpot[index]) < 1e-4,
      `the spot pass transform disagrees with view * projection at element ${index}: ` +
      `${spot.lightViewProjection[index]} against ${expectedSpot[index]}`,
    );
  }
  // And it is a real transform, not an identity that would agree with anything.
  assert.ok(
    spot.lightViewProjection.slice(12, 15).some((value) => Math.abs(value) > 1e-3),
    "a light away from the origin gives the transform real translation terms",
  );
  assert.deepEqual(
    [spot.texture.width, spot.texture.height], [spot.size, spot.size],
    "and its map is the square its tier bought",
  );
  if (spot.supported) {
    assert.equal(spot.effect, "Default");
    assert.equal(spot.emptyPass.low, 1, "an empty spot pass clears its map to the far plane");
    assert.ok(spot.castLow.occluded > 0, "a floor under the light is recorded");
    assert.ok(spot.castHigh.occluded > 0, "and so is one raised towards it");
    // Nearer the light is a smaller depth, and a closer floor fills more of the cone.
    assert.ok(
      spot.castHigh.low < spot.castLow.low,
      `a surface nearer the light records a smaller depth: ${spot.castHigh.low} against ` +
      spot.castLow.low,
    );
    assert.ok(
      spot.castHigh.occluded > spot.castLow.occluded,
      `and covers more of the cone: ${spot.castHigh.occluded} against ${spot.castLow.occluded}`,
    );
  }

  /*
   * The point light's cube: six faces, at the face size its own tier bought -- which is not the
   * flat map's, because a cube is paying for six of them.
   */
  const cube = evidence.cube;
  assert.equal(
    cube.size, cube.cubeSizeForQuality,
    "a cube's face is the size the cube route reports for its tier",
  );
  assert.deepEqual(cube.position, [-1, 3, 2], "the light's position round-trips");
  assert.equal(cube.range, 25);
  assert.ok(Math.abs(cube.biasSet - 0.006) < 1e-6);
  assert.equal(
    cube.texture.size, cube.size, "and its storage is a cube of that face size",
  );
  assert.equal(cube.texture.levels, 1);
  assert.equal(cube.texture.cached, true, "the borrow is taken once, not once per read");
  // The managed cube transfer covers exact Color elements only, and a depth cube is not one. That
  // is a boundary this package states rather than a format it reinterprets.
  assert.match(
    cube.readBack, /^NotSupportedException$/,
    `reading a Single cube back is refused by name: ${cube.readBack}`,
  );
  if (cube.supported) {
    assert.equal(cube.effect, "Default");
    assert.deepEqual(
      cube.faces, new Array(6).fill("ACCEPTED"), "all six faces open and close",
    );
  }

  // What is refused, and by whom.
  for (const name of ["cascadeOutside", "splitOutside", "beginOutside", "faceOutside"]) {
    assert.equal(
      evidence.refusals[name], CnaResult.InvalidArgument,
      `${name} is CNA's own argument refusal: ${evidence.refusals[name]}`,
    );
  }
  assert.equal(evidence.refusals.fractionalCascade, "TypeError");
  assert.equal(evidence.refusals.nullSpotLight, "TypeError");
  assert.equal(evidence.refusals.nullPointLight, "TypeError");
  assert.equal(evidence.refusals.disposed, "NativeUnavailableError");

  console.log(
    `CNA_TS_WINDOWED_SHADOW_PASSES=OK CASCADES=${cascaded.count}x${cascaded.size} ` +
    `SPLITS=${cascaded.splits.map((value) => value.toFixed(1)).join("/")} ` +
    `ATLAS=${cascaded.texture.width}x${cascaded.texture.height} ` +
    `SPOT=${spot.size}px CUBE=${cube.size}px/face`,
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

test("a windowed CNA renderer runs every post-process pass to the exact pixels its own maths predicts", { skip }, async () => {
  const game = new WindowedProbeGame(6);
  await game.Run();
  const evidence = game.evidence;
  // The game must destroy cleanly: a leaked borrow makes cna_game_destroy refuse, and finding 18
  // records that a process which exits in that state segfaults after its last line has run.
  game.Dispose();

  const pp = evidence.postProcess;
  assert.equal(typeof pp, "object", `the post-process block did not run: ${pp}`);
  if (pp.layerAbsent) {
    assert.equal(pp.extensionLayer, false, "a layer that is present must not refuse to make a pass");
    console.log(`CNA_TS_WINDOWED_POST_PROCESS=SKIPPED_NO_LAYER RESULT=${pp.cnaResult}`);
    return;
  }
  assert.equal(evidence.postProcessCleanup, undefined, `cleanup failed: ${evidence.postProcessCleanup}`);

  const { TonemapPass, TonemappingMode } = computeModule;
  const N = 4;
  const source = pp.source;
  assert.equal(source.length, N * N);
  // The source really is asymmetric: no flip of it is itself, so any of them would be caught below.
  const flipX = [];
  const flipY = [];
  const transpose = [];
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      flipX.push(source[y * N + (N - 1 - x)]);
      flipY.push(source[(N - 1 - y) * N + x]);
      transpose.push(source[x * N + y]);
    }
  }
  for (const [name, other] of [["mirrored", flipX], ["flipped", flipY], ["transposed", transpose]]) {
    assert.notDeepEqual(source, other, `the source gradient is ${name}-symmetric, so it proves nothing`);
  }

  /** Every channel of every texel, against a prediction computed from the source texel. */
  const eachTexel = (actual, predict, label, tolerance = 0) => {
    assert.equal(actual.length, N * N, `${label} did not come back at full size`);
    for (let index = 0; index < N * N; index += 1) {
      const expected = predict(source[index], index);
      for (let channel = 0; channel < 4; channel += 1) {
        assert.ok(
          Math.abs(actual[index][channel] - expected[channel]) <= tolerance,
          `${label} texel ${index % N},${Math.floor(index / N)} channel ${channel}: ` +
          `${actual[index][channel]} vs ${expected[channel]} (source ${source[index].join(",")})`,
        );
      }
    }
  };

  // --- the colour grade ---------------------------------------------------------------------------
  // The LUT this test wrote rotates the channels, and that map is linear, so trilinear
  // interpolation reproduces it exactly. The prediction is the rotation applied in JavaScript --
  // nothing here was read off a run.
  assert.deepEqual(pp.lut.stripSize, [4, 2], "a size-2 cube is a 4x2 strip: two 2x2 slices");
  assert.deepEqual(pp.lut.volumeSize, [2, 2, 2], "and a 2x2x2 volume");
  const rotated = ([r, g, b, a]) => [b, r, g, a];
  eachTexel(pp.grade.fullStrip, rotated, "the strip LUT at full strength");
  eachTexel(pp.grade.fullVolume, rotated, "the volume LUT at full strength");
  assert.deepEqual(
    pp.grade.fullStrip, pp.grade.fullVolume,
    "the same table as a strip and as a volume must grade to the same pixels",
  );
  // Strength is a lerp between the source and the graded result, so half is exactly the midpoint.
  eachTexel(
    pp.grade.half,
    (texel) => {
      const target = rotated(texel);
      return texel.map((value, channel) => Math.round((value + target[channel]) / 2));
    },
    "the strip LUT at half strength",
    1,
  );
  eachTexel(pp.grade.zeroStrength, (texel) => texel, "a LUT at zero strength");
  eachTexel(pp.grade.noLut, (texel) => texel, "a grade with no LUT at all");
  // The rotation is not the identity, so the four assertions above are four different assertions.
  assert.notDeepEqual(pp.grade.fullStrip, pp.grade.zeroStrength);
  assert.notDeepEqual(pp.grade.half, pp.grade.fullStrip);
  assert.notDeepEqual(pp.grade.half, pp.grade.zeroStrength);
  // What the pass says it holds, through a strip, a volume, both, and neither again.
  assert.deepEqual(pp.grade.hasNothing, [false, false]);
  assert.deepEqual(pp.grade.hasStrip, [true, false]);
  assert.deepEqual(pp.grade.hasBoth, [true, true]);
  assert.deepEqual(pp.grade.hasNeitherAgain, [false, false], "setting null detaches rather than keeping");
  assert.equal(pp.grade.interpolation, computeModule.LutInterpolation.Tetrahedral);
  assert.ok(Math.abs(pp.grade.strength - 0.375) < 1e-6);

  // --- the tonemapper ------------------------------------------------------------------------------
  // Predicted texel by texel through TonemapPass.TonemapChannel, whose own agreement with the
  // published curves is established in the headless suite against the closed forms. So this is the
  // shader checked against the model, not the shader checked against itself.
  const tonemapped = (mode, exposure, gamma) => (texel) => [
    ...texel.slice(0, 3).map(
      (value) => Math.round(TonemapPass.TonemapChannel(mode, value / 255, exposure, gamma) * 255),
    ),
    texel[3],
  ];
  eachTexel(pp.tonemap.identity, tonemapped(TonemappingMode.None, 1, 1), "no tonemapping at unit settings");
  eachTexel(pp.tonemap.quarterExposure, tonemapped(TonemappingMode.None, 0.25, 1), "quarter exposure", 1);
  eachTexel(pp.tonemap.gammaTwo, tonemapped(TonemappingMode.None, 1, 2), "gamma two", 1);
  eachTexel(pp.tonemap.reinhard, tonemapped(TonemappingMode.Reinhard, 1, 1), "Reinhard", 1);
  eachTexel(pp.tonemap.aces, tonemapped(TonemappingMode.Aces, 1, 1), "ACES", 2);
  // At unit settings "None" is a copy, and the three curves are three different pictures.
  eachTexel(pp.tonemap.identity, (texel) => texel, "no tonemapping at unit settings, again");
  const distinct = new Set(
    ["identity", "quarterExposure", "gammaTwo", "reinhard", "aces"].map((k) => JSON.stringify(pp.tonemap[k])),
  );
  assert.equal(distinct.size, 5, "five tonemapper settings must give five different frames");

  // --- what each pass's own "off" setting promises --------------------------------------------------
  for (const [name, pixels] of Object.entries(pp.identities)) {
    eachTexel(pixels, (texel) => texel, `${name} must be an exact copy`);
  }
  assert.ok(
    Object.keys(pp.identities).length >= 8,
    `too few identities checked: ${Object.keys(pp.identities).join(",")}`,
  );

  // --- and that those passes do something when turned on ---------------------------------------------
  // A bloom only ever adds light, and adds none where nothing crosses the threshold -- which is what
  // the two bloom identities above already showed. Here it is turned on and must brighten.
  const bloom = pp.changed.bloom;
  let brightened = 0;
  for (let index = 0; index < N * N; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      assert.ok(
        bloom[index][channel] >= source[index][channel] - 1,
        `a bloom must not darken texel ${index} channel ${channel}: ` +
        `${bloom[index][channel]} < ${source[index][channel]}`,
      );
      if (bloom[index][channel] > source[index][channel]) brightened += 1;
    }
  }
  assert.ok(brightened > N * N, `a bloom over a bright gradient brightened only ${brightened} channels`);

  // Chromatic aberration displaces red and blue in opposite directions and leaves green alone --
  // that is what makes it chromatic rather than a blur.
  const aberration = pp.changed.aberration;
  for (let index = 0; index < N * N; index += 1) {
    assert.equal(
      aberration[index][1], source[index][1],
      `chromatic aberration moved green at texel ${index}`,
    );
  }
  assert.notDeepEqual(
    aberration.map((t) => t[0]), source.map((t) => t[0]), "and it must move red",
  );
  assert.notDeepEqual(
    aberration.map((t) => t[2]), source.map((t) => t[2]), "and blue",
  );

  // Film grain is noise: it must change most of the frame, and it must not be the same everywhere,
  // which a constant offset mistaken for grain would be.
  const grain = pp.changed.grain;
  const changedTexels = grain.filter((texel, index) => texel.some((v, c) => v !== source[index][c]));
  assert.ok(changedTexels.length > N * N / 2, `grain changed only ${changedTexels.length} of ${N * N} texels`);
  const offsets = new Set(grain.map((texel, index) => texel[0] - source[index][0]));
  assert.ok(offsets.size > 1, "grain that offsets every texel by the same amount is not noise");

  // FXAA blends across edges, so it changes the border of this gradient and leaves its smooth
  // interior alone.
  const fxaa = pp.changed.fxaa;
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) {
    const index = y * N + x;
    assert.deepEqual(
      fxaa[index], source[index],
      `FXAA must leave the interior of a smooth gradient alone at ${x},${y}`,
    );
  }
  assert.notDeepEqual(fxaa[0], source[0], "and it must touch the corner it clamps at");

  // --- the CRT effect -------------------------------------------------------------------------------
  const flat = pp.crt.flatValue;
  const grid = pp.crt.grid;
  const crtRow = (pixels, row) => pixels.slice(row * grid, row * grid + grid);
  const isFlat = (pixels, value) => pixels.every((texel) => texel.slice(0, 3).every((c) => c === value));
  assert.ok(isFlat(pp.crt.allOff, flat), "a CRT with every parameter at zero must be an exact copy");
  // Scanlines darken alternate rows by exactly the intensity, which is the whole model.
  for (const [name, intensity] of [["scanlinesHalf", 0.5], ["scanlinesQuarter", 0.25]]) {
    const pixels = pp.crt[name];
    const dark = Math.round(flat * (1 - intensity));
    for (let row = 0; row < grid; row += 1) {
      const expected = row % 2 === 0 ? dark : flat;
      assert.ok(
        isFlat(crtRow(pixels, row), expected),
        `${name} row ${row}: expected a flat ${expected}, got ${JSON.stringify(crtRow(pixels, row)[0])}`,
      );
    }
  }
  assert.notDeepEqual(pp.crt.scanlinesHalf, pp.crt.scanlinesQuarter, "and the intensity must matter");
  // A vignette is radial: symmetric under both mirrors, and strictly darker towards the corner.
  const vignette = pp.crt.vignette;
  const at = (x, y) => vignette[y * grid + x][0];
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      assert.equal(at(x, y), at(grid - 1 - x, y), `the vignette is not left-right symmetric at ${x},${y}`);
      assert.equal(at(x, y), at(x, grid - 1 - y), `the vignette is not top-bottom symmetric at ${x},${y}`);
    }
  }
  for (let step = 1; step < grid / 2; step += 1) {
    assert.ok(
      at(step, step) > at(step - 1, step - 1),
      `the vignette must brighten towards the centre: ${at(step - 1, step - 1)} then ${at(step, step)}`,
    );
  }
  assert.ok(at(0, 0) < flat / 2, `the corner of a full vignette is barely lit, not ${at(0, 0)}`);
  assert.ok(
    at(grid / 2, grid / 2) > flat * 0.9,
    `and its centre is nearly untouched, not ${at(grid / 2, grid / 2)}`,
  );
  // The parameters CNA reports, and the values it takes back. Every one written differs from the
  // default it replaced, so a setter that did nothing would be caught.
  const [scan, curve, vig, mask, maskType] = pp.crt.defaults;
  assert.ok(scan > 0 && scan < 1 && curve > 0 && vig > 0 && mask > 0, `odd CRT defaults: ${pp.crt.defaults}`);
  assert.deepEqual(pp.crt.set, [0.4375, 0.5, 0.75, 0.125, computeModule.CrtMaskType.ShadowMask]);
  for (let index = 0; index < 5; index += 1) {
    assert.notEqual(pp.crt.set[index], pp.crt.defaults[index], `CRT parameter ${index} was set to its default`);
  }
  assert.equal(maskType, computeModule.CrtMaskType.ApertureGrille);
  assert.equal(typeof pp.crt.technique, "string");
  assert.ok(pp.crt.technique.length > 0, "a CRT effect has a named technique");

  // --- the depth effect ------------------------------------------------------------------------------
  // No pixel claim here: this effect quantises a depth input that a fullscreen colour blit does not
  // supply, so what is qualified is the state CNA keeps -- VERIFIED_NATIVE_STATE, not VERIFIED_PIXEL.
  assert.deepEqual(
    pp.depthEffect.defaults,
    [computeModule.DepthEffectMode.Color16Bit, computeModule.DitherMode.None],
  );
  assert.deepEqual(
    pp.depthEffect.set,
    [computeModule.DepthEffectMode.Grayscale1Bit, computeModule.DitherMode.Bayer8X8],
  );
  assert.ok(pp.depthEffect.technique.length > 0);

  // --- the ASCII grid -----------------------------------------------------------------------------------
  // The grid is the SOURCE size over the cell size. The destination rectangle is four times the
  // source's area here and never appears in any of the three answers, which is the point.
  assert.deepEqual(pp.ascii.sourceSize, [32, 24]);
  assert.deepEqual(pp.ascii.destinationSize, [64, 48]);
  assert.deepEqual(pp.ascii.beforeAnyDraw, [0, 0], "nothing has been quantised yet");
  for (const [cell, expected] of [[[8, 12], [4, 2]], [[4, 4], [8, 6]], [[16, 8], [2, 3]]]) {
    const key = `cell${cell[0]}x${cell[1]}`;
    assert.deepEqual(
      pp.ascii[key], expected,
      `a ${pp.ascii.sourceSize.join("x")} source in ${cell.join("x")} cells is ` +
      `${expected.join("x")}, not ${pp.ascii[key]}`,
    );
    assert.deepEqual(
      expected,
      [pp.ascii.sourceSize[0] / cell[0], pp.ascii.sourceSize[1] / cell[1]],
      "and that is exactly the source divided by the cell",
    );
  }
  assert.deepEqual(pp.ascii.defaultCell.slice(0, 2), [8, 8]);
  assert.equal(pp.ascii.defaultCell[2], computeModule.AsciiQuantizeMode.Color);
  assert.equal(pp.ascii.isBorrowed, false, "an effect the caller made is the caller's");

  // --- finding 17: the effect pass's borrow ---------------------------------------------------------
  // Reading it four times must not accumulate anything -- the clean Dispose above is that half of
  // the evidence -- and the answer must track what the pass actually holds.
  assert.equal(pp.effectPass.name, "crt");
  assert.equal(pp.effectPass.supported, true);
  assert.deepEqual(pp.effectPass.reads, [true, true, true, true], "the borrow must not consume the effect");
  assert.equal(pp.effectPass.afterDetach, false, "SetEffect(null) detaches");
  assert.equal(pp.effectPass.afterReattach, true, "and the same effect goes back on");
  // An owning pass consumes the effect: the caller's wrapper stops owning anything, so its own
  // Dispose becomes the no-op that Dispose always is once a resource has been given away.
  assert.equal(pp.owningPass.name, "owned-crt");
  assert.equal(pp.owningPass.hasEffect, true);
  assert.equal(pp.owningPass.callerDisposeAfterTransfer, "SUCCEEDED");

  // --- the ASCII pass's borrowed effect ---------------------------------------------------------------
  assert.equal(pp.asciiPass.name, "Ascii");
  assert.equal(pp.asciiPass.borrowed, true, "a pass's own effect is a borrow");
  assert.equal(pp.asciiPass.sameObjectTwice, true, "and the same borrow twice, not two handles");
  assert.deepEqual(pp.asciiPass.cellBefore, [8, 8]);
  assert.deepEqual(pp.asciiPass.cellAfter, [12, 16], "writing through the borrow changes the pass's own");
  assert.equal(pp.asciiPass.quantizeAfter, computeModule.AsciiQuantizeMode.BlackWhite);

  console.log(
    `CNA_TS_WINDOWED_POST_PROCESS=PASS GRADE=ROTATION_EXACT TONEMAP=PREDICTED_BY_MODEL ` +
    `IDENTITIES=${Object.keys(pp.identities).length} CRT_SCANLINES=EXACT CRT_VIGNETTE=RADIAL ` +
    `ASCII_GRID=${pp.ascii.cell8x12.join("x")}/${pp.ascii.cell4x4.join("x")}/${pp.ascii.cell16x8.join("x")} ` +
    `BORROWS=RETURNED`,
  );
});

test("a windowed CNA renderer compiles the physically-based effects and takes their material", { skip }, async () => {
  const game = new WindowedProbeGame(6);
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  const pbr = evidence.pbrMaterial;
  assert.equal(typeof pbr, "object", `the PBR block did not run: ${pbr}`);
  if (pbr.layerAbsent) {
    assert.equal(pbr.extensionLayer, false);
    console.log(`CNA_TS_WINDOWED_PBR=SKIPPED_NO_LAYER RESULT=${pbr.cnaResult}`);
    return;
  }
  assert.equal(evidence.pbrCleanup, undefined, `cleanup failed: ${evidence.pbrCleanup}`);

  const { AlphaMode, PbrTextureSlot } = computeModule;
  const { Blend, CullMode } = Graphics;

  // What only a real renderer answers: these are compiled effects with named techniques and
  // passes that execute, where HEADLESS constructs them and refuses.
  assert.equal(typeof pbr.technique, "string");
  assert.ok(pbr.technique.length > 0, "a PBR effect has a named technique");
  assert.ok(pbr.passCount >= 1, `and at least one pass, not ${pbr.passCount}`);
  assert.ok(pbr.skinnedTechnique.length > 0, "and so does the skinned one");
  assert.equal(pbr.apply, "SUCCESS", "its pass applies on a renderer with real shaders");

  // The material round trip, on the GPU-backed device rather than headless.
  assert.equal(
    pbr.roundTrip, true,
    "an applied material extracts back equal to itself in every field but its texture slots",
  );
  assert.equal(
    pbr.roundTripWithTexture, false,
    "and the slots really are the difference, rather than the comparison being vacuous",
  );
  assert.equal(pbr.throughAccessors.metallic, 0.25);
  assert.equal(pbr.throughAccessors.ior, 1.75);
  assert.equal(pbr.throughAccessors.alphaMode, AlphaMode.Blend);
  assert.equal(pbr.throughAccessors.doubleSided, true);
  assert.equal(pbr.throughAccessors.normalSet, 1);
  // Upstream finding 19, all three measured rows.
  assert.equal(
    pbr.slots.afterApplyWithTexture, false,
    "a texture applied with a material is not visible through the slot getter",
  );
  assert.equal(
    pbr.slots.afterSetTexture, true,
    "but one placed through the slot setter is",
  );
  assert.equal(
    pbr.slots.extractedAfterSetTexture, null,
    "and the extractor reports no texture even then",
  );
  assert.equal(
    pbr.slots.afterEmptyApply, true,
    "applying a material with an empty slot does not clear what the setter put there",
  );

  // What ApplyState wrote, read back from CNA and predicted from the XNA states it names.
  assert.equal(pbr.state.blendedSource, Blend.SourceAlpha);
  assert.equal(pbr.state.blendedDestination, Blend.InverseSourceAlpha);
  assert.equal(pbr.state.blendedCull, CullMode.None);
  assert.equal(pbr.state.opaqueSource, Blend.One);
  assert.equal(pbr.state.opaqueDestination, Blend.Zero);
  assert.equal(pbr.state.opaqueCull, CullMode.CullCounterClockwiseFace);

  // The bridge quantises the same way here as it does headless.
  assert.deepEqual(pbr.bridge.albedo, [255, 128, 64, 128]);
  assert.equal(pbr.bridge.ior, 1.75);

  assert.equal(pbr.extensions.neutral, true);
  assert.equal(pbr.extensions.afterEdit, false);
  assert.equal(pbr.extensions.clearcoat, 0.5);
  assert.equal(pbr.extensions.textureFilled, true);

  assert.equal(pbr.skinned.weights, 2);
  assert.equal(pbr.skinned.count, 2);
  assert.deepEqual(pbr.skinned.translation, [3, 4, 5]);

  console.log(
    `CNA_TS_WINDOWED_PBR=PASS TECHNIQUE=${pbr.technique}/${pbr.passCount} APPLY=${pbr.apply} ` +
    `ROUND_TRIP=EXACT STATE=BLEND_AND_CULL BRIDGE=${pbr.bridge.albedo.join("/")}`,
  );
});

test("a windowed CNA renderer draws the volumetric passes, and says when it cannot", { skip }, async () => {
  const game = new WindowedProbeGame(6);
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  const volumetric = evidence.volumetric;
  assert.equal(typeof volumetric, "object", `the volumetric block did not run: ${volumetric}`);
  if (volumetric.layerAbsent) {
    assert.equal(volumetric.extensionLayer, false);
    console.log(`CNA_TS_WINDOWED_VOLUMETRIC=SKIPPED_NO_LAYER RESULT=${volumetric.cnaResult}`);
    return;
  }
  assert.equal(evidence.volumetricCleanup, undefined, `cleanup failed: ${evidence.volumetricCleanup}`);

  assert.deepEqual(
    volumetric.names, ["AerialPerspective", "HeightFog", "LightShafts", "VolumetricFog"],
    "each pass names itself, which is what its GPU timing is filed under",
  );
  assert.deepEqual(volumetric.supported, [true, true, true, true], "and all four run here");

  // CNA's own defaults, which are physical numbers rather than round ones.
  assert.equal(volumetric.defaults.aerial[2], 8400, "the atmosphere's scale height is Earth's");
  assert.ok(volumetric.defaults.aerial[0] > 1, "and its turbidity is a real sky's, not one");
  assert.equal(volumetric.defaults.fog[0], 0, "height fog starts off, so a pipeline pays nothing for it");
  assert.ok(volumetric.defaults.fog[1] > 0, "but with a falloff already set, because zero is not a layer");
  assert.equal(volumetric.defaults.shafts[1], 0, "light shafts start off too");
  assert.deepEqual(volumetric.defaults.shaftPosition, [0.5, 0.5], "with the light in the middle");
  assert.equal(volumetric.defaults.volumetric[0], 0, "and so does volumetric fog");
  assert.equal(volumetric.defaults.aerialFallback, "", "nothing has fallen back before the first frame");

  // Every setting round-trips at float precision, each written to a value no default equals.
  const close = (actual, expected, what) => {
    assert.equal(actual.length, expected.length, what);
    for (const [index, value] of expected.entries()) {
      assert.ok(
        Math.abs(actual[index] - value) < 1e-5,
        `${what}[${index}]: ${actual[index]} vs ${value}`,
      );
    }
  };
  close(volumetric.written.aerial, [3.5, 0.75, 1200, 0.1, 0.9, 0.2], "aerial");
  close(volumetric.written.fog, [0.005, 0.25, 0, 0.6, 0.7, 0.8], "fog");
  close(volumetric.written.shafts, [0.625, 0.875, 0.9, 0.25, 0.75], "shafts");
  close(volumetric.written.volumetric, [0.125, -0.4, 250], "volumetric");

  // --- the fallback ladder --------------------------------------------------------------------------
  // Three states, each naming the input that was missing. This is what the pass does instead of
  // drawing a wrong picture, and it is the only pass in the layer that says so in words.
  assert.equal(volumetric.ladder.length, 3);
  assert.equal(volumetric.ladder[0].drew, false, "with no depth image the pass copies its input");
  assert.match(
    volumetric.ladder[0].reason, /depth/i,
    `and says the depth image was missing: ${volumetric.ladder[0].reason}`,
  );
  assert.equal(volumetric.ladder[1].drew, false, "with depth but no camera it still copies");
  assert.match(
    volumetric.ladder[1].reason, /camera|matri/i,
    `and now says the camera was missing: ${volumetric.ladder[1].reason}`,
  );
  assert.notEqual(
    volumetric.ladder[0].reason, volumetric.ladder[1].reason,
    "the reason must change as inputs are supplied, or it names nothing in particular",
  );
  assert.equal(
    volumetric.ladder[2].reason, "",
    "and with depth, a far plane and the camera it falls back to nothing at all",
  );

  // --- what each pass's own "off" setting promises ----------------------------------------------------
  for (const [name, copied] of Object.entries(volumetric.identities)) {
    assert.equal(copied, true, `${name} must be an exact copy of the source`);
  }
  assert.ok(Object.keys(volumetric.identities).length >= 5);

  // --- and what it does when turned on -----------------------------------------------------------------
  // The fog blend is 1 - exp(-opticalDepth) towards the fog colour, so raising the density can only
  // move every texel further towards that colour, never past it and never back. Both facts come
  // from the closed form the headless suite pins, not from numbers recorded here.
  const target = volumetric.fogColorBytes;
  const source = volumetric.sourcePixels;
  const towards = (pixels, index, channel) => {
    const from = source[index][channel];
    const to = target[channel];
    return (pixels[index][channel] - from) / (to - from);
  };
  let previous = null;
  for (const { density, pixels } of volumetric.fogSweep) {
    for (let index = 0; index < source.length; index += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const fraction = towards(pixels, index, channel);
        assert.ok(
          fraction >= -0.01 && fraction <= 1.01,
          `fog at density ${density} moved texel ${index} channel ${channel} outside its own ` +
          `colour: ${pixels[index][channel]} between ${source[index][channel]} and ${target[channel]}`,
        );
        if (previous) {
          assert.ok(
            fraction >= towards(previous.pixels, index, channel) - 0.01,
            `raising the density from ${previous.density} to ${density} moved texel ${index} ` +
            `channel ${channel} back towards the source`,
          );
        }
      }
    }
    previous = { density, pixels };
  }
  assert.ok(
    towards(volumetric.fogSweep[2].pixels, 0, 0) > towards(volumetric.fogSweep[0].pixels, 0, 0) + 0.05,
    "and twenty times the density is visibly more fog, not the same picture",
  );
  // A descending ray runs into a denser layer, which the closed form says gathers far more.
  assert.ok(
    towards(volumetric.fogDescending, 0, 0) > towards(volumetric.fogSweep[1].pixels, 0, 0),
    "a camera looking down must gather more fog than one looking level, at the same density",
  );
  // Enough density and every texel is exactly the fog colour, with nothing of the source left.
  for (const texel of volumetric.fogSaturated) {
    assert.deepEqual(texel, target, "a saturated fog is exactly the fog colour");
  }
  assert.equal(volumetric.shaftsDrew, true, "light shafts turned on must change the frame");
  assert.equal(volumetric.volumetricDrew, true, "and so must volumetric fog");

  console.log(
    `CNA_TS_WINDOWED_VOLUMETRIC=PASS LADDER=3_STATES IDENTITIES=` +
    `${Object.keys(volumetric.identities).length} FOG=MONOTONE_TO_${target.join("/")} ` +
    `PACKED_DEPTH=${volumetric.usesPackedDepth}`,
  );
});

test("a windowed CNA renderer's GPU instance culler runs and keeps everything", { skip }, async () => {
  const game = new WindowedProbeGame(6);
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  const gpu = evidence.gpuCulling;
  assert.equal(typeof gpu, "object", `the GPU culling block did not run: ${gpu}`);
  if (gpu.layerAbsent) {
    assert.equal(gpu.extensionLayer, false);
    console.log(`CNA_TS_WINDOWED_GPU_CULL=SKIPPED_NO_LAYER RESULT=${gpu.cnaResult}`);
    return;
  }

  // A renderer without compute shaders says so and refuses the cull, which is the honest answer
  // and the one three of the four renderers built here give.
  if (!gpu.supported) {
    assert.ok(gpu.reason.length > 0, "an unsupported culler must say why");
    for (const row of gpu.rows) {
      if (row.offered === 0) continue;
      assert.match(
        String(row.culled), /^result \d+$/,
        `an unsupported culler must refuse the cull, not accept it: ${row.culled}`,
      );
    }
    console.log(`CNA_TS_WINDOWED_GPU_CULL=UNSUPPORTED REASON=${gpu.reason.slice(0, 60)}`);
    return;
  }

  assert.equal(gpu.reason, "", "a supported culler names no reason");
  assert.ok(gpu.glslLength > 50, "and hands out the GLSL a shader includes to index the survivors");
  assert.ok(
    gpu.glsl.includes("gl_InstanceID"),
    "which indexes what survived rather than what was offered",
  );

  // Upstream finding 20. The culler runs -- the count is never the zero the CPU uploaded -- and it
  // keeps every instance, wherever it is. The CPU column beside it is this package's own
  // BoundingFrustum over the same world-space boxes, so the two cullers are compared with each
  // other. A repair makes the second and third rows fail, which is the point of asserting them.
  const rows = Object.fromEntries(gpu.rows.map((row) => [row.name, row]));
  for (const row of gpu.rows) {
    assert.equal(row.instanceCount, row.offered, `${row.name}: the culler holds what it was given`);
    assert.equal(row.beforeCull, 0, `${row.name}: nothing is visible before a cull has run`);
    assert.equal(row.culled, "ACCEPTED", `${row.name}: a supported culler accepts the cull`);
    assert.equal(
      row.gpuVisible, row.offered,
      `${row.name}: the GPU culler kept ${row.gpuVisible} of ${row.offered}, ` +
      `where the CPU frustum keeps ${row.cpuVisible} -- see docs/upstream-cna-findings.md item 20`,
    );
  }
  // The table is only evidence if the CPU column disagrees somewhere.
  assert.equal(rows.allInside.cpuVisible, 3, "three instances inside the frustum are all visible");
  assert.equal(
    rows.allOutside.cpuVisible, 0,
    "three instances ten thousand units outside it are not, by this package's own frustum",
  );
  assert.equal(rows.allOutside.gpuVisible, 3, "and the GPU culler keeps all three anyway");
  assert.equal(rows.mixed.cpuVisible, 2, "two of four are visible");
  assert.equal(rows.mixed.gpuVisible, 4, "and the GPU culler keeps all four");
  assert.equal(
    rows.none.gpuVisible, 0,
    "the only row it answers zero for is the one with nothing to count",
  );

  // What it does refuse, which is what makes an accepted cull mean anything at all.
  assert.notEqual(gpu.refusals.zeroIndexCount, "SUCCEEDED", "a draw of no indices is refused");
  assert.notEqual(gpu.refusals.negativeFirstIndex, "SUCCEEDED", "and a negative offset");
  assert.equal(gpu.refusals.fractionalCount, "TypeError:-", "and a fractional index count");
  assert.equal(gpu.refusals.nullView, "TypeError:-", "and a missing camera");

  console.log(
    `CNA_TS_WINDOWED_GPU_CULL=FINDING_20 ROWS=` +
    gpu.rows.map((row) => `${row.name}:${row.cpuVisible}/${row.gpuVisible}of${row.offered}`).join(" "),
  );
});

test("a windowed CNA renderer adapts its exposure the way its own model says", { skip }, async () => {
  const game = new WindowedProbeGame(6);
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  const block = evidence.exposure;
  assert.equal(typeof block, "object", `the exposure block did not run: ${block}`);
  if (block.layerAbsent) {
    assert.equal(block.extensionLayer, false);
    console.log(`CNA_TS_WINDOWED_EXPOSURE=SKIPPED_NO_LAYER RESULT=${block.cnaResult}`);
    return;
  }
  assert.equal(evidence.exposureCleanup, undefined, `cleanup failed: ${evidence.exposureCleanup}`);

  const { DisplayColorSpace } = computeModule;

  // --- the display output object ---------------------------------------------------------------
  assert.deepEqual(
    block.display.defaults, [DisplayColorSpace.Srgb, 200, 1000],
    "a display starts as an ordinary sRGB one at two hundred nits with a thousand-nit peak",
  );
  assert.deepEqual(block.display.written, [DisplayColorSpace.Hdr10, 250, 1500]);
  // The headless suite proves from the pure routes that an sRGB encode passes the scene value
  // through unchanged. This is that claim as pixels: the drawn frame is byte-identical.
  assert.equal(
    block.display.srgbIsACopy, true,
    "an sRGB display output draws the scene exactly as it was, which is what its encode says",
  );
  assert.equal(
    block.display.hdr10Differs, true,
    "and an HDR10 one does not, or the colour space would be doing nothing",
  );

  // --- spatial upscaling ---------------------------------------------------------------------------
  assert.ok(block.upscale.defaults[0] > 0, "an upscaler sharpens by default");
  assert.equal(block.upscale.defaults[1], true, "and follows edges by default");
  assert.deepEqual(block.upscale.written, [0.625, false]);
  // The upscaled edge: a 4x4 source whose left half is black and right half white, drawn at 8x8.
  const upscaled = block.upscale.drew;
  assert.ok(Array.isArray(upscaled), `the upscale did not draw: ${upscaled}`);
  assert.equal(upscaled.length, 64);
  for (const value of upscaled) {
    assert.notEqual(
      value, 20,
      "the pass must cover the whole target: a texel still at the clear colour was never written",
    );
  }
  const rows = [];
  for (let row = 0; row < 8; row += 1) rows.push(upscaled.slice(row * 8, row * 8 + 8));
  for (const row of rows) {
    assert.deepEqual(row, rows[0], "a vertical edge upscales to the same row everywhere");
    for (let index = 1; index < row.length; index += 1) {
      assert.ok(row[index] >= row[index - 1], `the edge is not monotone across the row: ${row}`);
    }
    assert.ok(row[0] < 32, "the black side stays black");
    assert.ok(row[7] > 223, "and the white side stays white");
  }
  // The source's edge is halfway across it, so the drawn edge is halfway across the target.
  const crossing = rows[0].findIndex((value) => value > 127);
  assert.ok(
    crossing === 4 || crossing === 3,
    `the edge landed at column ${crossing} of eight, not halfway: ${rows[0]}`,
  );

  // --- automatic exposure ----------------------------------------------------------------------------
  if (block.exposure.unsupported) {
    assert.match(
      block.exposure.unsupported, /^result \d+$/,
      "a renderer without compute shaders refuses the auto exposure rather than faking it",
    );
    console.log(`CNA_TS_WINDOWED_EXPOSURE=NO_COMPUTE ${block.exposure.unsupported}`);
    return;
  }
  const exposure = block.exposure;
  assert.equal(exposure.defaults[0], 1, "an auto exposure starts at one");
  assert.ok(
    Math.abs(exposure.defaults[1] - 0.18) < 1e-5,
    "and aims at eighteen per cent grey, which is what a light meter is calibrated to",
  );
  assert.ok(
    exposure.defaults[2] > exposure.defaults[3],
    "adapting to light is faster than adapting to dark, as an eye is",
  );
  assert.deepEqual(exposure.speeds, [2, 0.5], "and both speeds are the caller's to set");
  assert.equal(exposure.key, 0.25);

  // The measurement is the average channel value, exactly.
  assert.equal(exposure.measuredBright, 1, "a white scene measures one");
  assert.ok(
    Math.abs(exposure.measuredDark - 8 / 255) < 1e-6,
    `a scene of eight-out-of-255 measures exactly that: ${exposure.measuredDark}`,
  );

  // The adaptation is exponential towards key / luminance, at the speed that matches the
  // direction the *scene* moved: brightening when the scene got brighter, darkening when darker.
  const KEY = 0.25;
  const BRIGHTENING = 2;
  const DARKENING = 0.5;
  const step = (current, target, seconds) => {
    const speed = target < current ? BRIGHTENING : DARKENING;
    return target + (current - target) * Math.exp(-speed * seconds);
  };
  const brightTarget = KEY / exposure.measuredBright;
  let predicted = 1;
  for (const [index, measured] of exposure.towardsBright.entries()) {
    predicted = step(predicted, brightTarget, 0.5);
    assert.ok(
      Math.abs(measured - predicted) < 1e-4,
      `adapting to a bright scene, step ${index}: ${measured} vs ${predicted}`,
    );
  }
  const darkTarget = KEY / exposure.measuredDark;
  predicted = 1;
  for (const [index, measured] of exposure.towardsDark.entries()) {
    predicted = step(predicted, darkTarget, 0.5);
    assert.ok(
      Math.abs(measured - predicted) < 1e-3,
      `adapting to a dark scene, step ${index}: ${measured} vs ${predicted}`,
    );
  }
  // The two directions really are different, which is what the two speeds are for.
  assert.ok(
    exposure.towardsBright[0] < 1 && exposure.towardsDark[0] > 1,
    "a bright scene closes the exposure down and a dark one opens it up",
  );
  // Each approaches its target and never passes it.
  for (let index = 1; index < exposure.towardsBright.length; index += 1) {
    assert.ok(
      exposure.towardsBright[index] < exposure.towardsBright[index - 1],
      "adapting to light only ever closes down",
    );
    assert.ok(exposure.towardsBright[index] > brightTarget, "and never overshoots its target");
    assert.ok(
      exposure.towardsDark[index] > exposure.towardsDark[index - 1],
      "adapting to dark only ever opens up",
    );
    assert.ok(exposure.towardsDark[index] < darkTarget, "and never overshoots either");
  }
  // A longer step travels further, which is what makes it a rate rather than a step size.
  assert.ok(
    Math.abs(exposure.oneShortStep - step(1, brightTarget, 0.1)) < 1e-4,
    `a tenth of a second: ${exposure.oneShortStep} vs ${step(1, brightTarget, 0.1)}`,
  );
  assert.ok(
    Math.abs(exposure.oneLongStep - step(1, brightTarget, 2)) < 1e-4,
    `two seconds: ${exposure.oneLongStep} vs ${step(1, brightTarget, 2)}`,
  );
  assert.ok(
    exposure.oneLongStep < exposure.oneShortStep,
    "and two seconds travels further towards the target than a tenth of one",
  );
  // The range clamps it however long it runs, and it settles rather than oscillating.
  for (const value of exposure.clamped) {
    assert.ok(value >= 0.9 - 1e-4, `the exposure went below its floor: ${value}`);
    assert.ok(value <= 1.1 + 1e-4, `or above its ceiling: ${value}`);
  }
  assert.ok(
    Math.abs(exposure.clamped[exposure.clamped.length - 1] - 0.9) < 1e-4,
    "and settles on the floor, because the scene wants an exposure below it",
  );

  console.log(
    `CNA_TS_WINDOWED_EXPOSURE=PASS MEASURE=AVERAGE_CHANNEL ADAPT=EXPONENTIAL_TWO_SPEEDS ` +
    `TARGET=${brightTarget}/${darkTarget.toFixed(2)} SRGB_DRAW=EXACT_COPY UPSCALE=FLAT_PRESERVED`,
  );
});

test("a windowed CNA renderer's contact shadow pass says which input it was missing", { skip }, async () => {
  const game = new WindowedProbeGame(6);
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  const contact = evidence.contactShadow;
  assert.equal(typeof contact, "object", `the contact shadow block did not run: ${contact}`);
  if (contact.layerAbsent) {
    assert.equal(contact.extensionLayer, false);
    console.log(`CNA_TS_WINDOWED_CONTACT_SHADOW=SKIPPED_NO_LAYER RESULT=${contact.cnaResult}`);
    return;
  }
  assert.equal(
    evidence.contactShadowCleanup, undefined, `cleanup failed: ${evidence.contactShadowCleanup}`);

  assert.equal(contact.name, "ContactShadow", "the pass names itself for its GPU timing");
  assert.equal(contact.supported, true, "and runs on this renderer");
  assert.equal(
    contact.fallbackBeforeAnyFrame, "",
    "nothing has fallen back before the first frame",
  );

  // CNA's own defaults: a short ray straight down, because a contact shadow is a short-range trick.
  assert.deepEqual(
    contact.defaults.direction, [0, -1, 0], "the default light points straight down");
  assert.ok(
    contact.defaults.maxDistance > 0 && contact.defaults.maxDistance < 1,
    `a contact shadow's reach is under a world unit, not ${contact.defaults.maxDistance}`,
  );
  assert.ok(contact.defaults.stepCount >= 4, "with enough steps to find something");
  assert.ok(
    contact.defaults.thickness > contact.defaults.bias,
    "and a band with something in it: the thickness must exceed the bias or nothing is ever occluded",
  );
  assert.equal(contact.defaults.intensity, 1);

  const close = (actual, expected, what) => assert.ok(
    Math.abs(actual - expected) < 1e-5, `${what}: ${actual} vs ${expected}`);
  contact.written.direction.forEach((value, index) => close(
    value, [0.1, -0.9, 0.2][index], `direction ${index}`));
  close(contact.written.maxDistance, 0.625, "max distance");
  assert.equal(contact.written.stepCount, 20, "the step count is written, not left at its default");
  assert.notEqual(
    contact.written.stepCount, contact.defaults.stepCount,
    "and it really differs from the default, or the setter would be unproven",
  );
  close(contact.written.thickness, 0.375, "thickness");
  close(contact.written.intensity, 0.875, "intensity");
  close(contact.written.bias, 0.03125, "bias");

  // The ladder: three states, each naming what was missing, and the second names a different input
  // from the aerial pass's second state -- this one needs the inverse view, not the whole camera.
  assert.equal(contact.ladder.length, 3);
  assert.equal(contact.ladder[0].copied, true, "with no depth image the pass copies its input");
  assert.match(
    contact.ladder[0].reason, /depth/i,
    `and says the depth image was missing: ${contact.ladder[0].reason}`,
  );
  assert.equal(contact.ladder[1].copied, true, "with depth but no camera it still copies");
  assert.match(
    contact.ladder[1].reason, /view/i,
    `and now names the view matrix it needs to bring the light into view space: ` +
    `${contact.ladder[1].reason}`,
  );
  assert.notEqual(
    contact.ladder[0].reason, contact.ladder[1].reason,
    "the reason must change as inputs are supplied, or it names nothing in particular",
  );
  assert.equal(contact.ladder[2].reason, "", "and with everything supplied it falls back to nothing");

  assert.equal(
    contact.zeroIntensityIsACopy, true,
    "a contact shadow of no intensity is an exact copy, whatever the ray finds",
  );

  console.log(
    `CNA_TS_WINDOWED_CONTACT_SHADOW=PASS LADDER=3_STATES DEFAULTS=` +
    `${contact.defaults.maxDistance}/${contact.defaults.stepCount}/${contact.defaults.thickness} ` +
    `OFF=EXACT_COPY`,
  );
});

test("a windowed CNA renderer resolves an empty weighted-blended pass to no change at all", { skip }, async () => {
  const game = new WindowedProbeGame(6);
  await game.Run();
  const evidence = game.evidence;
  // A borrowed target left live makes cna_game_destroy refuse, and finding 18 records that a
  // process which exits in that state segfaults after its last line has run.
  game.Dispose();

  const oit = evidence.transparency;
  assert.equal(typeof oit, "object", `the transparency block did not run: ${oit}`);
  if (oit.layerAbsent) {
    assert.equal(oit.extensionLayer, false, "a layer that is present must not refuse to make one");
    console.log(`CNA_TS_WINDOWED_OIT=SKIPPED_NO_LAYER RESULT=${oit.cnaResult}`);
    return;
  }
  assert.equal(
    evidence.transparencyCleanup, undefined, `cleanup failed: ${evidence.transparencyCleanup}`);

  if (!oit.supported) {
    // An honest boundary. The three reasons CNA can give are all about the two targets it needs.
    assert.ok(oit.reason.length > 8, "an unsupported resolve says why in CNA's own words");
    console.log(
      `CNA_TS_WINDOWED_OIT=NOT_SUPPORTED_RENDERER RENDERER=${evidence.renderer.name} ` +
      `REASON=${JSON.stringify(oit.reason)}`,
    );
    return;
  }
  assert.equal(oit.reason, "", "a resolve that can run has nothing to explain");

  // Two targets, the same size and format, and that format is a half-float one -- which is the
  // capability the constructor tested for, so this is the requirement met rather than restated.
  assert.deepEqual(
    oit.accumulation.shape, oit.revealage.shape,
    "the accumulation and revealage targets are the same shape",
  );
  assert.deepEqual(
    oit.accumulation.shape.slice(0, 2), [4, 4], "and the size the constructor was given");
  assert.equal(
    oit.accumulation.shape[2], Graphics.SurfaceFormat.HdrBlendable,
    "a half-float target, because the accumulation sums values far outside 0..1",
  );
  assert.equal(oit.accumulation.shape[3], 1, "with no mip chain to accumulate into");
  assert.deepEqual(oit.resized, [8, 5], "a resize reallocates both targets at the new size");
  assert.equal(oit.accumulatingInsideBracket, true, "the bracket really was open");

  // What the two targets hold once the bracket has closed with nothing drawn into it. Both are
  // zero, and that is the premise of the pixel assertions below rather than an arbitrary fact: an
  // empty accumulation is a zero sum, and a zero sum of logs exponentiates to a revealage of one --
  // "nothing covered this pixel", which is what the resolve early-outs on. Read back as
  // HalfVector4, the element type the half-float format declares, so these are the buffer's own
  // bits and not an 8-bit projection of them. (This renderer also hands back a zeroed fresh
  // allocation, so what is pinned here is the state the resolve reads, not the clear that put it
  // there.)
  for (const [name, target] of [["accumulation", oit.accumulation], ["revealage", oit.revealage]]) {
    assert.ok(Array.isArray(target.texels), `the ${name} target did not read back: ${target.texels}`);
    assert.equal(target.texels.length, 16);
    for (const [index, texel] of target.texels.entries()) {
      assert.deepEqual(
        texel, ["HalfVector4", "0"],
        `the ${name} target's texel ${index} is not the zero the resolve expects`,
      );
    }
  }

  // The pixels. The target was cleared to CLEAR, the resolve ran over it with nothing accumulated,
  // and every texel must be exactly CLEAR still -- not near it.
  const cleared = [CLEAR.R, CLEAR.G, CLEAR.B, CLEAR.A];
  assert.equal(oit.beforeResolve.length, 16);
  for (const [index, texel] of oit.beforeResolve.entries()) {
    assert.deepEqual(texel, cleared, `texel ${index} was not cleared to begin with`);
  }
  for (const [index, texel] of oit.afterEmptyResolve.entries()) {
    assert.deepEqual(
      texel, cleared,
      `texel ${index} changed: an empty weighted-blended resolve must discard rather than blend ` +
      `a zero contribution, which would have written transparent black over the whole frame`,
    );
  }
  assert.deepEqual(
    oit.afterTwoResolves, oit.afterEmptyResolve,
    "and resolving twice changes nothing either time",
  );
  // The failure the discard avoids is a genuinely different picture, so the assertion above is not
  // vacuous: transparent black is not CLEAR on any channel but the ones CLEAR happens to share.
  assert.notDeepEqual(cleared, [0, 0, 0, 0], "CLEAR must differ from what a missing discard writes");

  // Two planted defects survive this file and are recorded rather than hidden, because both have
  // the same cause and neither can be closed from TypeScript today:
  //
  //   * the revealage getter wired to the accumulation route. Each borrow mints a fresh handle
  //     (measured), so handle identity cannot tell the two apart, and with an empty accumulation
  //     both targets hold the same zeros.
  //   * Resolve(1, 1) instead of Resolve(4, 4). Every texel discards, so the viewport it was given
  //     changes nothing.
  //
  // Both become observable the moment something can write distinguishable values into the two
  // targets -- which needs a shader calling cnaOitEmit, and CNA's ShaderEffect is not bound by this
  // package yet. Recorded in NEXT.md as the reason to bind it.
  console.log(
    `CNA_TS_WINDOWED_OIT=PASS RENDERER=${evidence.renderer.name} TARGETS=HDR_BLENDABLE_4x4 ` +
    `RESIZE=8x5 EMPTY_RESOLVE=DISCARDS_EXACTLY SURVIVING_MUTANTS=2_PENDING_SHADER_EFFECT`,
  );
});
