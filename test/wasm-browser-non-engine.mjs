#!/usr/bin/env node

/**
 * The non-engine backend families, proved in a real browser.
 *
 * Fifteen backend interfaces were absent from the WebAssembly backend before this suite existed,
 * and a route answering `INVALID_HANDLE` to a null argument was all that had been asked of them.
 * That is not evidence: it says CNA reached validation, not that anything works. So every family
 * here is driven with real arguments through the public API where XNA has one, and the answers are
 * checked by `test/support/non-engine-oracle.mjs` -- the same oracle the Node backend's evidence is
 * checked by, so a browser and a desktop disagreeing is a failure rather than two green suites.
 *
 * The page is run **once** and every test reads that one run. The engine suite launches a browser
 * per test, which is honest but slow, and here it would also be wrong: this page's families share
 * state -- the clipboard, the Guide's pending dialog, a storage container -- so twenty independent
 * runs would each be measuring a different first frame.
 *
 * The device layer is the one family whose expected answer depends on the artifact:
 * `CNA_DEVICES=ON` makes it present, and the default build makes every one of its routes refuse.
 * Both branches are asserted, and an ordinary run takes its expectation from what the artifact says
 * about itself so that either build is a real run. That is deliberately not a *claim*, so a
 * strong-artifact qualification sets `CNA_REQUIRE_WASM_DEVICE_LAYER=1` and the run fails by name
 * where the layer is missing.
 *
 *   CNA_WASM_ARTIFACT_DIR=.../cmake-build-tswasm-fx/modules/c-api node --test \
 *     test/wasm-browser-non-engine.mjs
 */

import assert from "node:assert/strict";

import { browserBlocked, runFrames, WASM_DIR } from "./support/browser-harness.mjs";
import { requiredSuite } from "./support/required-suite.mjs";
import {
  assertAvatarEvidence,
  assertContentSurveyEvidence,
  assertDeviceLayerEvidence,
  assertExtendedInputEvidence,
  assertGamerServicesEvidence,
  assertGameWindowEvidence,
  assertGraphicsAdapterEvidence,
  assertInputDeviceEvidence,
  assertLateMemberEvidence,
  assertMediaEvidence,
  assertMediaLibraryEvidence,
  assertSensorEvidence,
  assertSpriteFontEvidence,
  assertStorageEvidence,
  assertVideoEvidence,
  assertXactEvidence,
} from "./support/non-engine-oracle.mjs";

/**
 * A qualification run must prove these ran rather than reporting a green suite of skips, so the
 * gate is the shared one: `CNA_REQUIRE_NON_ENGINE_WASM_TESTS=1` turns a skip into a failure by
 * name and prints the executed and skipped counts either way.
 */
const { test, skip } = requiredSuite({
  label: "non-engine WebAssembly",
  envVar: "CNA_REQUIRE_NON_ENGINE_WASM_TESTS",
  counter: "NON_ENGINE_WASM_TESTS",
  blocked: browserBlocked,
});
/**
 * The one run every test reads.
 *
 * The harness failure is caught rather than allowed to reject a top-level await, because a
 * rejected module registers *no tests at all* -- and `node --test` then reports zero passes and
 * zero failures, which the mutation harness correctly refuses to score and a human reads as a
 * green run. A mutant that walked a string array at the wrong stride made the page hang until
 * Playwright's timeout, and that is exactly how it was found: `REFUSED`, not `KILLED`.
 */
const run = skip ? null : await runFrames(1, "non-engine-page.html")
  .catch((error) => ({
    result: { status: "failed", error: String(error?.stack ?? error), errors: [], frames: 0 },
    consoleErrors: [],
  }));
const evidence = run?.result?.evidence ?? {};

/**
 * Whether the artifact must have CNA's device layer.
 *
 * Reading the expectation out of the artifact's own answer is right for an ordinary run -- both
 * builds are legitimate and both branches are worth exercising -- and useless as a claim, because
 * an artifact that answered "absent" for the wrong reason would still pass. `CNA_REQUIRE_WASM_DEVICE_LAYER=1`
 * is what a strong-artifact qualification sets, and it fails by name where the layer is missing.
 */
const requireDeviceLayer = process.env.CNA_REQUIRE_WASM_DEVICE_LAYER === "1";

test("the page ran, drew a frame and released its game", { skip }, () => {
  assert.equal(run.result.status, "ok", run.result.error ?? "");
  assert.match(run.result.abiVersion, /^0\.21\./);
  assert.ok(run.result.frames >= 1, `expected at least one frame, saw ${run.result.frames}`);
  assert.equal(run.result.disposed, true);
  assert.deepEqual(run.result.errors, []);
  assert.deepEqual(run.consoleErrors, []);
  console.log(`CNA_TS_NON_ENGINE_ARTIFACT=${WASM_DIR}`);
});

test("avatar descriptions, which need no gamer service", { skip }, () => {
  assertAvatarEvidence(evidence.avatar);
});

test("MeasureString agrees with CNA's own SpriteFont over one glyph table", { skip }, () => {
  assertSpriteFontEvidence(evidence.spriteFont);
});

test("the game window's title, bounds and resize event", { skip }, () => {
  assertGameWindowEvidence(evidence.window);
});

test("the clipboard round-trips and the device inventory is consistent", { skip }, () => {
  assertInputDeviceEvidence(evidence.inputDevices);
  console.log(
    `CNA_TS_BROWSER_ATTACHED=mice:${evidence.inputDevices.mice.length} ` +
    `keyboards:${evidence.inputDevices.keyboards.length} ` +
    `touch:${evidence.inputDevices.touchCount}`,
  );
});

test("four sensors, unsupported on this host and driven through CNA's test backends", { skip }, () => {
  assertSensorEvidence(evidence.sensors);
  const support = evidence.sensors.support;
  const physical = Object.entries(support).filter(([, value]) => value).map(([name]) => name);
  console.log(
    `CNA_TS_SENSORS=SYNTHETIC_BACKEND_VERIFIED physical:${physical.length === 0 ? "none" : physical.join(",")}`,
  );
});

test("storage creates, lists, reads and deletes", { skip }, () => {
  assertStorageEvidence(evidence.storage);
});

test("the content survey separates a compiled asset from a loose one", { skip }, () => {
  assertContentSurveyEvidence(evidence.contentSurvey);
});

test("the media player's state, and a visualisation of silence", { skip }, () => {
  assertMediaEvidence(evidence.media);
});

test("an empty media library is an answer rather than a failure", { skip }, () => {
  assertMediaLibraryEvidence(evidence.mediaLibrary);
});

test("the Guide's message box and keyboard input complete exactly once", { skip }, () => {
  assertGamerServicesEvidence(evidence.gamerServices);
});

test("XACT plays a cue from banks this repository authored", { skip }, () => {
  assertXactEvidence(evidence.xact);
});

test("the video player controls, with no decoder behind it", { skip }, () => {
  assertVideoEvidence(evidence.video);
});

test("text composition round-trips through CNA and stops when unsubscribed", { skip }, () => {
  assertExtendedInputEvidence(evidence.extendedInput);
  console.log(
    `CNA_TS_BROWSER_EXTENDED_INPUT=joysticks:${evidence.extendedInput.joystickCount} ` +
    `haptics:${evidence.extendedInput.hapticCount} PHYSICAL_HARDWARE_NOT_VERIFIED`,
  );
});

test("the graphics adapters a live device reports", { skip }, () => {
  assertGraphicsAdapterEvidence(evidence.graphicsAdapters);
  console.log(
    `CNA_TS_BROWSER_ADAPTER=${JSON.stringify(evidence.graphicsAdapters.adapters[0].DeviceName)}`,
  );
});

test("the members a family-level frontier could not see", { skip }, () => {
  assertLateMemberEvidence(evidence.lateMembers);
  console.log(
    `CNA_TS_BROWSER_MICROPHONES=${evidence.lateMembers.microphones.length} ` +
    "PHYSICAL_CAPTURE_NOT_VERIFIED",
  );
});

test("CNA's device layer, present or absent as the artifact was built", { skip }, () => {
  const available = evidence.devices?.available;
  assert.equal(typeof available, "boolean", "the layer answers whether it is there");
  if (requireDeviceLayer) {
    assert.equal(available, true,
      `CNA_REQUIRE_WASM_DEVICE_LAYER=1 but the artifact at ${WASM_DIR} reports ` +
      "cna_devices_ext_is_available false; build CNA with -DCNA_DEVICES=ON");
  }
  assertDeviceLayerEvidence(evidence.devices, { expectAvailable: available });
  console.log(`CNA_TS_WASM_DEVICES=${available ? "ON" : "OFF"}`);
});
