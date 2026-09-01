// SPDX-License-Identifier: MS-PL

/**
 * The sky, light probes and clustered lighting: three families whose answers are arithmetic, and
 * whose expectations are therefore computed here rather than recognised.
 *
 * What each is checked against:
 *
 *   the skybox's view ray     a ninety-degree frustum's own corners, and a yaw that rotates them
 *   equirectangular mapping   `u = 0.5 + atan2(x, -z) / 2pi`, `v = 0.5 - asin(y) / pi`
 *   the GGX importance sample the normal itself at roughness zero, because a mirror scatters once
 *   a probe's irradiance      Ramamoorthi and Hanrahan's nine terms, restated from `LightProbeEXT.cpp`
 *   a volume's interpolation  the linear blend two corner probes make along one axis
 *   the cluster grid          `near * (far / near) ^ (slice / sliceCount)`, and `s*tx*ty + y*tx + x`
 *   the assignment            its own per-cluster lists, summed, against its own total
 *   the shadow budget         one request per shadow-casting light, and a budget of one selecting one
 *
 * The sky's own radiance model is not reimplemented -- it is a fitted analytic sky and restating it
 * would be transcription rather than prediction. What is asserted about it is what a model must do:
 * every component non-negative, the turbidity reaching it, and the direction reaching it.
 */

import assert from "node:assert/strict";

function near(actual, expected, message, epsilon = 1e-4) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon * Math.max(1, Math.abs(expected)),
    `${message}: got ${actual}, expected ${expected}`,
  );
}

/** `LightProbeEXT.cpp`: the cosine lobe's own coefficients, folded with the basis normalisation. */
const C1 = 0.429043, C2 = 0.511664, C3 = 0.743125, C4 = 0.886227, C5 = 0.247708;

/** The same nine-term reconstruction CNA evaluates, over three channels. */
export function probeIrradiance(coefficients, normal) {
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  const n = length > 1e-8 ? normal.map((c) => c / length) : [0, 1, 0];
  return [0, 1, 2].map((channel) => {
    const at = (index) => coefficients[index][channel];
    const value = C4 * at(0)
      + 2 * C2 * (at(1) * n[1] + at(2) * n[2] + at(3) * n[0])
      + 2 * C1 * (at(4) * n[0] * n[1] + at(5) * n[1] * n[2] + at(7) * n[0] * n[2])
      + C3 * at(6) * n[2] * n[2] - C5 * at(6)
      + C1 * at(8) * (n[0] * n[0] - n[1] * n[1]);
    return Math.max(value, 0);
  });
}

/** Asserts the whole three-family scenario. */
export function assertEngineArithmeticEvidence(evidence) {
  assert.equal(
    evidence.evidenceError ?? null, null,
    `the engine layer was present and the scenario failed: ${evidence.evidenceStack ?? ""}`,
  );

  // --- the sky ------------------------------------------------------------------------------------
  assert.equal(evidence.sky.supported, true, "the atmospheric sky reports itself supported here");
  /*
   * The sun direction comes back **normalised**, which is what the header says the sky does with
   * it and is not what the raw value was: `(0.3, 0.8, -0.5)` has a length of 0.98995. Asserted as
   * the normalisation of what was written, so the property survives a different test vector.
   */
  const sunLength = Math.hypot(0.3, 0.8, -0.5);
  [0.3, 0.8, -0.5].forEach((component, axis) => {
    near(
      evidence.sky.sunDirection[axis], component / sunLength,
      `the sun direction is stored normalised, axis ${axis}`,
    );
  });
  near(Math.hypot(...evidence.sky.sunDirection), 1, "and is a unit vector");
  assert.equal(evidence.sky.turbidity, 3.5);
  assert.equal(evidence.sky.intensity, 1.25);
  const radiances = Object.fromEntries(evidence.sky.radiance.map(([label, , value]) => [label, value]));
  for (const [label, value] of Object.entries(radiances)) {
    for (const channel of value) {
      assert.ok(channel >= 0, `${label} radiance has a negative component: ${value}`);
    }
  }
  // The direction reaches the model: rays that differ produce radiances that differ.
  assert.notDeepEqual(
    radiances.overhead, radiances["horizon toward the sun"],
    "the view direction must reach the sky model",
  );
  assert.notDeepEqual(
    radiances["horizon toward the sun"], radiances["horizon away"],
    "and the sun direction must, so the two horizons are not the same colour",
  );
  // And so does the turbidity: a heavily hazy sky is a different answer for the same ray.
  assert.notDeepEqual(
    evidence.sky.radianceHazy, radiances.overhead,
    "the turbidity must reach the sky model",
  );
  assert.ok(evidence.sky.modelGlslLength > 0, "and the model ships its own GLSL");

  /*
   * The view ray, which is the other half of checking a drawn sky and is exactly predictable.
   *
   * The camera is a ninety-degree square frustum looking down -Z, so the centre of the screen looks
   * along -Z and each edge is forty-five degrees off it: `(±1/sqrt2, 0, -1/sqrt2)` and the same
   * down the other axis. A quarter turn of yaw takes the centre ray onto the -X axis.
   */
  const rays = Object.fromEntries(evidence.skybox.viewRays.map(([label, , , ray]) => [label, ray]));
  const root = Math.SQRT1_2;
  const expectRay = (label, expected) => {
    rays[label].forEach((component, axis) => {
      near(component, expected[axis], `the ${label} view ray, axis ${axis}`, 1e-3);
    });
  };
  expectRay("centre", [0, 0, -1]);
  expectRay("left", [-root, 0, -root]);
  expectRay("right", [root, 0, -root]);
  expectRay("up", [0, root, -root]);
  expectRay("down", [0, -root, -root]);
  evidence.skybox.yawedCentre.forEach((component, axis) => {
    near(component, [-1, 0, 0][axis], `a quarter turn of yaw rotates the centre ray, axis ${axis}`, 1e-3);
  });
  assert.equal(evidence.skybox.supported, true);
  assert.equal(evidence.skybox.hasEnvironment, true, "the skybox holds the cube it was given");
  assert.equal(evidence.skybox.yaw, 0.75);
  assert.equal(evidence.skybox.intensity, 1.5);
  assert.deepEqual(evidence.skybox.tint, [0.25, 0.5, 0.75]);

  // The equirectangular mapping, computed here from the same two inverse trigonometric functions.
  for (const [label, direction, uv] of evidence.environment.equirectangular) {
    const u = 0.5 + Math.atan2(direction[0], -direction[2]) / (2 * Math.PI);
    const v = 0.5 - Math.asin(Math.min(Math.max(direction[1], -1), 1)) / Math.PI;
    near(uv[0], u, `${label} maps to u`, 1e-4);
    near(uv[1], v, `${label} maps to v`, 1e-4);
  }
  // At roughness zero the importance sample is the normal itself, whatever the sample point: a
  // perfect mirror scatters in one direction only. This is what says the roughness reached CNA.
  for (const sample of evidence.environment.ggxMirror) {
    sample.forEach((component, axis) => {
      near(component, [0, 1, 0][axis], `a mirror scatters along its normal, axis ${axis}`, 1e-4);
    });
  }
  assert.equal(
    new Set(evidence.environment.ggxRough.map((s) => s.join(","))).size, 2,
    "a rough surface scatters two sample points in two directions",
  );
  for (const sample of evidence.environment.ggxRough) {
    near(Math.hypot(...sample), 1, "and every scattered direction is a unit vector", 1e-4);
  }

  // --- light probes ---------------------------------------------------------------------------------
  assert.deepEqual(evidence.probe.position, [1, 2, 3]);
  // Every one of the nine, to within the float32 the coefficients are stored in: `0.9` is
  // `0.8999999761581421` there, so an exact comparison would be testing JavaScript's literals.
  assert.equal(evidence.probe.coefficients.length, 9, "a second-order probe has nine coefficients");
  evidence.probe.coefficients.forEach((coefficient, index) => {
    coefficient.forEach((channel, axis) => {
      near(
        channel, evidence.probe.written[index][axis],
        `coefficient ${index} channel ${axis} round-trips`, 1e-6,
      );
    });
  });
  // And all twenty-seven values are distinct, so a coefficient read at a neighbour's offset comes
  // back as a number that belongs to something else.
  const flattened = evidence.probe.written.flat();
  assert.equal(new Set(flattened).size, flattened.length, "the written coefficients are distinct");
  assert.equal(evidence.probe.isZero, false, "a probe with coefficients is not a zero probe");
  for (const [label, normal, value] of evidence.probe.irradiance) {
    const expected = probeIrradiance(evidence.probe.written, normal);
    value.forEach((channel, axis) => {
      near(channel, expected[axis], `the irradiance toward ${label}, channel ${axis}`, 1e-4);
    });
  }
  // The normal is normalised inside CNA, so a longer one is the same direction.
  const along = evidence.probe.irradiance.find(([label]) => label === "+Y")[2];
  const unnormalised = evidence.probe.irradiance.find(([label]) => label === "unnormalised")[2];
  assert.deepEqual(unnormalised, along, "an unnormalised normal is normalised before use");
  // And the nine coefficients really are nine: opposite normals give different answers, which a
  // reconstruction that read only the constant term could not.
  const negativeY = evidence.probe.irradiance.find(([label]) => label === "-Y")[2];
  assert.notDeepEqual(along, negativeY, "the directional terms reach the reconstruction");

  assert.equal(evidence.probe.visibility.has, true);
  assert.equal(evidence.probe.visibility.mean, 4.5);
  assert.equal(evidence.probe.visibility.meanSquared, 25);
  assert.equal(
    evidence.probe.visibility.weightNear, 1,
    "a point nearer than the mean occluder distance is fully visible",
  );
  assert.ok(
    evidence.probe.visibility.weightFar < 0.01,
    `and one far past it is not (${evidence.probe.visibility.weightFar})`,
  );

  // The volume: two probes ten units apart, so the DC term across the axis is a straight line.
  assert.deepEqual(evidence.volume.bounds, [[0, 0, 0], [10, 0, 0]]);
  assert.deepEqual(evidence.volume.counts, [2, 1, 1, 2]);
  assert.deepEqual(
    evidence.volume.contains.map(([, inside]) => inside), [true, false, false],
    "the box contains its own interior and neither point outside it",
  );
  for (const [t, coefficient] of evidence.volume.interpolated) {
    const expected = 1 + 2 * t;
    for (const channel of coefficient) {
      near(channel, expected, `the interpolated DC term at ${t} of the way across`, 1e-4);
    }
  }
  // And the irradiance follows it: a constant probe's irradiance is `C4` times its DC term, so the
  // ratio between the two ends is the ratio between the two probes.
  const [[, dark], , [, bright]] = evidence.volume.irradianceAcross;
  near(bright[0] / dark[0], 3, "the far end is three times the near one, as its DC term is", 1e-3);

  // The baker: six faces, six different views, one shared projection.
  assert.equal(evidence.baker.supported, true, "the baker reports itself supported here");
  assert.equal(evidence.baker.faceCount, 6);
  assert.equal(evidence.baker.nearPlane, 0.25);
  assert.equal(evidence.baker.farPlane, 60);
  assert.equal(
    new Set(evidence.baker.faceViews.map((m) => m.join(","))).size, 6,
    "the six face views are six different transforms",
  );
  const capture = evidence.baker.capture;
  assert.equal(capture.failed ?? null, null, capture.failed ?? "");
  assert.equal(capture.faces, 6, "a bake drives the callback once per cube face");
  assert.equal(capture.distinctViews, 6, "with a different view each time");
  assert.equal(
    capture.distinctProjections, 1,
    "and one projection, because every cube face is the same ninety-degree frustum",
  );
  assert.equal(capture.coefficients.length, 9, "and the baked probe carries nine coefficients");
  /*
   * A callback that throws must not unwind into compiled C, and must not be swallowed either.
   *
   * The error is held while CNA finishes the bake and rethrown afterwards, which is the same
   * contract the game's lifecycle callbacks use. "swallowed" here would mean a page whose draw
   * failed got a probe baked from nothing and no indication of it.
   */
  assert.match(
    String(evidence.baker.throwingCallback), /RangeError: the page's own failure/,
    "a throwing capture callback surfaces after the bake rather than being swallowed",
  );

  // --- clustered lighting -----------------------------------------------------------------------------
  assert.deepEqual(
    Object.fromEntries(evidence.clustered.usable),
    {
      "a point light with a range": true,
      "one with no range": false,
      // CNA's own rule, and not the obvious one: a light with no intensity is still a usable light.
      "one with no intensity": true,
    },
  );
  assert.deepEqual(evidence.clustered.added, [0, 1], "two lights take the first two indices");
  assert.equal(evidence.clustered.count, 2);
  // Every field of the growable light structure round-trips, and no two of them share a value.
  const written = evidence.clustered.readBack[0];
  assert.deepEqual(written, {
    Type: 0, Position: [1, 2, -6], Direction: [0, -1, 0], Color: [1, 0.5, 0.25],
    Intensity: 2, Range: 8, InnerAngle: 0, OuterAngle: 0, CastsShadows: true,
  });
  const spot = evidence.clustered.readBack[1];
  assert.equal(spot.Type, 1, "the second light is a spot and says so");
  assert.equal(spot.CastsShadows, false, "and does not cast");
  near(spot.OuterAngle, 0.7, "and its cone survives the round trip");

  /*
   * The influence spheres, which CNA computes from each light's own shape.
   *
   * A point light's is exactly its position and its range. A spot light's is smaller and sits along
   * its axis: the apex is *on* the sphere, so the distance from the centre back to the position is
   * the radius. Both are checked against the light rather than against a remembered number.
   */
  const [pointBounds, spotBounds] = evidence.clustered.bounds;
  assert.deepEqual(pointBounds.Center, [1, 2, -6], "a point light's sphere is centred on it");
  assert.equal(pointBounds.Radius, 8, "with its range as the radius");
  const apex = spot.Position;
  const offset = [0, 1, 2].map((axis) => spotBounds.Center[axis] - apex[axis]);
  near(Math.hypot(...offset), spotBounds.Radius, "a spot light's apex lies on its own sphere");
  const direction = spot.Direction;
  const directionLength = Math.hypot(...direction);
  offset.forEach((component, axis) => {
    near(
      component, direction[axis] / directionLength * spotBounds.Radius,
      `and the sphere sits along the cone's axis, component ${axis}`, 1e-3,
    );
  });
  assert.ok(
    spotBounds.Radius < spot.Range,
    "a cone's bound is tighter than a sphere of the same range would be",
  );

  // --- the grid -----------------------------------------------------------------------------------
  const [tilesX, tilesY, sliceCount, clusterCount] = evidence.grid.tiles;
  assert.deepEqual([tilesX, tilesY, sliceCount], [16, 8, 24]);
  assert.equal(clusterCount, tilesX * tilesY * sliceCount, "the grid is its three dimensions");
  assert.deepEqual(evidence.grid.planes, [0.5, 120]);
  assert.equal(evidence.grid.hasProjection, true);
  // The logarithmic slicing, restated from the formula the public API documents.
  const [nearPlane, farPlane] = evidence.grid.planes;
  for (const [slice, distance] of evidence.grid.sliceDistances) {
    const expected = nearPlane * Math.pow(farPlane / nearPlane, slice / sliceCount);
    near(distance, expected, `slice ${slice} sits at`, 1e-4);
  }
  // And the inverse: which slice a view distance falls in, against those same distances.
  for (const [distance, slice] of evidence.grid.sliceForDistance) {
    const expected = Math.min(
      Math.max(Math.floor(
        Math.log(Math.max(distance, nearPlane) / nearPlane)
        / Math.log(farPlane / nearPlane) * sliceCount), 0), sliceCount - 1);
    assert.equal(
      slice, expected,
      `a view distance of ${distance} falls in slice ${slice}; the grid's own splits say ${expected}`,
    );
  }
  // The cluster index is the flattening a shader has to agree with, and it is x-major.
  for (const [[x, y, slice], index] of evidence.grid.clusterIndex) {
    assert.equal(
      index, slice * tilesX * tilesY + y * tilesX + x,
      `cluster (${x}, ${y}, ${slice}) is index ${index}`,
    );
  }
  // A cluster's box lies inside its own slice's depth range, and further clusters are further away.
  for (const [[, , slice], min, max] of evidence.grid.bounds) {
    const nearOfSlice = nearPlane * Math.pow(farPlane / nearPlane, slice / sliceCount);
    const farOfSlice = nearPlane * Math.pow(farPlane / nearPlane, (slice + 1) / sliceCount);
    // View space looks down -Z, so a cluster's depth is negative and grows more negative with the
    // slice index.
    assert.ok(
      -max[2] >= nearOfSlice * 0.99 && -min[2] <= farOfSlice * 1.01,
      `cluster in slice ${slice} spans ${-max[2]}..${-min[2]}, outside its own ` +
      `${nearOfSlice}..${farOfSlice}`,
    );
  }

  // --- the assignment and the budget ----------------------------------------------------------------
  assert.equal(evidence.assignment.lightCount, 2);
  assert.equal(evidence.assignment.clusterCount, clusterCount);
  assert.ok(evidence.assignment.totalReferences > 0, "the two lights reach some clusters");
  assert.ok(
    evidence.assignment.maxPerCluster <= 2,
    "and no cluster can hold more of them than there are",
  );
  // Two routes over one table: the per-cluster lists, summed, are the total the assignment reports.
  assert.equal(
    evidence.assignment.summed.total, evidence.assignment.totalReferences,
    "every cluster's list summed must be the total the assignment reports",
  );
  assert.ok(
    evidence.assignment.summed.populated > 0
    && evidence.assignment.summed.populated < clusterCount,
    "some clusters have lights and some do not, which is what an assignment is for",
  );

  assert.equal(evidence.policy.budget, 1);
  // One request per *shadow-casting* light, which is one of the two here.
  assert.equal(
    evidence.policy.requestCount, 1,
    "only the light that casts shadows asks for a map",
  );
  assert.equal(evidence.policy.refusedCount, 0, "and a budget of one accommodates it");
  assert.deepEqual(evidence.policy.selected, [true, false], "so the caster is selected and the other is not");
  assert.ok(evidence.policy.scores[0] > 0, "the selected light has a positive score");
  assert.equal(evidence.policy.scores[1], 0, "and the light that never asked has none");
}
