// SPDX-License-Identifier: MS-PL
//
// `SpriteFont.MeasureString`, checked against a second implementation rather than against numbers.
//
// This package measures text in TypeScript. The algorithm is short and has more corners than that
// suggests: a line's first glyph gets its left bearing clamped at zero while later glyphs get the
// raw value plus `Spacing`; the running width uses a *clamped* right bearing while the advance uses
// the raw one; a line's height is the tallest cropping rectangle rather than `LineSpacing`; `\r` is
// skipped and `\n` restarts the line. Hand-written expectations catch none of that reliably --
// whatever the implementation does becomes the expectation.
//
// So the font here is built with **negative and asymmetric kerning, unequal glyph heights and a
// non-zero Spacing**, precisely so those corners are load-bearing, and every string is measured
// twice: once by this package and once by CNA's own SpriteFont, built over the same texture and
// the same glyph table. The two share no code. Where they agree, neither is being trusted.

import assert from "node:assert/strict";
import path from "node:path";
import test, { after } from "node:test";

import {
  Game,
  Graphics,
  GraphicsDeviceManager,
  LoadNodeNativeBackend,
  Rectangle,
  Vector3,
} from "../dist/index.js";
import { CNA_ABI_MAJOR, CNA_ABI_MINOR } from "../dist/internal/abi.js";
import { createSpriteFontForInternalUse } from
  "../dist/Microsoft/Xna/Framework/Graphics/SpriteFont.js";
import { SpriteFontOracle } from "../dist/internal/sprite-font-oracle.js";
import {
  SPRITE_FONT_FIXTURE, SPRITE_FONT_STRINGS,
} from "./fixtures/sprite-font.mjs";
import { assertSpriteFontEvidence } from "./support/non-engine-oracle.mjs";

const library = process.env.CNA_NATIVE_LIBRARY;
if (!library) {
  throw new Error(
    `CNA_NATIVE_LIBRARY must name an existing CNA C ABI ${CNA_ABI_MAJOR}.${CNA_ABI_MINOR}.x shared library`,
  );
}

await LoadNodeNativeBackend({
  CnaLibrary: path.resolve(library),
  BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
});

/**
 * The font and the strings live in `test/fixtures/sprite-font.mjs`, shared with the browser suite.
 *
 * They were here, which meant the browser could not use them -- and a font whose exact bearings
 * *are* the point of the test is the worst possible thing to keep two copies of. `A` has a
 * negative left bearing and a positive right one; `j` has a negative *right* bearing, so the
 * clamped-width-versus-raw-advance distinction changes the answer; `.` is narrow with a tall
 * cropping box, so the line height cannot come from `LineSpacing` alone; `W` is wide.
 */
const GLYPHS = SPRITE_FONT_FIXTURE.Glyphs.map((glyph) => ({
  char: glyph.Character, bounds: glyph.Bounds, crop: glyph.Cropping, kern: glyph.Kerning,
}));
const LINE_SPACING = SPRITE_FONT_FIXTURE.LineSpacing;
const SPACING = SPRITE_FONT_FIXTURE.Spacing;

const evidence = Object.create(null);

class OracleProbeGame extends Game {
  constructor() {
    super();
    this.graphics = new GraphicsDeviceManager(this);
  }

  Draw(_gameTime) {
    const device = this.GraphicsDevice;
    const texture = new Graphics.Texture2D(device, 64, 16, false, Graphics.SurfaceFormat.Color);
    const font = createSpriteFontForInternalUse({
      Texture: texture,
      GlyphBounds: GLYPHS.map((g) => new Rectangle(...g.bounds)),
      Cropping: GLYPHS.map((g) => new Rectangle(...g.crop)),
      Characters: GLYPHS.map((g) => g.char),
      Kerning: GLYPHS.map((g) => new Vector3(...g.kern)),
      LineSpacing: LINE_SPACING,
      Spacing: SPACING,
      DefaultCharacter: "?",
    });
    const oracle = new SpriteFontOracle(font);
    try {
      // The same strings the browser suite measures, in the same order: empty, single glyphs,
      // pairs both ways round, several lines, a `\r\n`, runs of spaces, the fallback itself and an
      // absent character the fallback stands in for.
      const rows = SPRITE_FONT_STRINGS.map((text) => {
        const managed = font.MeasureString(text);
        const native = oracle.Measure(text);
        return {
          text,
          managed: [managed.X, managed.Y],
          native: [native.X, native.Y],
        };
      });
      evidence.info = oracle.Info;
      evidence.rows = rows;
      evidence.managedOnly = {
        // A font with no fallback must refuse an absent character rather than measure it as zero.
        absentWithoutFallback: (() => {
          const strict = createSpriteFontForInternalUse({
            Texture: texture,
            GlyphBounds: GLYPHS.map((g) => new Rectangle(...g.bounds)),
            Cropping: GLYPHS.map((g) => new Rectangle(...g.crop)),
            Characters: GLYPHS.map((g) => g.char),
            Kerning: GLYPHS.map((g) => new Vector3(...g.kern)),
            LineSpacing: LINE_SPACING,
            Spacing: SPACING,
            DefaultCharacter: null,
          });
          try { strict.MeasureString("Z"); return "MEASURED"; }
          catch (error) { return error?.constructor?.name; }
        })(),
      };
    } catch (error) {
      evidence.failed = `${error?.constructor?.name}: ${error?.message}`;
    } finally {
      oracle.Dispose();
      texture.Dispose();
    }
    this.Exit();
  }
}

{
  const game = new OracleProbeGame();
  await game.Run();
  game.Dispose();
}

test("the Node backend's sprite-font evidence satisfies the shared oracle", () => {
  assert.equal(evidence.failed, undefined, `the probe failed: ${evidence.failed}`);
  // The same function the browser suite applies to its own run: the font's configuration
  // round-tripping, nineteen strings on which the two implementations agree exactly, and five on
  // which they differ by exactly the trailing bearing of upstream finding 27. Two backends, one
  // set of expectations.
  assertSpriteFontEvidence({ info: evidence.info, rows: evidence.rows });
});

test("the oracle was built from the managed font's own configuration", () => {
  assert.equal(evidence.failed, undefined, `the probe failed: ${evidence.failed}`);
  const info = evidence.info;
  assert.equal(
    info.CharacterCount, GLYPHS.length,
    "CNA holds every glyph the managed font holds -- checked before its answers are trusted",
  );
  assert.equal(info.LineSpacing, LINE_SPACING);
  assert.ok(
    Math.abs(info.Spacing - SPACING) < 1e-6,
    `spacing round-trips: ${info.Spacing}`,
  );
  assert.equal(info.HasDefaultCharacter, true);
  assert.equal(info.DefaultCharacter, "?".codePointAt(0));
});

/**
 * The strings whose widest line ends in `j`, the only glyph here with a negative right side
 * bearing. They are the entire divergence set, and the difference is exactly that bearing's
 * magnitude -- see the test below and upstream finding 27.
 */
const TRAILING_NEGATIVE_BEARING = new Set(["j", "Aj", "jj", "A.j", "AZj"]);
const NEGATIVE_BEARING = 3;

test("the two implementations agree everywhere the trailing bearing is not negative", () => {
  assert.equal(evidence.failed, undefined);
  const disagreements = evidence.rows
    .filter((row) => !TRAILING_NEGATIVE_BEARING.has(row.text))
    .filter((row) => Math.abs(row.managed[0] - row.native[0]) > 1e-4
      || Math.abs(row.managed[1] - row.native[1]) > 1e-4);
  assert.deepEqual(
    disagreements, [],
    "MeasureString and CNA's own SpriteFont share no code, so a disagreement outside the one " +
    "known divergence is a defect in one of them rather than a number to update",
  );
  assert.ok(
    evidence.rows.length - TRAILING_NEGATIVE_BEARING.size >= 15,
    "and the agreement covers many strings, not a handful",
  );
});

test("upstream finding 27: CNA counts a negative trailing bearing into the width", () => {
  assert.equal(evidence.failed, undefined);
  const diverging = evidence.rows.filter((row) => TRAILING_NEGATIVE_BEARING.has(row.text));
  assert.equal(diverging.length, TRAILING_NEGATIVE_BEARING.size, "every named string was measured");
  for (const row of diverging) {
    assert.ok(
      Math.abs((row.managed[0] - row.native[0]) - NEGATIVE_BEARING) < 1e-4,
      `${JSON.stringify(row.text)} differs by exactly the bearing's magnitude: ` +
      `${row.managed[0]} vs ${row.native[0]}`,
    );
    assert.ok(
      Math.abs(row.managed[1] - row.native[1]) < 1e-4,
      "and only in width -- the height is unaffected, which is what makes this one rule",
    );
  }
  // Which of the two is XNA's is not a matter of opinion here. Microsoft.Xna.Framework.Graphics.dll
  // was disassembled: SpriteFont::InternalMeasure carries each glyph's right side bearing forward
  // in a local, adds it *unclamped* before the next glyph on the same line, and adds it
  //     size.X = size.X + Math.Max(pendingZ, 0f)
  // at every line break and once more at IL_015C after the loop. So the trailing bearing is
  // clamped at zero, which is what this package does and what CNA does not -- CNA adds
  // `cKern.Y + cKern.Z` for every glyph including the last.
  //
  // These assertions therefore pin a CNA defect, not a choice. If CNA is repaired they fail, and
  // the one above starts covering these strings too.
  const single = evidence.rows.find((row) => row.text === "j");
  assert.deepEqual(
    single.managed, [7, 16],
    "a lone 'j' is its clamped left bearing (1) plus its width (6), with its -3 right bearing " +
    "clamped away -- 7, which is what XNA's IL computes",
  );
  assert.deepEqual(
    single.native, [4, 16],
    "while CNA answers 4, having subtracted the 3",
  );
});

test("the fixture is not vacuous: the awkward cases produce distinct answers", () => {
  assert.equal(evidence.failed, undefined);
  const byText = Object.create(null);
  for (const row of evidence.rows) byText[row.text] = row.managed;

  // If every string measured the same, the agreement above would mean nothing.
  const widths = new Set(evidence.rows.map((row) => row.managed[0]));
  assert.ok(widths.size >= 10, `the strings measure to many different widths: ${widths.size}`);

  assert.deepEqual(byText[""], [0, 0], "an empty string is zero by zero");
  assert.ok(byText["A"][0] > 0);
  assert.notDeepEqual(
    byText["Aj"], byText["jA"],
    "order matters, because the first glyph of a line is treated differently from the rest -- " +
    "two strings of the same glyphs must not measure the same",
  );
  assert.ok(
    byText["A\nj"][1] > byText["A"][1],
    "a second line is taller than one",
  );
  assert.deepEqual(
    byText["A\r\nj"], byText["A\nj"],
    "a carriage return is skipped rather than measured",
  );
  assert.ok(
    byText["A\n\nW"][1] > byText["A\nj"][1],
    "and an empty line still takes a line's height",
  );
  assert.deepEqual(
    byText["Z"], byText["?"],
    "an absent character measures as the fallback, because that is what it is drawn as",
  );
  assert.ok(
    byText["."][1] > LINE_SPACING,
    "a glyph whose cropping box is taller than the line spacing raises the line height -- which " +
    `is why the height is not simply LineSpacing: ${byText["."][1]} > ${LINE_SPACING}`,
  );
});

test("without a fallback an absent character is refused, not measured as nothing", () => {
  assert.equal(evidence.managedOnly.absentWithoutFallback, "ArgumentException");
});
