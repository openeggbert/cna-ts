// SPDX-License-Identifier: MS-PL

/**
 * The level-of-detail expectation, shared by the two browser suites that assert it.
 *
 * Every answer here is arithmetic over thresholds -- no device, no resource, nothing drawn -- so
 * every one of them is *predicted* rather than recognised: the distance rule is restated from
 * `LodGroupEXT.cpp`, and the screen-space projection is computed here from the radius, field of
 * view and viewport height CNA was given.
 *
 * Shared for the reason the others are: a strong-artifact suite that asserted less than the
 * ordinary one would let a defect through on the run that exists to make the claim. A planted
 * eight-byte stride for `CNA_LodLevelEXT` survived exactly that gap before this was extracted.
 */

import assert from "node:assert/strict";

/** Asserts the whole level-of-detail scenario. */
export function assertLodEvidence(lod) {
  assert.equal(
    lod.evidenceError ?? null, null,
    "the engine layer was present and the scenario failed, which is a cna-ts defect rather than " +
    "a missing CNA build option",
  );
  // An empty group draws nothing and says so with -1 rather than clamping to a level it has not
  // got. The part being null is the *same* answer for a different reason, which is why CNA gives
  // two routes and both are asked.
  assert.equal(lod.emptyCount, 0);
  assert.equal(lod.emptyIndex, -1, "an empty group selects no level");
  assert.equal(lod.emptyPart, true, "and has no part to draw");

  assert.deepEqual(lod.levels, [10, 25, 50], "the thresholds come back in order");
  assert.equal(lod.count, 3);
  assert.equal(lod.mode, 0, "distance is the default selection mode");

  // Distance selection, computed here rather than recognised. The boundary is **strict**: a level
  // covers distances *below* its threshold, so at exactly 10 the group has already moved to the
  // second level. That is `std::upper_bound` on `value < level.MaxDistance` in `LodGroupEXT.cpp`,
  // and it is worth restating rather than glossing, because "up to and including" is the reading
  // this test started with and it is wrong.
  const expected = (distance) => [10, 25, 50].findIndex((threshold) => distance < threshold);
  for (const [distance, index] of lod.selection) {
    assert.equal(
      index, expected(distance),
      `at ${distance} the group selects ${index}; the thresholds say ${expected(distance)}`,
    );
  }
  // And the boundaries are really boundaries: the selection is not constant.
  assert.ok(new Set(lod.selection.map(([, index]) => index)).size >= 4, "all four outcomes occur");

  // Hysteresis makes a boundary sticky: having settled on level 2 at distance 30, stepping back to
  // 24 -- inside the 5-unit margin around the 25 boundary -- keeps level 2, while stepping to 15
  // is past the margin and switches. Without hysteresis 24 would select level 1.
  assert.equal(lod.hysteresis.margin, 5);
  assert.equal(lod.hysteresis.settleFar, 2, "30 is in the third level");
  assert.equal(expected(24), 1, "and 24 is in the second, absent hysteresis");
  assert.equal(lod.hysteresis.smallStepBack, 2, "so a step inside the margin must not switch");
  assert.equal(lod.hysteresis.bigStepBack, 1, "and a step past it must");

  // Screen-space selection. CNA reports the projection it uses, so the same number is computed
  // here from the radius, the vertical field of view and the viewport height.
  const { radius, fov, height } = lod.screenSpace;
  assert.equal(lod.screenMode, 1, "the mode changed to ScreenSpaceError");
  const project = (distance) => (radius / (distance * Math.tan(fov / 2))) * (height / 2);
  for (const [distance, pixels] of lod.screenSpace.projected) {
    const want = project(distance);
    assert.ok(
      Math.abs(pixels - want) / want < 1e-4,
      `a radius of ${radius} at ${distance} projects to ${want.toFixed(4)} pixels, ` +
      `CNA answered ${pixels}`,
    );
  }
  // Twice as far is half as many pixels, which is the property the formula above encodes.
  const [[, atFive], [, atTen]] = [lod.screenSpace.projected[2], lod.screenSpace.projected[3]];
  assert.ok(Math.abs(atFive / atTen - 2) < 1e-4, "twice the distance is half the radius");
  // At or behind the eye the projection is meaningless, and CNA answers with the largest float
  // rather than zero or a refusal -- so the finest level is selected rather than none.
  assert.ok(lod.screenSpace.atEye > 1e37, `at the eye: ${lod.screenSpace.atEye}`);
  assert.ok(lod.screenSpace.behindEye > 1e37, `behind the eye: ${lod.screenSpace.behindEye}`);
  // Nearer is a bigger projected radius, so screen-space selection runs the other way from
  // distance selection -- which is the whole reason the two modes are different modes.
  const screenIndices = lod.screenSpace.selection.map(([, index]) => index);
  assert.ok(
    screenIndices.some((index, at) => at > 0 && index !== screenIndices[at - 1]),
    `screen-space selection must vary with distance: ${JSON.stringify(lod.screenSpace.selection)}`,
  );

  assert.equal(lod.clearedCount, 0, "Clear removes every level");
  assert.equal(lod.clearedIndex, -1, "and the group selects nothing again");
}
