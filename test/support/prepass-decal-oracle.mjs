// SPDX-License-Identifier: MS-PL

/**
 * The depth/normal prepass and the decal projector, as one expectation both suites apply.
 *
 * The two families are one pipeline -- the prepass writes a linear-depth image and the projector
 * unprojects it -- so they share a scenario and they share this file. What is *in* here is
 * everything that is the same on every renderer:
 *
 *   the packed-depth arithmetic and the sweep that is upstream finding 13
 *   the two GLSL dialects and the velocity encoding
 *   the ordering error codes that are upstream finding 14
 *   the prepass's own state and its clamps
 *   the decal's state and its clamps
 *   `IsInsideDecalBox`, and the per-texel prediction built from it
 *
 * What is *not* in here is anything about a particular renderer's screen conventions: the windowed
 * suite's measurement that an uploaded `Texture2D` does not stand in for the prepass's own target
 * stays where it was measured.
 *
 * Shared for the reason the other four oracles are. Two suites with their own copy of an
 * expectation is how they come to disagree about what they measured, and the strong-Wasm session
 * before this one found a planted defect surviving in exactly that gap.
 */

import assert from "node:assert/strict";

const EPSILON = 1e-6;

function near(actual, expected, message, epsilon = EPSILON) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon * Math.max(1, Math.abs(expected)),
    `${message}: got ${actual}, expected ${expected}`,
  );
}

/** `CNA_RESULT_INTERNAL`, which is what the three prepass ordering routes actually answer. */
export const CNA_RESULT_INTERNAL = 12;
/** `CNA_RESULT_INVALID_ARGUMENT`, which is what a near plane past the far one answers. */
export const CNA_RESULT_INVALID_ARGUMENT = 1;

/**
 * The arithmetic, and upstream finding 13 with it.
 *
 * `sweep` is 2001 rows of `[depth, decoded, throughEightBits, through256Levels]`, produced by
 * calling CNA's own encoder and decoder and quantising the channels in between. Everything below
 * is a property of those four numbers, so a backend that reached the routes wrongly fails here on
 * arithmetic rather than on a pixel.
 */
export function assertPrepassMaths(maths) {
  assert.equal(
    maths.devicePacked, true, "the automatic encoding packs depth on this renderer");
  // The encoder at three points whose answers are exact rather than approximate. A half is exactly
  // the low channel and nothing else, which is what a shift of (1/2^24, 1/2^16, 1/256, 1) means.
  assert.equal(maths.packHalf.length, 4, "four channels, not three");
  assert.deepEqual(
    maths.packHalf, [0, 0, 0, 0.5],
    "a half packs into the low channel and nothing else",
  );
  // And the decoder weights that channel by one, so a half in it decodes to a half.
  assert.equal(maths.unpackHalf, 0.5, "the decoder weights the low channel by one");
  near(maths.roundTrip, 0.375, "pack and unpack are inverses", 1e-6);
  // One stops a texel short, because `fract(1.0)` is zero and an unclamped far plane would read
  // back as the *nearest* possible surface -- the exact inverse of what it means, applied to the
  // commonest value in the buffer.
  assert.equal(maths.packOne[0], 0, "1.0 is clamped short, so its top channel packs to zero");
  assert.ok(
    maths.packOne[3] > 0.99 && maths.packOne[3] < 1,
    `and its low channel stops short of one, not at it (${maths.packOne[3]})`,
  );

  assertPackedDepthPrecision(maths.sweep);

  // The GLSL a game includes rather than reimplements. The packed dialect carries its unpacker;
  // both carry the reconstruction, so an encoding and its inverse cannot drift apart.
  assert.ok(maths.packedGlsl.includes("cnaUnpackDepth"), "the packed dialect carries its unpacker");
  assert.ok(
    !maths.plainGlsl.includes("cnaUnpackDepth"),
    "and the half-float dialect, which reads the red channel, does not",
  );
  for (const source of [maths.packedGlsl, maths.plainGlsl]) {
    assert.ok(
      source.includes("cnaDecodeLinearDepth") && source.includes("cnaViewPositionFromDepth"),
      "both dialects decode a texel and rebuild a view position from it",
    );
  }
  assert.ok(
    maths.velocityGlsl.includes("cnaEncodeVelocity")
    || maths.velocityGlsl.includes("cnaDecodeVelocity"),
    "the velocity dialect carries its own codec",
  );

  // Velocity: an alpha below 128 says a texel carries one, and each channel is centred and
  // doubled. A full red channel is therefore exactly +1 across and the absent green exactly -1.
  assert.equal(maths.hasVelocity, true, "alpha 0 is a texel that carries a velocity");
  assert.equal(maths.hasNoVelocity, false, "and alpha 255 is one that does not");
  assert.deepEqual(maths.decodedVelocity, [1, -1], "255 and 0 decode to the ends of the range");
  assert.deepEqual(
    maths.decodedNoVelocity, [0, 0],
    "a texel with no velocity decodes to no motion rather than to its channels",
  );

  // The decal box, which is the unit cube and is inclusive on its faces.
  for (const [point, answered, expected] of maths.insideBox) {
    assert.equal(answered, expected, `IsInsideDecalBox${JSON.stringify(point)}`);
  }
}

/**
 * Upstream finding 13, computed from a sweep rather than transcribed.
 *
 * `sweep` is rows of `[depth, decoded, throughEightBits, through256Levels]`, each produced by
 * calling CNA's own encoder and decoder with the channels quantised in between.
 *
 * The arithmetic never leaves the encoder and its decoder more than 2^-24 apart. Put the same
 * channels through eight bits, which is what the `Color` target the prepass writes into is, and the
 * error is hundreds of times larger and the same as writing the depth into one channel with no
 * packing at all. Quantise to 256 levels instead of 255 and the exact accuracy comes straight back
 * -- 256 is the base the shifts and masks are written in, and an eight-bit UNORM target stores
 * `n/255`. That last row is the whole finding: the loss is a base mismatch, not a limit.
 *
 * Shared by the windowed and browser suites because it is one claim about one piece of CNA, and two
 * copies of it is how the two would come to disagree about whether it had been repaired.
 */
export function assertPackedDepthPrecision(sweep) {
  assert.ok(sweep.length > 1000, `the sweep must cover the range, not sample it (${sweep.length})`);
  const worst = (column) => sweep.reduce(
    (largest, row) => Math.max(largest, Math.abs(row[column] - row[0])), 0);
  const asWritten = worst(1);
  const asStored = worst(2);
  const atBase256 = worst(3);
  assert.ok(
    asWritten <= Math.pow(2, -24),
    `the encoder's own arithmetic is good to a part in 2^24 (${asWritten})`,
  );
  assert.ok(
    asStored > 100 * asWritten,
    "UPSTREAM FINDING 13 REPAIRED: the packing now survives an eight-bit target. " +
    "Update docs/upstream-cna-findings.md and tighten every depth assertion that budgets for it",
  );
  assert.ok(
    Math.abs(asStored - 0.5 / 255) < 1e-5,
    `through eight bits the error is a half channel step, no better (${asStored})`,
  );
  assert.ok(
    Math.abs(atBase256 - asWritten) < 1e-9,
    `and 256 levels restores it exactly, which is where the loss comes from (${atBase256})`,
  );
  return { asWritten, asStored, atBase256 };
}

/**
 * Upstream finding 14, asserted as returned, by whichever suite reached the three routes.
 *
 * `begin`, `end` and `resize` each document `CNA_RESULT_INVALID_STATE` (3) for the ordering mistake
 * a caller can actually make, and each answers `CNA_RESULT_INTERNAL` (12) instead: the three bodies
 * raise `std::logic_error` and `CallWithExceptionBarrier` has no arm for it, while CNA's own render
 * pipeline in the same file does. The plane failure is `std::invalid_argument` and does translate,
 * which is what makes the other three a missing clause rather than a policy.
 *
 * Never repaired in the binding. Rewriting CNA's error categories here would make this package's
 * documentation true and CNA's behaviour invisible.
 */
export function assertPrepassOrderingCodes(
  { beginTwice, endClosed, resizeInside, swappedPlanes },
) {
  assert.deepEqual(
    [beginTwice, endClosed, resizeInside, swappedPlanes],
    [
      CNA_RESULT_INTERNAL, CNA_RESULT_INTERNAL, CNA_RESULT_INTERNAL, CNA_RESULT_INVALID_ARGUMENT,
    ],
    "UPSTREAM FINDING 14 REPAIRED: the three ordering refusals now answer INVALID_STATE. " +
    "Update docs/upstream-cna-findings.md and assert the documented codes",
  );
}

/** The prepass's own state, its clamps, and the two error codes that are finding 14. */
export function assertPrepassState(prepass, { width, height }) {
  assert.equal(prepass.supported, true, "the prepass reports itself supported on this device");
  assert.equal(
    prepass.passCount, prepass.multipleRenderTargets ? 1 : 2,
    "a renderer with multiple render targets fills both buffers in one pass, otherwise two",
  );
  assert.equal(prepass.velocityEnabled, false, "velocity is off unless it is asked for");
  assert.deepEqual(
    [prepass.roughnessSet, prepass.roughnessClamped, prepass.roughnessFloored], [0.25, 1, 0],
    "roughness round-trips and is clamped into the unit range rather than refused",
  );
  assert.deepEqual(
    prepass.textures.depth, [width, height],
    "the depth buffer is the size the prepass was made at, on both axes",
  );
  assert.deepEqual(prepass.textures.normal, [width, height], "and so is the normal buffer");
  assert.equal(prepass.textures.depthCached, true, "the borrow is taken once, not once per read");
  // What the two borrows hold with nothing drawn, which on this renderer is all they ever hold.
  assert.equal(
    prepass.clearedError ?? null, null, `reading the cleared targets failed: ${prepass.clearedError}`,
  );
  assert.deepEqual(
    prepass.clearedDepth, [255, 255, 255, 255],
    "the depth target clears to white -- far, in a buffer where 1.0 is the far plane",
  );
  assert.deepEqual(
    prepass.clearedNormal, [255, 255, 255, 255],
    "and so does the normal target. This is measured rather than assumed because it is why a " +
    "binding that exchanged the two borrows survives here: upstream finding 30 stops anything " +
    "being drawn into either, and the clear is identical, as are the size, the surface format, " +
    "the level count, and object identity. These two are indistinguishable here, and the windowed " +
    "suite cannot stand in for the browser: it exercises the Node-API backend and never loads the " +
    "WebAssembly one. That mutant is killable the day finding 30 is repaired, and not before",
  );
  assert.equal(
    prepass.textures.velocity, "null",
    "velocity is off, so there is no buffer -- not an empty one",
  );
  assert.deepEqual(
    prepass.effects, ["Default", "Default"], "both prepass programs are lent and both are real",
  );

  assertPrepassOrderingCodes(prepass.ordering);
}

/** The decal pass's own state and its clamps, which are what a pixel cannot reach. */
export function assertDecalState(defaults) {
  assert.equal(defaults.opacity, 1, "a new projector is fully opaque");
  near(defaults.maxSlopeAngle, 1.2217304706573486, "and takes surfaces up to seventy degrees off");
  assert.deepEqual(defaults.tint, [1, 1, 1], "and tints nothing");
  assert.equal(defaults.opacitySet, 0.5, "opacity round-trips");
  assert.equal(defaults.opacityClamped, 1, "and is clamped to the unit range above");
  assert.equal(defaults.opacityFloored, 0, "and below");
  assert.deepEqual(
    defaults.tintSet, [0.25, 2, -1],
    "the tint takes what it is given with no clamp: above one brightens an HDR frame",
  );
  near(defaults.slopeClamped, Math.PI / 2, "a slope past a right angle is clamped to one");
  assert.equal(defaults.slopeFloored, 0, "and a negative one to zero");
}

/**
 * Every texel the decal should paint, from CNA's own box test rather than from geometry written
 * out here.
 *
 * For each texel of the surface the prepass actually drew, the world point the decal shader
 * reconstructs is rebuilt -- the camera is a ninety-degree square frustum, so a plane at view
 * depth `d` spans `d` world units per unit of device coordinate -- transformed by the inverse of
 * the box's own world matrix, and handed to `IsInsideDecalBox`. A rotated or rescaled box needs no
 * separate derivation, which is what makes this a prediction rather than a restatement.
 */
export function predictDecalFootprint(
  { world, surfaceMask, width, height, viewDepth, surfaceZ }, { invert, isInsideDecalBox },
) {
  const inverse = invert(world);
  const transform = (m, x, y, z) => ({
    X: m[0] * x + m[4] * y + m[8] * z + m[12],
    Y: m[1] * x + m[5] * y + m[9] * z + m[13],
    Z: m[2] * x + m[6] * y + m[10] * z + m[14],
  });
  let count = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!surfaceMask[y * width + x]) continue;
      const ndcX = ((x + 0.5) / width) * 2 - 1;
      const ndcY = 1 - ((y + 0.5) / height) * 2;
      const local = transform(
        inverse, ndcX * viewDepth * (width / height), ndcY * viewDepth, surfaceZ);
      if (!isInsideDecalBox(local)) continue;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { count, minX, maxX, minY, maxY };
}

/**
 * Whether this renderer can receive a draw into more than one bound target.
 *
 * Returns true where it can. Where it cannot, the shape of the failure is asserted here so that
 * the two families above are held to what remains reachable rather than to pixels their renderer
 * cannot produce -- and so that a renderer which starts working fails this and gets promoted.
 *
 * This is upstream finding 30. On WEBGL2 the device reports `MultipleRenderTargets`, CNA's own log
 * reports "MRT up to 4 targets", a `Clear` reaches both bound targets, and the draw that follows
 * reaches neither. The identical scenario on the windowed OPENGLES3 build draws correctly, so it
 * is that renderer's path and not the API.
 */
export function multipleRenderTargetsDraw(probe) {
  assert.ok(probe, "no multiple-render-target probe was produced");
  assert.ok(
    Array.isArray(probe.oneTarget) && probe.oneTarget[0] > 0,
    `the control failed: a draw into one bound target painted ${JSON.stringify(probe.oneTarget)}, ` +
    "so nothing about the two-target case below can be attributed to the number of targets",
  );
  assert.equal(probe.oneTargetCleared, true, "and the clear reached that target");
  if (Array.isArray(probe.twoTargets) && probe.twoTargets.some((painted) => painted > 0)) {
    return true;
  }
  assert.deepEqual(
    probe.twoTargets, [0, 0],
    `UPSTREAM FINDING 30: expected a two-target bind to receive nothing on this renderer, and it ` +
    `answered ${JSON.stringify(probe.twoTargets)}`,
  );
  assert.equal(
    probe.twoTargetsCleared, true,
    "the clear reaches a two-target bind even though the draw does not, which is what makes this " +
    "a lost draw rather than a failed bind",
  );
  return false;
}
