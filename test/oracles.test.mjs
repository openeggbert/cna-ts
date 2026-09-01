// SPDX-License-Identifier: MS-PL

/**
 * The oracles, checked against evidence that should fail them.
 *
 * Every browser claim in this package is an oracle applied to evidence a page produced, so an
 * oracle that accepts anything makes every suite that uses it green and meaningless. The mutation
 * harness cannot catch that: it plants a defect, rebuilds `dist`, and compares artifacts, and an
 * oracle lives in `test/support`, which `dist` does not contain — so a mutant in one leaves the
 * build byte-identical and the harness correctly refuses to score it.
 *
 * This is the check that does fit: give each oracle evidence with exactly one thing wrong and
 * require it to say so. Not a mutation of the binding — a mutation of the *evidence*, which is what
 * an oracle is for.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertEngineCensus, assertNestedStructures, assertStructureFields,
} from "./support/engine-census-oracle.mjs";

/** A census that should pass, which each case below then breaks in one place. */
function census() {
  return {
    rows: Array.from({ length: 25 }, (_, index) => ({
      name: `Class${index}`,
      constructed: true,
      failures: [],
      read: 4,
      wrote: 1,
      roundTripped: 1,
    })).concat([
      { name: "AutoExposure", constructed: false, cnaResult: 6, error: "no compute" },
      { name: "StorageBuffer", constructed: false, cnaResult: 6, error: "no compute" },
      { name: "StorageBufferTyped", constructed: false, cnaResult: 6, error: "no compute" },
    ]),
  };
}

/** Structure-field evidence that should pass. */
function fields() {
  return {
    defaults: {
      alphaCutoff: 0.5, metallic: 1, roughness: 1,
      coordinateSets: [0, 0, 0, 0, 0, 0, 0], transforms: 7,
    },
    equalsItself: true,
    equalsFreshCopy: true,
    hashOfCopiesAgree: true,
    fields: Array.from({ length: 19 }, (_, index) => [`Field${index}`, false, false, false]),
  };
}

/** Nested-structure evidence that should pass. */
function nested() {
  return {
    gltfBaseColor: [1, 1, 1, 1],
    gltfCoordinateSets: [0, 0, 0, 0, 0, 0, 0],
    gltfTransformCount: 7,
    gltfSlotCount: 7,
    nearVisible: true,
    farVisible: false,
    farNegativeVisible: false,
    emptySlot: "0",
    filledSlotIsZero: false,
    filledSlotIsPoison: false,
    clearedSlot: "0",
    cascadeState: {
      count: 3,
      blendBand: 0.375,
      splitDistance: [4.5, 18.25, 60.125, 240.0625],
      debugTint: true,
      atlasTranslations: [[1, 2, 3], [2, 4, 6], [3, 6, 9], [4, 8, 12]],
      cameraTranslation: [-7, -8, -9],
    },
    gpuCullerSupported: false,
    gpuCullerReason: "this renderer has no compute shaders",
  };
}

test("the oracles accept the evidence a working backend produces", () => {
  const totals = assertEngineCensus(census());
  assert.equal(totals.refused, 3);
  assert.equal(assertStructureFields(fields()).fields, 19);
  assert.equal(assertNestedStructures(nested()).cascades, 4);
});

/**
 * One broken thing per case, and the oracle has to find it.
 *
 * Each entry names what a real binding defect would look like in the evidence — a field that never
 * reached CNA, an array read at the wrong stride, a class refused for the wrong reason.
 */
const CASES = [
  ["a class that did not construct and is not compute-dependent", () => {
    const broken = census();
    broken.rows[0].constructed = false;
    broken.rows[0].cnaResult = 6;
    return () => assertEngineCensus(broken);
  }],
  ["a class refused by the binding rather than by CNA", () => {
    const broken = census();
    broken.rows[25].cnaResult = 0;
    return () => assertEngineCensus(broken);
  }],
  ["an accessor that does not marshal", () => {
    const broken = census();
    broken.rows[3].failures = ["Width threw"];
    return () => assertEngineCensus(broken);
  }],
  ["a census that read nothing", () => {
    const broken = census();
    for (const row of broken.rows) row.read = 0;
    return () => assertEngineCensus(broken);
  }],
  ["a census that wrote nothing", () => {
    const broken = census();
    for (const row of broken.rows) { row.wrote = 0; row.roundTripped = 0; }
    return () => assertEngineCensus(broken);
  }],
  ["a field that does not reach CNA", () => {
    const broken = fields();
    broken.fields[7] = ["AlphaCutoff", true, true, true];
    return () => assertStructureFields(broken);
  }],
  ["a field that changes the material but not its hash", () => {
    const broken = fields();
    broken.fields[7] = ["AlphaCutoff", false, true, true];
    return () => assertStructureFields(broken);
  }],
  ["a material that does not equal itself", () => {
    const broken = fields();
    broken.equalsItself = false;
    return () => assertStructureFields(broken);
  }],
  ["a texture-coordinate array read at the wrong stride", () => {
    const broken = fields();
    broken.defaults.coordinateSets = [0, 0, 0];
    return () => assertStructureFields(broken);
  }],
  ["a Vector4 whose fourth component was dropped", () => {
    const broken = nested();
    broken.gltfBaseColor = [1, 1, 1, 0];
    return () => assertNestedStructures(broken);
  }],
  ["a handle array walked at a pointer's stride", () => {
    const broken = nested();
    broken.gltfSlotCount = 13;
    return () => assertNestedStructures(broken);
  }],
  ["a bounding box whose maximum was never written", () => {
    const broken = nested();
    broken.farVisible = true;
    return () => assertNestedStructures(broken);
  }],
  ["a frustum test that answers false for everything", () => {
    const broken = nested();
    broken.nearVisible = false;
    return () => assertNestedStructures(broken);
  }],
  ["a texture slot read without its presence flag", () => {
    const broken = nested();
    broken.emptySlot = String(0xDEADBEEFDEADBEEFn);
    return () => assertNestedStructures(broken);
  }],
  ["a slot that reads back empty after being filled", () => {
    const broken = nested();
    broken.filledSlotIsZero = true;
    return () => assertNestedStructures(broken);
  }],
  ["a matrix array read at a vector's stride", () => {
    const broken = nested();
    broken.cascadeState.atlasTranslations = [[1, 2, 3], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    return () => assertNestedStructures(broken);
  }],
  ["split distances read only as far as the count", () => {
    const broken = nested();
    broken.cascadeState.splitDistance = [4.5, 18.25, 60.125, 0];
    return () => assertNestedStructures(broken);
  }],
  ["a refusal that is not CNA's own", () => {
    const broken = nested();
    broken.gpuCullerReason = "not implemented in the WebAssembly backend";
    return () => assertNestedStructures(broken);
  }],
];

for (const [name, build] of CASES) {
  test(`the oracles reject ${name}`, () => {
    assert.throws(build(), assert.AssertionError, `${name} was accepted`);
  });
}
