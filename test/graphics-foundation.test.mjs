import assert from "node:assert/strict";
import test from "node:test";

import {
  BoundingSphere,
  Color,
  Content,
  Game,
  Graphics,
  GraphicsDeviceManager,
  NativeUnavailableError,
  Matrix,
  Rectangle,
  Vector2,
  Vector3,
  Vector4,
} from "../dist/index.js";
import { getBackend, setBackendForInternalUse } from "../dist/internal/backend.js";

function fakeBackend(calls) {
  let next = 100n;
  const vertexData = new Map();
  const indexData = new Map();
  return {
    Kind: "node-native",
    IsAvailable: true,
    AbiVersion: "0.7.0-test",
    Detail: "graphics ownership test backend",
    async initialize() { calls.push("initialize"); },
    updateFrameworkDispatcher() { calls.push("dispatcher"); },
    getLastError() { return null; },
    createGame() { calls.push("game:create"); return next++; },
    async runGame(handle) { calls.push(`game:run:${handle}`); },
    runGameOneFrame(handle) { calls.push(`game:frame:${handle}`); },
    exitGame(handle) { calls.push(`game:exit:${handle}`); },
    destroyGame(handle) { calls.push(`game:destroy:${handle}`); },
    createGraphicsDeviceManager(handle) { calls.push(`manager:create:${handle}`); return next++; },
    configureGraphicsDeviceManager(handle, configuration) {
      calls.push(`manager:configure:${handle}:${configuration.PreferredBackBufferWidth}x${configuration.PreferredBackBufferHeight}`);
    },
    applyGraphicsDeviceManagerChanges(handle) { calls.push(`manager:apply:${handle}`); },
    toggleGraphicsDeviceManagerFullScreen(handle) { calls.push(`manager:toggle:${handle}`); },
    createManagedGraphicsDevice(handle) { calls.push(`device:create:${handle}`); },
    beginGraphicsDeviceManagerDraw(handle) { calls.push(`manager:begin:${handle}`); return true; },
    endGraphicsDeviceManagerDraw(handle) { calls.push(`manager:end:${handle}`); },
    destroyGraphicsDeviceManager(handle) { calls.push(`manager:destroy:${handle}`); },
    borrowGraphicsDevice(handle) { calls.push(`device:borrow:${handle}`); return 500n; },
    clearGraphicsDevice(handle, color) { calls.push(`device:clear:${handle}:${color}`); },
    presentGraphicsDevice(handle) { calls.push(`device:present:${handle}`); },
    createTexture2D(handle, width, height, mipMap, format) {
      calls.push(`texture:create:${handle}:${width}x${height}:${mipMap}:${format}`);
      return next++;
    },
    destroyTexture2D(handle) { calls.push(`texture:destroy:${handle}`); },
    createSpriteBatch(handle) { calls.push(`sprite:create:${handle}`); return next++; },
    beginSpriteBatch(handle, sortMode) { calls.push(`sprite:begin:${handle}:${sortMode}`); },
    submitSpriteBatch(handle, commands) { calls.push(`sprite:submit:${handle}:${commands.length}`); },
    endSpriteBatch(handle) { calls.push(`sprite:end:${handle}`); },
    destroySpriteBatch(handle) { calls.push(`sprite:destroy:${handle}`); },
    createVertexBuffer(_device, stride, _elements, count) {
      const handle = next++;
      calls.push(`vertex:create:${handle}:${count}x${stride}`);
      vertexData.set(handle, new Uint8Array(count * stride));
      return handle;
    },
    setVertexBufferRaw(handle, bytes) { vertexData.set(handle, new Uint8Array(bytes)); },
    getVertexBufferRaw(handle) { return new Uint8Array(vertexData.get(handle)); },
    destroyVertexBuffer(handle) { calls.push(`vertex:destroy:${handle}`); vertexData.delete(handle); },
    createIndexBuffer(_device, size, count) {
      const handle = next++;
      calls.push(`index:create:${handle}:${count}:${size}`);
      indexData.set(handle, new Uint8Array(count * (size === 0 ? 2 : 4)));
      return handle;
    },
    setIndexBufferRaw(handle, _size, bytes) { indexData.set(handle, new Uint8Array(bytes)); },
    getIndexBufferRaw(handle) { return new Uint8Array(indexData.get(handle)); },
    destroyIndexBuffer(handle) { calls.push(`index:destroy:${handle}`); indexData.delete(handle); },
  };
}

function graphicsRuntimeBackend(calls) {
  const backend = fakeBackend(calls);
  let next = 10_000n;
  const vertexData = new Map();
  const indexData = new Map();
  const texture3DData = new Map();
  const textureCubeData = new Map();
  const renderTargets = new Map();
  const queries = new Map();
  Object.assign(backend, {
    getGraphicsDeviceStatus() { return Graphics.GraphicsDeviceStatus.Normal; },
    setGraphicsDeviceBlendState(_device, value) { calls.push(["blend", value]); },
    setGraphicsDeviceDepthStencilState(_device, value) { calls.push(["depth", value]); },
    setGraphicsDeviceRasterizerState(_device, value) { calls.push(["rasterizer", value]); },
    setGraphicsDeviceSamplerState(_device, stage, slot, value) {
      if (backend.failNextSampler) {
        backend.failNextSampler = false;
        throw new Error("injected sampler failure");
      }
      calls.push(["sampler", stage, slot, value]);
    },
    setGraphicsDeviceTexture(_device, stage, slot, texture) {
      calls.push(["texture", stage, slot, texture]);
    },
    setGraphicsDeviceBlendFactor(_device, value) { calls.push(["blendFactor", value]); },
    setGraphicsDeviceMultiSampleMask(_device, value) { calls.push(["multiSampleMask", value]); },
    setGraphicsDeviceReferenceStencil(_device, value) { calls.push(["referenceStencil", value]); },
    setGraphicsDeviceScissorRectangle(_device, x, y, width, height) {
      calls.push(["scissor", x, y, width, height]);
    },
    setGraphicsDeviceViewport(_device, value) { calls.push(["viewport", value]); },
    setGraphicsDeviceVertexBuffers(_device, bindings) { calls.push(["vertexBindings", bindings]); },
    setGraphicsDeviceIndexBuffer(_device, buffer) { calls.push(["indexBinding", buffer]); },
    setGraphicsDeviceRenderTargets(_device, bindings) { calls.push(["renderTargets", bindings]); },
    drawPrimitives(...args) { calls.push(["draw", ...args]); },
    drawIndexedPrimitives(...args) { calls.push(["drawIndexed", ...args]); },
    drawInstancedPrimitives(...args) { calls.push(["drawInstanced", ...args]); },
    drawUserPrimitives(...args) { calls.push(["drawUser", ...args]); },
    drawUserIndexedPrimitives(...args) { calls.push(["drawUserIndexed", ...args]); },
    beginSpriteBatchWithStates(...args) { calls.push(["spriteStates", ...args]); },
    createVertexBuffer(_device, stride, _elements, count, _usage, dynamic) {
      const handle = next++;
      vertexData.set(handle, new Uint8Array(stride * count));
      calls.push(["vertexCreate", handle, dynamic]);
      return handle;
    },
    setVertexBufferRaw(handle, bytes) { vertexData.set(handle, new Uint8Array(bytes)); },
    getVertexBufferRaw(handle) { return new Uint8Array(vertexData.get(handle)); },
    setVertexBufferData(handle, _type, options, _start, _count, _capacity, bytes) {
      vertexData.set(handle, new Uint8Array(bytes));
      calls.push(["vertexSet", options]);
    },
    setVertexBufferRawAt(handle, offset, bytes) { vertexData.get(handle).set(bytes, offset); },
    getVertexBufferRawAt(handle, offset, count, stride) {
      return vertexData.get(handle).slice(offset, offset + count * stride);
    },
    getVertexBufferIsContentLost() { return false; },
    destroyVertexBuffer(handle) { vertexData.delete(handle); calls.push(["vertexDestroy", handle]); },
    createIndexBuffer(_device, size, count, _usage, dynamic) {
      const handle = next++;
      indexData.set(handle, new Uint8Array(count * (size === 0 ? 2 : 4)));
      calls.push(["indexCreate", handle, dynamic]);
      return handle;
    },
    setIndexBufferRaw(handle, _size, bytes) { indexData.set(handle, new Uint8Array(bytes)); },
    getIndexBufferRaw(handle) { return new Uint8Array(indexData.get(handle)); },
    setIndexBufferData(handle, _size, options, _offset, _start, _count, _capacity, bytes) {
      indexData.set(handle, new Uint8Array(bytes));
      calls.push(["indexSet", options]);
    },
    getIndexBufferIsContentLost() { return false; },
    destroyIndexBuffer(handle) { indexData.delete(handle); calls.push(["indexDestroy", handle]); },
    createTexture3D(_device, width, height, depth, mipMap, format) {
      const handle = next++;
      texture3DData.set(handle, {
        info: { Width: width, Height: height, Depth: depth, LevelCount: mipMap ? 2 : 1, Format: format },
        colors: new Uint32Array(width * height * depth),
      });
      return handle;
    },
    getTexture3DInfo(handle) { return texture3DData.get(handle).info; },
    setTexture3DColors(handle, _level, _left, _top, _right, _bottom, _front, _back,
      start, count, colors) {
      texture3DData.get(handle).colors.set(colors.slice(start, start + count), start);
    },
    getTexture3DColors(handle, _level, _left, _top, _right, _bottom, _front, _back,
      _start, _count, capacity) {
      return texture3DData.get(handle).colors.slice(0, capacity);
    },
    destroyTexture3D(handle) { texture3DData.delete(handle); },
    createTextureCube(_device, size, mipMap, format) {
      const handle = next++;
      textureCubeData.set(handle, {
        info: { Size: size, LevelCount: mipMap ? 2 : 1, Format: format },
        colors: new Uint32Array(size * size),
      });
      return handle;
    },
    getTextureCubeInfo(handle) { return textureCubeData.get(handle).info; },
    setTextureCubeColors(handle, _face, _level, _rect, start, count, colors) {
      textureCubeData.get(handle).colors.set(colors.slice(start, start + count), start);
    },
    getTextureCubeColors(handle, _face, _level, _rect, _start, _count, capacity) {
      return textureCubeData.get(handle).colors.slice(0, capacity);
    },
    destroyTextureCube(handle) { textureCubeData.delete(handle); },
    createRenderTarget2D(_device, width, height, mipMap, format, depth, samples, usage) {
      const handle = next++;
      renderTargets.set(handle, {
        Kind: 1, Width: width, Height: height, Size: 0, LevelCount: mipMap ? 2 : 1,
        Format: format, DepthFormat: depth, MultiSampleCount: samples, Usage: usage,
        IsContentLost: false, RendererAvailable: true,
      });
      return handle;
    },
    createRenderTargetCube(_device, size, mipMap, format, depth, samples, usage) {
      const handle = next++;
      renderTargets.set(handle, {
        Kind: 2, Width: size, Height: size, Size: size, LevelCount: mipMap ? 2 : 1,
        Format: format, DepthFormat: depth, MultiSampleCount: samples, Usage: usage,
        IsContentLost: false, RendererAvailable: true,
      });
      textureCubeData.set(handle, {
        info: { Size: size, LevelCount: mipMap ? 2 : 1, Format: format },
        colors: new Uint32Array(size * size),
      });
      return handle;
    },
    getRenderTargetInfo(handle) { return renderTargets.get(handle); },
    destroyRenderTarget(handle) { renderTargets.delete(handle); textureCubeData.delete(handle); },
    createOcclusionQuery() {
      const handle = next++;
      queries.set(handle, { active: false, ended: false });
      return handle;
    },
    beginOcclusionQuery(handle) { queries.set(handle, { active: true, ended: false }); },
    endOcclusionQuery(handle) { queries.set(handle, { active: false, ended: true }); },
    getOcclusionQueryIsComplete(handle) { return queries.get(handle).ended; },
    getOcclusionQueryPixelCount() { return 7; },
    destroyOcclusionQuery(handle) { queries.delete(handle); },
  });
  backend.Graphics = backend;
  return backend;
}

function effectRuntimeBackend(calls) {
  const backend = graphicsRuntimeBackend(calls);
  let next = 50_000n;
  Object.assign(backend, {
    createEffectEmpty() { const handle = next++; calls.push(["effectCreateEmpty", handle]); return handle; },
    createEffectCompiled(_device, bytes) {
      assert.ok(bytes instanceof Uint8Array);
      const handle = next++;
      calls.push(["effectCreateCompiled", handle, [...bytes]]);
      return handle;
    },
    cloneEffect(source) { const handle = next++; calls.push(["effectClone", source, handle]); return handle; },
    createStockEffect(_device, kind) {
      const handle = next++;
      calls.push(["stockCreate", kind, handle]);
      return handle;
    },
    getEffectReflection(effect) {
      if (backend.failReflection) {
        backend.failReflection = false;
        throw new Error("injected reflection failure");
      }
      return {
        CurrentTechnique: 0,
        Techniques: [{
          Handle: next++,
          Name: "Default",
          Annotations: [],
          Passes: [{ Handle: next++, Name: "P0", Annotations: [] }],
        }],
      };
    },
    // A stock effect carries no native parameter collection -- CNA answers count 0 for one, which
    // is measured in effect-reflection.integration.mjs. This double says the same.
    getEffectParameters(effect) {
      calls.push(["effectParameters", effect]);
      return [];
    },
    destroyEffectParameter(parameter) { calls.push(["effectParameterDestroy", parameter]); },
    setEffectCurrentTechnique(effect, technique) { calls.push(["effectTechnique", effect, technique]); },
    applyEffect(effect) { calls.push(["effectApply", effect]); },
    applyEffectPass(pass) { calls.push(["effectPassApply", pass]); },
    syncStockEffect(effect, kind, snapshot) {
      calls.push(["stockSync", effect, kind, snapshot.World.length, snapshot.Lights.length]);
    },
    destroyEffectTechnique(technique) { calls.push(["effectTechniqueDestroy", technique]); },
    destroyEffectPass(pass) { calls.push(["effectPassDestroy", pass]); },
    destroyEffect(effect) { calls.push(["effectDestroy", effect]); },
    beginSpriteBatchWithEffect(...args) { calls.push(["spriteEffectBegin", ...args]); },
  });
  backend.Effects = backend;
  return backend;
}

test("native Effect views retain ownership, apply exact routes, and roll back construction", (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  const backend = effectRuntimeBackend(calls);
  setBackendForInternalUse(backend);
  const game = new Game();
  const manager = new GraphicsDeviceManager(game);
  manager.CreateDevice();
  const device = manager.GraphicsDevice;

  const effect = new Graphics.BasicEffect(device);
  const pass = effect.CurrentTechnique.Passes.Get(0);
  assert.equal("Handle" in effect, false);
  assert.equal("Handle" in pass, false);
  pass.Apply();
  effect.OnApply();
  assert.ok(calls.some((value) => value[0] === "stockSync"));
  assert.ok(calls.some((value) => value[0] === "effectPassApply"));
  assert.ok(calls.some((value) => value[0] === "effectApply"));

  const batch = new Graphics.SpriteBatch(device);
  batch.Begin(
    Graphics.SpriteSortMode.Deferred,
    Graphics.BlendState.AlphaBlend,
    Graphics.SamplerState.LinearClamp,
    Graphics.DepthStencilState.None,
    Graphics.RasterizerState.CullCounterClockwise,
    effect,
  );
  assert.throws(() => effect.Dispose(), { name: "InvalidOperationException" });
  batch.End();
  assert.ok(calls.some((value) => value[0] === "spriteEffectBegin"));
  batch.Dispose();

  backend.failReflection = true;
  assert.throws(() => new Graphics.Effect(device, [1, 2, 3]), /injected reflection failure/);
  assert.ok(calls.some((value) => value[0] === "effectCreateCompiled"));
  const destroyedAfterRollback = calls.filter((value) => value[0] === "effectDestroy").length;
  assert.equal(destroyedAfterRollback, 1);

  effect.Dispose();
  assert.throws(() => pass.Apply(), { name: "ObjectDisposedException" });
  assert.ok(calls.some((value) => value[0] === "effectPassDestroy"));
  assert.ok(calls.some((value) => value[0] === "effectTechniqueDestroy"));
  game.Dispose();
});

test("graphics states expose XNA enum values, defaults, presets, and binding immutability", () => {
  assert.deepEqual(
    [Graphics.Blend.One, Graphics.Blend.Zero, Graphics.Blend.SourceAlphaSaturation],
    [0, 1, 12],
  );
  assert.deepEqual(
    [Graphics.ColorWriteChannels.None, Graphics.ColorWriteChannels.All],
    [0, 15],
  );
  const blend = new Graphics.BlendState();
  assert.deepEqual(
    [blend.ColorSourceBlend, blend.ColorDestinationBlend, blend.BlendFactor.PackedValue, blend.MultiSampleMask],
    [Graphics.Blend.One, Graphics.Blend.Zero, Color.White.PackedValue, -1],
  );
  blend.ColorSourceBlend = Graphics.Blend.SourceAlpha;
  assert.equal(blend.ColorSourceBlend, Graphics.Blend.SourceAlpha);
  assert.throws(
    () => { Graphics.BlendState.AlphaBlend.ColorSourceBlend = Graphics.Blend.Zero; },
    { name: "InvalidOperationException" },
  );

  assert.deepEqual(
    [Graphics.DepthStencilState.Default.DepthBufferEnable,
      Graphics.DepthStencilState.Default.DepthBufferWriteEnable,
      Graphics.DepthStencilState.DepthRead.DepthBufferWriteEnable,
      Graphics.DepthStencilState.None.DepthBufferEnable],
    [true, true, false, false],
  );
  assert.deepEqual(
    [Graphics.RasterizerState.CullClockwise.CullMode,
      Graphics.RasterizerState.CullCounterClockwise.CullMode,
      Graphics.RasterizerState.CullNone.CullMode],
    [Graphics.CullMode.CullClockwiseFace, Graphics.CullMode.CullCounterClockwiseFace, Graphics.CullMode.None],
  );
  assert.deepEqual(
    [Graphics.SamplerState.PointClamp.Filter, Graphics.SamplerState.PointClamp.AddressU,
      Graphics.SamplerState.AnisotropicWrap.Filter, Graphics.SamplerState.AnisotropicWrap.AddressU],
    [Graphics.TextureFilter.Point, Graphics.TextureAddressMode.Clamp,
      Graphics.TextureFilter.Anisotropic, Graphics.TextureAddressMode.Wrap],
  );
});

test("CNA graphics routes preserve identity, validate transfers, and roll back failed binding", (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  const backend = graphicsRuntimeBackend(calls);
  setBackendForInternalUse(backend);

  const game = new Game();
  const manager = new GraphicsDeviceManager(game);
  manager.CreateDevice();
  const device = manager.GraphicsDevice;
  const secondGame = new Game();
  const secondManager = new GraphicsDeviceManager(secondGame);
  secondManager.CreateDevice();
  const secondDevice = secondManager.GraphicsDevice;

  assert.equal(device.GraphicsDeviceStatus, Graphics.GraphicsDeviceStatus.Normal);
  const blend = new Graphics.BlendState();
  const depth = new Graphics.DepthStencilState();
  const rasterizer = new Graphics.RasterizerState();
  device.BlendState = blend;
  device.BlendState = blend;
  device.DepthStencilState = depth;
  device.RasterizerState = rasterizer;
  assert.deepEqual([device.BlendState, device.DepthStencilState, device.RasterizerState],
    [blend, depth, rasterizer]);

  const failedSampler = new Graphics.SamplerState();
  backend.failNextSampler = true;
  assert.throws(() => device.SamplerStates.Set(0, failedSampler), /injected sampler failure/);
  secondDevice.SamplerStates.Set(0, failedSampler);
  assert.equal(secondDevice.SamplerStates.Get(0), failedSampler);
  assert.throws(() => device.SamplerStates.Set(0, failedSampler), { name: "InvalidOperationException" });
  assert.throws(() => device.SamplerStates.Get(-1), { name: "ArgumentOutOfRangeException" });

  const texture = new Graphics.Texture2D(device, 2, 2);
  device.Textures.Set(0, texture);
  device.Textures.Set(0, texture);
  assert.equal(device.Textures.Get(0), texture);
  assert.throws(() => secondDevice.Textures.Set(0, texture), { name: "InvalidOperationException" });
  assert.throws(() => device.Textures.Set(99, texture), { name: "ArgumentOutOfRangeException" });
  texture.Dispose();
  assert.equal(device.Textures.Get(0), null);

  const vertices = [
    new Graphics.VertexPositionColor(new Vector3(0, 0, 0), Color.Red),
    new Graphics.VertexPositionColor(new Vector3(1, 0, 0), Color.Green),
    new Graphics.VertexPositionColor(new Vector3(0, 1, 0), Color.Blue),
  ];
  const vertexBuffer = new Graphics.DynamicVertexBuffer(
    device, Graphics.VertexPositionColor, 3, Graphics.BufferUsage.None,
  );
  vertexBuffer.SetData(vertices, 0, 3, Graphics.SetDataOptions.Discard);
  const vertexOutput = new Array(3);
  vertexBuffer.GetData(vertexOutput, 0, 3);
  assert.deepEqual(
    vertexOutput.map((value) => value.ToString()),
    vertices.map((value) => value.ToString()),
  );
  assert.equal(vertexBuffer.IsContentLost, false);
  assert.throws(
    () => vertexBuffer.SetData(1, vertices, 0, 1, 16, Graphics.SetDataOptions.NoOverwrite),
    { name: "ArgumentException" },
  );

  const indexBuffer = new Graphics.DynamicIndexBuffer(
    device, Graphics.IndexElementSize.SixteenBits, 3, Graphics.BufferUsage.None,
  );
  indexBuffer.SetData([0, 1, 2], 0, 3, Graphics.SetDataOptions.NoOverwrite);
  const indexOutput = new Array(3);
  indexBuffer.GetData(indexOutput);
  assert.deepEqual(indexOutput, [0, 1, 2]);
  assert.throws(() => indexBuffer.SetData([0, 70_000, 2]), { name: "ArgumentException" });

  assert.throws(
    () => device.DrawPrimitives(Graphics.PrimitiveType.TriangleList, 0, 1),
    { name: "InvalidOperationException" },
  );
  device.SetVertexBuffer(vertexBuffer);
  device.Indices = indexBuffer;
  assert.equal(device.GetVertexBuffers()[0].VertexBuffer, vertexBuffer);
  assert.equal(device.Indices, indexBuffer);
  device.DrawPrimitives(Graphics.PrimitiveType.TriangleList, 0, 1);
  device.DrawIndexedPrimitives(Graphics.PrimitiveType.TriangleList, 0, 0, 3, 0, 1);
  device.DrawInstancedPrimitives(Graphics.PrimitiveType.TriangleList, 0, 0, 3, 0, 1, 2);
  device.DrawUserPrimitives(Graphics.PrimitiveType.TriangleList, vertices, 0, 1);
  device.DrawUserIndexedPrimitives(
    Graphics.PrimitiveType.TriangleList, vertices, 0, 3, [0, 1, 2], 0, 1,
  );
  assert.throws(
    () => device.DrawUserPrimitives(Graphics.PrimitiveType.TriangleList, [{ x: 1 }, { x: 2 }, { x: 3 }], 0, 1),
    { name: "ArgumentException" },
  );
  assert.throws(
    () => device.DrawUserIndexedPrimitives(
      Graphics.PrimitiveType.TriangleList, vertices, 0, 3, [0, 1, 3], 0, 1,
    ),
    { name: "ArgumentException" },
  );

  const target = new Graphics.RenderTarget2D(device, 4, 4);
  device.SetRenderTarget(target);
  assert.equal(device.GetRenderTargets()[0].RenderTarget, target);
  assert.throws(() => target.Dispose(), { name: "InvalidOperationException" });
  assert.equal(target.IsDisposed, false);
  assert.throws(
    () => device.SetRenderTargets([
      new Graphics.RenderTargetBinding(target), new Graphics.RenderTargetBinding(target),
    ]),
    { name: "ArgumentException" },
  );
  device.SetRenderTarget(null);
  assert.equal(device.GetRenderTargets().length, 0);

  const targetCube = new Graphics.RenderTargetCube(
    device, 4, false, Graphics.SurfaceFormat.Color, Graphics.DepthFormat.Depth24,
    2, Graphics.RenderTargetUsage.PreserveContents,
  );
  assert.deepEqual(
    [targetCube.Size, targetCube.DepthStencilFormat, targetCube.MultiSampleCount,
      targetCube.RenderTargetUsage, targetCube.IsContentLost],
    [4, Graphics.DepthFormat.Depth24, 2, Graphics.RenderTargetUsage.PreserveContents, false],
  );
  device.SetRenderTarget(targetCube, Graphics.CubeMapFace.NegativeZ);
  assert.equal(device.GetRenderTargets()[0].RenderTarget, targetCube);
  assert.equal(device.GetRenderTargets()[0].CubeMapFace, Graphics.CubeMapFace.NegativeZ);
  assert.throws(() => targetCube.Dispose(), { name: "InvalidOperationException" });
  device.SetRenderTarget(null);
  targetCube.Dispose();
  targetCube.Dispose();

  const texture3D = new Graphics.Texture3D(device, 2, 2, 2, false, Graphics.SurfaceFormat.Color);
  const volumeColors = Array.from({ length: 8 }, (_value, index) => new Color(index, 0, 0, 255));
  texture3D.SetData(volumeColors);
  const volumeOutput = new Array(8);
  texture3D.GetData(volumeOutput);
  assert.deepEqual(
    volumeOutput.map((value) => value.PackedValue),
    volumeColors.map((value) => value.PackedValue),
  );
  const cube = new Graphics.TextureCube(device, 2, false, Graphics.SurfaceFormat.Color);
  const faceColors = [Color.Red, Color.Green, Color.Blue, Color.White];
  cube.SetData(Graphics.CubeMapFace.NegativeZ, faceColors);
  const faceOutput = new Array(4);
  cube.GetData(Graphics.CubeMapFace.NegativeZ, faceOutput);
  assert.deepEqual(
    faceOutput.map((value) => value.PackedValue),
    faceColors.map((value) => value.PackedValue),
  );

  const query = new Graphics.OcclusionQuery(device);
  assert.throws(() => query.End(), { name: "InvalidOperationException" });
  query.Begin();
  assert.throws(() => query.Begin(), { name: "InvalidOperationException" });
  query.End();
  assert.equal(query.IsComplete, true);
  assert.equal(query.PixelCount, 7);

  const spriteBatch = new Graphics.SpriteBatch(device);
  spriteBatch.Begin(
    Graphics.SpriteSortMode.Deferred, blend, new Graphics.SamplerState(), depth, rasterizer,
  );
  spriteBatch.End();
  assert.ok(calls.some((value) => Array.isArray(value) && value[0] === "spriteStates"));

  game.Dispose();
  assert.equal(vertexBuffer.IsDisposed, true);
  assert.equal(indexBuffer.IsDisposed, true);
  assert.equal(target.IsDisposed, true);
  assert.equal(texture3D.IsDisposed, true);
  assert.equal(cube.IsDisposed, true);
  assert.equal(query.IsDisposed, true);
  secondGame.Dispose();
});

test("device manager, device, and Texture2D preserve wrapper identity and deterministic ownership", (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  setBackendForInternalUse(fakeBackend(calls));

  const game = new Game();
  assert.throws(() => game.GraphicsDevice, { name: "InvalidOperationException" });
  const manager = new GraphicsDeviceManager(game);
  manager.PreferredBackBufferWidth = 1024;
  manager.PreferredBackBufferHeight = 576;
  manager.PreparingDeviceSettings.Add((_sender, args) => {
    args.GraphicsDeviceInformation.PresentationParameters.BackBufferWidth = 1280;
  });
  manager.CreateDevice();
  const device = manager.GraphicsDevice;

  assert.equal(game.GraphicsDevice, device);
  assert.equal(manager.GraphicsDevice, device);
  assert.equal(device.SamplerStates, device.SamplerStates);
  assert.equal(device.Textures, device.Textures);
  assert.throws(() => device.Adapter, NativeUnavailableError);
  assert.throws(() => device.DisplayMode, NativeUnavailableError);

  let created = 0;
  let destroyed = 0;
  device.ResourceCreated.Add((_sender, args) => {
    assert.ok(args.Resource instanceof Graphics.Texture2D);
    created += 1;
  });
  device.ResourceDestroyed.Add((_sender, args) => {
    assert.equal(args.Name, "sprite");
    assert.deepEqual(args.Tag, { id: 7 });
    destroyed += 1;
  });
  const texture = new Graphics.Texture2D(device, 8, 4, true, Graphics.SurfaceFormat.Color);
  texture.Name = "sprite";
  texture.Tag = { id: 7 };
  assert.equal(texture.GraphicsDevice, device);
  assert.deepEqual([texture.Width, texture.Height, texture.LevelCount], [8, 4, 4]);
  assert.ok(texture.Bounds.Equals(new Rectangle(0, 0, 8, 4)));

  device.Clear(Color.CornflowerBlue);
  device.Present();
  assert.throws(() => device.BlendState = new Graphics.BlendState(), NativeUnavailableError);
  texture.Dispose();
  texture.Dispose();
  assert.equal(texture.IsDisposed, true);
  assert.deepEqual([created, destroyed], [1, 1]);

  game.Dispose();
  game.Dispose();
  assert.equal(device.IsDisposed, true);
  assert.equal(calls.filter((value) => value.startsWith("texture:destroy:")).length, 1);
  assert.equal(calls.filter((value) => value.startsWith("manager:destroy:")).length, 1);
  assert.equal(calls.filter((value) => value.startsWith("game:destroy:")).length, 1);
});

test("parent shutdown invalidates a live Texture2D without relying on finalizers", (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  setBackendForInternalUse(fakeBackend(calls));
  const game = new Game();
  const manager = new GraphicsDeviceManager(game);
  manager.CreateDevice();
  const texture = new Graphics.Texture2D(manager.GraphicsDevice, 2, 2);
  game.Dispose();
  assert.equal(texture.IsDisposed, true);
  texture.Dispose();
  assert.equal(calls.filter((value) => value.startsWith("texture:destroy:")).length, 1);
});

test("Texture2D validates mip, rectangle, array window, disposal, and element representation", (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  setBackendForInternalUse(fakeBackend(calls));
  const game = new Game();
  const manager = new GraphicsDeviceManager(game);
  manager.CreateDevice();
  const texture = new Graphics.Texture2D(manager.GraphicsDevice, 4, 4);
  const pixels = Array.from({ length: 16 }, () => Color.White);

  assert.throws(
    () => texture.SetData(1, null, pixels, 0, 16),
    { name: "ArgumentOutOfRangeException" },
  );
  assert.throws(
    () => texture.SetData(0, new Rectangle(-1, 0, 1, 1), [Color.White], 0, 1),
    { name: "ArgumentException" },
  );
  assert.throws(
    () => texture.SetData(0, new Rectangle(3, 3, 2, 2), new Array(4).fill(Color.White), 0, 4),
    { name: "ArgumentException" },
  );
  assert.throws(
    () => texture.SetData(0, new Rectangle(0, 0, 0, 1), [], 0, 0),
    { name: "ArgumentException" },
  );
  assert.throws(() => texture.SetData(pixels, -1, 16), { name: "ArgumentOutOfRangeException" });
  assert.throws(() => texture.SetData(pixels, 0, -1), { name: "ArgumentOutOfRangeException" });
  assert.throws(() => texture.SetData([Color.White], 0, 16), { name: "ArgumentException" });
  assert.throws(
    () => texture.SetData(new Array(16).fill({ PackedValue: 0 })),
    { name: "NotSupportedException" },
  );
  assert.throws(
    () => texture.SetData(new Array(4).fill(new Vector4(1))),
    { name: "ArgumentException" },
  );
  assert.throws(
    () => texture.SetData(new Uint8Array(4 * 4 * 4)),
    { name: "ArgumentException" },
  );
  assert.throws(
    () => Graphics.Texture2D.FromStream(manager.GraphicsDevice, new Uint8Array()),
    { name: "ArgumentException" },
  );

  texture.Dispose();
  assert.throws(() => texture.GetData(new Array(16)), { name: "ObjectDisposedException" });
  game.Dispose();
});

test("SpriteBatch validates pairing and draws through one retained native batch", (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  setBackendForInternalUse(fakeBackend(calls));
  const game = new Game();
  const manager = new GraphicsDeviceManager(game);
  manager.CreateDevice();
  const device = manager.GraphicsDevice;
  const texture = new Graphics.Texture2D(device, 4, 4);
  const batch = new Graphics.SpriteBatch(device);
  const otherGame = new Game();
  const otherManager = new GraphicsDeviceManager(otherGame);
  otherManager.CreateDevice();
  const otherTexture = new Graphics.Texture2D(otherManager.GraphicsDevice, 4, 4);

  assert.throws(() => batch.End(), { name: "InvalidOperationException" });
  assert.throws(() => batch.Draw(texture, Vector2.Zero, Color.White), { name: "InvalidOperationException" });
  batch.Begin();
  assert.throws(() => batch.Begin(), { name: "InvalidOperationException" });
  assert.throws(() => batch.Draw(null, Vector2.Zero, Color.White), { name: "ArgumentNullException" });
  assert.throws(
    () => batch.Draw(otherTexture, Vector2.Zero, Color.White),
    { name: "InvalidOperationException" },
  );
  assert.throws(
    () => batch.Draw(texture, Vector2.Zero, null, Color.White, Number.NaN, Vector2.Zero, 1, 0, 0),
    { name: "ArgumentOutOfRangeException" },
  );
  assert.throws(
    () => batch.Draw(texture, Vector2.Zero, null, Color.White, 0, Vector2.Zero, Number.NaN, 0, 0),
    { name: "ArgumentException" },
  );
  assert.throws(
    () => batch.Draw(texture, Vector2.Zero, null, Color.White, 0, Vector2.Zero, 1, 0, Number.NaN),
    { name: "ArgumentOutOfRangeException" },
  );
  assert.throws(
    () => batch.Draw(texture, Vector2.Zero, new Rectangle(-1, 0, 1, 1), Color.White),
    { name: "ArgumentException" },
  );
  batch.Draw(texture, new Vector2(2, 3), Color.White);
  batch.Draw(texture, new Rectangle(4, 5, 8, 12), Color.Red);
  batch.End();
  assert.throws(() => batch.Draw(texture, Vector2.Zero, Color.White), { name: "InvalidOperationException" });
  assert.equal(calls.filter((value) => value.startsWith("sprite:submit:")).at(-1).endsWith(":2"), true);

  batch.Dispose();
  batch.Dispose();
  assert.throws(() => batch.Begin(), { name: "ObjectDisposedException" });
  assert.throws(() => batch.Draw(texture, Vector2.Zero, Color.White), { name: "ObjectDisposedException" });
  texture.Dispose();
  otherTexture.Dispose();
  otherGame.Dispose();
  game.Dispose();
  assert.equal(calls.filter((value) => value.startsWith("sprite:destroy:")).length, 1);
});

test("SpriteFont snapshots its atlas graph and SpriteBatch queues real glyph draws", async (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  setBackendForInternalUse(fakeBackend(calls));
  const game = new Game();
  const manager = new GraphicsDeviceManager(game);
  manager.CreateDevice();
  const texture = new Graphics.Texture2D(manager.GraphicsDevice, 16, 8);
  const { createSpriteFontForInternalUse } = await import(
    "../dist/Microsoft/Xna/Framework/Graphics/SpriteFont.js"
  );
  const glyph = new Rectangle(0, 0, 4, 7);
  const font = createSpriteFontForInternalUse({
    Texture: texture,
    GlyphBounds: [glyph, new Rectangle(4, 0, 4, 7)],
    Cropping: [new Rectangle(0, 1, 4, 7), new Rectangle(0, 1, 4, 7)],
    Characters: ["A", "?"],
    LineSpacing: 9,
    Spacing: 1,
    Kerning: [new Vector3(1, 4, 1), new Vector3(0, 4, 0)],
    DefaultCharacter: "?",
  });
  glyph.Width = 99;
  assert.deepEqual(font.Characters, ["A", "?"]);
  assert.deepEqual([font.MeasureString("AA").X, font.MeasureString("AA").Y], [13, 9]);
  assert.deepEqual([font.MeasureString("A\nZ").X, font.MeasureString("A\nZ").Y], [6, 18]);

  const batch = new Graphics.SpriteBatch(manager.GraphicsDevice);
  batch.Begin();
  batch.DrawString(font, "AZ", Vector2.Zero, Color.White);
  batch.End();
  assert.equal(calls.filter((value) => value.startsWith("sprite:submit:")).at(-1).endsWith(":2"), true);
  batch.Dispose();
  texture.Dispose();
  game.Dispose();
});

test("Effect reflection views preserve identity, value snapshots, parent ownership, and clone isolation", async (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  setBackendForInternalUse(fakeBackend(calls));
  const game = new Game();
  const manager = new GraphicsDeviceManager(game);
  manager.CreateDevice();
  const { createEffectForInternalUse } = await import(
    "../dist/Microsoft/Xna/Framework/Graphics/Effect.js"
  );
  const effect = createEffectForInternalUse(manager.GraphicsDevice, {
    Parameters: [{
      Name: "Offset",
      Semantic: "POSITION",
      ParameterClass: Graphics.EffectParameterClass.Vector,
      ParameterType: Graphics.EffectParameterType.Single,
      RowCount: 1,
      ColumnCount: 2,
      Value: new Vector2(1, 2),
      Annotations: [{
        Name: "UiName",
        ParameterClass: Graphics.EffectParameterClass.Object,
        ParameterType: Graphics.EffectParameterType.String,
        Value: "Offset",
      }],
    }],
    Techniques: [
      { Name: "Default", Passes: [{ Name: "P0" }] },
      { Name: "Alternate", Passes: [{ Name: "P1" }] },
    ],
  });
  assert.equal(effect.Parameters, effect.Parameters);
  assert.equal(effect.Techniques.Get(0), effect.Techniques.Get("Default"));
  assert.equal(effect.CurrentTechnique, effect.CurrentTechnique);
  assert.equal(effect.CurrentTechnique.Passes.Get(0), effect.CurrentTechnique.Passes.Get("P0"));
  assert.equal(effect.Parameters.Get("Offset"), effect.Parameters.GetParameterBySemantic("POSITION"));
  assert.equal(effect.Parameters.Get(0).Annotations.Get(0).GetValueString(), "Offset");

  const input = new Vector2(7, 8);
  effect.Parameters.Get(0).SetValue(input);
  input.X = 99;
  assert.deepEqual(effect.Parameters.Get(0).GetValueVector2(), new Vector2(7, 8));
  const clone = effect.Clone();
  clone.Parameters.Get(0).SetValue(new Vector2(3, 4));
  assert.deepEqual(effect.Parameters.Get(0).GetValueVector2(), new Vector2(7, 8));
  assert.deepEqual(clone.Parameters.Get(0).GetValueVector2(), new Vector2(3, 4));
  assert.throws(
    () => { effect.CurrentTechnique = clone.Techniques.Get(0); },
    { name: "InvalidOperationException" },
  );
  assert.throws(() => effect.CurrentTechnique.Passes.Get(0).Apply(), NativeUnavailableError);

  const liveChild = effect.Parameters.Get(0);
  effect.Dispose();
  effect.Dispose();
  assert.throws(() => liveChild.GetValueVector2(), { name: "ObjectDisposedException" });
  clone.Dispose();
  game.Dispose();
});

test("Model graph preserves parent, collection, part, effect, and transform identity", async (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  setBackendForInternalUse(fakeBackend(calls));
  const game = new Game();
  const manager = new GraphicsDeviceManager(game);
  manager.CreateDevice();
  const firstEffect = new Graphics.BasicEffect(manager.GraphicsDevice);
  const secondEffect = new Graphics.BasicEffect(manager.GraphicsDevice);
  const { createModelForInternalUse } = await import(
    "../dist/Microsoft/Xna/Framework/Graphics/Model.js"
  );
  const local = Matrix.CreateTranslation(new Vector3(2, 3, 4));
  const model = createModelForInternalUse(manager.GraphicsDevice, {
    Bones: [
      { Name: "Root", Transform: Matrix.Identity },
      { Name: "Child", Transform: local, ParentIndex: 0 },
    ],
    RootBoneIndex: 0,
    Meshes: [{
      Name: "Triangle",
      ParentBoneIndex: 1,
      BoundingSphere: new BoundingSphere(Vector3.Zero, 2),
      Parts: [{
        VertexBuffer: null,
        IndexBuffer: null,
        Effect: firstEffect,
        NumVertices: 3,
        PrimitiveCount: 1,
        StartIndex: 0,
        VertexOffset: 0,
      }],
    }],
  });

  assert.equal(model.Bones, model.Bones);
  assert.equal(model.Meshes, model.Meshes);
  assert.equal(model.Root, model.Bones.Get(0));
  assert.equal(model.Bones.Get("Child").Parent, model.Root);
  assert.equal(model.Root.Children.Get(0), model.Bones.Get(1));
  assert.equal(model.Meshes.Get("Triangle"), model.Meshes.Get(0));
  assert.equal(model.Meshes.Get(0).ParentBone, model.Bones.Get(1));
  assert.equal(model.Meshes.Get(0).MeshParts, model.Meshes.Get(0).MeshParts);
  const part = model.Meshes.Get(0).MeshParts.Get(0);
  assert.equal(part.Effect, firstEffect);
  assert.equal(model.Meshes.Get(0).Effects.Get(0), firstEffect);

  const copied = model.Bones.Get(1).Transform;
  copied.M41 = 99;
  assert.equal(model.Bones.Get(1).Transform.M41, 2);
  const absolute = new Array(2);
  model.CopyAbsoluteBoneTransformsTo(absolute);
  assert.deepEqual([absolute[1].M41, absolute[1].M42, absolute[1].M43], [2, 3, 4]);

  part.Effect = secondEffect;
  assert.equal(model.Meshes.Get(0).Effects.Count, 1);
  assert.equal(model.Meshes.Get(0).Effects.Get(0), secondEffect);
  const enumerator = model.Meshes.GetEnumerator();
  assert.equal(enumerator.MoveNext(), true);
  assert.equal(enumerator.Current, model.Meshes.Get(0));
  assert.equal(enumerator.MoveNext(), false);
  enumerator.Dispose();
  assert.throws(
    () => model.Draw(Matrix.Identity, Matrix.Identity, Matrix.Identity),
    { name: "InvalidOperationException", message: /without vertex or index data/ },
  );
  assert.deepEqual(secondEffect.World.Translation, new Vector3(2, 3, 4));

  firstEffect.Dispose();
  secondEffect.Dispose();
  game.Dispose();
});

test("Model XNB resolves its reader table and shared buffer/effect resources", async (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  setBackendForInternalUse(fakeBackend(calls));
  const game = new Game();
  const manager = new GraphicsDeviceManager(game);
  manager.CreateDevice();
  class SyntheticContent extends Content.ContentManager {
    OpenStream(name) {
      if (name === "Triangle") return modelXnbForManagedTest();
      if (name === "CompressedTriangle") return compressManagedXnb(modelXnbForManagedTest());
      throw new Content.ContentLoadException(`missing ${name}`);
    }
  }
  const content = new SyntheticContent({
    GetService: (type) => type === Graphics.GraphicsDevice ? manager.GraphicsDevice : null,
  });
  const model = content.Load(Graphics.Model, "Triangle");
  const mesh = model.Meshes.Get("Triangle");
  const part = mesh.MeshParts.Get(0);
  assert.equal(mesh.ParentBone, model.Root);
  assert.equal(part.VertexBuffer.GraphicsDevice, manager.GraphicsDevice);
  assert.equal(part.IndexBuffer.GraphicsDevice, manager.GraphicsDevice);
  assert.equal(mesh.Effects.Get(0), part.Effect);
  assert.deepEqual(part.Effect.DiffuseColor, Vector3.One);
  assert.equal(content.Load(Graphics.Model, "triangle"), model);
  const compressedModel = content.Load(Graphics.Model, "CompressedTriangle");
  assert.equal(compressedModel.Meshes.Get("Triangle").ParentBone, compressedModel.Root);
  content.Dispose();
  assert.equal(part.VertexBuffer.IsDisposed, true);
  assert.equal(part.IndexBuffer.IsDisposed, true);
  assert.equal(part.Effect.IsDisposed, true);
  assert.equal(calls.filter((value) => value.startsWith("vertex:destroy:")).length, 2);
  assert.equal(calls.filter((value) => value.startsWith("index:destroy:")).length, 2);
  game.Dispose();
});

test("vertex declarations snapshot elements and expose exact XNA layouts", () => {
  const elements = [new Graphics.VertexElement(
    0, Graphics.VertexElementFormat.Vector3, Graphics.VertexElementUsage.Position, 0,
  )];
  const declaration = new Graphics.VertexDeclaration(elements);
  elements[0].Offset = 99;
  assert.equal(declaration.VertexStride, 12);
  assert.equal(declaration.GetVertexElements()[0].Offset, 0);
  assert.equal(Graphics.VertexPositionColor.VertexDeclaration.VertexStride, 16);
  assert.equal(Graphics.VertexPositionColorTexture.VertexDeclaration.VertexStride, 24);
  assert.equal(Graphics.VertexPositionNormalTexture.VertexDeclaration.VertexStride, 32);
});

function seven(value) {
  const result = [];
  value >>>= 0;
  do {
    let item = value & 0x7f;
    value >>>= 7;
    if (value !== 0) item |= 0x80;
    result.push(item);
  } while (value !== 0);
  return result;
}

function integer(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return [...bytes];
}

function single(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value, true);
  return [...bytes];
}

function text(value) {
  const bytes = [...new TextEncoder().encode(value)];
  return [...seven(bytes.length), ...bytes];
}

function modelXnbForManagedTest() {
  const names = [
    "Microsoft.Xna.Framework.Content.ModelReader",
    "Microsoft.Xna.Framework.Content.StringReader",
    "Microsoft.Xna.Framework.Content.VertexBufferReader",
    "Microsoft.Xna.Framework.Content.IndexBufferReader",
    "Microsoft.Xna.Framework.Content.BasicEffectReader",
  ];
  const identity = [
    ...single(1), ...single(0), ...single(0), ...single(0),
    ...single(0), ...single(1), ...single(0), ...single(0),
    ...single(0), ...single(0), ...single(1), ...single(0),
    ...single(0), ...single(0), ...single(0), ...single(1),
  ];
  const vertices = [
    ...single(0), ...single(0), ...single(0),
    ...single(1), ...single(0), ...single(0),
    ...single(0), ...single(1), ...single(0),
  ];
  const payload = [
    ...seven(names.length),
    ...names.flatMap((name) => [...text(`${name}, Microsoft.Xna.Framework`), ...integer(0)]),
    ...seven(3), ...seven(1),
    ...integer(1), ...seven(2), ...text("Root"), ...identity,
    0, ...integer(0),
    ...integer(1), ...seven(2), ...text("Triangle"), 1,
    ...single(0), ...single(0), ...single(0), ...single(2), ...seven(0),
    ...integer(1), ...integer(0), ...integer(3), ...integer(0), ...integer(1),
    ...seven(0), ...seven(1), ...seven(2), ...seven(3), 1, ...seven(0),
    ...seven(3), ...integer(12), ...integer(1),
    ...integer(0), ...integer(Graphics.VertexElementFormat.Vector3),
    ...integer(Graphics.VertexElementUsage.Position), ...integer(0),
    ...integer(3), ...vertices,
    ...seven(4), 1, ...integer(6), 0, 0, 1, 0, 2, 0,
    ...seven(5), ...seven(0),
    ...single(1), ...single(1), ...single(1),
    ...single(0), ...single(0), ...single(0),
    ...single(1), ...single(1), ...single(1),
    ...single(16), ...single(1), 0,
  ];
  return Uint8Array.from([
    0x58, 0x4e, 0x42, 0x77, 5, 0,
    ...integer(10 + payload.length), ...payload,
  ]);
}

function compressManagedXnb(uncompressed) {
  const payload = uncompressed.slice(10);
  const headerBits = (3 << 28) | (payload.length << 4);
  const block = new Uint8Array(16 + payload.length);
  block.set([
    headerBits >>> 16, headerBits >>> 24, headerBits, headerBits >>> 8,
    1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
  ]);
  block.set(payload, 16);
  const frame = new Uint8Array(5 + block.length);
  frame.set([0xff, payload.length >>> 8, payload.length, block.length >>> 8, block.length]);
  frame.set(block, 5);
  const result = new Uint8Array(14 + frame.length);
  result.set([0x58, 0x4e, 0x42, 0x77, 5, 0x80]);
  result.set(integer(result.length), 6);
  result.set(integer(payload.length), 10);
  result.set(frame, 14);
  return result;
}
