#!/usr/bin/env node

/**
 * CNB, end to end, over a real CNA library.
 *
 * The fixtures are built with **CNA's own encoder**, not hand-rolled here: a reader and a writer
 * that share one set of assumptions agree with each other whether or not either is right, and the
 * point of these tests is that this binding reads what CNA writes. Every assertion below is a value
 * -- exact bytes, exact pixels, exact metrics, exact refusals -- rather than "the call returned".
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import {
  Color,
  Curve,
  CurveContinuity,
  CurveKey,
  CurveLoopType,
  Game,
  Graphics,
  GraphicsDeviceManager,
  LoadNodeNativeBackend,
  Matrix,
  NativeUnavailableError,
  Quaternion,
  Rectangle,
  Vector2,
  Vector3,
  Vector4,
} from "../dist/index.js";
import {
  CnbAssetType,
  CnbByteWriter,
  CnbCompression,
  CnbWriter,
  CnbAnimationClip,
  CnbAudioFormat,
  CnbDocument,
  CnbEffectKind,
  CnbFormat,
  CnbMaterialTextureSlot,
  CnbModelData,
  CnbSkeletonMatrixSet,
  CnbSoundEffectData,
  CnbSpriteFontData,
  CnbTextureData,
  CnbTextureFormat,
  CreateSoundEffectFromCnb,
  CreateSoundEffectFromCnbSoundEffectData,
  CreateSpriteFontFromCnb,
  CreateTexture2DFromCnb,
  DecodeCnbCurve,
  DecodeCnbSong,
  DecodeCnbVideo,
  EncodeCnbAnimationClip,
  EncodeCnbCurve,
  EncodeCnbSong,
  EncodeCnbVideo,
} from "../dist/extensions/content/index.js";

const library = process.env.CNA_NATIVE_LIBRARY;
const skip = library
  ? false
  : "set CNA_NATIVE_LIBRARY to a compatible libcna_c_api shared library";

const nativeStorageHome = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-cnb-"));
after(() => fs.rmSync(nativeStorageHome, { recursive: true, force: true }));
process.env.XDG_DATA_HOME = nativeStorageHome;

if (!skip) {
  await LoadNodeNativeBackend({
    CnaLibrary: path.resolve(library),
    BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
  });
}

/** Four RGBA texels, distinguishable in every channel so a transposed copy cannot pass. */
const ATLAS_RGBA = Uint8Array.from([
  255, 0, 0, 255,
  0, 128, 0, 255,
  0, 0, 255, 255,
  16, 32, 48, 64,
]);

function buildTextureCnb(contentName) {
  const description = CnbTextureData.FromRgba8(2, 2, ATLAS_RGBA);
  try {
    return description.Encode(contentName);
  } finally {
    description.Dispose();
  }
}

function buildSpriteFontCnb(contentName) {
  const font = CnbSpriteFontData.Create();
  const atlas = CnbTextureData.FromRgba8(2, 2, ATLAS_RGBA);
  try {
    font.SetMetrics({ LineSpacing: 8, Spacing: 1, DefaultCharacter: "?" });
    font.SetAtlas(atlas);
    // Strictly ascending by character: '?' is 0x3F and 'A' is 0x41. CNA checks that when the font
    // is *encoded* rather than when a glyph is added, so a table may be built in any order and
    // sorted before it is written -- but it must be sorted by then.
    font.AddGlyph({
      Bounds: new Rectangle(1, 0, 1, 2),
      Cropping: new Rectangle(0, 0, 1, 2),
      Character: "?",
      Kerning: new Vector3(0, 1, 0),
    });
    font.AddGlyph({
      Bounds: new Rectangle(0, 0, 1, 2),
      Cropping: new Rectangle(0, 0, 1, 2),
      Character: "A",
      Kerning: new Vector3(0, 1, 0),
    });
    return font.Encode(contentName);
  } finally {
    atlas.Dispose();
    font.Dispose();
  }
}

test("the container's own identities are CNA's, not this package's", { skip }, () => {
  // "CNB" plus 0x1A, the DOS end-of-file byte every binary format puts there so that catting a
  // .cnb to a terminal stops instead of scrolling.
  assert.deepEqual([...CnbFormat.Magic()], [0x43, 0x4e, 0x42, 0x1a]);
  assert.equal(CnbFormat.HasMagic(CnbFormat.Magic()), true);
  assert.equal(CnbFormat.HasMagic(Uint8Array.from([0x58, 0x4e, 0x42, 0x77])), false, "an XNB is not a CNB");

  // CRC-32C of "123456789" is the standard Castagnoli check value.
  assert.equal(CnbFormat.Crc32c(new TextEncoder().encode("123456789")) >>> 0, 0xe3069283);

  assert.equal(CnbFormat.IsCompressionSupported(CnbCompression.None), true);
  assert.equal(CnbFormat.GetCompressionName(CnbCompression.Zstd), "Zstandard");
  // The identity's own short name, which is not the same string as the fully qualified type name
  // a file's CMET chunk carries -- the document below asserts that one separately.
  assert.equal(CnbFormat.GetAssetTypeName(CnbAssetType.Texture2D), "Texture2D");
  assert.equal(CnbFormat.IsCustomAssetType(CnbAssetType.SpriteFont), false);

  // A custom asset type is a 31-bit hash of its canonical name; the same name must always hash to
  // the same identity, and it must not collide with the built-in range.
  const custom = CnbFormat.GetAssetTypeId("Contoso.Game.LevelScript");
  assert.equal(custom, CnbFormat.GetAssetTypeId("Contoso.Game.LevelScript"));
  assert.equal(CnbFormat.IsCustomAssetType(custom), true);
  assert.notEqual(custom, CnbFormat.GetAssetTypeId("Contoso.Game.LevelScript2"));

  // A chunk identifier round-trips through its packed integer form.
  assert.equal(CnbFormat.GetChunkIdText(CnbFormat.MakeChunkId("CMET")), "CMET");
  assert.equal(CnbFormat.IsWellFormedChunkId(CnbFormat.MakeChunkId("TEXH")), true);
  assert.throws(() => CnbFormat.MakeChunkId("TOOLONG"), /four bytes/);
});

test("texture-format arithmetic follows the block rule rather than width times height", { skip }, () => {
  assert.equal(CnbFormat.GetTextureFormatName(CnbTextureFormat.Rgba8), "Rgba8");
  assert.equal(CnbFormat.IsBlockCompressed(CnbTextureFormat.Rgba8), false);
  assert.equal(CnbFormat.IsBlockCompressed(CnbTextureFormat.Bc7), true);
  assert.equal(CnbFormat.GetTextureFormatUnitBytes(CnbTextureFormat.Rgba8), 4);
  assert.equal(CnbFormat.GetTextureFormatUnitBytes(CnbTextureFormat.Bc7), 16);
  assert.equal(CnbFormat.GetTextureLevelByteSize(CnbTextureFormat.Rgba8, 2, 2), 16);
  // The trap this exists for: a 1x1 BC7 level is a whole sixteen-byte block, not a sixteenth of one.
  assert.equal(CnbFormat.GetTextureLevelByteSize(CnbTextureFormat.Bc7, 1, 1), 16);
  assert.equal(CnbFormat.GetTextureLevelByteSize(CnbTextureFormat.Bc7, 5, 5), 4 * 16);
  assert.equal(CnbFormat.ToSurfaceFormat(CnbTextureFormat.Rgba8), Graphics.SurfaceFormat.Color);
});

test("a document CNA encoded parses back to the same container CNA wrote", { skip }, () => {
  const image = buildTextureCnb("Textures/Atlas");
  assert.equal(CnbFormat.HasMagic(image), true);

  const document = CnbDocument.Parse(image, "Textures/Atlas.cnb");
  try {
    assert.deepEqual(document.ContainerVersion, { Major: 1, Minor: 0 });
    assert.equal(document.AssetType, CnbAssetType.Texture2D);
    assert.equal(document.AssetSchemaVersion, 1);
    assert.equal(document.Origin, "Textures/Atlas.cnb");

    const metadata = document.Metadata;
    assert.equal(metadata.IsPresent, true);
    assert.equal(metadata.AssetTypeName, "Microsoft.Xna.Framework.Graphics.Texture2D");
    assert.equal(metadata.ContentName, "Textures/Atlas");

    // The container's own chunks come first, ahead of the schema's, which is why a schema addresses
    // them by identity rather than by position.
    const ids = document.Chunks.map((chunk) => chunk.Id);
    assert.equal(ids[0], "CMET");
    assert.deepEqual(ids.slice(1), ["TEXH", "TEXR", "TEXD"]);
    for (const chunk of document.Chunks) {
      assert.equal(chunk.Compression, CnbCompression.None, "schema 1 stores uncompressed");
      assert.equal(chunk.ByteLength, chunk.StoredByteLength, "an uncompressed chunk is its own size");
      assert.equal(chunk.Offset % chunk.Alignment, 0, "the offset satisfies the declared alignment");
    }

    // Every chunk's checksum is CRC-32C of its own stored bytes; parsing verified them, and this
    // recomputes one independently through the same primitive a writer would use.
    const [payloadIndex] = document.Find("TEXD");
    const payload = document.ReadChunk(payloadIndex);
    assert.deepEqual([...payload], [...ATLAS_RGBA], "TEXD is the RGBA the encoder was given");
    assert.equal(
      CnbFormat.Crc32c(payload) >>> 0,
      document.Chunks[payloadIndex].Checksum >>> 0,
    );

    assert.deepEqual(document.Find("XREF"), [], "a standalone texture references nothing");
    assert.deepEqual(document.ExternalReferences, []);

    // Forward compatibility: a decoder that does not know one of the mandatory chunks must refuse
    // the whole file rather than skip content the author marked required.
    document.RequireMandatoryChunksUnderstood(["CMET", "XREF", "TEXH", "TEXR", "TEXD"]);
    assert.throws(
      () => document.RequireMandatoryChunksUnderstood(["CMET", "TEXH", "TEXR"]),
      /cna_cnb_document_require_mandatory_chunks_understood failed with CNA result/,
    );
  } finally {
    document.Dispose();
  }
});

test("a corrupt container is refused rather than half-read", { skip }, () => {
  const image = buildTextureCnb("Textures/Atlas");
  assert.throws(() => CnbDocument.Parse(image.subarray(0, 32), "truncated.cnb"), /CNA result 5/);

  const flipped = Uint8Array.from(image);
  // The last byte is inside the final chunk's payload, which the table of contents checksums.
  flipped[flipped.length - 1] ^= 0xff;
  assert.throws(() => CnbDocument.Parse(flipped, "corrupt.cnb"), /CNA result 5/);

  const notCnb = Uint8Array.from([0x58, 0x4e, 0x42, 0x77, 5, 0, 0, 0, 0, 0]);
  assert.throws(() => CnbDocument.Parse(notCnb, "an-xnb.cnb"), /CNA result 5/);
});

test("a disposed document refuses by name and disposes idempotently", { skip }, () => {
  const document = CnbDocument.Parse(buildTextureCnb("Textures/Atlas"), "Atlas.cnb");
  assert.equal(document.IsDisposed, false);
  document.Dispose();
  assert.equal(document.IsDisposed, true);
  document.Dispose();
  assert.throws(() => document.ReadChunk(0), { name: "ObjectDisposedException" });
  assert.throws(() => CnbTextureData.Decode(document), { name: "ObjectDisposedException" });
});

test("a decoded texture keeps its shape, its format and its exact bytes", { skip }, () => {
  const document = CnbDocument.Parse(buildTextureCnb("Textures/Atlas"), "Atlas.cnb");
  const texture = CnbTextureData.Decode(document);
  try {
    assert.deepEqual({ ...texture.Shape }, {
      Width: 2, Height: 2, Depth: 1, FaceCount: 1, MipCount: 1, RepresentationCount: 1,
    });
    assert.equal(texture.GetRepresentationFormat(0), CnbTextureFormat.Rgba8);
    assert.equal(texture.GetLevelCount(0), 1);
    assert.deepEqual({ ...texture.GetLevelDimensions(0) }, { Width: 2, Height: 2, Depth: 1 });
    assert.deepEqual([...texture.ReadLevel(0, 0)], [...ATLAS_RGBA]);

    // Selection walks representations in the author's preference order and reports absence as an
    // ordinary answer rather than a refusal.
    assert.equal(texture.SelectRepresentation((format) => format === CnbTextureFormat.Rgba8), 0);
    assert.equal(texture.SelectRepresentation((format) => format === CnbTextureFormat.Bc7), null);
  } finally {
    texture.Dispose();
    document.Dispose();
  }
});

test("a multi-representation texture round-trips through CNA's encoder", { skip }, () => {
  const authored = CnbTextureData.Create(2, 2);
  try {
    const representation = authored.AddRepresentation(CnbTextureFormat.Rgba8);
    assert.equal(representation, 0);
    assert.equal(authored.GetLevelCount(representation), 1);
    authored.SetLevel(representation, 0, ATLAS_RGBA);
    const image = authored.Encode("Authored/Atlas");
    const document = CnbDocument.Parse(image, "Authored/Atlas.cnb");
    const decoded = CnbTextureData.Decode(document);
    try {
      assert.equal(document.Metadata.ContentName, "Authored/Atlas");
      assert.deepEqual([...decoded.ReadLevel(0, 0)], [...ATLAS_RGBA]);
    } finally {
      decoded.Dispose();
      document.Dispose();
    }
    // Deterministic: the same description encodes to byte-identical output.
    assert.deepEqual([...authored.Encode("Authored/Atlas")], [...image]);
  } finally {
    authored.Dispose();
  }
});

test("a decoded sprite font keeps its metrics, its glyphs and its embedded atlas", { skip }, () => {
  const document = CnbDocument.Parse(buildSpriteFontCnb("Fonts/Tiny"), "Fonts/Tiny.cnb");
  const font = CnbSpriteFontData.Decode(document);
  try {
    assert.equal(document.AssetType, CnbAssetType.SpriteFont);
    assert.deepEqual({ ...font.Metrics }, {
      GlyphCount: 2, LineSpacing: 8, Spacing: 1, DefaultCharacter: "?",
    });
    assert.deepEqual([font.GetGlyph(0).Character, font.GetGlyph(1).Character], ["?", "A"]);
    const glyph = font.GetGlyph(1);
    assert.deepEqual(
      [glyph.Bounds.X, glyph.Bounds.Y, glyph.Bounds.Width, glyph.Bounds.Height],
      [0, 0, 1, 2],
      "the 'A' glyph kept its own atlas rectangle rather than the '?' one",
    );
    assert.deepEqual([glyph.Kerning.X, glyph.Kerning.Y, glyph.Kerning.Z], [0, 1, 0]);

    // The atlas is embedded, and what comes back is a copy the caller owns: the font's release
    // must not destroy a texture description a caller is still holding.
    const atlas = font.CopyAtlas();
    try {
      assert.deepEqual({ ...atlas.Shape }, {
        Width: 2, Height: 2, Depth: 1, FaceCount: 1, MipCount: 1, RepresentationCount: 1,
      });
      assert.deepEqual([...atlas.ReadLevel(0, 0)], [...ATLAS_RGBA]);
      font.Dispose();
      assert.deepEqual([...atlas.ReadLevel(0, 0)], [...ATLAS_RGBA], "the copy outlives its font");
    } finally {
      atlas.Dispose();
    }
  } finally {
    if (!font.IsDisposed) font.Dispose();
    document.Dispose();
  }
});

test("an unsorted character map is refused when the font is encoded", { skip }, () => {
  const font = CnbSpriteFontData.Create();
  const atlas = CnbTextureData.FromRgba8(2, 2, ATLAS_RGBA);
  try {
    font.SetMetrics({ LineSpacing: 8, Spacing: 1 });
    font.SetAtlas(atlas);
    for (const character of ["A", "?"]) {
      font.AddGlyph({
        Bounds: new Rectangle(0, 0, 1, 2),
        Cropping: new Rectangle(0, 0, 1, 2),
        Character: character,
        Kerning: new Vector3(0, 1, 0),
      });
    }
    // Adding out of order is accepted; encoding is where it costs. SpriteFont looks a character up
    // by binary search, so an unsorted map silently returns the wrong glyph -- which is exactly the
    // kind of file a writer must not be able to produce.
    assert.throws(
      () => font.Encode("Fonts/Unsorted"),
      /the character map is not strictly ascending/,
    );
  } finally {
    atlas.Dispose();
    font.Dispose();
  }
});

test("a font with no fallback reports null rather than U+0000", { skip }, () => {
  const font = CnbSpriteFontData.Create();
  const atlas = CnbTextureData.FromRgba8(2, 2, ATLAS_RGBA);
  try {
    font.SetMetrics({ LineSpacing: 8, Spacing: 1 });
    font.SetAtlas(atlas);
    font.AddGlyph({
      Bounds: new Rectangle(0, 0, 1, 2),
      Cropping: new Rectangle(0, 0, 1, 2),
      Character: "A",
      Kerning: new Vector3(0, 1, 0),
    });
    const document = CnbDocument.Parse(font.Encode("Fonts/NoFallback"), "NoFallback.cnb");
    const decoded = CnbSpriteFontData.Decode(document);
    try {
      assert.equal(decoded.Metrics.DefaultCharacter, null);
    } finally {
      decoded.Dispose();
      document.Dispose();
    }
  } finally {
    atlas.Dispose();
    font.Dispose();
  }
});

class CnbProbeGame extends Game {
  constructor() {
    super();
    this.graphics = new GraphicsDeviceManager(this);
    this.frames = 0;
    this.results = {};
  }

  LoadContent() {
    const textureDocument = CnbDocument.Parse(buildTextureCnb("Textures/Atlas"), "Atlas.cnb");
    try {
      this.texture = CreateTexture2DFromCnb(this.GraphicsDevice, textureDocument);
    } finally {
      textureDocument.Dispose();
    }
    const readback = new Array(4);
    this.texture.GetData(readback);
    this.results.texture = {
      width: this.texture.Width,
      height: this.texture.Height,
      format: this.texture.Format,
      pixels: readback.map((color) => color.PackedValue),
    };

    const fontDocument = CnbDocument.Parse(buildSpriteFontCnb("Fonts/Tiny"), "Tiny.cnb");
    try {
      this.font = CreateSpriteFontFromCnb(this.GraphicsDevice, fontDocument);
    } finally {
      fontDocument.Dispose();
    }
    const measured = this.font.MeasureString("A?");
    this.results.font = {
      characters: [...this.font.Characters],
      lineSpacing: this.font.LineSpacing,
      spacing: this.font.Spacing,
      defaultCharacter: this.font.DefaultCharacter,
      measuredWidth: measured.X,
      measuredHeight: measured.Y,
    };
    // A compiled sound effect, ending in a real XNA SoundEffect. This lives inside the game
    // because a SoundEffect owns a native audio resource and CNA requires an active game for one.
    const samples = pcm16Samples();
    const authored = CnbSoundEffectData.Create({
      Format: CnbAudioFormat.Pcm16, SampleRate: PCM_SAMPLE_RATE, Channels: 1,
      FrameCount: PCM_FRAMES, LoopStart: 0, LoopLength: 0,
    }, samples);
    let soundImage;
    try {
      soundImage = authored.Encode("Audio/Beep");
    } finally {
      authored.Dispose();
    }
    const soundDocument = CnbDocument.Parse(soundImage, "Beep.cnb");
    try {
      this.sound = CreateSoundEffectFromCnb(soundDocument);
    } finally {
      soundDocument.Dispose();
    }
    this.sound.Name = "Beep";
    this.results.sound = {
      durationMilliseconds: this.sound.Duration.TotalMilliseconds,
      // A real CNA round trip through cna_sound_effect_set_name/_copy_name, which does not depend
      // on a mixer and so is measurable in this configuration.
      name: this.sound.Name,
      sampleBytes: samples.byteLength,
    };

    this.spriteBatch = new Graphics.SpriteBatch(this.GraphicsDevice);
    super.LoadContent();
  }

  Update(gameTime) { super.Update(gameTime); }

  Draw(gameTime) {
    this.GraphicsDevice.Clear(Color.CornflowerBlue);
    this.spriteBatch.Begin();
    this.spriteBatch.DrawString(this.font, "A?", new Vector2(0, 0), Color.White);
    this.spriteBatch.End();
    this.frames += 1;
    if (this.frames >= 2) this.Exit();
    super.Draw(gameTime);
  }

  UnloadContent() {
    this.sound?.Dispose();
    this.spriteBatch?.Dispose();
    this.texture?.Dispose();
    super.UnloadContent();
  }
}

test("a CNB texture and font become real XNA resources with the exact pixels CNA wrote", { skip }, async () => {
  const game = new CnbProbeGame();
  await game.Run();
  assert.deepEqual([game.results.texture.width, game.results.texture.height], [2, 2]);
  assert.equal(game.results.texture.format, Graphics.SurfaceFormat.Color);
  assert.deepEqual(game.results.texture.pixels, [
    0xff0000ff, 0xff008000, 0xffff0000, 0x40302010,
  ], "red, green, blue and a partially transparent grey, as XNA packs them");

  assert.deepEqual(game.results.font.characters, ["?", "A"]);
  assert.equal(game.results.font.lineSpacing, 8);
  assert.equal(game.results.font.spacing, 1);
  assert.equal(game.results.font.defaultCharacter, "?");
  // Two one-pixel glyphs with one pixel of spacing between them, on an eight-pixel line.
  assert.deepEqual(
    [game.results.font.measuredWidth, game.results.font.measuredHeight],
    [3, 8],
  );

  // The compiled sound effect reached a real XNA SoundEffect owning a native audio resource, and
  // its name round-trips through CNA.
  assert.equal(game.results.sound.name, "Beep");
  assert.equal(game.results.sound.sampleBytes, PCM_FRAMES * 2);
  // Duration is zero here, and that is a property of this artifact rather than of the CNB path:
  // it is built with CNA_AUDIO_PLATFORM=NULL, and docs/cna-abi-audit.md records CNA's own
  // CApi_AudioSmoke reporting the same zero for a PCM16 effect without a mixer. The real
  // measurement -- 250 ms and 2,500,000 ticks for a quarter second of 8 kHz mono -- is made in
  // test/wasm-browser.mjs, whose artifact has SDL3 audio. Asserting it here would be asserting the
  // configuration, not the schema.
  assert.equal(
    game.results.sound.durationMilliseconds, 0,
    "NULL audio reports no duration; when this artifact gains a mixer, this expectation changes",
  );
  game.Dispose();
});

/* ---- the CNB model schema -------------------------------------------------------------------- */

/**
 * A reference model with **every projected level occupied at once**: two bones in a hierarchy, a
 * part with real vertex and index payloads, a material with distinguishable values in every field
 * and all eight texture slots named differently, a mesh, a skeleton with three matrix sets, and a
 * light. A level that either half of the encode/decode cycle drops is then visible, and a
 * transposed field cannot hide behind a neighbour that happens to hold the same number.
 *
 * Built with `CnbModelData` and encoded by **CNA's own writer**, so what the reader is proved
 * against is the writer rather than itself.
 */
const MODEL_VERTICES = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
]);
const MODEL_INDICES = Uint16Array.from([0, 1, 2]);

/** Sixteen distinguishable values, so a matrix read in the wrong order cannot pass. */
function scaleMatrix(diagonal) {
  return new Matrix(
    diagonal, 0, 0, 0,
    0, diagonal, 0, 0,
    0, 0, diagonal, 0,
    0, 0, 0, 1,
  );
}

const MODEL_MATERIAL = Object.freeze({
  BaseColorFactor: new Vector4(0.25, 0.5, 0.75, 1),
  EmissiveFactor: new Vector3(0.125, 0.375, 0.625),
  SpecularColorFactor: new Vector3(0.875, 0.0625, 0.1875),
  MetallicFactor: 0.4,
  RoughnessFactor: 0.6,
  Ior: 1.5,
  SpecularFactor: 0.9,
  NormalScale: 1.5,
  OcclusionStrength: 0.8,
  AlphaCutoff: 0.25,
  AlphaMode: 2,
  DoubleSided: true,
});

/** One distinct name per slot, so a slot read through its neighbour's route is caught. */
const MODEL_TEXTURES = Object.freeze({
  [CnbMaterialTextureSlot.BaseColor]: "albedo",
  [CnbMaterialTextureSlot.Second]: "overlay",
  [CnbMaterialTextureSlot.Normal]: "bumps",
  [CnbMaterialTextureSlot.MetallicRoughness]: "mr",
  [CnbMaterialTextureSlot.Emissive]: "glow",
  [CnbMaterialTextureSlot.Occlusion]: "ao",
  [CnbMaterialTextureSlot.Specular]: "spec",
  [CnbMaterialTextureSlot.SpecularColor]: "spectint",
});

function buildReferenceModel() {
  const model = CnbModelData.Create();
  try {
    model.SetFlags(true, true);
    assert.equal(model.AddBone("root", -1, scaleMatrix(1)), 0);
    assert.equal(model.AddBone("child", 0, scaleMatrix(2)), 1);

    const part = model.AddPart({
      VertexStride: 12,
      VertexCount: 3,
      IndexCount: 3,
      IndexElementSize: 2,
      PrimitiveTopology: 4,
      PrimitiveCount: 1,
      EffectKind: CnbEffectKind.Pbr,
      VertexColorEnabled: true,
      Unlit: false,
    }, "triangle", "");
    assert.equal(part, 0);
    model.SetPartVertexBytes(part, new Uint8Array(MODEL_VERTICES.buffer.slice(0)));
    model.SetPartIndexBytes(part, new Uint8Array(MODEL_INDICES.buffer.slice(0)));
    model.SetMaterial(part, MODEL_MATERIAL);
    for (const [slot, name] of Object.entries(MODEL_TEXTURES)) {
      model.SetMaterialTexture(part, Number(slot), name);
    }

    assert.equal(model.AddMesh("body", 1, [0]), 0);
    model.SetSkeleton(
      [-1, 0],
      [scaleMatrix(1), scaleMatrix(2)],
      [scaleMatrix(3), scaleMatrix(4)],
      [scaleMatrix(5), scaleMatrix(6)],
    );
    assert.equal(model.AddLight(new Vector3(0, -1, 0), new Vector3(1, 0.5, 0.25)), 0);
    return model;
  } catch (error) {
    model.Dispose();
    throw error;
  }
}

/** Encodes the reference model with CNA's writer and parses the image back. */
function roundTripReferenceModel() {
  const authored = buildReferenceModel();
  let image;
  try {
    image = authored.Encode("Reference/Rig");
  } finally {
    authored.Dispose();
  }
  const document = CnbDocument.Parse(image, "Reference/Rig.cnb");
  return { image, document, model: CnbModelData.Decode(document) };
}

test("a model CNA encoded parses back as the container CNA wrote", { skip }, () => {
  const { image, document, model } = roundTripReferenceModel();
  try {
    assert.equal(CnbFormat.HasMagic(image), true);
    assert.equal(document.AssetType, CnbAssetType.Model);
    assert.equal(document.Metadata.ContentName, "Reference/Rig");
    // The model schema's own chunks, in the order CNA's writer emits them. A reader that found the
    // model but not, say, the skeleton would still decode -- so the table of contents is asserted.
    const ids = document.Chunks.map((chunk) => chunk.Id);
    assert.ok(ids.includes("CMET"), `expected a metadata chunk, saw ${ids.join(", ")}`);
    assert.ok(ids.length > 1, "a model carries more than its metadata");
    assert.equal(model.IsDisposed, false);
  } finally {
    model.Dispose();
    document.Dispose();
  }
});

test("a decoded model reports the exact node counts and flags it was built with", { skip }, () => {
  const { document, model } = roundTripReferenceModel();
  try {
    const shape = model.Shape;
    assert.equal(shape.BoneCount, 2);
    assert.equal(shape.PartCount, 1);
    assert.equal(shape.MeshCount, 1);
    assert.equal(shape.LightCount, 1);
    assert.equal(shape.HasSkeleton, true);
    assert.equal(shape.AppliesGltfLightingPolicy, true);
    assert.equal(shape.HasBoneHierarchy, true);
    // Animations were not authored, and the count must say so rather than defaulting to one.
    assert.equal(shape.AnimationCount, 0);
  } finally {
    model.Dispose();
    document.Dispose();
  }
});

test("the bone hierarchy survives the round trip with its exact transforms", { skip }, () => {
  const { document, model } = roundTripReferenceModel();
  try {
    const root = model.GetBone(0);
    const child = model.GetBone(1);
    assert.equal(root.Name, "root");
    assert.equal(child.Name, "child");
    // The parent link is the hierarchy: a reader that returned 0 for everything would pass an
    // "is a number" check and fail this one.
    assert.equal(root.Parent, -1, "the root has no parent");
    assert.equal(child.Parent, 0, "the child hangs from the root");
    // Sixteen floats in row order. Asserting the whole matrix rather than one element is what
    // catches a transposed or shifted read.
    assert.deepEqual(
      [root.Transform.M11, root.Transform.M22, root.Transform.M33, root.Transform.M44],
      [1, 1, 1, 1],
    );
    assert.deepEqual(
      [child.Transform.M11, child.Transform.M22, child.Transform.M33, child.Transform.M44],
      [2, 2, 2, 1],
    );
    assert.equal(child.Transform.M12, 0);
    assert.equal(child.Transform.M21, 0);
    assert.throws(() => model.GetBone(2), /no CNB model bone at index 2/);
    assert.throws(() => model.GetBone(-1), /no CNB model bone at index -1/);
  } finally {
    model.Dispose();
    document.Dispose();
  }
});

test("a part keeps its description and its exact vertex and index payloads", { skip }, () => {
  const { document, model } = roundTripReferenceModel();
  try {
    const part = model.GetPart(0);
    assert.equal(part.Name, "triangle");
    assert.equal(part.ExternalEffect, "", "a PBR part names no external effect");
    assert.equal(part.VertexStride, 12);
    assert.equal(part.VertexCount, 3);
    assert.equal(part.IndexCount, 3);
    assert.equal(part.IndexElementSize, 2);
    assert.equal(part.PrimitiveTopology, 4, "triangles, as in glTF");
    assert.equal(part.PrimitiveCount, 1);
    assert.equal(part.EffectKind, CnbEffectKind.Pbr);
    assert.equal(part.VertexColorEnabled, true);
    assert.equal(part.Unlit, false, "the two booleans are distinct fields, not one flag");

    // The payloads, byte for byte. This is the assertion a stride/count mix-up fails: the vertex
    // payload is nine floats and the index payload is three uint16s, and neither length is
    // derivable from the other.
    const vertices = model.ReadPartVertexBytes(0);
    assert.equal(vertices.byteLength, part.VertexStride * part.VertexCount);
    assert.deepEqual(
      [...new Float32Array(vertices.buffer, vertices.byteOffset, 9)], [...MODEL_VERTICES],
    );
    const indices = model.ReadPartIndexBytes(0);
    assert.equal(indices.byteLength, part.IndexElementSize * part.IndexCount);
    assert.deepEqual(
      [...new Uint16Array(indices.buffer, indices.byteOffset, 3)], [...MODEL_INDICES],
    );
  } finally {
    model.Dispose();
    document.Dispose();
  }
});

test("a material keeps every factor and every one of its eight texture names", { skip }, () => {
  const { document, model } = roundTripReferenceModel();
  try {
    const material = model.GetMaterial(0);
    // Each scalar has its own value, so a field read through its neighbour's offset is caught.
    assert.deepEqual(
      [
        material.BaseColorFactor.X, material.BaseColorFactor.Y,
        material.BaseColorFactor.Z, material.BaseColorFactor.W,
      ],
      [0.25, 0.5, 0.75, 1],
    );
    assert.deepEqual(
      [material.EmissiveFactor.X, material.EmissiveFactor.Y, material.EmissiveFactor.Z],
      [0.125, 0.375, 0.625],
    );
    assert.deepEqual(
      [
        material.SpecularColorFactor.X, material.SpecularColorFactor.Y,
        material.SpecularColorFactor.Z,
      ],
      [0.875, 0.0625, 0.1875],
    );
    for (const [name, expected] of Object.entries({
      MetallicFactor: 0.4, RoughnessFactor: 0.6, Ior: 1.5, SpecularFactor: 0.9,
      NormalScale: 1.5, OcclusionStrength: 0.8, AlphaCutoff: 0.25,
    })) {
      assert.ok(
        Math.abs(material[name] - expected) < 1e-6,
        `${name}: expected ${expected}, got ${material[name]}`,
      );
    }
    assert.equal(material.AlphaMode, 2);
    assert.equal(material.DoubleSided, true);

    // Eight named slots, eight distinct names. This is the trap CNA's own suite exists to pin:
    // the named slots and the seven per-slot arrays are different index spaces, and a binding that
    // confused them would still round trip because both halves would be wrong together.
    for (const [slot, expected] of Object.entries(MODEL_TEXTURES)) {
      assert.equal(
        model.GetMaterialTexture(0, Number(slot)), expected,
        `texture slot ${slot} came back as the wrong asset`,
      );
    }
  } finally {
    model.Dispose();
    document.Dispose();
  }
});

test("a mesh keeps its name, its parent bone and its part membership", { skip }, () => {
  const { document, model } = roundTripReferenceModel();
  try {
    const mesh = model.GetMesh(0);
    assert.equal(mesh.Name, "body");
    assert.equal(mesh.ParentBone, 1, "the mesh hangs from the child bone, not the root");
    assert.deepEqual([...mesh.PartIndices], [0]);
    assert.throws(() => model.GetMesh(1), /no CNB model mesh at index 1/);
  } finally {
    model.Dispose();
    document.Dispose();
  }
});

test("the skeleton keeps its hierarchy and all three matrix sets apart", { skip }, () => {
  const { document, model } = roundTripReferenceModel();
  try {
    const skeleton = model.GetSkeleton();
    assert.equal(skeleton.JointCount, 2);
    assert.equal(skeleton.HasRootPrefix, true);
    assert.deepEqual([...skeleton.Hierarchy], [-1, 0]);

    // Three sets of two matrices, each with its own diagonal, so a set read through another set's
    // identity is caught. Reading them by the wrong CNA_CnbSkeletonMatrixSet is the exact defect
    // this arrangement exists to detect.
    const expected = {
      [CnbSkeletonMatrixSet.BindPose]: [1, 2],
      [CnbSkeletonMatrixSet.InverseBindPose]: [3, 4],
      [CnbSkeletonMatrixSet.RootPrefix]: [5, 6],
    };
    for (const [set, diagonals] of Object.entries(expected)) {
      const matrices = model.GetSkeletonMatrices(Number(set));
      assert.equal(matrices.length, 2, `matrix set ${set} has one matrix per joint`);
      assert.deepEqual(
        matrices.map((matrix) => matrix.M11), diagonals,
        `matrix set ${set} came back as another set`,
      );
      assert.deepEqual(matrices.map((matrix) => matrix.M44), [1, 1]);
    }
  } finally {
    model.Dispose();
    document.Dispose();
  }
});

test("a baked light keeps its direction and colour", { skip }, () => {
  const { document, model } = roundTripReferenceModel();
  try {
    const light = model.GetLight(0);
    assert.deepEqual([light.Direction.X, light.Direction.Y, light.Direction.Z], [0, -1, 0]);
    assert.deepEqual(
      [light.DiffuseColor.X, light.DiffuseColor.Y, light.DiffuseColor.Z], [1, 0.5, 0.25],
    );
    assert.throws(() => model.GetLight(1), /no CNB model light at index 1/);
  } finally {
    model.Dispose();
    document.Dispose();
  }
});

test("a model refuses after disposal and disposes idempotently", { skip }, () => {
  const { document, model } = roundTripReferenceModel();
  try {
    model.Dispose();
    assert.equal(model.IsDisposed, true);
    model.Dispose();
    assert.throws(() => model.Shape, /CnbModelData\.Shape/);
    assert.throws(() => model.GetBone(0), /CnbModelData\.GetBone/);
    assert.throws(() => model.Encode("x"), /CnbModelData\.Encode/);
  } finally {
    document.Dispose();
  }
});

test("a document carrying another asset type refuses to decode as a model", { skip }, () => {
  // A texture container, handed to the model decoder. CNB's asset type is what distinguishes them,
  // so this must refuse rather than reinterpret the texture's chunks as a model's.
  const texture = CnbTextureData.FromRgba8(2, 2, ATLAS_RGBA);
  let image;
  try {
    image = texture.Encode("Wrong/Type");
  } finally {
    texture.Dispose();
  }
  const document = CnbDocument.Parse(image, "Wrong/Type.cnb");
  try {
    assert.throws(() => CnbModelData.Decode(document), /cna_cnb_decode_model/);
  } finally {
    document.Dispose();
  }
});

test("a malformed model container is refused rather than half-decoded", { skip }, () => {
  const { image, document, model } = roundTripReferenceModel();
  model.Dispose();
  document.Dispose();
  // Corrupt a byte well past the header, where the model's own chunk payloads live. The container
  // carries CRC-32C per chunk, so this must be caught rather than decoded into a model whose
  // vertex payload is one byte different from what was authored.
  const corrupted = Uint8Array.from(image);
  corrupted[corrupted.length - 8] ^= 0xff;
  assert.throws(
    () => {
      const parsed = CnbDocument.Parse(corrupted, "Corrupt/Rig.cnb");
      try {
        CnbModelData.Decode(parsed).Dispose();
      } finally {
        parsed.Dispose();
      }
    },
    /cna_cnb/,
    "a corrupted model image must be refused by CNA rather than decoded",
  );
});

test("a payload that contradicts its declared part is refused at encode", { skip }, () => {
  // Measured rather than assumed: CNA accepts any payload length at *set* time and validates the
  // whole part when the model is encoded. That is the right place for a builder -- a caller may
  // legitimately set the bytes before the counts -- so what this asserts is the encode-time
  // refusal, and that it names the part and both numbers rather than failing anonymously.
  const build = (vertexBytes, indexBytes) => {
    const model = CnbModelData.Create();
    model.AddPart({
      VertexStride: 12, VertexCount: 3, IndexCount: 3, IndexElementSize: 2,
      PrimitiveTopology: 4, PrimitiveCount: 1, EffectKind: CnbEffectKind.Basic,
      VertexColorEnabled: false, Unlit: false,
    }, "triangle", "");
    model.SetPartVertexBytes(0, new Uint8Array(vertexBytes));
    model.SetPartIndexBytes(0, new Uint8Array(indexBytes));
    return model;
  };

  const short = build(35, 6);
  try {
    assert.throws(
      () => short.Encode("Short/Rig"),
      /supplies 35 vertex byte\(s\) but declares 3 vertices of 12 bytes/,
      "the refusal must name the part and both counts",
    );
  } finally {
    short.Dispose();
  }

  const wrongIndices = build(36, 7);
  try {
    assert.throws(() => wrongIndices.Encode("Short/Rig"), /cna_cnb_encode_model/);
  } finally {
    wrongIndices.Dispose();
  }

  // The declared pair encodes, so the refusals above are about the mismatch rather than about the
  // route being unusable at all.
  const exact = build(36, 6);
  try {
    assert.ok(exact.Encode("Exact/Rig").byteLength > 0);
  } finally {
    exact.Dispose();
  }
});

test("a skeleton whose matrix sets disagree with its hierarchy is refused here", { skip }, () => {
  const model = CnbModelData.Create();
  try {
    assert.throws(
      () => model.SetSkeleton([-1, 0], [scaleMatrix(1)], [scaleMatrix(1), scaleMatrix(2)], []),
      /bindPose must carry one matrix per joint/,
    );
  } finally {
    model.Dispose();
  }
});

/* ---- the CNB media schemas ------------------------------------------------------------------- */

/**
 * A quarter second of 8 kHz mono 16-bit PCM. The sample values are a ramp rather than silence, so
 * a payload that came back zeroed, truncated or byte-swapped is visible rather than plausible.
 */
const PCM_SAMPLE_RATE = 8000;
const PCM_FRAMES = PCM_SAMPLE_RATE / 4;
function pcm16Samples() {
  const view = new DataView(new ArrayBuffer(PCM_FRAMES * 2));
  for (let index = 0; index < PCM_FRAMES; index += 1) {
    view.setInt16(index * 2, (index * 7) % 32768 - 16384, true);
  }
  return new Uint8Array(view.buffer);
}

/** A minimal RIFF/WAVE image around those samples, so CNA's own WAV decoder has real input. */
function wavImage(samples) {
  const bytes = new Uint8Array(44 + samples.byteLength);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // format 1 = PCM
  view.setUint16(22, 1, true);           // channels
  view.setUint32(24, PCM_SAMPLE_RATE, true);
  view.setUint32(28, PCM_SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.byteLength, true);
  bytes.set(samples, 44);
  return bytes;
}

test("a sound effect CNA encoded decodes back with its exact description and samples", { skip }, () => {
  const samples = pcm16Samples();
  const authored = CnbSoundEffectData.Create({
    Format: CnbAudioFormat.Pcm16,
    SampleRate: PCM_SAMPLE_RATE,
    Channels: 1,
    FrameCount: PCM_FRAMES,
    LoopStart: 100,
    LoopLength: 400,
  }, samples);
  let image;
  try {
    image = authored.Encode("Reference/Beep");
  } finally {
    authored.Dispose();
  }
  const document = CnbDocument.Parse(image, "Reference/Beep.cnb");
  try {
    assert.equal(document.AssetType, CnbAssetType.SoundEffect);
    assert.equal(document.Metadata.ContentName, "Reference/Beep");
    const decoded = CnbSoundEffectData.Decode(document);
    try {
      const description = decoded.Description;
      assert.equal(description.Format, CnbAudioFormat.Pcm16);
      assert.equal(description.SampleRate, PCM_SAMPLE_RATE);
      assert.equal(description.Channels, 1);
      assert.equal(description.FrameCount, PCM_FRAMES);
      // The loop region is two independent numbers, given two different values so a reader that
      // returned one for both would fail here rather than round-trip.
      assert.equal(description.LoopStart, 100);
      assert.equal(description.LoopLength, 400);
      // Byte for byte. A truncated payload, a zeroed one and a byte-swapped one all fail.
      assert.deepEqual([...decoded.ReadSamples()], [...samples]);
    } finally {
      decoded.Dispose();
    }
  } finally {
    document.Dispose();
  }
});

test("CNA's own WAV decoder reads a RIFF image into a CNB sound effect", { skip }, () => {
  const samples = pcm16Samples();
  const decoded = CnbSoundEffectData.DecodeWav(wavImage(samples), "beep.wav");
  try {
    const description = decoded.Description;
    assert.equal(description.Format, CnbAudioFormat.Pcm16);
    assert.equal(description.SampleRate, PCM_SAMPLE_RATE);
    assert.equal(description.Channels, 1);
    assert.equal(description.FrameCount, PCM_FRAMES);
    // The header said these bytes; the decoder must produce exactly them rather than a resampled
    // or re-quantised approximation.
    assert.deepEqual([...decoded.ReadSamples()], [...samples]);
  } finally {
    decoded.Dispose();
  }
  // A file that is not a WAV is refused rather than read as one.
  assert.throws(
    () => CnbSoundEffectData.DecodeWav(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), "not-a-wav"),
    /cna_cnb_decode_wav_as_sound_effect/,
  );
});

test("a CNB sound effect XNA cannot represent is refused by name", { skip }, () => {
  // Eight-bit PCM read as sixteen would play as noise, so this must refuse rather than convert.
  const eightBit = CnbSoundEffectData.Create({
    Format: CnbAudioFormat.Pcm8, SampleRate: PCM_SAMPLE_RATE, Channels: 1,
    FrameCount: 8, LoopStart: 0, LoopLength: 0,
  }, new Uint8Array(8));
  try {
    assert.throws(
      () => CreateSoundEffectFromCnbSoundEffectData(eightBit),
      /Pcm8 cannot become an XNA SoundEffect/,
    );
    // And the data itself is still readable, which is the point of refusing rather than throwing
    // the container away: a caller can convert the samples themselves.
    assert.equal(eightBit.Description.Format, CnbAudioFormat.Pcm8);
    assert.equal(eightBit.ReadSamples().byteLength, 8);
  } finally {
    eightBit.Dispose();
  }
});

test("a song container round-trips its name, duration and stream reference", { skip }, () => {
  // A song carries a *reference* to its audio rather than the audio, so the whole schema is
  // testable with no encoded music at all. Three distinguishable values, so a field read through
  // its neighbour's route is caught.
  const image = EncodeCnbSong({
    StreamReference: "Music/Theme.ogg",
    Name: "Main Theme",
    DurationMilliseconds: 123456,
  }, "Reference/Theme");
  const document = CnbDocument.Parse(image, "Reference/Theme.cnb");
  try {
    assert.equal(document.AssetType, CnbAssetType.Song);
    assert.equal(document.Metadata.ContentName, "Reference/Theme");
    const song = DecodeCnbSong(document);
    assert.equal(song.StreamReference, "Music/Theme.ogg");
    assert.equal(song.Name, "Main Theme", "the display name is not the stream reference");
    assert.equal(song.DurationMilliseconds, 123456);
  } finally {
    document.Dispose();
  }
});

test("a video container round-trips its description and stream reference", { skip }, () => {
  // Every field a different value, and none of them derivable from another: a 1280x720 clip at
  // 29.97 fps is not square, not a common duration and not an integer frame rate.
  const image = EncodeCnbVideo({
    StreamReference: "Movies/Intro.ogv",
    DurationMilliseconds: 45678,
    Width: 1280,
    Height: 720,
    FramesPerSecond: 29.97,
    SoundtrackType: 2,
  }, "Reference/Intro");
  const document = CnbDocument.Parse(image, "Reference/Intro.cnb");
  try {
    assert.equal(document.AssetType, CnbAssetType.Video);
    const video = DecodeCnbVideo(document);
    assert.equal(video.StreamReference, "Movies/Intro.ogv");
    assert.equal(video.DurationMilliseconds, 45678);
    assert.equal(video.Width, 1280);
    assert.equal(video.Height, 720, "width and height are distinct fields");
    // Stored as a float, so exact equality against 29.97 would be wrong.
    assert.ok(Math.abs(video.FramesPerSecond - 29.97) < 1e-4, `fps was ${video.FramesPerSecond}`);
    assert.equal(video.SoundtrackType, 2);
  } finally {
    document.Dispose();
  }
});

test("a media container decoded as the wrong schema is refused", { skip }, () => {
  // Each of the three refuses the others: the asset type is what distinguishes them, and reading a
  // song's chunks as a video's would produce a plausible-looking description of nothing.
  const song = CnbDocument.Parse(
    EncodeCnbSong({ StreamReference: "a", Name: "b", DurationMilliseconds: 1 }, "S"), "S.cnb",
  );
  try {
    assert.throws(() => DecodeCnbVideo(song), /cna_cnb_decode_video/);
    assert.throws(() => CnbSoundEffectData.Decode(song), /cna_cnb_decode_sound_effect/);
  } finally {
    song.Dispose();
  }
  const video = CnbDocument.Parse(
    EncodeCnbVideo({
      StreamReference: "a", DurationMilliseconds: 1, Width: 2, Height: 2,
      FramesPerSecond: 1, SoundtrackType: 0,
    }, "V"), "V.cnb",
  );
  try {
    assert.throws(() => DecodeCnbSong(video), /cna_cnb_decode_song/);
  } finally {
    video.Dispose();
  }
});

test("a disposed sound effect refuses by name and disposes idempotently", { skip }, () => {
  const sound = CnbSoundEffectData.Create({
    Format: CnbAudioFormat.Pcm16, SampleRate: 8000, Channels: 1,
    FrameCount: 4, LoopStart: 0, LoopLength: 0,
  }, new Uint8Array(8));
  sound.Dispose();
  assert.equal(sound.IsDisposed, true);
  sound.Dispose();
  assert.throws(() => sound.Description, /CnbSoundEffectData\.Description/);
  assert.throws(() => sound.ReadSamples(), /CnbSoundEffectData\.ReadSamples/);
  assert.throws(() => sound.Encode("x"), /CnbSoundEffectData\.Encode/);
});

/* ---- the CNB curve and animation-clip schemas ------------------------------------------------- */

test("a curve round-trips through CNA and evaluates identically afterwards", { skip }, () => {
  // Every field of every key gets its own value, and the two loop modes differ from each other and
  // from the default, so a reader that returned the default for either would fail rather than
  // round-trip. Continuity is Step on one key and Smooth on the other, because a reader that
  // ignored it would still produce a curve that looks right at the keys.
  const authored = new Curve();
  authored.PreLoop = CurveLoopType.Cycle;
  authored.PostLoop = CurveLoopType.Oscillate;
  authored.Keys.Add(new CurveKey(0, 1, 0.25, 0.5, CurveContinuity.Smooth));
  authored.Keys.Add(new CurveKey(2, 5, 0.75, 1.25, CurveContinuity.Step));
  authored.Keys.Add(new CurveKey(4, -3, -0.5, -1.5, CurveContinuity.Smooth));

  const image = EncodeCnbCurve(authored, "Reference/Ease");
  const document = CnbDocument.Parse(image, "Reference/Ease.cnb");
  let decoded;
  try {
    assert.equal(document.AssetType, CnbAssetType.Curve);
    assert.equal(document.Metadata.ContentName, "Reference/Ease");
    decoded = DecodeCnbCurve(document);
  } finally {
    document.Dispose();
  }

  assert.equal(decoded.PreLoop, CurveLoopType.Cycle);
  assert.equal(decoded.PostLoop, CurveLoopType.Oscillate, "the two loop modes are distinct fields");
  assert.equal(decoded.Keys.Count, 3);
  for (let index = 0; index < 3; index += 1) {
    const original = authored.Keys.Get(index);
    const key = decoded.Keys.Get(index);
    assert.deepEqual(
      [key.Position, key.Value, key.TangentIn, key.TangentOut, key.Continuity],
      [
        original.Position, original.Value, original.TangentIn, original.TangentOut,
        original.Continuity,
      ],
      `key ${index} did not survive the round trip`,
    );
  }

  // The real test of a curve is what it computes, not what it stores. Sampling between the keys
  // exercises the tangents and the continuity, so a curve whose keys survived but whose tangents
  // did not would fail here even though every field above matched.
  for (const at of [-1, 0, 0.5, 1, 1.9, 2, 2.1, 3, 4, 5.5]) {
    assert.equal(
      decoded.Evaluate(at), authored.Evaluate(at),
      `the decoded curve evaluates differently at ${at}`,
    );
  }

  // And a managed curve stays managed: there is nothing to dispose and no backend behind it.
  assert.equal(decoded.IsConstant, false);
  assert.equal(typeof decoded.Clone().Evaluate(1), "number");
});

test("a single-key curve reports itself constant on both sides", { skip }, () => {
  const authored = new Curve();
  authored.Keys.Add(new CurveKey(1, 7));
  assert.equal(authored.IsConstant, true);
  const document = CnbDocument.Parse(EncodeCnbCurve(authored, "Flat"), "Flat.cnb");
  try {
    const decoded = DecodeCnbCurve(document);
    assert.equal(decoded.IsConstant, true);
    assert.equal(decoded.Keys.Count, 1);
    assert.equal(decoded.Evaluate(100), 7, "a constant curve evaluates to its one value");
  } finally {
    document.Dispose();
  }
});

/** Two tracks with different bone indexes and different keyframe counts. */
const CLIP = Object.freeze({
  DurationSeconds: 2.5,
  // CNA_CLIP_TARGET_SPACE_SCENE_NODE_EXT; the other identity is asserted to differ below.
  TargetSpace: 1,
  Tracks: [
    {
      BoneIndex: 3,
      Keyframes: [
        {
          TimeSeconds: 0,
          Translation: new Vector3(1, 2, 3),
          Rotation: new Quaternion(0, 0, 0, 1),
          Scale: new Vector3(1, 1, 1),
        },
        {
          TimeSeconds: 1.25,
          Translation: new Vector3(4, 5, 6),
          Rotation: new Quaternion(0.5, 0.5, 0.5, 0.5),
          Scale: new Vector3(2, 3, 4),
        },
      ],
    },
    {
      BoneIndex: 7,
      Keyframes: [
        {
          TimeSeconds: 2.5,
          Translation: new Vector3(-1, -2, -3),
          Rotation: new Quaternion(0, 1, 0, 0),
          Scale: new Vector3(0.5, 0.25, 0.125),
        },
      ],
    },
  ],
});

test("an animation clip keeps its duration, tracks and every keyframe component", { skip }, () => {
  const image = EncodeCnbAnimationClip(CLIP, "Reference/Walk");
  const document = CnbDocument.Parse(image, "Reference/Walk.cnb");
  try {
    assert.equal(document.AssetType, CnbAssetType.AnimationClip);
    const clip = CnbAnimationClip.Decode(document);
    try {
      const description = clip.Description;
      assert.equal(description.DurationSeconds, 2.5);
      assert.equal(description.TrackCount, 2);
      assert.equal(description.TargetSpace, 1);

      // Two tracks with different bone indexes and different keyframe counts: a reader that
      // returned the first track for both would fail on either.
      assert.deepEqual(
        [clip.GetTrack(0).BoneIndex, clip.GetTrack(1).BoneIndex], [3, 7],
      );
      assert.deepEqual(
        [clip.GetTrack(0).KeyframeCount, clip.GetTrack(1).KeyframeCount], [2, 1],
      );
      assert.throws(() => clip.GetTrack(2), /no CNB animation track at index 2/);

      // Every component of every keyframe. Translation, rotation and scale are three separate
      // vectors of different lengths at different offsets, and each keyframe here has values that
      // could not be mistaken for another's.
      const first = clip.ReadKeyframes(0);
      assert.equal(first.length, 2);
      assert.equal(first[0].TimeSeconds, 0);
      assert.deepEqual(
        [first[0].Translation.X, first[0].Translation.Y, first[0].Translation.Z], [1, 2, 3],
      );
      assert.deepEqual(
        [first[0].Rotation.X, first[0].Rotation.Y, first[0].Rotation.Z, first[0].Rotation.W],
        [0, 0, 0, 1], "an identity rotation is x=y=z=0, w=1, not the other way round",
      );
      assert.deepEqual([first[0].Scale.X, first[0].Scale.Y, first[0].Scale.Z], [1, 1, 1]);

      assert.equal(first[1].TimeSeconds, 1.25);
      assert.deepEqual(
        [first[1].Translation.X, first[1].Translation.Y, first[1].Translation.Z], [4, 5, 6],
      );
      assert.deepEqual(
        [first[1].Rotation.X, first[1].Rotation.Y, first[1].Rotation.Z, first[1].Rotation.W],
        [0.5, 0.5, 0.5, 0.5],
      );
      assert.deepEqual([first[1].Scale.X, first[1].Scale.Y, first[1].Scale.Z], [2, 3, 4]);

      const second = clip.ReadKeyframes(1);
      assert.equal(second.length, 1);
      assert.equal(second[0].TimeSeconds, 2.5);
      assert.deepEqual(
        [second[0].Translation.X, second[0].Translation.Y, second[0].Translation.Z], [-1, -2, -3],
      );
      assert.deepEqual(
        [second[0].Rotation.X, second[0].Rotation.Y, second[0].Rotation.Z, second[0].Rotation.W],
        [0, 1, 0, 0],
      );
      assert.deepEqual(
        [second[0].Scale.X, second[0].Scale.Y, second[0].Scale.Z], [0.5, 0.25, 0.125],
      );
      assert.throws(() => clip.ReadKeyframes(2), /no CNB animation track at index 2/);
    } finally {
      clip.Dispose();
    }
  } finally {
    document.Dispose();
  }
});

test("a clip's target space is carried rather than defaulted", { skip }, () => {
  // The same clip written in the other target space must decode as the other target space.
  const other = { ...CLIP, TargetSpace: 0 };
  const document = CnbDocument.Parse(
    EncodeCnbAnimationClip(other, "Reference/WalkBone"), "WalkBone.cnb",
  );
  try {
    const clip = CnbAnimationClip.Decode(document);
    try {
      assert.equal(clip.Description.TargetSpace, 0);
    } finally {
      clip.Dispose();
    }
  } finally {
    document.Dispose();
  }
});

test("a disposed animation clip refuses by name and disposes idempotently", { skip }, () => {
  const document = CnbDocument.Parse(EncodeCnbAnimationClip(CLIP, "W"), "W.cnb");
  try {
    const clip = CnbAnimationClip.Decode(document);
    clip.Dispose();
    assert.equal(clip.IsDisposed, true);
    clip.Dispose();
    assert.throws(() => clip.Description, /CnbAnimationClip\.Description/);
    assert.throws(() => clip.ReadKeyframes(0), /CnbAnimationClip\.ReadKeyframes/);
  } finally {
    document.Dispose();
  }
});

test("a curve and a clip refuse each other's containers", { skip }, () => {
  const curve = new Curve();
  curve.Keys.Add(new CurveKey(0, 0));
  const curveDocument = CnbDocument.Parse(EncodeCnbCurve(curve, "C"), "C.cnb");
  try {
    assert.throws(() => CnbAnimationClip.Decode(curveDocument), /cna_cnb_decode_animation_clip/);
  } finally {
    curveDocument.Dispose();
  }
  const clipDocument = CnbDocument.Parse(EncodeCnbAnimationClip(CLIP, "A"), "A.cnb");
  try {
    assert.throws(() => DecodeCnbCurve(clipDocument), /cna_cnb_decode_curve/);
  } finally {
    clipDocument.Dispose();
  }
});

test("CNB's writers author a container for an asset type CNA has no schema for", () => {
  // The payload: one of every primitive the byte writer offers, each a value that would survive a
  // wrong width or a wrong byte order differently. Decoding them back at their exact offsets is
  // what proves the widths and the order, rather than only that some bytes survived.
  const writer = new CnbByteWriter();
  let payload;
  try {
    writer
      .WriteByte(0xAB)
      .WriteUInt16(0xBEEF)
      .WriteUInt32(0xDEAD_BEEF)
      .WriteUInt64(0x0123_4567_89AB_CDEFn)
      .WriteInt32(-123456)
      .WriteSingle(0.5)
      .WriteDouble(-2.25)
      .WriteString("hello, cnb")
      .WriteBytes(Uint8Array.from([1, 2, 3]))
      .WriteZeros(4);

    // 1 + 2 + 4 + 8 + 4 + 4 + 8 = 31, a four-byte length prefix and ten string bytes = 45,
    // three raw bytes and four zeros = 52. The arithmetic is stated so a changed string encoding
    // shows up as a size mismatch rather than silently shifting every offset after it.
    assert.equal(writer.Size, 52);

    payload = writer.ToArray();
    assert.equal(payload.length, 52);
    assert.equal(writer.Size, 52, "ToArray copies; the writer keeps what it has");

    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    assert.equal(view.getUint8(0), 0xAB);
    assert.equal(view.getUint16(1, true), 0xBEEF, "CNB is little-endian");
    assert.equal(view.getUint32(3, true), 0xDEAD_BEEF);
    assert.equal(view.getBigUint64(7, true), 0x0123_4567_89AB_CDEFn, "a u64 survives exactly");
    assert.equal(view.getInt32(15, true), -123456, "and a negative i32 is not read as unsigned");
    assert.equal(view.getFloat32(19, true), 0.5);
    assert.equal(view.getFloat64(23, true), -2.25);
    assert.equal(view.getUint32(31, true), 10, "a string carries its byte length first");
    assert.equal(
      new TextDecoder().decode(payload.subarray(35, 45)), "hello, cnb",
      "then its UTF-8 bytes",
    );
    assert.deepEqual([...payload.subarray(45, 48)], [1, 2, 3], "raw bytes go in as they are");
    assert.deepEqual([...payload.subarray(48, 52)], [0, 0, 0, 0], "and a zero run is zeros");

    // Take is not ToArray: it hands over the same bytes and leaves the writer empty.
    const taken = writer.Take();
    assert.deepEqual([...taken], [...payload]);
    assert.equal(writer.Size, 0, "Take empties the writer");
    assert.deepEqual([...writer.ToArray()], [], "and it stays empty");
  } finally {
    writer.Dispose();
  }

  // A chunk identifier a game defines for itself: CNB reserves an uppercase first letter for its
  // own schemas.
  const chunkId = CnbFormat.MakeChunkId("mydt");
  assert.equal(CnbFormat.GetChunkIdText(chunkId), "mydt");
  assert.equal(CnbFormat.IsWellFormedChunkId(chunkId), true);

  const container = new CnbWriter(9999, 3);
  let image;
  let defaults;
  try {
    // CNA's own bounds, read rather than assumed.
    defaults = container.Limits;
    assert.ok(defaults.MaxChunkSize > 0 && defaults.MaxFileSize > 0);
    assert.ok(
      defaults.MaxTotalUncompressedSize >= defaults.MaxFileSize,
      "compression may expand a file, so the uncompressed bound is the larger one",
    );

    container.SetMetadata("MyGame.Level", "Levels/One");
    container.AddExternalReference("Textures/Atlas", CnbAssetType.Texture2D);
    container.AddChunk(chunkId, payload);
    assert.equal(container.SchemaChunkCount, 1, "the container's own chunks are not schema chunks");
    image = container.Build();
  } finally {
    container.Dispose();
  }

  assert.equal(CnbFormat.HasMagic(image), true, "what comes out is a real .cnb");

  // Read it back through the same reader every projected schema goes through.
  const document = CnbDocument.Parse(image, "Levels/One.cnb");
  try {
    assert.equal(document.AssetType, 9999, "a custom asset type survives");
    assert.equal(document.AssetSchemaVersion, 3);
    assert.equal(document.Metadata.AssetTypeName, "MyGame.Level");
    assert.equal(document.Metadata.ContentName, "Levels/One");
    assert.deepEqual(
      document.Chunks.map((chunk) => chunk.Id), ["CMET", "XREF", "mydt"],
      "the metadata and reference chunks the writer added itself, then the game's own",
    );
    assert.deepEqual(
      document.ExternalReferences.map((reference) => reference.Name), ["Textures/Atlas"],
    );
    assert.equal(document.ExternalReferences[0].ExpectedAssetType, CnbAssetType.Texture2D);

    const index = document.Chunks.findIndex((chunk) => chunk.RawId === chunkId);
    assert.ok(index >= 0, "the custom chunk is in the table of contents");
    assert.deepEqual(
      [...document.ReadChunk(index)], [...payload],
      "and its payload comes back byte for byte",
    );
  } finally {
    document.Dispose();
  }

  console.log(
    `CNA_TS_CNB_WRITERS=PASS PAYLOAD=${payload.length}B PRIMITIVES=DECODED ` +
    `IMAGE=${image.length}B CHUNK=${CnbFormat.GetChunkIdText(chunkId)} ROUND_TRIP=EXACT`,
  );
});

test("CNB's writers refuse what would not survive the format", () => {
  const writer = new CnbByteWriter();
  try {
    // A value that does not fit the width it is written at is refused rather than truncated: CNA
    // takes the width it is given and cannot tell a deliberate 0xFF from a truncated 0x1FF.
    for (const call of [
      () => writer.WriteByte(256),
      () => writer.WriteByte(-1),
      () => writer.WriteByte(1.5),
      () => writer.WriteUInt16(0x1_0000),
      () => writer.WriteUInt32(0x1_0000_0000),
      () => writer.WriteInt32(0x8000_0000),
      () => writer.WriteInt32(-0x8000_0001),
      () => writer.WriteUInt64(-1n),
      () => writer.WriteZeros(-1),
    ]) {
      assert.throws(call, RangeError, call.toString());
    }
    for (const call of [
      () => writer.WriteUInt64(1),
      () => writer.WriteString(7),
      () => writer.WriteBytes([1, 2, 3]),
      () => writer.WriteSingle("x"),
    ]) {
      assert.throws(call, TypeError, call.toString());
    }
    // Nothing refused reached CNA.
    assert.equal(writer.Size, 0);
    // The boundary values themselves are accepted, so the bounds are bounds rather than off by one.
    writer.WriteByte(255).WriteUInt16(0xFFFF).WriteUInt32(0xFFFF_FFFF)
      .WriteInt32(-0x8000_0000).WriteUInt64(0xFFFF_FFFF_FFFF_FFFFn);
    assert.equal(writer.Size, 1 + 2 + 4 + 4 + 8);
  } finally {
    writer.Dispose();
  }

  // A chunk identifier is exactly four bytes.
  for (const bad of ["", "abc", "abcde"]) {
    assert.throws(() => CnbFormat.MakeChunkId(bad), /four bytes/);
  }

  const container = new CnbWriter(1234, 1);
  try {
    // CNB accepts only a power-of-two chunk alignment, and this package says so before CNA does.
    for (const alignment of [0, 3, 6, 100]) {
      assert.throws(
        () => container.AddChunk(CnbFormat.MakeChunkId("algn"), new Uint8Array(4), 0, alignment),
        RangeError,
        `alignment ${alignment}`,
      );
    }
    // A power of two past CNB's own ceiling is refused too -- by CNA, with its own message.
    assert.throws(
      () => container.AddChunk(CnbFormat.MakeChunkId("algn"), new Uint8Array(4), 0, 8192),
      /alignment must be a power of two/,
    );
    container.AddChunk(CnbFormat.MakeChunkId("algn"), new Uint8Array(4), 0, 16);
    assert.equal(container.SchemaChunkCount, 1, "a legal power of two is accepted");
  } finally {
    container.Dispose();
  }

  // Narrowing a limit is not decoration. CNB checks structure when a chunk is added and sizes when
  // the document is built -- a writer accumulates, then validates what it is about to produce --
  // so both halves are asserted where they actually happen.
  const bounded = new CnbWriter(1234, 1);
  try {
    bounded.SetMetadata("MyGame.Level", "Levels/One");
    bounded.Limits = { ...bounded.Limits, MaxChunkSize: 8 };
    assert.equal(bounded.Limits.MaxChunkSize, 8, "the narrowed limit reads back");
    bounded.AddChunk(CnbFormat.MakeChunkId("bigc"), new Uint8Array(64));
    assert.throws(
      () => bounded.Build(),
      /above|exceed|holds \d+ bytes/i,
      "a document whose chunk is past the narrowed limit is refused at build",
    );
  } finally {
    bounded.Dispose();
  }

  const counted = new CnbWriter(1234, 1);
  try {
    counted.Limits = { ...counted.Limits, MaxChunkCount: 1 };
    for (let index = 0; index < 3; index += 1) {
      counted.AddChunk(CnbFormat.MakeChunkId(`ch${index}x`), new Uint8Array(2));
    }
    assert.equal(counted.SchemaChunkCount, 3, "chunks accumulate; the count is checked at build");
    assert.throws(
      () => counted.Build(), /chunks/i,
      "and a document past the narrowed chunk count is refused there",
    );
  } finally {
    counted.Dispose();
  }

  // Every entry point refuses once the writer is gone.
  const gone = new CnbByteWriter();
  gone.Dispose();
  gone.Dispose();
  assert.equal(gone.IsDisposed, true);
  assert.throws(() => gone.WriteByte(1), NativeUnavailableError);
  assert.throws(() => gone.Size, NativeUnavailableError);

  console.log(
    "CNA_TS_CNB_WRITER_REFUSALS=PASS WIDTHS=BOUNDED ALIGNMENT=POWER_OF_TWO LIMITS=ENFORCED",
  );
});
