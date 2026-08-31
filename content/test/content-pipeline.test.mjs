#!/usr/bin/env node

/**
 * The build-time content product, end to end.
 *
 * The whole point of this package is a claim with two halves, and this file proves both in one
 * run: **a build script compiles a source file into `.cnb`, and the `cna-ts` runtime loads what it
 * wrote.** So the assertions are not "the importer returned something" — they are the four exact
 * texels the PNG on disk carried, read back out of a native `Texture2D` the runtime created from
 * the file this package produced.
 *
 * The source files are written here as real PNG and RIFF/WAVE images, encoded against their own
 * specifications rather than produced by CNA. An importer test in which CNA reads back something
 * CNA wrote would prove nothing about importing.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  CompileCnj,
  ImportSoundEffect,
  ImportTexture2D,
  ImportTextureCube,
  IsContentToolchainLoaded,
  LoadContentToolchain,
} from "../dist/index.js";
import { encodePng, encodeWav } from "./fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(HERE, "../../dist/index.js");
const RUNTIME_CONTENT = path.resolve(HERE, "../../dist/extensions/content/index.js");
const BRIDGE = path.resolve(process.env.CNA_NODE_BRIDGE ?? path.join(HERE, "../../build/cna_node_bridge.node"));

const library = process.env.CNA_NATIVE_LIBRARY;
const blocked = !library
  ? "set CNA_NATIVE_LIBRARY to a compatible libcna_c_api shared library"
  : !fs.existsSync(BRIDGE)
    ? `no Node bridge at ${BRIDGE}; run npm run build:native-bridge in the runtime package`
    : !fs.existsSync(RUNTIME)
      ? "build the cna-ts runtime package first"
      : null;
const skip = blocked ?? false;

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-content-"));
after(() => fs.rmSync(workspace, { recursive: true, force: true }));
// The runtime opens isolated storage on load; keep it inside the workspace.
process.env.XDG_DATA_HOME = workspace;

/**
 * Four texels, no two of which share a channel value in the same position, so a swizzle, a
 * transpose or a row shift all change the answer.
 */
const TEXELS = Uint8Array.from([
  255, 0, 0, 255,
  0, 128, 0, 255,
  0, 0, 255, 255,
  16, 32, 48, 255,
]);
/** XNA packs `Color` as ABGR little-endian, which is what `PackedValue` reports. */
const EXPECTED_PACKED = [0xff0000ff, 0xff008000, 0xffff0000, 0xff302010];

let runtime = null;
let runtimeContent = null;

if (!skip) {
  runtime = await import(RUNTIME);
  runtimeContent = await import(RUNTIME_CONTENT);
  // The runtime opens the library first; the toolchain must then adopt it rather than refuse.
  await runtime.LoadNodeNativeBackend({ CnaLibrary: path.resolve(library), BridgeModule: BRIDGE });
}

function sourcePath(name, bytes) {
  const file = path.join(workspace, name);
  fs.writeFileSync(file, bytes);
  return file;
}

test("the toolchain adopts a library the runtime already opened", { skip }, async () => {
  assert.equal(IsContentToolchainLoaded(), false, "nothing is loaded before the first call");
  const status = await LoadContentToolchain({ CnaLibrary: library, BridgeModule: BRIDGE });
  assert.equal(IsContentToolchainLoaded(), true);
  // The runtime opened it above. A toolchain that tried to open a second library in the same
  // process would be refused by the bridge, so this reports adoption rather than failing.
  assert.equal(status.Opened, false, "the runtime had already opened the library");
  assert.match(status.AbiVersion, /^0\.21\./);
});

test("an importer refuses before the toolchain is loaded", { skip }, () => {
  // This can only be observed in a process where nothing has loaded yet, and every other test in
  // this file loads one -- so it runs in a child. A guard that only *looked* right would pass an
  // in-process check that happened to run first and then rot the moment the file was reordered.
  const probe = `
    import { ImportTexture2D } from ${JSON.stringify(pathToFileURL(path.resolve(HERE, "../dist/index.js")).href)};
    try {
      ImportTexture2D("anything.png", "X");
      console.log("NO_REFUSAL");
    } catch (error) {
      console.log("REFUSED:" + error.message);
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout.trim(),
    /^REFUSED:ImportTexture2D needs a CNA content toolchain; call LoadContentToolchain first$/,
    "an importer with no toolchain must name the operation and say what to call",
  );
});

test("a PNG on disk compiles to a .cnb the runtime loads with its exact texels", { skip }, async () => {
  const image = sourcePath("hero.png", encodePng(2, 2, TEXELS));
  const imported = ImportTexture2D(image, "Sprites/Hero");

  // What CNA read out of the PNG, before anything was written.
  assert.equal(imported.Width, 2);
  assert.equal(imported.Height, 2);
  assert.equal(imported.Depth, 1);
  assert.equal(imported.FaceCount, 1, "a 2D texture has one face");
  assert.ok(imported.MipCount >= 1);
  assert.ok(imported.RepresentationCount >= 1);
  assert.ok(imported.Image.byteLength > 0);

  // A build script's actual job: write the file.
  const compiled = path.join(workspace, "Hero.cnb");
  fs.writeFileSync(compiled, imported.Image);
  assert.ok(fs.statSync(compiled).size > 0);

  // And the runtime's job: read it. From disk, through the ordinary public API, with no memory
  // shared between the two halves -- the only thing that crossed is a file.
  const bytes = fs.readFileSync(compiled);
  const document = runtimeContent.CnbDocument.Parse(bytes, compiled);
  try {
    assert.equal(document.AssetType, runtimeContent.CnbAssetType.Texture2D);
    assert.equal(
      document.Metadata.ContentName, "Sprites/Hero",
      "the logical asset name is the one the build script chose, not the file path",
    );
  } finally {
    document.Dispose();
  }

  // The texels. This is the assertion the whole package exists for: the four colours that were in
  // the PNG are the four colours a game gets out of the compiled asset.
  const game = new (class extends runtime.Game {
    constructor() {
      super();
      this.graphics = new runtime.GraphicsDeviceManager(this);
      this.frames = 0;
      this.pixels = null;
    }

    LoadContent() {
      const parsed = runtimeContent.CnbDocument.Parse(fs.readFileSync(compiled), compiled);
      try {
        this.texture = runtimeContent.CreateTexture2DFromCnb(this.GraphicsDevice, parsed);
      } finally {
        parsed.Dispose();
      }
      const readback = new Array(4);
      this.texture.GetData(readback);
      this.pixels = readback.map((color) => color.PackedValue);
      this.size = [this.texture.Width, this.texture.Height];
      super.LoadContent();
    }

    Draw(gameTime) {
      this.GraphicsDevice.Clear(runtime.Color.CornflowerBlue);
      this.frames += 1;
      if (this.frames >= 2) this.Exit();
      super.Draw(gameTime);
    }

    UnloadContent() {
      this.texture?.Dispose();
      super.UnloadContent();
    }
  })();
  await game.Run();
  assert.deepEqual(game.size, [2, 2]);
  assert.deepEqual(game.pixels, EXPECTED_PACKED, "red, green, blue and a dark grey, as XNA packs them");
  game.Dispose();
});

test("a colour key makes exactly the keyed colour transparent", { skip }, () => {
  // The colour key is the one importer option XNA's processors were known for, and it must be
  // opt-in and exact: keying red must change the red texel and leave the other three alone.
  //
  // Every import below uses the **same content name**, so the only thing that can make two images
  // differ is the key. An earlier version of this test varied the name as well, and a planted
  // defect that accepted the key and never applied it passed -- the images differed, just not for
  // the reason being asserted.
  const image = sourcePath("keyed.png", encodePng(2, 2, TEXELS));
  const plain = ImportTexture2D(image, "Sprites/Keyed");
  const keyed = ImportTexture2D(image, "Sprites/Keyed", { R: 255, G: 0, B: 0 });
  assert.deepEqual([keyed.Width, keyed.Height], [plain.Width, plain.Height]);
  assert.notDeepEqual(
    [...keyed.Image], [...plain.Image],
    "a colour key that changed nothing would produce identical bytes",
  );

  // A key matching no texel must leave the image byte-identical to the unkeyed import, which is
  // what proves the difference above came from the match rather than from the option being set.
  const absent = ImportTexture2D(image, "Sprites/Keyed", { R: 1, G: 2, B: 3 });
  assert.deepEqual(
    [...absent.Image], [...plain.Image],
    "keying a colour the image does not contain must change nothing",
  );

  // And the texel itself: the red one loses its alpha and becomes fully transparent, while the
  // other three keep theirs. Comparing container bytes alone would not say which texel moved.
  const decode = (bytes) => {
    const document = runtimeContent.CnbDocument.Parse(bytes, "keyed.cnb");
    try {
      const texture = runtimeContent.CnbTextureData.Decode(document);
      try {
        return [...texture.ReadLevel(0, 0)];
      } finally {
        texture.Dispose();
      }
    } finally {
      document.Dispose();
    }
  };
  const before = decode(plain.Image);
  const after = decode(keyed.Image);
  assert.equal(before.length, after.length);
  assert.equal(before[3], 255, "the red texel starts opaque");
  assert.equal(after[3], 0, "the keyed texel ends fully transparent");
  assert.deepEqual(
    after.slice(4), before.slice(4),
    "only the keyed texel changes; the other three are untouched",
  );
});

test("a WAV on disk compiles to a .cnb the runtime decodes with its exact samples", { skip }, () => {
  const rate = 8000;
  const frames = rate / 4;
  const view = new DataView(new ArrayBuffer(frames * 2));
  for (let index = 0; index < frames; index += 1) {
    view.setInt16(index * 2, (index * 7) % 32768 - 16384, true);
  }
  const samples = new Uint8Array(view.buffer);
  const wav = sourcePath("beep.wav", encodeWav(rate, samples));
  const imported = ImportSoundEffect(wav, "Audio/Beep");

  assert.equal(imported.Format, 1, "CnbAudioFormat.Pcm16");
  assert.equal(imported.SampleRate, rate);
  assert.equal(imported.Channels, 1);
  assert.equal(imported.FrameCount, frames);

  const compiled = path.join(workspace, "Beep.cnb");
  fs.writeFileSync(compiled, imported.Image);

  const document = runtimeContent.CnbDocument.Parse(fs.readFileSync(compiled), compiled);
  try {
    assert.equal(document.AssetType, runtimeContent.CnbAssetType.SoundEffect);
    assert.equal(document.Metadata.ContentName, "Audio/Beep");
    const decoded = runtimeContent.CnbSoundEffectData.Decode(document);
    try {
      // The bytes that were in the WAV are the bytes a game gets out of the compiled asset.
      assert.deepEqual([...decoded.ReadSamples()], [...samples]);
      assert.equal(decoded.Description.SampleRate, rate);
      assert.equal(decoded.Description.FrameCount, frames);
    } finally {
      decoded.Dispose();
    }
  } finally {
    document.Dispose();
  }
});

test("an unreadable or wrong-format source is refused rather than compiled", { skip }, () => {
  const missing = path.join(workspace, "not-here.png");
  assert.throws(
    () => ImportTexture2D(missing, "Sprites/Missing"),
    /cna_cnb_import_image_as_texture2d/,
    "a missing file must fail rather than produce an empty asset",
  );
  // A WAV handed to the image importer, and a PNG handed to the audio importer. Both files exist
  // and both are valid -- of the other kind -- so this catches an importer that ignores its format.
  const png = sourcePath("swap.png", encodePng(2, 2, TEXELS));
  const wav = sourcePath("swap.wav", encodeWav(8000, new Uint8Array(16)));
  assert.throws(() => ImportTexture2D(wav, "X"), /cna_cnb_import_image_as_texture2d/);
  assert.throws(() => ImportSoundEffect(png, "X"), /cna_cnb_import_wav_as_sound_effect/);
  // And a DDS importer given a PNG.
  assert.throws(() => ImportTextureCube(png, "X"), /cna_cnb_import_dds_as_texture_cube/);
});

test("the importers validate their arguments before reaching CNA", { skip }, () => {
  assert.throws(() => ImportTexture2D("", "X"), /imagePath must be a non-empty path/);
  assert.throws(() => ImportSoundEffect("", "X"), /wavPath must be a non-empty path/);
  assert.throws(() => ImportTextureCube("", "X"), /ddsPath must be a non-empty path/);
  const png = sourcePath("args.png", encodePng(2, 2, TEXELS));
  assert.throws(() => ImportTexture2D(png, 5), /contentName must be a string/);
  // A colour-key component outside 0-255 is refused rather than silently truncated to a byte.
  assert.throws(
    () => ImportTexture2D(png, "X", { R: 300, G: 0, B: 0 }),
    /colour-key component must be between 0 and 255/,
  );
  assert.throws(
    () => ImportTexture2D(png, "X", { R: -1, G: 0, B: 0 }),
    /colour-key component must be between 0 and 255/,
  );
});

test("a .cnj document compiles into a .cnb the runtime reads back", { skip }, () => {
  // `.cnj` is CNA's own source format for content, and this document is authored here from its
  // specification -- the values below are chosen, not produced by CNA, so what the runtime decodes
  // on the other side is evidence about the compiler rather than about CNA agreeing with itself.
  const directory = path.join(workspace, "cnj");
  fs.mkdirSync(directory, { recursive: true });
  const cnjPath = path.join(directory, "Ramp.cnj");
  fs.writeFileSync(cnjPath, JSON.stringify({
    cnjVersion: 1,
    type: "Curve",
    preLoop: "Constant",
    postLoop: "Linear",
    keys: [
      { position: 0, value: 2.5 },
      { position: 1, value: 7.5, continuity: "Step" },
      { position: 2.5, value: -1.25 },
    ],
  }));

  const compiled = CompileCnj(cnjPath);
  assert.equal(compiled.AssetTypeName, "Microsoft.Xna.Framework.Curve");
  assert.ok(compiled.Bytes.length > 0);
  assert.equal(runtimeContent.CnbFormat.HasMagic(compiled.Bytes), true, "what comes out is a .cnb");
  // The dependency list a build system watches: the document itself, as it was written in the
  // source rather than as an absolute path.
  assert.deepEqual([...compiled.AbsorbedFiles], ["Ramp.cnj"]);
  assert.deepEqual([...compiled.ExternalReferences], [], "an inline curve refers to nothing");

  // Decoded through the runtime package, which never saw the JSON.
  const document = runtimeContent.CnbDocument.Parse(compiled.Bytes, "Ramp.cnb");
  try {
    assert.equal(document.AssetType, compiled.AssetTypeId, "the two halves name the same type");
    assert.equal(document.Metadata.ContentName, "Ramp", "the content name defaults to the stem");
    const curve = runtimeContent.DecodeCnbCurve(document);
    // Constant is 0 and Linear is 4 in XNA's CurveLoopType; Step is 1 in CurveContinuity. Every
    // key differs from every other in position, value and continuity, so a dropped field or a
    // transposed pair changes a number here.
    assert.equal(curve.PreLoop, 0, "preLoop: Constant");
    assert.equal(curve.PostLoop, 4, "postLoop: Linear");
    assert.equal(curve.Keys.Count, 3);
    assert.deepEqual(
      [0, 1, 2].map((index) => {
        const key = curve.Keys.Get(index);
        return [key.Position, key.Value, key.Continuity];
      }),
      [[0, 2.5, 0], [1, 7.5, 1], [2.5, -1.25, 0]],
      "every key's position, value and continuity is the one the document declared",
    );
  } finally {
    document.Dispose();
  }

  // An explicit content name is recorded instead of the stem.
  const named = CompileCnj(cnjPath, directory, "Curves/Ramp");
  const namedDocument = runtimeContent.CnbDocument.Parse(named.Bytes, "Ramp.cnb");
  try {
    assert.equal(namedDocument.Metadata.ContentName, "Curves/Ramp");
  } finally {
    namedDocument.Dispose();
  }

  console.log(
    `CNA_TS_CONTENT_CNJ_CURVE=PASS TYPE=${compiled.AssetTypeName} BYTES=${compiled.Bytes.length} ` +
    `KEYS=3 ABSORBED=${compiled.AbsorbedFiles.join("|")}`,
  );
});

test("a .cnj document that names a sidecar absorbs it, and reports it", { skip }, () => {
  // The case the dependency list exists for: a document that points at a binary file beside it.
  // The PNG is written from the PNG specification by this suite, so the texels the runtime decodes
  // are the ones this test chose.
  const directory = path.join(workspace, "cnj-texture");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "atlas.png"), encodePng(2, 2, TEXELS));
  const cnjPath = path.join(directory, "Atlas.cnj");
  fs.writeFileSync(cnjPath, JSON.stringify({
    cnjVersion: 1,
    type: "Texture2D",
    sourceFile: "atlas.png",
  }));

  const compiled = CompileCnj(cnjPath);
  assert.equal(compiled.AssetTypeName, "Microsoft.Xna.Framework.Graphics.Texture2D");
  // Both files: the document and the sidecar it read. That is exactly the set a build system has
  // to watch to know when this asset is stale.
  assert.deepEqual(
    [...compiled.AbsorbedFiles].sort(), ["Atlas.cnj", "atlas.png"],
    "the compiler reports the sidecar it absorbed, not only the document",
  );

  const document = runtimeContent.CnbDocument.Parse(compiled.Bytes, "Atlas.cnb");
  try {
    const texture = runtimeContent.CnbTextureData.Decode(document);
    try {
      assert.deepEqual(
        [...texture.ReadLevel(0, 0)], [...TEXELS],
        "the four texels the PNG carried arrive through the compiler unchanged",
      );
    } finally {
      texture.Dispose();
    }
  } finally {
    document.Dispose();
  }

  console.log(
    `CNA_TS_CONTENT_CNJ_TEXTURE=PASS ABSORBED=${[...compiled.AbsorbedFiles].sort().join("|")} ` +
    "TEXELS=EXACT",
  );
});

test("the .cnj compiler refuses what it cannot express", { skip }, () => {
  const directory = path.join(workspace, "cnj-bad");
  fs.mkdirSync(directory, { recursive: true });

  // Each of these is refused *by CNA*, which is what the result code distinguishes: a message
  // match alone would also be satisfied by this package refusing before the call, and that is a
  // different failure with the same words in it.
  const refusedByCna = (body, what) => {
    try {
      body();
      assert.fail(`${what} was accepted`);
    } catch (error) {
      assert.equal(error.cnaResult, 5, `${what}: expected CNA's IO refusal, got ${error.message}`);
    }
  };

  // An asset type CNA has no schema for is refused rather than producing an empty file.
  const unsupported = path.join(directory, "Unsupported.cnj");
  fs.writeFileSync(unsupported, JSON.stringify({ cnjVersion: 1, type: "NotAThing" }));
  refusedByCna(() => CompileCnj(unsupported), "an unsupported asset type");

  // A document that names a sidecar which is not there.
  const missingSidecar = path.join(directory, "Missing.cnj");
  fs.writeFileSync(missingSidecar, JSON.stringify({
    cnjVersion: 1, type: "Texture2D", sourceFile: "absent.png",
  }));
  refusedByCna(() => CompileCnj(missingSidecar), "a missing sidecar");

  // A document that is not there at all.
  refusedByCna(() => CompileCnj(path.join(directory, "Nothing.cnj")), "a missing document");

  // And this package's own argument checks, which hold before any of that.
  for (const call of [
    () => CompileCnj(""),
    () => CompileCnj(7),
    () => CompileCnj(unsupported, 7),
    () => CompileCnj(unsupported, "", 7),
  ]) {
    assert.throws(call, TypeError, call.toString());
  }

  console.log("CNA_TS_CONTENT_CNJ_REFUSALS=PASS UNSUPPORTED_TYPE=REFUSED MISSING_SIDECAR=REFUSED");
});
