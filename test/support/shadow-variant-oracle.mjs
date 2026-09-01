// SPDX-License-Identifier: MS-PL

/**
 * The three shadow maps that are not a directional one, held to arithmetic rather than to pictures.
 *
 * A spot light's shadow is one perspective map, a point light's is six of them, and a directional
 * light over a large scene wants several over nested slices of its frustum. Each ships the
 * transforms behind it as pure routes, so what a map holds can be checked against what those say
 * it should hold -- two ways into one answer rather than one way twice.
 *
 * Every expectation is computed here:
 *
 *   the cascade splits   the practical-split blend of a uniform and a logarithmic series
 *   cascade selection    against those same splits, at depths straddling every one of them
 *   the texel snap       the quantum a cascade of that radius and that size has
 *   the spot map         its own light view-projection against the product of the two pure halves
 *   each cube face       what that face's view must do to a point on its own axis
 *   the cube projection  ninety degrees exactly, which is the only angle that tiles a cube
 */

import assert from "node:assert/strict";

function near(actual, expected, message, epsilon = 1e-4) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon * Math.max(1, Math.abs(expected)),
    `${message}: got ${actual}, expected ${expected}`,
  );
}

/** Row-vector multiply, which is the convention XNA and CNA both lay a matrix out in. */
function multiply(left, right) {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += left[row * 4 + k] * right[k * 4 + column];
      out[row * 4 + column] = sum;
    }
  }
  return out;
}

/** Transforms a point by a row-vector matrix, dividing through by w. */
function transform(matrix, [x, y, z]) {
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / (w || 1),
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / (w || 1),
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / (w || 1),
  ];
}

/**
 * The practical split scheme: a logarithmic series and a uniform one, blended by lambda.
 *
 * At lambda 0 it is `near + (far - near) * i / n`, at lambda 1 it is `near * (far / near)^(i / n)`,
 * and in between it is the blend. Recomputed here rather than pinned, so a change in CNA's scheme
 * fails as a formula rather than as a list of numbers nobody can check.
 */
export function cascadeSplitDistances(nearPlane, farPlane, count, lambda) {
  return Array.from({ length: count }, (_, index) => {
    const fraction = (index + 1) / count;
    const logarithmic = nearPlane * Math.pow(farPlane / nearPlane, fraction);
    const uniform = nearPlane + (farPlane - nearPlane) * fraction;
    return lambda * logarithmic + (1 - lambda) * uniform;
  });
}

/** The six cube faces in XNA's order, each with the axis its view must look along. */
const CUBE_FACE_AXES = [
  ["PositiveX", [1, 0, 0]], ["NegativeX", [-1, 0, 0]],
  ["PositiveY", [0, 1, 0]], ["NegativeY", [0, -1, 0]],
  ["PositiveZ", [0, 0, 1]], ["NegativeZ", [0, 0, -1]],
];

/** Asserts the whole scenario. */
export function assertShadowVariantEvidence(evidence) {
  assert.equal(
    evidence.evidenceError ?? null, null,
    `the engine layer was present and the scenario failed: ${evidence.evidenceStack ?? ""}`,
  );
  for (const [name, supported] of Object.entries(evidence.supported)) {
    assert.equal(supported, true, `the ${name} shadow map reports itself unsupported here`);
  }

  // --- the splits, and the selection that reads them ---------------------------------------------
  for (const [lambda, distances] of evidence.splits) {
    const expected = cascadeSplitDistances(1, 200, 4, lambda);
    assert.equal(distances.length, 4, "four cascades, four splits");
    distances.forEach((distance, index) => {
      near(distance, expected[index], `split ${index} at lambda ${lambda}`, 1e-5);
    });
    assert.equal(
      distances[3].toFixed(3), (200).toFixed(3), "the last split is the far plane itself");
  }
  // The three lambdas are three different series, which is what says lambda reached CNA.
  assert.notDeepEqual(evidence.splits[0][1], evidence.splits[2][1]);
  assert.ok(
    evidence.splits[2][1][0] < evidence.splits[0][1][0],
    "a logarithmic first split is nearer than a uniform one",
  );

  // The lambda that was set is not CNA's default, which is what makes the setter observable: a
  // setter wired to a neighbour would leave the default in place and every split below would
  // still agree with the lambda the getter reported.
  assert.equal(evidence.splitLambda, 0.25, "the split lambda reads back what was written");
  assert.notEqual(
    evidence.splitLambda, evidence.defaultSplitLambda,
    `the lambda written must differ from CNA's default of ${evidence.defaultSplitLambda}`,
  );
  assert.equal(evidence.blendBand, 0.125, "and the blend band reads back its own value");
  assert.notEqual(evidence.blendBand, evidence.defaultBlendBand, "which is also not the default");

  const splits = evidence.cascade.splitDistances;
  assert.equal(splits.length, evidence.sizes.cascadeCount);
  // The map's own splits are the ones the formula gives for the lambda it was set to.
  cascadeSplitDistances(1, 200, 4, evidence.splitLambda).forEach((distance, index) => {
    near(splits[index], distance, `the map's own split ${index}`, 1e-3);
  });
  for (const [depth, index] of evidence.cascade.selection) {
    const expected = Math.min(splits.findIndex((split) => depth < split), splits.length - 1);
    assert.equal(
      index, expected < 0 ? splits.length - 1 : expected,
      `at view depth ${depth} the map selects cascade ${index}; its own splits say ` +
      `${expected < 0 ? splits.length - 1 : expected}`,
    );
  }
  // Every cascade has its own matrix, and no two are the same: a map that computed one and handed
  // it out four times would satisfy every count above.
  const matrices = new Set(evidence.cascade.matrices.map((m) => m.join(",")));
  assert.equal(
    matrices.size, evidence.cascade.matrices.length,
    "each cascade has its own transform, not one shared four ways",
  );

  // --- the texel snap ----------------------------------------------------------------------------
  //
  // A cascade of radius r rendered into a map of s texels has a texel worth 2r/s world units, and
  // snapping quantises the centre onto that grid so the map does not swim as the camera moves.
  // Depth is not snapped: only the two axes the map is rasterised across.
  for (const entry of evidence.snap) {
    const texel = (2 * entry.radius) / entry.size;
    for (const axis of [0, 1]) {
      const quantised = Math.floor(entry.centre[axis] / texel) * texel;
      near(
        entry.snapped[axis], quantised,
        `snapping ${entry.centre[axis]} to a ${texel} grid on axis ${axis}`, 1e-5,
      );
    }
    assert.equal(entry.snapped[2], entry.centre[2], "depth is not on the grid and is not snapped");
  }
  // A finer map snaps closer to the original, which is the property the quantum is for.
  const coarse = evidence.snap.find((e) => e.size === 64);
  const fine = evidence.snap.find((e) => e.size === 128);
  assert.ok(
    Math.abs(fine.snapped[0] - fine.centre[0]) < Math.abs(coarse.snapped[0] - coarse.centre[0]),
    "twice the resolution snaps to within half the distance",
  );

  // --- the frustum and its sphere ----------------------------------------------------------------
  assert.equal(evidence.frustum.corners.length, 8, "a frustum has eight corners");
  const distinct = new Set(evidence.frustum.corners.map((c) => c.join(",")));
  assert.equal(distinct.size, 8, "and all eight are different points");
  const { centre, radius } = {
    centre: evidence.frustum.sphere.centre, radius: evidence.frustum.sphere.radius,
  };
  let furthest = 0;
  for (const corner of evidence.frustum.corners) {
    furthest = Math.max(furthest, Math.hypot(
      corner[0] - centre[0], corner[1] - centre[1], corner[2] - centre[2]));
  }
  assert.ok(
    furthest <= radius * (1 + 1e-4),
    `the sphere must contain every corner: the furthest is ${furthest} and the radius ${radius}`,
  );
  assert.ok(
    furthest >= radius * (1 - 1e-2),
    `and be tight around them: the furthest is ${furthest} and the radius ${radius}`,
  );

  // --- the spot map: three routes that must agree ------------------------------------------------
  //
  // The map's own light view-projection has to be the product of the two pure routes that compute
  // its halves. Neither of those touches the map, so this is CNA checked against CNA by a path
  // that shares no state.
  const product = multiply(evidence.spot.computedView, evidence.spot.computedProjection);
  evidence.spot.lightViewProjection.forEach((value, index) => {
    near(
      value, product[index],
      `the spot map's light view-projection element ${index} must be the product of the two ` +
      "routes that compute its halves",
      1e-3,
    );
  });
  // And the transform really is the light's: its own position is at the view's origin.
  const atLight = transform(evidence.spot.computedView, evidence.spot.lightPosition);
  for (const axis of [0, 1, 2]) {
    near(atLight[axis], 0, `the spot light sits at its own view's origin, axis ${axis}`, 1e-4);
  }
  assert.deepEqual(evidence.spot.lightPosition, [4, 9, -3], "the position CNA holds is the one set");
  assert.equal(evidence.spot.lightRange, 40);
  /*
   * The cone reaches the projection, and only its *outer* angle does.
   *
   * A perspective projection's first element is `1 / tan(fov / 2)`, and this one is
   * `1 / tan(outerAngle)` -- so the field of view is twice the outer angle, which is what a spot
   * map's frustum has to be to cover the cone. Asserted against the angle rather than against the
   * number, so a binding that wrote the inner angle into the outer one lands on `1 / tan(0.35)`
   * and fails here. Widening the cone must move it; changing the inner angle must not move it at
   * all, because the inner angle is a falloff and not a frustum.
   */
  near(evidence.spot.computedProjection[0], 1 / Math.tan(0.6), "the spot frustum is twice its outer angle");
  near(evidence.spot.computedProjection[5], 1 / Math.tan(0.6), "on both axes");
  near(evidence.spot.widerConeProjection[0], 1 / Math.tan(0.9), "a wider cone is a wider frustum");
  assert.deepEqual(
    evidence.spot.innerOnlyProjection, evidence.spot.computedProjection,
    "the inner angle is a falloff, not a frustum, and must not move the projection at all",
  );

  /*
   * The bone palette, at the two edges only a caller-supplied count can have.
   *
   * `ApplySkinnedCaster` takes an array and its length, so nothing about a successful call says
   * the length arrived. These two say it: an empty palette is refused with
   * `CNA_RESULT_INVALID_ARGUMENT` and an implausibly large one is refused with the same code,
   * while one bone and seventy-two are accepted. A binding that sent a fixed count would have both
   * refusals turn into acceptances.
   */
  const palettes = evidence.spot.bonePalettes;
  assert.equal(palettes.empty, "WasmCnaError:1", "an empty bone palette is refused by CNA");
  assert.equal(palettes.one, "accepted", "one bone is a palette");
  assert.equal(palettes.many, "accepted", "and so is a realistic skeleton");
  assert.equal(palettes.tooMany, "WasmCnaError:1", "and an implausible one is refused");
  // The typed surface refuses these before CNA is reached at all.
  assert.equal(palettes.zeroWeights, "RangeError:", "zero weights per vertex is a type error");
  assert.equal(palettes.fiveWeights, "RangeError:", "and so is more than four");

  near(evidence.spot.depthBias.set, 0.00390625, "the depth bias round-trips");
  assert.notEqual(
    evidence.spot.depthBias.set, evidence.spot.depthBias.before,
    "and the value written is not the default it started at",
  );
  // Upstream finding 14's siblings: closing a pass that is not open is refused, with CNA's code.
  assert.equal(
    evidence.spot.outsideBracket, 12,
    "closing an unopened spot pass answers CNA's own INTERNAL, as the prepass's does",
  );

  // --- the cube map: six faces, each looking along its own axis -----------------------------------
  assert.equal(evidence.cube.faceViews.length, 6);
  assert.deepEqual(evidence.cube.faces, ["ok", "ok", "ok", "ok", "ok", "ok"], "all six open");
  assert.notEqual(evidence.cube.seventhFace, "accepted", "and a seventh does not");
  const position = evidence.cube.lightPosition;
  CUBE_FACE_AXES.forEach(([name, axis], face) => {
    const view = evidence.cube.faceViews[face];
    // The light is at the origin of every face's view.
    const origin = transform(view, position);
    for (const component of [0, 1, 2]) {
      near(origin[component], 0, `${name}: the light is at its view's origin`, 1e-4);
    }
    // And a point one unit along that face's own axis is one unit *in front* of the camera, which
    // in a right-handed view space is -Z. This is what a permuted face table cannot satisfy: each
    // face is asked about a different axis, and only its own view puts that axis at -Z.
    const ahead = transform(view, [
      position[0] + axis[0], position[1] + axis[1], position[2] + axis[2],
    ]);
    near(ahead[0], 0, `${name}: a point on its axis is centred across`, 1e-4);
    near(ahead[1], 0, `${name}: and centred down`, 1e-4);
    near(ahead[2], -1, `${name}: and one unit ahead, which is -Z`, 1e-4);
  });
  // The projection: exactly ninety degrees, which is the only angle whose frustums tile a cube.
  // `1 / tan(fov / 2)` is one at ninety degrees, on both axes.
  near(evidence.cube.faceProjection[0], 1, "the cube face projection is ninety degrees across");
  near(evidence.cube.faceProjection[5], 1, "and ninety degrees down");
  assert.equal(evidence.cube.faceProjection[11], -1, "and it is a perspective projection");
  /*
   * And the light's range reaches it. The angle terms are scale-free, so halving the range leaves
   * the first two elements and the depth ratio exactly where they were and halves the one term
   * that carries a distance -- which is why a second range is measured rather than one asserted
   * against a remembered number.
   */
  const half = evidence.cube.halfRangeProjection;
  const full = evidence.cube.faceProjection;
  for (const index of [0, 5, 10, 11]) {
    near(half[index], full[index], `halving the range leaves element ${index} alone`);
  }
  near(half[14], full[14] / 2, "and halves the one element that carries a distance");
  assert.notEqual(full[14], 0, "which is not zero, so the halving means something");
  assert.deepEqual(evidence.cube.lightPosition, [2, 5, -7]);
  assert.equal(evidence.cube.lightRange, 25);
  near(evidence.cube.depthBias.set, 0.005859375, "the cube map's depth bias round-trips");

  // Quality tables, which are CNA's own and are asked rather than remembered.
  assert.deepEqual(
    evidence.sizes.sizeForQuality.map((size) => size > 0), [true, true, true, true]);
  assert.ok(
    evidence.sizes.sizeForQuality[3] > evidence.sizes.sizeForQuality[0],
    "a higher quality is a larger map",
  );
  assert.ok(
    evidence.sizes.cubeForQuality.every((size, index) => size <= evidence.sizes.sizeForQuality[index]),
    "a cube face is never larger than the flat map of the same quality: six of them are stored",
  );
}
