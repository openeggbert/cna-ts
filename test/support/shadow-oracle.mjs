// SPDX-License-Identifier: MS-PL

/**
 * The shadow-map expectation, computed from the light transform CNA reported for the pass.
 *
 * The oracle knows two things CNA was never told together: where the occluder is in world space,
 * and the light view-projection the pass built from a light and a scene box. Multiplying one by
 * the other gives clip space; the viewport mapping gives the texel a corner lands on and the depth
 * it records. Nothing here is a remembered measurement, so a binding that transposed the matrix,
 * dropped a row, mixed up the axes, ignored the light direction or ignored the scene bounds moves
 * the predicted rectangle away from the rendered one instead of moving both together.
 *
 * The same oracle `test/windowed-renderer.integration.mjs` applies to the OPENGLES3 build, so the
 * two backends are held to one expectation. The skinned caster is not part of it: a bone palette
 * needs a skinned mesh, and those reach a game through a native content manager this package
 * deliberately does not have.
 */

import assert from "node:assert/strict";

/** Row-vector matrix product, in the order XNA composes view then projection. */
function multiply(left, right) {
  const product = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += left[row * 4 + k] * right[k * 4 + column];
      product[row * 4 + column] = sum;
    }
  }
  return product;
}

/** Asserts the whole shadow scenario for an artifact whose device can cast. */
export function assertShadowPassEvidence(shadow) {
  // Cross-route agreement on the transform itself, before any geometry. `Begin` built its matrix
  // inside CNA; `ComputeLightView` and `ComputeLightProjection` are pure routes over the same two
  // values that touch no shadow map, and their product must be that same matrix. Three CNA routes
  // and one local identity have to agree -- and a `Begin` that dropped the bounds or read a light
  // field from the wrong place cannot be rescued by the geometry below, which uses CNA's own
  // reported matrix and would move with it.
  const expectedTransform = multiply(shadow.math.view, shadow.math.projection);
  for (let index = 0; index < 16; index += 1) {
    assert.ok(
      Math.abs(shadow.lightViewProjection[index] - expectedTransform[index]) < 1e-5,
      `the pass transform disagrees with view * projection at element ${index}: ` +
      `${shadow.lightViewProjection[index]} vs ${expectedTransform[index]}`,
    );
  }
  assert.ok(
    shadow.lightViewProjection.slice(12, 15).some((value) => Math.abs(value) > 1e-3),
    "an asymmetric scene box gives the light transform real translation terms",
  );

  // The texture CNA lends is the map itself, at the quality tier's size, single-channel float --
  // which is why the depths can be read as floats at all.
  assert.deepEqual(
    [shadow.texture.width, shadow.texture.height], [shadow.size, shadow.size],
    "the lent depth texture is the shadow map's own texture",
  );
  assert.equal(shadow.texture.cached, true, "the borrow is taken once, not once per read");

  // An empty pass clears the entire map to the far plane. Exactly, and every texel of it.
  assert.deepEqual(
    [shadow.cleared.low, shadow.cleared.high, shadow.cleared.occluded], [1, 1, 0],
    "Begin/End with nothing drawn leaves every texel at the far plane",
  );

  const m = shadow.lightViewProjection;
  const project = (x, y, z) => {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return {
      X: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      Y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      Z: (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    };
  };
  const toTexel = (ndc) => ({
    // Clip space is [-1,1] on both axes; the texture's first row is the top, which is +1.
    X: (ndc.X * 0.5 + 0.5) * shadow.size,
    Y: (0.5 - ndc.Y * 0.5) * shadow.size,
    // and depth is the same [-1,1] mapped onto the [0,1] a depth buffer stores.
    Depth: (ndc.Z + 1) / 2,
  });
  const predict = (y) => {
    const corners = [
      toTexel(project(shadow.quad.X0, y, shadow.quad.Z0)),
      toTexel(project(shadow.quad.X1, y, shadow.quad.Z0)),
      toTexel(project(shadow.quad.X1, y, shadow.quad.Z1)),
      toTexel(project(shadow.quad.X0, y, shadow.quad.Z1)),
    ];
    const xs = corners.map((corner) => corner.X);
    const ys = corners.map((corner) => corner.Y);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
      depth: corners[0].Depth,
    };
  };

  for (const [label, height] of [["high", shadow.quad.High], ["low", shadow.quad.Low]]) {
    const measured = shadow[label];
    const expected = predict(height);
    // The rectangle is not square, so a swapped or mirrored axis lands somewhere else entirely.
    assert.ok(
      Math.abs((expected.maxX - expected.minX) - (expected.maxY - expected.minY)) > 32,
      "the occluder must project to a rectangle that is clearly not square",
    );
    for (const [name, got, want] of [
      ["minX", measured.minX, expected.minX], ["maxX", measured.maxX, expected.maxX],
      ["minY", measured.minY, expected.minY], ["maxY", measured.maxY, expected.maxY],
    ]) {
      assert.ok(
        Math.abs(got - want) <= 1.5,
        `${label} shadow ${name}: rendered ${got}, light transform predicts ${want.toFixed(2)}`,
      );
    }
    // Filled, not merely bounded: both triangles of the quad rasterised.
    const area = (expected.maxX - expected.minX) * (expected.maxY - expected.minY);
    assert.ok(
      Math.abs(measured.occluded - area) / area < 0.02,
      `${label} shadow covers ${measured.occluded} texels; the predicted rectangle is ` +
      `${area.toFixed(0)}`,
    );
    // The quad is flat and perpendicular to the light, so every occluded texel holds one value.
    assert.ok(
      Math.abs(measured.low - expected.depth) < 1e-5,
      `${label} shadow records depth ${measured.low}; the light transform predicts ` +
      `${expected.depth}`,
    );
    assert.equal(measured.high, 1, "everything the occluder misses stays at the far plane");
  }

  // The light points straight down, so raising the occluder brings it nearer the light.
  assert.ok(
    shadow.high.low < shadow.low.low,
    `the higher quad must record the smaller depth: ${shadow.high.low} vs ${shadow.low.low}`,
  );
  // And by exactly as much as the projection's depth scale says those heights are worth.
  const heightGap = shadow.quad.High - shadow.quad.Low;
  const perUnit = predict(0).depth - predict(1).depth;
  assert.ok(
    Math.abs((shadow.low.low - shadow.high.low) - perUnit * heightGap) < 1e-5,
    `${heightGap} world units apart must record ${(perUnit * heightGap).toFixed(6)} of depth, ` +
    `not ${(shadow.low.low - shadow.high.low).toFixed(6)}`,
  );
  // Both heights cover the same texels: only the depth changed.
  assert.deepEqual(
    [shadow.high.minX, shadow.high.maxX, shadow.high.minY, shadow.high.maxY, shadow.high.occluded],
    [shadow.low.minX, shadow.low.maxX, shadow.low.minY, shadow.low.maxY, shadow.low.occluded],
    "moving the occluder along the light's axis must not move its shadow",
  );

  // End really unbinds the map: the same draw, outside the pass, reaches none of it.
  assert.deepEqual(
    [shadow.outsidePass.low, shadow.outsidePass.high, shadow.outsidePass.occluded], [1, 1, 0],
    "a draw outside Begin/End must not write to the shadow map",
  );

  // Ordering, refused by CNA rather than by this binding: each answers a nonzero result code
  // rather than being accepted or being turned away by a managed guard.
  for (const [name, outcome] of Object.entries(shadow.ordering)) {
    assert.notEqual(outcome, "ACCEPTED", `${name} must be refused`);
    assert.match(outcome, /^[1-9][0-9]*$/, `${name} is refused by CNA with a result code: ${outcome}`);
  }
}
