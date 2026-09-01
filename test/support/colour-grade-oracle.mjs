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

  // --- the chain ---------------------------------------------------------------------------------
  const chain = grade.chain;
  assert.equal(chain.emptyCount, 0, "a fresh chain holds no passes");
  assert.equal(chain.oneCount, 1);
  assert.equal(chain.twoCount, 2);
  assert.equal(chain.clearedCount, 0, "Clear releases the chain's hold on its passes");

  // One pass through the chain is the same picture the pass alone produces, so the chain adds
  // nothing of its own to a single-pass run.
  eachTexel(chain.once, source, rotated, "a one-pass chain", 1);
  // Two are the rotation composed with itself: (r,g,b) -> (b,r,g) -> (g,b,r). This is the
  // assertion the chain exists for. A chain that ran one pass lands on `once`; a chain that ran
  // both but discarded the intermediate lands on `once` too; only a real ping-pong between two
  // targets lands here. Two eight-bit hops, so two bytes of slack -- and the three permutations of
  // this gradient are tens apart.
  const twice = (texel) => rotated(rotated(texel));
  eachTexel(chain.twice, source, twice, "a two-pass chain, composed in order", 2);
  assert.notDeepEqual(
    chain.twice, chain.once,
    "the rotation is not an involution, so running it twice must not look like running it once",
  );
  // Resetting the pooled intermediates is a cache drop, not a state change.
  eachTexel(chain.afterReset, source, twice, "the same chain after ResetTargets", 2);

  assert.equal(chain.timingDefault, false, "GPU timing is off until asked for");
  assert.equal(typeof chain.timingEnabled, "boolean");
  assert.ok(Array.isArray(chain.timings), "the chain answers a timing list");
  if (chain.timingEnabled) {
    assert.equal(chain.timings.length, 2, "one timing per pass the chain ran");
    for (const timing of chain.timings) {
      assert.equal(typeof timing.Name, "string");
      assert.ok(Number.isFinite(timing.Milliseconds), "a timing carries a finite duration");
      assert.ok(timing.SampleCount >= 0, "and a sample count, zero for an untimed pass");
    }
  } else {
    // WebGL2 has no disjoint-timer query in every browser, and CNA reports the refusal through the
    // getter rather than by throwing. Recorded as measured rather than asserted away.
    assert.deepEqual(chain.timings, [], "a chain that could not enable timing reports none");
  }

  // --- the tonemapper, checked by CNA against itself ---------------------------------------------
  //
  // The rendered image against `TonemapPass.TonemapChannel`, CNA's own pure scalar of the same
  // arithmetic its shader does. Two implementations of one specification, reached by two different
  // routes -- not a picture compared to a picture taken earlier.
  const tonemap = grade.tonemap;
  assert.equal(tonemap.rendered.length, tonemap.modes.length);
  for (let mode = 0; mode < tonemap.modes.length; mode += 1) {
    const rendered = tonemap.rendered[mode];
    const expected = tonemap.expected[mode];
    for (let index = 0; index < rendered.length; index += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        assert.ok(
          Math.abs(rendered[index][channel] - expected[index][channel]) <= 1,
          `tonemap mode ${tonemap.modes[mode]} texel ${index} channel ${channel}: rendered ` +
          `${rendered[index][channel]}, CNA's own scalar says ${expected[index][channel]}`,
        );
      }
    }
  }
  // The two modes are two different curves, so the assertions above are two assertions.
  assert.notDeepEqual(
    tonemap.rendered[0], tonemap.rendered[1],
    "None and Reinhard must not produce the same image, or comparing each to its own scalar " +
    "proves only that the scalar was consulted twice",
  );
  // The scalar itself is a tone curve: monotone, fixing zero, and compressing rather than scaling.
  const curve = tonemap.scalar;
  assert.equal(curve[0], 0, "Reinhard fixes zero");
  for (let index = 1; index < curve.length; index += 1) {
    assert.ok(curve[index] > curve[index - 1], "and is strictly increasing");
    assert.ok(curve[index] < 1.0001, "and never exceeds one, which is what tone mapping is for");
  }
  assert.ok(curve[3] < 1 && curve[3] > 0.4, `Reinhard of 1 compresses rather than clips: ${curve[3]}`);
  assert.equal(tonemap.state.deband, false, "dithering was off, so the curve is the only change");
  assert.ok(Math.abs(tonemap.state.exposure - 1.5) < 1e-6, "exposure round-trips through CNA");

  // --- the passes that must change something -----------------------------------------------------
  const passes = grade.passes;
  for (const name of ["blit", "bloom", "fxaa", "aberration", "grain"]) {
    const pass = passes[name];
    assert.ok(pass, `${name} produced no evidence`);
    assert.equal(pass.failed ?? null, null, `${name}: ${pass.failed}`);
    assert.equal(typeof pass.name, "string");
    assert.ok(pass.name.length > 0, `${name} names itself`);
    assert.equal(pass.supported, true, `${name} reports itself supported on this device`);
    assert.equal(pass.pixels.length, 16);
  }
  // A blit is the identity, and the others are not: exact pixels are not the claim for a blur
  // kernel or an edge filter, but "it ran and changed the image" is, and a pass that quietly did
  // nothing would be indistinguishable from the blit.
  eachTexel(passes.blit.pixels, source, (texel) => texel, "the blit pass");
  for (const name of ["bloom", "aberration", "grain"]) {
    assert.notDeepEqual(
      passes[name].pixels, passes.blit.pixels,
      `${name} at a real setting must change the image`,
    );
  }
  assert.ok(Math.abs(passes.bloom.state.threshold - 0.5) < 1e-6, "bloom's threshold round-trips");
  assert.equal(passes.bloom.state.iterations, 1);
  assert.ok(Math.abs(passes.fxaa.state.edgeThreshold - 0.25) < 1e-6);
  assert.ok(
    Math.abs(passes.aberration.state.strength - 0.05) < 1e-6,
    `an in-range aberration strength round-trips: ${passes.aberration.state.strength}`,
  );
  // And CNA clamps this one, which a test that only ever set an in-range value would never find.
  // Measured, and confirmed in ChromaticAberrationPass.cpp: `std::clamp(value, 0.0f, 0.1f)`.
  assert.ok(
    Math.abs(passes.aberration.state.clampedFrom025 - 0.1) < 1e-6,
    `0.25 is clamped to CNA's 0.1 ceiling, not stored: ${passes.aberration.state.clampedFrom025}`,
  );
  assert.ok(Math.abs(passes.grain.state.intensity - 0.5) < 1e-6);

  // The pure presets and the bright-pass scalar. A threshold of 0.5 passes nothing below it and
  // the excess above it, which is what a bright pass is.
  const presets = passes.presets;
  // Not a hard threshold: CNA's bright pass has a soft knee half the threshold wide, squared, and
  // scales the value by it. Restated here from `BloomPass.cpp` rather than pinned as five numbers,
  // so a change to the curve fails with the curve rather than with a constant nobody can check.
  const brightPass = (value, threshold) => {
    const knee = Math.max(threshold * 0.5, 1e-4);
    const contribution = Math.min(Math.max((value - threshold + knee) / (2 * knee), 0), 1);
    return value * contribution * contribution;
  };
  [0, 0.25, 0.5, 0.75, 1].forEach((value, index) => {
    assert.ok(
      Math.abs(presets.extract[index] - brightPass(value, 0.5)) < 1e-6,
      `the bright pass of ${value} at threshold 0.5 is ${brightPass(value, 0.5)}, ` +
      `CNA answered ${presets.extract[index]}`,
    );
  });
  // And the shape that makes it a bright pass at all: nothing survives well below the threshold,
  // everything survives well above it, and the knee is in between rather than a step.
  assert.equal(presets.extract[0], 0, "black contributes nothing");
  assert.ok(presets.extract[2] > 0 && presets.extract[2] < 0.5, "the threshold itself is the knee");
  assert.ok(presets.extract[4] > presets.extract[3], "and brighter values contribute more");
  assert.ok(
    presets.bloomIterations.every((value, index, all) => index === 0 || value >= all[index - 1]),
    `higher quality asks for at least as many iterations: ${presets.bloomIterations}`,
  );
  assert.ok(presets.fxaaThresholds.every((value) => value > 0 && value < 1));
  assert.ok(presets.fxaaGlslLength > 100, "the FXAA fragment source is a real shader");
  assert.match(presets.fxaaGlslHead, /\S/, "and it is text");

  // --- the instancing stream's layout ------------------------------------------------------------
  // CNA documents this declaration exactly -- "four Vector4 elements at TextureCoordinate usage
  // indices one through four, sixty-four bytes in total" -- so it is asserted rather than recorded,
  // and a caller who built a stream to match would find out here if the layer ever changed it.
  const streams = grade.instanceStreams;
  assert.equal(streams.transformStride, 64, "four rows of four floats fill the transform stride");
  assert.deepEqual(
    streams.transformElements,
    // offset, VertexElementFormat.Vector4 (3), VertexElementUsage.TextureCoordinate (2), index
    [[0, 3, 2, 1], [16, 3, 2, 2], [32, 3, 2, 3], [48, 3, 2, 4]],
    "the transform stream is four Vector4s at TextureCoordinate 1..4, packed with no gaps",
  );
  assert.deepEqual(
    streams.tintElements,
    // VertexElementFormat.Color (4), VertexElementUsage.Color (1), index 1
    [[0, 4, 1, 1]],
    "and the tint stream is one Color at Color index 1",
  );
  assert.equal(streams.tintStride, 4, "which is four bytes");

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
