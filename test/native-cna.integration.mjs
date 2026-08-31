import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  Audio,
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
  Point,
  Quaternion,
  Vector2,
  Vector3,
} from "../dist/index.js";
import { CNA_ABI_MAJOR, CNA_ABI_MINOR } from "../dist/internal/abi.js";
import * as renderPipelineModule from "../dist/extensions/graphics/index.js";
import * as extensionsModule from "../dist/extensions/index.js";
import * as devicesModule from "../dist/extensions/devices/index.js";
import * as inputModule from "../dist/extensions/input/index.js";
import * as sensorsModule from "../dist/extensions/sensors/index.js";
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
    for (const [name, call] of [
      ["ShowSignIn", () => gs.Guide.ShowSignIn(1, false)],
      ["DelayNotifications", () => gs.Guide.DelayNotifications(TimeSpan.Zero)],
      ["ShowMessageBox", () => gs.Guide.BeginShowMessageBox("t", "m", ["a"], 0, gs.MessageBoxIcon.None, null, null)],
    ]) {
      try {
        call();
        this.evidence[`${name}Refusal`] = "allowed";
      } catch (error) {
        this.evidence[`${name}Refusal`] = error.constructor.name;
      }
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
  assert.equal(evidence.ShowMessageBoxRefusal, "GamerServicesNotAvailableException");
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
