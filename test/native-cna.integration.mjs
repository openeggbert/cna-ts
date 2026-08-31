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
