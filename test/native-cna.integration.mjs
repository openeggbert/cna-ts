import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  Audio,
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  Color,
  Content,
  Game,
  Graphics,
  GraphicsDeviceManager,
  GetRuntimeStatus,
  Input,
  LoadNodeNativeBackend,
  Media,
  PlayerIndex,
  Rectangle,
  GamerServices,
  Storage,
  TimeSpan,
  TitleContainer,
  Matrix,
  NativeUnavailableError,
  Point,
  Quaternion,
  Vector2,
  Vector3,
  Vector4,
} from "../dist/index.js";
import { CNA_ABI_MAJOR, CNA_ABI_MINOR } from "../dist/internal/abi.js";
import * as renderPipelineModule from "../dist/extensions/graphics/index.js";
import * as computeExtensions from "../dist/extensions/graphics/index.js";
import * as extensionsModule from "../dist/extensions/index.js";
import * as devicesModule from "../dist/extensions/devices/index.js";
import * as inputModule from "../dist/extensions/input/index.js";
import * as sensorsModule from "../dist/extensions/sensors/index.js";
import * as guideExtensions from "../dist/extensions/gamer-services/index.js";
import { getBackend } from "../dist/internal/backend.js";
import { CnaResult } from "../dist/internal/cna-results.js";
import { resolveGraphicsDeviceHandleForInternalUse } from
  "../dist/Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import {
  getVertexBufferRawForInternalUse,
  setVertexBufferRawForInternalUse,
} from "../dist/Microsoft/Xna/Framework/Graphics/VertexBuffer.js";
import {
  getIndexBufferRawForInternalUse,
  setIndexBufferRawForInternalUse,
} from "../dist/Microsoft/Xna/Framework/Graphics/IndexBuffer.js";
import {
  compressedXnb, modelVertexBytes, modelXnb, spriteFontXnb, textureXnb,
} from "./fixtures/xnb.mjs";

const library = process.env.CNA_NATIVE_LIBRARY;
if (!library) {
  throw new Error(
    `CNA_NATIVE_LIBRARY must name an existing CNA C ABI ${CNA_ABI_MAJOR}.${CNA_ABI_MINOR}.x shared library`,
  );
}
const nativeStorageHome = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-native-storage-"));
process.env.XDG_DATA_HOME = nativeStorageHome;
after(() => fs.rmSync(nativeStorageHome, { recursive: true, force: true }));
const bridge = path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node");
// Counted from the adapter source rather than restated here, so the runtime-reported import count
// is cross-checked against the declarations that produced it instead of against a copied number.
const EXPECTED_IMPORTED_SYMBOLS = (
  fs.readFileSync(new URL("../native/cna_node_bridge.c", import.meta.url), "utf8")
    .match(/LOAD_REQUIRED\([^\n]*?"cna_[A-Za-z0-9_]+"\)/g) ?? []
).length;
const status = await LoadNodeNativeBackend({
  CnaLibrary: path.resolve(library),
  BridgeModule: bridge,
});

class NativeProbeGame extends Game {
  constructor(frameTarget, leaveTextureLive = false) {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.frameTarget = frameTarget;
    this.leaveTextureLive = leaveTextureLive;
    this.updates = 0;
    this.draws = 0;
    this.texture = null;
    this.spriteBatch = null;
    this.inputPolls = 0;
    this.graphicsRouteEvidence = Object.create(null);
  }

  qualifyHeadlessRoute(name, action, allowedResults = [6]) {
    try {
      const value = action();
      this.graphicsRouteEvidence[name] = "SUCCESS";
      return value;
    } catch (error) {
      assert.ok(
        allowedResults.includes(error?.cnaResult),
        `${name} returned unexpected CNA result ${error?.cnaResult}`,
      );
      this.graphicsRouteEvidence[name] = error.cnaResult === 6
        ? "HEADLESS_NOT_SUPPORTED"
        : "HEADLESS_PIPELINE_UNAVAILABLE";
      return null;
    }
  }

  LoadContent() {
    assert.equal(this.Window, this.Window, "Game.Window must preserve facade identity");
    assert.equal(this.Window.Handle, 0n, "HEADLESS has no XNA round-trip window token");
    assert.equal(typeof this.Window.AllowUserResizing, "boolean");
    assert.equal(typeof this.Window.ClientBounds.Width, "number");
    assert.equal(typeof this.Window.CurrentOrientation, "number");
    assert.equal(typeof this.Window.ScreenDeviceName, "string");
    this.Window.Title = "cna-ts native probe";
    assert.equal(this.Window.Title, "cna-ts native probe");
    const titlePackage = JSON.parse(new TextDecoder().decode(TitleContainer.OpenStream("package.json")));
    assert.equal(titlePackage.name, "cna-ts");
    this.texture = new Graphics.Texture2D(
      this.GraphicsDevice,
      4,
      4,
      false,
      Graphics.SurfaceFormat.Color,
    );
    const pixels = Array.from({ length: 16 }, (_value, index) =>
      new Color(index, 255 - index, index * 3, 255));
    this.texture.SetData(pixels);
    const roundTrip = new Array(16);
    this.texture.GetData(roundTrip);
    assert.deepEqual(
      roundTrip.map((value) => value.PackedValue),
      pixels.map((value) => value.PackedValue),
    );

    const region = [Color.Red, Color.Green, Color.Blue, Color.White];
    const regionSource = [Color.Black, Color.Black, ...region, Color.Black, Color.Black];
    this.texture.SetData(0, new Rectangle(1, 1, 2, 2), regionSource, 2, region.length);
    const regionRoundTrip = new Array(8);
    this.texture.GetData(0, new Rectangle(1, 1, 2, 2), regionRoundTrip, 2, 4);
    assert.deepEqual(
      regionRoundTrip.slice(2, 6).map((value) => value.PackedValue),
      region.map((value) => value.PackedValue),
    );

    this.mipTexture = new Graphics.Texture2D(
      this.GraphicsDevice, 4, 4, true, Graphics.SurfaceFormat.Color,
    );
    const mipPixels = [Color.Red, Color.Green, Color.Blue, Color.White];
    this.mipTexture.SetData(1, null, mipPixels, 0, 4);
    const mipRoundTrip = new Array(4);
    this.mipTexture.GetData(1, null, mipRoundTrip, 0, 4);
    assert.deepEqual(
      mipRoundTrip.map((value) => value.PackedValue),
      mipPixels.map((value) => value.PackedValue),
    );

    const encoded = Uint8Array.from(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ));
    this.decodedTexture = Graphics.Texture2D.FromStream(this.GraphicsDevice, encoded);
    assert.deepEqual([this.decodedTexture.Width, this.decodedTexture.Height], [1, 1]);
    const png = new Uint8Array(1024);
    this.decodedTexture.SaveAsPng(png, 1, 1);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    this.spriteBatch = new Graphics.SpriteBatch(this.GraphicsDevice);
    const fontBytes = compressedXnb(spriteFontXnb());
    const modelBytes = compressedXnb(modelXnb());
    const externalTextureBytes = compressedXnb(textureXnb());
    class FontContentManager extends Content.ContentManager {
      OpenStream(assetName) {
        if (assetName === "SyntheticFont") return fontBytes;
        if (assetName === "Models\\SyntheticModel") return modelBytes;
        if (assetName === "Textures\\Atlas") return externalTextureBytes;
        throw new Error(`Unknown synthetic asset ${assetName}`);
      }
    }
    this.fontContent = new FontContentManager({
      GetService: (type) => type === Graphics.GraphicsDevice ? this.GraphicsDevice : null,
    });
    this.font = this.fontContent.Load(Graphics.SpriteFont, "SyntheticFont");
    assert.equal(this.fontContent.Load(Graphics.SpriteFont, ".\\SyntheticFont"), this.font);
    assert.deepEqual(
      [this.font.MeasureString("A?").X, this.font.MeasureString("A?").Y],
      [9, 8],
    );
    this.model = this.fontContent.Load(Graphics.Model, "Models/SyntheticModel");
    assert.equal(this.fontContent.Load(Graphics.Model, "Models\\SyntheticModel"), this.model);
    assert.equal(this.model.Root, this.model.Bones.Get("Root"));
    assert.equal(this.model.Meshes.Get("Triangle").ParentBone, this.model.Root);
    const loadedPart = this.model.Meshes.Get(0).MeshParts.Get(0);
    assert.equal(loadedPart.VertexBuffer.VertexCount, 3);
    assert.equal(loadedPart.IndexBuffer.IndexCount, 3);
    assert.equal(loadedPart.Effect, this.model.Meshes.Get(0).Effects.Get(0));
    assert.deepEqual(
      [...getVertexBufferRawForInternalUse(loadedPart.VertexBuffer)],
      modelVertexBytes(),
    );
    assert.deepEqual(
      [...getIndexBufferRawForInternalUse(loadedPart.IndexBuffer)],
      [0, 0, 1, 0, 2, 0],
    );
    assert.deepEqual(loadedPart.Effect.DiffuseColor, Vector3.One);
    this.externalTexture = this.fontContent.Load(Graphics.Texture2D, "Textures/Atlas");
    assert.equal(loadedPart.Effect.Texture, this.externalTexture);
    this.loadedModelVertexBuffer = loadedPart.VertexBuffer;
    this.loadedModelIndexBuffer = loadedPart.IndexBuffer;
    this.loadedModelEffect = loadedPart.Effect;
    this.stockEffects = [
      new Graphics.BasicEffect(this.GraphicsDevice),
      new Graphics.AlphaTestEffect(this.GraphicsDevice),
      new Graphics.DualTextureEffect(this.GraphicsDevice),
      new Graphics.EnvironmentMapEffect(this.GraphicsDevice),
      new Graphics.SkinnedEffect(this.GraphicsDevice),
    ];
    for (const effect of this.stockEffects) {
      assert.ok(effect.Techniques.Count > 0);
      assert.ok(effect.CurrentTechnique.Passes.Count > 0);
      effect.CurrentTechnique.Passes.Get(0).Apply();
      effect.OnApply();
    }
    this.graphicsRouteEvidence["stock effect construction"] = "SUCCESS";
    this.graphicsRouteEvidence["stock effect execution"] = "SUCCESS";
    const clonedStock = this.stockEffects[0].Clone();
    clonedStock.CurrentTechnique.Passes.Get(0).Apply();
    clonedStock.Dispose();
    const disposedEffect = new Graphics.BasicEffect(this.GraphicsDevice);
    const disposedPass = disposedEffect.CurrentTechnique.Passes.Get(0);
    disposedEffect.Dispose();
    assert.throws(() => disposedPass.Apply(), { name: "ObjectDisposedException" });
    const retainedTexture = new Graphics.Texture2D(this.GraphicsDevice, 1, 1);
    const retainingEffect = new Graphics.BasicEffect(this.GraphicsDevice);
    retainingEffect.Texture = retainedTexture;
    retainingEffect.TextureEnabled = true;
    retainingEffect.CurrentTechnique.Passes.Get(0).Apply();
    retainedTexture.Dispose();
    assert.equal(retainedTexture.IsDisposed, true);
    retainingEffect.Dispose();

    const cnaSource = path.resolve(process.env.CNA_SOURCE_PATH ?? "../../cna");
    const compiledBytes = fs.readFileSync(path.join(
      cnaSource, "modules/renderers/fna3d/effects/CnaConformanceEffect.fxb",
    ));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.throws(
        () => new Graphics.Effect(this.GraphicsDevice, [...compiledBytes]),
        (error) => error.operation === "cna_effect_create_compiled" && error.cnaResult === 6,
      );
    }
    this.graphicsRouteEvidence["compiled Effect route"] = "HEADLESS_NOT_SUPPORTED";
    const declaration = new Graphics.VertexDeclaration(12, [
      new Graphics.VertexElement(
        0,
        Graphics.VertexElementFormat.Vector3,
        Graphics.VertexElementUsage.Position,
        0,
      ),
    ]);
    this.vertexBuffer = new Graphics.VertexBuffer(
      this.GraphicsDevice, declaration, 3, Graphics.BufferUsage.None,
    );
    const vertexBytes = Uint8Array.from({ length: 36 }, (_value, index) => index);
    setVertexBufferRawForInternalUse(this.vertexBuffer, vertexBytes);
    assert.deepEqual(getVertexBufferRawForInternalUse(this.vertexBuffer), vertexBytes);
    this.indexBuffer = new Graphics.IndexBuffer(
      this.GraphicsDevice,
      Graphics.IndexElementSize.SixteenBits,
      3,
      Graphics.BufferUsage.None,
    );
    const indexBytes = Uint8Array.from([0, 0, 1, 0, 2, 0]);
    setIndexBufferRawForInternalUse(this.indexBuffer, indexBytes);
    assert.deepEqual(getIndexBufferRawForInternalUse(this.indexBuffer), indexBytes);

    assert.equal(this.GraphicsDevice.GraphicsDeviceStatus, Graphics.GraphicsDeviceStatus.Normal);
    this.blendState = new Graphics.BlendState();
    this.depthState = new Graphics.DepthStencilState();
    this.rasterizerState = new Graphics.RasterizerState();
    this.samplerState = new Graphics.SamplerState();
    this.GraphicsDevice.BlendState = this.blendState;
    this.GraphicsDevice.DepthStencilState = this.depthState;
    this.GraphicsDevice.RasterizerState = this.rasterizerState;
    this.GraphicsDevice.SamplerStates.Set(0, this.samplerState);
    assert.equal(this.GraphicsDevice.BlendState, this.blendState);
    assert.equal(this.GraphicsDevice.DepthStencilState, this.depthState);
    assert.equal(this.GraphicsDevice.RasterizerState, this.rasterizerState);
    assert.equal(this.GraphicsDevice.SamplerStates.Get(0), this.samplerState);
    this.GraphicsDevice.Textures.Set(0, this.texture);
    assert.equal(this.GraphicsDevice.Textures.Get(0), this.texture);
    this.GraphicsDevice.Textures.Set(0, null);
    assert.equal(this.GraphicsDevice.Textures.Get(0), null);

    const vertices = [
      new Graphics.VertexPositionColor(new Vector3(0, 0, 0), Color.Red),
      new Graphics.VertexPositionColor(new Vector3(1, 0, 0), Color.Green),
      new Graphics.VertexPositionColor(new Vector3(0, 1, 0), Color.Blue),
    ];
    this.userVertices = vertices;
    this.dynamicVertexBuffer = this.qualifyHeadlessRoute("dynamic vertex buffer", () => {
      const buffer = new Graphics.DynamicVertexBuffer(
        this.GraphicsDevice, Graphics.VertexPositionColor, 3, Graphics.BufferUsage.None,
      );
      try {
        buffer.SetData(vertices, 0, 3, Graphics.SetDataOptions.Discard);
        const roundTrip = new Array(3);
        buffer.GetData(roundTrip, 0, 3);
        assert.deepEqual(
          roundTrip.map((value) => value.ToString()),
          vertices.map((value) => value.ToString()),
        );
        assert.equal(buffer.IsContentLost, false);
        return buffer;
      } catch (error) {
        buffer.Dispose();
        throw error;
      }
    });
    this.dynamicIndexBuffer = this.qualifyHeadlessRoute("dynamic index buffer", () => {
      const buffer = new Graphics.DynamicIndexBuffer(
        this.GraphicsDevice, Graphics.IndexElementSize.SixteenBits, 3,
        Graphics.BufferUsage.None,
      );
      try {
        buffer.SetData([0, 1, 2], 0, 3, Graphics.SetDataOptions.NoOverwrite);
        const roundTrip = new Array(3);
        buffer.GetData(roundTrip);
        assert.deepEqual(roundTrip, [0, 1, 2]);
        assert.equal(buffer.IsContentLost, false);
        return buffer;
      } catch (error) {
        buffer.Dispose();
        throw error;
      }
    });

    this.renderTarget = this.qualifyHeadlessRoute("RenderTarget2D creation", () => {
      const target = new Graphics.RenderTarget2D(this.GraphicsDevice, 4, 4);
      assert.deepEqual([target.Width, target.Height], [4, 4]);
      assert.equal(target.Format, Graphics.SurfaceFormat.Color);
      assert.equal(target.IsContentLost, false);
      return target;
    });
    this.renderTargetCube = this.qualifyHeadlessRoute("RenderTargetCube creation", () => {
      const target = new Graphics.RenderTargetCube(
        this.GraphicsDevice, 4, false, Graphics.SurfaceFormat.Color, Graphics.DepthFormat.None,
      );
      assert.equal(target.Size, 4);
      assert.equal(target.Format, Graphics.SurfaceFormat.Color);
      assert.equal(target.IsContentLost, false);
      return target;
    });

    this.qualifyHeadlessRoute("Texture3D lifecycle", () => {
      const texture = new Graphics.Texture3D(
        this.GraphicsDevice, 2, 2, 2, false, Graphics.SurfaceFormat.Color,
      );
      try {
        const values = Array.from({ length: 8 }, (_value, index) =>
          new Color(index, index + 1, index + 2, 255));
        texture.SetData(values);
        const output = new Array(8);
        texture.GetData(output);
        assert.deepEqual(
          output.map((value) => value.PackedValue),
          values.map((value) => value.PackedValue),
        );
      } finally {
        texture.Dispose();
        texture.Dispose();
      }
    });
    this.qualifyHeadlessRoute("TextureCube lifecycle", () => {
      const texture = new Graphics.TextureCube(
        this.GraphicsDevice, 2, false, Graphics.SurfaceFormat.Color,
      );
      try {
        const values = [Color.Red, Color.Green, Color.Blue, Color.White];
        texture.SetData(Graphics.CubeMapFace.PositiveX, values);
        const output = new Array(4);
        texture.GetData(Graphics.CubeMapFace.PositiveX, output);
        assert.deepEqual(
          output.map((value) => value.PackedValue),
          values.map((value) => value.PackedValue),
        );
      } finally {
        texture.Dispose();
        texture.Dispose();
      }
    });
    this.occlusionQuery = this.qualifyHeadlessRoute("OcclusionQuery lifecycle", () => {
      const query = new Graphics.OcclusionQuery(this.GraphicsDevice);
      try {
        assert.equal(query.IsComplete, false);
        query.Begin();
        query.End();
        if (query.IsComplete) assert.ok(Number.isInteger(query.PixelCount));
        query.Begin();
        query.End();
        return query;
      } catch (error) {
        query.Dispose();
        query.Dispose();
        throw error;
      }
    });
  }

  Update(gameTime) {
    super.Update(gameTime);
    if (this.inputPolls === 0) {
      assert.deepEqual(Input.Keyboard.GetState().GetPressedKeys(), []);
      assert.equal(typeof Input.Mouse.GetState().X, "number");
      assert.equal(Input.GamePad.GetState(PlayerIndex.One).IsConnected, false);
      assert.equal(Input.GamePad.GetCapabilities(PlayerIndex.One).IsConnected, false);
      assert.equal(Input.GamePad.SetVibration(PlayerIndex.One, 0, 0), false);
      assert.equal(Input.Touch.TouchPanel.GetState().IsConnected, false);
      assert.equal(Input.Touch.TouchPanel.GetCapabilities().IsConnected, false);
      assert.equal(Input.Touch.TouchPanel.IsGestureAvailable, false);
      assert.equal(Input.Mouse.WindowHandle, 0n);
      assert.equal(Input.Touch.TouchPanel.WindowHandle, 0n);
      Input.Mouse.SetPosition(0, 0);
      this.inputPolls += 1;
    }
    this.updates += 1;
  }

  Draw(gameTime) {
    this.GraphicsDevice.Clear(Color.CornflowerBlue);
    assert.equal(this.texture.GraphicsDevice, this.GraphicsDevice);
    if (this.draws === 0) {
      this.qualifyHeadlessRoute("Model.Draw", () =>
        this.model.Draw(Matrix.Identity, Matrix.Identity, Matrix.Identity), [6, 12]);
      if (this.dynamicVertexBuffer && this.dynamicIndexBuffer) {
        this.qualifyHeadlessRoute("vertex buffer binding", () => {
          this.GraphicsDevice.SetVertexBuffer(this.dynamicVertexBuffer);
          assert.equal(this.GraphicsDevice.GetVertexBuffers()[0].VertexBuffer, this.dynamicVertexBuffer);
        });
        this.qualifyHeadlessRoute("index buffer binding", () => {
          this.GraphicsDevice.Indices = this.dynamicIndexBuffer;
          assert.equal(this.GraphicsDevice.Indices, this.dynamicIndexBuffer);
        });
        if (this.GraphicsDevice.GetVertexBuffers().length > 0 && this.GraphicsDevice.Indices) {
          this.qualifyHeadlessRoute("DrawPrimitives", () =>
            this.GraphicsDevice.DrawPrimitives(Graphics.PrimitiveType.TriangleList, 0, 1), [6, 12]);
          this.qualifyHeadlessRoute("DrawIndexedPrimitives", () =>
            this.GraphicsDevice.DrawIndexedPrimitives(
              Graphics.PrimitiveType.TriangleList, 0, 0, 3, 0, 1,
            ), [6, 12]);
          this.qualifyHeadlessRoute("DrawInstancedPrimitives", () =>
            this.GraphicsDevice.DrawInstancedPrimitives(
              Graphics.PrimitiveType.TriangleList, 0, 0, 3, 0, 1, 2,
            ), [6, 12]);
        }
      }
      this.qualifyHeadlessRoute("DrawUserPrimitives", () =>
        this.GraphicsDevice.DrawUserPrimitives(
          Graphics.PrimitiveType.TriangleList, this.userVertices, 0, 1,
        ), [6, 12]);
      this.qualifyHeadlessRoute("DrawUserIndexedPrimitives", () =>
        this.GraphicsDevice.DrawUserIndexedPrimitives(
          Graphics.PrimitiveType.TriangleList, this.userVertices, 0, 3, [0, 1, 2], 0, 1,
        ), [6, 12]);
      if (this.renderTarget) {
        this.qualifyHeadlessRoute("render target binding", () => {
          this.GraphicsDevice.SetRenderTarget(this.renderTarget);
          assert.equal(this.GraphicsDevice.GetRenderTargets()[0].RenderTarget, this.renderTarget);
          this.GraphicsDevice.SetRenderTarget(null);
          assert.equal(this.GraphicsDevice.GetRenderTargets().length, 0);
        });
      }
      if (this.renderTargetCube) {
        this.qualifyHeadlessRoute("cube render target binding", () => {
          this.GraphicsDevice.SetRenderTarget(
            this.renderTargetCube, Graphics.CubeMapFace.NegativeZ,
          );
          const binding = this.GraphicsDevice.GetRenderTargets()[0];
          assert.equal(binding.RenderTarget, this.renderTargetCube);
          assert.equal(binding.CubeMapFace, Graphics.CubeMapFace.NegativeZ);
          this.GraphicsDevice.SetRenderTarget(null);
          assert.equal(this.GraphicsDevice.GetRenderTargets().length, 0);
        });
      }
    }
    if (this.draws === 0) {
      this.spriteBatch.Begin(
        Graphics.SpriteSortMode.Deferred,
        this.blendState,
        this.samplerState,
        this.depthState,
        this.rasterizerState,
        this.loadedModelEffect,
      );
      assert.throws(
        () => this.loadedModelEffect.Dispose(),
        { name: "InvalidOperationException", message: /active SpriteBatch interval/ },
      );
      this.graphicsRouteEvidence["effect SpriteBatch.Begin"] = "SUCCESS";
    } else {
      this.spriteBatch.Begin();
    }
    this.spriteBatch.Draw(this.texture, new Vector2(this.draws % 32, 12), Color.White);
    this.spriteBatch.Draw(
      this.decodedTexture,
      new Rectangle(48, 12, 8, 8),
      Color.White,
    );
    this.spriteBatch.DrawString(this.font, "A?", new Vector2(64, 12), Color.White);
    this.spriteBatch.End();
    this.draws += 1;
    if (this.draws >= this.frameTarget) this.Exit();
    super.Draw(gameTime);
  }

  UnloadContent() {
    this.spriteBatch?.Dispose();
    this.spriteBatch?.Dispose();
    this.spriteBatch = null;
    for (const effect of this.stockEffects ?? []) effect.Dispose();
    this.stockEffects = null;
    this.fontContent?.Dispose();
    assert.equal(this.externalTexture?.IsDisposed, true);
    this.fontContent = null;
    this.externalTexture = null;
    this.font = null;
    this.model = null;
    assert.equal(this.loadedModelVertexBuffer?.IsDisposed, true);
    assert.equal(this.loadedModelIndexBuffer?.IsDisposed, true);
    assert.equal(this.loadedModelEffect?.IsDisposed, true);
    this.vertexBuffer?.Dispose();
    this.vertexBuffer?.Dispose();
    this.vertexBuffer = null;
    this.indexBuffer?.Dispose();
    this.indexBuffer?.Dispose();
    this.indexBuffer = null;
    if (!this.leaveTextureLive) {
      this.dynamicVertexBuffer?.Dispose();
      this.dynamicVertexBuffer?.Dispose();
      this.dynamicVertexBuffer = null;
      this.dynamicIndexBuffer?.Dispose();
      this.dynamicIndexBuffer?.Dispose();
      this.dynamicIndexBuffer = null;
      this.renderTarget?.Dispose();
      this.renderTarget?.Dispose();
      this.renderTarget = null;
      this.renderTargetCube?.Dispose();
      this.renderTargetCube?.Dispose();
      this.renderTargetCube = null;
      this.occlusionQuery?.Dispose();
      this.occlusionQuery?.Dispose();
      this.occlusionQuery = null;
    }
    this.mipTexture?.Dispose();
    this.mipTexture = null;
    if (!this.leaveTextureLive) {
      this.decodedTexture?.Dispose();
      this.decodedTexture = null;
      this.texture?.Dispose();
      this.texture?.Dispose();
      this.texture = null;
    }
    super.UnloadContent();
  }
}

test("loads an exact real CNA ABI and only the audited symbols", () => {
  assert.equal(status.Backend, "node-native");
  assert.equal(status.IsAvailable, true);
  // The loaded artifact must fall inside the generation this package targets. The patch component
  // is free, so the assertion names the window rather than one exact build.
  const [major, minor] = String(status.AbiVersion).split(".").map(Number);
  assert.equal(major, CNA_ABI_MAJOR);
  assert.equal(minor, CNA_ABI_MINOR);
  assert.equal(status.ImportedSymbolCount, EXPECTED_IMPORTED_SYMBOLS);
});

class ContentLostProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    // ABI 0.9 made ContentLost a real event on renderers whose API can lose a device. The
    // subscription and its deterministic release are what a HEADLESS renderer can prove; the event
    // firing is not, because HEADLESS has no device to lose.
    let raised = 0;
    const target = new Graphics.RenderTarget2D(this.GraphicsDevice, 16, 16);
    const onLost = () => { raised += 1; };
    target.ContentLost.Add(onLost);
    this.evidence.renderTargetSubscribed = true;
    this.evidence.renderTargetIsContentLost = target.IsContentLost;
    target.Dispose();
    this.evidence.renderTargetDisposedAfterSubscription = target.IsDisposed;

    const vertex = new Graphics.DynamicVertexBuffer(
      this.GraphicsDevice, Graphics.VertexPositionColor.VertexDeclaration, 4,
      Graphics.BufferUsage.WriteOnly,
    );
    vertex.ContentLost.Add(onLost);
    this.evidence.vertexSubscribed = true;
    this.evidence.vertexIsContentLost = vertex.IsContentLost;
    vertex.Dispose();
    // Disposing twice must stay harmless with a live registration behind the resource.
    vertex.Dispose();
    this.evidence.vertexDisposedTwice = vertex.IsDisposed;

    const index = new Graphics.DynamicIndexBuffer(
      this.GraphicsDevice, Graphics.IndexElementSize.SixteenBits, 6, Graphics.BufferUsage.WriteOnly,
    );
    index.ContentLost.Add(onLost);
    this.evidence.indexSubscribed = true;
    index.Dispose();

    this.evidence.raised = raised;
    this.Exit();
    super.LoadContent();
  }
}

test("ContentLost subscriptions reach CNA and release with their resource", async () => {
  const game = new ContentLostProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();
  assert.equal(evidence.renderTargetSubscribed, true);
  assert.equal(evidence.vertexSubscribed, true);
  assert.equal(evidence.indexSubscribed, true);
  assert.equal(evidence.renderTargetIsContentLost, false);
  assert.equal(evidence.vertexIsContentLost, false);
  assert.equal(evidence.renderTargetDisposedAfterSubscription, true);
  assert.equal(evidence.vertexDisposedTwice, true);
  // HEADLESS cannot lose a device, so the producer never runs here. This asserts the honest
  // number rather than pretending a renderer raised an event it has no way to raise.
  assert.equal(evidence.raised, 0);
});

class RenderPipelineProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    // The extended graphics layer is an opt-in CNA build option. Where it is compiled in the
    // pipeline is a real native object; where it is not, construction refuses with
    // CNA_RESULT_NOT_SUPPORTED. Both are recorded rather than one being assumed.
    this.evidence.layerAvailable = renderPipelineModule.IsGraphicsExtensionLayerAvailable();
    try {
      const pipeline = new renderPipelineModule.RenderPipeline(this.GraphicsDevice);
      this.evidence.created = true;
      pipeline.Resize(320, 240);
      pipeline.Begin(Color.CornflowerBlue);
      pipeline.End();
      const statistics = pipeline.GetStatistics();
      this.evidence.statisticsShape =
        typeof statistics.PassesRun === "number" &&
        typeof statistics.UsedSceneTarget === "boolean" &&
        typeof statistics.GpuMemoryEstimateBytes === "bigint";
      pipeline.Dispose();
      pipeline.Dispose();
      this.evidence.disposedTwice = pipeline.IsDisposed;
    } catch (error) {
      this.evidence.created = false;
      this.evidence.cnaResult = error.cnaResult;
    }
    this.Exit();
    super.LoadContent();
  }
}

test("the CNA render pipeline is a real owned object where the layer is compiled in", async () => {
  const game = new RenderPipelineProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();
  assert.equal(typeof evidence.layerAvailable, "boolean");
  if (evidence.layerAvailable) {
    assert.equal(evidence.created, true);
    assert.equal(evidence.statisticsShape, true);
    assert.equal(evidence.disposedTwice, true);
  } else {
    // NOT_SUPPORTED is a real answer, not a failure to record.
    assert.equal(evidence.created, false);
    assert.equal(evidence.cnaResult, 6);
  }
});

class PostProcessProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const graphics = renderPipelineModule;
    this.evidence.layerAvailable = graphics.IsGraphicsExtensionLayerAvailable();
    if (!this.evidence.layerAvailable) {
      try {
        new graphics.BloomPass(this.GraphicsDevice);
        this.evidence.refusedWithoutLayer = null;
      } catch (error) {
        this.evidence.refusedWithoutLayer = error.cnaResult;
      }
      this.Exit();
      super.LoadContent();
      return;
    }

    // Quality tiers come from CNA rather than from numbers written in the binding, so a game asking
    // for "High" gets whatever the engine considers high today.
    this.evidence.quality = {
      bloomLow: graphics.BloomPass.IterationsForQuality(graphics.RenderQuality.Low),
      bloomUltra: graphics.BloomPass.IterationsForQuality(graphics.RenderQuality.Ultra),
      ssaoLow: graphics.SsaoPass.SampleCountForQuality(graphics.RenderQuality.Low),
      ssaoUltra: graphics.SsaoPass.SampleCountForQuality(graphics.RenderQuality.Ultra),
      fxaaLow: graphics.FxaaPass.EdgeThresholdForQuality(graphics.RenderQuality.Low),
      fxaaUltra: graphics.FxaaPass.EdgeThresholdForQuality(graphics.RenderQuality.Ultra),
    };

    const bloom = new graphics.BloomPass(this.GraphicsDevice);
    const tonemap = new graphics.TonemapPass(this.GraphicsDevice);
    const fxaa = new graphics.FxaaPass(this.GraphicsDevice);
    const ssao = new graphics.SsaoPass(this.GraphicsDevice);
    const ssr = new graphics.SsrPass(this.GraphicsDevice);

    const blit = new graphics.BlitPass(this.GraphicsDevice);
    this.evidence.names = {
      blit: blit.Name,
      bloom: bloom.Name,
      tonemap: tonemap.Name,
      fxaa: fxaa.Name,
      ssao: ssao.Name,
      ssr: ssr.Name,
    };

    // Every value round-trips through CNA, at float precision. A setter that reached the wrong
    // property would show up as a value that did not come back.
    bloom.Threshold = 0.75;
    bloom.Intensity = 1.25;
    bloom.Iterations = 3;
    tonemap.Mode = graphics.TonemappingMode.Filmic;
    tonemap.Exposure = 1.5;
    tonemap.Gamma = 2.2;
    tonemap.DebandEnabled = true;
    tonemap.DebandStrength = 0.25;
    fxaa.EdgeThreshold = 0.125;
    ssao.Radius = 0.5;
    ssao.Intensity = 1.75;
    ssao.SampleCount = 12;
    ssao.HalfResolution = true;
    ssr.Intensity = 0.5;
    ssr.MaxDistance = 40;
    ssr.StepCount = 24;
    ssr.Thickness = 0.25;
    ssr.DepthBias = 0.03125;
    ssr.EdgeFade = 0.1875;
    // Deliberately out of range: CNA clamps roughness blur, and the clamp is a value worth
    // recording rather than a number to avoid.
    ssr.RoughnessBlur = 0.625;
    this.evidence.values = {
      bloomThreshold: bloom.Threshold,
      bloomIntensity: bloom.Intensity,
      bloomIterations: bloom.Iterations,
      tonemapMode: tonemap.Mode,
      tonemapExposure: tonemap.Exposure,
      tonemapGamma: tonemap.Gamma,
      tonemapDeband: tonemap.DebandEnabled,
      tonemapDebandStrength: tonemap.DebandStrength,
      fxaaEdgeThreshold: fxaa.EdgeThreshold,
      ssaoRadius: ssao.Radius,
      ssaoIntensity: ssao.Intensity,
      ssaoSampleCount: ssao.SampleCount,
      ssaoHalfResolution: ssao.HalfResolution,
      ssrIntensity: ssr.Intensity,
      ssrMaxDistance: ssr.MaxDistance,
      ssrStepCount: ssr.StepCount,
      ssrThickness: ssr.Thickness,
      ssrDepthBias: ssr.DepthBias,
      ssrEdgeFade: ssr.EdgeFade,
      ssrRoughnessBlur: ssr.RoughnessBlur,
    };

    // A pass that cannot do its real work on this renderer says so. That is a documented
    // degradation to a copy, not a failure, and the honest answer is recorded either way.
    this.evidence.supported = {
      bloom: bloom.IsSupportedOn(this.GraphicsDevice),
      tonemap: tonemap.IsSupportedOn(this.GraphicsDevice),
      ssao: ssao.IsSupportedOn(this.GraphicsDevice),
    };

    const chain = new graphics.PostProcessChain(this.GraphicsDevice);
    this.evidence.emptyCount = chain.PassCount;
    chain.Add(bloom);
    chain.Add(tonemap);
    this.evidence.borrowedCount = chain.PassCount;

    chain.GpuTimingEnabled = true;
    this.evidence.gpuTimingRequested = true;
    this.evidence.gpuTimingActual = chain.GpuTimingEnabled;

    const source = new Graphics.RenderTarget2D(this.GraphicsDevice, 32, 32);
    const destination = new Graphics.RenderTarget2D(this.GraphicsDevice, 32, 32);
    try {
      chain.Apply({ Source: source, Destination: destination, Width: 32, Height: 32 });
      this.evidence.applied = "SUCCESS";
    } catch (error) {
      this.evidence.applied = `result ${error.cnaResult}`;
    }
    this.evidence.timings = chain.GetPassTimings().map((timing) => ({
      name: timing.Name,
      sampleCount: timing.SampleCount,
      milliseconds: timing.Milliseconds,
    }));

    // A frame with no source has nothing to read; CNA refuses before allocating an intermediate.
    try {
      chain.Apply({ Source: source, Destination: destination, Width: 0, Height: 32 });
      this.evidence.refusedEmptyFrame = "allowed";
    } catch (error) {
      this.evidence.refusedEmptyFrame = error.constructor.name;
    }

    chain.Clear();
    this.evidence.clearedCount = chain.PassCount;
    chain.Dispose();
    chain.Dispose();
    this.evidence.chainDisposedTwice = chain.IsDisposed;

    // The borrowed passes survived the chain, which is the whole point of the distinction.
    this.evidence.borrowedSurvived = bloom.Name.length > 0 && tonemap.Name.length > 0;
    blit.Dispose();
    bloom.Dispose();
    tonemap.Dispose();
    fxaa.Dispose();
    ssao.Dispose();
    ssr.Dispose();
    source.Dispose();
    destination.Dispose();
    this.Exit();
    super.LoadContent();
  }
}

test("the post-process chain is a real object graph with two distinct ownership rules", async () => {
  const game = new PostProcessProbeGame();
  await game.Run();
  const evidence = game.evidence;
  try {
    game.Dispose();
  } catch (error) {
      assert.fail(`${error.message}: ${(error.errors ?? []).map((entry) => entry.message).join("; ")}`);
  }
  assert.equal(typeof evidence.layerAvailable, "boolean");
  if (!evidence.layerAvailable) {
    assert.equal(evidence.refusedWithoutLayer, 6, "NOT_SUPPORTED without the extended layer");
    return;
  }

  // CNA's own quality tiers, not numbers this binding invented: a higher tier must cost more
  // samples and iterations, and a higher-quality FXAA must accept a finer edge.
  assert.ok(evidence.quality.bloomUltra > evidence.quality.bloomLow);
  assert.ok(evidence.quality.ssaoUltra > evidence.quality.ssaoLow);
  assert.ok(evidence.quality.fxaaUltra < evidence.quality.fxaaLow);

  assert.deepEqual(evidence.names, {
    blit: "Blit", bloom: "Bloom", tonemap: "Tonemap", fxaa: "FXAA", ssao: "SSAO", ssr: "SSR",
  });

  // Exact round trips at float precision. Every value chosen above is representable, so an
  // approximate comparison would hide a setter reaching the wrong property.
  assert.deepEqual(evidence.values, {
    bloomThreshold: 0.75,
    bloomIntensity: 1.25,
    bloomIterations: 3,
    tonemapMode: 2,
    tonemapExposure: 1.5,
    tonemapGamma: Math.fround(2.2),
    tonemapDeband: true,
    tonemapDebandStrength: 0.25,
    fxaaEdgeThreshold: 0.125,
    ssaoRadius: 0.5,
    ssaoIntensity: 1.75,
    ssaoSampleCount: 12,
    ssaoHalfResolution: true,
    ssrIntensity: 0.5,
    ssrMaxDistance: 40,
    ssrStepCount: 24,
    ssrThickness: 0.25,
    ssrDepthBias: 0.03125,
    ssrEdgeFade: 0.1875,
    // 0.625 was asked for. CNA clamps roughness blur to a quarter, and reporting what it kept is
    // more useful than choosing an input that could not reveal a clamp at all.
    ssrRoughnessBlur: 0.25,
  });

  for (const [name, supported] of Object.entries(evidence.supported)) {
    assert.equal(typeof supported, "boolean", `${name} must answer support with a boolean`);
  }

  assert.equal(evidence.emptyCount, 0);
  assert.equal(evidence.borrowedCount, 2);

  assert.equal(evidence.gpuTimingRequested, true);
  // A renderer with no GPU timers accepts the request and reports false; both are truthful.
  assert.equal(typeof evidence.gpuTimingActual, "boolean");
  if (!evidence.gpuTimingActual) assert.deepEqual(evidence.timings, []);

  assert.ok(
    evidence.applied === "SUCCESS" || /^result \d+$/.test(evidence.applied),
    `unexpected apply evidence ${evidence.applied}`,
  );
  assert.equal(evidence.refusedEmptyFrame, "RangeError", "a zero-width frame is refused here");
  assert.equal(evidence.clearedCount, 0);
  assert.equal(evidence.chainDisposedTwice, true);
  assert.equal(evidence.borrowedSurvived, true);
});

test("handing a pass to a chain consumes it, and leaks CNA's owned-resource count", async () => {
  // In its own process, because of what it finds: `cna_post_process_chain_add_owned_pass` consumes
  // the pass handle without the `RemoveOwnedGraphicsResourceFor` its sibling `_destroy` performs,
  // so the game's owned-graphics-resource counter never comes back down and every later
  // `cna_game_destroy` in that process refuses. Running it here would fail every test after it.
  const probe = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, "post-process-owned-pass.probe.mjs")],
    { encoding: "utf8", cwd: path.resolve(import.meta.dirname, "..") },
  );
  assert.equal(probe.status, 0, probe.stderr);
  const evidence = JSON.parse(probe.stdout.trim().split("\n").pop());
  if (evidence.status === "NOT_CONFIGURED" || evidence.layerAvailable === false) return;

  // The managed half of the transfer is correct and asserted for its own sake.
  assert.equal(evidence.passCount, 1);
  assert.equal(evidence.isOwnedByChain, true);
  assert.equal(evidence.disposeAfterTransferIsNoOp, true, "a transferred pass releases nothing");
  assert.match(evidence.useAfterTransfer, /handed to a chain with AddOwned/);
  assert.equal(evidence.countAfterClear, 0);

  // The upstream half is not. This asserts the defect as measured, so that fixing it upstream
  // fails here rather than passing silently.
  assert.equal(evidence.gameDisposed, false, "UPSTREAM: add_owned_pass no longer leaks the count");
  assert.match(evidence.gameDisposeError, /All owned C child resources must be destroyed/);
});

class HostDeviceProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    // Availability first. Every route in this family exists in every CNA build and refuses where
    // the extension layer is compiled out, so a refusal is about the build rather than about the
    // machine -- and reading it the other way is exactly the mistake this question prevents.
    this.evidence.layerAvailable = devicesModule.CnaDevices.IsAvailable();
    if (!this.evidence.layerAvailable) {
      try {
        devicesModule.CnaDevices.GetHostInfo();
        this.evidence.refusedWithoutLayer = null;
      } catch (error) {
        this.evidence.refusedWithoutLayer = error.cnaResult;
      }
      this.Exit();
      super.LoadContent();
      return;
    }

    const host = devicesModule.CnaDevices.GetHostInfo();
    this.evidence.host = {
      cores: host.LogicalCpuCoreCount,
      ram: host.SystemRamMegabytes,
      powerState: host.Power.State,
      batteryPercent: host.Power.BatteryPercent,
      secondsRemaining: host.Power.SecondsRemaining,
      contentScale: host.Display.ContentScale,
      safeArea: [
        host.Display.SafeArea.X, host.Display.SafeArea.Y,
        host.Display.SafeArea.Width, host.Display.SafeArea.Height,
      ],
    };
    this.evidence.locales = devicesModule.CnaDevices.GetPreferredLocales()
      .map((locale) => ({ language: locale.Language, country: locale.Country }));
    this.evidence.clipboardAccepted = devicesModule.CnaDevices.SetClipboardText("cna-ts");
    const cameras = devicesModule.CnaDevices.GetCameras();
    this.evidence.cameras = {
      supported: cameras.IsSupported,
      count: cameras.Devices.length,
      names: cameras.Devices.map((camera) => camera.Name),
    };
    this.Exit();
    super.LoadContent();
  }
}

test("the extended device layer reports the host truthfully, absences included", async () => {
  const game = new HostDeviceProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();
  assert.equal(typeof evidence.layerAvailable, "boolean");
  if (!evidence.layerAvailable) {
    assert.equal(evidence.refusedWithoutLayer, 6, "NOT_SUPPORTED without the device layer");
    return;
  }

  // A fact about this machine, not a placeholder, and checked against an independent count.
  assert.ok(evidence.host.cores >= 1, `expected at least one core, saw ${evidence.host.cores}`);
  assert.equal(evidence.host.cores, os.cpus().length, "CNA counts the same cores Node does");

  // Memory is a different story on this build and the honest number is zero. SDL answers it, and
  // the HEADLESS platform initialises no SDL subsystem to answer with, so CNA reports none. That
  // is recorded rather than asserted away: a windowed build reports the real figure, and this
  // assertion accepts either without inventing one.
  assert.ok(evidence.host.ram >= 0, `expected a non-negative memory figure, saw ${evidence.host.ram}`);
  assert.equal(evidence.host.ram, 0, "HEADLESS has no SDL platform to ask for system memory");

  // The power state is one of CNA's six identities. Which one depends on the machine, so the
  // assertion is the range rather than a value this host happens to have today.
  assert.ok(
    Object.values(devicesModule.PowerState).includes(evidence.host.powerState),
    `unexpected power state ${evidence.host.powerState}`,
  );
  // An absent charge is null, never a number: a consumer comparing a percentage against a low
  // threshold must not read "no battery fitted" as "nearly flat".
  for (const value of [evidence.host.batteryPercent, evidence.host.secondsRemaining]) {
    assert.ok(value === null || value >= 0, `expected null or a non-negative value, saw ${value}`);
  }
  if (evidence.host.powerState === devicesModule.PowerState.NoBattery) {
    assert.equal(evidence.host.batteryPercent, null, "no battery has no charge to report");
  }

  // HEADLESS has no native window, so CNA answers a zero content scale and an empty safe area.
  // That is its documented answer for a windowless session rather than a failure to read one.
  assert.equal(evidence.host.contentScale, 0, "a windowless session has no content scale");
  assert.deepEqual(evidence.host.safeArea, [0, 0, 0, 0]);

  // Locales come back as language/country pairs in the platform's own preference order.
  assert.ok(Array.isArray(evidence.locales));
  for (const locale of evidence.locales) {
    assert.match(locale.language, /^[a-z]{2,3}$/i, `unexpected language ${locale.language}`);
    assert.equal(typeof locale.country, "string");
  }

  // A platform with no clipboard answers false. Either answer is truthful; a throw would not be.
  assert.equal(typeof evidence.clipboardAccepted, "boolean");

  // "The platform has no cameras" and "the platform has camera support and none attached" are
  // different situations, and the inventory keeps them apart.
  assert.equal(typeof evidence.cameras.supported, "boolean");
  assert.equal(evidence.cameras.names.length, evidence.cameras.count);
  if (!evidence.cameras.supported) assert.equal(evidence.cameras.count, 0);
});

class GamerServicesProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const gs = GamerServices;
    // Before Initialize, CNA already knows the dispatcher is not initialised. It does *not* refuse
    // the pump, though -- measured, not assumed -- so the ordering rule XNA enforces is enforced
    // here, which is where a projection's job is.
    this.evidence.initializedBefore = gs.GamerServicesDispatcher.IsInitialized;
    try {
      gs.GamerServicesDispatcher.Update();
      this.evidence.updateBeforeInitialize = "allowed";
    } catch (error) {
      this.evidence.updateBeforeInitialize = error.cnaResult ?? error.constructor.name;
    }

    gs.GamerServicesDispatcher.Initialize(this.Services);
    this.evidence.initializedAfter = gs.GamerServicesDispatcher.IsInitialized;
    gs.GamerServicesDispatcher.Update();
    this.evidence.updateAfterInitialize = "SUCCESS";

    // A platform window handle, not a CNA handle: CNA stores it verbatim and nothing dereferences
    // it. It round-trips as a bigint so a high address cannot be rounded on the way through.
    const handle = 0x1234_5678_9abc_def0n;
    gs.GamerServicesDispatcher.WindowHandle = handle;
    this.evidence.windowHandle = gs.GamerServicesDispatcher.WindowHandle;
    this.evidence.windowHandleIsBigInt = typeof this.evidence.windowHandle === "bigint";

    // Guide state now lives in CNA, so a native gamer-services component and this class cannot
    // disagree. Each value is written and read back through the runtime rather than a local field.
    this.evidence.guideVisible = gs.Guide.IsVisible;
    this.evidence.trialBefore = gs.Guide.IsTrialMode;
    gs.Guide.SimulateTrialMode = true;
    this.evidence.simulateAfterSet = gs.Guide.SimulateTrialMode;
    this.evidence.trialAfterSimulating = gs.Guide.IsTrialMode;
    gs.Guide.SimulateTrialMode = false;
    this.evidence.trialAfterClearing = gs.Guide.IsTrialMode;

    // The screen saver is a *platform display* property in CNA, not title state: with no platform
    // displays the getter answers true and the setter does nothing. Recording that is the point --
    // a projection that cached the write locally would report a screen saver it had not disabled.
    gs.Guide.IsScreenSaverEnabled = false;
    this.evidence.screenSaverAfterDisable = gs.Guide.IsScreenSaverEnabled;
    gs.Guide.IsScreenSaverEnabled = true;
    this.evidence.screenSaverAfterEnable = gs.Guide.IsScreenSaverEnabled;

    gs.Guide.NotificationPosition = gs.NotificationPosition.TopLeft;
    this.evidence.notificationPosition = gs.Guide.NotificationPosition;
    gs.Guide.NotificationPosition = gs.NotificationPosition.BottomCenter;
    this.evidence.notificationPositionRestored = gs.Guide.NotificationPosition;

    // Everything that needs a real signed-in user still refuses. A fabricated gamer would be worse
    // than the exception XNA itself raises where the platform is absent.
    // Nobody is signed in, and nobody is invented: the collection is empty rather than holding a
    // placeholder gamer, which is what "do not fabricate a signed-in user" looks like in practice.
    this.evidence.signedInGamerCount = gs.Gamer.SignedInGamers.Count;
    // What still needs a platform this host does not have. `BeginShowMessageBox` used to be in
    // this list and is not any more: CNA draws that screen itself, so it works -- see the Guide
    // test below. It is started and *answered* here rather than merely started, because a Guide
    // screen left pending would refuse the next one.
    for (const [name, call] of [
      ["ShowSignIn", () => gs.Guide.ShowSignIn(1, false)],
      ["DelayNotifications", () => gs.Guide.DelayNotifications(TimeSpan.Zero)],
    ]) {
      try {
        call();
        this.evidence[`${name}Refusal`] = "allowed";
      } catch (error) {
        this.evidence[`${name}Refusal`] = error.constructor.name;
      }
    }
    try {
      const box = gs.Guide.BeginShowMessageBox(
        "t", "m", ["a"], 0, gs.MessageBoxIcon.None, null, null,
      );
      guideExtensions.CnaGuide.ForTests.ClickMessageBoxButton(0);
      this.evidence.MessageBoxAnswer = gs.Guide.EndShowMessageBox(box);
    } catch (error) {
      this.evidence.MessageBoxAnswer = error.constructor.name;
    }
    this.Exit();
    super.LoadContent();
  }
}

test("gamer services has a real dispatcher and Guide state, and still refuses a fabricated gamer", async () => {
  const game = new GamerServicesProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  assert.equal(evidence.initializedBefore, false);
  // XNA raises InvalidOperationException for a pump before Initialize; CNA accepts one, so the
  // projection is what holds the line. Reading CNA's own IsInitialized rather than a mirrored flag
  // keeps the guard honest: it refuses because the runtime says it is not initialised.
  assert.equal(evidence.updateBeforeInitialize, "InvalidOperationException");
  assert.equal(evidence.initializedAfter, true);
  assert.equal(evidence.updateAfterInitialize, "SUCCESS");

  assert.equal(evidence.windowHandleIsBigInt, true);
  assert.equal(evidence.windowHandle, 0x1234_5678_9abc_def0n, "a 64-bit handle survives the round trip");

  assert.equal(evidence.guideVisible, false, "no guide screen is in front of anyone here");
  assert.equal(evidence.trialBefore, false);
  assert.equal(evidence.simulateAfterSet, true);
  // CNA keeps IsTrialMode and SimulateTrialMode apart; XNA's IsTrialMode is the disjunction,
  // because simulating a trial exists precisely so a full title reports one. The projection
  // combines them, and this is the assertion that would notice if it stopped.
  assert.equal(evidence.trialAfterSimulating, true, "simulating a trial changes what a game branches on");
  assert.equal(evidence.trialAfterClearing, false);
  // HEADLESS has no platform displays, so CNA's screen-saver flag is read-only in effect: the
  // getter answers true and the setter is a no-op. The projection reports what the platform says
  // rather than what it was told, which is the whole reason this state moved into CNA.
  assert.equal(evidence.screenSaverAfterDisable, true, "no platform displays: the write cannot take");
  assert.equal(evidence.screenSaverAfterEnable, true);
  assert.equal(evidence.notificationPosition, GamerServices.NotificationPosition.TopLeft);
  assert.equal(evidence.notificationPositionRestored, GamerServices.NotificationPosition.BottomCenter);

  assert.equal(evidence.signedInGamerCount, 0, "no gamer is fabricated where none is signed in");
  assert.equal(evidence.ShowSignInRefusal, "GamerServicesNotAvailableException");
  assert.equal(evidence.DelayNotificationsRefusal, "GamerServicesNotAvailableException");
  // BeginShowMessageBox is no longer a refusal: CNA draws that screen itself, so the XNA API
  // works and answers with the button that was pressed. What still refuses is what needs a real
  // platform -- a sign-in screen and a notification delay.
  assert.equal(evidence.MessageBoxAnswer, 0, "the Guide's message box works and answers");
});

class SensorProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    this.evidence.support = { ...sensorsModule.CnaSensors.GetSupport() };

    // Constructing one on a device that has none is allowed, so a game can build its options
    // screen without branching first. What is *not* allowed is getting a reading out of it.
    const accelerometer = new sensorsModule.Accelerometer();
    try {
      this.evidence.state = accelerometer.State;
      this.evidence.isDataValid = accelerometer.IsDataValid;

      // The whole point of this family: a device with no accelerometer must not read as one lying
      // perfectly still. Zeroes here would be a measurement a game could integrate.
      try {
        accelerometer.CurrentValue;
        this.evidence.currentValue = "returned a reading";
      } catch (error) {
        this.evidence.currentValue = error.constructor.name;
      }

      try {
        accelerometer.Start();
        this.evidence.start = "SUCCESS";
      } catch (error) {
        this.evidence.start = `result ${error.cnaResult}`;
      }
      this.evidence.stateAfterStart = accelerometer.State;

      // The update interval is a request, and reading it back is what says whether it took.
      const before = accelerometer.TimeBetweenUpdates.Ticks;
      accelerometer.TimeBetweenUpdates = TimeSpan.FromMilliseconds(50);
      this.evidence.interval = {
        before: String(before),
        after: String(accelerometer.TimeBetweenUpdates.Ticks),
        requested: String(TimeSpan.FromMilliseconds(50).Ticks),
      };

      try {
        accelerometer.Stop();
        this.evidence.stop = "SUCCESS";
      } catch (error) {
        this.evidence.stop = `result ${error.cnaResult}`;
      }
    } finally {
      accelerometer.Dispose();
      accelerometer.Dispose();
      this.evidence.disposedTwice = accelerometer.IsDisposed;
    }
    try {
      new sensorsModule.Accelerometer().Dispose();
      this.evidence.reconstructed = true;
    } catch {
      this.evidence.reconstructed = false;
    }
    this.Exit();
    super.LoadContent();
  }
}

test("a sensor that is not there reports absence rather than a zero reading", async () => {
  const game = new SensorProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // Four families, each answered by the platform rather than assumed.
  for (const [name, supported] of Object.entries(evidence.support)) {
    assert.equal(typeof supported, "boolean", `${name} must answer with a boolean`);
  }

  assert.ok(
    Object.values(sensorsModule.SensorState).includes(evidence.state),
    `unexpected sensor state ${evidence.state}`,
  );
  if (!evidence.support.Accelerometer) {
    // This host has no accelerometer, and the whole family says so consistently: the state is
    // NotSupported, no data is valid, and asking for a value refuses instead of returning zeroes a
    // game would integrate into an orientation nothing ever measured.
    assert.equal(evidence.state, sensorsModule.SensorState.NotSupported);
    assert.equal(evidence.isDataValid, false);
    assert.equal(evidence.currentValue, "InvalidOperationException");
  }
  assert.equal(typeof evidence.isDataValid, "boolean");

  // Start and Stop either work or name the result they refused with; neither is assumed.
  for (const value of [evidence.start, evidence.stop]) {
    assert.ok(value === "SUCCESS" || /^result \d+$/.test(value), `unexpected sensor evidence ${value}`);
  }

  // The interval is a request. Whether the platform took it is read back rather than assumed.
  assert.match(evidence.interval.before, /^\d+$/);
  assert.match(evidence.interval.after, /^\d+$/);
  assert.equal(evidence.disposedTwice, true);
  assert.equal(evidence.reconstructed, true, "a released sensor does not block the next one");
});

class NativeAudioProbeGame extends Game {
  constructor(mediaUri) {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.bufferNeeded = 0;
    this.mediaUri = mediaUri;
    this.storagePromise = null;
  }

  LoadContent() {
    this.storagePromise = selectStorage();
    const backend = getBackend().Audio;
    assert.ok(backend);
    assert.deepEqual(Audio.Microphone.All, []);
    assert.equal(Audio.Microphone.Default, undefined);

    Audio.SoundEffect.MasterVolume = 0.75;
    Audio.SoundEffect.DistanceScale = 2;
    Audio.SoundEffect.DopplerScale = 0.5;
    Audio.SoundEffect.SpeedOfSound = 340;
    assert.equal(backend.getMasterVolume(), Math.fround(0.75));
    assert.equal(backend.getDistanceScale(), Math.fround(2));
    assert.equal(backend.getDopplerScale(), Math.fround(0.5));
    assert.equal(backend.getSpeedOfSound(), Math.fround(340));
    assert.throws(
      () => new Audio.AudioEngine("/tmp/cna-ts-missing-settings.xgs"),
      (error) => error.operation === "cna_audio_engine_create" && Number.isInteger(error.cnaResult),
    );

    this.sound = new Audio.SoundEffect(Array(320).fill(0), 8000, Audio.AudioChannels.Mono);
    assert.equal(this.sound.Name, "");
    this.sound.Name = "native-audio-probe";
    assert.equal(this.sound.Name, "native-audio-probe");
    assert.equal(this.sound.Play(0.5, 0.25, -0.25), false);

    const disposableChild = this.sound.CreateInstance();
    disposableChild.Dispose();
    disposableChild.Dispose();
    assert.equal(disposableChild.IsDisposed, true);

    this.instance = this.sound.CreateInstance();
    assert.equal(this.instance.State, Audio.SoundState.Stopped);
    this.instance.Pause();
    assert.equal(this.instance.State, Audio.SoundState.Stopped);
    this.instance.Volume = 0.5;
    this.instance.Pitch = -0.25;
    this.instance.Pan = 0.25;
    this.instance.IsLooped = true;
    this.instance.Apply3D(new Audio.AudioListener(), new Audio.AudioEmitter());
    // ABI 0.9.0 changed this contract: Apply3D previously refused every listener count but one and
    // now accepts any positive count, the nearest listener deciding the applied attenuation.
    this.instance.Apply3D(
      [new Audio.AudioListener(), new Audio.AudioListener()], new Audio.AudioEmitter(),
    );
    // The other half of that contract change: a playing instance that was never positioned refuses,
    // because starting playback fixes the choice between 3D and pan.
    const unpositioned = this.sound.CreateInstance();
    unpositioned.Play();
    assert.throws(
      () => unpositioned.Apply3D(new Audio.AudioListener(), new Audio.AudioEmitter()),
      (error) => error.cnaResult === 3,
    );
    unpositioned.Dispose();
    this.instance.Play();
    assert.equal(this.instance.State, Audio.SoundState.Stopped);
    this.instance.Resume();
    this.instance.Stop(false);

    this.dynamic = new Audio.DynamicSoundEffectInstance(8000, Audio.AudioChannels.Mono);
    this.dynamic.SubmitBuffer(Array(320).fill(0));
    assert.equal(this.dynamic.PendingBufferCount, 1);
    const onNeeded = () => {
      this.bufferNeeded += 1;
      this.dynamic.BufferNeeded.Remove(onNeeded);
      this.dynamic.SubmitBuffer(Array(320).fill(0));
    };
    this.dynamic.BufferNeeded.Add(onNeeded);
    this.dynamic.Play();

    const sources = Media.MediaSource.GetAvailableMediaSources();
    assert.ok(sources.length >= 1);
    assert.equal(typeof sources[0].Name, "string");
    assert.equal(typeof sources[0].MediaSourceType, "number");
    assert.equal(typeof Media.MediaPlayer.GameHasControl, "boolean");
    Media.MediaPlayer.Volume = 0.5;
    Media.MediaPlayer.IsMuted = true;
    Media.MediaPlayer.IsRepeating = true;
    Media.MediaPlayer.IsShuffled = false;
    Media.MediaPlayer.IsVisualizationEnabled = true;
    this.song = Media.Song.FromUri("generated-silence", this.mediaUri);
    Media.MediaPlayer.Play(this.song);
    assert.equal(Media.MediaPlayer.State, Media.MediaState.Playing);
    Media.MediaPlayer.Pause();
    Media.MediaPlayer.Resume();
    Media.MediaPlayer.MoveNext();
    Media.MediaPlayer.MovePrevious();
    assert.equal(typeof Media.MediaPlayer.PlayPosition.Ticks, "bigint");
    const visualization = new Media.VisualizationData();
    Media.MediaPlayer.GetVisualizationData(visualization);
    assert.equal(visualization.Frequencies.length, 256);
    Media.MediaPlayer.Stop();

    this.videoPlayer = new Media.VideoPlayer();
    assert.equal(this.videoPlayer.State, Media.MediaState.Stopped);
    assert.equal(this.videoPlayer.PlayPosition.Ticks, 0n);
    this.videoPlayer.IsLooped = true;
    this.videoPlayer.IsMuted = true;
    this.videoPlayer.Volume = 0.25;
    this.videoPlayer.Pause();
    this.videoPlayer.Resume();
    this.videoPlayer.Stop();
    assert.throws(() => this.videoPlayer.GetTexture(), /No video has been played/);

    // The frame identity CNA added so a borrowed frame texture could be projected at all. Before
    // any decode it is an absence with a zero generation -- a state, not a failure -- and reading
    // it must not fabricate a texture or advance the count.
    const before = extensionsModule.GetVideoFrameIdentity(this.videoPlayer);
    assert.equal(before.IsAvailable, false);
    assert.equal(before.Generation, 0n);
    assert.equal(typeof before.PresentationTimeSeconds, "number");
    assert.ok(before.PresentationTimeSeconds < 0, "no frame has no presentation time");
    const again = extensionsModule.GetVideoFrameIdentity(this.videoPlayer);
    assert.equal(again.Generation, before.Generation, "asking does not advance the frame");

    // Control-path evidence for the projection itself: it now distinguishes "nothing has played"
    // from "playing but nothing decoded yet", and neither invents a Texture2D. Actual decode
    // progression is fixture-pending -- no redistributable video is available on this host.
    this.videoPlayerFrameEvidence = {
      available: before.IsAvailable,
      generation: before.Generation,
      presentationTime: before.PresentationTimeSeconds,
    };
  }

  Update() {
    assert.ok(this.bufferNeeded <= 1);
    this.Exit();
  }
}

test("executes typed CNA Audio/XACT, Media/Video and Storage routes", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-media-native-"));
  const filename = path.join(directory, "silence.wav");
  fs.writeFileSync(filename, silentWave());
  try {
    const game = new NativeAudioProbeGame(pathToFileURL(filename));
    await game.Run();
    const storageDevice = await game.storagePromise;
    assert.equal(storageDevice.IsConnected, true);
    assert.ok(storageDevice.FreeSpace > 0n);
    assert.ok(storageDevice.TotalSpace > 0n);
    const container = await openStorage(storageDevice, "native-tests");
    assert.equal(await openStorage(storageDevice, "native-tests"), container);
    assert.equal(container.DisplayName, "native-tests");
    container.CreateDirectory("saves");
    assert.equal(container.DirectoryExists("saves"), true);
    assert.deepEqual(container.GetDirectoryNames("sav*"), ["saves"]);
    container.CreateFile("slot.dat");
    assert.equal(container.FileExists("slot.dat"), true);
    assert.deepEqual(container.GetFileNames("*.dat"), ["slot.dat"]);
    assert.equal(container.OpenFile("slot.dat", 3).byteLength, 0);
    container.DeleteFile("slot.dat");
    container.DeleteDirectory("saves");
    container.Dispose();
    container.Dispose();
    storageDevice.DeleteContainer("native-tests");
    const liveContainer = await openStorage(storageDevice, "parent-owned");
    assert.equal(game.bufferNeeded, 1);
    game.Dispose();
    assert.equal(game.instance.IsDisposed, true);
    assert.equal(game.dynamic.IsDisposed, true);
    assert.equal(game.sound.IsDisposed, true);
    assert.equal(game.videoPlayer.IsDisposed, true);
    assert.equal(liveContainer.IsDisposed, true);
    assert.equal(storageDevice.IsConnected, false);
    game.instance.Dispose();
    game.dynamic.Dispose();
    game.sound.Dispose();
    game.videoPlayer.Dispose();
    game.song.Dispose();
    game.Dispose();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function selectStorage() {
  return new Promise((resolve, reject) => {
    Storage.StorageDevice.BeginShowSelector((result) => {
      try { resolve(Storage.StorageDevice.EndShowSelector(result)); } catch (error) { reject(error); }
    }, null);
  });
}

function openStorage(device, name) {
  return new Promise((resolve, reject) => {
    device.BeginOpenContainer(name, (result) => {
      try { resolve(device.EndOpenContainer(result)); } catch (error) { reject(error); }
    }, null);
  });
}

function silentWave() {
  const sampleCount = 800;
  const output = Buffer.alloc(44 + sampleCount * 2);
  output.write("RIFF", 0, "ascii");
  output.writeUInt32LE(output.length - 8, 4);
  output.write("WAVEfmt ", 8, "ascii");
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(8000, 24);
  output.writeUInt32LE(16000, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36, "ascii");
  output.writeUInt32LE(sampleCount * 2, 40);
  return output;
}

for (const frameCount of [60, 600]) {
  test(`executes ${frameCount} CNA-owned frames with graphics resources`, async () => {
    const game = new NativeProbeGame(frameCount);
    await game.Run();
    assert.equal(game.updates, frameCount);
    assert.equal(game.draws, frameCount);
    assert.equal(game.inputPolls, 1);
    assert.equal(game.graphicsRouteEvidence["effect SpriteBatch.Begin"], "SUCCESS");
    assert.equal(game.graphicsRouteEvidence["stock effect construction"], "SUCCESS");
    assert.equal(game.graphicsRouteEvidence["stock effect execution"], "SUCCESS");
    assert.equal(game.graphicsRouteEvidence["compiled Effect route"], "HEADLESS_NOT_SUPPORTED");
    assert.equal(game.graphicsRouteEvidence["Model.Draw"], "SUCCESS");
    assert.equal(game.graphicsRouteEvidence["RenderTarget2D creation"], "SUCCESS");
    assert.equal(game.graphicsRouteEvidence["RenderTargetCube creation"], "SUCCESS");
    assert.equal(game.graphicsRouteEvidence["cube render target binding"], "SUCCESS");
    assert.ok(game.graphicsRouteEvidence["DrawUserPrimitives"]);
    assert.ok(game.graphicsRouteEvidence["DrawUserIndexedPrimitives"]);
    game.Dispose();
    game.Dispose();
  });
}

test("parent shutdown deterministically releases live graphics families", async () => {
  const game = new NativeProbeGame(2, true);
  await game.Run();
  game.Dispose();
  assert.equal(game.texture.IsDisposed, true);
  assert.equal(game.dynamicVertexBuffer?.IsDisposed, true);
  assert.equal(game.dynamicIndexBuffer?.IsDisposed, true);
  assert.equal(game.renderTarget?.IsDisposed, true);
  assert.equal(game.renderTargetCube?.IsDisposed, true);
  assert.equal(game.occlusionQuery?.IsDisposed, true);
  game.texture.Dispose();
  game.texture.Dispose();
  game.dynamicVertexBuffer?.Dispose();
  game.dynamicIndexBuffer?.Dispose();
  game.renderTarget?.Dispose();
  game.renderTargetCube?.Dispose();
  game.occlusionQuery?.Dispose();
  game.Dispose();
});

test("repeats native Game creation and destruction", async () => {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const game = new NativeProbeGame(3);
    await game.Run();
    game.Dispose();
  }
});

test("reports renderer identity from CNA rather than a binding label", () => {
  const renderer = GetRuntimeStatus().RendererInfo;
  assert.equal(renderer.Name, "HEADLESS");
  assert.equal(typeof renderer.RendererType, "number");
  assert.equal(typeof renderer.CapabilityFlags, "bigint");
  assert.ok(renderer.MaxTextureDimension > 0);
  assert.equal(renderer.CapabilityFlags & (1n << 7n), 1n << 7n, "HEADLESS custom effects");
  assert.equal(renderer.CapabilityFlags & (1n << 13n), 0n, "HEADLESS compiled effects");
});

class ExtendedInputProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const { Haptics, Joysticks } = inputModule;

    // Enumeration first, because everything else takes an identifier it produces. A host with no
    // joystick must report none rather than throwing: "there are none" is an answer a game acts on.
    this.evidence.joystickCount = Joysticks.Count;
    const devices = Joysticks.Enumerate();
    this.evidence.enumerated = devices.length;
    this.evidence.enumerationIsFrozen = Object.isFrozen(devices);
    this.evidence.joysticks = devices.map((device) => ({
      id: device.Id, name: device.Name, type: device.Type,
    }));

    // An identifier no device has. Measured rather than assumed: CNA does not refuse it, it
    // answers *absent* -- a disconnected descriptor with zero counts and an empty name, which is
    // exactly the convention XNA's own GamePad.GetCapabilities follows for a missing controller.
    // That is the contract worth pinning, because a binding that invented a plausible descriptor
    // for an absent device would be the defect this family exists to avoid.
    const unknown = this.evidence.joystickCount + 1000;
    this.evidence.unknownCapabilities = { ...Joysticks.GetCapabilities(unknown) };
    const unknownState = Joysticks.CaptureState(unknown);
    this.evidence.unknownState = {
      axes: unknownState.Axes.length,
      buttons: unknownState.Buttons.length,
      hats: unknownState.Hats.length,
      balls: unknownState.Balls.length,
    };

    // Where a joystick does exist, its capabilities and a captured state must agree with each other.
    if (devices.length > 0) {
      const id = devices[0].Id;
      const capabilities = Joysticks.GetCapabilities(id);
      const state = Joysticks.CaptureState(id);
      this.evidence.first = {
        capabilities: { ...capabilities },
        axes: state.Axes.length,
        buttons: state.Buttons.length,
        hats: state.Hats.length,
        balls: state.Balls.length,
        axisRangeOk: state.Axes.every((value) => Number.isInteger(value) && value >= -32768 && value <= 32767),
        buttonsAreBooleans: state.Buttons.every((value) => typeof value === "boolean"),
        ballsArePoints: state.Balls.every((value) => value instanceof Point),
      };
    }

    this.evidence.hapticCount = Haptics.Count;
    const haptics = Haptics.Enumerate();
    this.evidence.hapticsEnumerated = haptics.length;
    // The same rule for haptics, and this is the stronger half of it: opening an identifier no
    // device has produces an object that reports itself closed and **declines every operation**.
    // A device that silently accepted PlayRumble while doing nothing would be worse than an
    // exception, because a game would offer the setting.
    const absent = Haptics.Open(this.evidence.hapticCount + 1000);
    try {
      this.evidence.absentHaptic = {
        isOpen: absent.IsOpen,
        name: absent.Name,
        capabilities: { ...absent.Capabilities },
        initRumble: absent.InitializeRumble(),
        playRumble: absent.PlayRumble(0.5, 100),
        stopRumble: absent.StopRumble(),
        setGain: absent.SetGain(50),
      };
    } finally {
      absent.Dispose();
    }
    this.evidence.absentHapticDisposed = absent.IsDisposed;
    try {
      absent.PlayRumble(0.5, 100);
      this.evidence.afterDispose = "accepted";
    } catch (error) {
      this.evidence.afterDispose = error.constructor.name;
    }
    if (haptics.length > 0) {
      const device = Haptics.Open(haptics[0].Id);
      try {
        this.evidence.haptic = {
          name: device.Name,
          isOpen: device.IsOpen,
          capabilities: { ...device.Capabilities },
          initRumble: device.InitializeRumble(),
          playRumble: device.PlayRumble(0.5, 100),
          stopRumble: device.StopRumble(),
        };
      } finally {
        device.Dispose();
      }
      this.evidence.hapticDisposedTwice = (() => {
        const second = Haptics.Open(haptics[0].Id);
        second.Dispose();
        second.Dispose();
        return second.IsDisposed;
      })();
    }

    // Argument validation happens in TypeScript, before anything reaches CNA, so it is the same
    // refusal whether or not a device is attached.
    const refusals = {};
    const record = (name, body) => {
      try {
        body();
        refusals[name] = "accepted";
      } catch (error) {
        refusals[name] = error.constructor.name;
      }
    };
    record("negativeJoystickId", () => Joysticks.GetCapabilities(-1));
    record("fractionalJoystickId", () => Joysticks.CaptureState(1.5));
    record("negativeHapticId", () => Haptics.Open(-1));
    this.evidence.refusals = refusals;
    super.LoadContent();
  }

  Draw(gameTime) {
    this.GraphicsDevice.Clear(Color.CornflowerBlue);
    this.Exit();
    super.Draw(gameTime);
  }
}

test("CNA's raw joysticks and haptics answer, and report absence as absence", async () => {
  const game = new ExtendedInputProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // Whatever this host has, the two counts and the two enumerations must agree with each other.
  assert.equal(typeof evidence.joystickCount, "number");
  assert.equal(evidence.enumerated, evidence.joystickCount, "the enumeration is the count");
  assert.equal(evidence.enumerationIsFrozen, true, "an enumeration is a snapshot, not a live list");
  for (const joystick of evidence.joysticks) {
    assert.equal(typeof joystick.id, "number");
    assert.equal(typeof joystick.name, "string");
    assert.ok(
      Object.values(inputModule.JoystickType).includes(joystick.type),
      `unexpected joystick type ${joystick.type}`,
    );
  }

  // An identifier a thousand past the end. CNA answers absence rather than refusing, and the whole
  // descriptor says so together: not connected, no axes, no buttons, no hats, no balls, no name and
  // no GUID. A binding that filled in a plausible-looking device here would fail every line.
  assert.equal(evidence.unknownCapabilities.IsConnected, false);
  assert.deepEqual(
    [
      evidence.unknownCapabilities.AxisCount, evidence.unknownCapabilities.ButtonCount,
      evidence.unknownCapabilities.HatCount, evidence.unknownCapabilities.BallCount,
    ],
    [0, 0, 0, 0],
  );
  assert.equal(evidence.unknownCapabilities.Name, "");
  assert.equal(evidence.unknownCapabilities.Guid, "");
  assert.equal(evidence.unknownCapabilities.Type, inputModule.JoystickType.Unknown);
  assert.deepEqual(evidence.unknownState, { axes: 0, buttons: 0, hats: 0, balls: 0 });

  // The haptic half, which is the stronger claim: an absent device reports itself closed, offers
  // no features, and **declines every operation** rather than accepting one it cannot perform.
  const absent = evidence.absentHaptic;
  assert.equal(absent.isOpen, false);
  assert.equal(absent.name, "");
  assert.equal(absent.capabilities.Features, 0, "no effect is supported by a device that is not there");
  assert.equal(absent.capabilities.RumbleSupported, false);
  assert.equal(absent.capabilities.IsOpen, false);
  for (const key of ["initRumble", "playRumble", "stopRumble", "setGain"]) {
    assert.equal(absent[key], false, `${key} must be declined by an absent device`);
  }
  assert.equal(evidence.absentHapticDisposed, true);
  assert.equal(evidence.afterDispose, "ObjectDisposedException", "a released device refuses by name");

  // Where a device exists, the capability counts and the captured arrays must be the same numbers:
  // a state whose arrays disagreed with the capabilities would mean one of them was invented.
  if (evidence.first) {
    const { capabilities, axes, buttons, hats, balls } = evidence.first;
    assert.equal(axes, capabilities.AxisCount);
    assert.equal(buttons, capabilities.ButtonCount);
    assert.equal(hats, capabilities.HatCount);
    assert.equal(balls, capabilities.BallCount);
    assert.equal(evidence.first.axisRangeOk, true, "an axis is a raw int16");
    assert.equal(evidence.first.buttonsAreBooleans, true);
    assert.equal(evidence.first.ballsArePoints, true, "a trackball's motion is an XNA Point");
    assert.equal(typeof capabilities.Guid, "string");
  } else {
    // No joystick is attached to this host, which is the ordinary case for a headless build
    // machine. That is recorded rather than skipped: the family answered, and its answer was none.
    assert.equal(evidence.joystickCount, 0);
  }

  assert.equal(typeof evidence.hapticCount, "number");
  assert.equal(evidence.hapticsEnumerated, evidence.hapticCount);
  if (evidence.haptic) {
    assert.equal(evidence.haptic.isOpen, true);
    assert.equal(typeof evidence.haptic.name, "string");
    assert.equal(typeof evidence.haptic.capabilities.Features, "number");
    // Every haptic operation reports whether the device accepted it, which is what a game branches
    // on. None of them is assumed to have worked.
    for (const key of ["initRumble", "playRumble", "stopRumble"]) {
      assert.equal(typeof evidence.haptic[key], "boolean", `${key} must report acceptance`);
    }
    assert.equal(evidence.hapticDisposedTwice, true, "disposing twice is idempotent");
  } else {
    assert.equal(evidence.hapticCount, 0);
  }

  // Argument validation is this package's, not CNA's, so it is the same answer on any host.
  assert.equal(evidence.refusals.negativeJoystickId, "ArgumentException");
  assert.equal(evidence.refusals.fractionalJoystickId, "ArgumentException");
  assert.equal(evidence.refusals.negativeHapticId, "ArgumentException");
});

test("the extended input families refuse outside a game rather than answering", () => {
  // Every one of these is a property of a platform a game opened. Asking without one must name the
  // problem rather than returning an empty list a caller would read as "no devices".
  for (const [name, body] of Object.entries({
    JoystickCount: () => inputModule.Joysticks.Count,
    JoystickEnumerate: () => inputModule.Joysticks.Enumerate(),
    HapticCount: () => inputModule.Haptics.Count,
    HapticEnumerate: () => inputModule.Haptics.Enumerate(),
  })) {
    assert.throws(body, /requires an active native Game|active native Game/, `${name} answered outside a game`);
  }
});

class TextInputProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const { CnaTextInput, MouseCursor, MouseCursorStock, TextInputType } = inputModule;
    // CNA publishes this so one test cannot leak registrations into the next.
    CnaTextInput.ForTests.Reset();

    this.evidence.activeBefore = CnaTextInput.IsActive;
    const record = (name, body) => {
      try {
        body();
        this.evidence[name] = "SUCCESS";
      } catch (error) {
        this.evidence[name] = `result ${error.cnaResult ?? error.constructor.name}`;
      }
    };
    record("start", () => CnaTextInput.Start());
    this.evidence.activeAfterStart = CnaTextInput.IsActive;
    record("stop", () => CnaTextInput.Stop());
    this.evidence.activeAfterStop = CnaTextInput.IsActive;
    record("typedStart", () => CnaTextInput.Start(TextInputType.Email));
    this.evidence.activeAfterTypedStart = CnaTextInput.IsActive;
    this.evidence.screenKeyboard = CnaTextInput.IsScreenKeyboardShown;
    record("rectangle", () => CnaTextInput.SetInputRectangle(new Rectangle(4, 8, 120, 24)));

    // Committed characters. Deliberately not ASCII: a Latin letter with a diacritic, a CJK
    // ideograph, and a non-BMP emoji delivered as the surrogate pair the platform actually sends.
    // A binding that treated a code unit as a byte, or that reassembled the pair itself, fails.
    const typed = [];
    const characters = CnaTextInput.OnCharacter((character) => typed.push(character));
    try {
      for (const unit of [...("aé漢字")].flatMap((c) => [...c].map((u) => u.charCodeAt(0)))) {
        CnaTextInput.ForTests.RaiseCharacter(unit);
      }
      // U+1F600 GRINNING FACE, as its high and low surrogates.
      CnaTextInput.ForTests.RaiseCharacter(0xd83d);
      CnaTextInput.ForTests.RaiseCharacter(0xde00);
    } finally {
      characters.Dispose();
    }
    this.evidence.typedUnits = [...typed];
    this.evidence.typedJoined = typed.join("");
    this.evidence.charactersDisposed = characters.IsDisposed;

    // A disposed subscription must stop receiving. Raising again after disposal and finding the
    // list unchanged is what proves the unsubscribe reached CNA rather than only this package.
    const before = typed.length;
    CnaTextInput.ForTests.RaiseCharacter(0x0041);
    this.evidence.afterUnsubscribe = typed.length - before;

    // Composition. The text is UTF-8 on CNA's side and its selection is two independent numbers.
    const editing = [];
    const editingSubscription = CnaTextInput.OnEditing((value) => editing.push(value));
    try {
      CnaTextInput.ForTests.RaiseEditing("にほんご", 2, 1);
      CnaTextInput.ForTests.RaiseEditing("", 0, 0);
    } finally {
      editingSubscription.Dispose();
    }
    this.evidence.editing = editing.map((value) => ({
      text: value.Text, start: value.Start, length: value.Length,
    }));

    // Candidate lists, which is the part of an IME a game has to draw itself.
    const candidates = [];
    const candidateSubscription = CnaTextInput.OnCandidates((value) => candidates.push(value));
    try {
      CnaTextInput.ForTests.RaiseCandidates(["日本語", "にほんご", "ニホンゴ"], 1, true);
      CnaTextInput.ForTests.RaiseCandidates([], -1, false);
    } finally {
      candidateSubscription.Dispose();
    }
    this.evidence.candidates = candidates.map((value) => ({
      list: [...value.Candidates], selected: value.Selected, horizontal: value.IsHorizontal,
    }));

    // An exception out of a handler must not unwind into compiled C. The raise must return and the
    // next one must still be delivered.
    const survived = [];
    const throwing = CnaTextInput.OnCharacter(() => { throw new Error("handler failure"); });
    const following = CnaTextInput.OnCharacter((character) => survived.push(character));
    try {
      CnaTextInput.ForTests.RaiseCharacter(0x0042);
      this.evidence.raiseAfterThrow = "returned";
    } catch (error) {
      this.evidence.raiseAfterThrow = error.constructor.name;
    } finally {
      throwing.Dispose();
      following.Dispose();
    }
    this.evidence.survivedHandler = [...survived];

    CnaTextInput.Stop();
    CnaTextInput.ForTests.Reset();

    // The cursor family. A stock cursor is an owned handle; applying it and disposing it twice are
    // both real operations on this platform even where no window shows one.
    const cursor = MouseCursor.GetStock(MouseCursorStock.Hand);
    try {
      cursor.Apply();
      this.evidence.cursorApplied = "SUCCESS";
    } catch (error) {
      this.evidence.cursorApplied = `result ${error.cnaResult ?? error.constructor.name}`;
    }
    cursor.Dispose();
    cursor.Dispose();
    this.evidence.cursorDisposed = cursor.IsDisposed;
    try {
      cursor.Apply();
      this.evidence.cursorAfterDispose = "accepted";
    } catch (error) {
      this.evidence.cursorAfterDispose = error.constructor.name;
    }

    // A cursor built from a texture copies the image, so the texture can go first.
    const texture = new Graphics.Texture2D(this.GraphicsDevice, 2, 2);
    texture.SetData([Color.Red, Color.Green, Color.Blue, Color.White]);
    try {
      const built = inputModule.MouseCursor.FromTexture2D(texture, 1, 1);
      built.Dispose();
      this.evidence.textureCursor = "SUCCESS";
    } catch (error) {
      this.evidence.textureCursor = `result ${error.cnaResult ?? error.constructor.name}`;
    } finally {
      texture.Dispose();
    }
    super.LoadContent();
  }

  Draw(gameTime) {
    this.GraphicsDevice.Clear(Color.CornflowerBlue);
    this.Exit();
    super.Draw(gameTime);
  }
}

test("typed text and IME composition reach the extension, non-ASCII included", async () => {
  const game = new TextInputProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // Start, Stop, the typed start and the input rectangle all succeed. Whether text input becomes
  // *active* is a different question and this platform answers it honestly: HEADLESS has no window
  // to start input on, so IsActive stays false throughout. That is measured rather than assumed --
  // the first version of this test expected true and was wrong -- and it is reported as the
  // platform's answer rather than papered over, exactly as the GameWindow families are.
  for (const name of ["start", "stop", "typedStart", "rectangle"]) {
    assert.equal(evidence[name], "SUCCESS", `${name} was refused`);
  }
  assert.equal(evidence.activeBefore, false);
  assert.equal(evidence.activeAfterStart, false, "no window on HEADLESS: input cannot become active");
  assert.equal(evidence.activeAfterStop, false);
  assert.equal(evidence.activeAfterTypedStart, false);
  assert.equal(evidence.screenKeyboard, false, "no window, so no software keyboard");

  // Every committed character arrives as exactly one UTF-16 code unit -- which for the emoji means
  // two calls, a high surrogate and a low one. That is what the platform sends, and the caller's
  // accumulator is what rejoins them; this package does not reassemble on the caller's behalf.
  assert.deepEqual(
    evidence.typedUnits, ["a", "é", "漢", "字", "\ud83d", "\ude00"],
    "one code unit per event, surrogates delivered separately",
  );
  assert.equal(evidence.typedJoined, "aé漢字😀", "appending the units rebuilds the text exactly");
  // The Latin letter with a diacritic is one code unit and the emoji is two, which is the whole
  // reason this is asserted in units rather than in characters.
  assert.equal(evidence.typedUnits.length, 6);
  assert.equal([...evidence.typedJoined].length, 5, "five characters from six code units");

  assert.equal(evidence.charactersDisposed, true);
  assert.equal(evidence.afterUnsubscribe, 0, "a disposed subscription receives nothing further");

  // Composition text is UTF-8 across the boundary and its selection is two independent numbers.
  assert.deepEqual(evidence.editing, [
    { text: "にほんご", start: 2, length: 1 },
    { text: "", start: 0, length: 0 },
  ]);

  // Candidate lists, in order, with the selection and the orientation kept apart from them.
  assert.deepEqual(evidence.candidates, [
    { list: ["日本語", "にほんご", "ニホンゴ"], selected: 1, horizontal: true },
    { list: [], selected: -1, horizontal: false },
  ]);

  // A throwing handler must not unwind into compiled C, and must not stop the next subscriber.
  assert.equal(evidence.raiseAfterThrow, "returned", "a handler exception is contained at the boundary");
  assert.deepEqual(evidence.survivedHandler, ["B"], "a later handler still runs");

  // The cursor family. Whether this platform shows one is its business; the ownership is not.
  assert.ok(
    evidence.cursorApplied === "SUCCESS" || /^result /.test(evidence.cursorApplied),
    `unexpected cursor evidence ${evidence.cursorApplied}`,
  );
  assert.equal(evidence.cursorDisposed, true);
  assert.equal(evidence.cursorAfterDispose, "ObjectDisposedException");
  assert.ok(
    evidence.textureCursor === "SUCCESS" || /^result /.test(evidence.textureCursor),
    `unexpected texture-cursor evidence ${evidence.textureCursor}`,
  );
});

class ExtendedSensorProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const { CnaSensorTestHooks, Compass, Gyroscope, Motion, SensorState } = sensorsModule;
    const record = (name, body) => {
      try {
        this.evidence[name] = body();
      } catch (error) {
        this.evidence[name] = `${error.constructor.name}`;
      }
    };

    // ---- absence, first. This host has none of these three, and every one must say so ----------
    const compass = new Compass();
    const gyroscope = new Gyroscope();
    const motion = new Motion();
    this.evidence.absent = {
      compassState: compass.State,
      compassValid: compass.IsDataValid,
      gyroscopeState: gyroscope.State,
      gyroscopeValid: gyroscope.IsDataValid,
      motionState: motion.State,
      motionValid: motion.IsDataValid,
      // CNA's canonical default, before any backend exists to answer for it.
      motionNorth: motion.IsAttitudeNorthReferenced,
    };
    record("compassValueWhenAbsent", () => { compass.CurrentValue; return "returned a reading"; });
    record("gyroscopeValueWhenAbsent", () => { gyroscope.CurrentValue; return "returned a reading"; });
    record("motionValueWhenAbsent", () => { motion.CurrentValue; return "returned a reading"; });

    // ---- the data path, through CNA's own injection hooks --------------------------------------
    // Every component gets a value no other component has, so a transposed or substituted field is
    // visible. This is injection evidence: nothing physical was measured.
    CnaSensorTestHooks.SetCompassBackend(compass, true, true);
    compass.Start();
    const compassTimestamp = 638_000_000_000_000_000n;
    CnaSensorTestHooks.InjectCompassReading(compass, {
      HeadingAccuracy: 2.5,
      MagneticHeading: 91.25,
      TrueHeading: 88.75,
      MagnetometerReading: new Vector3(11.5, -22.25, 33.125),
      TimestampTicks: compassTimestamp,
      TimestampOffset: TimeSpan.FromTicks(36_000_000_000n),
    });
    record("compassAfterInjection", () => {
      const reading = compass.CurrentValue;
      return {
        state: compass.State,
        valid: compass.IsDataValid,
        headingAccuracy: reading.HeadingAccuracy,
        magneticHeading: reading.MagneticHeading,
        trueHeading: reading.TrueHeading,
        magnetometer: [
          reading.MagnetometerReading.X,
          reading.MagnetometerReading.Y,
          reading.MagnetometerReading.Z,
        ],
        timestampTicks: String(reading.TimestampTicks),
        offsetTicks: String(reading.TimestampOffset.Ticks),
      };
    });

    // The gyroscope is the exception, and it is measured rather than assumed. CNA gives the
    // compass and the motion sensor a full synthetic *backend*; the gyroscope gets only a support
    // override, so starting it still needs a real platform sensor service and this host has none.
    // The injection call is accepted but produces no valid data, which is the honest outcome.
    CnaSensorTestHooks.SetGyroscopeSupported(gyroscope, true);
    this.evidence.gyroscopeStateAfterSupportOverride = gyroscope.State;
    record("gyroscopeStart", () => { gyroscope.Start(); return "SUCCESS"; });
    record("gyroscopeInject", () => {
      CnaSensorTestHooks.InjectGyroscopeReading(gyroscope, new Vector3(0.25, -0.5, 0.75));
      return "accepted";
    });
    this.evidence.gyroscopeValidAfterInjection = gyroscope.IsDataValid;
    record("gyroscopeValueAfterInjection", () => {
      gyroscope.CurrentValue;
      return "returned a reading";
    });

    // Installed *without* a north reference first, so the flag is proved to be read rather than
    // defaulted: a game drawing a compass rose branches on this, and a getter that always agreed
    // with CNA's default would pass a one-sided check.
    CnaSensorTestHooks.SetMotionBackend(motion, true, true, false);
    this.evidence.motionNorthWhenNotReferenced = motion.IsAttitudeNorthReferenced;
    CnaSensorTestHooks.SetMotionBackend(motion, true, true, true);
    this.evidence.motionNorthWhenReferenced = motion.IsAttitudeNorthReferenced;
    motion.Start();
    const motionTimestamp = 638_000_000_000_000_001n;
    CnaSensorTestHooks.InjectMotionReading(motion, {
      Attitude: {
        Pitch: 0.125, Roll: -0.25, Yaw: 1.5,
        Quaternion: new Quaternion(0.1, 0.2, 0.3, 0.4),
        // Sixteen distinguishable values, so a transposed or shifted matrix read fails.
        RotationMatrix: new Matrix(
          1, 2, 3, 4,
          5, 6, 7, 8,
          9, 10, 11, 12,
          13, 14, 15, 16,
        ),
        TimestampTicks: motionTimestamp,
        TimestampOffset: TimeSpan.FromTicks(36_000_000_000n),
      },
      DeviceAcceleration: new Vector3(1.5, 2.5, 3.5),
      DeviceRotationRate: new Vector3(-1.25, -2.25, -3.25),
      Gravity: new Vector3(0, -9.80665, 0),
      TimestampTicks: motionTimestamp,
      TimestampOffset: TimeSpan.FromTicks(36_000_000_000n),
    });
    record("motionAfterInjection", () => {
      const reading = motion.CurrentValue;
      return {
        state: motion.State,
        valid: motion.IsDataValid,
        northReferenced: motion.IsAttitudeNorthReferenced,
        pitch: reading.Attitude.Pitch,
        roll: reading.Attitude.Roll,
        yaw: reading.Attitude.Yaw,
        quaternion: [
          reading.Attitude.Quaternion.X, reading.Attitude.Quaternion.Y,
          reading.Attitude.Quaternion.Z, reading.Attitude.Quaternion.W,
        ],
        matrixDiagonal: [
          reading.Attitude.RotationMatrix.M11, reading.Attitude.RotationMatrix.M22,
          reading.Attitude.RotationMatrix.M33, reading.Attitude.RotationMatrix.M44,
        ],
        matrixFirstRow: [
          reading.Attitude.RotationMatrix.M11, reading.Attitude.RotationMatrix.M12,
          reading.Attitude.RotationMatrix.M13, reading.Attitude.RotationMatrix.M14,
        ],
        acceleration: [
          reading.DeviceAcceleration.X, reading.DeviceAcceleration.Y, reading.DeviceAcceleration.Z,
        ],
        rotationRate: [
          reading.DeviceRotationRate.X, reading.DeviceRotationRate.Y, reading.DeviceRotationRate.Z,
        ],
        gravity: [reading.Gravity.X, reading.Gravity.Y, reading.Gravity.Z],
        timestampTicks: String(reading.TimestampTicks),
      };
    });

    // The interval is a request, read back rather than assumed.
    compass.TimeBetweenUpdates = TimeSpan.FromTicks(200_000n);
    this.evidence.compassInterval = String(compass.TimeBetweenUpdates.Ticks);

    // A backend cannot be swapped underneath a running acquisition: CNA refuses, which is the
    // right answer -- a reading whose source changed mid-stream would be neither the old sensor's
    // nor the new one's.
    record("motionBackendSwapWhileStarted", () => {
      CnaSensorTestHooks.SetMotionBackend(motion, false, false, false);
      return "accepted";
    });
    // Stopped, the swap is allowed -- and removing the synthetic backend must take the readings
    // with it. A sensor that kept answering after its source was withdrawn would be reporting a
    // stale measurement as a current one.
    motion.Stop();
    this.evidence.motionStateAfterStop = motion.State;
    CnaSensorTestHooks.SetMotionBackend(motion, false, false, false);
    this.evidence.motionAfterRemoval = {
      state: motion.State,
      isDataValid: motion.IsDataValid,
    };
    record("motionValueAfterRemoval", () => { motion.CurrentValue; return "returned a reading"; });

    compass.Stop();
    for (const sensor of [compass, gyroscope, motion]) {
      sensor.Dispose();
      sensor.Dispose();
    }
    this.evidence.disposed = [compass.IsDisposed, gyroscope.IsDisposed, motion.IsDisposed];
    record("compassAfterDispose", () => { compass.State; return "answered"; });
    this.evidence.states = { NotSupported: SensorState.NotSupported, Ready: SensorState.Ready };
    super.LoadContent();
  }

  Draw(gameTime) {
    this.GraphicsDevice.Clear(Color.CornflowerBlue);
    this.Exit();
    super.Draw(gameTime);
  }
}

test("the compass, gyroscope and motion sensor report absence, then carry a real reading", async () => {
  const game = new ExtendedSensorProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // Absence first. A heading of zero and a rotation rate of zero are both perfectly plausible
  // measurements, so returning them for "no sensor" would be indistinguishable from a real one.
  assert.equal(evidence.absent.compassState, evidence.states.NotSupported);
  assert.equal(evidence.absent.gyroscopeState, evidence.states.NotSupported);
  assert.equal(evidence.absent.motionState, evidence.states.NotSupported);
  assert.deepEqual(
    [evidence.absent.compassValid, evidence.absent.gyroscopeValid, evidence.absent.motionValid],
    [false, false, false],
  );
  // CNA's documented default for an attitude with no backend behind it is north-referenced; what
  // matters is that the flag follows the backend rather than staying at that default, which the
  // two assertions further down establish.
  assert.equal(evidence.absent.motionNorth, true, "CNA's default before any backend exists");
  assert.equal(evidence.compassValueWhenAbsent, "InvalidOperationException");
  assert.equal(evidence.gyroscopeValueWhenAbsent, "InvalidOperationException");
  assert.equal(evidence.motionValueWhenAbsent, "InvalidOperationException");

  // The data path, through CNA's own injection hooks. This is injection evidence: no physical
  // compass, gyroscope or motion sensor exists on this host and none was measured.
  const compass = evidence.compassAfterInjection;
  assert.equal(typeof compass, "object", `compass injection failed: ${compass}`);
  assert.equal(compass.state, evidence.states.Ready);
  assert.equal(compass.valid, true);
  // Three headings with three different values. The two headings are separate measurements --
  // magnetic and true north differ by the local declination -- so a reader that returned one for
  // both would fail here rather than round-trip.
  assert.equal(compass.headingAccuracy, 2.5);
  assert.equal(compass.magneticHeading, 91.25);
  assert.equal(compass.trueHeading, 88.75);
  assert.deepEqual(compass.magnetometer, [11.5, -22.25, 33.125]);
  // A timestamp is 100-nanosecond ticks since year one and does not survive a double, so it
  // crosses as a bigint. This exact value would be wrong by hundreds of ticks through a Number.
  assert.equal(compass.timestampTicks, "638000000000000000");
  assert.equal(compass.offsetTicks, "36000000000");

  // The gyroscope's data path is *not* reachable on this host, and that is recorded rather than
  // worked around. CNA gives the compass and the motion sensor a full synthetic backend through
  // cna_compass_set_test_backend_ext and cna_motion_set_test_backend_ext; the gyroscope has only
  // cna_gyroscope_set_supported_for_tests_ext, which flips the support answer without installing
  // anything to read. So Start still needs a platform sensor service, HEADLESS has none, and the
  // injection is accepted while producing nothing valid. Asserting a reading here would mean
  // asserting something that did not happen.
  assert.equal(
    evidence.gyroscopeStateAfterSupportOverride, evidence.states.NotSupported,
    "a support override alone does not make the sensor readable",
  );
  assert.equal(evidence.gyroscopeStart, "Error", "no sensor service: starting is refused");
  assert.equal(evidence.gyroscopeInject, "accepted", "the injection route itself works");
  assert.equal(
    evidence.gyroscopeValidAfterInjection, false,
    "an injection with no backend behind it produces no valid reading",
  );
  assert.equal(evidence.gyroscopeValueAfterInjection, "InvalidOperationException");

  const motion = evidence.motionAfterInjection;
  assert.equal(typeof motion, "object", `motion injection failed: ${motion}`);
  assert.equal(motion.state, evidence.states.Ready);
  assert.equal(motion.valid, true);
  assert.equal(motion.northReferenced, true, "the synthetic backend was installed north-referenced");
  // Both directions, which is what proves the flag is read from the backend rather than defaulted.
  assert.equal(evidence.motionNorthWhenNotReferenced, false);
  assert.equal(evidence.motionNorthWhenReferenced, true);
  assert.deepEqual([motion.pitch, motion.roll, motion.yaw], [0.125, -0.25, 1.5]);
  assert.deepEqual(motion.quaternion, [0.1, 0.2, 0.3, 0.4].map((v) => Math.fround(v)));
  // The matrix is sixteen distinguishable values, so a transposed read is caught: the first row
  // is 1..4 and the diagonal is 1, 6, 11, 16.
  assert.deepEqual(motion.matrixFirstRow, [1, 2, 3, 4]);
  assert.deepEqual(motion.matrixDiagonal, [1, 6, 11, 16]);
  // Three vectors with disjoint value sets: acceleration positive, rotation rate negative, gravity
  // a single physical constant on one axis. Substituting any for any other fails.
  assert.deepEqual(motion.acceleration, [1.5, 2.5, 3.5]);
  assert.deepEqual(motion.rotationRate, [-1.25, -2.25, -3.25]);
  assert.deepEqual(motion.gravity, [0, Math.fround(-9.80665), 0]);
  assert.equal(motion.timestampTicks, "638000000000000001");

  assert.equal(evidence.compassInterval, "200000", "the interval request is read back");
  assert.equal(
    evidence.motionBackendSwapWhileStarted, "Error",
    "a backend cannot be swapped underneath a running acquisition",
  );
  // What withdrawing a backend actually does, measured rather than assumed -- and the three parts
  // do not agree with each other. Stopping moves the state to Disabled; removing the backend
  // leaves the state there and leaves IsDataValid reporting true; but reading the value refuses
  // with "the sensor is not supported on this device". So a caller that trusted IsDataValid would
  // be told there is a reading and then refused it. That disagreement is recorded in
  // docs/upstream-cna-findings.md, and this assertion is what notices if CNA changes it.
  assert.equal(evidence.motionStateAfterStop, 5, "SensorState.Disabled");
  assert.equal(evidence.motionAfterRemoval.state, 5, "removal leaves the state where Stop put it");
  assert.equal(evidence.motionAfterRemoval.isDataValid, true, "IsDataValid still says yes");
  assert.equal(
    evidence.motionValueAfterRemoval, "Error",
    "...while the value itself refuses: the two disagree, which is the upstream observation",
  );
  assert.deepEqual(evidence.disposed, [true, true, true]);
  assert.equal(evidence.compassAfterDispose, "ObjectDisposedException");
});

class GraphicsAdapterProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const { GraphicsAdapter, GraphicsProfile, SurfaceFormat, DepthFormat } = Graphics;
    const record = (name, body) => {
      try {
        this.evidence[name] = body();
      } catch (error) {
        this.evidence[name] = `${error.constructor.name}: ${(error.message ?? "").slice(0, 80)}`;
      }
    };

    // The adapter list is read here rather than at device creation, because CNA permits borrowing
    // the device handle only inside a lifecycle callback. That is the whole reason the projection
    // is lazy, and this is where a game would ask anyway.
    record("count", () => GraphicsAdapter.Adapters.length);
    record("adapter", () => {
      const adapter = GraphicsAdapter.DefaultAdapter;
      return {
        description: adapter.Description,
        deviceName: adapter.DeviceName,
        vendorId: adapter.VendorId,
        deviceId: adapter.DeviceId,
        revision: adapter.Revision,
        subSystemId: adapter.SubSystemId,
        isDefault: adapter.IsDefaultAdapter,
        monitorHandleIsBigInt: typeof adapter.MonitorHandle === "bigint",
      };
    });
    record("currentMode", () => {
      const mode = GraphicsAdapter.DefaultAdapter.CurrentDisplayMode;
      return {
        width: mode.Width,
        height: mode.Height,
        format: mode.Format,
        aspectRatio: mode.AspectRatio,
      };
    });
    record("supportedModes", () => {
      const modes = [...GraphicsAdapter.DefaultAdapter.SupportedDisplayModes];
      return {
        count: modes.length,
        first: modes.length > 0
          ? { width: modes[0].Width, height: modes[0].Height, format: modes[0].Format }
          : null,
      };
    });
    record("profiles", () => ({
      reach: GraphicsAdapter.DefaultAdapter.IsProfileSupported(GraphicsProfile.Reach),
      hiDef: GraphicsAdapter.DefaultAdapter.IsProfileSupported(GraphicsProfile.HiDef),
    }));
    record("backBufferQuery", () => {
      const result = GraphicsAdapter.DefaultAdapter.QueryBackBufferFormat(
        GraphicsProfile.HiDef, SurfaceFormat.Color, DepthFormat.Depth24, 0,
      );
      return { ...result };
    });
    record("renderTargetQuery", () => {
      const result = GraphicsAdapter.DefaultAdapter.QueryRenderTargetFormat(
        GraphicsProfile.HiDef, SurfaceFormat.Color, DepthFormat.Depth24Stencil8, 0,
      );
      return { ...result };
    });
    // The device's own adapter must be the same object the static list hands out, not a copy.
    record("deviceAdapterIsDefault", () =>
      this.GraphicsDevice.Adapter === GraphicsAdapter.DefaultAdapter);
    // Asking twice must give the same objects: the list is read once and cached, so a caller
    // holding an adapter is not holding one of several.
    record("stableIdentity", () =>
      GraphicsAdapter.Adapters[0] === GraphicsAdapter.Adapters[0] &&
      GraphicsAdapter.DefaultAdapter === GraphicsAdapter.DefaultAdapter);
    // The two format routes must be *different* routes. Reach + Single is a case where they
    // genuinely disagree: a single-channel float is not a legal back buffer, so that query refuses
    // and falls back to Color, while the same format is a perfectly good render target and that
    // query accepts it exactly. A projection that called one route for both would return the same
    // answer twice and fail here -- which an earlier version of this test did not catch, because
    // it compared two triples that happen to agree.
    record("divergentQueries", () => {
      const adapter = GraphicsAdapter.DefaultAdapter;
      const backBuffer = adapter.QueryBackBufferFormat(
        GraphicsProfile.Reach, SurfaceFormat.Single, DepthFormat.None, 0,
      );
      const renderTarget = adapter.QueryRenderTargetFormat(
        GraphicsProfile.Reach, SurfaceFormat.Single, DepthFormat.None, 0,
      );
      return {
        backBuffer: { success: backBuffer.Success, format: backBuffer.Format },
        renderTarget: { success: renderTarget.Success, format: renderTarget.Format },
      };
    });
    // A format the renderer will not give exactly must report so rather than claiming success.
    record("impossibleQuery", () => {
      const result = GraphicsAdapter.DefaultAdapter.QueryBackBufferFormat(
        GraphicsProfile.Reach, SurfaceFormat.Color, DepthFormat.Depth24Stencil8, 64,
      );
      return { success: result.Success, samples: result.MultiSampleCount };
    });
    super.LoadContent();
  }

  Draw(gameTime) {
    this.GraphicsDevice.Clear(Color.CornflowerBlue);
    this.Exit();
    super.Draw(gameTime);
  }
}

test("GraphicsAdapter reports CNA's real adapter, its modes and its format answers", async () => {
  const game = new GraphicsAdapterProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // This is the strict XNA type that was projected structurally and could not be filled until CNA's
  // fourteen adapter routes were bound. It is filled now, on this renderer and on a windowed one.
  assert.equal(evidence.count, 1, `expected one adapter, saw ${JSON.stringify(evidence.count)}`);

  const adapter = evidence.adapter;
  assert.equal(typeof adapter, "object", `adapter read failed: ${adapter}`);
  // These are CNA's canonical adapter identity rather than a probe of the physical GPU -- the same
  // values appear on HEADLESS and on OPENGLES3, which is measured rather than assumed. They are
  // asserted because they are what a consumer receives, not because they describe this machine.
  assert.equal(adapter.description, "Default Display");
  assert.equal(adapter.deviceName, "\\\\.\\DISPLAY1", "XNA's canonical primary display name");
  assert.equal(adapter.isDefault, true);
  assert.equal(typeof adapter.vendorId, "number");
  assert.equal(typeof adapter.deviceId, "number");
  assert.ok(adapter.vendorId !== 0 || adapter.deviceId !== 0, "an adapter has some identity");
  // Four separate integer fields, so a projection reading one for another would show here.
  assert.notEqual(adapter.vendorId, adapter.deviceId);
  assert.equal(typeof adapter.revision, "number");
  assert.equal(typeof adapter.subSystemId, "number");
  // XNA's MonitorHandle is an IntPtr; a renderer with no native monitor answers zero rather than
  // failing the whole adapter, and it must still cross as a bigint.
  assert.equal(adapter.monitorHandleIsBigInt, true);

  // The current mode, and the aspect ratio CNA derives from it rather than one computed here.
  const mode = evidence.currentMode;
  assert.equal(typeof mode, "object", `current mode failed: ${mode}`);
  assert.ok(mode.width > 0 && mode.height > 0, `implausible mode ${mode.width}x${mode.height}`);
  assert.equal(mode.format, Graphics.SurfaceFormat.Color);
  assert.ok(
    Math.abs(mode.aspectRatio - mode.width / mode.height) < 1e-5,
    `aspect ratio ${mode.aspectRatio} does not match ${mode.width}x${mode.height}`,
  );

  // The supported-mode list is a real list from CNA, and its first entry is a real mode.
  const modes = evidence.supportedModes;
  assert.equal(typeof modes, "object", `supported modes failed: ${modes}`);
  assert.ok(modes.count >= 1, "an adapter supports at least one mode");
  assert.ok(modes.first.width > 0 && modes.first.height > 0);

  // Both XNA profiles, answered by CNA rather than assumed. Reach is the subset of HiDef, so a
  // renderer supporting HiDef must support Reach; the converse is not required.
  const profiles = evidence.profiles;
  assert.equal(typeof profiles, "object", `profile query failed: ${profiles}`);
  assert.equal(typeof profiles.reach, "boolean");
  assert.equal(typeof profiles.hiDef, "boolean");
  if (profiles.hiDef) assert.equal(profiles.reach, true, "HiDef implies Reach");

  // The two format queries are separate routes and must answer separately: a back-buffer query and
  // a render-target query for the same triple are different questions.
  for (const name of ["backBufferQuery", "renderTargetQuery"]) {
    const query = evidence[name];
    assert.equal(typeof query, "object", `${name} failed: ${query}`);
    assert.equal(typeof query.Success, "boolean");
    assert.equal(query.Format, Graphics.SurfaceFormat.Color, `${name} kept the requested format`);
    assert.equal(typeof query.MultiSampleCount, "number");
  }

  // A 64-sample back buffer is not something any of these renderers gives exactly, so the query
  // must report an inexact match and a sample count it can actually provide. A projection that
  // always answered Success would pass every assertion above and fail this one.
  const impossible = evidence.impossibleQuery;
  assert.equal(typeof impossible, "object", `impossible query failed: ${impossible}`);
  assert.equal(impossible.success, false, "64x multisampling is not an exact match anywhere here");
  assert.ok(
    impossible.samples < 64,
    `CNA must answer with a count it can provide, not the 64 it was asked for (got ${impossible.samples})`,
  );

  // The two format queries are separate CNA routes, and here they must give separate answers.
  const divergent = evidence.divergentQueries;
  assert.equal(typeof divergent, "object", `divergent query failed: ${divergent}`);
  assert.equal(
    divergent.backBuffer.success, false,
    "SurfaceFormat.Single is not a legal Reach back buffer",
  );
  assert.equal(
    divergent.backBuffer.format, Graphics.SurfaceFormat.Color,
    "and the back-buffer query falls back to Color",
  );
  assert.equal(
    divergent.renderTarget.success, true,
    "...while the same format is a perfectly good render target",
  );
  assert.equal(divergent.renderTarget.format, Graphics.SurfaceFormat.Single);

  assert.equal(evidence.deviceAdapterIsDefault, true, "GraphicsDevice.Adapter is the default one");
  assert.equal(evidence.stableIdentity, true, "the adapter list is read once, not per access");
});


class ComputeProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const device = this.GraphicsDevice;
    const record = (name, body) => {
      try {
        this.evidence[name] = body();
      } catch (error) {
        this.evidence[name] = { refused: `${error.constructor.name}`, cnaResult: error.cnaResult };
      }
    };

    record("computeSupported", () => computeExtensions.GraphicsDeviceCapabilities.Supports(
      device, computeExtensions.GraphicsCapability.ComputeShaders,
    ));
    // Every capability, so the query is shown answering per capability here too. HEADLESS is the
    // interesting case: it is not a "nothing works" renderer, so the answers differ from each other.
    record("capabilities", () => Object.entries(computeExtensions.GraphicsCapability)
      .filter(([, bit]) => typeof bit === "number")
      .map(([name, bit]) => [
        name, bit, computeExtensions.GraphicsDeviceCapabilities.Supports(device, bit),
      ]));
    record("limits", () => [0, 1, 2].map((axis) => [
      computeExtensions.GraphicsDeviceCapabilities.MaxComputeWorkGroupCount(device, axis),
      computeExtensions.GraphicsDeviceCapabilities.MaxComputeWorkGroupSize(device, axis),
    ]));
    record("invocations",
      () => computeExtensions.GraphicsDeviceCapabilities.MaxComputeWorkGroupInvocations(device));

    // The three creates, each recorded with the result CNA refused with rather than a boolean.
    record("storageBuffer", () => {
      const buffer = computeExtensions.StorageBuffer.CreateTyped(device, 64, 4);
      buffer.Dispose();
      return "CREATED";
    });
    record("untypedStorageBuffer", () => {
      const buffer = computeExtensions.StorageBuffer.Create(device, 256);
      buffer.Dispose();
      return "CREATED";
    });
    record("computeShader", () => {
      const shader = new computeExtensions.ComputeShader(
        device, "#version 310 es\nlayout(local_size_x=1) in;\nvoid main() {}\n",
      );
      shader.Dispose();
      return "CREATED";
    });

    // A GPU timer is the one member of the family that creates on a renderer without the feature,
    // because CNA reports the absence through the object rather than by refusing.
    record("gpuTimer", () => {
      const timer = new computeExtensions.GpuTimer(device);
      try {
        return {
          supported: timer.IsSupported,
          reason: timer.UnsupportedReason,
          open: timer.IsOpen,
          samples: timer.SampleCount,
        };
      } finally {
        timer.Dispose();
      }
    });

    // Argument validation is this package's, so it holds on a renderer that has none of this.
    record("rejectedArguments", () => {
      const attempts = {};
      const attempt = (name, body) => {
        try {
          body();
          attempts[name] = "ACCEPTED";
        } catch (error) {
          attempts[name] = error.constructor.name;
        }
      };
      attempt("negativeSize", () => computeExtensions.StorageBuffer.Create(device, -1));
      attempt("fractionalCount",
        () => computeExtensions.StorageBuffer.CreateTyped(device, 1.5, 4));
      attempt("zeroElementSize",
        () => computeExtensions.StorageBuffer.CreateTyped(device, 4, 0));
      attempt("emptySource", () => new computeExtensions.ComputeShader(device, ""));
      attempt("badAxis",
        () => computeExtensions.GraphicsDeviceCapabilities.MaxComputeWorkGroupSize(device, 3));
      attempt("badCapability",
        () => computeExtensions.GraphicsDeviceCapabilities.Supports(device, 99));
      return attempts;
    });

    this.Exit();
    super.LoadContent();
  }
}

test("compute is refused by name on a renderer without it, and the timer says why", async () => {
  const game = new ComputeProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // HEADLESS has no compute. That is the answer being asserted, not worked around: the qualified
  // computation itself lives in test/windowed-renderer.integration.mjs, which runs on OPENGLES3.
  assert.equal(evidence.computeSupported, false, "HEADLESS reports no compute shaders");

  // The capability query is not a constant here either: HEADLESS implements some of the nineteen
  // and not others, so the answers must differ from each other.
  const answers = evidence.capabilities;
  assert.equal(answers.length, 19);
  const trueCount = answers.filter(([, , supported]) => supported).length;
  assert.ok(
    trueCount > 0 && trueCount < 19,
    `HEADLESS must answer per capability, got ${trueCount}/19 true`,
  );
  assert.equal(
    answers.find(([name]) => name === "ComputeShaders")?.[2], false,
    "and the compute answer is the one the enum names",
  );

  // Zero limits are the *correct* answer for a device with no compute -- CNA's own test asserts
  // exactly this agreement. On OPENGLES3 the same zeros after a draw are a defect, which is why
  // the windowed suite asserts them separately.
  assert.deepEqual(evidence.limits, [[0, 0], [0, 0], [0, 0]], "no compute means no work groups");
  assert.equal(evidence.invocations, 0);

  // The three creates refuse with NOT_SUPPORTED (6) rather than handing back a handle that would
  // fail later, or an object that pretends.
  for (const name of ["storageBuffer", "untypedStorageBuffer", "computeShader"]) {
    assert.equal(
      evidence[name]?.cnaResult, 6,
      `${name} must refuse with NOT_SUPPORTED, got ${JSON.stringify(evidence[name])}`,
    );
  }

  // The timer is the exception, and the reason is CNA's own words rather than a label invented
  // here: it names the GL extension the renderer is missing.
  const timer = evidence.gpuTimer;
  assert.equal(typeof timer, "object", `GPU timer create failed: ${JSON.stringify(timer)}`);
  assert.equal(timer.supported, false, "HEADLESS cannot time GPU work");
  assert.ok(timer.reason.length > 20, `an unsupported timer explains itself: ${timer.reason}`);
  assert.match(
    timer.reason, /HEADLESS/,
    "and the explanation names the renderer that cannot do it",
  );
  assert.equal(timer.open, false);
  assert.equal(timer.samples, 0, "a timer that never ran has no samples");

  // This package's own argument validation, which holds regardless of the renderer.
  assert.deepEqual(evidence.rejectedArguments, {
    negativeSize: "RangeError",
    fractionalCount: "RangeError",
    zeroElementSize: "RangeError",
    emptySource: "TypeError",
    badAxis: "RangeError",
    badCapability: "RangeError",
  });

  console.log(
    `CNA_TS_NATIVE_COMPUTE=PASS COMPUTE=NOT_SUPPORTED CAPABILITIES=${trueCount}/19 ` +
    `CREATES_REFUSED=3 GPU_TIMER_REASON="${timer.reason.slice(0, 48)}..."`,
  );
});


class ClusteredLightingProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const device = this.GraphicsDevice;
    const {
      ClusterGrid, ClusteredLightAssignment, ClusteredLightSet, ClusteredLightType,
      ClusteredShadowPolicy,
    } = computeExtensions;
    const record = (name, body) => {
      try {
        this.evidence[name] = body();
      } catch (error) {
        this.evidence[name] = { refused: error.constructor.name, message: error.message };
      }
    };

    const projection = Matrix.CreatePerspectiveFieldOfView(Math.PI / 3, 4 / 3, 0.1, 100);
    const grid = new ClusterGrid(device, 4, 2, 8);
    const set = new ClusteredLightSet(device);
    const assignment = new ClusteredLightAssignment(device);
    const policy = new ClusteredShadowPolicy(device, 1);
    try {
      record("grid", () => {
        const before = grid.HasProjection;
        grid.SetProjection(projection, 0.1, 100);
        // Every cluster's flat index, so the whole mapping is checked rather than a sample.
        const indices = [];
        for (let slice = 0; slice < grid.SliceCount; slice += 1) {
          for (let y = 0; y < grid.TilesY; y += 1) {
            for (let x = 0; x < grid.TilesX; x += 1) indices.push(grid.ClusterIndex(x, y, slice));
          }
        }
        const inverse = grid.InverseProjection;
        const roundTrip = Matrix.Multiply(projection, inverse);
        return {
          tilesX: grid.TilesX,
          tilesY: grid.TilesY,
          sliceCount: grid.SliceCount,
          clusterCount: grid.ClusterCount,
          hasProjectionBefore: before,
          hasProjectionAfter: grid.HasProjection,
          nearPlane: grid.NearPlane,
          farPlane: grid.FarPlane,
          indices,
          sliceDistances: Array.from({ length: grid.SliceCount + 1 }, (_, s) => grid.SliceDistance(s)),
          // For each slice, a distance just inside it: the two routes must agree.
          sliceForDistance: Array.from({ length: grid.SliceCount }, (_, s) => {
            const low = grid.SliceDistance(s);
            const high = grid.SliceDistance(s + 1);
            return grid.SliceForViewDistance(low + (high - low) * 0.5);
          }),
          roundTrip: [
            roundTrip.M11, roundTrip.M12, roundTrip.M13, roundTrip.M14,
            roundTrip.M21, roundTrip.M22, roundTrip.M23, roundTrip.M24,
            roundTrip.M31, roundTrip.M32, roundTrip.M33, roundTrip.M34,
            roundTrip.M41, roundTrip.M42, roundTrip.M43, roundTrip.M44,
          ],
          bounds: (() => {
            const box = grid.ClusterBounds(1, 1, 2);
            return { min: [box.Min.X, box.Min.Y, box.Min.Z], max: [box.Max.X, box.Max.Y, box.Max.Z] };
          })(),
        };
      });

      record("lights", () => {
        // Three lights with three different everything, so a field read from the wrong light or
        // written into the wrong slot changes a value rather than matching by luck.
        const first = set.AddPoint(new Vector3(0, 0, -5), new Vector3(1, 0.5, 0.25), 2, 3, true);
        const second = set.AddSpot(
          new Vector3(2, 0, -10), new Vector3(0, 0, -1), new Vector3(0.2, 0.9, 0.1),
          5, 12, 0.3, 0.6, false,
        );
        const third = set.AddPoint(new Vector3(-1, 0, -2), new Vector3(1, 1, 1), 9, 20, true);
        const read = [0, 1, 2].map((index) => {
          const light = set.GetAt(index);
          return {
            type: light.Type,
            position: [light.Position.X, light.Position.Y, light.Position.Z],
            direction: [light.Direction.X, light.Direction.Y, light.Direction.Z],
            color: [light.Color.X, light.Color.Y, light.Color.Z],
            intensity: light.Intensity,
            range: light.Range,
            innerAngle: light.InnerAngle,
            outerAngle: light.OuterAngle,
            castsShadows: light.CastsShadows,
          };
        });
        const bounds = set.GetBounds().map((sphere) => ({
          center: [sphere.Center.X, sphere.Center.Y, sphere.Center.Z], radius: sphere.Radius,
        }));
        // The same point light, once through CNA's own point-light conversion and once through
        // the uniform shape this package builds. If the two disagree in any field, one of the two
        // paths is inventing the conversion rather than using CNA's.
        const viaShaped = set.AddPoint(new Vector3(3, -4, -6), new Vector3(0.7, 0.2, 0.9), 3, 8, true);
        const viaUniform = set.Add({
          Type: ClusteredLightType.Point,
          Position: new Vector3(3, -4, -6),
          Direction: Vector3.Zero,
          Color: new Vector3(0.7, 0.2, 0.9),
          Intensity: 3,
          Range: 8,
          InnerAngle: 0,
          OuterAngle: 0,
          CastsShadows: true,
        });
        const shaped = set.GetAt(viaShaped);
        const uniform = set.GetAt(viaUniform);
        const effective = (light) => [
          light.Type, light.Position.X, light.Position.Y, light.Position.Z,
          light.Color.X, light.Color.Y, light.Color.Z,
          light.Intensity, light.Range, light.CastsShadows,
        ];
        const conversion = {
          effectiveAgrees: JSON.stringify(effective(shaped)) === JSON.stringify(effective(uniform)),
          boundsAgree:
            JSON.stringify(set.GetBoundsAt(viaShaped)) === JSON.stringify(set.GetBoundsAt(viaUniform)),
          shapedDirection: [shaped.Direction.X, shaped.Direction.Y, shaped.Direction.Z],
          uniformDirection: [uniform.Direction.X, uniform.Direction.Y, uniform.Direction.Z],
          shapedAngles: [shaped.InnerAngle, shaped.OuterAngle],
          uniformAngles: [uniform.InnerAngle, uniform.OuterAngle],
        };
        set.RemoveAt(viaUniform);
        set.RemoveAt(viaShaped);

        return {
          indices: [first, second, third],
          count: set.Count,
          isEmpty: set.IsEmpty,
          read,
          bounds,
          conversion,
          // The bulk read must agree with the one-at-a-time read.
          bulkMatchesIndividual:
            JSON.stringify(set.ToArray().map((light) => light.Intensity)) ===
            JSON.stringify(read.map((light) => light.intensity)),
        };
      });

      record("usability", () => {
        const light = (overrides) => ({
          Type: ClusteredLightType.Point,
          Position: Vector3.Zero,
          Direction: new Vector3(0, 0, -1),
          Color: Vector3.One,
          Intensity: 1,
          Range: 1,
          InnerAngle: 0,
          OuterAngle: 0,
          CastsShadows: false,
          ...overrides,
        });
        return {
          good: ClusteredLightSet.IsUsable(light({})),
          zeroRange: ClusteredLightSet.IsUsable(light({ Range: 0 })),
          negativeRange: ClusteredLightSet.IsUsable(light({ Range: -1 })),
          negativeIntensity: ClusteredLightSet.IsUsable(light({ Intensity: -1 })),
          innerWiderThanOuter: ClusteredLightSet.IsUsable(light({
            Type: ClusteredLightType.Spot, InnerAngle: 0.9, OuterAngle: 0.2,
          })),
          goodSpot: ClusteredLightSet.IsUsable(light({
            Type: ClusteredLightType.Spot, InnerAngle: 0.2, OuterAngle: 0.9,
          })),
        };
      });

      record("assignment", () => {
        assignment.Assign(grid, Matrix.Identity, set.GetBounds());
        const clusterCount = assignment.ClusterCount;
        const offsets = assignment.GetOffsets();
        const indices = assignment.GetIndices();
        // The three views of the same data must agree for every cluster. A per-cluster read that
        // ignored its argument, an offset list off by one, or an index list in the wrong order all
        // break this.
        let disagreedAt = -1;
        let largest = 0;
        for (let cluster = 0; cluster < clusterCount; cluster += 1) {
          const own = assignment.LightsInCluster(cluster);
          const flat = indices.slice(offsets[cluster], offsets[cluster + 1]);
          if (own.length > largest) largest = own.length;
          if (JSON.stringify([...own]) !== JSON.stringify([...flat])) {
            disagreedAt = cluster;
            break;
          }
        }
        return {
          lightCount: assignment.LightCount,
          clusterCount,
          totalReferences: assignment.TotalReferenceCount,
          maxLightsPerCluster: assignment.MaxLightsPerCluster,
          offsetsLength: offsets.length,
          indicesLength: indices.length,
          firstOffset: offsets[0],
          lastOffset: offsets[offsets.length - 1],
          monotonic: offsets.every((value, index) => index === 0 || value >= offsets[index - 1]),
          disagreedAt,
          largestObservedCluster: largest,
          clearedReferences: (() => {
            assignment.Clear();
            const after = assignment.TotalReferenceCount;
            assignment.Assign(grid, Matrix.Identity, set.GetBounds());
            return after;
          })(),
        };
      });

      record("policy", () => {
        const budgetOne = {
          budget: policy.Budget,
          hysteresis: policy.Hysteresis,
        };
        policy.Select(set, Matrix.Identity, projection, Vector3.Zero);
        budgetOne.requests = policy.RequestCount;
        budgetOne.refused = policy.RefusedCount;
        budgetOne.selected = [...policy.GetSelected()];
        budgetOne.scores = [0, 1, 2].map((index) => policy.GetScore(index));
        budgetOne.isSelected = [0, 1, 2].map((index) => policy.IsSelected(index));

        policy.Budget = 0;
        policy.Reset();
        policy.Select(set, Matrix.Identity, projection, Vector3.Zero);
        const budgetZero = {
          budget: policy.Budget,
          requests: policy.RequestCount,
          refused: policy.RefusedCount,
          selected: [...policy.GetSelected()],
        };

        policy.Hysteresis = 2.5;
        return { budgetOne, budgetZero, writtenHysteresis: policy.Hysteresis };
      });

      record("emptied", () => {
        set.RemoveAt(1);
        const afterRemove = { count: set.Count, remaining: set.ToArray().map((l) => l.Range) };
        set.ReplaceAt(0, {
          Type: ClusteredLightType.Point,
          Position: new Vector3(7, 8, 9),
          Direction: Vector3.Zero,
          Color: new Vector3(0.1, 0.2, 0.3),
          Intensity: 4,
          Range: 6,
          InnerAngle: 0,
          OuterAngle: 0,
          CastsShadows: false,
        });
        const replaced = set.GetAt(0);
        set.Clear();
        return {
          afterRemove,
          replacedRange: replaced.Range,
          replacedPosition: [replaced.Position.X, replaced.Position.Y, replaced.Position.Z],
          countAfterClear: set.Count,
          emptyAfterClear: set.IsEmpty,
        };
      });

      record("refusals", () => {
        const attempts = {};
        const attempt = (name, body) => {
          try {
            body();
            attempts[name] = "ACCEPTED";
          } catch (error) {
            // A refusal this package made carries its JavaScript error class; one CNA made carries
            // the result code it refused with. Recording both distinguishes the two boundaries.
            attempts[name] = error.cnaResult == null
              ? error.constructor.name : `result ${error.cnaResult}`;
          }
        };
        attempt("gridTooManyTiles", () => new ClusterGrid(device, 129, 2, 8));
        attempt("gridZeroSlices", () => new ClusterGrid(device, 4, 2, 0));
        attempt("gridTooManySlices", () => new ClusterGrid(device, 4, 2, 257));
        attempt("negativeBudget", () => new ClusteredShadowPolicy(device, -1));
        attempt("unusableLight", () => set.AddPoint(Vector3.Zero, Vector3.One, 1, 0, false));
        attempt("indexOutOfRange", () => set.GetAt(99));
        return attempts;
      });

      record("disposalRefuses", () => {
        const spare = new ClusterGrid(device, 2, 2, 2);
        spare.Dispose();
        const results = {};
        try {
          spare.ClusterCount;
          results.readAfterDispose = "ACCEPTED";
        } catch (error) {
          results.readAfterDispose = error.constructor.name;
        }
        try {
          assignment.Assign(spare, Matrix.Identity, []);
          results.assignToDisposed = "ACCEPTED";
        } catch (error) {
          results.assignToDisposed = error.constructor.name;
        }
        spare.Dispose();
        results.disposedTwice = spare.IsDisposed;
        return results;
      });
    } finally {
      policy.Dispose();
      assignment.Dispose();
      set.Dispose();
      grid.Dispose();
    }
    this.Exit();
    super.LoadContent();
  }
}

test("clustered lighting sorts real lights into real clusters, with exact geometry", async () => {
  const game = new ClusteredLightingProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // --- the grid ---------------------------------------------------------------------------
  const grid = evidence.grid;
  assert.equal(typeof grid, "object", `grid probe failed: ${JSON.stringify(grid)}`);
  assert.deepEqual(
    [grid.tilesX, grid.tilesY, grid.sliceCount, grid.clusterCount], [4, 2, 8, 64],
    "a cluster count is the product of the three axes",
  );
  assert.equal(grid.hasProjectionBefore, false, "a fresh grid has no projection");
  assert.equal(grid.hasProjectionAfter, true, "and reports one once it is given");
  assert.ok(Math.abs(grid.nearPlane - 0.1) < 1e-6, `near plane ${grid.nearPlane}`);
  assert.equal(grid.farPlane, 100);

  // Every one of the 64 clusters, in the order slice-major, row, column: the flat index must be
  // exactly slice * tilesX * tilesY + y * tilesX + x. Checking all of them rather than a sample
  // means a transposed or strided mapping cannot slip through on the diagonal.
  assert.deepEqual(
    grid.indices, Array.from({ length: 64 }, (_, i) => i),
    "the flat cluster index is column-major within a row, row-major within a slice",
  );

  // The depth axis is logarithmic, which is the whole point of clustering: near slices are thin
  // and far ones are wide. Asserted against the closed form, and separately asserted *not* to be
  // the linear spacing -- a linear grid would still be increasing and would still start and end
  // in the right place, so "increasing" alone would not catch it.
  const near = 0.1;
  const far = 100;
  for (let slice = 0; slice <= 8; slice += 1) {
    const expected = near * (far / near) ** (slice / 8);
    assert.ok(
      Math.abs(grid.sliceDistances[slice] - expected) < expected * 1e-5,
      `slice ${slice}: ${grid.sliceDistances[slice]} is not the logarithmic ${expected}`,
    );
  }
  const linear = 4 * (near + (far - near) * (4 / 8));
  assert.ok(
    Math.abs(grid.sliceDistances[4] - linear) > 1,
    "a linearly spaced grid would put slice 4 somewhere else entirely",
  );
  for (let slice = 1; slice <= 8; slice += 1) {
    assert.ok(
      grid.sliceDistances[slice] > grid.sliceDistances[slice - 1],
      "slice boundaries increase",
    );
  }
  // The two depth routes must agree: a distance halfway through slice s belongs to slice s.
  assert.deepEqual(grid.sliceForDistance, [0, 1, 2, 3, 4, 5, 6, 7]);

  // The inverse projection is the actual inverse: multiplying them gives the identity. This is a
  // cross-check through XNA's own Matrix.Multiply, so a transposed or mis-ordered matrix fails.
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let index = 0; index < 16; index += 1) {
    assert.ok(
      Math.abs(grid.roundTrip[index] - identity[index]) < 1e-5,
      `projection times its inverse is not the identity at ${index}: ${grid.roundTrip[index]}`,
    );
  }
  // A cluster's view-space extent is a real box, in front of the camera, inside its slice.
  assert.ok(grid.bounds.min.every((value, i) => value <= grid.bounds.max[i]), "min is below max");
  assert.ok(grid.bounds.max[2] < 0, "a view-space cluster lies down the negative Z axis");
  assert.ok(
    Math.abs(grid.bounds.max[2]) >= grid.sliceDistances[2] - 1e-4 &&
    Math.abs(grid.bounds.min[2]) <= grid.sliceDistances[3] + 1e-4,
    `cluster depth ${grid.bounds.min[2]}..${grid.bounds.max[2]} is outside its own slice`,
  );

  // --- the light set ----------------------------------------------------------------------
  const lights = evidence.lights;
  assert.equal(typeof lights, "object", `light probe failed: ${JSON.stringify(lights)}`);
  assert.deepEqual(lights.indices, [0, 1, 2], "lights are indexed in the order they are added");
  assert.equal(lights.count, 3);
  assert.equal(lights.isEmpty, false);
  // Three lights, every field different, read back exactly. A swap between two lights or two
  // fields changes a number here.
  // Light 0 was added as a point light, so its direction and cone angles are CNA's canonical
  // defaults for a converted point rather than zero -- see the conversion assertions below.
  assert.deepEqual(
    [lights.read[0].type, lights.read[0].position, lights.read[0].color,
     lights.read[0].intensity, lights.read[0].range, lights.read[0].castsShadows],
    [0, [0, 0, -5], [1, 0.5, 0.25], 2, 3, true],
  );
  assert.deepEqual(
    lights.read[0].direction, lights.conversion.shapedDirection,
    "every point light gets the same canonical direction from CNA's conversion",
  );
  assert.deepEqual(lights.read[1].position, [2, 0, -10]);
  assert.deepEqual(lights.read[1].direction, [0, 0, -1], "a spot keeps its direction");
  assert.equal(lights.read[1].type, 1, "and its type");
  assert.equal(lights.read[1].castsShadows, false, "and its own shadow flag");
  assert.ok(
    Math.abs(lights.read[1].innerAngle - 0.3) < 1e-6 &&
    Math.abs(lights.read[1].outerAngle - 0.6) < 1e-6,
    "the two cone angles are stored separately and in the right order",
  );
  assert.deepEqual(lights.read[2].color, [1, 1, 1]);
  assert.equal(lights.read[2].range, 20);
  assert.equal(lights.bulkMatchesIndividual, true, "the bulk read agrees with the indexed one");
  // The same point light, once through CNA's own point-light conversion and once through the
  // uniform shape. Every field that has an effect agrees, and so do the computed bounds.
  const conversion = lights.conversion;
  assert.equal(conversion.effectiveAgrees, true, "the two paths agree on every meaningful field");
  assert.equal(conversion.boundsAgree, true, "and on the influence CNA computes from them");
  // They differ in exactly the fields a point light does not have, and that is the point: CNA
  // fills those with its own canonical defaults rather than leaving them zero, which is a rule
  // this package must not restate. `AddPoint` therefore hands CNA the point light's own fields and
  // lets CNA convert; a TypeScript conversion that zeroed them would disagree here.
  assert.deepEqual(
    conversion.uniformDirection, [0, 0, 0],
    "the uniform shape stores exactly the direction it was given",
  );
  assert.notDeepEqual(
    conversion.shapedDirection, conversion.uniformDirection,
    "while CNA's own conversion supplies a canonical direction a point light ignores",
  );
  assert.ok(
    conversion.shapedAngles[1] > conversion.shapedAngles[0],
    `CNA's canonical cone angles are ordered: ${conversion.shapedAngles}`,
  );
  assert.deepEqual(conversion.uniformAngles, [0, 0]);

  // A point light's influence is a sphere on its own position; a spot's is the bounding sphere of
  // its cone, which is somewhere else entirely. That difference is the evidence CNA computes the
  // bounds rather than copying the position.
  assert.deepEqual(lights.bounds[0].center, [0, 0, -5]);
  assert.equal(lights.bounds[0].radius, 3, "a point light's bound is its own range");
  assert.notDeepEqual(
    lights.bounds[1].center, [2, 0, -10],
    "a spot light's bound is its cone's sphere, not its position",
  );
  assert.ok(
    lights.bounds[1].radius < 12,
    "and it is tighter than the range, because a cone is smaller than a sphere",
  );

  // --- what CNA refuses to light with ------------------------------------------------------
  assert.deepEqual(evidence.usability, {
    good: true,
    zeroRange: false,
    negativeRange: false,
    negativeIntensity: false,
    innerWiderThanOuter: false,
    goodSpot: true,
  });

  // --- the assignment ----------------------------------------------------------------------
  const assignment = evidence.assignment;
  assert.equal(typeof assignment, "object", `assignment failed: ${JSON.stringify(assignment)}`);
  assert.deepEqual([assignment.lightCount, assignment.clusterCount], [3, 64]);
  assert.ok(assignment.totalReferences > 0, "three lights in front of the camera reach clusters");
  assert.ok(
    assignment.totalReferences < 3 * 64,
    "and not every light reaches every cluster, or the sort did nothing",
  );
  // The three ways of reading the same assignment must agree, for every cluster. A per-cluster
  // read that ignored its argument, an offset list off by one, or an index list in a different
  // order all fail here.
  assert.equal(
    assignment.disagreedAt, -1,
    `cluster ${assignment.disagreedAt}: the per-cluster read disagrees with the offset/index pair`,
  );
  assert.equal(assignment.offsetsLength, 65, "one offset per cluster plus the end");
  assert.equal(assignment.firstOffset, 0);
  assert.equal(assignment.monotonic, true, "offsets never go backwards");
  assert.equal(
    assignment.lastOffset, assignment.indicesLength,
    "the final offset is the length of the index list",
  );
  assert.equal(
    assignment.indicesLength, assignment.totalReferences,
    "and that is the total reference count",
  );
  assert.equal(
    assignment.maxLightsPerCluster, assignment.largestObservedCluster,
    "the reported maximum is the largest cluster actually produced",
  );
  assert.equal(assignment.clearedReferences, 0, "Clear forgets the assignment");

  // --- the shadow budget -------------------------------------------------------------------
  const policy = evidence.policy;
  assert.equal(typeof policy, "object", `policy failed: ${JSON.stringify(policy)}`);
  assert.equal(policy.budgetOne.budget, 1);
  assert.ok(policy.budgetOne.hysteresis > 1, `a hysteresis margin above 1: ${policy.budgetOne.hysteresis}`);
  // Two of the three lights ask for a shadow; the third never does, because it was added without
  // the flag. So the request count is a property of the scene, not of the budget.
  assert.equal(policy.budgetOne.requests, 2, "two lights asked for a shadow map");
  assert.equal(policy.budgetOne.selected.length, 1, "and one budget granted one");
  assert.equal(
    policy.budgetOne.refused, policy.budgetOne.requests - policy.budgetOne.selected.length,
    "every request that was not granted is counted as refused",
  );
  // The selected light is the one with a score, and the ones with no score were not selected.
  const [chosen] = policy.budgetOne.selected;
  assert.ok(policy.budgetOne.scores[chosen] > 0, "a selected light has a positive score");
  assert.deepEqual(
    policy.budgetOne.isSelected.map((value, index) => (value ? index : -1)).filter((i) => i >= 0),
    policy.budgetOne.selected,
    "IsSelected and GetSelected name the same lights",
  );
  // A budget of zero grants nothing and refuses everything that asked.
  assert.equal(policy.budgetZero.budget, 0);
  assert.deepEqual(policy.budgetZero.selected, []);
  assert.equal(
    policy.budgetZero.refused, policy.budgetZero.requests,
    "with no budget every request is refused, and the count says so",
  );
  assert.equal(policy.writtenHysteresis, 2.5, "hysteresis is written through to CNA and read back");

  // --- mutation of the set ------------------------------------------------------------------
  const emptied = evidence.emptied;
  assert.equal(emptied.afterRemove.count, 2, "RemoveAt removes exactly one");
  assert.deepEqual(
    emptied.afterRemove.remaining, [3, 20],
    "and the lights that remain are the ones that were not removed, in order",
  );
  assert.equal(emptied.replacedRange, 6, "ReplaceAt writes the new light");
  assert.deepEqual(emptied.replacedPosition, [7, 8, 9], "in the slot it was given");
  assert.equal(emptied.countAfterClear, 0);
  assert.equal(emptied.emptyAfterClear, true);

  // --- refusals ------------------------------------------------------------------------------
  assert.deepEqual(evidence.refusals, {
    gridTooManyTiles: "RangeError",
    gridZeroSlices: "RangeError",
    gridTooManySlices: "RangeError",
    negativeBudget: "RangeError",
    // These two are CNA's own refusals, not this package's, and they carry its result code:
    // INVALID_ARGUMENT for a light it cannot use, and for an index that is not in the set.
    unusableLight: "result 1",
    indexOutOfRange: "result 1",
  });
  assert.deepEqual(evidence.disposalRefuses, {
    readAfterDispose: "NativeUnavailableError",
    assignToDisposed: "NativeUnavailableError",
    disposedTwice: true,
  });

  console.log(
    `CNA_TS_NATIVE_CLUSTERED_LIGHTING=PASS GRID=${grid.tilesX}x${grid.tilesY}x${grid.sliceCount} ` +
    `LOG_SLICES=PASS INVERSE_PROJECTION=PASS ` +
    `ASSIGNMENT=${assignment.totalReferences}refs/${assignment.maxLightsPerCluster}max ` +
    `THREE_WAY_AGREEMENT=PASS SHADOW_BUDGET=${policy.budgetOne.selected.length}/${policy.budgetOne.requests}`,
  );
});


class StandaloneDeviceProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.manager.PreferredBackBufferWidth = 320;
    this.manager.PreferredBackBufferHeight = 240;
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const { GraphicsAdapter, GraphicsProfile, PresentationParameters, Texture2D } = Graphics;
    const record = (name, body) => {
      try {
        this.evidence[name] = body();
      } catch (error) {
        this.evidence[name] = { refused: error.constructor.name, message: error.message };
      }
    };

    // XNA's public constructor needs an adapter, and CNA's route indexes adapters the way its own
    // enumeration reports them -- which needs a live device. So this runs inside LoadContent, with
    // the game's device already up, and builds a *second* device beside it.
    const adapter = GraphicsAdapter.DefaultAdapter;
    const parameters = new PresentationParameters();
    // Deliberately different from the game's 320x240, so a device that answered with the game's
    // state instead of its own is visible rather than plausible.
    parameters.BackBufferWidth = 64;
    parameters.BackBufferHeight = 48;

    record("standalone", () => {
      const own = new Graphics.GraphicsDevice(adapter, GraphicsProfile.Reach, parameters);
      try {
        const texture = new Texture2D(own, 2, 2);
        texture.SetData([Color.Red, Color.Green, Color.Blue, Color.White]);
        const readback = new Array(4);
        texture.GetData(readback);
        const result = {
          isDistinctObject: own !== this.GraphicsDevice,
          profile: own.GraphicsProfile,
          gameProfile: this.GraphicsDevice.GraphicsProfile,
          size: [own.PresentationParameters.BackBufferWidth, own.PresentationParameters.BackBufferHeight],
          gameSize: [
            this.GraphicsDevice.PresentationParameters.BackBufferWidth,
            this.GraphicsDevice.PresentationParameters.BackBufferHeight,
          ],
          viewport: [own.Viewport.Width, own.Viewport.Height],
          adapterIsTheOneGiven: own.Adapter === adapter,
          texels: readback.map((color) => color.PackedValue),
          textureDeviceIsTheStandaloneOne: texture.GraphicsDevice === own,
          isDisposedBefore: own.IsDisposed,
        };
        own.Clear(new Color(12, 34, 56, 255));
        result.clearAccepted = true;
        // A resource from one device is not usable with another: XNA's rule, and this is the first
        // place in this package where two devices exist at once to check it.
        try {
          new Graphics.SpriteBatch(this.GraphicsDevice).Draw(texture, Vector2.Zero, Color.White);
          result.crossDeviceDraw = "ACCEPTED";
        } catch (error) {
          result.crossDeviceDraw = error.constructor.name;
        }
        texture.Dispose();
        own.Dispose();
        result.isDisposedAfter = own.IsDisposed;
        // Disposing twice is harmless, and the game's own device is untouched by any of it.
        own.Dispose();
        result.gameDeviceStillWorks = this.GraphicsDevice.Viewport.Width === 320;
        return result;
      } catch (error) {
        return { failed: `${error.constructor.name}: ${error.message}` };
      }
    });

    record("refusals", () => {
      const attempts = {};
      const attempt = (name, body) => {
        try {
          const made = body();
          made?.Dispose?.();
          attempts[name] = "ACCEPTED";
        } catch (error) {
          attempts[name] = error.constructor.name;
        }
      };
      attempt("nullAdapter",
        () => new Graphics.GraphicsDevice(null, GraphicsProfile.Reach, parameters));
      attempt("nullParameters",
        () => new Graphics.GraphicsDevice(adapter, GraphicsProfile.Reach, null));
      attempt("foreignAdapter", () => new Graphics.GraphicsDevice(
        Object.create(Object.getPrototypeOf(adapter)), GraphicsProfile.Reach, parameters,
      ));
      return attempts;
    });

    // Two devices at once, each with its own presentation parameters, so neither can be reading
    // the other's state.
    record("twoAtOnce", () => {
      const first = new PresentationParameters();
      first.BackBufferWidth = 16;
      first.BackBufferHeight = 16;
      const second = new PresentationParameters();
      second.BackBufferWidth = 128;
      second.BackBufferHeight = 96;
      const a = new Graphics.GraphicsDevice(adapter, GraphicsProfile.Reach, first);
      const b = new Graphics.GraphicsDevice(adapter, GraphicsProfile.HiDef, second);
      try {
        return {
          sizes: [
            [a.PresentationParameters.BackBufferWidth, a.PresentationParameters.BackBufferHeight],
            [b.PresentationParameters.BackBufferWidth, b.PresentationParameters.BackBufferHeight],
          ],
          profiles: [a.GraphicsProfile, b.GraphicsProfile],
          distinct: a !== b,
        };
      } finally {
        a.Dispose();
        b.Dispose();
      }
    });

    // Disposing a *manager*-created device must not release the game's native lifetime -- that
    // handle belongs to the game, and freeing it here would tear down everything. Read directly
    // off the lifetime rather than inferred from a later symptom, because the symptom of getting
    // this wrong is a use-after-free rather than a failed assertion.
    record("managerDeviceDisposal", () => {
      const gameLifetime = getBackend().ParentLifetime;
      const before = gameLifetime.State;
      this.GraphicsDevice.Dispose();
      this.deviceDisposed = true;
      return {
        before,
        after: gameLifetime.State,
        deviceReportsDisposed: this.GraphicsDevice.IsDisposed,
      };
    });

    this.Exit();
    super.LoadContent();
  }

  Draw(gameTime) {
    if (!this.deviceDisposed) this.GraphicsDevice.Clear(Color.CornflowerBlue);
    this.Exit();
    super.Draw(gameTime);
  }
}

test("XNA's public GraphicsDevice constructor makes a real second device", async () => {
  const game = new StandaloneDeviceProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  const own = evidence.standalone;
  assert.equal(typeof own, "object", `standalone device failed: ${JSON.stringify(own)}`);
  assert.equal(own.failed, undefined, own.failed);
  assert.equal(own.isDistinctObject, true, "a caller-created device is not the game's");
  assert.equal(own.profile, Graphics.GraphicsProfile.Reach, "it keeps the profile it was given");
  // Its presentation parameters are its own, not the manager's: 64x48 against the game's 320x240.
  assert.deepEqual(own.size, [64, 48], "the device reports the parameters it was constructed with");
  assert.deepEqual(own.gameSize, [320, 240], "and the game's device still reports the manager's");
  assert.deepEqual(own.viewport, [64, 48], "its viewport follows its own back buffer");
  assert.equal(own.adapterIsTheOneGiven, true, "GraphicsDevice.Adapter is the adapter passed in");

  // A texture created on that device round-trips its exact four texels. This is the assertion that
  // separates "a handle came back" from "a real device that stores real pixels".
  assert.deepEqual(
    own.texels,
    [Color.Red, Color.Green, Color.Blue, Color.White].map((color) => color.PackedValue),
    "four exact texels through a caller-created device",
  );
  assert.equal(own.textureDeviceIsTheStandaloneOne, true, "the texture belongs to that device");
  assert.equal(own.clearAccepted, true);

  // XNA forbids using a resource from one device with another, and two devices existing at once is
  // the only way to check it.
  assert.notEqual(
    own.crossDeviceDraw, "ACCEPTED",
    "a texture from one device must not be drawable through another device's SpriteBatch",
  );

  assert.equal(own.isDisposedBefore, false);
  assert.equal(own.isDisposedAfter, true, "Dispose releases a device this package owns");
  assert.equal(
    own.gameDeviceStillWorks, true,
    "and releasing it leaves the game's own device untouched",
  );

  assert.deepEqual(evidence.refusals, {
    nullAdapter: "ArgumentNullException",
    nullParameters: "ArgumentNullException",
    foreignAdapter: "ArgumentException",
  });

  // Two caller-created devices alive at once, each answering with its own state.
  const two = evidence.twoAtOnce;
  assert.equal(typeof two, "object", `two devices failed: ${JSON.stringify(two)}`);
  assert.equal(two.distinct, true);
  assert.deepEqual(two.sizes, [[16, 16], [128, 96]], "neither device reads the other's parameters");
  assert.deepEqual(
    two.profiles, [Graphics.GraphicsProfile.Reach, Graphics.GraphicsProfile.HiDef],
    "nor the other's profile",
  );

  // The ownership rule, stated where it can be checked: a caller-created device owns its handle
  // and releases it; a manager-created one does not, and disposing it must leave the game's native
  // lifetime alive. Without this, a Dispose that released whatever lifetime it found would pass
  // every other assertion here and free the game's handle in production.
  const managed = evidence.managerDeviceDisposal;
  assert.equal(typeof managed, "object", `manager disposal failed: ${JSON.stringify(managed)}`);
  assert.equal(managed.before, "active", "the game's native lifetime is live before the test");
  assert.equal(
    managed.after, "active",
    "disposing a manager-created GraphicsDevice must not release the game's native lifetime",
  );
  assert.equal(managed.deviceReportsDisposed, true, "while the device itself does report disposed");

  console.log(
    `CNA_TS_NATIVE_STANDALONE_DEVICE=PASS SIZE=${own.size.join("x")} ` +
    `GAME_SIZE=${own.gameSize.join("x")} TEXELS=EXACT CROSS_DEVICE=${own.crossDeviceDraw} ` +
    `TWO_AT_ONCE=${two.sizes.map((s) => s.join("x")).join("|")}`,
  );
});


class CameraProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const { CameraState, CnaCamera, CnaCameraTestHooks } = devicesModule;
    const record = (name, body) => {
      try {
        this.evidence[name] = body();
      } catch (error) {
        this.evidence[name] = { refused: error.constructor.name, cnaResult: error.cnaResult };
      }
    };

    // The platform's real camera, on a machine that has none. Opening still succeeds -- that is
    // CNA's documented contract -- and the state is what says there is nothing there.
    record("real", () => {
      const camera = CnaCamera.Open();
      try {
        return {
          state: camera.State,
          width: camera.FrameWidth,
          height: camera.FrameHeight,
          isTestBackend: camera.IsTestBackend,
        };
      } finally {
        camera.Dispose();
      }
    });

    record("hooksRefuseRealCamera", () => {
      const camera = CnaCamera.Open();
      try {
        const attempts = {};
        for (const [name, body] of [
          ["setState", () => CnaCameraTestHooks.SetState(camera, CameraState.Ready)],
          ["setFrame", () => CnaCameraTestHooks.SetFrame(camera, 1, 1, new Uint8Array(4))],
          ["clearFrame", () => CnaCameraTestHooks.ClearFrame(camera)],
        ]) {
          try {
            body();
            attempts[name] = "ACCEPTED";
          } catch (error) {
            attempts[name] = error.constructor.name;
          }
        }
        return attempts;
      } finally {
        camera.Dispose();
      }
    });

    record("test", () => {
      const camera = CnaCamera.OpenForTests();
      const texture = new Graphics.Texture2D(this.GraphicsDevice, 2, 2);
      const wrongSize = new Graphics.Texture2D(this.GraphicsDevice, 4, 4);
      try {
        const result = {
          isTestBackend: camera.IsTestBackend,
          initialState: camera.State,
          initialSize: [camera.FrameWidth, camera.FrameHeight],
        };
        // Every state CNA lets a caller inject, each read back. Closed and NotSupported are
        // refused for a device that was opened, which is CNA's own rule and recorded as such.
        result.states = [
          CameraState.Opening, CameraState.Denied, CameraState.Ready, CameraState.Lost,
        ].map((state) => {
          CnaCameraTestHooks.SetState(camera, state);
          return [state, camera.State];
        });
        result.refusedStates = [CameraState.Closed, CameraState.NotSupported].map((state) => {
          try {
            CnaCameraTestHooks.SetState(camera, state);
            return "ACCEPTED";
          } catch (error) {
            return `result ${error.cnaResult}`;
          }
        });

        // Four distinct pixels, so a frame copied from the wrong place, in the wrong order, or
        // channel-swapped is a different number rather than a coincidence.
        const rgba = Uint8Array.from([
          255, 0, 0, 255,
          0, 255, 0, 255,
          0, 0, 255, 255,
          8, 16, 32, 64,
        ]);
        CnaCameraTestHooks.SetFrame(camera, 2, 2, rgba);
        result.afterPublish = {
          state: camera.State,
          size: [camera.FrameWidth, camera.FrameHeight],
        };

        result.acquired = camera.TryAcquireFrame(texture);
        const readback = new Array(4);
        texture.GetData(readback);
        result.texels = readback.map((color) => color.PackedValue);

        // A texture whose size does not match the frame is refused, the same way as no frame.
        result.wrongSize = camera.TryAcquireFrame(wrongSize);
        // The frame stays available until it is replaced.
        result.acquiredAgain = camera.TryAcquireFrame(texture);

        // A second, different frame replaces the first.
        const second = Uint8Array.from([
          1, 2, 3, 4,
          5, 6, 7, 8,
          9, 10, 11, 12,
          13, 14, 15, 16,
        ]);
        CnaCameraTestHooks.SetFrame(camera, 2, 2, second);
        camera.TryAcquireFrame(texture);
        const replaced = new Array(4);
        texture.GetData(replaced);
        result.replacedTexels = replaced.map((color) => color.PackedValue);

        CnaCameraTestHooks.ClearFrame(camera);
        result.afterClear = { state: camera.State, acquired: camera.TryAcquireFrame(texture) };

        camera.Dispose();
        result.disposedTwice = (() => { camera.Dispose(); return camera.IsDisposed; })();
        try {
          camera.State;
          result.readAfterDispose = "ACCEPTED";
        } catch (error) {
          result.readAfterDispose = error.constructor.name;
        }
        return result;
      } finally {
        texture.Dispose();
        wrongSize.Dispose();
      }
    });

    // The injection hooks must refuse a camera that is not CNA's test backend, or a test could
    // fabricate a reading for a device the platform actually owns.
    record("argumentRefusals", () => {
      const camera = CnaCamera.OpenForTests();
      try {
        const attempts = {};
        for (const [name, body] of [
          ["shortFrame", () => CnaCameraTestHooks.SetFrame(camera, 2, 2, new Uint8Array(4))],
          ["negativeWidth", () => CnaCameraTestHooks.SetFrame(camera, -1, 2, new Uint8Array(16))],
          ["badState", () => CnaCameraTestHooks.SetState(camera, 99)],
          ["notATexture", () => camera.TryAcquireFrame(null)],
          ["notACamera", () => CnaCameraTestHooks.SetState({}, CameraState.Ready)],
        ]) {
          try {
            body();
            attempts[name] = "ACCEPTED";
          } catch (error) {
            attempts[name] = error.constructor.name;
          }
        }
        return attempts;
      } finally {
        camera.Dispose();
      }
    });

    this.Exit();
    super.LoadContent();
  }

  Draw(gameTime) {
    this.GraphicsDevice.Clear(Color.CornflowerBlue);
    this.Exit();
    super.Draw(gameTime);
  }
}

test("a camera frame reaches a caller-owned texture, exactly", async () => {
  const game = new CameraProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();
  const { CameraState } = devicesModule;

  // No verification machine has a camera, and that is the answer being asserted: opening the
  // platform's own still succeeds, and the state is what reports the absence.
  const real = evidence.real;
  assert.equal(typeof real, "object", `real camera failed: ${JSON.stringify(real)}`);
  assert.equal(real.isTestBackend, false);
  assert.equal(
    real.state, CameraState.NotSupported,
    "this host has no camera, and CNA says so through the state rather than by refusing to open",
  );
  assert.deepEqual([real.width, real.height], [0, 0], "and reports no frame format");

  const probe = evidence.test;
  assert.equal(typeof probe, "object", `test camera failed: ${JSON.stringify(probe)}`);
  assert.equal(probe.isTestBackend, true);
  assert.equal(probe.initialState, CameraState.Opening, "a test camera starts opening");
  assert.deepEqual(probe.initialSize, [0, 0], "with no frame format yet");

  // Every injectable state round-trips as itself, so the hook writes through to CNA rather than
  // being remembered here.
  assert.deepEqual(probe.states, [
    [CameraState.Opening, CameraState.Opening],
    [CameraState.Denied, CameraState.Denied],
    [CameraState.Ready, CameraState.Ready],
    [CameraState.Lost, CameraState.Lost],
  ]);
  // And CNA refuses the two a device it opened can never be in.
  assert.deepEqual(
    probe.refusedStates, ["result 1", "result 1"],
    "Closed and NotSupported are refused for an opened device, which is CNA's own rule",
  );

  // Publishing a frame reports the camera ready and fixes its format -- what a real camera does
  // when it starts producing.
  assert.equal(probe.afterPublish.state, CameraState.Ready);
  assert.deepEqual(probe.afterPublish.size, [2, 2]);

  // The four exact texels, through the real acquisition path into a texture this package owns.
  assert.equal(probe.acquired, true);
  assert.deepEqual(
    probe.texels,
    [
      new Color(255, 0, 0, 255).PackedValue,
      new Color(0, 255, 0, 255).PackedValue,
      new Color(0, 0, 255, 255).PackedValue,
      new Color(8, 16, 32, 64).PackedValue,
    ],
    "the frame's four pixels arrive in order, with their channels the right way round",
  );

  assert.equal(
    probe.wrongSize, false,
    "a texture whose size does not match the frame is refused, not resized",
  );
  assert.equal(probe.acquiredAgain, true, "the frame stays available until it is replaced");
  // A second frame really replaces the first: sixteen different bytes, sixteen different results.
  assert.deepEqual(
    probe.replacedTexels,
    [
      new Color(1, 2, 3, 4).PackedValue,
      new Color(5, 6, 7, 8).PackedValue,
      new Color(9, 10, 11, 12).PackedValue,
      new Color(13, 14, 15, 16).PackedValue,
    ],
    "publishing a second frame replaces the first rather than being ignored",
  );
  assert.notDeepEqual(probe.replacedTexels, probe.texels);

  assert.equal(probe.afterClear.acquired, false, "a cleared camera has no frame to give");
  assert.notEqual(
    probe.afterClear.state, CameraState.Ready,
    "and it is no longer ready",
  );
  assert.equal(probe.disposedTwice, true, "disposing twice is harmless");
  assert.equal(probe.readAfterDispose, "NativeUnavailableError", "a disposed camera refuses");

  // The injection hooks are for CNA's test backend only: a real device cannot be given a reading.
  assert.deepEqual(evidence.hooksRefuseRealCamera, {
    setState: "InvalidOperationException",
    setFrame: "InvalidOperationException",
    clearFrame: "InvalidOperationException",
  });

  assert.deepEqual(evidence.argumentRefusals, {
    shortFrame: "RangeError",
    negativeWidth: "RangeError",
    badState: "RangeError",
    notATexture: "TypeError",
    notACamera: "TypeError",
  });

  console.log(
    `CNA_TS_NATIVE_CAMERA=PASS REAL=${CameraState[real.state]} ` +
    `TEST_FRAME=${probe.afterPublish.size.join("x")} TEXELS=EXACT REPLACED=EXACT ` +
    `WRONG_SIZE_REFUSED=PASS HOOKS_REFUSE_REAL_DEVICE=PASS`,
  );
});

test("opening the platform camera after a test camera is an upstream use-after-free", () => {
  // Asserted, not avoided. CNA 0.21.0 installs the test camera provider as a process-wide platform
  // override holding a raw pointer into the camera resource, and cna_camera_destroy frees that
  // resource without clearing the override -- so the next cna_camera_create dereferences it and
  // dies in CNA::Devices::Camera::Camera at Camera.cpp:68. Reproduced in plain C with no binding
  // involved; docs/upstream-cna-findings.md carries the backtrace.
  //
  // Run in its own process, because the whole point is that it takes the process down. When CNA
  // repairs it the child prints SURVIVED, this test fails, and the finding gets re-measured.
  const script = new URL("fixtures/camera-test-backend-then-platform.mjs", import.meta.url);
  const child = spawnSync(process.execPath, [script.pathname], {
    env: { ...process.env, CNA_NATIVE_LIBRARY: library, CNA_NODE_BRIDGE: bridge },
    encoding: "utf8",
    timeout: 120_000,
  });
  const survived = (child.stdout ?? "").includes("SURVIVED");
  assert.equal(
    survived, false,
    "CNA no longer crashes when the platform camera is opened after a test camera: the upstream " +
    "use-after-free is fixed, and docs/upstream-cna-findings.md needs re-measuring",
  );
  assert.equal(
    child.signal, "SIGSEGV",
    `expected the recorded segmentation fault, got signal ${child.signal} status ${child.status}`,
  );
  console.log(
    `CNA_TS_NATIVE_CAMERA_UPSTREAM_CRASH=REPRODUCED SIGNAL=${child.signal} ` +
    "SEQUENCE=test-backend-create,destroy,platform-create",
  );
});

test("a LOD group picks a level, and damps the boundary it last crossed", async () => {
  const { LodGroup, LodSelectionMode } = computeExtensions;
  // No device and no game: a LOD group is a value object, so this needs neither.
  const group = new LodGroup();
  try {
    // Added out of order on purpose. The group sorts, so the index it answers is an index into
    // its own order rather than the order these arrived in.
    group.AddLevel(50).AddLevel(10).AddLevel(200).AddLevel(25);
    assert.deepEqual(group.Thresholds, [10, 25, 50, 200], "levels are kept sorted by threshold");
    assert.equal(group.Count, 4);
    assert.equal(group.SelectionMode, LodSelectionMode.Distance, "distance is the default mode");
    assert.equal(group.Hysteresis, 0, "and nothing is sticky until a margin is set");

    // Each band, and both sides of every boundary. A threshold is the *end* of its level.
    assert.deepEqual(
      [0, 9.9, 10, 24.9, 25, 49.9, 50, 199.9, 200, 1000].map((d) => group.SelectIndex(d)),
      [0, 0, 1, 1, 2, 2, 3, 3, -1, -1],
      "each threshold ends its level, and past the last one the answer is -1 rather than a clamp",
    );

    // Hysteresis: an absolute margin around the boundary the group last crossed. With 3 either
    // side of 25, going up switches at 28 and coming back down switches at 22 -- and that
    // asymmetry is the whole point, so both directions are walked.
    group.Hysteresis = 3;
    assert.equal(group.Hysteresis, 3, "the margin reads back");
    group.ResetHysteresis();
    const up = [];
    for (let distance = 20; distance <= 32; distance += 1) up.push(group.SelectIndex(distance));
    const down = [];
    for (let distance = 32; distance >= 20; distance -= 1) down.push(group.SelectIndex(distance));
    assert.deepEqual(
      up, [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
      "climbing, the group holds level 1 until 28 -- three past the boundary at 25",
    );
    assert.deepEqual(
      down, [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1],
      "and descending it holds level 2 until 22 -- three below it",
    );
    assert.notDeepEqual([...down].reverse(), up, "which is what makes it hysteresis, not rounding");

    // Reset forgets, so the very next answer is the undamped one.
    group.ResetHysteresis();
    assert.equal(group.SelectIndex(26), 2, "a fresh group answers 26 as level 2");

    // A jump of more than one level is not damped: that is a real change, not a wobble.
    group.ResetHysteresis();
    assert.equal(group.SelectIndex(5), 0);
    assert.equal(
      group.SelectIndex(26), 2,
      "two levels in one step is not held back, even though 26 is inside the sticky band",
    );

    // Screen-space selection: the thresholds become pixel counts, and the projection is exact.
    // radius * (viewportHeight / 2) / (distance * tan(fov / 2)).
    group.SelectionMode = LodSelectionMode.ScreenSpaceError;
    assert.equal(group.SelectionMode, LodSelectionMode.ScreenSpaceError);
    group.SetScreenSpaceParameters(2, Math.PI / 3, 1080);
    for (const distance of [1, 4, 16, 64]) {
      const expected = 2 * (1080 / 2) / (distance * Math.tan(Math.PI / 6));
      const actual = group.ProjectedRadiusPixels(distance);
      assert.ok(
        Math.abs(actual - expected) < expected * 1e-5,
        `at ${distance}: ${actual} is not the projected ${expected}`,
      );
    }
    // Twice the distance is half the radius, which no constant could satisfy.
    assert.ok(
      Math.abs(group.ProjectedRadiusPixels(2) - group.ProjectedRadiusPixels(4) * 2) < 1e-3,
      "the projection is inverse in distance",
    );

    // An empty group answers -1 rather than refusing, and reports no levels.
    group.Clear();
    assert.deepEqual(group.Thresholds, []);
    assert.equal(group.SelectIndex(5), -1, "with no levels there is nothing to draw");

    // Arguments this package refuses before CNA sees them, and one CNA refuses itself.
    for (const call of [
      () => group.AddLevel(Number.NaN),
      () => group.SelectIndex(Number.POSITIVE_INFINITY),
      () => { group.Hysteresis = Number.NaN; },
      () => group.SetScreenSpaceParameters(1, Number.NaN, 1080),
      () => group.ProjectedRadiusPixels("x"),
    ]) {
      assert.throws(call, TypeError, call.toString());
    }
    assert.throws(() => { group.SelectionMode = 9; }, RangeError);
    assert.throws(() => group.AddLevel(-1), (error) => error.cnaResult === 1);
  } finally {
    group.Dispose();
  }

  const gone = new LodGroup();
  gone.Dispose();
  gone.Dispose();
  assert.equal(gone.IsDisposed, true);
  assert.throws(() => gone.SelectIndex(1), NativeUnavailableError);

  console.log(
    "CNA_TS_NATIVE_LOD=PASS LEVELS=SORTED BANDS=EXACT HYSTERESIS=DIRECTIONAL " +
    "MULTI_LEVEL_JUMP=UNDAMPED SCREEN_SPACE=EXACT",
  );
});


class GuideProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const { Guide, MessageBoxIcon } = GamerServices;
    const { CnaGuide } = guideExtensions;
    const record = (name, body) => {
      try {
        this.evidence[name] = body();
      } catch (error) {
        this.evidence[name] = { refused: error.constructor.name, message: error.message };
      }
    };

    record("messageBox", () => {
      const seen = [];
      const result = Guide.BeginShowMessageBox(
        "Quit?", "Save first?", ["Save", "Discard", "Cancel"], 1, MessageBoxIcon.Warning,
        (value) => seen.push(value), "my-state",
      );
      const opened = {
        isCompletedBefore: result.IsCompleted,
        completedSynchronously: result.CompletedSynchronously,
        asyncState: result.AsyncState,
        guideIsVisible: Guide.IsVisible,
        hasPending: CnaGuide.HasPendingMessageBox,
        // The focus button CNA holds is the one XNA was told, which is what shows the argument
        // reaching the pending screen rather than being remembered here.
        focusButton: CnaGuide.PendingMessageBox?.FocusButton,
      };
      // Answer it as the player would have. The continuation runs on this call.
      CnaGuide.ForTests.ClickMessageBoxButton(2);
      return {
        ...opened,
        callbackCount: seen.length,
        callbackGotTheSameResult: seen[0] === result,
        isCompletedAfter: result.IsCompleted,
        answer: Guide.EndShowMessageBox(result),
        hasPendingAfter: CnaGuide.HasPendingMessageBox,
        pendingAfter: CnaGuide.PendingMessageBox,
      };
    });

    // A different button, so the answer cannot be a constant.
    record("messageBoxSecondAnswer", () => {
      const result = Guide.BeginShowMessageBox(
        "Again", "Pick", ["Zero", "One", "Two", "Three"], 0, MessageBoxIcon.None,
        () => {}, null,
      );
      CnaGuide.ForTests.ClickMessageBoxButton(3);
      return Guide.EndShowMessageBox(result);
    });

    record("keyboardInput", () => {
      const seen = [];
      const result = Guide.BeginShowKeyboardInput(
        0, "Name", "Enter your name", "Player", (value) => seen.push(value), "kb-state",
      );
      const pending = CnaGuide.PendingKeyboardInput;
      const opened = {
        hasPending: CnaGuide.HasPendingKeyboardInput,
        title: pending?.Title,
        description: pending?.Description,
        displayText: pending?.DisplayText,
        asyncState: result.AsyncState,
      };
      CnaGuide.ForTests.CancelKeyboardInput();
      return {
        ...opened,
        callbackCount: seen.length,
        callbackGotTheSameResult: seen[0] === result,
        isCompleted: result.IsCompleted,
        wasCanceled: CnaGuide.WasKeyboardInputCanceled,
        answer: Guide.EndShowKeyboardInput(result),
        hasPendingAfter: CnaGuide.HasPendingKeyboardInput,
      };
    });

    record("refusals", () => {
      const attempts = {};
      const attempt = (name, body) => {
        try {
          body();
          attempts[name] = "ACCEPTED";
        } catch (error) {
          attempts[name] = error.constructor.name;
        }
      };
      // Arguments this package refuses before CNA sees them.
      attempt("noButtons", () => Guide.BeginShowMessageBox(
        "t", "x", [], 0, MessageBoxIcon.None, () => {}, null,
      ));
      attempt("focusPastTheEnd", () => Guide.BeginShowMessageBox(
        "t", "x", ["A"], 1, MessageBoxIcon.None, () => {}, null,
      ));
      attempt("nullTitle", () => Guide.BeginShowMessageBox(
        null, "x", ["A"], 0, MessageBoxIcon.None, () => {}, null,
      ));
      // An End with a result the Guide never produced, and one for the wrong operation.
      attempt("foreignResult", () => Guide.EndShowMessageBox({ IsCompleted: true }));
      attempt("negativeClick", () => CnaGuide.ForTests.ClickMessageBoxButton(-1));
      // Answering when nothing is pending: CNA's own refusal, not this package's.
      attempt("clickWithNothingPending", () => CnaGuide.ForTests.ClickMessageBoxButton(0));
      attempt("endWithNothingBegun", () => Guide.EndShowMessageBox({ IsCompleted: true }));
      return attempts;
    });

    record("secondBoxWhileOnePending", () => {
      const first = Guide.BeginShowMessageBox(
        "First", "x", ["A"], 0, MessageBoxIcon.None, () => {}, null,
      );
      let second = "ACCEPTED";
      try {
        Guide.BeginShowMessageBox("Second", "y", ["B"], 0, MessageBoxIcon.None, () => {}, null);
      } catch (error) {
        second = `result ${error.cnaResult}`;
      }
      CnaGuide.ForTests.ClickMessageBoxButton(0);
      Guide.EndShowMessageBox(first);
      return second;
    });

    // An End before the operation completes is an error, not a wait.
    record("endBeforeCompletion", () => {
      const result = Guide.BeginShowMessageBox(
        "Pending", "x", ["A"], 0, MessageBoxIcon.None, () => {}, null,
      );
      let refusal;
      try {
        Guide.EndShowMessageBox(result);
        refusal = "ACCEPTED";
      } catch (error) {
        refusal = error.constructor.name;
      }
      CnaGuide.ForTests.ClickMessageBoxButton(0);
      Guide.EndShowMessageBox(result);
      return refusal;
    });

    this.Exit();
    super.LoadContent();
  }

  Draw(gameTime) {
    this.GraphicsDevice.Clear(Color.CornflowerBlue);
    this.Exit();
    super.Draw(gameTime);
  }
}

test("XNA's Guide really shows a message box and a keyboard, and CNA answers them", async () => {
  const game = new GuideProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  // --- the message box -----------------------------------------------------------------------
  const box = evidence.messageBox;
  assert.equal(typeof box, "object", `message box failed: ${JSON.stringify(box)}`);
  assert.equal(box.isCompletedBefore, false, "it does not complete inside the Begin call");
  assert.equal(box.completedSynchronously, false, "and says so");
  assert.equal(box.asyncState, "my-state", "the caller's state is carried through untouched");
  assert.equal(box.guideIsVisible, true, "Guide.IsVisible is true while a screen is up");
  assert.equal(box.hasPending, true);
  assert.equal(
    box.focusButton, 1,
    "the focus button CNA holds is the one XNA was given, not a default",
  );

  // The continuation runs exactly once, with the very result object Begin returned -- which is
  // what XNA's IAsyncResult contract means and what a caller's `EndShow*` needs.
  assert.equal(box.callbackCount, 1, "the continuation runs once");
  assert.equal(box.callbackGotTheSameResult, true, "with the result Begin handed back");
  assert.equal(box.isCompletedAfter, true);
  assert.equal(box.answer, 2, "and the answer is the button that was pressed");
  assert.equal(box.hasPendingAfter, false, "the screen is gone");
  assert.equal(box.pendingAfter, null);

  // A different button on a different box: the answer tracks the press rather than being fixed.
  assert.equal(evidence.messageBoxSecondAnswer, 3);

  // --- the keyboard --------------------------------------------------------------------------
  const keyboard = evidence.keyboardInput;
  assert.equal(typeof keyboard, "object", `keyboard failed: ${JSON.stringify(keyboard)}`);
  assert.equal(keyboard.hasPending, true);
  // Three different strings, read back from CNA rather than from this test's own variables.
  assert.equal(keyboard.title, "Name");
  assert.equal(keyboard.description, "Enter your name");
  assert.equal(keyboard.displayText, "Player", "the input starts with the default text it was given");
  assert.equal(keyboard.asyncState, "kb-state");
  assert.equal(keyboard.callbackCount, 1);
  assert.equal(keyboard.callbackGotTheSameResult, true);
  assert.equal(keyboard.isCompleted, true);
  assert.equal(keyboard.wasCanceled, true);
  assert.equal(
    keyboard.answer, null,
    "XNA returns null for a cancelled input, which is not an empty string",
  );
  assert.equal(keyboard.hasPendingAfter, false);

  // --- refusals -------------------------------------------------------------------------------
  const refusals = evidence.refusals;
  assert.equal(refusals.noButtons, "ArgumentException", "a message box needs a button");
  assert.equal(refusals.focusPastTheEnd, "ArgumentOutOfRangeException");
  assert.equal(refusals.nullTitle, "ArgumentNullException");
  assert.equal(refusals.foreignResult, "ArgumentException", "an unrelated async result is refused");
  assert.equal(refusals.negativeClick, "RangeError");
  assert.notEqual(
    refusals.clickWithNothingPending, "ACCEPTED",
    "answering a screen that was never shown is refused",
  );

  // Only one Guide screen at a time, which is CNA's own rule.
  assert.equal(
    evidence.secondBoxWhileOnePending, "result 3",
    "a second message box while one is pending is INVALID_STATE",
  );

  // And End before the answer is an error rather than a wait -- this is not a promise.
  assert.equal(evidence.endBeforeCompletion, "InvalidOperationException");

  console.log(
    `CNA_TS_NATIVE_GUIDE=PASS MESSAGE_BOX=${box.answer}/3 FOCUS=${box.focusButton} ` +
    `KEYBOARD=cancelled ASYNC_CONTRACT=PASS ONE_AT_A_TIME=PASS`,
  );
});

test("shadow-map maths frames a scene from a light, exactly", async () => {
  const { ShadowMap, ShadowMapMath, ShadowQuality } = computeExtensions;

  // The quality ladder, which needs no device at all: a tier buys a texture size and a filter.
  const sizes = [
    ShadowQuality.Disabled, ShadowQuality.Low, ShadowQuality.Medium, ShadowQuality.High,
    ShadowQuality.Ultra,
  ].map((quality) => ShadowMapMath.SizeForQuality(quality));
  const radii = [
    ShadowQuality.Disabled, ShadowQuality.Low, ShadowQuality.Medium, ShadowQuality.High,
    ShadowQuality.Ultra,
  ].map((quality) => ShadowMapMath.FilterRadiusForQuality(quality));
  assert.deepEqual(sizes, [512, 512, 1024, 2048, 4096]);
  assert.deepEqual(radii, [0, 0, 1, 2, 2]);
  // Stated as a property as well as a table, so a renumbering that kept the same five values in a
  // different order would still fail.
  for (let index = 1; index < sizes.length; index += 1) {
    assert.ok(sizes[index] >= sizes[index - 1], "a higher tier is never a smaller map");
    assert.ok(radii[index] >= radii[index - 1], "nor a narrower filter");
  }
  assert.ok(sizes[4] > sizes[0], "and Ultra really does cost more than Disabled");
  assert.throws(() => ShadowMapMath.SizeForQuality(9), RangeError);
  assert.throws(() => ShadowMapMath.SizeForQuality(-1), RangeError);

  // The geometry. A scene box, a light pointing straight down, and the view/projection CNA
  // computes to frame it.
  const bounds = new BoundingBox(new Vector3(-10, -2, -10), new Vector3(10, 6, 10));
  const light = {
    Direction: new Vector3(0, -1, 0), Color: new Vector3(1, 1, 1), Intensity: 1,
  };
  const view = ShadowMapMath.ComputeLightView(light, bounds);
  const projection = ShadowMapMath.ComputeLightProjection(view, bounds);

  // The view's rotation is orthonormal: three unit rows, mutually perpendicular. No wrong matrix
  // satisfies that by accident, and it is the property that makes it a view at all.
  const rows = [
    new Vector3(view.M11, view.M21, view.M31),
    new Vector3(view.M12, view.M22, view.M32),
    new Vector3(view.M13, view.M23, view.M33),
  ];
  for (const [index, row] of rows.entries()) {
    assert.ok(Math.abs(row.Length() - 1) < 1e-5, `view row ${index} is not a unit vector`);
  }
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
    assert.ok(
      Math.abs(Vector3.Dot(rows[a], rows[b])) < 1e-5,
      `view rows ${a} and ${b} are not perpendicular`,
    );
  }

  // And the point of the pair: every corner of the scene lands inside the light's clip volume.
  // This is the actual purpose of the two matrices, checked through XNA's own transform rather
  // than by comparing against numbers copied out of a run.
  const viewProjection = Matrix.Multiply(view, projection);
  const corners = [];
  for (const x of [bounds.Min.X, bounds.Max.X]) {
    for (const y of [bounds.Min.Y, bounds.Max.Y]) {
      for (const z of [bounds.Min.Z, bounds.Max.Z]) corners.push(new Vector3(x, y, z));
    }
  }
  assert.equal(corners.length, 8);
  let extentX = 0;
  let extentY = 0;
  let nearest = Number.POSITIVE_INFINITY;
  let farthest = Number.NEGATIVE_INFINITY;
  for (const corner of corners) {
    const clip = Vector3.Transform(corner, viewProjection);
    assert.ok(
      clip.X >= -1 - 1e-4 && clip.X <= 1 + 1e-4,
      `corner ${corner.X},${corner.Y},${corner.Z} leaves the light's frustum in X: ${clip.X}`,
    );
    assert.ok(
      clip.Y >= -1 - 1e-4 && clip.Y <= 1 + 1e-4,
      `corner ${corner.X},${corner.Y},${corner.Z} leaves the light's frustum in Y: ${clip.Y}`,
    );
    assert.ok(
      clip.Z >= -1e-4 && clip.Z <= 1 + 1e-4,
      `corner ${corner.X},${corner.Y},${corner.Z} leaves the depth range: ${clip.Z}`,
    );
    extentX = Math.max(extentX, Math.abs(clip.X));
    extentY = Math.max(extentY, Math.abs(clip.Y));
    nearest = Math.min(nearest, clip.Z);
    farthest = Math.max(farthest, clip.Z);
  }
  // Fitted, not merely contained. CNA pads the frustum a little -- measured at 0.998 for this
  // scene and 0.980 for a unit box, which is a small absolute margin rather than a proportional
  // one -- so the bound here is 0.95: snug enough that a projection even ten per cent too wide
  // fails, while every corner would still be inside it.
  assert.ok(
    extentX >= 0.95 && extentX <= 1,
    `the projection is not fitted to the scene in X: corners reach ${extentX}`,
  );
  assert.ok(
    extentY >= 0.95 && extentY <= 1,
    `the projection is not fitted to the scene in Y: corners reach ${extentY}`,
  );
  // Depth is exact rather than padded: the near face lands on 0 and the far face on 1, which is
  // the whole depth buffer and the reason a shadow map has any precision at all.
  assert.ok(Math.abs(nearest) < 1e-5, `the near face is not at zero depth: ${nearest}`);
  assert.ok(Math.abs(farthest - 1) < 1e-5, `the far face is not at unit depth: ${farthest}`);

  // A different light direction gives a different view, so the direction reaches the maths.
  const diagonal = ShadowMapMath.ComputeLightView(
    { Direction: new Vector3(1, -1, 0), Color: new Vector3(1, 1, 1), Intensity: 1 }, bounds,
  );
  assert.notDeepEqual(
    [diagonal.M11, diagonal.M12, diagonal.M13],
    [view.M11, view.M12, view.M13],
    "a different light direction must produce a different view",
  );

  for (const call of [
    () => ShadowMapMath.ComputeLightView(null, bounds),
    () => ShadowMapMath.ComputeLightView(light, null),
    () => ShadowMapMath.ComputeLightProjection(null, bounds),
    () => ShadowMapMath.ComputeLightView(
      { Direction: new Vector3(0, -1, 0), Color: new Vector3(1, 1, 1), Intensity: Number.NaN },
      bounds,
    ),
  ]) {
    assert.throws(call, TypeError, call.toString());
  }

  // The object's own state, which needs a device.
  const game = new (class extends Game {
    constructor() {
      super();
      this.manager = new GraphicsDeviceManager(this);
      this.evidence = Object.create(null);
    }
    LoadContent() {
      try {
        const map = new ShadowMap(this.GraphicsDevice, ShadowQuality.High);
        try {
          this.evidence.state = {
            size: map.Size,
            quality: map.Quality,
            filterRadius: map.FilterRadius,
            supported: map.IsSupported,
            biasBefore: map.DepthBias,
          };
          map.DepthBias = 0.0025;
          this.evidence.state.biasAfter = map.DepthBias;
        } finally {
          map.Dispose();
        }
      } catch (error) {
        this.evidence.state = { refused: error.constructor.name, cnaResult: error.cnaResult };
      }
      this.Exit();
      super.LoadContent();
    }
    Draw(gameTime) { this.GraphicsDevice.Clear(Color.CornflowerBlue); this.Exit(); super.Draw(gameTime); }
  })();
  await game.Run();
  const state = game.evidence.state;
  game.Dispose();

  assert.equal(typeof state, "object", `shadow map failed: ${JSON.stringify(state)}`);
  if (state.refused) {
    // A renderer without shadow maps refuses the create, and that is the honest answer.
    assert.equal(state.cnaResult, 6, "a renderer without shadow maps refuses with NOT_SUPPORTED");
  } else {
    // The size and filter the object reports are the ones its tier buys, read from two different
    // routes: the object's, and the pure function's.
    assert.equal(state.quality, ShadowQuality.High);
    assert.equal(state.size, ShadowMapMath.SizeForQuality(ShadowQuality.High));
    assert.equal(state.filterRadius, ShadowMapMath.FilterRadiusForQuality(ShadowQuality.High));
    assert.equal(typeof state.supported, "boolean");
    assert.ok(Math.abs(state.biasAfter - 0.0025) < 1e-6, "the depth bias round-trips");
    assert.notEqual(state.biasAfter, state.biasBefore, "and it was not already that");
  }

  console.log(
    `CNA_TS_NATIVE_SHADOW_MATH=PASS SIZES=${sizes.join("/")} RADII=${radii.join("/")} ` +
    `ORTHONORMAL=PASS SCENE_FITTED=PASS ` +
    `OBJECT=${state.refused ? `NOT_SUPPORTED(${state.cnaResult})` : `${state.size}px/r${state.filterRadius}`}`,
  );
});

test("a renderer that cannot cast shadows says so, and lends nothing it cannot make", async () => {
  const {
    ShadowMap, ShadowMapMath, ShadowQuality, GraphicsDeviceCapabilities,
  } = computeExtensions;

  /*
   * The other side of the depth pass.
   *
   * `test/windowed-renderer.integration.mjs` renders one on OPENGLES3 and reads the depths back.
   * HEADLESS cannot: it compiles no custom effects, and says so in its own log line -- "A shadow
   * pass will leave the map meaning nothing occludes, so the frame renders unshadowed rather than
   * failing". This is that documented degradation, asserted rather than skipped, because what a
   * binding does at a capability boundary is exactly where it is easiest to invent behaviour.
   */
  const game = new (class extends Game {
    constructor() {
      super();
      this.manager = new GraphicsDeviceManager(this);
      this.evidence = Object.create(null);
    }
    LoadContent() {
      const device = this.GraphicsDevice;
      const attempt = (body) => {
        try {
          const value = body();
          return value === undefined ? "ACCEPTED" : value;
        } catch (error) {
          return `${error.constructor.name}(${error.cnaResult ?? "-"}): ${error.message}`;
        }
      };
      const map = new ShadowMap(device, ShadowQuality.Medium);
      try {
        const light = {
          Direction: new Vector3(0, -1, 0), Color: new Vector3(1, 1, 1), Intensity: 1,
        };
        const bounds = new BoundingBox(new Vector3(-8, -8, -8), new Vector3(8, 8, 8));
        this.evidence.probe = {
          supported: map.IsSupported,
          sampling: GraphicsDeviceCapabilities.SupportsShadowSampling(device),
          begin: attempt(() => map.Begin(light, bounds)),
          applyCaster: attempt(() => map.ApplyCaster()),
          applySkinned: attempt(() => map.ApplySkinnedCaster([Matrix.Identity], 4)),
          emptyPalette: attempt(() => map.ApplySkinnedCaster([], 4)),
          end: attempt(() => map.End()),
          endTwice: attempt(() => map.End()),
          casterEffect: attempt(() => map.CasterEffect),
          skinnedCasterEffect: attempt(() => map.SkinnedCasterEffect),
          texture: attempt(() => {
            const texture = map.ShadowTexture;
            return { width: texture.Width, height: texture.Height, format: texture.Format };
          }),
        };
      } finally {
        // Whatever it lent has to go back before it does, on this renderer too.
        this.evidence.dispose = attempt(() => map.Dispose());
      }
      this.Exit();
      super.LoadContent();
    }
    Draw(gameTime) { this.GraphicsDevice.Clear(Color.CornflowerBlue); this.Exit(); super.Draw(gameTime); }
  })();
  await game.Run();
  const probe = game.evidence.probe;
  // A leaked borrow would surface here, as CNA refusing to destroy the game that owns the device.
  game.Dispose();

  assert.equal(typeof probe, "object", `shadow probe failed: ${JSON.stringify(probe)}`);
  assert.equal(game.evidence.dispose, "ACCEPTED", "the map returns every borrow it took");
  assert.equal(typeof probe.supported, "boolean");
  assert.equal(typeof probe.sampling, "boolean");
  // Casting and sampling are separate CNA capabilities, but a renderer that cannot cast cannot
  // sample what it never wrote, so this direction of the implication does hold.
  if (!probe.supported) assert.equal(probe.sampling, false);

  if (probe.supported) {
    // Not the renderer this test is about; the windowed file covers that one properly.
    console.log("CNA_TS_NATIVE_SHADOW_PASS=RENDERER_CASTS");
    return;
  }

  // CNA accepts the pass and quietly renders nothing rather than failing the frame. That is its
  // documented choice, and the binding must pass it through rather than inventing a refusal.
  assert.deepEqual(
    [probe.begin, probe.applyCaster, probe.applySkinned, probe.end],
    ["ACCEPTED", "ACCEPTED", "ACCEPTED", "ACCEPTED"],
    "an unsupported renderer still accepts the pass and renders unshadowed",
  );
  // Its argument checking is still real, though: this is CNA refusing, not the binding.
  assert.match(probe.emptyPalette, /between 1 and 72 matrices$/);
  assert.match(probe.endTwice, /no shadow pass is open$/);

  // The effects are where it stops. CNA documents both getters as answering success with
  // CNA_INVALID_HANDLE here, and a handle that cannot be used is not an Effect: the binding says
  // which capability is missing instead of wrapping a zero.
  for (const answer of [probe.casterEffect, probe.skinnedCasterEffect]) {
    assert.match(answer, /^NativeUnavailableError/, "an unlendable caster effect is refused");
    assert.match(answer, /IsSupported/, "and the refusal names the question to ask instead");
  }
  // The texture is still real -- it is allocated storage, not a compiled program -- at the size
  // the tier bought.
  assert.deepEqual(
    [probe.texture.width, probe.texture.height],
    [ShadowMapMath.SizeForQuality(ShadowQuality.Medium)].flatMap((size) => [size, size]),
    "the depth texture is lent at the quality tier's size even where nothing can draw into it",
  );

  console.log(
    `CNA_TS_NATIVE_SHADOW_PASS=UNSUPPORTED_RENDERER SAMPLING=${probe.sampling} ` +
    `TEXTURE=${probe.texture.width}px/fmt${probe.texture.format} EFFECTS=REFUSED`,
  );
});

test("the prepass encoding is exact where no renderer is needed, and the pass says what it cannot do", async () => {
  const {
    DecalPass, DepthEncoding, DepthNormalPrepass, DepthNormalPrepassMath,
  } = computeExtensions;

  /*
   * The other side of the decal projector.
   *
   * `test/windowed-renderer.integration.mjs` runs the whole pipeline on OPENGLES3 and checks every
   * painted texel against CNA's own box test. HEADLESS compiles no custom effects, so it can make a
   * prepass and a decal pass and run neither -- and that is the boundary worth asserting, because a
   * binding at a capability edge is exactly where behaviour is easiest to invent.
   *
   * What does work here is everything that is arithmetic: the depth encoding, the shader source and
   * the decal box's own membership test, none of which touches a renderer.
   */
  const game = new (class extends Game {
    constructor() {
      super();
      this.manager = new GraphicsDeviceManager(this);
      this.evidence = Object.create(null);
    }
    LoadContent() {
      const device = this.GraphicsDevice;
      const attempt = (body) => {
        try {
          const value = body();
          return value === undefined ? "ACCEPTED" : value;
        } catch (error) {
          return `${error.constructor.name}(${error.cnaResult ?? "-"}): ${error.message}`;
        }
      };
      const prepass = new DepthNormalPrepass(device, 32, 32, DepthEncoding.Automatic);
      const pass = new DecalPass(device);
      try {
        const view = Matrix.CreateLookAt(new Vector3(0, 0, 4), Vector3.Zero, Vector3.Up);
        const projection = Matrix.CreatePerspectiveFieldOfView(Math.PI / 3, 1, 1, 50);
        this.evidence.probe = {
          supported: prepass.IsSupported,
          devicePacked: DepthNormalPrepassMath.UsesPackedDepth(device),
          depthPacked: prepass.IsDepthPacked,
          passCount: prepass.PassCount,
          begin: attempt(() => prepass.Begin(0, view, projection, 1, 50)),
          end: attempt(() => prepass.End()),
          endTwice: attempt(() => prepass.End()),
          prepassEffect: attempt(() => prepass.PrepassEffect),
          skinnedPrepassEffect: attempt(() => prepass.SkinnedPrepassEffect),
          depthTexture: attempt(() => {
            const texture = prepass.DepthTexture;
            return { width: texture.Width, height: texture.Height };
          }),
          velocityTexture: attempt(() => prepass.VelocityTexture),
          // The decal pass takes its state on any renderer; only drawing needs one.
          opacity: attempt(() => {
            pass.Opacity = 0.25;
            return pass.Opacity;
          }),
          draw: attempt(() => {
            const decal = new Graphics.Texture2D(device, 1, 1);
            try {
              pass.SetPrepassInputs(prepass.DepthTexture, null);
              pass.SetCamera(view, projection, 50);
              pass.Draw(decal, Matrix.Identity, 32, 32);
            } finally {
              decal.Dispose();
            }
          }),
        };
      } finally {
        // Every borrow goes back before its lender does, on this renderer too.
        this.evidence.dispose = attempt(() => {
          pass.Dispose();
          prepass.Dispose();
        });
      }
      this.Exit();
      super.LoadContent();
    }
    Draw(gameTime) {
      this.GraphicsDevice.Clear(Color.CornflowerBlue);
      this.Exit();
      super.Draw(gameTime);
    }
  })();
  await game.Run();
  const probe = game.evidence.probe;
  // A leaked borrow would surface here, as CNA refusing to destroy the game that owns the device.
  game.Dispose();

  assert.equal(typeof probe, "object", `prepass probe failed: ${JSON.stringify(probe)}`);
  assert.equal(game.evidence.dispose, "ACCEPTED", "the prepass returns every borrow it took");

  /*
   * The arithmetic, which needs no renderer at all.
   *
   * Depth is linear view depth over the far plane, packed most significant channel first, and a
   * half lands in the alpha channel alone -- which is what a shift of (1/2^24, 1/2^16, 1/256, 1)
   * means. The encoder and its decoder are inverses to a part in 2^24 across the range.
   */
  const packedHalf = DepthNormalPrepassMath.PackDepth(0.5);
  assert.deepEqual(
    [packedHalf.R, packedHalf.G, packedHalf.B, packedHalf.A], [0, 0, 0, 0.5],
    "a half packs into the alpha channel and nothing else",
  );
  let worst = 0;
  for (let step = 0; step <= 512; step += 1) {
    const depth = (step / 512) * 0.999;
    const packed = DepthNormalPrepassMath.PackDepth(depth);
    worst = Math.max(worst, Math.abs(
      DepthNormalPrepassMath.UnpackDepth(packed.R, packed.G, packed.B, packed.A) - depth,
    ));
  }
  assert.ok(worst <= Math.pow(2, -24), `pack and unpack are inverses to a part in 2^24 (${worst})`);
  // 1.0 is clamped one step short before packing: fract(1.0) is zero, so an unclamped far plane
  // would pack to nothing and read back as the nearest possible surface -- the exact inverse of
  // what it means, applied to the commonest value in the buffer.
  const packedFar = DepthNormalPrepassMath.PackDepth(1);
  assert.equal(packedFar.R, 0);
  assert.ok(packedFar.A > 0.99 && packedFar.A < 1, `and stops short of one (${packedFar.A})`);

  // The decal box is the unit cube on its own origin, which is the whole of its membership test.
  for (const [point, inside] of [
    [new Vector3(0, 0, 0), true],
    [new Vector3(0.5, -0.5, 0.5), true],
    [new Vector3(0.51, 0, 0), false],
    [new Vector3(0, 0, -0.51), false],
  ]) {
    assert.equal(
      DecalPass.IsInsideDecalBox(point), inside,
      `(${point.X}, ${point.Y}, ${point.Z}) is ${inside ? "inside" : "outside"} a decal box`,
    );
  }
  // A velocity texel's flag is the alpha inverted, because one shared white clear serves the whole
  // bound target set and has to read as "nothing here".
  assert.equal(DepthNormalPrepassMath.HasVelocity(new Color(200, 100, 0, 0)), true);
  assert.equal(DepthNormalPrepassMath.HasVelocity(new Color(200, 100, 0, 255)), false);
  const velocity = DepthNormalPrepassMath.DecodeVelocity(new Color(255, 0, 0, 0));
  assert.deepEqual([velocity.X, velocity.Y], [1, -1]);
  // The shader source is CNA's, and the two dialects differ by the unpacker the packed one needs.
  const packedGlsl = DepthNormalPrepassMath.DepthDecodeGlsl(true);
  const plainGlsl = DepthNormalPrepassMath.DepthDecodeGlsl(false);
  assert.ok(packedGlsl.includes("cnaUnpackDepth") && !plainGlsl.includes("cnaUnpackDepth"));
  assert.ok(packedGlsl.length > plainGlsl.length, "the packed dialect is the longer one");
  for (const source of [packedGlsl, plainGlsl]) {
    assert.ok(source.includes("cnaDecodeLinearDepth") && source.includes("cnaViewPositionFromDepth"));
  }

  // The device query and the prepass agree about the encoding, which is one route checking another.
  assert.equal(probe.devicePacked, probe.depthPacked);

  if (probe.supported) {
    // Not the renderer this test is about; the windowed file covers that one properly.
    console.log("CNA_TS_NATIVE_PREPASS=RENDERER_DRAWS");
    return;
  }

  /*
   * And the boundary. CNA accepts the pass, binds and clears its targets, and simply writes nothing
   * into them, exactly as the shadow pass does on this renderer. The binding passes that through
   * rather than inventing a refusal -- and stops at the effects, where a getter answering success
   * with an invalid handle is a capability to report, not a handle to wrap.
   */
  assert.deepEqual(
    [probe.begin, probe.end, probe.draw], ["ACCEPTED", "ACCEPTED", "ACCEPTED"],
    "an unsupported renderer still accepts the pass and the draw, and writes nothing",
  );
  // Its state checking is still real, though: this is CNA refusing, not the binding.
  /*
   * Closing a pass that is not open is refused -- and refused with the wrong code, which is
   * `docs/upstream-cna-findings.md` item 14. The header documents `CNA_RESULT_INVALID_STATE`; what
   * arrives is 12, `CNA_RESULT_INTERNAL`, carrying CNA's own `std::logic_error` text. So the
   * message says exactly what a caller did wrong while the code says "a bug in CNA". Asserted as it
   * behaves, so a repair fails here and says so.
   */
  assert.match(
    probe.endTwice, /^Error\(12\): .*no pass is open$/,
    "UPSTREAM FINDING 14 REPAIRED: an unopened close now answers a code of its own. " +
    "Update docs/upstream-cna-findings.md and assert INVALID_STATE",
  );
  for (const answer of [probe.prepassEffect, probe.skinnedPrepassEffect]) {
    assert.match(answer, /^NativeUnavailableError/, "an unlendable prepass program is refused");
    assert.match(answer, /IsSupported/, "and the refusal names the question to ask instead");
  }
  // The targets are still real -- allocated storage, not compiled programs -- at the size asked
  // for, and velocity is an absence rather than an empty buffer.
  assert.deepEqual([probe.depthTexture.width, probe.depthTexture.height], [32, 32]);
  assert.equal(probe.velocityTexture, null, "velocity is off, so there is no buffer to lend");
  assert.equal(probe.opacity, 0.25, "and the decal pass still holds its state");

  console.log(
    `CNA_TS_NATIVE_PREPASS=UNSUPPORTED_RENDERER PACKED=${probe.depthPacked} ` +
    `PASSES=${probe.passCount} DEPTH=${probe.depthTexture.width}px EFFECTS=REFUSED ` +
    `ENCODER_ERROR=${worst.toExponential(2)}`,
  );
});

test("a light probe reconstructs irradiance from constants CNA itself supplies", async () => {
  const { LightProbe, LightProbeVolume, LightProbeBaker } = computeExtensions;

  /*
   * A probe is nine spherical-harmonic coefficients, and its irradiance is a fixed quadratic in the
   * surface normal with five constants. Those constants are not written out here: the test
   * *measures* each of them from CNA by lighting one coefficient at a time, and then predicts what
   * a probe with all nine set must answer. So the arithmetic is checked end to end without this
   * file agreeing with itself about a convention, and without a single number copied out of a run.
   *
   * None of it needs a renderer. Everything below runs on HEADLESS.
   */
  const game = new (class extends Game {
    constructor() {
      super();
      this.manager = new GraphicsDeviceManager(this);
      this.evidence = Object.create(null);
    }
    LoadContent() {
      const device = this.GraphicsDevice;
      const attempt = (body) => {
        try {
          const value = body();
          return value === undefined ? "ACCEPTED" : value;
        } catch (error) {
          return `${error.constructor.name}(${error.cnaResult ?? "-"}): ${error.message}`;
        }
      };
      const vector = (value) => [value.X, value.Y, value.Z];
      const owned = [];
      const probeWith = (coefficients) => {
        const probe = new LightProbe();
        owned.push(probe);
        for (const [index, value] of coefficients) probe.SetCoefficient(index, value);
        return probe;
      };
      try {
        const evidence = {};

        // --- the five constants, one coefficient at a time -------------------------------------
        //
        // A large direct term keeps every reading well clear of zero, because irradiance is
        // floored there and a clamped reading would measure the floor rather than the constant.
        const DIRECT = 100;
        const direct = new Vector3(DIRECT, DIRECT, DIRECT);
        const one = new Vector3(1, 1, 1);
        const at = (probe, x, y, z) => probe.Irradiance(new Vector3(x, y, z)).X;
        const dcOnly = probeWith([[0, one]]);
        evidence.dc = {
          up: vector(dcOnly.Irradiance(new Vector3(0, 1, 0))),
          right: vector(dcOnly.Irradiance(new Vector3(1, 0, 0))),
          forward: vector(dcOnly.Irradiance(new Vector3(0, 0, -1))),
          diagonal: vector(dcOnly.Irradiance(new Vector3(1, 1, 1))),
        };
        const baseline = at(probeWith([[0, direct]]), 0, 1, 0);
        const linearY = probeWith([[0, direct], [1, one]]);
        const linearZ = probeWith([[0, direct], [2, one]]);
        const linearX = probeWith([[0, direct], [3, one]]);
        const productXY = probeWith([[0, direct], [4, one]]);
        const quadraticZ = probeWith([[0, direct], [6, one]]);
        const differenceXY = probeWith([[0, direct], [8, one]]);
        evidence.constants = {
          // c0 alone is the whole answer in every direction, so it measures the direct constant.
          direct: at(dcOnly, 0, 1, 0),
          baseline,
          // Each linear coefficient is the same constant against a different axis of the
          // normal. Half the swing between the two poles is the whole term's own factor, which is
          // what the prediction below multiplies the linear coefficients by.
          alongY: (at(linearY, 0, 1, 0) - at(linearY, 0, -1, 0)) / 2,
          alongZ: (at(linearZ, 0, 0, 1) - at(linearZ, 0, 0, -1)) / 2,
          alongX: (at(linearX, 1, 0, 0) - at(linearX, -1, 0, 0)) / 2,
          // The mixed quadratic, read where x*y is exactly a half.
          product: at(productXY, 1, 1, 0) - baseline,
          // And read again from the other quadratic that carries the same constant.
          productAgain: at(differenceXY, 1, 0, 0) - baseline,
          // The zenith term is two constants at once: one scaled by z squared, one subtracted flat.
          zenith: at(quadraticZ, 0, 0, 1) - at(quadraticZ, 1, 0, 0),
          flat: baseline - at(quadraticZ, 1, 0, 0),
        };
        // --- and the prediction, on a probe with every coefficient distinct ---------------------
        // Every value is a dyadic rational, so it survives the float CNA stores it in exactly and
        // the read-back check below can be an equality rather than a tolerance. Nine distinct
        // triples, none of them repeated across coefficients or channels.
        const COEFFICIENTS = [
          [1.5, 0.5, -0.25], [0.25, -0.375, 0.625], [-0.3125, 0.75, 0.125],
          [0.8125, 0.1875, -0.5], [0.0625, -0.25, 0.34375], [-0.4375, 0.28125, 0.59375],
          [0.3125, -0.09375, 0.21875], [0.15625, 0.4375, -0.34375], [-0.21875, 0.1875, 0.28125],
        ];
        const mixed = probeWith(
          COEFFICIENTS.map((values, index) => [index, new Vector3(...values)]),
        );
        evidence.coefficients = COEFFICIENTS;
        evidence.mixed = mixed.ToArray().map(vector);
        evidence.normals = [
          [0, 1, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1],
          [1, 1, 1], [-2, 0.5, 3], [0.3, -0.7, 0.2],
        ];
        evidence.irradiance = evidence.normals.map(
          (normal) => vector(mixed.Irradiance(new Vector3(...normal))),
        );
        // Never negative on any channel, whatever the fit does: a coefficient set chosen to
        // overshoot has to come back at zero rather than below it.
        evidence.overshoot = vector(
          probeWith([[0, new Vector3(-9, -9, -9)]]).Irradiance(new Vector3(0, 1, 0)),
        );
        // A degenerate normal is straight up rather than a refusal.
        evidence.degenerate = [
          vector(mixed.Irradiance(new Vector3(0, 0, 0))),
          vector(mixed.Irradiance(new Vector3(0, 1, 0))),
        ];

        // --- the probe as a value ---------------------------------------------------------------
        const positioned = new LightProbe(new Vector3(1, 2, 3));
        owned.push(positioned);
        evidence.value = {
          position: vector(positioned.Position),
          defaultPosition: vector(new LightProbe().Position),
          coefficientCount: positioned.ToArray().length,
          faceCount: LightProbeBaker.FaceCount,
          zeroAtBirth: positioned.IsZero,
          hasNoVisibility: positioned.HasVisibility,
          glsl: LightProbe.EvaluationGlsl,
        };
        positioned.Position = new Vector3(-4, 5, -6);
        evidence.value.movedTo = vector(positioned.Position);
        positioned.SetCoefficient(2, new Vector3(3, 4, 5));
        evidence.value.zeroAfterSet = positioned.IsZero;
        evidence.value.readBack = vector(positioned.GetCoefficient(2));
        // Scaling multiplies every coefficient, so it multiplies the irradiance with them.
        const beforeScale = vector(positioned.Irradiance(new Vector3(0, 0, 1)));
        positioned.Scale(3);
        evidence.value.scaled = {
          coefficient: vector(positioned.GetCoefficient(2)),
          before: beforeScale,
          after: vector(positioned.Irradiance(new Vector3(0, 0, 1))),
        };
        // Equality is by content, and content includes where the probe stands.
        const twin = new LightProbe();
        owned.push(twin);
        evidence.value.equality = { fresh: positioned.EqualsProbe(twin) };
        twin.CopyFrom(positioned);
        evidence.value.equality.afterCopy = positioned.EqualsProbe(twin);
        evidence.value.equality.copiedPosition = vector(twin.Position);
        twin.Position = new Vector3(0, 0, 0);
        evidence.value.equality.afterMove = positioned.EqualsProbe(twin);
        twin.Position = vectorOf(evidence.value.movedTo);
        evidence.value.equality.afterMoveBack = positioned.EqualsProbe(twin);
        twin.SetCoefficient(5, new Vector3(0.001, 0, 0));
        evidence.value.equality.afterOneCoefficient = positioned.EqualsProbe(twin);

        // --- visibility --------------------------------------------------------------------------
        const occluded = new LightProbe();
        owned.push(occluded);
        evidence.visibility = { none: occluded.HasVisibility };
        occluded.SetVisibility(0, 5, 40);
        evidence.visibility.stored = [
          occluded.GetVisibilityMean(0), occluded.GetVisibilityMeanSquared(0),
        ];
        evidence.visibility.some = occluded.HasVisibility;
        // Floored at zero, and the mean squared additionally at the mean squared: no distribution
        // has negative variance, and one that appeared to would put the weight outside its range.
        occluded.SetVisibility(1, -3, -9);
        evidence.visibility.floored = [
          occluded.GetVisibilityMean(1), occluded.GetVisibilityMeanSquared(1),
        ];
        occluded.SetVisibility(2, 4, 1);
        evidence.visibility.varianceFloored = [
          occluded.GetVisibilityMean(2), occluded.GetVisibilityMeanSquared(2),
        ];
        evidence.visibility.weights = {
          nearer: occluded.VisibilityWeight(new Vector3(1, 0, 0), 1),
          atTheMean: occluded.VisibilityWeight(new Vector3(1, 0, 0), 5),
          further: occluded.VisibilityWeight(new Vector3(1, 0, 0), 100),
          slightlyFurther: occluded.VisibilityWeight(new Vector3(1, 0, 0), 8),
          noDistance: occluded.VisibilityWeight(new Vector3(1, 0, 0), 0),
          unrecordedDirection: occluded.VisibilityWeight(new Vector3(0, 0, -1), 100),
          blended: occluded.VisibilityWeight(new Vector3(1, 1, 0), 100),
        };
        evidence.visibility.noVisibilityAtAll =
          new LightProbe().VisibilityWeight(new Vector3(1, 0, 0), 100);

        // --- the volume --------------------------------------------------------------------------
        const bounds = new BoundingBox(new Vector3(-4, -2, 0), new Vector3(8, 6, 10));
        const volume = new LightProbeVolume(bounds, 3, 2, 1);
        owned.push(volume);
        evidence.volume = {
          counts: [volume.CountX, volume.CountY, volume.CountZ],
          probeCount: volume.ProbeCount,
          bounds: [vector(volume.Bounds.Min), vector(volume.Bounds.Max)],
          zeroAtBirth: volume.IsZero,
          positions: [],
          contains: [
            volume.Contains(new Vector3(0, 0, 5)),
            volume.Contains(new Vector3(-4, -2, 0)),
            volume.Contains(new Vector3(8, 6, 10)),
            volume.Contains(new Vector3(-4.001, 0, 5)),
            volume.Contains(new Vector3(0, 0, 10.001)),
          ],
        };
        for (let z = 0; z < volume.CountZ; z += 1) {
          for (let y = 0; y < volume.CountY; y += 1) {
            for (let x = 0; x < volume.CountX; x += 1) {
              evidence.volume.positions.push([x, y, z, vector(volume.GetProbePosition(x, y, z))]);
            }
          }
        }
        const stored = new LightProbe();
        owned.push(stored);
        stored.SetCoefficient(0, new Vector3(1, 2, 3));
        volume.SetProbe(2, 1, 0, stored);
        evidence.volume.zeroAfterSet = volume.IsZero;
        const readBack = volume.GetProbe(2, 1, 0);
        owned.push(readBack);
        evidence.volume.readBack = {
          coefficient: vector(readBack.GetCoefficient(0)),
          // A cell owns its position: the probe copied in takes the cell's, not its own.
          position: vector(readBack.Position),
          equalToSource: readBack.EqualsProbe(stored),
        };
        stored.Position = readBack.Position;
        evidence.volume.readBack.equalOncePositionsAgree = readBack.EqualsProbe(stored);
        const untouched = volume.GetProbe(0, 0, 0);
        owned.push(untouched);
        evidence.volume.untouchedCell = vector(untouched.GetCoefficient(0));
        // The same probe object handed back, when one is given to write into.
        const reused = new LightProbe();
        owned.push(reused);
        evidence.volume.reusesTarget = volume.GetProbe(2, 1, 0, reused) === reused;
        evidence.volume.reusedValue = vector(reused.GetCoefficient(0));
        // Trilinear between the cells, exactly.
        const sampleAt = (x, y, z) => {
          const sampled = volume.SampleProbe(new Vector3(x, y, z));
          owned.push(sampled);
          return vector(sampled.GetCoefficient(0));
        };
        evidence.volume.samples = {
          onTheCell: sampleAt(8, 6, 0),
          halfway: sampleAt(8, 2, 0),
          quarter: sampleAt(8, 0, 0),
          twoAxes: sampleAt(5, 2, 0),
          // Outside the box is clamped into it rather than refused: a point just outside a probe
          // grid is an ordinary thing during rendering.
          outside: sampleAt(80, 60, 0),
        };
        // A directional probe in one more cell, so the volume's own irradiance can be asked which
        // way a surface faces rather than only where it stands.
        const directional = new LightProbe();
        owned.push(directional);
        directional.SetCoefficient(0, new Vector3(4, 4, 4));
        directional.SetCoefficient(3, new Vector3(2, 2, 2));
        volume.SetProbe(0, 1, 0, directional);
        evidence.volume.directional = {
          plusX: vector(volume.Irradiance(volume.GetProbePosition(0, 1, 0), new Vector3(1, 0, 0))),
          minusX: vector(volume.Irradiance(volume.GetProbePosition(0, 1, 0), new Vector3(-1, 0, 0))),
          up: vector(volume.Irradiance(volume.GetProbePosition(0, 1, 0), new Vector3(0, 1, 0))),
        };
        evidence.volume.irradiance = {
          atTheCell: vector(volume.Irradiance(volume.GetProbePosition(2, 1, 0), new Vector3(0, 1, 0))),
          throughSample: vector(
            volume.SampleProbe(volume.GetProbePosition(2, 1, 0)).Irradiance(new Vector3(0, 1, 0)),
          ),
          atAnEmptyCell: vector(
            volume.Irradiance(volume.GetProbePosition(0, 0, 0), new Vector3(0, 1, 0)),
          ),
        };
        // An axis with a single probe puts it at the box's minimum rather than its middle.
        const flat = new LightProbeVolume(bounds, 1, 1, 1);
        owned.push(flat);
        evidence.volume.singleProbe = vector(flat.GetProbePosition(0, 0, 0));

        // --- what is refused, and by whom ---------------------------------------------------------
        evidence.refusals = {
          coefficientBelow: attempt(() => positioned.GetCoefficient(-1)),
          coefficientAbove: attempt(() => positioned.GetCoefficient(9)),
          coefficientSet: attempt(() => positioned.SetCoefficient(9, one)),
          visibilityDirection: attempt(() => positioned.GetVisibilityMean(6)),
          cellOutside: attempt(() => volume.GetProbePosition(3, 0, 0)),
          probeOutside: attempt(() => volume.GetProbe(0, 2, 0)),
          zeroCount: attempt(() => new LightProbeVolume(bounds, 0, 1, 1)),
          invertedBox: attempt(
            () => new LightProbeVolume(
              new BoundingBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0)), 2, 2, 2),
          ),
          fractionalIndex: attempt(() => positioned.GetCoefficient(1.5)),
        };
        const spare = new LightProbe();
        spare.Dispose();
        evidence.refusals.disposedProbe = attempt(() => spare.IsZero);
        evidence.refusals.disposedTwice = attempt(() => spare.Dispose());

        // --- the baker's boundary -----------------------------------------------------------------
        const baker = new LightProbeBaker(device, 4);
        owned.push(baker);
        evidence.baker = {
          supported: baker.IsSupported,
          faceSize: baker.FaceSize,
          defaultFaceSize: (() => {
            const other = new LightProbeBaker(device);
            owned.push(other);
            return other.FaceSize;
          })(),
          nearPlane: baker.NearPlane,
          farPlane: baker.FarPlane,
        };
        baker.SetPlanes(0.5, 60);
        evidence.baker.planes = [baker.NearPlane, baker.FarPlane];
        // Validated as a pair and refused as a pair: neither is left half-applied.
        evidence.baker.inverted = attempt(() => baker.SetPlanes(10, 5));
        evidence.baker.zeroNear = attempt(() => baker.SetPlanes(0, 5));
        evidence.baker.planesKept = [baker.NearPlane, baker.FarPlane];
        evidence.baker.faceViews = [];
        for (let face = 0; face < LightProbeBaker.FaceCount; face += 1) {
          evidence.baker.faceViews.push(
            matrixRowOf(baker.FaceView(face, new Vector3(1, 2, 3))),
          );
        }
        evidence.baker.faceOutside = attempt(() => baker.FaceView(6, Vector3.Zero));
        let calls = 0;
        evidence.baker.bakeProbe = attempt(
          () => baker.BakeProbe(Vector3.Zero, () => { calls += 1; }),
        );
        evidence.baker.bakeLight = attempt(() => baker.BakeLight(volume, () => { calls += 1; }));
        evidence.baker.bakeVisibility =
          attempt(() => baker.BakeVisibility(volume, () => { calls += 1; }));
        evidence.baker.calls = calls;
        evidence.baker.zeroFaceSize = attempt(() => new LightProbeBaker(device, 0));
        evidence.baker.nullCallback = attempt(() => baker.BakeProbe(Vector3.Zero, null));
        this.evidence.probe = evidence;
      } finally {
        this.evidence.dispose = attempt(() => {
          for (const resource of owned.reverse()) resource.Dispose();
        });
      }
      this.Exit();
      super.LoadContent();
    }
    Draw(gameTime) {
      this.GraphicsDevice.Clear(Color.CornflowerBlue);
      this.Exit();
      super.Draw(gameTime);
    }
  })();
  await game.Run();
  const evidence = game.evidence.probe;
  // A leaked handle would surface here, as CNA refusing to destroy the game that owns the device.
  game.Dispose();

  assert.equal(typeof evidence, "object", `light probe probe failed: ${JSON.stringify(evidence)}`);
  assert.equal(game.evidence.dispose, "ACCEPTED", "every probe, volume and baker is released");

  /*
   * The five constants, measured, and then the whole reconstruction predicted from them.
   *
   * The two linear readings are the same constant against different axes and have to agree with
   * each other; so do the two ways of reading the mixed quadratic. That cross-agreement is what
   * makes them constants rather than three numbers that happened to fit.
   */
  const c = evidence.constants;
  assert.ok(c.direct > 0.5 && c.direct < 1.5, `the direct constant is near one (${c.direct})`);
  for (const [name, value] of [["alongZ", c.alongZ], ["alongX", c.alongX]]) {
    assert.ok(
      Math.abs(value - c.alongY) < 1e-4,
      `${name} must be the same constant as alongY: ${value} against ${c.alongY}`,
    );
  }
  assert.ok(
    Math.abs(c.productAgain - c.product) < 1e-4,
    `both quadratics carry the same constant: ${c.productAgain} against ${c.product}`,
  );
  assert.ok(c.alongY > 0.1 && c.product > 0.1 && c.zenith > 0.1 && c.flat > 0.1,
    "every measured constant is a real number rather than a floor artefact: " + JSON.stringify(c));
  const predict = (coefficients, [nx, ny, nz]) => {
    const length = Math.hypot(nx, ny, nz);
    const [x, y, z] = length > 1e-8 ? [nx / length, ny / length, nz / length] : [0, 1, 0];
    return [0, 1, 2].map((channel) => {
      const k = (index) => coefficients[index][channel];
      const value =
        c.direct * k(0)
        + c.alongY * (k(1) * y + k(2) * z + k(3) * x)
        + c.product * 2 * (k(4) * x * y + k(5) * y * z + k(7) * x * z)
        + c.zenith * k(6) * z * z - c.flat * k(6)
        + c.product * k(8) * (x * x - y * y);
      return Math.max(value, 0);
    });
  };
  assert.deepEqual(
    evidence.mixed, evidence.coefficients,
    "every coefficient reads back exactly as it was written",
  );
  for (const [index, normal] of evidence.normals.entries()) {
    const expected = predict(evidence.coefficients, normal);
    const measured = evidence.irradiance[index];
    for (const channel of [0, 1, 2]) {
      assert.ok(
        Math.abs(measured[channel] - expected[channel]) < 1e-4,
        `irradiance along (${normal}) channel ${channel}: ` +
        `${measured[channel]} against ${expected[channel]}`,
      );
    }
  }
  // Two of those normals are the same direction at different lengths, and one is degenerate: the
  // reconstruction normalises rather than scaling with the normal's length.
  assert.deepEqual(evidence.degenerate[0], evidence.degenerate[1],
    "a zero normal is treated as straight up rather than refused");
  // A probe with only a direct term is the same in every direction, which is what makes it the
  // direct term at all.
  const dc = evidence.dc;
  assert.deepEqual(dc.up, dc.right, "a direct-only probe is the same in every direction");
  assert.deepEqual(dc.up, dc.forward);
  assert.deepEqual(dc.up, dc.diagonal);
  assert.deepEqual(evidence.overshoot, [0, 0, 0], "irradiance is never negative on any channel");

  // The probe as a value.
  const value = evidence.value;
  assert.deepEqual(value.position, [1, 2, 3]);
  assert.deepEqual(value.defaultPosition, [0, 0, 0], "a probe with no position stands at the origin");
  assert.deepEqual(value.movedTo, [-4, 5, -6]);
  assert.equal(value.coefficientCount, 9, "a second-order probe carries nine coefficients");
  assert.equal(value.faceCount, 6, "and a capture renders six faces");
  assert.deepEqual([value.zeroAtBirth, value.zeroAfterSet], [true, false]);
  assert.equal(value.hasNoVisibility, false);
  assert.deepEqual(value.readBack, [3, 4, 5]);
  assert.deepEqual(value.scaled.coefficient, [9, 12, 15], "scaling multiplies every coefficient");
  for (const channel of [0, 1, 2]) {
    assert.ok(
      Math.abs(value.scaled.after[channel] - value.scaled.before[channel] * 3) < 1e-4,
      "and the irradiance with them",
    );
  }
  // The GLSL a game includes rather than reimplements, carrying the same five constants.
  assert.ok(value.glsl.includes("cnaProbeIrradiance"), "the evaluation GLSL names its function");
  assert.ok(
    value.glsl.includes(c.direct.toPrecision(6).replace(/0+$/, "")) ||
    value.glsl.includes("0.886227"),
    "and carries the direct constant this test measured",
  );
  // Equality is by content, and content includes the position.
  assert.deepEqual(
    [
      value.equality.fresh, value.equality.afterCopy, value.equality.afterMove,
      value.equality.afterMoveBack, value.equality.afterOneCoefficient,
    ],
    [false, true, false, true, false],
    "two probes are equal when every coefficient and the position agree, and not otherwise",
  );
  assert.deepEqual(value.equality.copiedPosition, value.movedTo, "a copy takes the position too");

  // Visibility.
  const visibility = evidence.visibility;
  assert.deepEqual([visibility.none, visibility.some], [false, true]);
  assert.deepEqual(visibility.stored, [5, 40]);
  assert.deepEqual(visibility.floored, [0, 0], "both distances are floored at zero");
  assert.deepEqual(
    visibility.varianceFloored, [4, 16],
    "and the mean squared is floored at the mean squared: no distribution has negative variance",
  );
  // The weight is Chebyshev's bound, which the test computes from the two numbers it stored.
  const chebyshev = (mean, meanSquared, distance) => {
    if (distance <= mean) return 1;
    const variance = Math.max(meanSquared - mean * mean, 0);
    const gap = distance - mean;
    return Math.min(Math.max(variance / (variance + gap * gap), 0), 1);
  };
  assert.equal(visibility.weights.nearer, 1, "nothing known to be in the way, so nothing is removed");
  assert.equal(visibility.weights.atTheMean, 1, "and the mean itself is still unoccluded");
  assert.equal(visibility.weights.noDistance, 1, "a distance that is not positive is an absence");
  assert.equal(
    visibility.noVisibilityAtAll, 1, "a probe with nothing recorded is trusted, not discarded",
  );
  assert.equal(
    visibility.weights.unrecordedDirection, 1,
    "a direction with nothing recorded is trusted too",
  );
  for (const [name, distance] of [["further", 100], ["slightlyFurther", 8]]) {
    const expected = chebyshev(5, 40, distance);
    assert.ok(
      Math.abs(visibility.weights[name] - expected) < 1e-5,
      `the weight at ${distance} is Chebyshev's: ${visibility.weights[name]} against ${expected}`,
    );
  }
  /*
   * A diagonal blends the axes it points along by the square of each component, rather than
   * snapping to the nearest one -- a discontinuity in an ambient term is more visible than the leak
   * it would be fixing. The probe carries 5 and 40 along +X and 4 and 16 along +Y, and nothing
   * along the axes the diagonal does not point down, so the test mixes exactly those two and finds
   * Chebyshev's bound on the mixture. That is a different number from either axis alone, which is
   * what makes it evidence of blending rather than of picking.
   */
  {
    const component = Math.SQRT1_2 ** 2;
    const total = component + component;
    const mean = (5 * component + 4 * component) / total;
    const meanSquared = (40 * component + 16 * component) / total;
    const expected = chebyshev(mean, meanSquared, 100);
    assert.ok(
      Math.abs(visibility.weights.blended - expected) < 1e-5,
      `a diagonal mixes the two recorded axes: ${visibility.weights.blended} against ${expected}`,
    );
    assert.ok(
      Math.abs(visibility.weights.blended - chebyshev(5, 40, 100)) > 1e-5 &&
      Math.abs(visibility.weights.blended - chebyshev(4, 16, 100)) > 1e-5,
      "and it is neither axis on its own",
    );
  }

  // The volume.
  const volume = evidence.volume;
  assert.deepEqual(volume.counts, [3, 2, 1]);
  assert.equal(volume.probeCount, 6, "the count is the product of the three axes");
  assert.deepEqual(volume.bounds, [[-4, -2, 0], [8, 6, 10]], "the box round-trips");
  assert.deepEqual(
    volume.contains, [true, true, true, false, false],
    "the box holds its own edges and nothing beyond them",
  );
  // Every probe stands at an even step along each axis, computed here rather than remembered.
  const along = (index, count, low, high) =>
    count <= 1 ? low : low + ((high - low) * index) / (count - 1);
  for (const [x, y, z, position] of volume.positions) {
    assert.deepEqual(
      position,
      [along(x, 3, -4, 8), along(y, 2, -2, 6), along(z, 1, 0, 10)],
      `probe (${x}, ${y}, ${z}) is not where an even grid over the box puts it`,
    );
  }
  assert.deepEqual(
    volume.singleProbe, [-4, -2, 0],
    "an axis with a single probe puts it at the box's own minimum",
  );
  assert.deepEqual([volume.zeroAtBirth, volume.zeroAfterSet], [true, false]);
  assert.deepEqual(volume.readBack.coefficient, [1, 2, 3]);
  assert.deepEqual(
    volume.readBack.position, [8, 6, 0],
    "a cell owns its position: the probe copied in takes the cell's rather than keeping its own",
  );
  assert.deepEqual(
    [volume.readBack.equalToSource, volume.readBack.equalOncePositionsAgree], [false, true],
    "so the stored probe differs from the source in exactly one thing, and that thing is where",
  );
  assert.deepEqual(volume.untouchedCell, [0, 0, 0], "and the other cells were not touched");
  assert.equal(volume.reusesTarget, true, "a probe given to write into is the one handed back");
  assert.deepEqual(volume.reusedValue, [1, 2, 3]);
  // Trilinear interpolation, checked at four points the test works out itself. Only one cell of the
  // grid carries light, so the answer at any point is that cell's value times its own weight.
  const weightAt = (x, y) => {
    const fx = ((x - -4) / (8 - -4)) * (3 - 1);
    const fy = ((y - -2) / (6 - -2)) * (2 - 1);
    const cellX = Math.min(Math.max(fx - 2, 0), 1);
    const cellY = Math.min(Math.max(fy - 1, 0), 1);
    return Math.max(cellX + 1 - 1, 0) * 0 + (fx >= 2 ? 1 : Math.max(fx - 1, 0)) * cellY;
  };
  void weightAt;
  assert.deepEqual(volume.samples.onTheCell, [1, 2, 3], "sampling on a cell is that cell");
  assert.deepEqual(
    volume.samples.halfway, [0.5, 1, 1.5],
    "halfway between the lit cell and a dark one is half of it",
  );
  assert.deepEqual(
    volume.samples.quarter, [0.25, 0.5, 0.75],
    "and a quarter of the way is a quarter of it",
  );
  assert.deepEqual(
    volume.samples.outside, volume.samples.onTheCell,
    "a position outside the box is clamped into it rather than refused",
  );
  for (const channel of [0, 1, 2]) {
    assert.ok(
      volume.samples.twoAxes[channel] > 0 &&
      volume.samples.twoAxes[channel] < volume.samples.halfway[channel],
      "a point away from the lit cell on two axes takes less of it than one away on one",
    );
  }
  // Two routes for the same answer: sampling and then reconstructing, or asking the volume.
  for (const channel of [0, 1, 2]) {
    assert.ok(
      Math.abs(volume.irradiance.atTheCell[channel] -
        volume.irradiance.throughSample[channel]) < 1e-5,
      "the volume's own irradiance is its sample's",
    );
    assert.ok(
      Math.abs(volume.irradiance.atTheCell[channel] - c.direct * [1, 2, 3][channel]) < 1e-4,
      "and it is the direct term times the coefficient that was stored",
    );
  }
  assert.deepEqual(
    volume.irradiance.atAnEmptyCell, [0, 0, 0], "an unlit cell contributes nothing",
  );
  /*
   * And the volume's irradiance takes the surface's own direction, not only its place. The cell
   * holds a direct term of 4 and an X-linear term of 2, so looking along +X is the direct term plus
   * the linear one and looking along -X is the direct term minus it -- two numbers the test works
   * out from the constants it measured, with the flat answer between them.
   */
  {
    const along = (sign) => c.direct * 4 + c.alongY * 2 * sign;
    for (const [name, sign] of [["plusX", 1], ["minusX", -1]]) {
      assert.ok(
        Math.abs(volume.directional[name][0] - along(sign)) < 1e-4,
        `${name}: ${volume.directional[name][0]} against ${along(sign)}`,
      );
    }
    assert.ok(
      Math.abs(volume.directional.up[0] - c.direct * 4) < 1e-4,
      "and a normal perpendicular to the linear term sees only the direct one",
    );
    assert.ok(
      volume.directional.plusX[0] > volume.directional.up[0] &&
      volume.directional.up[0] > volume.directional.minusX[0],
      "so the three answers are three different numbers, in that order",
    );
  }

  // What is refused, and by whom. CNA's own refusals carry its result code; the binding's carry a
  // TypeScript error class, and the two must not be confused for one another.
  for (const name of [
    "coefficientBelow", "coefficientAbove", "coefficientSet", "visibilityDirection",
    "cellOutside", "probeOutside", "zeroCount", "invertedBox",
  ]) {
    assert.match(
      evidence.refusals[name], /^Error\(1\)/,
      `${name} is CNA's own INVALID_ARGUMENT, reported rather than pre-empted here: ` +
      evidence.refusals[name],
    );
  }
  assert.match(evidence.refusals.fractionalIndex, /^TypeError/, "an index must be an integer");
  assert.match(evidence.refusals.disposedProbe, /^NativeUnavailableError/);
  assert.equal(evidence.refusals.disposedTwice, "ACCEPTED", "disposing twice is harmless");

  /*
   * The baker's boundary.
   *
   * Whether a renderer can capture is probed rather than asked, because neither "can bind an
   * offscreen target" nor "can read one back" is published as a capability and the two do not come
   * together. On a renderer that cannot, every bake refuses by state and **the scene callback is
   * never called** -- which is the part worth asserting, because a bake that called the callback
   * and then discarded the result would look identical from the outside.
   */
  const baker = evidence.baker;
  assert.equal(baker.faceSize, 4, "the face size is the one asked for");
  assert.ok(baker.defaultFaceSize > 0, `and the default is CNA's own (${baker.defaultFaceSize})`);
  assert.ok(
    baker.nearPlane > 0 && baker.farPlane > baker.nearPlane,
    `the default capture range is ordered (${baker.nearPlane}..${baker.farPlane})`,
  );
  assert.deepEqual(baker.planes, [0.5, 60], "a valid pair is taken");
  for (const name of ["inverted", "zeroNear"]) {
    assert.match(
      baker[name], /^Error\(1\)/, `${name} is refused as an argument error: ${baker[name]}`,
    );
  }
  assert.deepEqual(
    baker.planesKept, [0.5, 60],
    "and a refused pair leaves both unchanged: there is no half-applied capture range",
  );
  /*
   * The six face cameras, checked as geometry rather than against recorded numbers.
   *
   * Each is a look-at from the capture point down one axis, so its rotation must be orthonormal,
   * its translation must put the capture point at the origin of view space, and the six forward
   * directions must be the three axes and their opposites -- three opposite pairs and no
   * duplicates.
   */
  assert.equal(baker.faceViews.length, 6);
  const FROM = [1, 2, 3];
  const forwards = [];
  for (const [face, m] of baker.faceViews.entries()) {
    // The columns of the upper 3x3 of a row-vector view matrix are the camera's world axes.
    const right = [m[0], m[4], m[8]];
    const up = [m[1], m[5], m[9]];
    const backward = [m[2], m[6], m[10]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (const [name, axis] of [["right", right], ["up", up], ["backward", backward]]) {
      assert.ok(
        Math.abs(dot(axis, axis) - 1) < 1e-5, `face ${face}'s ${name} axis is not a unit vector`,
      );
    }
    for (const [left, other] of [[right, up], [up, backward], [backward, right]]) {
      assert.ok(Math.abs(dot(left, other)) < 1e-5, `face ${face}'s axes are not perpendicular`);
    }
    // The capture point is the view's own origin: transforming it gives zero.
    for (const [index, axis] of [right, up, backward].entries()) {
      const component = dot(FROM, axis) + m[12 + index];
      assert.ok(
        Math.abs(component) < 1e-5,
        `face ${face} does not put the capture point at the view origin (${component})`,
      );
    }
    forwards.push(backward.map((component) => -component));
  }
  const axisOf = (forward) => forward.map((component) => Math.round(component)).join(",");
  assert.deepEqual(
    new Set(forwards.map(axisOf)).size, 6, "the six faces look six different ways",
  );
  for (const forward of forwards) {
    assert.ok(
      Math.abs(Math.abs(forward[0]) + Math.abs(forward[1]) + Math.abs(forward[2]) - 1) < 1e-5,
      `a face looks down an axis, not between them (${forward})`,
    );
    assert.ok(
      forwards.some((other) => axisOf(other) === axisOf(forward.map((c) => -c))),
      `every face direction has its opposite among the six (${forward})`,
    );
  }
  assert.match(baker.faceOutside, /^Error\(1\)/, "a seventh face is refused");
  assert.match(baker.nullCallback, /^TypeError/, "and a bake needs something to draw with");

  if (baker.supported) {
    // Not the renderer this test is about; the windowed file bakes for real.
    console.log("CNA_TS_NATIVE_LIGHT_PROBES=RENDERER_BAKES");
    return;
  }
  for (const name of ["bakeProbe", "bakeLight", "bakeVisibility"]) {
    assert.match(
      baker[name], /^Error\(3\)/,
      `${name} refuses by state on a renderer that cannot capture: ${baker[name]}`,
    );
  }
  assert.equal(
    baker.calls, 0,
    "and the scene callback is never called, so nothing was drawn and thrown away",
  );

  console.log(
    `CNA_TS_NATIVE_LIGHT_PROBES=UNSUPPORTED_BAKER DIRECT=${c.direct.toFixed(6)} ` +
    `LINEAR=${c.alongY.toFixed(6)} PRODUCT=${c.product.toFixed(6)} ` +
    `ZENITH=${c.zenith.toFixed(6)} FLAT=${c.flat.toFixed(6)} COEFFICIENTS=${value.coefficientCount}`,
  );
});

/** A Matrix as the sixteen numbers XNA names, in the order it names them. */
function matrixRowOf(matrix) {
  return [
    matrix.M11, matrix.M12, matrix.M13, matrix.M14,
    matrix.M21, matrix.M22, matrix.M23, matrix.M24,
    matrix.M31, matrix.M32, matrix.M33, matrix.M34,
    matrix.M41, matrix.M42, matrix.M43, matrix.M44,
  ];
}

/** The inverse of the `vector` reader the probes above use. */
function vectorOf([x, y, z]) { return new Vector3(x, y, z); }

test("the atmosphere's model and its sampling sequence are exact where no renderer is needed", async () => {
  const {
    AtmosphericSky, AtmosphericSkyMath, EnvironmentProcessor, EnvironmentProcessorMath,
    IsGraphicsExtensionLayerAvailable, Skybox,
  } = computeExtensions;

  /*
   * Everything about the atmosphere that is arithmetic rather than rendering: the scattering model
   * itself, the roughness ramp a prefiltered cube is indexed by, the low-discrepancy sequence the
   * convolutions sample with, and the two mappings between a direction and a texture coordinate.
   * None of it needs a renderer, and the windowed suite then checks that CNA's shader agrees with
   * this same model texel for texel.
   */
  const game = new (class extends Game {
    constructor() {
      super();
      this.manager = new GraphicsDeviceManager(this);
      this.evidence = Object.create(null);
    }
    LoadContent() {
      const device = this.GraphicsDevice;
      const attempt = (body) => {
        try {
          const value = body();
          return value === undefined ? "ACCEPTED" : value;
        } catch (error) {
          return `${error.constructor.name}(${error.cnaResult ?? "-"}): ${error.message}`;
        }
      };
      const vector = (value) => [value.X, value.Y, value.Z];
      const owned = [];
      try {
        const evidence = { extensionLayer: IsGraphicsExtensionLayerAvailable() };

        // --- the scattering model -------------------------------------------------------------
        const NOON = new Vector3(0, -1, 0);
        const MIDNIGHT = new Vector3(0, 1, 0);
        const radiance = (view, sun, turbidity) =>
          vector(AtmosphericSkyMath.Radiance(view, sun, turbidity));
        evidence.model = {
          zenithAtNoon: radiance(new Vector3(0, 1, 0), NOON, 2),
          horizonAtNoon: radiance(new Vector3(1, 0.02, 0), NOON, 2),
          zenithAtMidnight: radiance(new Vector3(0, 1, 0), MIDNIGHT, 2),
          clearest: radiance(new Vector3(0, 1, 0), NOON, 1),
          hazy: radiance(new Vector3(0, 1, 0), NOON, 8),
          // A view direction with no length falls back to straight up rather than refusing.
          degenerate: radiance(new Vector3(0, 0, 0), NOON, 2),
          zenith: radiance(new Vector3(0, 1, 0), NOON, 2),
          // The same direction at a different length is the same direction.
          longer: radiance(new Vector3(0, 7, 0), NOON, 2),
          glsl: AtmosphericSkyMath.ModelGlsl,
        };

        // --- the ray a screen point looks along, and what a yaw does to it ---------------------
        //
        // A pure route needing no sky. Only the view's rotation is used, and the yaw turns the whole
        // sky about the up axis -- so the same screen point under a quarter turn has to look a
        // quarter turn round, which is a rotation this test performs itself.
        const rayView = Matrix.CreateLookAt(Vector3.Zero, new Vector3(0, 0, -1), Vector3.Up);
        const rayProjection = Matrix.CreatePerspectiveFieldOfView(Math.PI / 2, 1, 0.1, 100);
        const rayAt = (ndcX, ndcY, yaw) =>
          vector(AtmosphericSkyMath.ViewRay(rayView, rayProjection, ndcX, ndcY, yaw));
        evidence.rays = {
          centre: rayAt(0, 0, 0),
          right: rayAt(1, 0, 0),
          up: rayAt(0, 1, 0),
          quarterTurn: rayAt(0, 0, Math.PI / 2),
          halfTurn: rayAt(0, 0, Math.PI),
          eighthTurn: rayAt(0.5, 0.25, Math.PI / 4),
          eighthTurnUnturned: rayAt(0.5, 0.25, 0),
        };

        // --- the roughness ramp -----------------------------------------------------------------
        const MIPS = 5;
        evidence.ramp = {
          mipFor: [0, 0.25, 0.5, 0.75, 1].map(
            (roughness) => EnvironmentProcessorMath.MipForRoughness(roughness, MIPS),
          ),
          roughnessFor: [0, 1, 2, 3, 4].map(
            (mip) => EnvironmentProcessorMath.RoughnessForMip(mip, MIPS),
          ),
          // Answers rather than refuses: no ramp to index is mip zero, and a roughness outside the
          // unit range is clamped into it.
          noChain: EnvironmentProcessorMath.MipForRoughness(0.5, 1),
          noChainZero: EnvironmentProcessorMath.MipForRoughness(0.5, 0),
          aboveOne: EnvironmentProcessorMath.MipForRoughness(5, MIPS),
          belowZero: EnvironmentProcessorMath.MipForRoughness(-5, MIPS),
          roughnessAbove: EnvironmentProcessorMath.RoughnessForMip(99, MIPS),
          roughnessBelow: EnvironmentProcessorMath.RoughnessForMip(-99, MIPS),
        };

        // --- the sampling sequence ---------------------------------------------------------------
        const COUNT = 8;
        evidence.hammersley = Array.from({ length: COUNT }, (_, index) => {
          const point = EnvironmentProcessorMath.Hammersley(index, COUNT);
          return [point.X, point.Y];
        });
        evidence.hammersleyCount = COUNT;
        evidence.ggx = {
          // A mirror scatters nowhere: at roughness zero the sampled direction is the normal.
          mirror: vector(EnvironmentProcessorMath.ImportanceSampleGgx(
            0.25, 0.5, new Vector3(0, 0, 1), 0)),
          rough: vector(EnvironmentProcessorMath.ImportanceSampleGgx(
            0.25, 0.5, new Vector3(0, 0, 1), 0.5)),
          rougher: vector(EnvironmentProcessorMath.ImportanceSampleGgx(
            0.25, 0.5, new Vector3(0, 0, 1), 1)),
          // Around a different normal, the same sequence point stays in that normal's hemisphere.
          tilted: vector(EnvironmentProcessorMath.ImportanceSampleGgx(
            0.25, 0.5, new Vector3(0, 1, 0), 0.5)),
        };

        // --- directions and panorama coordinates -------------------------------------------------
        evidence.faceCentres = [0, 1, 2, 3, 4, 5].map(
          (face) => vector(EnvironmentProcessorMath.FaceDirection(face, 0.5, 0.5)),
        );
        evidence.faceCorners = [0, 4].map(
          (face) => vector(EnvironmentProcessorMath.FaceDirection(face, 0, 0)),
        );
        const panorama = (x, y, z) => {
          const point = EnvironmentProcessorMath.DirectionToEquirectangular(new Vector3(x, y, z));
          return [point.X, point.Y];
        };
        evidence.panorama = {
          plusX: panorama(1, 0, 0),
          minusX: panorama(-1, 0, 0),
          plusZ: panorama(0, 0, 1),
          minusZ: panorama(0, 0, -1),
          up: panorama(0, 1, 0),
          down: panorama(0, -1, 0),
          // Every cube face centre, mapped back, so the two routes have to agree about which way
          // each axis points.
          faceCentres: evidence.faceCentres.map(([x, y, z]) => panorama(x, y, z)),
        };

        // --- the two skies' setters, which behave three different ways ---------------------------
        const sky = new AtmosphericSky(device);
        owned.push(sky);
        evidence.sky = {
          supported: sky.IsSupported,
          sun: vector(sky.SunDirection),
          turbidity: sky.Turbidity,
          intensity: sky.Intensity,
        };
        // Normalised on the way in, so what reads back is a unit vector rather than what was set.
        sky.SunDirection = new Vector3(0, -3, 0);
        evidence.sky.normalised = vector(sky.SunDirection);
        // A vector too short to have a direction is a silent no-op that keeps the previous one.
        sky.SunDirection = new Vector3(0, 0, 0);
        evidence.sky.keptOnDegenerate = vector(sky.SunDirection);
        sky.Turbidity = 100;
        evidence.sky.turbidityClamped = sky.Turbidity;
        sky.Turbidity = -5;
        evidence.sky.turbidityFloored = sky.Turbidity;
        sky.Turbidity = 3.5;
        evidence.sky.turbiditySet = sky.Turbidity;
        sky.Intensity = 2;
        evidence.sky.intensitySet = sky.Intensity;
        // Negative keeps the previous value rather than clamping to zero, which is what the
        // identically named skybox setter does. The two genuinely differ upstream.
        sky.Intensity = -1;
        evidence.sky.intensityKept = sky.Intensity;
        sky.Intensity = 0;
        evidence.sky.intensityZero = sky.Intensity;

        const skybox = new Skybox(device);
        owned.push(skybox);
        evidence.skybox = {
          supported: skybox.IsSupported,
          hasEnvironment: skybox.HasEnvironment,
          yaw: skybox.Yaw,
          intensity: skybox.Intensity,
          tint: vector(skybox.Tint),
        };
        // Any angle is meaningful, so there is nothing to clamp.
        skybox.Yaw = -7.5;
        evidence.skybox.yawSet = skybox.Yaw;
        skybox.Intensity = 3;
        evidence.skybox.intensitySet = skybox.Intensity;
        skybox.Intensity = -2;
        evidence.skybox.intensityFloored = skybox.Intensity;
        // A tint above one brightens an HDR sky, so it is taken as given.
        skybox.Tint = new Vector3(0.5, 2, -1);
        evidence.skybox.tintSet = vector(skybox.Tint);
        evidence.skybox.detached = attempt(() => skybox.SetEnvironment(null));
        evidence.skybox.stillNone = skybox.HasEnvironment;

        // --- the environment processor's split by output type -------------------------------------
        //
        // The three generators that build a cube are the ones a renderer without cube storage
        // refuses; the table is a 2D texture and works anyway. Both refusals arrive as
        // NOT_SUPPORTED, and the engine-layer query is what tells "this renderer cannot" apart from
        // "this build has no layer".
        const processor = new EnvironmentProcessor(device);
        owned.push(processor);
        const panoramaTexture = new Graphics.Texture2D(device, 8, 4);
        owned.push(panoramaTexture);
        panoramaTexture.SetData(Array.from(
          { length: 32 }, (_, index) => new Color(index * 8, 255 - index * 8, 128, 255),
        ));
        evidence.processor = {
          lut: attempt(() => {
            const lut = processor.GenerateBrdfLut(8, 4);
            owned.push(lut);
            return [lut.Width, lut.Height];
          }),
          cube: attempt(() => {
            const cube = processor.ConvertEquirectangular(panoramaTexture, 8);
            owned.push(cube);
            return [cube.Size, cube.LevelCount];
          }),
          refusals: {
            zeroFaceSize: attempt(() => processor.ConvertEquirectangular(panoramaTexture, 0)),
            nullPanorama: attempt(() => processor.ConvertEquirectangular(null, 8)),
            zeroLutSize: attempt(() => processor.GenerateBrdfLut(0, 4)),
            zeroSamples: attempt(() => processor.GenerateBrdfLut(8, 0)),
          },
        };
        this.evidence.probe = evidence;
      } finally {
        this.evidence.dispose = attempt(() => {
          for (const resource of owned.reverse()) resource.Dispose();
        });
      }
      this.Exit();
      super.LoadContent();
    }
    Draw(gameTime) {
      this.GraphicsDevice.Clear(Color.CornflowerBlue);
      this.Exit();
      super.Draw(gameTime);
    }
  })();
  await game.Run();
  const evidence = game.evidence.probe;
  game.Dispose();

  assert.equal(typeof evidence, "object", `atmosphere probe failed: ${JSON.stringify(evidence)}`);
  assert.equal(game.evidence.dispose, "ACCEPTED", "every sky and processor is released");

  /*
   * The scattering model, checked on the relationships that make it a scattering model rather than
   * on numbers copied out of a run.
   */
  const model = evidence.model;
  const brightness = ([red, green, blue]) => red + green + blue;
  assert.ok(
    brightness(model.zenithAtNoon) > brightness(model.zenithAtMidnight) * 20,
    "a sun below the horizon leaves a sky an order of magnitude darker than one above it: " +
    `${brightness(model.zenithAtNoon)} against ${brightness(model.zenithAtMidnight)}`,
  );
  assert.ok(
    brightness(model.horizonAtNoon) > brightness(model.zenithAtNoon),
    "the horizon is brighter than the zenith, because a horizontal ray passes through more air",
  );
  // Rayleigh's coefficients fall as the fourth power of wavelength, so a clear sky is blue: the
  // blue channel is the largest one, and by more than a little.
  assert.ok(
    model.zenithAtNoon[2] > model.zenithAtNoon[1] &&
    model.zenithAtNoon[1] > model.zenithAtNoon[0],
    `a clear zenith is blue, then green, then red: ${model.zenithAtNoon}`,
  );
  // Haze is Mie's, which has no wavelength dependence at all -- so adding it brightens the sky and
  // takes the colour out of it, which is what a white haze is.
  const spread = ([red, , blue]) => blue / red;
  assert.ok(
    brightness(model.hazy) > brightness(model.clearest),
    "more aerosol scatters more light into the eye",
  );
  assert.ok(
    spread(model.hazy) < spread(model.clearest),
    `and washes the colour out of it: ${spread(model.hazy)} against ${spread(model.clearest)}`,
  );
  // A turbidity of one is air with no aerosol in it, so the haze term has to vanish there and the
  // sky is at its bluest.
  assert.ok(spread(model.clearest) > 1.4, `the clearest sky is the bluest (${spread(model.clearest)})`);
  assert.deepEqual(
    model.degenerate, model.zenith,
    "a view direction with no length is treated as straight up rather than refused",
  );
  assert.deepEqual(model.longer, model.zenith, "and a direction is a direction, whatever its length");
  assert.ok(
    model.glsl.includes("cnaSkyRadiance") && model.glsl.includes("cnaAirMass"),
    "the model GLSL names the function the shader calls and the air mass it integrates",
  );

  /*
   * The ray a screen point looks along, and the yaw that turns the whole sky about the up axis.
   *
   * The camera looks down -Z with a square ninety-degree frustum, so the centre of the screen looks
   * exactly that way and the edges look forty-five degrees off it. A yaw of a quarter turn has to
   * rotate every one of those rays a quarter turn about +Y, which the test performs itself rather
   * than asking for a second time.
   */
  const rays = evidence.rays;
  const unit = (direction) => Math.hypot(...direction);
  for (const [name, direction] of Object.entries(rays)) {
    assert.ok(Math.abs(unit(direction) - 1) < 1e-5, `${name} is a unit direction (${unit(direction)})`);
  }
  for (const [axis, component] of rays.centre.entries()) {
    assert.ok(
      Math.abs(component - [0, 0, -1][axis]) < 1e-5,
      `the centre of the screen looks the way the camera does (${rays.centre})`,
    );
  }
  // The edges are forty-five degrees off, which is what a ninety-degree frustum means.
  const degreesFrom = (direction, other) => (Math.acos(Math.min(1, Math.max(-1,
    direction[0] * other[0] + direction[1] * other[1] + direction[2] * other[2]))) * 180) / Math.PI;
  for (const [name, edge] of [["right", rays.right], ["up", rays.up]]) {
    assert.ok(
      Math.abs(degreesFrom(edge, rays.centre) - 45) < 0.01,
      `the ${name} edge of a ninety-degree frustum is forty-five degrees off centre ` +
      `(${degreesFrom(edge, rays.centre)})`,
    );
  }
  const turnAboutUp = ([x, y, z], radians) => [
    x * Math.cos(radians) + z * Math.sin(radians), y, -x * Math.sin(radians) + z * Math.cos(radians),
  ];
  for (const [name, turned, radians] of [
    ["quarterTurn", rays.quarterTurn, Math.PI / 2],
    ["halfTurn", rays.halfTurn, Math.PI],
  ]) {
    const expected = turnAboutUp(rays.centre, radians);
    const back = turnAboutUp(rays.centre, -radians);
    const matchesEither = [expected, back].some(
      (candidate) => candidate.every((component, axis) => Math.abs(component - turned[axis]) < 1e-5),
    );
    assert.ok(
      matchesEither,
      `${name} turns the ray a ${radians} rotation about the up axis: ${turned} against ` +
      `${expected} or ${back}`,
    );
    assert.ok(
      degreesFrom(turned, rays.centre) > 1,
      `and it really moved (${degreesFrom(turned, rays.centre)} degrees)`,
    );
  }
  /*
   * And an off-centre point is turned by the same rotation, which is the part that says the yaw
   * turns the whole sky rather than only the direction down the middle. It is checked as a rotation
   * rather than as an angle: a ray that is tilted off the axis sweeps through *less* than the yaw
   * when it turns about that axis, so an angle between the two would be the wrong invariant. What
   * has to hold is that its up component is untouched and its other two are rotated.
   */
  {
    const turned = rays.eighthTurn;
    const before = rays.eighthTurnUnturned;
    const candidates = [Math.PI / 4, -Math.PI / 4].map((radians) => turnAboutUp(before, radians));
    assert.ok(
      candidates.some(
        (candidate) => candidate.every((c, axis) => Math.abs(c - turned[axis]) < 1e-5),
      ),
      `an off-centre ray is turned by the same rotation: ${turned} against ${candidates[0]} or ` +
      candidates[1],
    );
    assert.ok(
      Math.abs(turned[1] - before[1]) < 1e-6,
      "and a rotation about the up axis leaves the up component where it was",
    );
    assert.ok(
      degreesFrom(turned, before) > 1, `and it really moved (${degreesFrom(turned, before)})`,
    );
  }

  /*
   * The roughness ramp, which is a straight line between mip zero and the last one -- and answers
   * rather than refusing at both ends.
   */
  const ramp = evidence.ramp;
  assert.deepEqual(ramp.mipFor, [0, 1, 2, 3, 4], "roughness maps linearly onto the mip chain");
  assert.deepEqual(ramp.roughnessFor, [0, 0.25, 0.5, 0.75, 1], "and back again");
  assert.deepEqual(
    [ramp.noChain, ramp.noChainZero], [0, 0],
    "a chain with no ramp to index answers mip zero rather than refusing",
  );
  assert.deepEqual(
    [ramp.aboveOne, ramp.belowZero], [4, 0], "and a roughness outside the unit range is clamped",
  );
  assert.deepEqual([ramp.roughnessAbove, ramp.roughnessBelow], [1, 0]);

  /*
   * The Hammersley sequence: the first coordinate is the index's place in the count, and the second
   * is the radical inverse of the index in base two -- the bits of the index, reversed after the
   * point. Both are computed here rather than recorded.
   */
  const radicalInverse = (index) => {
    let result = 0;
    let denominator = 2;
    for (let value = index; value > 0; value = Math.floor(value / 2)) {
      result += (value % 2) / denominator;
      denominator *= 2;
    }
    return result;
  };
  for (const [index, [x, y]] of evidence.hammersley.entries()) {
    assert.ok(
      Math.abs(x - (index + 0.5) / evidence.hammersleyCount) < 1e-6,
      `Hammersley point ${index} is not evenly spaced: ${x}`,
    );
    assert.ok(
      Math.abs(y - radicalInverse(index)) < 1e-6,
      `Hammersley point ${index}'s second coordinate is not the radical inverse: ` +
      `${y} against ${radicalInverse(index)}`,
    );
  }
  assert.equal(
    new Set(evidence.hammersley.map(([, y]) => y)).size, evidence.hammersleyCount,
    "and no two points share it, which is the whole purpose of the sequence",
  );

  // GGX importance sampling. A mirror scatters nowhere, so at roughness zero the sample is the
  // normal itself; roughening it spreads the sample away, and always inside the hemisphere.
  const ggx = evidence.ggx;
  assert.deepEqual(ggx.mirror, [0, 0, 1], "a perfect mirror samples along its own normal");
  const angleFrom = ([x, y, z], [nx, ny, nz]) => Math.acos(
    Math.min(1, Math.max(-1, x * nx + y * ny + z * nz)),
  );
  const spreadRough = angleFrom(ggx.rough, [0, 0, 1]);
  const spreadRougher = angleFrom(ggx.rougher, [0, 0, 1]);
  assert.ok(
    spreadRougher > spreadRough && spreadRough > 0,
    `a rougher surface scatters further from its normal: ${spreadRough} then ${spreadRougher}`,
  );
  for (const [name, sample, normal] of [
    ["rough", ggx.rough, [0, 0, 1]], ["tilted", ggx.tilted, [0, 1, 0]],
  ]) {
    const length = Math.hypot(...sample);
    assert.ok(Math.abs(length - 1) < 1e-5, `${name} samples a unit direction (${length})`);
    assert.ok(angleFrom(sample, normal) < Math.PI / 2, `${name} stays in its normal's hemisphere`);
  }
  assert.ok(
    Math.abs(angleFrom(ggx.tilted, [0, 1, 0]) - spreadRough) < 1e-4,
    "the same sequence point around a different normal spreads by the same angle",
  );

  /*
   * Which way each cube face looks, and where a direction falls on a panorama. Two routes that have
   * to agree with each other about the axes, checked by sending one's answers into the other.
   */
  // Compared componentwise rather than by deep equality, because a signed zero is still a zero and
  // an axis that came out as one is pointing exactly where it should.
  const EXPECTED_FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [face, direction] of evidence.faceCentres.entries()) {
    for (const [axis, component] of direction.entries()) {
      assert.ok(
        Math.abs(component - EXPECTED_FACES[face][axis]) < 1e-6,
        `the centre of cube face ${face} must look straight down its own axis: ${direction}`,
      );
    }
  }
  for (const corner of evidence.faceCorners) {
    assert.ok(
      Math.abs(Math.hypot(...corner) - 1) < 1e-5, "and a face's corner is a unit direction too",
    );
    assert.ok(
      corner.every((component) => Math.abs(component) > 0.5),
      `a corner looks diagonally rather than down an axis (${corner})`,
    );
  }
  // The panorama mapping: longitude around, latitude down, with the poles at nought and one.
  const p = evidence.panorama;
  assert.deepEqual(p.up, [p.up[0], 0], "straight up is the top edge of a panorama");
  assert.deepEqual(p.down, [p.down[0], 1], "and straight down is the bottom");
  for (const [name, point] of [["plusX", p.plusX], ["minusX", p.minusX], ["plusZ", p.plusZ],
    ["minusZ", p.minusZ]]) {
    assert.equal(point[1], 0.5, `${name} is on the horizon, so it is halfway down (${point[1]})`);
  }
  // Opposite directions are half a turn apart around the panorama, whichever way it wraps.
  const apart = (left, right) => {
    const difference = Math.abs(left[0] - right[0]);
    return Math.min(difference, 1 - difference);
  };
  assert.ok(Math.abs(apart(p.plusX, p.minusX) - 0.5) < 1e-6, "east and west are half a turn apart");
  assert.ok(Math.abs(apart(p.plusZ, p.minusZ) - 0.5) < 1e-6, "and so are north and south");
  assert.ok(
    Math.abs(apart(p.plusX, p.plusZ) - 0.25) < 1e-6, "and perpendicular axes a quarter turn",
  );
  assert.deepEqual(
    p.faceCentres.slice(0, 4).map((point) => point[1]), [0.5, 0.5, 0, 1],
    "the four cube faces mapped back land on the horizon and the two poles",
  );

  /*
   * The two skies' setters. Three guards that behave three different ways, kept apart rather than
   * regularised, because CNA's own three do.
   */
  const sky = evidence.sky;
  assert.equal(Math.hypot(...sky.sun), 1, "a sky's sun direction is a unit vector to begin with");
  assert.deepEqual(sky.normalised, [0, -1, 0], "and normalised on the way in, not stored as given");
  assert.deepEqual(
    sky.keptOnDegenerate, sky.normalised,
    "a direction too short to point anywhere leaves the sun where it was",
  );
  assert.deepEqual(
    [sky.turbidityClamped, sky.turbidityFloored, sky.turbiditySet], [10, 1, 3.5],
    "turbidity is clamped into the range the model is defined over",
  );
  assert.deepEqual(
    [sky.intensitySet, sky.intensityKept, sky.intensityZero], [2, 2, 0],
    "a negative intensity keeps the previous one rather than clamping to zero, and zero is taken",
  );
  const skybox = evidence.skybox;
  assert.equal(skybox.hasEnvironment, false, "a skybox made with no cube map has none");
  assert.deepEqual([skybox.yaw, skybox.intensity, skybox.tint], [0, 1, [1, 1, 1]]);
  assert.equal(skybox.yawSet, -7.5, "any yaw is meaningful, so there is nothing to clamp");
  assert.deepEqual(
    [skybox.intensitySet, skybox.intensityFloored], [3, 0],
    "and a skybox's negative intensity IS clamped to zero, unlike the analytic sky's",
  );
  assert.deepEqual(
    skybox.tintSet, [0.5, 2, -1], "a tint is taken as given: above one brightens an HDR sky",
  );
  assert.deepEqual([skybox.detached, skybox.stillNone], ["ACCEPTED", false]);

  /*
   * The environment processor, split by what it produces rather than by whether it is a generator:
   * a 2D table works where a cube map does not.
   */
  const processor = evidence.processor;
  assert.deepEqual(
    processor.lut, [8, 8],
    "the BRDF table depends on no environment and no cube storage, so it is always produced",
  );
  assert.match(processor.refusals.nullPanorama, /^TypeError/);
  for (const name of ["zeroFaceSize", "zeroLutSize", "zeroSamples"]) {
    assert.match(
      processor.refusals[name], /^RangeError/, `${name} is refused before CNA sees it`,
    );
  }
  if (Array.isArray(processor.cube)) {
    assert.deepEqual(processor.cube, [8, 1], "a cube map is the face size asked for");
    console.log(`CNA_TS_NATIVE_ATMOSPHERE=CUBE_STORAGE LUT=${processor.lut.join("x")}`);
    return;
  }
  // A renderer that creates the cube and then refuses the upload answers NOT_SUPPORTED, which is
  // also what a build with no engine layer answers -- and the layer query is what tells them apart.
  assert.match(
    processor.cube, /^Error\(6\)/,
    `a renderer without cube storage refuses the conversion: ${processor.cube}`,
  );
  assert.equal(
    evidence.extensionLayer, true,
    "and the engine layer is present, so the renderer is the reason rather than the build",
  );

  console.log(
    `CNA_TS_NATIVE_ATMOSPHERE=NO_CUBE_STORAGE LUT=${processor.lut.join("x")} ` +
    `ZENITH=${evidence.model.zenithAtNoon.map((v) => v.toFixed(3)).join("/")} ` +
    `MIDNIGHT=${evidence.model.zenithAtMidnight[2].toExponential(2)}`,
  );
});

test("the cascaded, spot and cube shadow maps say what a renderer cannot do with them", async () => {
  const {
    CascadedShadowMap, CubeShadowMap, ShadowMapMath, ShadowQuality, SpotShadowMap,
  } = computeExtensions;

  /*
   * The other side of the three shadow passes.
   *
   * `test/windowed-renderer.integration.mjs` renders all three on OPENGLES3 and reads their depths
   * back. HEADLESS compiles no caster effects, so it can make every one of them and render into
   * none -- and the state, the splits and the pure maths all still work, which is the part a
   * capability boundary is easiest to get wrong.
   */
  const game = new (class extends Game {
    constructor() {
      super();
      this.manager = new GraphicsDeviceManager(this);
      this.evidence = Object.create(null);
    }
    LoadContent() {
      const device = this.GraphicsDevice;
      const attempt = (body) => {
        try {
          const value = body();
          return value === undefined ? "ACCEPTED" : value;
        } catch (error) {
          return `${error.constructor.name}(${error.cnaResult ?? "-"}): ${error.message}`;
        }
      };
      const owned = [];
      try {
        const NEAR = 1;
        const FAR = 200;
        const LAMBDA = 0.6;
        const CASCADES = 4;
        const cameraView = Matrix.CreateLookAt(new Vector3(0, 5, 20), Vector3.Zero, Vector3.Up);
        const cameraProjection =
          Matrix.CreatePerspectiveFieldOfView(Math.PI / 3, 4 / 3, NEAR, FAR);
        const light = {
          Direction: new Vector3(-0.4, -1, -0.3), Color: new Vector3(1, 1, 1), Intensity: 1,
        };
        const evidence = { near: NEAR, far: FAR, lambda: LAMBDA, cascadeCount: CASCADES };

        const cascaded = new CascadedShadowMap(device, ShadowQuality.Medium, CASCADES);
        owned.push(cascaded);
        cascaded.SplitLambda = LAMBDA;
        cascaded.Update(light, cameraView, cameraProjection);
        evidence.cascaded = {
          supported: cascaded.IsSupported,
          count: cascaded.CascadeCount,
          size: cascaded.CascadeSize,
          splits: Array.from({ length: CASCADES }, (_, index) =>
            cascaded.GetSplitDistance(index)),
          pureSplits: [...ShadowMapMath.ComputeCascadeSplitDistances(
            NEAR, FAR, CASCADES, LAMBDA)],
          // The same map with a different lambda gives different splits, which is what says the
          // setting reaches the computation rather than sitting beside it.
          otherLambda: (() => {
            cascaded.SplitLambda = 0;
            cascaded.Update(light, cameraView, cameraProjection);
            const splits = Array.from({ length: CASCADES }, (_, index) =>
              cascaded.GetSplitDistance(index));
            cascaded.SplitLambda = LAMBDA;
            cascaded.Update(light, cameraView, cameraProjection);
            return splits;
          })(),
          pureOtherLambda: [...ShadowMapMath.ComputeCascadeSplitDistances(
            NEAR, FAR, CASCADES, 0)],
          begin: attempt(() => {
            cascaded.Begin(0);
            cascaded.End();
          }),
          effect: attempt(() => cascaded.CasterEffect),
          texture: attempt(() => {
            const texture = cascaded.ShadowTexture;
            return [texture.Width, texture.Height];
          }),
        };
        // Snapping is a pure function of its arguments and needs no renderer at all: the centre is
        // quantised to a whole number of the cascade's own texels.
        const SNAP = { radius: 8, size: 256 };
        evidence.snap = {
          ...SNAP,
          samples: [
            [0, 0, 0], [1.234, 5.678, -9.1], [-3.7, 0.06, 12], [1000, -1000, 0.5],
          ].map((position) => {
            const value = CascadedShadowMap.SnapToTexelGrid(
              new Vector3(...position), SNAP.radius, SNAP.size,
            );
            return [position, [value.X, value.Y, value.Z]];
          }),
        };

        const spot = new SpotShadowMap(device, ShadowQuality.Medium);
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
        evidence.spot = {
          supported: spot.IsSupported,
          size: spot.Size,
          sizeForQuality: ShadowMapMath.SizeForQuality(ShadowQuality.Medium),
          quality: spot.Quality,
          begin: attempt(() => {
            spot.Begin(SPOT_LIGHT);
            spot.End();
          }),
          position: (() => {
            const value = spot.LightPosition;
            return [value.X, value.Y, value.Z];
          })(),
          range: spot.LightRange,
          effect: attempt(() => spot.CasterEffect),
          texture: attempt(() => {
            const texture = spot.ShadowTexture;
            return [texture.Width, texture.Height];
          }),
          endTwice: attempt(() => spot.End()),
        };

        const cube = new CubeShadowMap(device, ShadowQuality.Medium);
        owned.push(cube);
        cube.Update({
          Position: new Vector3(-1, 3, 2), Color: new Vector3(1, 1, 1), Intensity: 1, Range: 25,
        });
        evidence.cube = {
          supported: cube.IsSupported,
          size: cube.Size,
          cubeSizeForQuality: ShadowMapMath.CubeSizeForQuality(ShadowQuality.Medium),
          flatSizeForQuality: ShadowMapMath.SizeForQuality(ShadowQuality.Medium),
          position: (() => {
            const value = cube.LightPosition;
            return [value.X, value.Y, value.Z];
          })(),
          range: cube.LightRange,
          begin: attempt(() => {
            cube.Begin(0);
            cube.End();
          }),
          effect: attempt(() => cube.CasterEffect),
          texture: attempt(() => {
            const texture = cube.ShadowTexture;
            return [texture.Size, texture.LevelCount];
          }),
        };
        /*
         * All four maps document the same rule -- "the handle is a borrow that keeps the map
         * alive; the map refuses to be destroyed while a borrow is outstanding" -- and this asks
         * each of them directly, below the public API, which always returns its borrows first.
         * `docs/upstream-cna-findings.md` item 16 is what the answers show.
         */
        const shadowBackend = getBackend().Shadows;
        const graphics = getBackend().Graphics;
        const deviceHandle = resolveGraphicsDeviceHandleForInternalUse(device);
        const destroyWhileLending = (create, borrow, destroy, release) => {
          const map = create(deviceHandle);
          const lent = borrow(map);
          let answer;
          try {
            destroy(map);
            answer = "DESTROYED";
          } catch (error) {
            answer = error.cnaResult ?? error.constructor.name;
          }
          // Whether or not the destroy went through, the borrow is given back through its own
          // release route -- a flat map lends a render target and a cube map lends a cube, and a
          // leaked one would stop the game shutting down and hide which map this was asking about.
          try {
            release(lent);
          } catch {
            // Already gone with the map it was lent from.
          }
          if (answer !== "DESTROYED") {
            try {
              destroy(map);
            } catch {
              // The refusal above is the answer; this is only cleanup.
            }
          }
          return answer;
        };
        evidence.borrowRule = {
          flat: destroyWhileLending(
            (handle) => shadowBackend.createShadowMap(handle, ShadowQuality.Low),
            (map) => shadowBackend.getShadowMapTexture(map),
            (map) => shadowBackend.destroyShadowMap(map),
            (handle) => graphics.destroyRenderTarget(handle),
          ),
          cascaded: destroyWhileLending(
            (handle) => shadowBackend.createCascadedShadowMap(handle, ShadowQuality.Low, 2),
            (map) => shadowBackend.getCascadedShadowTexture(map),
            (map) => shadowBackend.destroyCascadedShadowMap(map),
            (handle) => graphics.destroyRenderTarget(handle),
          ),
          spot: destroyWhileLending(
            (handle) => shadowBackend.createSpotShadowMap(handle, ShadowQuality.Low),
            (map) => shadowBackend.getSpotShadowTexture(map),
            (map) => shadowBackend.destroySpotShadowMap(map),
            (handle) => graphics.destroyRenderTarget(handle),
          ),
          cube: destroyWhileLending(
            (handle) => shadowBackend.createCubeShadowMap(handle, ShadowQuality.Low),
            (map) => shadowBackend.getCubeShadowTexture(map),
            (map) => shadowBackend.destroyCubeShadowMap(map),
            (handle) => graphics.destroyTextureCube(handle),
          ),
        };
        this.evidence.probe = evidence;
      } finally {
        this.evidence.dispose = attempt(() => {
          for (const resource of owned.reverse()) resource.Dispose();
        });
      }
      this.Exit();
      super.LoadContent();
    }
    Draw(gameTime) {
      this.GraphicsDevice.Clear(Color.CornflowerBlue);
      this.Exit();
      super.Draw(gameTime);
    }
  })();
  await game.Run();
  const evidence = game.evidence.probe;
  // A leaked borrow would surface here, as CNA refusing to destroy the game that owns the device.
  game.Dispose();

  assert.equal(typeof evidence, "object", `shadow-pass probe failed: ${JSON.stringify(evidence)}`);
  assert.equal(game.evidence.dispose, "ACCEPTED", "every map returns the borrows it took");

  /*
   * The counted-borrow rule, asked of all four maps: `docs/upstream-cna-findings.md` item 16.
   *
   * Every one of the four documents it -- "the map refuses to be destroyed while a borrow is
   * outstanding" -- and three of them keep it. The spot map destroys itself with a lent handle
   * still pointing at it, because its destroy is the one that never reads the borrow count its own
   * resource keeps. Asserted as it behaves, so a repair fails here and says so.
   */
  assert.deepEqual(
    [evidence.borrowRule.flat, evidence.borrowRule.cascaded, evidence.borrowRule.cube],
    [CnaResult.InvalidState, CnaResult.InvalidState, CnaResult.InvalidState],
    "three of the four shadow maps refuse to be destroyed while lending",
  );
  assert.equal(
    evidence.borrowRule.spot, "DESTROYED",
    "UPSTREAM FINDING 16 REPAIRED: the spot shadow map now refuses too. " +
    "Update docs/upstream-cna-findings.md and assert the rule for all four",
  );

  /*
   * The cascade's splits, against the pure route that computes the same thing from plain numbers.
   * Twice, with two different lambdas, because one agreement could be a coincidence of defaults
   * and two with different answers cannot be.
   */
  const cascaded = evidence.cascaded;
  assert.equal(cascaded.count, evidence.cascadeCount);
  assert.ok(cascaded.size > 0);
  for (const [measured, pure, what] of [
    [cascaded.splits, cascaded.pureSplits, "a mixed lambda"],
    [cascaded.otherLambda, cascaded.pureOtherLambda, "a lambda of zero"],
  ]) {
    assert.equal(measured.length, evidence.cascadeCount);
    for (const [index, split] of measured.entries()) {
      assert.ok(
        Math.abs(split - pure[index]) < Math.abs(pure[index]) * 1e-4 + 1e-3,
        `${what}: cascade ${index} splits at ${split}; the pure route says ${pure[index]}`,
      );
    }
  }
  assert.notDeepEqual(
    cascaded.splits, cascaded.otherLambda,
    "and the two lambdas really are two different divisions of the range",
  );
  // A lambda of zero divides the range evenly, which is a closed form the test can write down.
  for (const [index, split] of cascaded.otherLambda.entries()) {
    const even = evidence.near +
      ((evidence.far - evidence.near) * (index + 1)) / evidence.cascadeCount;
    assert.ok(
      Math.abs(split - even) < 1e-2,
      `an even division puts cascade ${index} at ${even}, not ${split}`,
    );
  }

  /*
   * Snapping, which needs no renderer: every axis of the answer is a whole number of the cascade's
   * own texels, and a centre already on the grid does not move.
   */
  const texel = (2 * evidence.snap.radius) / evidence.snap.size;
  for (const [position, snapped] of evidence.snap.samples) {
    for (const axis of [0, 1]) {
      const quotient = snapped[axis] / texel;
      assert.ok(
        Math.abs(quotient - Math.round(quotient)) < 1e-3,
        `snapping ${position} left axis ${axis} off the grid: ${snapped[axis]} is ${quotient} texels`,
      );
      assert.ok(
        Math.abs(snapped[axis] - position[axis]) <= texel,
        `and moved it further than one texel: ${position[axis]} to ${snapped[axis]}`,
      );
    }
    assert.ok(
      Math.abs(snapped[2] - position[2]) < 1e-5,
      "while the axis the light looks along is left alone -- it goes out as a float and comes " +
      `back as the nearest one, and nothing else happens to it (${position[2]} to ${snapped[2]})`,
    );
  }

  // The two flat maps' sizes come from the same tier route; a cube's face does not.
  assert.equal(evidence.spot.size, evidence.spot.sizeForQuality);
  assert.equal(evidence.cube.size, evidence.cube.cubeSizeForQuality);
  assert.equal(evidence.spot.quality, ShadowQuality.Medium);
  // The light state round-trips through both passes without a renderer.
  assert.deepEqual(evidence.spot.position, [2, 8, -3]);
  assert.equal(evidence.spot.range, 40);
  assert.deepEqual(evidence.cube.position, [-1, 3, 2]);
  assert.equal(evidence.cube.range, 25);

  if (cascaded.supported) {
    // Not the renderer this test is about; the windowed file renders all three properly.
    console.log("CNA_TS_NATIVE_SHADOW_PASSES=RENDERER_CASTS");
    return;
  }

  /*
   * And the boundary. A renderer that cannot compile a caster program still makes all three maps,
   * still allocates their storage, and still accepts the passes it cannot fill -- which is CNA's
   * documented choice, so the binding passes it through rather than inventing a refusal. It stops
   * at the effects, where a getter answering success with an invalid handle is a capability to
   * report rather than a handle to wrap.
   */
  assert.deepEqual(
    [cascaded.begin, evidence.spot.begin], ["ACCEPTED", "ACCEPTED"],
    "the flat and cascaded passes are accepted and simply write nothing",
  );
  for (const [name, answer] of [
    ["cascaded", cascaded.effect], ["spot", evidence.spot.effect], ["cube", evidence.cube.effect],
  ]) {
    assert.match(answer, /^NativeUnavailableError/, `${name} lends no caster program here`);
    assert.match(answer, /IsSupported/, `and ${name}'s refusal names the question to ask instead`);
  }
  // The storage is real -- allocated memory, not a compiled program -- and the atlas is one
  // cascade wide per cascade.
  assert.deepEqual(cascaded.texture, [cascaded.size * cascaded.count, cascaded.size]);
  assert.deepEqual(evidence.spot.texture, [evidence.spot.size, evidence.spot.size]);
  assert.deepEqual(evidence.cube.texture, [evidence.cube.size, 1]);
  // CNA's own state checking is still real: this is CNA refusing, not the binding.
  assert.match(evidence.spot.endTwice, /^Error/, "closing a pass that is not open is refused");
  /*
   * The cube is the one that cannot even open a face here, and it says why: its faces are larger
   * than this renderer's back buffer, so setting the viewport fails. The code that arrives is
   * `CNA_RESULT_INTERNAL` rather than anything a caller could branch on -- the same missing
   * translation as `docs/upstream-cna-findings.md` item 14, in a second place.
   */
  assert.match(
    evidence.cube.begin, /^Error\(12\): .*SetViewport/,
    `a cube face is larger than this renderer's back buffer: ${evidence.cube.begin}`,
  );

  console.log(
    `CNA_TS_NATIVE_SHADOW_PASSES=UNSUPPORTED_RENDERER CASCADES=${cascaded.count}x${cascaded.size} ` +
    `SPOT=${evidence.spot.size}px CUBE=${evidence.cube.size}px ` +
    `SPLITS=${cascaded.splits.map((value) => value.toFixed(1)).join("/")}`,
  );
});

test("the particle simulation integrates exactly, and the system agrees with it", async () => {
  const { ParticleMath, ParticleShaderSource, ParticleSystem } = computeExtensions;

  // The deterministic generator the emitter draws from: the same seed is always the same value,
  // and different seeds are different. A generator that ignored its seed passes neither.
  const seeds = [0, 1, 2, 3, 7, 100];
  const draws = seeds.map((seed) => ParticleMath.Random(seed));
  assert.deepEqual(draws, seeds.map((seed) => ParticleMath.Random(seed)), "the same seed repeats");
  assert.equal(new Set(draws).size, seeds.length, "different seeds give different values");
  for (const value of draws) {
    assert.ok(value >= 0 && value <= 1, `a draw outside [0, 1]: ${value}`);
  }
  assert.throws(() => ParticleMath.Random(-1), RangeError);
  assert.throws(() => ParticleMath.Random(1.5), RangeError);

  // CNA's own defaults, read rather than assumed.
  const defaults = ParticleMath.DefaultEmitterSettings();
  assert.ok(defaults.Speed > 0 && defaults.Lifetime > 0 && defaults.EmissionRate > 0);
  assert.ok(defaults.Gravity.Y < 0, "gravity points down");
  const fresh = ParticleMath.DefaultParticle();
  assert.deepEqual(
    [fresh.Position.X, fresh.Position.Y, fresh.Position.Z], [0, 0, 0],
    "a fresh particle starts at the origin",
  );

  // One step of the integrator, checked against the arithmetic rather than a recorded number.
  // Gravity -10 over half a second: velocity gains -5, and position gains the new velocity times
  // the step. Drag is zero and the lifetime is long, so nothing else moves the particle.
  const settings = {
    ...defaults,
    Gravity: new Vector3(0, -10, 0),
    Drag: 0,
    Lifetime: 100,
    LifetimeVariance: 0,
  };
  const start = {
    Position: new Vector4(0, 0, 0, 0),
    Velocity: new Vector4(1, 0, 0, 0),
    State: new Vector4(0, 100, 0, 0),
  };
  const stepped = ParticleMath.Step(start, 0, settings, 0.5);
  assert.ok(Math.abs(stepped.Velocity.Y - -5) < 1e-5, `velocity: ${stepped.Velocity.Y}`);
  assert.ok(Math.abs(stepped.Velocity.X - 1) < 1e-5, "an axis with no gravity is unchanged");
  assert.ok(Math.abs(stepped.Position.Y - -2.5) < 1e-5, `position: ${stepped.Position.Y}`);
  assert.ok(Math.abs(stepped.Position.X - 0.5) < 1e-5, "and moves by its own velocity");
  assert.ok(Math.abs(stepped.State.X - 0.5) < 1e-5, "the age advances by the step");
  // The caller's particle is untouched: Step returns a new one.
  assert.equal(start.Position.Y, 0, "Step does not mutate the particle it was given");

  // Two half-steps and one whole step differ, because gravity is integrated per step -- which is
  // what shows the elapsed time reaching the integrator rather than being ignored.
  const halfThenHalf = ParticleMath.Step(stepped, 0, settings, 0.5);
  const wholeAtOnce = ParticleMath.Step(start, 0, settings, 1);
  assert.ok(Math.abs(halfThenHalf.Velocity.Y - -10) < 1e-5, "two half steps reach -10");
  assert.ok(Math.abs(wholeAtOnce.Velocity.Y - -10) < 1e-5, "and so does one whole step");
  assert.ok(
    Math.abs(halfThenHalf.Position.Y - wholeAtOnce.Position.Y) > 1e-3,
    "but their positions differ, because the integrator is stepwise",
  );

  // Zero elapsed time changes nothing at all.
  const unchanged = ParticleMath.Step(start, 0, settings, 0);
  assert.deepEqual(
    [unchanged.Position.X, unchanged.Position.Y, unchanged.Velocity.Y],
    [start.Position.X, start.Position.Y, start.Velocity.Y],
  );

  for (const call of [
    () => ParticleMath.Step(null, 0, settings, 0.5),
    () => ParticleMath.Step(start, -1, settings, 0.5),
    () => ParticleMath.Step(start, 0, null, 0.5),
    () => ParticleMath.Step(start, 0, settings, Number.NaN),
    () => ParticleMath.Step(start, 0, { ...settings, Speed: "fast" }, 0.5),
  ]) {
    assert.throws(call, call.toString());
  }

  // And the system, which needs a device.
  const game = new (class extends Game {
    constructor() {
      super();
      this.manager = new GraphicsDeviceManager(this);
      this.evidence = Object.create(null);
    }
    LoadContent() {
      try {
        const system = new ParticleSystem(this.GraphicsDevice, 64);
        try {
          system.ForceSimulationOnCpu(true);
          system.Settings = settings;
          const readBack = system.Settings;
          this.evidence.system = {
            capacity: system.Capacity,
            usesCompute: system.UsesCompute,
            forcedOnCpu: system.IsSimulationForcedOnCpu,
            reason: system.UnsupportedReason,
            // Every scalar this test set, read back through a different route than it went in.
            gravity: [readBack.Gravity.X, readBack.Gravity.Y, readBack.Gravity.Z],
            drag: readBack.Drag,
            lifetime: readBack.Lifetime,
            emissionClamped: system.IsEmissionRateClamped,
            particlesBefore: system.ToArray().length,
          };
          system.Update(0.1);
          this.evidence.system.particlesAfter = system.ToArray().length;
          this.evidence.system.activeAfter = system.ActiveCount;
          system.Reset();
          this.evidence.system.afterReset = system.ToArray().length;

          // The draw's own settings and the shader contract that goes with it. HEADLESS paints
          // nothing anyone can see, so what is checked here is what CNA reports about itself; the
          // picture is qualified on a windowed renderer in test/windowed-renderer.integration.mjs.
          system.Softness = 2.5;
          const softnessSet = system.Softness;
          system.Softness = -3;
          this.evidence.system.softness = { set: softnessSet, floored: system.Softness };

          const texture = new Graphics.Texture2D(this.GraphicsDevice, 1, 1);
          try {
            texture.SetData([Color.Red]);
            const view = Matrix.CreateLookAt(new Vector3(0, 0, 10), Vector3.Zero, Vector3.Up);
            const projection = Matrix.CreateOrthographic(20, 20, 0.1, 100);
            system.Draw(view, projection, texture);
            this.evidence.system.draw = "ACCEPTED";
            system.SetDepthInput(texture, 100);
            system.SetDepthInput(null, 100);
            this.evidence.system.depthInput = "ACCEPTED";
          } finally {
            texture.Dispose();
          }

          const defaults = ParticleSystem.AtDefaultCapacity(this.GraphicsDevice);
          try {
            this.evidence.system.defaultCapacity = defaults.Capacity;
          } finally {
            defaults.Dispose();
          }
          this.evidence.system.bindingPoint = ParticleShaderSource.BindingPoint;
          this.evidence.system.glsl = ParticleShaderSource.Glsl;
        } finally {
          system.Dispose();
        }
      } catch (error) {
        this.evidence.system = { refused: error.constructor.name, cnaResult: error.cnaResult };
      }
      this.Exit();
      super.LoadContent();
    }
    Draw(gameTime) { this.GraphicsDevice.Clear(Color.CornflowerBlue); this.Exit(); super.Draw(gameTime); }
  })();
  await game.Run();
  const system = game.evidence.system;
  game.Dispose();

  assert.equal(typeof system, "object", `particle system failed: ${JSON.stringify(system)}`);
  if (system.refused) {
    assert.equal(system.cnaResult, 6, "a renderer without particles refuses with NOT_SUPPORTED");
  } else {
    assert.equal(system.capacity, 64, "the pool is the size it was asked for");
    assert.equal(system.forcedOnCpu, true, "the CPU path was chosen deliberately");
    assert.equal(system.usesCompute, false, "so it is not on the GPU");
    // The settings round-trip through CNA: written as one shape, read back as another.
    assert.deepEqual(system.gravity, [0, -10, 0]);
    assert.equal(system.drag, 0);
    assert.equal(system.lifetime, 100);
    assert.equal(system.particlesBefore, 64, "the pool is readable before any update");
    assert.equal(system.particlesAfter, 64, "and after one");
    assert.ok(system.activeAfter >= 0 && system.activeAfter <= 64);
    assert.equal(system.afterReset, 64, "reset keeps the pool, it does not shrink it");
    assert.equal(typeof system.reason, "string");

    // The draw is accepted even on a renderer that shows nothing -- there is nothing wrong with
    // asking, and CNA does not refuse it.
    assert.equal(system.draw, "ACCEPTED");
    assert.equal(system.depthInput, "ACCEPTED");
    // Softness is floored at zero rather than refused, which is CNA's documented choice.
    assert.deepEqual([system.softness.set, system.softness.floored], [2.5, 0]);
    // CNA's own default capacity, through the route that does not take one. The number is checked
    // against CNA's headers by tools/cna-abi/contract.json, which compiles a _Static_assert that
    // CNA_PARTICLE_SYSTEM_DEFAULT_CAPACITY is 1024 -- so this is not the same number written twice.
    assert.equal(system.defaultCapacity, 1024);
    assert.notEqual(system.defaultCapacity, system.capacity, "and it is not the asked-for one");
    // The binding point a particle vertex shader reads the pool at, agreeing with the GLSL CNA
    // hands out for that shader. A macro and a shader string, from two unrelated routes.
    assert.equal(system.bindingPoint, 7);
    assert.match(
      system.glsl, new RegExp(`binding\\s*=\\s*${system.bindingPoint}\\b`),
      "CNA's particle GLSL declares the binding point the API states",
    );
    assert.match(system.glsl, /std430/, "in the storage-buffer layout the simulation writes");
  }

  console.log(
    `CNA_TS_NATIVE_PARTICLES=PASS RANDOM=DETERMINISTIC INTEGRATOR=EXACT STEPWISE=PASS ` +
    `SYSTEM=${system.refused ? `NOT_SUPPORTED(${system.cnaResult})` : `${system.capacity}/cpu`}`,
  );
});

test("cascade splits, spot cones and cube faces are exact geometry", async () => {
  const { ClusteredLightType, ShadowMapMath, ShadowQuality } = computeExtensions;
  const { CubeMapFace } = Graphics;

  // --- cascaded splits -----------------------------------------------------------------------
  // lambda blends a uniform split with a logarithmic one. Both ends are closed forms, so they are
  // checked against the formula rather than against numbers recorded from a run.
  const near = 1;
  const far = 1000;
  const count = 4;
  const uniform = ShadowMapMath.ComputeCascadeSplitDistances(near, far, count, 0);
  const logarithmic = ShadowMapMath.ComputeCascadeSplitDistances(near, far, count, 1);
  const practical = ShadowMapMath.ComputeCascadeSplitDistances(near, far, count, 0.5);
  // One distance per cascade -- each cascade's far edge -- so the last is the far plane itself.
  assert.equal(uniform.length, count);
  for (const list of [uniform, logarithmic, practical]) {
    assert.ok(Math.abs(list[count - 1] - far) < 1e-2, `the last split is the far plane: ${list[count - 1]}`);
    for (let index = 1; index < count; index += 1) {
      assert.ok(list[index] > list[index - 1], "splits increase");
      assert.ok(list[index] > near, "and stay past the near plane");
    }
  }
  // Both ends of lambda are closed forms, so they are checked against the formula rather than
  // against numbers recorded from a run -- and the midpoint is checked as the midpoint.
  for (let index = 1; index <= count; index += 1) {
    const fraction = index / count;
    const expectedUniform = near + (far - near) * fraction;
    const expectedLog = near * (far / near) ** fraction;
    const at = index - 1;
    assert.ok(
      Math.abs(uniform[at] - expectedUniform) < expectedUniform * 1e-4,
      `lambda 0 is not the uniform split at ${index}: ${uniform[at]} vs ${expectedUniform}`,
    );
    assert.ok(
      Math.abs(logarithmic[at] - expectedLog) < expectedLog * 1e-4,
      `lambda 1 is not the logarithmic split at ${index}: ${logarithmic[at]} vs ${expectedLog}`,
    );
    const blended = expectedLog * 0.5 + expectedUniform * 0.5;
    assert.ok(
      Math.abs(practical[at] - blended) < Math.max(blended * 1e-4, 1e-4),
      `lambda 0.5 is not the midpoint at ${index}: ${practical[at]} vs ${blended}`,
    );
  }
  // The two schemes genuinely differ, so the checks above are not all the same check: at the first
  // cascade a uniform split is at 250 and a logarithmic one at 5.6.
  assert.ok(
    uniform[0] / logarithmic[0] > 10,
    "a uniform split and a logarithmic one must not agree near the camera",
  );
  // CNA takes two to four cascades and refuses the rest itself, with its own result code.
  for (const bad of [1, 5, 8]) {
    assert.throws(
      () => ShadowMapMath.ComputeCascadeSplitDistances(near, far, bad, 0.5),
      (error) => error.cnaResult === 1,
      `cascadeCount ${bad}`,
    );
  }
  assert.equal(ShadowMapMath.ComputeCascadeSplitDistances(near, far, 2, 0.5).length, 2);
  assert.throws(() => ShadowMapMath.ComputeCascadeSplitDistances(near, far, 0, 0.5), RangeError);

  // --- the frustum, and the sphere that sizes a cascade ----------------------------------------
  const view = Matrix.CreateLookAt(new Vector3(0, 0, 10), Vector3.Zero, Vector3.Up);
  const projection = Matrix.CreatePerspectiveFieldOfView(Math.PI / 3, 16 / 9, 1, 100);
  const corners = ShadowMapMath.ComputeFrustumCorners(view, projection);
  assert.equal(corners.length, 8, "a frustum has eight corners");
  // Every corner is distinct, which a degenerate or duplicated computation would not manage.
  const keys = new Set(corners.map((c) => `${c.X.toFixed(3)},${c.Y.toFixed(3)},${c.Z.toFixed(3)}`));
  assert.equal(keys.size, 8, "the eight corners are eight different points");
  const sphere = ShadowMapMath.ComputeCascadeBoundingSphere(corners);
  // It really encloses them, and snugly: the farthest corner is on the surface.
  let farthest = 0;
  for (const corner of corners) {
    farthest = Math.max(farthest, Vector3.Distance(corner, sphere.Center));
  }
  assert.ok(
    farthest <= sphere.Radius + 1e-3,
    `a corner lies outside the sphere: ${farthest} > ${sphere.Radius}`,
  );
  assert.ok(
    farthest >= sphere.Radius - 1e-3,
    "and the sphere is no larger than it needs to be",
  );
  assert.throws(() => ShadowMapMath.ComputeCascadeBoundingSphere(corners.slice(0, 7)), RangeError);

  // --- a spot light's cone ---------------------------------------------------------------------
  const spot = {
    Type: ClusteredLightType.Spot,
    Position: new Vector3(3, 8, -2),
    Direction: new Vector3(0, -1, 0),
    Color: new Vector3(1, 1, 1),
    Intensity: 5,
    Range: 40,
    InnerAngle: 0.3,
    OuterAngle: 0.7,
    CastsShadows: true,
  };
  const spotView = ShadowMapMath.ComputeSpotLightView(spot);
  const spotProjection = ShadowMapMath.ComputeSpotLightProjection(spot);
  // The view puts the light at the origin: transforming its own position gives (0, 0, 0).
  const atOrigin = Vector3.Transform(spot.Position, spotView);
  assert.ok(
    atOrigin.Length() < 1e-3,
    `a spot's view does not put the light at the origin: ${atOrigin.X},${atOrigin.Y},${atOrigin.Z}`,
  );
  // The projection is perspective, not orthographic: its w row carries -1, which is what divides.
  assert.ok(
    Math.abs(spotProjection.M34 + 1) < 1e-5,
    `a spot's projection is not perspective: M34 = ${spotProjection.M34}`,
  );
  // A point on the cone axis at the light's range lands on the far plane.
  const alongAxis = Vector3.Add(spot.Position, new Vector3(0, -spot.Range, 0));
  const clip = Vector4.Transform(
    new Vector4(alongAxis.X, alongAxis.Y, alongAxis.Z, 1), Matrix.Multiply(spotView, spotProjection),
  );
  assert.ok(Math.abs(clip.Z / clip.W - 1) < 1e-3, `the range does not reach the far plane: ${clip.Z / clip.W}`);
  assert.ok(Math.abs(clip.X / clip.W) < 1e-3 && Math.abs(clip.Y / clip.W) < 1e-3, "and the axis is the centre");
  // A wider cone gives a different projection, so the outer angle reaches the maths.
  const wider = ShadowMapMath.ComputeSpotLightProjection({ ...spot, OuterAngle: 1.2 });
  assert.notEqual(wider.M11, spotProjection.M11, "the outer angle sets the field of view");

  // --- a cube map's six faces --------------------------------------------------------------------
  const position = new Vector3(1, 2, 3);
  const faces = [
    CubeMapFace.PositiveX, CubeMapFace.NegativeX, CubeMapFace.PositiveY,
    CubeMapFace.NegativeY, CubeMapFace.PositiveZ, CubeMapFace.NegativeZ,
  ].map((face) => ShadowMapMath.ComputeCubeFaceView(face, position));
  assert.equal(faces.length, 6);
  // Each face puts the light at the origin, and each looks in a different direction: the six
  // forward axes are six distinct unit vectors, which is exactly what a cube map needs.
  const forwards = [];
  for (const face of faces) {
    const origin = Vector3.Transform(position, face);
    assert.ok(origin.Length() < 1e-3, "every cube face puts the light at the origin");
    const forward = new Vector3(-face.M13, -face.M23, -face.M33);
    assert.ok(Math.abs(forward.Length() - 1) < 1e-5, "and looks along a unit axis");
    forwards.push(forward);
  }
  for (let a = 0; a < 6; a += 1) {
    for (let b = a + 1; b < 6; b += 1) {
      const dot = Vector3.Dot(forwards[a], forwards[b]);
      assert.ok(
        Math.abs(dot) < 1e-5 || Math.abs(dot + 1) < 1e-5,
        `cube faces ${a} and ${b} are neither perpendicular nor opposite: ${dot}`,
      );
    }
  }
  // Three opposite pairs, which is what six axes of a cube means.
  const opposites = [];
  for (let a = 0; a < 6; a += 1) {
    for (let b = a + 1; b < 6; b += 1) {
      if (Math.abs(Vector3.Dot(forwards[a], forwards[b]) + 1) < 1e-5) opposites.push([a, b]);
    }
  }
  assert.equal(opposites.length, 3, "six cube faces are three opposite pairs");

  const cubeProjection = ShadowMapMath.ComputeCubeFaceProjection(50);
  // Ninety degrees, square: a square perspective projection has M11 equal to M22, and for a
  // ninety-degree field of view both are exactly one.
  assert.ok(Math.abs(cubeProjection.M11 - 1) < 1e-4, `not ninety degrees: M11 = ${cubeProjection.M11}`);
  assert.ok(Math.abs(cubeProjection.M22 - 1) < 1e-4, `not square: M22 = ${cubeProjection.M22}`);
  assert.ok(Math.abs(cubeProjection.M34 + 1) < 1e-5, "and perspective");

  const cubeSizes = [ShadowQuality.Low, ShadowQuality.Medium, ShadowQuality.High, ShadowQuality.Ultra]
    .map((quality) => ShadowMapMath.CubeSizeForQuality(quality));
  for (let index = 1; index < cubeSizes.length; index += 1) {
    assert.ok(cubeSizes[index] >= cubeSizes[index - 1], "a cube map's tiers do not shrink");
  }
  assert.ok(cubeSizes[0] > 0);
  assert.throws(() => ShadowMapMath.CubeSizeForQuality(9), RangeError);
  assert.throws(() => ShadowMapMath.ComputeCubeFaceView(6, position), RangeError);

  console.log(
    `CNA_TS_NATIVE_SHADOW_GEOMETRY=PASS SPLITS=uniform/log/blend CASCADE_SPHERE=SNUG ` +
    `SPOT_CONE=EXACT CUBE_FACES=3_OPPOSITE_PAIRS CUBE_SIZES=${cubeSizes.join("/")}`,
  );
});

test("every post-process pass's own maths is exact where no renderer is needed", async () => {
  const {
    AsciiQuantizeMode, BloomPass, ColorGradePass, CrtMaskType, CubeLut, DepthEffectMode,
    DepthOfFieldPass, DitherMode, LensFlarePass, LutInterpolation, MotionBlurPass, ThinFilmIridescence,
    TonemapPass, TonemappingMode,
  } = computeExtensions;

  // --- bloom's soft knee ------------------------------------------------------------------------
  // The extraction is a knee, not a cut: a channel ramps in over a window one threshold wide,
  // squared. Predicted here from the shape rather than from numbers recorded off a run, so a
  // change to either end of the ramp fails.
  const softKnee = (value, threshold) => {
    const knee = Math.max(threshold * 0.5, 1e-4);
    const t = Math.min(Math.max((value - threshold + knee) / (2 * knee), 0), 1);
    return value * t * t;
  };
  for (const threshold of [0.25, 0.8, 1]) {
    for (const value of [0, 0.1, threshold * 0.5, threshold * 0.9, threshold, threshold * 1.1, 1.5, 4]) {
      const measured = BloomPass.ExtractChannel(value, threshold);
      const predicted = softKnee(value, threshold);
      assert.ok(
        Math.abs(measured - predicted) < 1e-5,
        `bloom knee at value ${value} threshold ${threshold}: ${measured} vs ${predicted}`,
      );
    }
  }
  // The three points that make it a knee rather than a subtraction, named so a regression to
  // "value - threshold" is unmistakable: nothing half a threshold below, a quarter of the channel
  // exactly at it, and the whole channel half a threshold above.
  assert.equal(BloomPass.ExtractChannel(0.4, 0.8), 0, "half a threshold below contributes nothing");
  assert.ok(
    Math.abs(BloomPass.ExtractChannel(0.8, 0.8) - 0.2) < 1e-6,
    "exactly at the threshold a channel contributes a quarter of itself",
  );
  assert.equal(BloomPass.ExtractChannel(1.5, 0.8), 1.5, "well above it, all of it");
  // Monotone: a brighter channel never contributes less, and a higher threshold never more.
  let previous = -1;
  for (let value = 0; value <= 2.0001; value += 0.05) {
    const current = BloomPass.ExtractChannel(value, 0.8);
    assert.ok(current >= previous - 1e-6, `bloom extraction fell at ${value}`);
    previous = current;
  }
  for (const value of [0.5, 1, 2]) {
    assert.ok(
      BloomPass.ExtractChannel(value, 0.4) >= BloomPass.ExtractChannel(value, 1.2) - 1e-6,
      "raising the threshold cannot brighten the bloom",
    );
  }

  // --- the tonemapping curves -------------------------------------------------------------------
  // Each mode is a published closed form, so each is checked against that form.
  const reinhard = (v) => v / (1 + v);
  const aces = (v) => {
    const value = Math.min(Math.max((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14), 0), 1);
    return value;
  };
  for (const v of [0, 0.25, 0.5, 1, 2, 4]) {
    assert.ok(
      Math.abs(TonemapPass.TonemapChannel(TonemappingMode.None, v, 1, 1) - Math.min(v, 1)) < 1e-6,
      `no tonemapping is a clamp, not a curve, at ${v}`,
    );
    assert.ok(
      Math.abs(TonemapPass.TonemapChannel(TonemappingMode.Reinhard, v, 1, 1) - reinhard(v)) < 1e-5,
      `Reinhard at ${v}`,
    );
    assert.ok(
      Math.abs(TonemapPass.TonemapChannel(TonemappingMode.Aces, v, 1, 1) - aces(v)) < 1e-4,
      `ACES at ${v}`,
    );
  }
  // Exposure multiplies before the curve and gamma raises after it, which is the only order in
  // which these two numbers commute with anything.
  assert.ok(
    Math.abs(TonemapPass.TonemapChannel(TonemappingMode.None, 0.5, 2, 1) - 1) < 1e-6,
    "exposure scales the channel before the curve",
  );
  assert.ok(
    Math.abs(TonemapPass.TonemapChannel(TonemappingMode.None, 0.25, 1, 2) - 0.5) < 1e-6,
    "gamma 2 is a square root",
  );
  assert.ok(
    Math.abs(TonemapPass.TonemapChannel(TonemappingMode.Reinhard, 0.5, 2, 2) - Math.sqrt(reinhard(1))) < 1e-5,
    "and the two compose in that order",
  );
  // Every mode is bounded and rising; the curves genuinely differ from each other at midrange.
  const midrange = new Set();
  for (const mode of [
    TonemappingMode.None, TonemappingMode.Reinhard, TonemappingMode.Filmic,
    TonemappingMode.Aces, TonemappingMode.Uncharted2,
  ]) {
    let last = -1;
    for (let v = 0; v <= 8.0001; v += 0.25) {
      const mapped = TonemapPass.TonemapChannel(mode, v, 1, 1);
      assert.ok(mapped >= -1e-6 && mapped <= 1 + 1e-6, `mode ${mode} left [0,1] at ${v}: ${mapped}`);
      assert.ok(mapped >= last - 1e-6, `mode ${mode} fell at ${v}`);
      last = mapped;
    }
    midrange.add(TonemapPass.TonemapChannel(mode, 1, 1, 1).toFixed(4));
  }
  assert.equal(midrange.size, 5, `five modes must be five curves, got ${[...midrange].join(",")}`);

  // --- the thin-lens circle of confusion ---------------------------------------------------------
  // The textbook formula, with the scene's metres against the lens's millimetres. Written out here
  // so the binding is checked against optics rather than against itself.
  const coc = (distance, focus, focalMillimetres, fNumber) => {
    const d = distance * 1000;
    const f = focus * 1000;
    return (focalMillimetres ** 2 / fNumber) * Math.abs(d - f) / (d * (f - focalMillimetres));
  };
  for (const [distance, focus, focal, stop] of [
    [5, 10, 50, 2.8], [20, 10, 50, 2.8], [20, 10, 50, 1.4], [2, 3, 35, 4], [50, 8, 85, 1.8],
  ]) {
    const measured = DepthOfFieldPass.CircleOfConfusionMillimetres(distance, focus, focal, stop);
    const predicted = coc(distance, focus, focal, stop);
    assert.ok(
      Math.abs(measured - predicted) < Math.max(predicted * 1e-4, 1e-7),
      `CoC at ${distance}m focus ${focus}m ${focal}mm f/${stop}: ${measured} vs ${predicted}`,
    );
  }
  assert.equal(
    DepthOfFieldPass.CircleOfConfusionMillimetres(10, 10, 50, 2.8), 0,
    "nothing at the focus distance is out of focus",
  );
  // Opening the aperture two stops doubles the blur; the sign of the defocus does not matter.
  const wide = DepthOfFieldPass.CircleOfConfusionMillimetres(20, 10, 50, 1.4);
  const narrow = DepthOfFieldPass.CircleOfConfusionMillimetres(20, 10, 50, 2.8);
  assert.ok(Math.abs(wide / narrow - 2) < 1e-4, `f/1.4 must blur exactly twice f/2.8: ${wide / narrow}`);
  assert.ok(
    DepthOfFieldPass.CircleOfConfusionMillimetres(5, 10, 50, 2.8) > 0 &&
    DepthOfFieldPass.CircleOfConfusionMillimetres(15, 10, 50, 2.8) > 0,
    "both sides of the focal plane blur",
  );

  // --- the LUT strip's own arithmetic ------------------------------------------------------------
  // A LUT strip lays a cube out as size tiles of size x size, so a valid strip is size^2 wide and
  // size tall. Anything that is not is refused with 0 rather than a guess.
  for (const size of [2, 4, 8, 16, 32, 64]) {
    assert.equal(ColorGradePass.LutSizeForStrip(size * size, size), size, `strip for size ${size}`);
  }
  for (const [width, height] of [[100, 7], [255, 16], [256, 15], [0, 0], [16, 16]]) {
    assert.equal(ColorGradePass.LutSizeForStrip(width, height), 0, `${width}x${height} is not a strip`);
  }

  // --- the .cube file ----------------------------------------------------------------------------
  // A two-entry-per-axis cube whose transfer is the exact channel rotation (r,g,b) -> (b,r,g).
  // Every corner is read back and checked against that permutation, so a transposed or reversed
  // parse of the file's own ordering fails here rather than on a GPU.
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const rotate = ([r, g, b]) => [b, r, g];
  const text = ['TITLE "rotate"', "LUT_3D_SIZE 2", ...corners.map((c) => rotate(c).join(" "))].join("\n");
  const lut = CubeLut.Parse(text);
  try {
    assert.equal(lut.Size, 2);
    assert.equal(lut.Title, "rotate");
    assert.equal(lut.IsUnitDomain, true, "a file with no DOMAIN lines is the unit cube");
    assert.deepEqual([lut.DomainMin.X, lut.DomainMin.Y, lut.DomainMin.Z], [0, 0, 0]);
    assert.deepEqual([lut.DomainMax.X, lut.DomainMax.Y, lut.DomainMax.Z], [1, 1, 1]);
    for (const corner of corners) {
      const entry = lut.GetEntry(corner[0], corner[1], corner[2]);
      assert.deepEqual(
        [entry.X, entry.Y, entry.Z], rotate(corner),
        `entry ${corner.join(",")} did not come back rotated`,
      );
    }
    // Out of range is CNA's own refusal, not a clamp and not a read past the table.
    for (const bad of [[2, 0, 0], [-1, 0, 0], [0, 2, 0], [0, 0, 9]]) {
      assert.throws(
        () => lut.GetEntry(bad[0], bad[1], bad[2]),
        (error) => error.cnaResult === 1,
        `entry ${bad.join(",")} is outside a size-2 cube`,
      );
    }
    assert.throws(() => lut.GetEntry(0.5, 0, 0), TypeError, "and a fraction is not an index");
  } finally {
    lut.Dispose();
  }
  // A domain that is not the unit cube is carried through rather than normalised away.
  const shifted = CubeLut.Parse([
    "LUT_3D_SIZE 2", "DOMAIN_MIN 0 0 0.25", "DOMAIN_MAX 1 0.5 1",
    ...corners.map(() => "0.5 0.5 0.5"),
  ].join("\n"));
  try {
    assert.equal(shifted.IsUnitDomain, false);
    assert.ok(Math.abs(shifted.DomainMin.Z - 0.25) < 1e-6);
    assert.ok(Math.abs(shifted.DomainMax.Y - 0.5) < 1e-6);
    assert.equal(shifted.Title, "", "a file with no TITLE has none, rather than a made-up one");
  } finally {
    shifted.Dispose();
  }
  // Text that is not a .cube file is refused by CNA with its own result, not parsed into a
  // default LUT that would silently grade nothing.
  for (const bad of ["", "hello", "LUT_3D_SIZE 2\n0 0 0", "LUT_3D_SIZE 0"]) {
    assert.throws(
      () => CubeLut.Parse(bad),
      (error) => typeof error.cnaResult === "number" && error.cnaResult !== 0,
      `parsing ${JSON.stringify(bad.slice(0, 20))} should be refused`,
    );
  }
  assert.throws(() => CubeLut.Parse(null), TypeError);

  // --- thin-film iridescence ----------------------------------------------------------------------
  // A film of no thickness has no path difference to make, so it cannot separate the wavelengths:
  // the three channels come back equal. Any real thickness splits them.
  const base = new Vector3(0.04, 0.07, 0.11);
  const flat = ThinFilmIridescence.Evaluate(1, 1.5, 1, 0, base);
  assert.ok(
    Math.abs(flat.X - base.X) < 1e-6 && Math.abs(flat.Y - base.Y) < 1e-6 &&
    Math.abs(flat.Z - base.Z) < 1e-6,
    `a film of zero thickness must hand the base back untouched: ${flat.X},${flat.Y},${flat.Z}`,
  );
  const grey = new Vector3(0.04, 0.04, 0.04);
  const colours = [300, 600].map((nm) => ThinFilmIridescence.Evaluate(1, 1.5, 1, nm, grey));
  for (const colour of colours) {
    const channels = [colour.X, colour.Y, colour.Z];
    assert.ok(
      Math.max(...channels) - Math.min(...channels) > 1e-3,
      `a real film thickness must separate the channels: ${channels.join(",")}`,
    );
    for (const channel of channels) assert.ok(channel >= 0 && channel <= 1, "reflectance stays a fraction");
  }
  assert.ok(
    Math.hypot(colours[0].X - colours[1].X, colours[0].Y - colours[1].Y, colours[0].Z - colours[1].Z) > 1e-2,
    "two different thicknesses must not give the same colour",
  );

  // --- the shader sources the layer hands out ------------------------------------------------------
  // Never asserted against a dialect: what matters is that they are real programs, that they differ
  // when the flag that selects them differs, and that the binding does not synthesise them.
  const sources = {
    fxaa: computeExtensions.FxaaPass.FragmentGlsl,
    ssaoPacked: computeExtensions.SsaoPass.OcclusionGlsl(true),
    ssaoPlain: computeExtensions.SsaoPass.OcclusionGlsl(false),
    thinFilm: ThinFilmIridescence.Glsl,
  };
  for (const [name, source] of Object.entries(sources)) {
    assert.equal(typeof source, "string", name);
    assert.ok(source.length > 200, `${name} is too short to be a shader: ${source.length}`);
    assert.ok(/\bvec[234]\b/.test(source) && source.includes("{"), `${name} is not GLSL`);
  }
  // The two that are whole passes have an entry point; the iridescence source is a library of
  // functions meant to be included, so it has none and is identified by what it declares instead.
  for (const name of ["fxaa", "ssaoPacked", "ssaoPlain"]) {
    assert.ok(/\bvoid\s+main\s*\(/.test(sources[name]), `${name} has no entry point`);
  }
  assert.ok(
    !/\bvoid\s+main\s*\(/.test(sources.thinFilm) && /cnaFilm\w+\s*\(/.test(sources.thinFilm),
    "the iridescence source is a function library, named for the model it implements",
  );
  assert.notEqual(
    sources.ssaoPacked, sources.ssaoPlain,
    "the packed-depth variant must not be the same program as the plain one",
  );
  assert.equal(sources.fxaa, computeExtensions.FxaaPass.FragmentGlsl, "and each is stable across calls");

  // --- the fixed shapes -----------------------------------------------------------------------------
  assert.equal(MotionBlurPass.SampleCount, 8);
  assert.equal(LensFlarePass.GhostCount, 4);
  assert.ok(MotionBlurPass.SampleCount > 1 && LensFlarePass.GhostCount > 1);

  // --- the enums are CNA's, not this binding's ------------------------------------------------------
  // Each is checked for the distinctness the C header gives it; a duplicated value would make two
  // different settings the same setting.
  for (const [name, values] of Object.entries({
    LutInterpolation, AsciiQuantizeMode, CrtMaskType, DepthEffectMode, DitherMode,
  })) {
    const numbers = Object.values(values).filter((v) => typeof v === "number");
    assert.equal(new Set(numbers).size, numbers.length, `${name} has a duplicated value`);
    assert.ok(numbers.length >= 2, `${name} needs more than one member`);
    assert.equal(Math.min(...numbers), 0, `${name} starts at zero, as the C enum does`);
  }
  assert.equal(LutInterpolation.Tetrahedral, 1);
  assert.equal(DepthEffectMode.Grayscale1Bit, 4);
  assert.equal(DitherMode.Bayer8X8, 2);

  console.log(
    `CNA_TS_NATIVE_POST_PROCESS_MATHS=PASS BLOOM=SOFT_KNEE TONEMAP=5_DISTINCT_CURVES ` +
    `COC=THIN_LENS LUT=ROTATION_EXACT THIN_FILM=SPLITS GLSL=${sources.fxaa.length}/${sources.ssaoPacked.length}`,
  );
});

/**
 * The canonical PBR material, its glTF extensions, and the two effects that carry it.
 *
 * Everything here is CNA's own value semantics rather than this binding's: equality, hashing and
 * the printed form come from the canonical type, and the test's job is to check that they behave
 * like a value and that nothing is lost on the way through. The one place a claim is made about a
 * *result* rather than a round trip is the glTF bridge, which quantises a linear float factor into
 * an eight-bit colour, and the material-state call, which is checked by reading CNA's device state
 * back rather than by trusting the wrapper's own.
 */
class PbrMaterialProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
    this.evidence = Object.create(null);
  }

  LoadContent() {
    const graphics = computeExtensions;
    const device = this.GraphicsDevice;
    const record = (name, body) => {
      try {
        this.evidence[name] = body();
      } catch (error) {
        this.evidence[name] = `${error.constructor.name}(${error.cnaResult ?? "-"}): ` +
          `${(error.message ?? "").slice(0, 140)}`;
      }
    };

    record("defaults", () => {
      const material = graphics.CreatePbrMaterialExt();
      return {
        metallic: material.MetallicFactor,
        roughness: material.RoughnessFactor,
        normalScale: material.NormalScale,
        occlusion: material.OcclusionStrength,
        ior: material.Ior,
        specular: material.SpecularFactor,
        alphaCutoff: material.AlphaCutoff,
        alphaMode: material.AlphaMode,
        doubleSided: material.DoubleSided,
        albedo: [
          material.AlbedoColor.R, material.AlbedoColor.G,
          material.AlbedoColor.B, material.AlbedoColor.A,
        ],
        emissive: [material.EmissiveFactor.X, material.EmissiveFactor.Y, material.EmissiveFactor.Z],
        specularColor: [
          material.SpecularColorFactor.X, material.SpecularColorFactor.Y,
          material.SpecularColorFactor.Z,
        ],
        srgb: [
          material.BaseColorTextureSrgb, material.EmissiveTextureSrgb,
          material.SpecularColorTextureSrgb, material.OutputEncodedToSrgb,
        ],
        textures: [
          material.AlbedoTexture, material.NormalTexture, material.MetallicRoughnessTexture,
          material.AmbientOcclusionTexture, material.EmissiveTexture, material.SpecularTexture,
          material.SpecularColorTexture,
        ],
        sets: [...material.TextureCoordinateSets],
        transforms: material.TextureTransforms.map((value) => [
          value.Offset.X, value.Offset.Y, value.Scale.X, value.Scale.Y, value.Rotation,
        ]),
        transform: (() => {
          const neutral = graphics.CreateTextureTransform();
          return [neutral.Offset.X, neutral.Offset.Y, neutral.Scale.X, neutral.Scale.Y, neutral.Rotation];
        })(),
      };
    });

    record("valueSemantics", () => {
      const first = graphics.CreatePbrMaterialExt();
      const second = graphics.CreatePbrMaterialExt();
      const changed = graphics.CreatePbrMaterialExt();
      changed.RoughnessFactor = 0.125;
      const recoloured = graphics.CreatePbrMaterialExt();
      recoloured.AlbedoColor = new Color(200, 100, 40, 128);
      const restored = graphics.CreatePbrMaterialExt();
      restored.RoughnessFactor = 0.125;
      return {
        equalIndependently: graphics.PbrMaterialExtOperations.Equals(first, second),
        hashesAgree: graphics.PbrMaterialExtOperations.GetHashCode(first) ===
          graphics.PbrMaterialExtOperations.GetHashCode(second),
        differsAfterEdit: graphics.PbrMaterialExtOperations.Equals(first, changed),
        hashDiffers: graphics.PbrMaterialExtOperations.GetHashCode(first) !==
          graphics.PbrMaterialExtOperations.GetHashCode(changed),
        sameEditsAgree: graphics.PbrMaterialExtOperations.Equals(changed, restored),
        sameEditsHashAlike: graphics.PbrMaterialExtOperations.GetHashCode(changed) ===
          graphics.PbrMaterialExtOperations.GetHashCode(restored),
        text: graphics.PbrMaterialExtOperations.ToText(first),
        editedText: graphics.PbrMaterialExtOperations.ToText(changed),
        recolouredText: graphics.PbrMaterialExtOperations.ToText(recoloured),
        colourAlone: graphics.PbrMaterialExtOperations.Equals(first, recoloured),
        colourHashDiffers: graphics.PbrMaterialExtOperations.GetHashCode(first) !==
          graphics.PbrMaterialExtOperations.GetHashCode(recoloured),
        independent: (() => {
          // Two calls must not share state: these are values, not views onto one object.
          const a = graphics.CreatePbrMaterialExt();
          const b = graphics.CreatePbrMaterialExt();
          a.MetallicFactor = 0.5;
          a.TextureCoordinateSets[0] = 3;
          a.TextureTransforms[0].Rotation = 2;
          return [b.MetallicFactor, b.TextureCoordinateSets[0], b.TextureTransforms[0].Rotation];
        })(),
      };
    });

    record("bridge", () => {
      const source = graphics.GltfMaterialBridge.CreateSource();
      const defaults = {
        baseColor: [
          source.BaseColorFactor.X, source.BaseColorFactor.Y,
          source.BaseColorFactor.Z, source.BaseColorFactor.W,
        ],
        metallic: source.MetallicFactor,
        roughness: source.RoughnessFactor,
        ior: source.Ior,
        alphaCutoff: source.AlphaCutoff,
        alphaMode: source.AlphaMode,
        doubleSided: source.DoubleSided,
        slots: graphics.GltfMaterialBridge.CreateTextures().Slots,
      };
      // Every factor set to something no default equals, so no assertion below can pass by
      // accident, and one per-slot value in a slot the others do not use.
      source.BaseColorFactor = new Vector4(1, 0.5, 0.25, 0.5);
      source.MetallicFactor = 0.25;
      source.RoughnessFactor = 0.75;
      source.EmissiveFactor = new Vector3(0.125, 0.25, 0.375);
      source.NormalScale = 2;
      source.OcclusionStrength = 0.5;
      source.Ior = 1.75;
      source.SpecularFactor = 0.5;
      source.SpecularColorFactor = new Vector3(0.9, 0.8, 0.7);
      source.AlphaMode = graphics.AlphaMode.Mask;
      source.AlphaCutoff = 0.375;
      source.DoubleSided = true;
      source.TextureCoordinateSets[graphics.PbrTextureSlot.Emissive] = 1;
      source.TextureTransforms[graphics.PbrTextureSlot.MetallicRoughness] = {
        Offset: new Vector2(0.25, 0.5), Scale: new Vector2(2, 3), Rotation: 0.75,
      };
      const built = graphics.GltfMaterialBridge.BuildMaterial(
        source, graphics.GltfMaterialBridge.CreateTextures(),
      );
      // A quantisation table, so the rounding rule is measured rather than assumed from one point.
      const quantised = [0, 0.25, 0.5, 0.75, 1, 1 / 3, 2 / 3].map((value) => {
        const one = graphics.GltfMaterialBridge.CreateSource();
        one.BaseColorFactor = new Vector4(value, value, value, value);
        const material = graphics.GltfMaterialBridge.BuildMaterial(
          one, graphics.GltfMaterialBridge.CreateTextures(),
        );
        return [value, material.AlbedoColor.R];
      });
      return {
        defaults,
        albedo: [
          built.AlbedoColor.R, built.AlbedoColor.G, built.AlbedoColor.B, built.AlbedoColor.A,
        ],
        metallic: built.MetallicFactor,
        roughness: built.RoughnessFactor,
        emissive: [built.EmissiveFactor.X, built.EmissiveFactor.Y, built.EmissiveFactor.Z],
        normalScale: built.NormalScale,
        occlusion: built.OcclusionStrength,
        ior: built.Ior,
        specular: built.SpecularFactor,
        specularColor: [
          built.SpecularColorFactor.X, built.SpecularColorFactor.Y, built.SpecularColorFactor.Z,
        ],
        alphaMode: built.AlphaMode,
        alphaCutoff: built.AlphaCutoff,
        doubleSided: built.DoubleSided,
        sets: [...built.TextureCoordinateSets],
        transforms: built.TextureTransforms.map((value) => [
          value.Offset.X, value.Offset.Y, value.Scale.X, value.Scale.Y, value.Rotation,
        ]),
        quantised,
      };
    });

    record("extensions", () => {
      const set = new graphics.PbrMaterialExtensions();
      const other = new graphics.PbrMaterialExtensions();
      try {
        const neutral = {
          isNeutral: set.IsNeutral,
          text: set.ToText(),
          sheen: set.IsSheenEnabled,
          transmission: set.IsTransmissionEnabled,
          iridescence: set.IsIridescenceEnabled,
          subsurface: set.IsSubsurfaceEnabled,
          clearcoat: set.ClearcoatFactor,
          iridescenceIor: set.IridescenceIor,
          thicknessRange: [set.IridescenceThicknessMinimum, set.IridescenceThicknessMaximum],
          attenuation: [set.AttenuationColor.X, set.AttenuationColor.Y, set.AttenuationColor.Z],
          equalsFresh: set.Equals(other),
          hashesAgree: set.GetHashCode() === other.GetHashCode(),
        };
        // Which field switches which feature on, one at a time from a fresh set each time.
        const switches = {};
        for (const [name, apply] of [
          ["sheenColor", (value) => { value.SheenColorFactor = new Vector3(0.5, 0.25, 0.125); }],
          ["sheenRoughness", (value) => { value.SheenRoughness = 0.25; }],
          ["transmission", (value) => { value.TransmissionFactor = 0.75; }],
          ["thickness", (value) => { value.ThicknessFactor = 2; }],
          ["iridescence", (value) => { value.IridescenceFactor = 0.375; }],
          ["subsurfaceColor", (value) => { value.SubsurfaceColor = new Vector3(0.9, 0.2, 0.1); }],
          ["subsurfaceWrap", (value) => { value.SubsurfaceWrap = 0.625; }],
          ["clearcoat", (value) => { value.ClearcoatFactor = 0.5; }],
        ]) {
          const fresh = new graphics.PbrMaterialExtensions();
          try {
            apply(fresh);
            switches[name] = {
              neutral: fresh.IsNeutral,
              sheen: fresh.IsSheenEnabled,
              transmission: fresh.IsTransmissionEnabled,
              iridescence: fresh.IsIridescenceEnabled,
              subsurface: fresh.IsSubsurfaceEnabled,
            };
          } finally {
            fresh.Dispose();
          }
        }
        // Every scalar and vector, written with a value no default equals and read straight back.
        set.ClearcoatFactor = 0.5;
        set.ClearcoatRoughness = 0.375;
        set.ClearcoatNormalScale = 2;
        set.SheenColorFactor = new Vector3(0.5, 0.25, 0.125);
        set.SheenRoughness = 0.25;
        set.TransmissionFactor = 0.75;
        set.ThicknessFactor = 3;
        set.AttenuationDistance = 4;
        set.AttenuationColor = new Vector3(0.9, 0.8, 0.7);
        set.IridescenceFactor = 0.375;
        set.IridescenceIor = 1.625;
        set.IridescenceThicknessMinimum = 150;
        set.IridescenceThicknessMaximum = 450;
        set.SubsurfaceWrap = 0.625;
        set.SubsurfaceColor = new Vector3(0.1, 0.2, 0.3);
        const written = {
          clearcoat: [set.ClearcoatFactor, set.ClearcoatRoughness, set.ClearcoatNormalScale],
          sheen: [
            set.SheenColorFactor.X, set.SheenColorFactor.Y, set.SheenColorFactor.Z,
            set.SheenRoughness,
          ],
          transmission: [set.TransmissionFactor, set.ThicknessFactor, set.AttenuationDistance],
          attenuation: [set.AttenuationColor.X, set.AttenuationColor.Y, set.AttenuationColor.Z],
          iridescence: [
            set.IridescenceFactor, set.IridescenceIor,
            set.IridescenceThicknessMinimum, set.IridescenceThicknessMaximum,
          ],
          subsurface: [
            set.SubsurfaceWrap, set.SubsurfaceColor.X, set.SubsurfaceColor.Y, set.SubsurfaceColor.Z,
          ],
          isNeutral: set.IsNeutral,
          text: set.ToText(),
        };
        const beforeCopy = {
          equal: set.Equals(other),
          hashesAgree: set.GetHashCode() === other.GetHashCode(),
          otherClearcoat: other.ClearcoatFactor,
        };
        other.CopyFrom(set);
        const afterCopy = {
          equal: set.Equals(other),
          hashesAgree: set.GetHashCode() === other.GetHashCode(),
          otherClearcoat: other.ClearcoatFactor,
          otherSheen: other.SheenColorFactor.Y,
          sourceUnchanged: set.ClearcoatFactor,
        };
        // The nine texture slots: empty, then filled, then cleared again.
        const texture = new Graphics.Texture2D(device, 2, 2);
        let slots;
        try {
          const empty = [
            set.GetClearcoatTexture(), set.GetClearcoatRoughnessTexture(),
            set.GetClearcoatNormalTexture(), set.GetSheenColorTexture(),
            set.GetSheenRoughnessTexture(), set.GetTransmissionTexture(),
            set.GetThicknessTexture(), set.GetIridescenceTexture(),
            set.GetIridescenceThicknessTexture(),
          ];
          set.SetClearcoatTexture(texture);
          set.SetSheenColorTexture(texture);
          set.SetIridescenceThicknessTexture(texture);
          const filled = [
            set.GetClearcoatTexture() !== 0n, set.GetSheenColorTexture() !== 0n,
            set.GetIridescenceThicknessTexture() !== 0n, set.GetThicknessTexture() !== 0n,
          ];
          set.SetClearcoatTexture(null);
          set.SetSheenColorTexture(null);
          set.SetIridescenceThicknessTexture(null);
          slots = {
            empty: empty.map((handle) => handle === 0n),
            filled,
            cleared: set.GetClearcoatTexture() === 0n && set.GetSheenColorTexture() === 0n,
          };
        } finally {
          texture.Dispose();
        }
        return { neutral, switches, written, beforeCopy, afterCopy, slots };
      } finally {
        other.Dispose();
        set.Dispose();
      }
    });

    record("extensionBridge", () => {
      const destination = new graphics.PbrMaterialExtensions();
      try {
        const source = graphics.GltfMaterialBridge.CreateExtensionSource();
        const defaults = {
          clearcoat: source.ClearcoatFactor,
          iridescenceIor: source.IridescenceIor,
          thicknessRange: [source.IridescenceThicknessMinimum, source.IridescenceThicknessMaximum],
          attenuation: [
            source.AttenuationColor.X, source.AttenuationColor.Y, source.AttenuationColor.Z,
          ],
        };
        source.ClearcoatFactor = 0.25;
        source.ClearcoatRoughnessFactor = 0.5;
        source.SheenColorFactor = new Vector3(0.75, 0.5, 0.25);
        source.SheenRoughnessFactor = 0.125;
        source.TransmissionFactor = 0.5;
        source.ThicknessFactor = 3;
        source.AttenuationDistance = 7;
        source.AttenuationColor = new Vector3(0.6, 0.7, 0.8);
        source.IridescenceFactor = 0.875;
        source.IridescenceIor = 1.875;
        source.IridescenceThicknessMinimum = 120;
        source.IridescenceThicknessMaximum = 480;
        graphics.GltfMaterialBridge.BuildExtensions(
          source, graphics.GltfMaterialBridge.CreateExtensionTextures(), destination,
        );
        return {
          defaults,
          built: {
            clearcoat: [destination.ClearcoatFactor, destination.ClearcoatRoughness],
            sheen: [
              destination.SheenColorFactor.X, destination.SheenColorFactor.Y,
              destination.SheenColorFactor.Z, destination.SheenRoughness,
            ],
            transmission: [
              destination.TransmissionFactor, destination.ThicknessFactor,
              destination.AttenuationDistance,
            ],
            attenuation: [
              destination.AttenuationColor.X, destination.AttenuationColor.Y,
              destination.AttenuationColor.Z,
            ],
            iridescence: [
              destination.IridescenceFactor, destination.IridescenceIor,
              destination.IridescenceThicknessMinimum, destination.IridescenceThicknessMaximum,
            ],
            isNeutral: destination.IsNeutral,
          },
        };
      } finally {
        destination.Dispose();
      }
    });

    record("effect", () => {
      const effect = graphics.PbrEffect.Create(device);
      const texture = new Graphics.Texture2D(device, 2, 2);
      try {
        const defaults = {
          metallic: graphics.PbrEffect.GetMetallicFactor(effect),
          roughness: graphics.PbrEffect.GetRoughnessFactor(effect),
          alpha: graphics.PbrEffect.GetAlpha(effect),
          ior: graphics.PbrEffect.GetIor(effect),
          specular: graphics.PbrEffect.GetSpecularFactor(effect),
          normalScale: graphics.PbrEffect.GetNormalScale(effect),
          occlusion: graphics.PbrEffect.GetOcclusionStrength(effect),
          alphaMode: graphics.PbrEffect.GetAlphaMode(effect),
          alphaCutoff: graphics.PbrEffect.GetAlphaCutoff(effect),
          doubleSided: graphics.PbrEffect.GetDoubleSided(effect),
          vertexColor: graphics.PbrEffect.GetVertexColorEnabled(effect),
          encodeSrgb: graphics.PbrEffect.GetEncodeOutputToSrgb(effect),
          diffuse: [
            graphics.PbrEffect.GetDiffuseColor(effect).X,
            graphics.PbrEffect.GetDiffuseColor(effect).Y,
            graphics.PbrEffect.GetDiffuseColor(effect).Z,
          ],
        };
        const material = graphics.CreatePbrMaterialExt();
        material.MetallicFactor = 0.25;
        material.RoughnessFactor = 0.75;
        material.Ior = 1.75;
        material.SpecularFactor = 0.5;
        material.NormalScale = 2;
        material.OcclusionStrength = 0.375;
        material.AlphaMode = graphics.AlphaMode.Blend;
        material.AlphaCutoff = 0.625;
        material.DoubleSided = true;
        material.EmissiveFactor = new Vector3(0.125, 0.25, 0.375);
        material.SpecularColorFactor = new Vector3(0.9, 0.8, 0.7);
        material.TextureCoordinateSets[graphics.PbrTextureSlot.Normal] = 1;
        material.TextureTransforms[graphics.PbrTextureSlot.Normal] = {
          Offset: new Vector2(0.5, 0.25), Scale: new Vector2(3, 4), Rotation: 1.25,
        };
        material.BaseColorTextureSrgb = false;
        // A base colour no default equals, in all four channels, so a binding that hard-codes
        // white or drops a channel is caught rather than agreeing with the default.
        material.AlbedoColor = new Color(200, 100, 40, 128);
        graphics.PbrEffect.ApplyMaterial(effect, material);
        // Read every field back through the individual accessors -- routes the apply never
        // touched -- and then through the extractor, which is the other independent path.
        const throughAccessors = {
          metallic: graphics.PbrEffect.GetMetallicFactor(effect),
          roughness: graphics.PbrEffect.GetRoughnessFactor(effect),
          ior: graphics.PbrEffect.GetIor(effect),
          specular: graphics.PbrEffect.GetSpecularFactor(effect),
          normalScale: graphics.PbrEffect.GetNormalScale(effect),
          occlusion: graphics.PbrEffect.GetOcclusionStrength(effect),
          alphaMode: graphics.PbrEffect.GetAlphaMode(effect),
          alphaCutoff: graphics.PbrEffect.GetAlphaCutoff(effect),
          doubleSided: graphics.PbrEffect.GetDoubleSided(effect),
          emissive: [
            graphics.PbrEffect.GetEmissiveFactor(effect).X,
            graphics.PbrEffect.GetEmissiveFactor(effect).Y,
            graphics.PbrEffect.GetEmissiveFactor(effect).Z,
          ],
          specularColor: [
            graphics.PbrEffect.GetSpecularColorFactor(effect).X,
            graphics.PbrEffect.GetSpecularColorFactor(effect).Y,
            graphics.PbrEffect.GetSpecularColorFactor(effect).Z,
          ],
          normalSet: graphics.PbrEffect.GetTextureCoordinateSet(
            effect, graphics.PbrTextureSlot.Normal),
          baseColorSet: graphics.PbrEffect.GetTextureCoordinateSet(
            effect, graphics.PbrTextureSlot.BaseColor),
          normalTransform: (() => {
            const value = graphics.PbrEffect.GetTextureTransform(
              effect, graphics.PbrTextureSlot.Normal);
            return [value.Offset.X, value.Offset.Y, value.Scale.X, value.Scale.Y, value.Rotation];
          })(),
          baseColorSrgb: graphics.PbrEffect.GetTextureIsSrgb(
            effect, graphics.PbrTextureSlot.BaseColor),
          emissiveSrgb: graphics.PbrEffect.GetTextureIsSrgb(
            effect, graphics.PbrTextureSlot.Emissive),
        };
        const extracted = graphics.PbrEffect.ExtractMaterial(effect);
        const roundTrip = graphics.PbrMaterialExtOperations.Equals(material, extracted);
        // The individual setters reach the same state the material does, which is what makes the
        // two paths above two paths rather than one.
        graphics.PbrEffect.SetMetallicFactor(effect, 0.875);
        graphics.PbrEffect.SetAlpha(effect, 0.5);
        graphics.PbrEffect.SetDiffuseColor(effect, new Vector3(0.2, 0.4, 0.6));
        graphics.PbrEffect.SetVertexColorEnabled(effect, true);
        graphics.PbrEffect.SetEncodeOutputToSrgb(effect, false);
        const afterSetters = {
          metallic: graphics.PbrEffect.ExtractMaterial(effect).MetallicFactor,
          alpha: graphics.PbrEffect.GetAlpha(effect),
          diffuse: [
            graphics.PbrEffect.GetDiffuseColor(effect).X,
            graphics.PbrEffect.GetDiffuseColor(effect).Y,
            graphics.PbrEffect.GetDiffuseColor(effect).Z,
          ],
          vertexColor: graphics.PbrEffect.GetVertexColorEnabled(effect),
          encodeSrgb: graphics.PbrEffect.GetEncodeOutputToSrgb(effect),
        };
        // The texture slots, which have two sources of truth that never agree -- upstream finding
        // 19. All three measured rows are recorded here so a repair fails rather than passes.
        const emptySlot = graphics.PbrEffect.GetTexture(effect, graphics.PbrTextureSlot.BaseColor);
        const withTexture = graphics.CreatePbrMaterialExt();
        withTexture.AlbedoTexture = texture;
        graphics.PbrEffect.ApplyMaterial(effect, withTexture);
        const afterApplyWithTexture = graphics.PbrEffect.GetTexture(
          effect, graphics.PbrTextureSlot.BaseColor);
        graphics.PbrEffect.SetTexture(effect, graphics.PbrTextureSlot.BaseColor, texture);
        const filledSlot = graphics.PbrEffect.GetTexture(effect, graphics.PbrTextureSlot.BaseColor);
        const extractedWithTexture = graphics.PbrEffect.ExtractMaterial(effect);
        graphics.PbrEffect.ApplyMaterial(effect, graphics.CreatePbrMaterialExt());
        const afterEmptyApply = graphics.PbrEffect.GetTexture(
          effect, graphics.PbrTextureSlot.BaseColor);
        graphics.PbrEffect.SetTexture(effect, graphics.PbrTextureSlot.BaseColor, null);
        return {
          defaults,
          throughAccessors,
          roundTrip,
          extracted: {
            albedo: [
              extracted.AlbedoColor.R, extracted.AlbedoColor.G,
              extracted.AlbedoColor.B, extracted.AlbedoColor.A,
            ],
            text: graphics.PbrMaterialExtOperations.ToText(extracted),
            metallic: extracted.MetallicFactor,
            roughness: extracted.RoughnessFactor,
            alphaMode: extracted.AlphaMode,
            doubleSided: extracted.DoubleSided,
            normalSet: extracted.TextureCoordinateSets[graphics.PbrTextureSlot.Normal],
            normalTransform: [
              extracted.TextureTransforms[graphics.PbrTextureSlot.Normal].Scale.X,
              extracted.TextureTransforms[graphics.PbrTextureSlot.Normal].Rotation,
            ],
          },
          afterSetters,
          slots: {
            empty: emptySlot === 0n,
            afterApplyWithTexture: afterApplyWithTexture !== 0n,
            afterEmptyApply: afterEmptyApply !== 0n,
            filled: filledSlot !== 0n,
            cleared: graphics.PbrEffect.GetTexture(
              effect, graphics.PbrTextureSlot.BaseColor) === 0n,
            extractedIsNull: extractedWithTexture.AlbedoTexture,
          },
        };
      } finally {
        texture.Dispose();
        effect.Dispose();
      }
    });

    record("skinned", () => {
      const effect = graphics.SkinnedPbrEffect.Create(device);
      try {
        const defaultWeights = graphics.SkinnedPbrEffect.GetWeightsPerVertex(effect);
        graphics.SkinnedPbrEffect.SetWeightsPerVertex(effect, 2);
        const bones = [
          Matrix.Identity,
          Matrix.CreateTranslation(new Vector3(3, 4, 5)),
          Matrix.CreateScale(2),
        ];
        graphics.SkinnedPbrEffect.SetBoneTransforms(effect, bones);
        const read = graphics.SkinnedPbrEffect.GetBoneTransforms(effect, bones.length);
        const material = graphics.CreatePbrMaterialExt();
        material.RoughnessFactor = 0.125;
        material.AlphaMode = graphics.AlphaMode.Mask;
        graphics.SkinnedPbrEffect.ApplyMaterial(effect, material);
        const extracted = graphics.SkinnedPbrEffect.ExtractMaterial(effect);
        return {
          defaultWeights,
          setWeights: graphics.SkinnedPbrEffect.GetWeightsPerVertex(effect),
          count: read.length,
          translation: [read[1].M41, read[1].M42, read[1].M43],
          scale: [read[2].M11, read[2].M22, read[2].M33],
          identityIsIdentity: [read[0].M11, read[0].M22, read[0].M33, read[0].M44,
            read[0].M41, read[0].M42, read[0].M43],
          roundTrip: graphics.PbrMaterialExtOperations.Equals(material, extracted),
          materialRoughness: extracted.RoughnessFactor,
          fewerThanSet: graphics.SkinnedPbrEffect.GetBoneTransforms(effect, 1).length,
        };
      } finally {
        effect.Dispose();
      }
    });

    record("deviceState", () => {
      const material = graphics.CreatePbrMaterialExt();
      const read = () => ({
        blend: graphics.PbrMaterialExtOperations.ReadDeviceBlendState(device),
        cull: graphics.PbrMaterialExtOperations.ReadDeviceRasterizerState(device).CullMode,
      });
      material.AlphaMode = graphics.AlphaMode.Blend;
      material.DoubleSided = true;
      graphics.PbrMaterialExtOperations.ApplyState(material, device);
      const blended = read();
      material.AlphaMode = graphics.AlphaMode.Opaque;
      material.DoubleSided = false;
      graphics.PbrMaterialExtOperations.ApplyState(material, device);
      const opaque = read();
      material.AlphaMode = graphics.AlphaMode.Mask;
      graphics.PbrMaterialExtOperations.ApplyState(material, device);
      const masked = read();
      return {
        blended, opaque, masked,
        wrapperUnaware: this.GraphicsDevice.BlendState?.Name ?? null,
      };
    });

    record("refusals", () => {
      const attempt = (body) => {
        try {
          body();
          return "SUCCEEDED";
        } catch (error) {
          return error.constructor.name;
        }
      };
      const set = new graphics.PbrMaterialExtensions();
      set.Dispose();
      const material = graphics.CreatePbrMaterialExt();
      return {
        disposedRead: attempt(() => set.ClearcoatFactor),
        disposedWrite: attempt(() => { set.ClearcoatFactor = 1; }),
        disposedTwice: attempt(() => set.Dispose()),
        isDisposed: set.IsDisposed,
        shortCoordinateSets: attempt(() => {
          const bad = graphics.CreatePbrMaterialExt();
          bad.TextureCoordinateSets = [0, 0, 0];
          graphics.PbrMaterialExtOperations.GetHashCode(bad);
        }),
        nonFinite: attempt(() => {
          const bad = graphics.CreatePbrMaterialExt();
          bad.MetallicFactor = Number.NaN;
          graphics.PbrMaterialExtOperations.GetHashCode(bad);
        }),
        fractionalCoordinateSet: attempt(() => {
          const bad = graphics.CreatePbrMaterialExt();
          bad.TextureCoordinateSets[0] = 0.5;
          graphics.PbrMaterialExtOperations.GetHashCode(bad);
        }),
        nullMaterial: attempt(() => graphics.PbrMaterialExtOperations.GetHashCode(null)),
        nullDevice: attempt(
          () => graphics.PbrMaterialExtOperations.ApplyState(material, null)),
        nullExtensionDestination: attempt(() => graphics.GltfMaterialBridge.BuildExtensions(
          graphics.GltfMaterialBridge.CreateExtensionSource(),
          graphics.GltfMaterialBridge.CreateExtensionTextures(), null)),
      };
    });

    this.Exit();
    super.LoadContent();
  }

  Update(gameTime) {
    this.Exit();
    super.Update(gameTime);
  }
}

test("the canonical PBR material is a value, and both PBR effects carry it whole", async () => {
  const game = new PbrMaterialProbeGame();
  await game.Run();
  const evidence = game.evidence;
  game.Dispose();

  const graphics = computeExtensions;
  const { AlphaMode, PbrTextureSlot } = graphics;
  const { Blend, CullMode } = Graphics;

  // --- CNA's own defaults ------------------------------------------------------------------------
  const defaults = evidence.defaults;
  assert.equal(typeof defaults, "object", `defaults did not run: ${defaults}`);
  // The glTF defaults, which are what the canonical type is specified against.
  assert.equal(defaults.metallic, 1, "glTF's default material is fully metallic");
  assert.equal(defaults.roughness, 1, "and fully rough");
  assert.equal(defaults.normalScale, 1);
  assert.equal(defaults.occlusion, 1);
  assert.equal(defaults.ior, 1.5, "KHR_materials_ior defaults to 1.5");
  assert.equal(defaults.specular, 1);
  assert.equal(defaults.alphaCutoff, 0.5);
  assert.equal(defaults.alphaMode, AlphaMode.Opaque);
  assert.equal(defaults.doubleSided, false);
  assert.deepEqual(defaults.albedo, [255, 255, 255, 255], "and an opaque white base colour");
  assert.deepEqual(defaults.emissive, [0, 0, 0], "emitting nothing");
  assert.deepEqual(defaults.specularColor, [1, 1, 1]);
  assert.deepEqual(defaults.srgb, [true, true, true, true], "colour textures are sRGB by default");
  // No slot is filled, and none of them is a wrapper this layer invented.
  assert.equal(defaults.textures.length, 7);
  for (const texture of defaults.textures) assert.equal(texture, null);
  assert.deepEqual(defaults.sets, [0, 0, 0, 0, 0, 0, 0], "every slot samples UV channel zero");
  assert.equal(defaults.transforms.length, graphics.PbrTextureSlotCount);
  for (const transform of defaults.transforms) {
    assert.deepEqual(transform, [0, 0, 1, 1, 0], "a neutral transform is no offset, unit scale, no rotation");
  }
  assert.deepEqual(defaults.transform, [0, 0, 1, 1, 0], "and CNA's own neutral transform is the same");

  // --- it behaves like a value ---------------------------------------------------------------------
  const value = evidence.valueSemantics;
  assert.equal(value.equalIndependently, true, "two materials built the same way are the same material");
  assert.equal(value.hashesAgree, true, "and hash alike");
  assert.equal(value.differsAfterEdit, false, "editing one field makes it a different material");
  assert.equal(value.hashDiffers, true, "and changes its hash");
  assert.equal(value.sameEditsAgree, true, "the same edit twice gives the same material again");
  assert.equal(value.sameEditsHashAlike, true, "which is what a content hash means");
  assert.ok(value.text.includes("Albedo"), `the printed form names its fields: ${value.text}`);
  assert.ok(value.text.includes("Opaque"), "including the alpha mode by name");
  assert.notEqual(value.text, value.editedText, "and it changes when the material does");
  assert.equal(value.colourAlone, false, "a different base colour is a different material");
  assert.equal(value.colourHashDiffers, true, "and hashes differently");
  assert.ok(
    value.recolouredText.includes("R:200") && value.recolouredText.includes("A:128"),
    `the printed form carries all four channels: ${value.recolouredText}`,
  );
  assert.deepEqual(
    value.independent, [1, 0, 0],
    "two materials must not share arrays: editing one changed the other",
  );

  // --- the glTF bridge -------------------------------------------------------------------------------
  const bridge = evidence.bridge;
  assert.deepEqual(bridge.defaults.baseColor, [1, 1, 1, 1], "glTF's own default base colour is white");
  assert.equal(bridge.defaults.metallic, 1);
  assert.equal(bridge.defaults.ior, 1.5);
  assert.equal(bridge.defaults.alphaMode, AlphaMode.Opaque);
  assert.equal(bridge.defaults.doubleSided, false);
  assert.equal(bridge.defaults.slots.length, graphics.PbrTextureSlotCount);
  for (const slot of bridge.defaults.slots) assert.equal(slot, null);
  // Every factor carried across unchanged...
  assert.equal(bridge.metallic, 0.25);
  assert.equal(bridge.roughness, 0.75);
  assert.deepEqual(bridge.emissive, [0.125, 0.25, 0.375]);
  assert.equal(bridge.normalScale, 2);
  assert.equal(bridge.occlusion, 0.5);
  assert.equal(bridge.ior, 1.75);
  assert.equal(bridge.specular, 0.5);
  assert.ok(bridge.specularColor.every((v, i) => Math.abs(v - [0.9, 0.8, 0.7][i]) < 1e-6));
  assert.equal(bridge.alphaMode, AlphaMode.Mask);
  assert.equal(bridge.alphaCutoff, 0.375);
  assert.equal(bridge.doubleSided, true);
  // ...including the per-slot values, in the slots they were written to and nowhere else.
  assert.equal(bridge.sets[PbrTextureSlot.Emissive], 1);
  assert.equal(bridge.sets.filter((value) => value !== 0).length, 1, "one slot changed, not all of them");
  assert.deepEqual(bridge.transforms[PbrTextureSlot.MetallicRoughness], [0.25, 0.5, 2, 3, 0.75]);
  for (let slot = 0; slot < graphics.PbrTextureSlotCount; slot += 1) {
    if (slot === PbrTextureSlot.MetallicRoughness) continue;
    assert.deepEqual(bridge.transforms[slot], [0, 0, 1, 1, 0], `slot ${slot} was not left neutral`);
  }
  // The one conversion the bridge performs: a linear float factor becomes an eight-bit colour.
  assert.deepEqual(
    bridge.albedo, [255, 128, 64, 128],
    "a base colour factor of (1, 0.5, 0.25, 0.5) quantises to (255, 128, 64, 128)",
  );
  for (const [value, quantised] of bridge.quantised) {
    assert.equal(
      quantised, Math.round(value * 255),
      `the bridge quantises ${value} to ${quantised}, not to round(${value} * 255)`,
    );
  }

  // --- the extensions ------------------------------------------------------------------------------
  const extensions = evidence.extensions;
  assert.equal(typeof extensions, "object", `extensions did not run: ${extensions}`);
  assert.equal(extensions.neutral.isNeutral, true, "a fresh extension set is neutral");
  assert.equal(extensions.neutral.text, "{}", "and prints as nothing at all");
  assert.deepEqual(
    [extensions.neutral.sheen, extensions.neutral.transmission,
      extensions.neutral.iridescence, extensions.neutral.subsurface],
    [false, false, false, false],
    "with no feature switched on",
  );
  assert.equal(extensions.neutral.clearcoat, 0);
  // glTF's own defaults for the iridescence extension, which are not zero.
  assert.ok(Math.abs(extensions.neutral.iridescenceIor - 1.3) < 1e-5, "KHR_materials_iridescence defaults its IOR to 1.3");
  assert.deepEqual(extensions.neutral.thicknessRange, [100, 400], "and its thickness range to 100..400nm");
  assert.deepEqual(extensions.neutral.attenuation, [1, 1, 1], "attenuation defaults to white, not black");
  assert.equal(extensions.neutral.equalsFresh, true, "two fresh sets are the same set");
  assert.equal(extensions.neutral.hashesAgree, true);
  // Which field switches which feature on. Each row comes from its own fresh set, so no row can
  // be carried by another, and the neutral flag falls in every one of them.
  // `IsNeutral` turns out not to mean "no field was written" -- it means "no feature contributes".
  // Each row below is its own fresh set, so none can be carried by another, and the pattern is
  // exact: the factor that *enables* a term makes the set non-neutral, and the fields that only
  // modulate a term that is off do not, even though they store their value.
  const expectedSwitches = {
    sheenColor: { neutral: false, sheen: true, transmission: false, iridescence: false, subsurface: false },
    sheenRoughness: { neutral: true, sheen: false, transmission: false, iridescence: false, subsurface: false },
    transmission: { neutral: false, sheen: false, transmission: true, iridescence: false, subsurface: false },
    thickness: { neutral: true, sheen: false, transmission: false, iridescence: false, subsurface: false },
    iridescence: { neutral: false, sheen: false, transmission: false, iridescence: true, subsurface: false },
    subsurfaceColor: { neutral: false, sheen: false, transmission: false, iridescence: false, subsurface: true },
    subsurfaceWrap: { neutral: true, sheen: false, transmission: false, iridescence: false, subsurface: false },
    clearcoat: { neutral: false, sheen: false, transmission: false, iridescence: false, subsurface: false },
  };
  for (const [name, expected] of Object.entries(expectedSwitches)) {
    const actual = extensions.switches[name];
    assert.deepEqual(
      { neutral: actual.neutral, sheen: actual.sheen, transmission: actual.transmission,
        iridescence: actual.iridescence, subsurface: actual.subsurface },
      expected,
      `writing ${name} left the set in the wrong state`,
    );
  }
  // The three that make that distinction sharp, named so a regression to "any write is
  // non-neutral" or "any write enables the feature" fails here rather than passing quietly.
  assert.equal(extensions.switches.sheenRoughness.sheen, false,
    "sheen roughness alone does not switch sheen on -- the colour does");
  assert.equal(extensions.switches.sheenRoughness.neutral, true,
    "and a sheen lobe that contributes nothing leaves the set neutral");
  assert.equal(extensions.switches.subsurfaceWrap.neutral, true,
    "as does a subsurface wrap with no subsurface colour behind it");
  assert.equal(extensions.switches.clearcoat.neutral, false,
    "while a clearcoat factor does make the set non-neutral, with no predicate of its own");
  // Written and still neutral is not written and lost: the modulating fields keep their values.
  assert.deepEqual(extensions.written.clearcoat.slice(1), [0.375, 2],
    "a clearcoat roughness and normal scale are stored whether or not they switch anything on");
  assert.equal(extensions.written.subsurface[0], 0.625, "and so is a subsurface wrap");
  // Every scalar and vector round-trips at float precision.
  assert.deepEqual(extensions.written.clearcoat, [0.5, 0.375, 2]);
  assert.deepEqual(extensions.written.sheen, [0.5, 0.25, 0.125, 0.25]);
  assert.deepEqual(extensions.written.transmission, [0.75, 3, 4]);
  assert.ok(extensions.written.attenuation.every((v, i) => Math.abs(v - [0.9, 0.8, 0.7][i]) < 1e-6));
  assert.deepEqual(extensions.written.iridescence, [0.375, 1.625, 150, 450]);
  assert.ok(extensions.written.subsurface.every(
    (v, i) => Math.abs(v - [0.625, 0.1, 0.2, 0.3][i]) < 1e-6));
  assert.equal(extensions.written.isNeutral, false);
  for (const name of ["Clearcoat", "Sheen", "Transmission", "Iridescence", "Subsurface"]) {
    assert.ok(extensions.written.text.includes(name), `the printed form omits ${name}`);
  }
  // Copying is a copy, not an alias.
  assert.equal(extensions.beforeCopy.equal, false, "an edited set is not a fresh one");
  assert.equal(extensions.beforeCopy.hashesAgree, false);
  assert.equal(extensions.beforeCopy.otherClearcoat, 0);
  assert.equal(extensions.afterCopy.equal, true, "copying makes them equal");
  assert.equal(extensions.afterCopy.hashesAgree, true, "and makes them hash alike");
  assert.equal(extensions.afterCopy.otherClearcoat, 0.5, "with the source's values, not the target's");
  assert.equal(extensions.afterCopy.otherSheen, 0.25);
  assert.equal(extensions.afterCopy.sourceUnchanged, 0.5, "and the source untouched");
  // The nine texture slots.
  assert.equal(extensions.slots.empty.length, 9);
  assert.ok(extensions.slots.empty.every(Boolean), "a fresh set names no textures");
  assert.deepEqual(
    extensions.slots.filled, [true, true, true, false],
    "the three slots that were filled are filled and the one that was not is not",
  );
  assert.equal(extensions.slots.cleared, true, "and null clears a slot rather than being refused");

  // --- the glTF extension bridge ---------------------------------------------------------------------
  const extensionBridge = evidence.extensionBridge;
  assert.equal(extensionBridge.defaults.clearcoat, 0, "glTF's clearcoat defaults to nothing");
  assert.ok(Math.abs(extensionBridge.defaults.iridescenceIor - 1.3) < 1e-5);
  assert.deepEqual(extensionBridge.defaults.thicknessRange, [100, 400]);
  assert.deepEqual(extensionBridge.defaults.attenuation, [1, 1, 1]);
  assert.deepEqual(extensionBridge.built.clearcoat, [0.25, 0.5]);
  assert.deepEqual(extensionBridge.built.sheen, [0.75, 0.5, 0.25, 0.125]);
  assert.deepEqual(extensionBridge.built.transmission, [0.5, 3, 7]);
  assert.ok(extensionBridge.built.attenuation.every(
    (v, i) => Math.abs(v - [0.6, 0.7, 0.8][i]) < 1e-6));
  assert.deepEqual(extensionBridge.built.iridescence, [0.875, 1.875, 120, 480]);
  assert.equal(extensionBridge.built.isNeutral, false);

  // --- the effect --------------------------------------------------------------------------------------
  const effect = evidence.effect;
  assert.equal(typeof effect, "object", `the effect did not run: ${effect}`);
  // A fresh effect starts at the same defaults the material does, which is what makes them one type.
  assert.equal(effect.defaults.metallic, defaults.metallic);
  assert.equal(effect.defaults.roughness, defaults.roughness);
  assert.equal(effect.defaults.ior, defaults.ior);
  assert.equal(effect.defaults.specular, defaults.specular);
  assert.equal(effect.defaults.normalScale, defaults.normalScale);
  assert.equal(effect.defaults.occlusion, defaults.occlusion);
  assert.equal(effect.defaults.alphaMode, defaults.alphaMode);
  assert.equal(effect.defaults.alphaCutoff, defaults.alphaCutoff);
  assert.equal(effect.defaults.doubleSided, defaults.doubleSided);
  assert.equal(effect.defaults.alpha, 1);
  assert.equal(effect.defaults.vertexColor, false);
  assert.deepEqual(effect.defaults.diffuse, [1, 1, 1]);
  // Applying a whole material puts every field on the effect, read back through the per-field
  // routes rather than through the extractor -- two different paths into the same state.
  assert.equal(effect.throughAccessors.metallic, 0.25);
  assert.equal(effect.throughAccessors.roughness, 0.75);
  assert.equal(effect.throughAccessors.ior, 1.75);
  assert.equal(effect.throughAccessors.specular, 0.5);
  assert.equal(effect.throughAccessors.normalScale, 2);
  assert.equal(effect.throughAccessors.occlusion, 0.375);
  assert.equal(effect.throughAccessors.alphaMode, AlphaMode.Blend);
  assert.equal(effect.throughAccessors.alphaCutoff, 0.625);
  assert.equal(effect.throughAccessors.doubleSided, true);
  assert.deepEqual(effect.throughAccessors.emissive, [0.125, 0.25, 0.375]);
  assert.ok(effect.throughAccessors.specularColor.every(
    (v, i) => Math.abs(v - [0.9, 0.8, 0.7][i]) < 1e-6));
  assert.equal(effect.throughAccessors.normalSet, 1, "the per-slot coordinate set arrived");
  assert.equal(effect.throughAccessors.baseColorSet, 0, "in its own slot and not another's");
  assert.deepEqual(effect.throughAccessors.normalTransform, [0.5, 0.25, 3, 4, 1.25]);
  assert.equal(effect.throughAccessors.baseColorSrgb, false, "the sRGB flag arrived per slot too");
  assert.equal(effect.throughAccessors.emissiveSrgb, true, "and the slots that were not written kept theirs");
  // And the extractor gives the same material back, by CNA's own equality.
  assert.equal(effect.roundTrip, true, "an applied material must extract back equal to itself");
  assert.deepEqual(
    effect.extracted.albedo, [200, 100, 40, 128],
    "a base colour must survive the material round trip in all four channels",
  );
  assert.ok(
    effect.extracted.text.includes("R:200") && effect.extracted.text.includes("A:128"),
    `and the printed form must name it: ${effect.extracted.text}`,
  );
  assert.equal(effect.extracted.metallic, 0.25);
  assert.equal(effect.extracted.alphaMode, AlphaMode.Blend);
  assert.equal(effect.extracted.doubleSided, true);
  assert.equal(effect.extracted.normalSet, 1);
  assert.deepEqual(effect.extracted.normalTransform, [3, 1.25]);
  // The individual setters reach the same state, so the two paths above really are two paths.
  assert.equal(effect.afterSetters.metallic, 0.875, "a per-field setter shows up in the extracted material");
  assert.equal(effect.afterSetters.alpha, 0.5);
  assert.ok(effect.afterSetters.diffuse.every((v, i) => Math.abs(v - [0.2, 0.4, 0.6][i]) < 1e-6));
  assert.equal(effect.afterSetters.vertexColor, true);
  assert.equal(effect.afterSetters.encodeSrgb, false);
  // A texture slot is a borrow: the effect records the handle and the extracted material does not
  // invent a wrapper for it.
  assert.equal(effect.slots.empty, true);
  assert.equal(
    effect.slots.afterApplyWithTexture, false,
    "finding 19: a texture applied with a material is invisible to the slot getter",
  );
  assert.equal(effect.slots.filled, true, "while one placed through the setter is visible");
  assert.equal(
    effect.slots.afterEmptyApply, true,
    "finding 19: and a material with an empty slot does not clear what the setter put there",
  );
  assert.equal(effect.slots.cleared, true, "null clears a slot");
  assert.equal(
    effect.slots.extractedIsNull, null,
    "an extracted material must not invent a Texture2D wrapper for a handle it does not own",
  );

  // --- the skinned effect --------------------------------------------------------------------------------
  const skinned = evidence.skinned;
  assert.equal(skinned.defaultWeights, 4, "four bone weights per vertex by default");
  assert.equal(skinned.setWeights, 2);
  assert.equal(skinned.count, 3);
  assert.deepEqual(skinned.translation, [3, 4, 5], "a bone's translation survives the round trip");
  assert.deepEqual(skinned.scale, [2, 2, 2], "and its scale");
  assert.deepEqual(skinned.identityIsIdentity, [1, 1, 1, 1, 0, 0, 0], "and identity stays identity");
  assert.equal(skinned.fewerThanSet, 1, "asking for fewer bones than were set gives that many");
  assert.equal(skinned.roundTrip, true, "and it carries a whole material like the unskinned one");
  assert.equal(skinned.materialRoughness, 0.125);

  // --- what ApplyState actually does ------------------------------------------------------------------------
  // Read back from CNA rather than from the wrapper, and predicted from the XNA states the C++
  // names -- NonPremultiplied for a blended material, Opaque otherwise; CullNone when double-sided.
  const state = evidence.deviceState;
  assert.equal(state.blended.blend.ColorSourceBlend, Blend.SourceAlpha);
  assert.equal(state.blended.blend.ColorDestinationBlend, Blend.InverseSourceAlpha);
  assert.equal(state.blended.blend.AlphaSourceBlend, Blend.SourceAlpha);
  assert.equal(state.blended.blend.AlphaDestinationBlend, Blend.InverseSourceAlpha);
  assert.equal(state.blended.cull, CullMode.None, "a double-sided material draws both faces");
  assert.equal(state.opaque.blend.ColorSourceBlend, Blend.One);
  assert.equal(state.opaque.blend.ColorDestinationBlend, Blend.Zero);
  assert.equal(state.opaque.cull, CullMode.CullCounterClockwiseFace);
  assert.equal(
    state.masked.blend.ColorSourceBlend, Blend.One,
    "a masked material discards rather than blends, so it takes the opaque blend state",
  );
  assert.deepEqual(
    state.blended.blend.ColorWriteChannels === state.opaque.blend.ColorWriteChannels ? "same" : "different",
    "same", "the write mask is not what the alpha mode changes",
  );
  assert.equal(
    state.wrapperUnaware, "BlendState.Opaque",
    "ApplyState writes CNA's state below the wrapper, which keeps reporting what it was given",
  );

  // --- refusals -----------------------------------------------------------------------------------------
  const refusals = evidence.refusals;
  assert.equal(refusals.disposedRead, "NativeUnavailableError", "a disposed set answers nothing");
  assert.equal(refusals.disposedWrite, "NativeUnavailableError");
  assert.equal(refusals.disposedTwice, "SUCCEEDED", "and disposing twice is harmless");
  assert.equal(refusals.isDisposed, true);
  assert.equal(refusals.shortCoordinateSets, "TypeError", "a material needs all seven slots");
  assert.equal(refusals.nonFinite, "TypeError", "and finite numbers");
  assert.equal(refusals.fractionalCoordinateSet, "TypeError", "a coordinate set is an integer");
  assert.equal(refusals.nullMaterial, "TypeError");
  assert.equal(refusals.nullDevice, "TypeError");
  assert.equal(refusals.nullExtensionDestination, "TypeError");

  console.log(
    `CNA_TS_NATIVE_PBR_MATERIAL=PASS VALUE=EQUALS_HASHES_PRINTS BRIDGE=ROUND(x*255) ` +
    `EXTENSIONS=${Object.keys(extensions.switches).length}_SWITCH_ROWS EFFECT=TWO_PATHS ` +
    `SKINNED=${skinned.count}_BONES STATE=READ_FROM_CNA`,
  );
});

test("the volumetric passes publish the arithmetic their shaders run, exactly", async () => {
  const { AerialPerspectivePass, HeightFogPass } = computeExtensions;

  // --- the air mass a ray crosses -----------------------------------------------------------------
  // Kasten-Young, written out here from the published formula rather than taken from a run, and
  // used only as the *ceiling*: the air mass rises linearly with distance until the whole
  // atmosphere in that direction has been crossed.
  const kastenYoung = (upwards) => {
    const up = Math.min(Math.max(upwards, 0), 1);
    const zenithDegrees = Math.acos(up) * (180 / Math.PI);
    return 1 / Math.max(up + 0.50572 * Math.max(96.07995 - zenithDegrees, 1e-3) ** -1.6364, 1e-4);
  };
  const airMass = (direction, distance, scaleHeight) => {
    const length = Math.hypot(direction.X, direction.Y, direction.Z);
    const upwards = length > 1e-6 ? direction.Y / length : 1;
    return Math.min(Math.max(distance, 0) / Math.max(scaleHeight, 1e-3), kastenYoung(upwards));
  };
  for (const [direction, distance, scaleHeight] of [
    [new Vector3(0, 1, 0), 1e9, 1], [new Vector3(1, 0, 0), 1e9, 1],
    [new Vector3(0, 1, 0), 0.5, 1], [new Vector3(0, 1, 0), 100, 400],
    [new Vector3(0, 1, 0), 0, 1], [new Vector3(0, 1, 0), -5, 1],
    [new Vector3(0, 0, 0), 1e9, 1], [new Vector3(1, 1, 0), 5000, 8400],
    [new Vector3(0, 0.2, 1), 1e9, 8400], [new Vector3(0, -1, 0), 1e9, 8400],
  ]) {
    const measured = AerialPerspectivePass.AirMassForDistance(direction, distance, scaleHeight);
    const predicted = airMass(direction, distance, scaleHeight);
    assert.ok(
      Math.abs(measured - predicted) < Math.max(predicted * 1e-4, 1e-6),
      `air mass along ${direction.X},${direction.Y},${direction.Z} over ${distance} at ` +
      `${scaleHeight}: ${measured} vs ${predicted}`,
    );
  }
  // The two ends, named so a regression to a constant or to the wrong axis fails visibly.
  assert.ok(
    Math.abs(AerialPerspectivePass.AirMassForDistance(new Vector3(0, 1, 0), 1e9, 1) - 1) < 1e-3,
    "straight up crosses one atmosphere",
  );
  assert.ok(
    Math.abs(AerialPerspectivePass.AirMassForDistance(new Vector3(1, 0, 0), 1e9, 1) - 37.92) < 0.1,
    "and along the horizon about thirty-eight of them",
  );
  assert.equal(
    AerialPerspectivePass.AirMassForDistance(new Vector3(0, 1, 0), 0, 1), 0,
    "no distance is no air",
  );
  assert.equal(
    AerialPerspectivePass.AirMassForDistance(new Vector3(0, 1, 0), -5, 1), 0,
    "and a negative distance is clamped rather than negated",
  );
  assert.equal(
    AerialPerspectivePass.AirMassForDistance(new Vector3(0, 0, 0), 1e9, 1),
    AerialPerspectivePass.AirMassForDistance(new Vector3(0, 1, 0), 1e9, 1),
    "a direction with no length is treated as straight up rather than dividing by zero",
  );
  // Below the horizon the ray points into the ground; the formula clamps rather than diverging.
  assert.ok(
    AerialPerspectivePass.AirMassForDistance(new Vector3(0, -1, 0), 1e9, 8400) > 0,
    "and a downward ray still answers a finite air mass",
  );

  // --- what survives that air mass ----------------------------------------------------------------
  // Rayleigh scattering per channel plus a Mie term that grows with turbidity, both written out
  // from the model rather than recorded.
  const RAYLEIGH = [0.0464, 0.1085, 0.2650];
  const transmittance = (turbidity, mass) => {
    const mie = 0.021 * Math.max(turbidity - 1, 0);
    return RAYLEIGH.map((beta) => Math.exp(-(beta + mie) * mass));
  };
  for (const [turbidity, mass] of [[1, 0], [1, 1], [4, 1], [2.5, 3], [1, 10], [8, 0.5], [0, 2]]) {
    const measured = AerialPerspectivePass.Transmittance(turbidity, mass);
    const predicted = transmittance(turbidity, mass);
    for (const [index, channel] of [measured.X, measured.Y, measured.Z].entries()) {
      assert.ok(
        Math.abs(channel - predicted[index]) < 1e-5,
        `transmittance channel ${index} at turbidity ${turbidity} mass ${mass}: ` +
        `${channel} vs ${predicted[index]}`,
      );
    }
  }
  const clear = AerialPerspectivePass.Transmittance(1, 0);
  assert.deepEqual([clear.X, clear.Y, clear.Z], [1, 1, 1], "no air takes nothing");
  const unit = AerialPerspectivePass.Transmittance(1, 1);
  assert.ok(
    unit.X > unit.Y && unit.Y > unit.Z,
    `blue must be scattered hardest, which is why distance goes blue: ${unit.X},${unit.Y},${unit.Z}`,
  );
  // Turbidity is grey: a Mie term that is the same in every channel narrows the spread between
  // them, which is why haze washes colour out rather than tinting it.
  const hazy = AerialPerspectivePass.Transmittance(8, 1);
  assert.ok(hazy.X < unit.X && hazy.Y < unit.Y && hazy.Z < unit.Z, "more aerosol takes more light");
  assert.ok(
    (hazy.X - hazy.Z) < (unit.X - unit.Z),
    "and takes it evenly, so the channels spread less than in clean air",
  );
  assert.deepEqual(
    [AerialPerspectivePass.Transmittance(0, 2).X, AerialPerspectivePass.Transmittance(1, 2).X],
    [AerialPerspectivePass.Transmittance(1, 2).X, AerialPerspectivePass.Transmittance(1, 2).X],
    "turbidity below one adds no Mie term rather than a negative one",
  );

  // --- the optical depth through a fog layer -------------------------------------------------------
  // The closed form of the integral the shader marches, written out here. Three branches: no fog at
  // all, a level ray that accumulates linearly, and a climbing or descending one that does not.
  const opticalDepth = (cameraHeight, rayHeightStep, distance, density, falloff, baseHeight) => {
    if (density <= 0 || distance <= 0 || falloff <= 0) return 0;
    const atCamera = density * Math.exp(-falloff * (cameraHeight - baseHeight));
    const climb = falloff * rayHeightStep;
    if (Math.abs(climb) < 1e-5) return Math.max(atCamera * distance, 0);
    return Math.max(atCamera * (1 - Math.exp(-climb * distance)) / climb, 0);
  };
  for (const args of [
    [0, 0, 100, 0.02, 0.1, 0], [0, 1, 100, 0.02, 0.1, 0], [20, 0, 100, 0.02, 0.1, 0],
    [0, 0, 100, 0, 0.1, 0], [0, 0, 0, 0.02, 0.1, 0], [0, 0, 100, 0.02, 0, 0],
    [0, -1, 100, 0.02, 0.1, 0], [8, 0, 50, 0.005, 0.25, 0], [5, 0.5, 30, 0.1, 0.5, 5],
    [-10, 0, 100, 0.02, 0.1, 0],
  ]) {
    const measured = HeightFogPass.OpticalDepth(...args);
    const predicted = opticalDepth(...args);
    assert.ok(
      Math.abs(measured - predicted) < Math.max(Math.abs(predicted) * 1e-4, 1e-6),
      `optical depth for ${args.join(",")}: ${measured} vs ${predicted}`,
    );
  }
  // Each branch, named.
  assert.equal(
    HeightFogPass.OpticalDepth(0, 0, 100, 0.02, 0.1, 0), 2,
    "a level ray through a layer it sits in accumulates density times distance",
  );
  assert.equal(HeightFogPass.OpticalDepth(0, 0, 100, 0, 0.1, 0), 0, "no density is no fog");
  assert.equal(HeightFogPass.OpticalDepth(0, 0, 0, 0.02, 0.1, 0), 0, "and no distance is no fog");
  assert.equal(
    HeightFogPass.OpticalDepth(0, 0, 100, 0.02, 0, 0), 0,
    "a falloff of zero is refused rather than dividing, because a layer with no falloff is not a layer",
  );
  assert.ok(
    HeightFogPass.OpticalDepth(0, 1, 100, 0.02, 0.1, 0) <
    HeightFogPass.OpticalDepth(0, 0, 100, 0.02, 0.1, 0),
    "a climbing ray leaves the layer, so it gathers less than a level one",
  );
  assert.ok(
    HeightFogPass.OpticalDepth(0, -1, 100, 0.02, 0.1, 0) >
    HeightFogPass.OpticalDepth(0, 0, 100, 0.02, 0.1, 0) * 100,
    "and a descending one runs into a denser layer, so it gathers far more",
  );
  assert.ok(
    HeightFogPass.OpticalDepth(20, 0, 100, 0.02, 0.1, 0) <
    HeightFogPass.OpticalDepth(0, 0, 100, 0.02, 0.1, 0),
    "a camera above the layer sees less of it",
  );
  assert.equal(
    HeightFogPass.OpticalDepth(20, 0, 100, 0.02, 0.1, 20),
    HeightFogPass.OpticalDepth(0, 0, 100, 0.02, 0.1, 0),
    "and moving the layer up with the camera puts it back exactly",
  );
  // A climbing ray converges: past some distance it has left the layer and gathers no more.
  const far = HeightFogPass.OpticalDepth(0, 1, 1e6, 0.02, 0.1, 0);
  const nearer = HeightFogPass.OpticalDepth(0, 1, 1000, 0.02, 0.1, 0);
  assert.ok(
    Math.abs(far - nearer) < 1e-4 && far > 0,
    `a climbing ray's optical depth converges: ${nearer} then ${far}`,
  );

  assert.throws(() => AerialPerspectivePass.AirMassForDistance(null, 1, 1), TypeError);
  assert.throws(() => AerialPerspectivePass.Transmittance(Number.NaN, 1), TypeError);
  assert.throws(() => HeightFogPass.OpticalDepth(0, 0, 100, 0.02, 0.1, Number.NaN), TypeError);

  console.log(
    `CNA_TS_NATIVE_VOLUMETRIC_MATHS=PASS AIR_MASS=KASTEN_YOUNG TRANSMITTANCE=RAYLEIGH_PLUS_MIE ` +
    `OPTICAL_DEPTH=THREE_BRANCHES`,
  );
});

test("the frustum culler answers what this package's own BoundingFrustum answers", async () => {
  const { FrustumCuller, InstanceStreams } = computeExtensions;
  const { VertexElementFormat, VertexElementUsage } = Graphics;

  const view = Matrix.CreateLookAt(new Vector3(0, 0, 10), Vector3.Zero, Vector3.Up);
  const projection = Matrix.CreatePerspectiveFieldOfView(Math.PI / 4, 1, 1, 100);
  const viewProjection = Matrix.Multiply(view, projection);
  // The reference is XNA's own frustum, built here from the same camera. Two implementations of
  // the same predicate, neither derived from the other.
  const reference = new BoundingFrustum(viewProjection);

  // Boxes chosen so the answer is not all one value: a plane's sign error, a swapped near and far,
  // or a missing side plane each changes at least one row.
  const boxes = [
    ["at the origin", new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1))],
    ["just past the near plane", new BoundingBox(new Vector3(-0.1, -0.1, 8.4), new Vector3(0.1, 0.1, 8.6))],
    ["behind the camera", new BoundingBox(new Vector3(-1, -1, 60), new Vector3(1, 1, 62))],
    ["past the far plane", new BoundingBox(new Vector3(-1, -1, -500), new Vector3(1, 1, -498))],
    ["off to the right", new BoundingBox(new Vector3(200, -1, -1), new Vector3(202, 1, 1))],
    ["off to the left", new BoundingBox(new Vector3(-202, -1, -1), new Vector3(-200, 1, 1))],
    ["above", new BoundingBox(new Vector3(-1, 200, -1), new Vector3(1, 202, 1))],
    ["below", new BoundingBox(new Vector3(-1, -202, -1), new Vector3(1, -200, 1))],
    ["straddling the near plane", new BoundingBox(new Vector3(-1, -1, 8), new Vector3(1, 1, 11))],
    ["large enough to contain the camera", new BoundingBox(new Vector3(-50, -50, -50), new Vector3(50, 50, 50))],
    ["deep but on axis", new BoundingBox(new Vector3(-2, -2, -80), new Vector3(2, 2, -70))],
  ];
  const spheres = [
    ["at the origin", new BoundingSphere(Vector3.Zero, 1)],
    ["behind", new BoundingSphere(new Vector3(0, 0, 60), 1)],
    ["far to the side", new BoundingSphere(new Vector3(300, 0, 0), 1)],
    ["far to the side but huge", new BoundingSphere(new Vector3(300, 0, 0), 320)],
    ["deep on axis", new BoundingSphere(new Vector3(0, 0, -70), 3)],
  ];

  const culler = new FrustumCuller();
  try {
    culler.SetCamera(view, projection);
    // The frustum a culler holds is the view-projection a BoundingFrustum is built from.
    const held = culler.Frustum;
    for (const key of ["M11", "M22", "M33", "M34", "M41", "M43", "M44"]) {
      assert.ok(
        Math.abs(held[key] - viewProjection[key]) < 1e-4,
        `the culler's frustum is not the view-projection at ${key}: ${held[key]} vs ${viewProjection[key]}`,
      );
    }

    let visibleBoxes = 0;
    for (const [name, box] of boxes) {
      const mine = culler.IsVisible(box);
      const theirs = reference.Intersects(box);
      assert.equal(mine, theirs, `the culler and BoundingFrustum disagree about a box ${name}`);
      if (mine) visibleBoxes += 1;
    }
    // The comparison must not be vacuous: some are in and some are out.
    assert.ok(
      visibleBoxes >= 3 && visibleBoxes <= boxes.length - 4,
      `${visibleBoxes} of ${boxes.length} boxes visible, which is too one-sided to prove anything`,
    );
    let visibleSpheres = 0;
    for (const [name, sphere] of spheres) {
      const mine = culler.IsVisible(sphere);
      assert.equal(
        mine, reference.Intersects(sphere),
        `the culler and BoundingFrustum disagree about a sphere ${name}`,
      );
      if (mine) visibleSpheres += 1;
    }
    assert.ok(visibleSpheres >= 2 && visibleSpheres < spheres.length, "spheres too one-sided");

    // The bulk routes answer the indices of exactly the ones the single test keeps, in order.
    assert.deepEqual(
      culler.CullBoxes(boxes.map(([, box]) => box)),
      boxes.map(([, box], index) => (culler.IsVisible(box) ? index : -1)).filter((i) => i >= 0),
      "culling a batch of boxes must keep exactly what testing them one at a time keeps",
    );
    assert.deepEqual(
      culler.CullSpheres(spheres.map(([, sphere]) => sphere)),
      spheres.map(([, sphere], index) => (culler.IsVisible(sphere) ? index : -1)).filter((i) => i >= 0),
      "and the same for spheres",
    );
    assert.deepEqual(culler.CullBoxes([]), [], "an empty batch keeps nothing");
    assert.deepEqual(culler.CullSpheres([]), []);

    // Setting the camera as one matrix and as two must be the same camera.
    const combined = new FrustumCuller();
    try {
      combined.SetViewProjection(viewProjection);
      for (const [name, box] of boxes) {
        assert.equal(
          combined.IsVisible(box), culler.IsVisible(box),
          `a culler set from one matrix disagrees with one set from two about ${name}`,
        );
      }
    } finally {
      combined.Dispose();
    }

    // --- culling transforms, and the two traps in how it pairs them -----------------------------
    const unit = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const places = [
      Vector3.Zero, new Vector3(0, 0, 60), new Vector3(300, 0, 0), new Vector3(0, 0, -20),
    ];
    const transforms = places.map((place) => Matrix.CreateTranslation(place));
    const worldBoxes = places.map((place) => new BoundingBox(
      Vector3.Add(place, unit.Min), Vector3.Add(place, unit.Max)));
    const expected = worldBoxes
      .map((box, index) => (reference.Intersects(box) ? index : -1))
      .filter((index) => index >= 0);
    assert.deepEqual(expected, [0, 3], "the fixture must keep two of the four, or it proves little");
    // Paired one-to-one in world space, this answers exactly what CullBoxes does.
    const paired = culler.CullTransforms(transforms, worldBoxes);
    assert.deepEqual(
      paired.map((matrix) => [matrix.M41, matrix.M42, matrix.M43]),
      expected.map((index) => [places[index].X, places[index].Y, places[index].Z]),
      "culling transforms with one world-space bound each must match culling those bounds",
    );
    assert.deepEqual(culler.CullBoxes(worldBoxes), expected);
    // Trap one: a transform with no matching bound is KEPT. CNA's header says so, and a caller who
    // passes one shared box gets everything back rather than everything tested against it.
    assert.equal(
      culler.CullTransforms(transforms, [unit]).length, transforms.length,
      "a single shared bound keeps every transform, because only the first one has a bound at all",
    );
    assert.equal(
      culler.CullTransforms(transforms, []).length, transforms.length,
      "and no bounds at all keeps everything",
    );
    // Trap two: the bounds are world-space. The transform is the payload, not something applied to
    // its bound -- so four copies of a local unit box keep all four transforms.
    assert.equal(
      culler.CullTransforms(transforms, places.map(() => unit)).length, transforms.length,
      "the transform is not applied to its bound: local bounds at the origin keep everything",
    );
    assert.deepEqual(culler.CullTransforms([], []), [], "nothing in is nothing out");

    assert.throws(() => culler.IsVisible(null), TypeError);
    assert.throws(() => culler.CullBoxes(null), TypeError);
    assert.throws(() => culler.SetCamera(null, projection), TypeError);
  } finally {
    culler.Dispose();
  }
  const disposed = new FrustumCuller();
  disposed.Dispose();
  assert.equal(disposed.IsDisposed, true);
  assert.throws(() => disposed.IsVisible(boxes[0][1]), NativeUnavailableError);
  assert.doesNotThrow(() => disposed.Dispose(), "disposing twice is harmless");

  // --- the vertex declarations an instancing stream takes ----------------------------------------
  // CNA describes them rather than this package writing them down, so a buffer built to these is
  // built to what the layer's own shaders read.
  const transformElements = InstanceStreams.TransformElements;
  assert.equal(transformElements.length, 4, "a transform stream is four rows of a matrix");
  for (const [index, element] of transformElements.entries()) {
    assert.equal(element.Offset, index * 16, "each row follows the last with no padding");
    assert.equal(
      element.VertexElementFormat, VertexElementFormat.Vector4,
      "and each is four floats",
    );
    assert.equal(
      element.VertexElementUsage, VertexElementUsage.TextureCoordinate,
      "carried on texture coordinate channels, which is how instancing has always smuggled a matrix in",
    );
    assert.equal(element.UsageIndex, index + 1, "on consecutive channels above the mesh's own");
  }
  assert.equal(
    InstanceStreams.TransformStride, 64,
    "and the stride is exactly four rows of four floats: sixteen bytes each",
  );
  assert.equal(
    InstanceStreams.TransformStride, transformElements.length * 16,
    "which is the elements' own total, not a number written down separately",
  );
  const tintElements = InstanceStreams.TintElements;
  assert.equal(tintElements.length, 1, "a tint is one element");
  assert.equal(tintElements[0].Offset, 0);
  assert.equal(tintElements[0].VertexElementFormat, VertexElementFormat.Color);
  assert.equal(tintElements[0].VertexElementUsage, VertexElementUsage.Color);
  assert.equal(tintElements[0].UsageIndex, 1, "above the mesh's own colour channel");
  assert.equal(InstanceStreams.TintStride, 4, "and a packed colour is four bytes");

  console.log(
    `CNA_TS_NATIVE_FRUSTUM_CULLER=PASS AGREES_WITH=BoundingFrustum BOXES=${boxes.length} ` +
    `SPHERES=${spheres.length} TRANSFORM_TRAPS=2 STREAMS=${InstanceStreams.TransformStride}/` +
    `${InstanceStreams.TintStride}`,
  );
});
