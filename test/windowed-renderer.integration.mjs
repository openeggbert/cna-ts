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
