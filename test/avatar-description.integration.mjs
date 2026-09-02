// SPDX-License-Identifier: MS-PL
//
// `AvatarDescription`, which needs no gamer service.
//
// The rest of the avatar surface refuses, and rightly: a renderer needs avatar assets and a
// signed-in gamer this host does not have. A *description* needs neither, so it is projected.
//
// The surprise is what `CreateRandom` returns, and it is worth stating before the assertions read
// oddly: **it is not random**. XNA 4.0's own implementation never randomises anything -- it hands
// back an all-zero, and therefore invalid, description, and the `bodyType` overload validates its
// argument and then ignores it. CNA reproduces both on purpose and says so in its source
// ("Preserved exactly, not fixed"). This file asserts that behaviour, because projecting the
// variety the name implies would mean inventing it.
//
// The first version of this file assumed randomness and failed. The probe that "confirmed"
// randomness had read past the end of a buffer; a correctly sequenced one showed 1021 zero bytes
// every time. Both are recorded in `docs/non-engine-census.md`.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { GamerServices, LoadNodeNativeBackend } from "../dist/index.js";
import { CNA_ABI_MAJOR, CNA_ABI_MINOR } from "../dist/internal/abi.js";
import { assertAvatarEvidence } from "./support/non-engine-oracle.mjs";

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

const { AvatarBodyType, AvatarDescription } = GamerServices;

/** CNA's own constant, and the length the canonical constructor requires. */
const DESCRIPTION_BYTES = 1021;

/**
 * The same evidence shape the browser page produces, so both backends face one oracle.
 *
 * The point is not to save lines. An avatar description is 1021 zero bytes and a verdict on them
 * whether CNA is reached through a Node-API bridge or an Emscripten module, and two suites with
 * their own copies of that expectation is how they come to disagree about it and both stay green.
 */
function avatarEvidence() {
  const random = AvatarDescription.CreateRandom();
  const female = AvatarDescription.CreateRandom(AvatarBodyType.Female);
  const male = AvatarDescription.CreateRandom(AvatarBodyType.Male);
  const rebuilt = new AvatarDescription(random.Description);
  let shortRefused = "ACCEPTED";
  try { new AvatarDescription(new Array(10).fill(0)); }
  catch (error) { shortRefused = error?.constructor?.name ?? "unknown"; }
  let badBodyType = "ACCEPTED";
  try { AvatarDescription.CreateRandom(99); }
  catch (error) { badBodyType = error?.constructor?.name ?? "unknown"; }
  return {
    length: random.Description.length,
    allZero: random.Description.every((byte) => byte === 0),
    isValid: random.IsValid,
    bodyType: random.BodyType,
    height: random.Height,
    twoCallsAgree: female.Description.every((byte, at) => byte === male.Description[at]),
    bodyTypesAgree: female.BodyType === male.BodyType,
    roundTrip: rebuilt.Description.every((byte, at) => byte === random.Description[at]),
    rebuiltValid: rebuilt.IsValid,
    rebuiltBodyType: rebuilt.BodyType,
    shortRefused,
    badBodyType,
  };
}

test("the Node backend's avatar evidence satisfies the shared oracle", () => {
  assertAvatarEvidence(avatarEvidence());
});

test("CreateRandom returns XNA's all-zero description, every time", () => {
  const first = AvatarDescription.CreateRandom();
  const second = AvatarDescription.CreateRandom();
  for (const description of [first, second]) {
    assert.equal(
      description.Description.length, DESCRIPTION_BYTES,
      "a description is exactly one description's worth of bytes",
    );
    assert.ok(
      description.Description.every((byte) => byte === 0),
      "and every byte of it is zero -- XNA's own CreateRandom randomises nothing, and CNA " +
      "reproduces that deliberately rather than inventing variety the name implies",
    );
    assert.equal(
      description.IsValid, false,
      "an all-zero description is not a usable avatar, which is what makes IsValid worth having",
    );
  }
  assert.deepEqual(
    [...first.Description], [...second.Description],
    "two calls agree, because there is nothing to disagree about",
  );
});

test("the bodyType overload validates its argument and then ignores it", () => {
  // Both halves are XNA's behaviour. Asserting only the first would let a projection that quietly
  // started honouring the argument pass, and asserting only the second would let one that stopped
  // validating pass.
  const female = AvatarDescription.CreateRandom(AvatarBodyType.Female);
  const male = AvatarDescription.CreateRandom(AvatarBodyType.Male);
  assert.deepEqual(
    [...female.Description], [...male.Description],
    "the requested body type reaches CNA, is checked, and changes nothing about the result",
  );
  assert.equal(
    female.BodyType, male.BodyType,
    "so both report the same body type -- read out of the zeroed bytes, not echoed back",
  );
  assert.equal(
    female.BodyType, AvatarBodyType.Female,
    "and that is Female, which is what a description with no body type in it defaults to",
  );
});

test("a description round-trips through its own bytes", () => {
  const original = AvatarDescription.CreateRandom(AvatarBodyType.Female);
  const rebuilt = new AvatarDescription(original.Description);
  assert.deepEqual(
    rebuilt.Description, original.Description,
    "the bytes survive being handed back to the constructor",
  );
  assert.equal(
    rebuilt.BodyType, original.BodyType,
    "and the body type is read out of the bytes by CNA rather than defaulted here -- the " +
    "constructor used to report Male for any input at all, including none",
  );
  assert.equal(rebuilt.IsValid, original.IsValid);
  assert.notEqual(
    rebuilt.Description, original.Description,
    "Description hands back a copy, so a caller cannot edit the description in place",
  );
});

test("Description is a copy each time it is read", () => {
  const description = AvatarDescription.CreateRandom();
  const first = description.Description;
  first[0] = (first[0] + 1) & 0xff;
  assert.notDeepEqual(
    first, description.Description,
    "editing what one read returns must not change what the next read returns",
  );
});

test("a wrong-length description is refused rather than padded", () => {
  for (const length of [0, 1, DESCRIPTION_BYTES - 1, DESCRIPTION_BYTES + 1]) {
    assert.throws(
      () => new AvatarDescription(new Array(length).fill(0)),
      (error) => error != null,
      `a ${length}-byte description must be refused, not accepted and silently resized`,
    );
  }
  assert.doesNotThrow(
    () => new AvatarDescription(new Array(DESCRIPTION_BYTES).fill(0)),
    "and exactly one description's worth of bytes is accepted",
  );
});

test("an all-zero description is well-formed but not valid", () => {
  const zeroed = new AvatarDescription(new Array(DESCRIPTION_BYTES).fill(0));
  assert.equal(zeroed.Description.length, DESCRIPTION_BYTES);
  assert.equal(
    zeroed.IsValid, false,
    "validity is decided by the description's first byte, not by whether there are any bytes -- " +
    "which is what IsValid used to answer",
  );
  // There is deliberately no "and a valid one answers true" here: nothing this package can build
  // without a gamer *is* valid, so claiming the pair would be claiming something unmeasured.
  assert.equal(
    zeroed.BodyType, AvatarBodyType.Female,
    "and it still reports a body type, which comes from CNA reading the bytes",
  );
});

test("a body type that is not one is refused by name", () => {
  for (const bad of [99, -1, 2]) {
    assert.throws(
      () => AvatarDescription.CreateRandom(bad),
      (error) => error?.constructor?.name === "ArgumentOutOfRangeException",
      `${bad} is not an AvatarBodyType, and XNA refuses it by that name`,
    );
  }
});

test("what still needs a gamer still refuses", () => {
  // Nothing here fabricates a service: reading an avatar off a gamer needs a gamer, and this host
  // has none.
  assert.throws(
    () => AvatarDescription.BeginGetFromGamer(null, null, null),
    (error) => error?.constructor?.name === "GamerServicesNotAvailableException",
  );
});
