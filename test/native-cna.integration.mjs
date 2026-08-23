import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
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
  Storage,
  Vector2,
  Vector3,
} from "../dist/index.js";
import { getBackend } from "../dist/internal/backend.js";
import {
  getVertexBufferRawForInternalUse,
  setVertexBufferRawForInternalUse,
} from "../dist/Microsoft/Xna/Framework/Graphics/VertexBuffer.js";
import {
  getIndexBufferRawForInternalUse,
  setIndexBufferRawForInternalUse,
} from "../dist/Microsoft/Xna/Framework/Graphics/IndexBuffer.js";

const library = process.env.CNA_NATIVE_LIBRARY;
if (!library) throw new Error("CNA_NATIVE_LIBRARY must name an existing CNA ABI 0.7.0 shared library");
const nativeStorageHome = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-native-storage-"));
process.env.XDG_DATA_HOME = nativeStorageHome;
after(() => fs.rmSync(nativeStorageHome, { recursive: true, force: true }));
const bridge = path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node");
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
  }

  LoadContent() {
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
    const fontBytes = spriteFontXnb();
    const modelBytes = modelXnb();
    class FontContentManager extends Content.ContentManager {
      OpenStream(assetName) {
        if (assetName === "SyntheticFont") return fontBytes;
        if (assetName === "SyntheticModel") return modelBytes;
        throw new Error(`Unknown synthetic asset ${assetName}`);
      }
    }
    this.fontContent = new FontContentManager({
      GetService: (type) => type === Graphics.GraphicsDevice ? this.GraphicsDevice : null,
    });
    this.font = this.fontContent.Load(Graphics.SpriteFont, "SyntheticFont");
    assert.deepEqual(
      [this.font.MeasureString("A?").X, this.font.MeasureString("A?").Y],
      [9, 8],
    );
    this.model = this.fontContent.Load(Graphics.Model, "SyntheticModel");
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
    this.loadedModelVertexBuffer = loadedPart.VertexBuffer;
    this.loadedModelIndexBuffer = loadedPart.IndexBuffer;
    this.loadedModelEffect = loadedPart.Effect;
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
    this.spriteBatch.Begin();
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
    this.fontContent?.Dispose();
    this.fontContent = null;
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
  assert.equal(status.AbiVersion, "0.7.0");
  assert.equal(status.ImportedSymbolCount, 219);
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
    assert.throws(
      () => this.instance.Apply3D(
        [new Audio.AudioListener(), new Audio.AudioListener()], new Audio.AudioEmitter(),
      ),
      (error) => error.cnaResult === 6,
    );
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
    game.Dispose();
    game.Dispose();
  });
}

test("parent shutdown deterministically releases a live Texture2D", async () => {
  const game = new NativeProbeGame(2, true);
  await game.Run();
  game.Dispose();
  assert.equal(game.texture.IsDisposed, true);
  game.texture.Dispose();
  game.texture.Dispose();
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

function rectangle(x, y, width, height) {
  return [...integer(x), ...integer(y), ...integer(width), ...integer(height)];
}

function spriteFontXnb() {
  const names = [
    "Microsoft.Xna.Framework.Content.SpriteFontReader",
    "Microsoft.Xna.Framework.Content.Texture2DReader",
    "Microsoft.Xna.Framework.Content.ListReader`1[[Microsoft.Xna.Framework.Rectangle]]",
    "Microsoft.Xna.Framework.Content.RectangleReader",
    "Microsoft.Xna.Framework.Content.ListReader`1[[System.Char]]",
    "Microsoft.Xna.Framework.Content.CharReader",
    "Microsoft.Xna.Framework.Content.ListReader`1[[Microsoft.Xna.Framework.Vector3]]",
    "Microsoft.Xna.Framework.Content.Vector3Reader",
  ];
  const atlas = Array.from({ length: 8 * 8 * 4 }, (_value, index) =>
    index % 4 === 3 ? 255 : 255);
  const payload = [
    ...seven(names.length),
    ...names.flatMap((name) => [...text(`${name}, Microsoft.Xna.Framework`), ...integer(0)]),
    ...seven(0),
    ...seven(1),
    ...seven(2), ...integer(Graphics.SurfaceFormat.Color), ...integer(8), ...integer(8), ...integer(1),
    ...integer(atlas.length), ...atlas,
    ...seven(3), ...integer(2), ...rectangle(0, 0, 4, 8), ...rectangle(4, 0, 4, 8),
    ...seven(3), ...integer(2), ...rectangle(0, 0, 4, 8), ...rectangle(0, 0, 4, 8),
    ...seven(5), ...integer(2), 65, 0, 63, 0,
    ...integer(8), ...single(1),
    ...seven(7), ...integer(2),
    ...single(0), ...single(4), ...single(0),
    ...single(0), ...single(4), ...single(0),
    1, 63, 0,
  ];
  const length = 10 + payload.length;
  return Uint8Array.from([0x58, 0x4e, 0x42, 0x77, 5, 0, ...integer(length), ...payload]);
}

function modelVertexBytes() {
  return [
    ...single(0), ...single(0), ...single(0),
    ...single(1), ...single(0), ...single(0),
    ...single(0), ...single(1), ...single(0),
  ];
}

function modelXnb() {
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
  const payload = [
    ...seven(names.length),
    ...names.flatMap((name) => [...text(`${name}, Microsoft.Xna.Framework`), ...integer(0)]),
    ...seven(3),
    ...seven(1),
    ...integer(1),
    ...seven(2), ...text("Root"), ...identity,
    0, ...integer(0),
    ...integer(1),
    ...seven(2), ...text("Triangle"), 1,
    ...single(0), ...single(0), ...single(0), ...single(2),
    ...seven(0),
    ...integer(1),
    ...integer(0), ...integer(3), ...integer(0), ...integer(1),
    ...seven(0), ...seven(1), ...seven(2), ...seven(3),
    1, ...seven(0),
    ...seven(3),
    ...integer(12), ...integer(1),
    ...integer(0), ...integer(Graphics.VertexElementFormat.Vector3),
    ...integer(Graphics.VertexElementUsage.Position), ...integer(0),
    ...integer(3), ...modelVertexBytes(),
    ...seven(4), 1, ...integer(6), 0, 0, 1, 0, 2, 0,
    ...seven(5), ...seven(0),
    ...single(1), ...single(1), ...single(1),
    ...single(0), ...single(0), ...single(0),
    ...single(1), ...single(1), ...single(1),
    ...single(16), ...single(1), 0,
  ];
  const length = 10 + payload.length;
  return Uint8Array.from([0x58, 0x4e, 0x42, 0x77, 5, 0, ...integer(length), ...payload]);
}
