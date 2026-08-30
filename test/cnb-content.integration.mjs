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
  Game,
  Graphics,
  GraphicsDeviceManager,
  LoadNodeNativeBackend,
  Rectangle,
  Vector2,
  Vector3,
} from "../dist/index.js";
import {
  CnbAssetType,
  CnbCompression,
  CnbDocument,
  CnbFormat,
  CnbSpriteFontData,
  CnbTextureData,
  CnbTextureFormat,
  CreateSpriteFontFromCnb,
  CreateTexture2DFromCnb,
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
  game.Dispose();
});
