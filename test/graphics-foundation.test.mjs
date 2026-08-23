import assert from "node:assert/strict";
import test from "node:test";

import {
  Color,
  Game,
  Graphics,
  GraphicsDeviceManager,
  NativeUnavailableError,
  Rectangle,
} from "../dist/index.js";
import { getBackend, setBackendForInternalUse } from "../dist/internal/backend.js";

function fakeBackend(calls) {
  let next = 100n;
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
    createSpriteBatch() { throw new Error("not used"); },
    destroySpriteBatch() { throw new Error("not used"); },
  };
}

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
