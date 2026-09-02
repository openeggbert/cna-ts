// SPDX-License-Identifier: MS-PL

/**
 * What the rest of the post-process family must answer, shared by both browser suites.
 *
 * Nothing here is a number read off a previous run. Every expectation is either restated from
 * CNA's own source -- named at the assertion, so a reader can check it -- or recomputed here from
 * the same specification by different code:
 *
 *   circle of confusion   `DepthOfFieldPass.cpp`, the thin-lens term in `cnaCircleOfConfusionMm`
 *   SSAO sample counts    `SsaoPass::sampleCountForQuality`
 *   SSAO kernel           `SsaoPass.cpp`'s Van der Corput sequence, reimplemented below
 *   air mass              `airMassForDistance` and its Kasten-Young ceiling
 *   transmittance         `AerialPerspectivePass::transmittance`, Rayleigh plus a turbidity Mie
 *   optical depth         `HeightFogPass::opticalDepth`, both of its branches
 *   contact occlusion     `ContactShadowPass::isOccluded`, whose bounds are **both strict**
 *   ASCII quantization    `AsciiQuantizer.cpp` and `AsciiPostProcessEffect::draw`
 *
 * The SSAO kernel is the sharpest of them: it is a deterministic low-discrepancy sequence, so 64
 * vectors can be produced here and compared component by component to the ones the shader will
 * really sample. That is not "the kernel looks like a hemisphere" -- it is the same sequence,
 * twice, in two languages.
 */

import assert from "node:assert/strict";

/** Float32 has ~7 decimal digits; every comparison below is against a float CNA computed. */
const EPSILON = 1e-6;

function near(actual, expected, message, epsilon = EPSILON) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon * Math.max(1, Math.abs(expected)),
    `${message}: got ${actual}, expected ${expected}`,
  );
}

// --- CNA's arithmetic, reimplemented -------------------------------------------------------------

/** `DepthOfFieldPass.cpp`: the thin-lens diameter in millimetres, zero at or inside the focus. */
export function circleOfConfusionMillimetres(depth, focusDistance, focalLength, fNumber) {
  if (depth <= 0 || focusDistance <= 0 || fNumber <= 0) return 0;
  const focusMm = focusDistance * 1000;
  const depthMm = depth * 1000;
  if (focusMm <= focalLength) return 0;
  return (focalLength * focalLength / (fNumber * (focusMm - focalLength)))
    * Math.abs(depthMm - focusMm) / depthMm;
}

/** `AerialPerspectivePass.cpp`'s Kasten-Young air mass at the zenith angle of `upwards`. */
function airMassAlongDirection(upwards) {
  const up = Math.min(Math.max(upwards, 0), 1);
  const zenithDegrees = Math.acos(up) * 57.29577951308232;
  return 1 / Math.max(
    up + 0.50572 * Math.pow(Math.max(96.07995 - zenithDegrees, 1e-3), -1.6364), 1e-4);
}

/** The same function's distance form: linear in distance, capped by the full path. */
export function airMassForDistance(direction, distance, scaleHeight) {
  const length = Math.hypot(direction.X, direction.Y, direction.Z);
  const upwards = length > 1e-6 ? direction.Y / length : 1;
  return Math.min(Math.max(distance, 0) / Math.max(scaleHeight, 1e-3),
    airMassAlongDirection(upwards));
}

/** Rayleigh extinction per channel plus a turbidity-driven Mie term. */
export function transmittance(turbidity, airMass) {
  const rayleigh = [0.0464, 0.1085, 0.2650];
  const mie = 0.021 * Math.max(turbidity - 1, 0);
  return rayleigh.map((beta) => Math.exp(-(beta + mie) * airMass));
}

/** `HeightFogPass::opticalDepth`, including the level-look branch that does not divide. */
export function opticalDepth(cameraHeight, rayHeightStep, distance, density, falloff, baseHeight) {
  if (density <= 0 || distance <= 0 || falloff <= 0) return 0;
  const atCamera = density * Math.exp(-falloff * (cameraHeight - baseHeight));
  const climb = falloff * rayHeightStep;
  if (Math.abs(climb) < 1e-5) return Math.max(atCamera * distance, 0);
  return Math.max(atCamera * (1 - Math.exp(-climb * distance)) / climb, 0);
}

/**
 * `SsaoPass.cpp`'s kernel: 64 samples on a cosine-biased hemisphere, scaled toward the origin.
 *
 * The radical inverse is written with `>>> 0` at each step because JavaScript's bitwise operators
 * produce a signed 32-bit result and CNA's are on an `unsigned int`; without it the last shift of
 * a high index goes negative and every sample past the halfway point is wrong.
 */
export function ssaoKernel(count = 64) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const u1 = (index + 0.5) / count;
    let bits = index >>> 0;
    bits = ((bits << 16) | (bits >>> 16)) >>> 0;
    bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
    bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
    bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
    bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
    const u2 = bits * 2.3283064365386963e-10;
    const phi = 6.2831853 * u1;
    const cosTheta = u2;
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    let scale = index / count;
    scale = 0.1 + 0.9 * scale * scale;
    samples.push([
      Math.cos(phi) * sinTheta * scale,
      Math.sin(phi) * sinTheta * scale,
      cosTheta * scale,
    ]);
  }
  return samples;
}

/** `AsciiQuantizer.cpp`'s glyph index: a ten-character ramp whose first character is a space. */
export function asciiGlyphIndex(luminance0to255) {
  const index = Math.trunc(luminance0to255 / 255 * 9 + 0.5);
  return Math.min(Math.max(index, 0), 9);
}

/** The same file's luminance and Color-mode background, both integer-truncating as C++ does. */
export function asciiCell([r, g, b]) {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return {
    glyphIndex: asciiGlyphIndex(luminance),
    foreground: [r, g, b, 255],
    background: [Math.trunc(r / 4), Math.trunc(g / 4), Math.trunc(b / 4), 255],
  };
}

// --- the assertions ------------------------------------------------------------------------------

/** CNA's own names for these passes, which is what a mis-wired `create` route gets caught by. */
const PASS_NAMES = {
  Ssao: "SSAO", Ssr: "SSR", DepthOfField: "DepthOfField", LensFlare: "LensFlare",
  MotionBlur: "MotionBlur", Ascii: "Ascii", AerialPerspective: "AerialPerspective",
  HeightFog: "HeightFog", LightShaft: "LightShafts", VolumetricFog: "VolumetricFog",
  ContactShadow: "ContactShadow",
};

/** Asserts the whole scenario. `expectSupported` is what a strong-artifact run requires. */
export function assertPostProcessEvidence(evidence, { expectSupported = true } = {}) {
  assert.equal(
    evidence.evidenceError ?? null, null,
    `the engine layer was present and the scenario failed, which is a cna-ts defect rather than ` +
    `a missing CNA build option: ${evidence.evidenceStack ?? ""}`,
  );

  // --- each pass exists, names itself, and was asked ---------------------------------------------
  assert.deepEqual(
    Object.keys(evidence.passes).sort(), Object.keys(PASS_NAMES).sort(),
    "every pass in the group was constructed",
  );
  for (const [key, expected] of Object.entries(PASS_NAMES)) {
    // The name is CNA's, read back through `cna_post_process_pass_copy_name`, so a `create` route
    // wired to a sibling's -- which nothing else here would notice, because the parameter routes
    // would then also be that sibling's and round-trip perfectly -- fails on this line.
    assert.equal(evidence.passes[key].name, expected, `${key} names itself`);
    assert.equal(typeof evidence.passes[key].supported, "boolean");
    if (expectSupported) {
      assert.equal(
        evidence.passes[key].supported, true,
        `${key} answered cna_post_process_pass_is_supported with false on this device`,
      );
    }
  }

  // --- every parameter round-trips, and no two of them share a route -----------------------------
  //
  // The values were chosen distinct across the whole table, so this is two assertions in one: each
  // read-back equals its write, and the set of read-backs has no duplicate. A setter wired to a
  // neighbour's route passes the first and fails the second.
  const written = [];
  for (const [pass, table] of Object.entries(evidence.roundTrip)) {
    for (const [property, [wrote, read]] of Object.entries(table)) {
      if (typeof wrote === "boolean") assert.equal(read, wrote, `${pass}.${property}`);
      else near(read, wrote, `${pass}.${property} round-trips`);
      written.push(`${typeof wrote}:${wrote}`);
    }
  }
  assert.equal(
    new Set(written).size, written.length,
    "every value in the parameter table is distinct, so a setter wired to a neighbour's route " +
    "reads back a number that belongs to a different property",
  );

  assertClampEvidence(evidence.clamps);

  // --- the vector routes, where a component order defect lives -----------------------------------
  assert.deepEqual(evidence.vectors.sunDirection, [0.25, -0.5, 0.8125]);
  assert.deepEqual(evidence.vectors.fogColor, [0.125, 0.375, 0.9375]);
  assert.deepEqual(evidence.vectors.contactLight, [-0.75, 0.1875, 0.5]);
  assert.deepEqual(evidence.vectors.lightShaft, [0.3125, 0.6875]);
  assert.equal(evidence.fogLightAccepted, true, "a fog light with no shadow map is accepted");

  assertPostProcessScalars(evidence.scalars);
  assertAsciiEvidence(evidence.ascii);

  assert.equal(evidence.upscale.sharpness, 0.4375);
  assert.equal(evidence.upscale.edgeAdaptive, false, "the flag reads back what was written");
  assert.equal(evidence.upscale.edgeAdaptiveAfter, true, "and reads back the other value too");
}

/**
 * The ranges CNA enforces, and why they are the write-through evidence for this family.
 *
 * Each pass's setter either clamps to a range or refuses a value outside one, and the ranges are
 * in the pass sources rather than in any header: `SsrPass::setRoughnessBlur` clamps to `[0, 0.25]`,
 * `setEdgeFade` to `[0, 0.5]`, `DepthOfFieldPass::setMaxRadius` to `[0, 0.25]`,
 * `LensFlarePass::setDispersal` and `LightShaftPass::setDecay` and
 * `SpatialUpscalePass::setSharpness` to `[0, 1]`, `MotionBlurPass::setStrength` to `[0, 1]` and
 * its `setMaxDistance` to `[0, 0.25]`, `AerialPerspectivePass::setTurbidity` to at least one, and
 * `VolumetricFogPass::setAnisotropy` to `[-0.95, 0.95]`. Several others refuse a non-positive
 * value outright and leave the previous one standing.
 *
 * That makes this section the equivalent of the compiled effect's native read-back: **a binding
 * that kept these values in JavaScript and never reached CNA would hand every one of them back
 * unchanged**, and every assertion here would fail.
 */
/**
 * Not exported, and deliberately: this and its two siblings below are halves of
 * `assertPostProcessEvidence` and were never called from outside this module. An oracle exported
 * with no caller is watched by nothing -- `tools/wasm/verify-oracles.mjs` is what found these
 * three -- and an export nothing uses is the same defect magnet a structure writer nothing calls is.
 */
function assertClampEvidence(clamps) {
  const clamped = (key, attempt, expected) => {
    assert.equal(clamps[key][0], attempt, `${key} wrote ${attempt}`);
    near(clamps[key][1], expected, `${key} came back clamped`);
  };
  clamped("ssrRoughnessBlurHigh", 9.5, 0.25);
  clamped("ssrRoughnessBlurLow", -3, 0);
  clamped("ssrEdgeFadeHigh", 4, 0.5);
  // A refusal rather than a clamp: the value written earlier in the round-trip table survives.
  clamped("ssrMaxDistanceRefused", 0, 37.5);
  clamped("depthOfFieldMaxRadiusHigh", 9.5, 0.25);
  clamped("depthOfFieldFocusRefused", -1, 12.5);
  clamped("lensFlareDispersalHigh", 3.5, 1);
  clamped("motionBlurStrengthHigh", 8, 1);
  clamped("motionBlurMaxDistanceHigh", 8, 0.25);
  clamped("aerialTurbidityLow", 0.25, 1);
  clamped("lightShaftDecayHigh", 6, 1);
  clamped("volumetricAnisotropyHigh", 4, 0.95);
  clamped("volumetricAnisotropyLow", -4, -0.95);
}

/** CNA's pure scalars against the same arithmetic computed here. */
function assertPostProcessScalars(scalars) {
  // Depth of field. Zero exactly at the focus distance, and the thin-lens value everywhere else.
  for (const [depth, value] of scalars.circleOfConfusion) {
    near(
      value, circleOfConfusionMillimetres(depth, 10, 50, 2.8),
      `the circle of confusion at ${depth} m`,
    );
  }
  const atFocus = scalars.circleOfConfusion.find(([depth]) => depth === 10);
  assert.equal(atFocus[1], 0, "a subject at the focus distance is exactly in focus");
  // Monotone away from the focus on both sides, which is the property the blur radius depends on.
  const nearSide = scalars.circleOfConfusion.filter(([depth]) => depth < 10).map(([, v]) => v);
  const farSide = scalars.circleOfConfusion.filter(([depth]) => depth > 10).map(([, v]) => v);
  for (let index = 1; index < nearSide.length; index += 1) {
    assert.ok(nearSide[index] < nearSide[index - 1], "closer than focus blurs more, the nearer it is");
  }
  for (let index = 1; index < farSide.length; index += 1) {
    assert.ok(farSide[index] > farSide[index - 1], "further than focus blurs more, the further it is");
  }

  // SSAO's quality table, restated from `sampleCountForQuality`.
  assert.deepEqual(
    scalars.ssaoSampleCounts.map(([name, , count]) => [name, count]),
    [["Low", 8], ["Medium", 16], ["High", 32], ["Ultra", 64]],
  );

  // The kernel, computed here and compared component by component.
  const expectedKernel = ssaoKernel(scalars.ssaoKernel.length);
  assert.equal(scalars.ssaoKernel.length, 64, "the kernel is CNA's full 64 samples");
  scalars.ssaoKernel.forEach((sample, index) => {
    for (const axis of [0, 1, 2]) {
      near(sample[axis], expectedKernel[index][axis], `kernel sample ${index} axis ${axis}`, 1e-5);
    }
  });
  // And the two properties that make it usable, asserted separately so a kernel that matched a
  // wrong reimplementation of the same sequence still has to be a hemisphere.
  for (const [index, [x, y, z]] of scalars.ssaoKernel.entries()) {
    assert.ok(z >= 0, `sample ${index} is on the +Z side`);
    assert.ok(Math.hypot(x, y, z) <= 1 + 1e-5, `sample ${index} is inside the unit ball`);
  }

  // The two GLSL forms are different text, because the packed one decodes depth differently.
  assert.ok(scalars.ssaoGlslPacked.length > 0, "the packed occlusion GLSL is not empty");
  assert.notEqual(
    scalars.ssaoGlslPacked, scalars.ssaoGlslUnpacked,
    "the packed and unpacked occlusion GLSL differ, so the flag reached CNA",
  );

  // Air mass: linear in distance until the Kasten-Young ceiling for the direction, then flat.
  const up = { X: 0, Y: 1, Z: 0 };
  for (const [distance, value] of scalars.airMass) {
    near(value, airMassForDistance(up, distance, 1200), `air mass at ${distance} m`);
  }
  const ceiling = airMassForDistance(up, Infinity, 1200);
  near(
    scalars.airMassLowerAtmosphere, airMassForDistance(up, 1000, 600),
    "a shallower atmosphere reaches the ceiling sooner",
  );
  near(scalars.airMass.at(-1)[1], ceiling, "and the ceiling is where it stops");

  // Transmittance: exactly the exponential, and one at zero air mass by construction.
  for (const [mass, channels] of scalars.transmittance) {
    const expected = transmittance(2.5, mass);
    for (const axis of [0, 1, 2]) {
      near(channels[axis], expected[axis], `transmittance channel ${axis} at air mass ${mass}`);
    }
    assert.ok(channels[0] >= channels[1] && channels[1] >= channels[2],
      "blue is scattered out first, so it survives least");
  }

  // Height fog. Each case is computed here from the arguments the page actually passed, so every
  // one of the six is varied against the others -- a call that dropped an argument and shifted the
  // rest along would agree on the common case and disagree on the one that moved.
  const depths = {};
  for (const [label, args, value] of scalars.opticalDepth) {
    depths[label] = value;
    near(value, opticalDepth(...args), `the height-fog optical depth for ${label}`);
  }
  assert.equal(depths["zero distance"], 0, "no distance is no fog");
  assert.ok(depths.long > depths.short, "further is thicker");
  assert.ok(depths.denser > depths.long, "denser is thicker");
  assert.ok(depths["higher camera"] < depths.long, "a camera higher in the fog sees less of it");
  assert.ok(depths["raised base"] > depths.long, "raising the fog's base brings it up to the camera");
  assert.ok(depths["climbing ray"] < depths.long, "a ray climbing out of the fog collects less");
  assert.ok(depths["descending ray"] > depths.long, "and one descending into it collects more");
  assert.ok(depths["steeper falloff"] < depths.long, "a steeper falloff leaves less fog up here");

  // The contact-shadow acceptance test, at and around **both** of its strict boundaries.
  assert.deepEqual(Object.fromEntries(scalars.contactOcclusion), {
    "in front of the surface": false,
    "just inside the bias": false,
    "past the bias": true,
    "inside the thickness": true,
    "past the thickness": false,
  });

  // The combine is a product of two clamped terms, so it is checked as one.
  for (const [a, b, combined] of scalars.combineVisibility) near(combined, a * b, `${a} x ${b}`);

  // Only equal dimensions are an identity, and a transposed pair is not.
  assert.deepEqual(scalars.identityScale.map(([, identity]) => identity), [true, false, false, false]);
}

/**
 * The ASCII quantizer, texel by texel.
 *
 * Three of the four source quadrants are dark enough that their glyph index rounds to zero, and
 * index zero of `" .:-=+*#%@"` is a space with no lit pixels -- so those cells are exactly their
 * background and a single colour covers all sixteen texels. The white quadrant is the only one
 * with two colours in it, and both are named.
 */
function assertAsciiEvidence(ascii) {
  const N = 8;
  const cells = ascii.source.map(asciiCell);
  // The premise the per-texel expectations rest on, asserted rather than assumed: if CNA ever
  // changed the ramp or the luminance weights, this fails here and says so, instead of failing as
  // a wall of unexplained texel differences below.
  assert.deepEqual(
    cells.map((cell) => cell.glyphIndex), [0, 0, 0, 9],
    "three quadrants quantize to the ramp's space and the white one to its last character",
  );

  // Cell size and grid, before any texel: a size read as one number, or transposed, dies here.
  assert.deepEqual(ascii.colour.cellSize, [4, 4]);
  assert.deepEqual(ascii.colour.grid, [2, 2], "an 8x8 source in 4x4 cells is a 2x2 grid");
  assert.deepEqual(ascii.collapsed.cellSize, [8, 8]);
  assert.deepEqual(ascii.collapsed.grid, [1, 1], "one cell as large as the source is one cell");
  assert.deepEqual(ascii.oblong.cellSize, [2, 4]);
  assert.deepEqual(
    ascii.oblong.grid, [4, 2],
    "a 2-wide 4-tall cell gives four columns and two rows; a transposed pair gives two and four",
  );

  const texel = (frame, x, y) => frame.pixels[y * N + x];
  // The three dark quadrants: every texel is the background and nothing else.
  const quadrantOrigin = [[0, 0], [4, 0], [0, 4], [4, 4]];
  for (const index of [0, 1, 2]) {
    const [originX, originY] = quadrantOrigin[index];
    for (let y = originY; y < originY + 4; y += 1) {
      for (let x = originX; x < originX + 4; x += 1) {
        assert.deepEqual(
          texel(ascii.colour, x, y), cells[index].background,
          `quadrant ${index} texel (${x}, ${y}) is the cell background, which is the average / 4`,
        );
      }
    }
  }
  // The white quadrant: two colours, both of them named, and both actually present.
  const white = cells[3];
  const seen = new Set();
  for (let y = 4; y < 8; y += 1) {
    for (let x = 4; x < 8; x += 1) {
      const value = texel(ascii.colour, x, y);
      const isForeground = value.every((c, i) => c === white.foreground[i]);
      const isBackground = value.every((c, i) => c === white.background[i]);
      assert.ok(
        isForeground || isBackground,
        `the lit quadrant's texel (${x}, ${y}) is ${JSON.stringify(value)}, which is neither its ` +
        `foreground ${JSON.stringify(white.foreground)} nor its background ` +
        `${JSON.stringify(white.background)}`,
      );
      seen.add(isForeground ? "foreground" : "background");
    }
  }
  assert.deepEqual([...seen].sort(), ["background", "foreground"],
    "the '@' glyph paints some of the cell and leaves the rest as background");

  // One cell over the whole source: its average is the average of the four quadrants, and its
  // background is that average over four. This is the assertion a per-cell average that summed
  // the wrong region fails.
  const average = [0, 1, 2].map((channel) =>
    Math.trunc(ascii.source.reduce((sum, q) => sum + q[channel] * 16, 0) / 64));
  const collapsed = asciiCell(average);
  const distinct = new Set(ascii.collapsed.pixels.map((p) => p.join(",")));
  for (const value of distinct) {
    const parsed = value.split(",").map(Number);
    const isForeground = parsed.every((c, i) => c === collapsed.foreground[i]);
    const isBackground = parsed.every((c, i) => c === collapsed.background[i]);
    assert.ok(
      isForeground || isBackground,
      `the collapsed cell contains ${value}; its average is ${average} so its only legal colours ` +
      `are ${collapsed.foreground} and ${collapsed.background}`,
    );
  }

  // BlackWhite mode: the same source, and a palette that no longer carries the scene's colour.
  assert.equal(ascii.mode, 1, "Color is the default quantize mode");
  assert.equal(ascii.blackWhiteMode, 0, "and the mode was changed");
  for (const pixel of ascii.blackWhite.pixels) {
    const [r, g, b] = pixel;
    assert.ok(r === g && g === b, `BlackWhite mode leaves no hue, and this texel is ${pixel}`);
  }
  assert.notDeepEqual(
    ascii.blackWhite.pixels, ascii.colour.pixels,
    "and the mode reached CNA rather than being stored managed",
  );
}
