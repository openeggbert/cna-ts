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
    NativeUnavailableError,
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
