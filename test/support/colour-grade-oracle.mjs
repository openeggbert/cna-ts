// SPDX-License-Identifier: MS-PL

/**
 * The colour-grade expectation, shared by the two browser suites that assert it.
 *
 * Written as arithmetic rather than as a recorded run, and that is the whole reason this family
 * was the first of CNA's engine layer bound to WebAssembly. The table the page builds is a size-2
 * `.cube` whose transfer is the channel rotation `(r,g,b) -> (b,r,g)`. That map is linear in each
 * channel, so trilinear interpolation of its eight corners reproduces it *exactly* for every input
 * -- which means every graded texel below is predicted from the source and the rotation, and a
 * pass that graded with the wrong table, sampled the strip's slices in the wrong order, or blended
 * at the wrong strength is out by tens rather than by a rounding step.
 *
 * The same expectation the windowed OPENGLES3 suite is held to, and the same one-byte tolerance,
 * for the reason recorded there: two rasterizers disagree by one on a sampled texel because
 * trilinear filtering and the float-to-unorm8 conversion round differently near a boundary.
 */

import assert from "node:assert/strict";

const N = 4;

/** `(r,g,b) -> (b,r,g)`, alpha untouched. */
const rotated = ([r, g, b, a]) => [b, r, g, a];

/**
 * Asserts every texel of a 4x4 result against a prediction computed from the source texel.
 *
 * @param actual   the texels read back, as [R,G,B,A]
 * @param source   the source texels the prediction is computed from
 * @param expect   source texel -> expected texel
 * @param label    what is being asserted, for the message
 * @param tolerance per-channel slack in bytes
 */
function eachTexel(actual, source, expect, label, tolerance = 0) {
  assert.ok(Array.isArray(actual), `${label}: no texels were produced: ${actual}`);
  assert.equal(actual.length, N * N, `${label}: ${N * N} texels`);
  for (let index = 0; index < actual.length; index += 1) {
    const expected = expect(source[index]);
    for (let channel = 0; channel < 4; channel += 1) {
      assert.ok(
        Math.abs(actual[index][channel] - expected[channel]) <= tolerance,
        `${label} texel ${index % N},${Math.floor(index / N)} channel ${channel}: ` +
        `${actual[index][channel]} vs ${expected[channel]} (source ${source[index].join(",")})`,
      );
    }
  }
}

/** Asserts the whole colour-grade scenario. */
export function assertColourGradeEvidence(grade) {
  assert.equal(
    grade.evidenceError ?? null, null,
    "the engine layer was present and the scenario failed, which is a cna-ts defect rather than " +
    "a missing CNA build option",
  );
  const source = grade.source;

  // The control. A blit is the identity, so anything it changes would be attributed to the grade
  // below and every prediction there would be measuring two things at once.
  eachTexel(grade.blit, source, (texel) => texel, "a straight blit through the fullscreen pass");

  // --- the table, before a pixel is drawn -------------------------------------------------------
  assert.equal(grade.lut.title, "rotate", "the .cube TITLE survives the parse");
  assert.equal(grade.lut.size, 2);
  assert.equal(grade.lut.unitDomain, true, "no DOMAIN_MIN/MAX was written, so the domain is [0,1]");
  // Read back out of CNA rather than from the text the page wrote: a parser that reordered or
  // dropped entries is visible here rather than as an unexplained pixel.
  const corners = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  assert.deepEqual(
    grade.lut.entries, corners.map(([r, g, b]) => [b, r, g]),
    "every entry comes back as the rotation of its own coordinate, in order",
  );
  assert.deepEqual(grade.lut.stripSize, [4, 2], "a size-2 cube is a 4x2 strip: two 2x2 slices");
  assert.deepEqual(grade.lut.volumeSize, [2, 2, 2], "and a 2x2x2 volume");
  assert.equal(grade.lut.sizeForStrip, 2, "and a 4x2 strip describes a size-2 cube");

  // --- the pixels -------------------------------------------------------------------------------
  eachTexel(grade.grade.fullStrip, source, rotated, "the strip LUT at full strength", 1);
  eachTexel(grade.grade.fullVolume, source, rotated, "the volume LUT at full strength", 1);
  // The same table by two genuinely different routes: a 4x2 strip sampled as a 2D texture with the
  // slice blend done in the shader, and a 2x2x2 volume sampled with hardware trilinear filtering.
  // A byte is the tolerance for "the same table"; a strip whose slices were indexed wrongly would
  // be out by tens.
  for (let index = 0; index < grade.grade.fullStrip.length; index += 1) {
    for (let channel = 0; channel < 4; channel += 1) {
      assert.ok(
        Math.abs(grade.grade.fullStrip[index][channel] - grade.grade.fullVolume[index][channel]) <= 1,
        "the same table as a strip and as a volume must grade to the same pixels: texel " +
        `${index} channel ${channel} is ${grade.grade.fullStrip[index][channel]} as a strip and ` +
        `${grade.grade.fullVolume[index][channel]} as a volume`,
      );
    }
  }
  // Strength is a lerp between the source and the graded result, so half is exactly the midpoint.
  eachTexel(
    grade.grade.half, source,
    (texel) => {
      const target = rotated(texel);
      return texel.map((value, channel) => Math.round((value + target[channel]) / 2));
    },
    "the strip LUT at half strength", 1,
  );
  eachTexel(grade.grade.zeroStrength, source, (texel) => texel, "a LUT at zero strength");
  eachTexel(grade.grade.noLut, source, (texel) => texel, "a grade with no LUT at all");
  // The rotation is not the identity, so the five assertions above are five different assertions.
  assert.notDeepEqual(grade.grade.fullStrip, grade.grade.zeroStrength);
  assert.notDeepEqual(grade.grade.half, grade.grade.fullStrip);
  assert.notDeepEqual(grade.grade.half, grade.grade.zeroStrength);

  // --- the state a pixel cannot reach ----------------------------------------------------------
  assert.equal(typeof grade.state.name, "string");
  assert.ok(grade.state.name.length > 0, "the pass names itself");
  assert.equal(grade.state.supported, true, "and reports itself supported on this device");
  assert.deepEqual(grade.state.hasNothing, [false, false]);
  assert.deepEqual(grade.state.hasStrip, [true, false]);
  assert.deepEqual(grade.state.hasBoth, [true, true]);
  assert.deepEqual(
    grade.state.hasNeitherAgain, [false, false],
    "setting null detaches the table rather than keeping the previous one",
  );
  assert.equal(grade.state.interpolation, 1, "LutInterpolation.Tetrahedral round-trips");
  assert.ok(
    Math.abs(grade.state.strength - 0.375) < 1e-6,
    `Strength round-trips through CNA as a float: ${grade.state.strength}`,
  );
}
