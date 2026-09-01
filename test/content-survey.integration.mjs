// SPDX-License-Identifier: MS-PL
//
// CNA's content survey: what is under a content root, and which XNB readers it needs.
//
// The evidence has to be stronger than "the routes returned success", so this test *builds the
// content root it surveys*. Every `.xnb` here is written by the same fixtures the XNB reader tests
// use, which means the test already knows the exact reader names each file declares — so the
// survey's answer is checked against an independently known truth rather than against itself.
//
// What is deliberately not tested, because it is deliberately not projected: loading. CNA's
// content manager has a cache and an asset identity of its own, and the strict `ContentManager`
// already owns both. See docs/native-content-survey.md.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import {
  Game,
  Graphics,
  GraphicsDeviceManager,
  LoadNodeNativeBackend,
} from "../dist/index.js";
import { CNA_ABI_MAJOR, CNA_ABI_MINOR } from "../dist/internal/abi.js";
import {
  ContentSurvey,
  IsContentTypeReaderRegisteredWithCna,
} from "../dist/extensions/content/index.js";
import { compressedXnb, modelXnb, spriteFontXnb, textureXnb } from "./fixtures/xnb.mjs";

const library = process.env.CNA_NATIVE_LIBRARY;
if (!library) {
  throw new Error(
    `CNA_NATIVE_LIBRARY must name an existing CNA C ABI ${CNA_ABI_MAJOR}.${CNA_ABI_MINOR}.x shared library`,
  );
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-content-survey-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));

// One texture, one font, one model, plus a compressed twin and a loose file beside an asset — so
// the survey has every distinction it claims to make something to make it on.
fs.mkdirSync(path.join(root, "Textures"), { recursive: true });
fs.writeFileSync(path.join(root, "Textures", "Atlas.xnb"), Buffer.from(textureXnb()));
fs.writeFileSync(path.join(root, "Textures", "Atlas.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
fs.writeFileSync(path.join(root, "Font.xnb"), Buffer.from(spriteFontXnb()));
fs.mkdirSync(path.join(root, "Models"), { recursive: true });
fs.writeFileSync(path.join(root, "Models", "Triangle.xnb"), Buffer.from(modelXnb()));
fs.writeFileSync(
  path.join(root, "Models", "TriangleLzx.xnb"), Buffer.from(compressedXnb(modelXnb())),
);

await LoadNodeNativeBackend({
  CnaLibrary: path.resolve(library),
  BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
});

const evidence = Object.create(null);
function record(name, action) {
  try { evidence[name] = action(); }
  catch (error) { evidence[name] = { failed: `${error?.constructor?.name}: ${error?.message}` }; }
}

class SurveyProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
  }

  Draw(_gameTime) {
    const device = this.GraphicsDevice;

    record("survey", () => {
      const found = new ContentSurvey(device, root);
      try {
        const entries = found.Entries;
        const byName = Object.create(null);
        for (const entry of entries) byName[entry.AssetName] = entry;
        return {
          root: found.Root,
          count: found.Count,
          entryCount: entries.length,
          names: entries.map((entry) => entry.AssetName).sort(),
          byName,
          usage: [...found.ReaderUsage],
          disposedTwice: (() => { found.Dispose(); found.Dispose(); return true; })(),
          isDisposed: found.IsDisposed,
        };
      } finally {
        found.Dispose();
      }
    });

    record("emptyRoot", () => {
      const empty = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-empty-"));
      const found = new ContentSurvey(device, empty);
      try {
        return { count: found.Count, usage: found.ReaderUsage.length };
      } finally {
        found.Dispose();
        fs.rmSync(empty, { recursive: true, force: true });
      }
    });

    record("rootChange", () => {
      const found = new ContentSurvey(device, root);
      try {
        const before = found.Count;
        const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-elsewhere-"));
        fs.writeFileSync(path.join(elsewhere, "Only.xnb"), Buffer.from(textureXnb()));
        found.Root = elsewhere;
        found.Refresh();
        const after_ = found.Count;
        const names = found.Entries.map((entry) => entry.AssetName);
        const reportedRoot = found.Root;
        fs.rmSync(elsewhere, { recursive: true, force: true });
        return { before, after: after_, names, rootFollowed: reportedRoot === elsewhere };
      } finally {
        found.Dispose();
      }
    });

    record("registry", () => ({
      spriteFont: IsContentTypeReaderRegisteredWithCna(
        "Microsoft.Xna.Framework.Content.SpriteFontReader",
      ),
      texture: IsContentTypeReaderRegisteredWithCna(
        "Microsoft.Xna.Framework.Content.Texture2DReader",
      ),
      invented: IsContentTypeReaderRegisteredWithCna("Nothing.Reads.This, Nowhere"),
      empty: IsContentTypeReaderRegisteredWithCna(""),
    }));

    record("refusals", () => {
      const results = {};
      try { new ContentSurvey(null, root); results.nullDevice = "ACCEPTED"; }
      catch (error) { results.nullDevice = error?.constructor?.name; }
      try { new ContentSurvey(device, 42); results.numericRoot = "ACCEPTED"; }
      catch (error) { results.numericRoot = error?.constructor?.name; }
      const found = new ContentSurvey(device, root);
      try { found.Get(9999); results.outOfRange = "ACCEPTED"; }
      catch (error) { results.outOfRange = error?.constructor?.name; }
      found.Dispose();
      try { found.Count; results.afterDispose = "ANSWERED"; }
      catch (error) { results.afterDispose = error?.constructor?.name; }
      return results;
    });

    this.Exit();
  }
}

{
  const game = new SurveyProbeGame();
  await game.Run();
  game.Dispose();
}

function claim(name) {
  const value = evidence[name];
  assert.ok(
    value != null && value.failed == null,
    `the "${name}" measurement did not run: ${value?.failed ?? "absent"}`,
  );
  return value;
}

test("the survey finds every asset the test wrote, by its ContentManager asset name", () => {
  const seen = claim("survey");
  assert.equal(seen.root, root, "the survey reports the root it was given");
  assert.equal(seen.count, seen.entryCount);
  assert.deepEqual(
    seen.names,
    ["Font", "Models/Triangle", "Models/TriangleLzx", "Textures/Atlas"],
    "asset names are the keys ContentManager.Load addresses, extension stripped and " +
    "subdirectories kept -- not file names",
  );
  assert.equal(
    seen.byName["Textures/Atlas"].HasXnb, true,
    "a compiled asset is reported as having one",
  );
  assert.deepEqual(
    seen.byName["Textures/Atlas"].NativeExtensions, [".png"],
    "and the loose .png this test put beside it is reported separately from the .xnb",
  );
  assert.equal(seen.byName["Font"].HasCnj, false, "nothing here is a .cnj document");
});

test("each asset's XNB reader names are the ones its header actually declares", () => {
  const seen = claim("survey");
  // The fixtures build these reader tables, so the expected names are known independently of
  // whatever the survey answers.
  assert.deepEqual(
    seen.byName["Textures/Atlas"].XnbReaderNames,
    ["Microsoft.Xna.Framework.Content.Texture2DReader"],
    "a texture declares exactly one reader",
  );
  assert.deepEqual(
    seen.byName["Models/Triangle"].XnbReaderNames,
    [
      "Microsoft.Xna.Framework.Content.ModelReader",
      "Microsoft.Xna.Framework.Content.StringReader",
      "Microsoft.Xna.Framework.Content.VertexBufferReader",
      "Microsoft.Xna.Framework.Content.IndexBufferReader",
      "Microsoft.Xna.Framework.Content.BasicEffectReader",
    ],
    "and a model declares its five, in the order the fixture writes them",
  );
  assert.ok(
    seen.byName["Font"].XnbReaderNames.includes(
      "Microsoft.Xna.Framework.Content.SpriteFontReader",
    ),
    "the font declares the SpriteFont reader",
  );
});

test("a compressed XNB is found, but its reader names are not -- a limitation, asserted", () => {
  const seen = claim("survey");
  const compressed = seen.byName["Models/TriangleLzx"];
  const plain = seen.byName["Models/Triangle"];
  assert.equal(compressed.HasXnb, true, "the LZX-compressed twin is still a compiled asset");
  assert.deepEqual(
    compressed.XnbReaderNames, [],
    "the reader table of a compressed .xnb lives inside the compressed payload, and the survey " +
    "reads headers without decompressing, so it reports none. The uncompressed twin of the very " +
    "same model reports five, which is what makes this a property of the compression rather " +
    "than of the file",
  );
  assert.equal(
    plain.XnbReaderNames.length, 5,
    "the same content, uncompressed, does report its readers",
  );
});

test("reader usage counts distinct readers across the whole root", () => {
  const seen = claim("survey");
  const byReader = Object.create(null);
  for (const usage of seen.usage) byReader[usage.ReaderName] = usage;
  const texture = byReader["Microsoft.Xna.Framework.Content.Texture2DReader"];
  assert.ok(texture, `Texture2DReader must appear: ${seen.usage.map((u) => u.ReaderName)}`);
  assert.ok(
    texture.FileCount >= 2,
    "the texture reader is wanted by the atlas and by the model's effect, so more than one file " +
    `references it: ${texture.FileCount}`,
  );
  assert.equal(
    texture.IsRegisteredWithCna, true,
    "and CNA has a reader for it, which is the half of the question this answers",
  );
  assert.equal(
    new Set(seen.usage.map((usage) => usage.ReaderName)).size, seen.usage.length,
    "each reader name appears once however many files want it",
  );
});

test("an empty root surveys to nothing rather than failing", () => {
  const seen = claim("emptyRoot");
  assert.equal(seen.count, 0);
  assert.equal(seen.usage, 0);
});

test("changing the root re-points the survey at a different directory", () => {
  const seen = claim("rootChange");
  assert.equal(seen.before, 4, "the original root holds the four assets this test wrote");
  assert.equal(seen.rootFollowed, true, "Root reads back what was set");
  assert.equal(seen.after, 1, "and the new one holds exactly the one asset put there");
  assert.deepEqual(seen.names, ["Only"]);
});

test("CNA's own reader registry answers by name", () => {
  const seen = claim("registry");
  assert.equal(seen.spriteFont, true);
  assert.equal(seen.texture, true);
  assert.equal(
    seen.invented, false,
    "a name nothing reads answers false rather than throwing, so the question is safe to ask " +
    "about every name a survey turns up",
  );
  assert.equal(seen.empty, false);
});

test("bad arguments are refused here, by name", () => {
  const seen = claim("refusals");
  assert.equal(seen.nullDevice, "ArgumentNullException");
  assert.equal(seen.numericRoot, "TypeError");
  assert.equal(seen.outOfRange, "ArgumentException");
  assert.equal(seen.afterDispose, "ObjectDisposedException");
});
