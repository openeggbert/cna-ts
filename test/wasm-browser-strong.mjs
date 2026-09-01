#!/usr/bin/env node

/**
 * The browser suite for an artifact built with CNA's optional runtimes.
 *
 * `wasm-browser.mjs` deliberately asks the artifact in front of it what it can do and asserts the
 * consequences of either answer, because a consumer's artifact is theirs to build and the default
 * one carries neither optional runtime. That is the right shape for the ordinary suite and it is
 * useless as a *claim*: a run against the default artifact takes the refusal branch, passes, and
 * proves nothing at all about compiled effects.
 *
 * So the claim lives here instead, and this file cannot take a weaker branch. With
 * `CNA_REQUIRE_STRONG_WASM_TESTS=1` it fails, by name and before a test registers, when
 *
 *   - there is no artifact to point at;
 *   - `cna_graphics_ext_is_available` answers false, so the artifact has no `CNA_CNAEXT`;
 *   - the artifact refuses a compiled effect, so it has no `CNA_EASYGL_COMPILED_EFFECTS`;
 *   - the page produced no compiled-effect evidence at all;
 *
 * and the shared `requiredSuite` gate refuses a run in which nothing executed or anything skipped.
 * Every arm is exercised in `test/wasm-strong-gate.test.mjs`, against the shape the default
 * artifact really produces, because a gate nobody has watched fail is a gate nobody knows the
 * shape of.
 *
 * Build such an artifact with:
 *
 *     emcmake cmake -S . -B cmake-build-tswasm-fx -G Ninja \
 *       -DCMAKE_BUILD_TYPE=Release -DCNA_BUILD_C_API=ON \
 *       -DCNA_GRAPHICS_RENDERER=WEBGL2 \
 *       -DCNA_EASYGL_COMPILED_EFFECTS=ON -DCNA_CNAEXT=ON
 *     cmake --build cmake-build-tswasm-fx --target cna_c_api_wasm
 */

import assert from "node:assert/strict";
import { after } from "node:test";

import { browserBlocked, runFrames, WASM_DIR } from "./support/browser-harness.mjs";
import { assertCompiledEffectEvidence } from "./support/compiled-effect-oracle.mjs";
import { requiredSuite } from "./support/required-suite.mjs";
import { strongArtifactBlocked } from "./support/strong-artifact-gate.mjs";

/**
 * The page is run once and every test reads that one run.
 *
 * Not an optimisation: the capability gate below has to be decided from the *running artifact*
 * rather than from a build flag or a file name, so the page has to have run before the suite knows
 * whether it may skip -- and running it again per test would be three more browsers for answers
 * that cannot differ.
 */
const evidence = browserBlocked ? null : await runFrames(60);

/** What the artifact answered, or null where the harness could not ask. */
const capabilities = evidence == null ? null : {
  status: evidence.result.status,
  cnaext: evidence.result.extensions?.graphicsExtensionLayer ?? null,
  compiled: evidence.result.compiledEffect ?? null,
};

const { test } = requiredSuite({
  label: "strong-wasm",
  envVar: "CNA_REQUIRE_STRONG_WASM_TESTS",
  counter: "STRONG_WASM_TESTS",
  blocked: strongArtifactBlocked({
    browserBlocked, result: evidence?.result ?? null, wasmDir: WASM_DIR,
  }),
});

/**
 * How many of the tests below were about a compiled effect specifically.
 *
 * Counted separately from the suite total because the two answer different questions: the total
 * says the strong-artifact suite ran, and this says the compiled-effect claim in particular was
 * made. A run reporting four executed tests and zero compiled-effect ones would be a suite that
 * checked two capability flags and asserted no pixels.
 */
let compiledEffectTests = 0;
const compiledEffectTest = (name, body) => test(name, () => { compiledEffectTests += 1; body(); });
after(() => console.log(`COMPILED_EFFECT_BROWSER_TESTS_EXECUTED=${compiledEffectTests}`));

test("the artifact reports CNA's extended graphics layer as present", () => {
  assert.equal(capabilities.cnaext, true);
  // The same routes exist in every build and answer NOT_SUPPORTED where the layer is absent, so a
  // structurally present API is not evidence. This is the one answer that separates the two.
  console.log("STRONG_WASM_CNAEXT=ON");
});

compiledEffectTest("the artifact reports GraphicsCapability::CompiledEffects as true", () => {
  const compiled = capabilities.compiled;
  assert.equal(compiled.outcome, "created", compiled.error ?? "");
  // Stated as the negation of the default artifact's answer, because that answer is the thing this
  // suite exists to distinguish itself from: the same bytes through the same public constructor
  // give CNA result 6 there and a live effect here, and the difference is one CMake option.
  assert.equal(compiled.cnaResult ?? null, null, "nothing refused these bytes");
  console.log("STRONG_WASM_COMPILED_EFFECTS=true");
});

compiledEffectTest("a compiled effect reflects, writes through to CNA and draws predicted pixels", () => {
  assertCompiledEffectEvidence(capabilities.compiled);
  console.log(
    `COMPILED_EFFECT_BROWSER_PARAMETERS=${capabilities.compiled.parameters} ` +
    `TECHNIQUES=${capabilities.compiled.techniques} ` +
    `DRAWS=${capabilities.compiled.states.length + 2}`,
  );
});

test("the page raised nothing while doing it", () => {
  assert.deepEqual(evidence.result.errors, []);
  assert.deepEqual(evidence.consoleErrors, []);
});
