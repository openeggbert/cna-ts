#!/usr/bin/env node

/**
 * The strong-artifact gate, watched failing.
 *
 * `test/wasm-browser-strong.mjs` claims that a compiled effect reflects, writes through and draws
 * in a browser. That claim is only worth what its refusal is worth: a gate that passed against the
 * *default* artifact -- which has neither optional CNA runtime -- would report a green
 * qualification for a capability nobody built. The gate cannot be watched failing inside that
 * suite, because reaching its decision costs a served package, a headless Chromium and a compiled
 * artifact, so the decision is a pure function and this is where every arm of it is exercised.
 *
 * Each case below is a real shape the harness page produces. The default artifact's is the one
 * that matters most and is transcribed from an actual run of it: CNAEXT off, and CNA's own
 * `NOT_SUPPORTED` naming the capability.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { strongArtifactBlocked } from "./support/strong-artifact-gate.mjs";

const WASM_DIR = "/somewhere/cmake-build-tswasm/modules/c-api";

/** What the page reports after a run against an artifact carrying both optional runtimes. */
function strongResult(overrides = {}) {
  return {
    status: "ok",
    extensions: { graphicsExtensionLayer: true },
    compiledEffect: {
      fixture: "present", outcome: "created", parameters: 6, techniques: 2,
    },
    ...overrides,
  };
}

const gate = (result, browserBlocked = false) =>
  strongArtifactBlocked({ browserBlocked, result, wasmDir: WASM_DIR });

test("an artifact with both optional runtimes is not blocked", () => {
  assert.equal(gate(strongResult()), null);
});

test("no browser at all is refused, in the harness's own words", () => {
  assert.equal(
    gate(strongResult(), "playwright is not installed"), "playwright is not installed",
    "the harness's reason is passed through rather than replaced by a capability message",
  );
});

test("a missing page result is refused rather than read", () => {
  // The arm that would otherwise be a TypeError on `result.status`, which reads as a broken test
  // rather than as an absent artifact.
  assert.match(gate(null), /no result at all/);
});

test("a page that failed before reporting is refused with its own error", () => {
  assert.match(
    gate({ status: "failed", error: "WebGL context creation failed" }),
    /failed before it could report capabilities: WebGL context creation failed/,
  );
});

test("the DEFAULT artifact is refused, and told which option to turn on", () => {
  // Transcribed from a real run against `cmake-build-tswasm`: this is exactly what a developer
  // pointing the required gate at the ordinary artifact sees, and the whole point of the gate is
  // that they see it instead of a pass.
  const blocked = gate({
    status: "ok",
    extensions: { graphicsExtensionLayer: false },
    compiledEffect: {
      fixture: "present",
      outcome: "refused",
      cnaResult: 6,
      error: "WasmCnaError: cna_effect_create_compiled failed with CNA result 6: " +
        "compiled effect creation is not supported by this renderer " +
        "(GraphicsCapability::CompiledEffects is false).",
    },
  });
  assert.match(blocked, /cna_graphics_ext_is_available false/);
  assert.match(blocked, /-DCNA_CNAEXT=ON/);
  assert.ok(blocked.includes(WASM_DIR), "and it names the artifact it measured");
});

test("CNAEXT absent is refused on its own, even where compiled effects work", () => {
  // Not a hypothetical: the two options are independent CMake switches, so an artifact with the
  // compiled-effect runtime and no extended graphics layer is one `-D` away.
  const blocked = gate(strongResult({ extensions: { graphicsExtensionLayer: false } }));
  assert.match(blocked, /-DCNA_CNAEXT=ON/);
});

test("compiled effects absent is refused with the other option's name", () => {
  const blocked = gate(strongResult({
    compiledEffect: {
      fixture: "present", outcome: "refused", cnaResult: 6,
      error: "GraphicsCapability::CompiledEffects is false",
    },
  }));
  assert.match(blocked, /-DCNA_EASYGL_COMPILED_EFFECTS=ON/);
  assert.ok(
    !blocked.includes("CNA_CNAEXT"),
    "and not the other one -- the two causes stay distinguishable",
  );
});

test("a missing fixture sends the reader to cnanext, not to a CNA rebuild", () => {
  const blocked = gate(strongResult({ compiledEffect: { fixture: "absent" } }));
  assert.match(blocked, /CNA_SOURCE_PATH/);
  assert.ok(
    !blocked.includes("-DCNA_EASYGL_COMPILED_EFFECTS"),
    "rebuilding CNA would not produce the fixture, so the message must not suggest it",
  );
});

test("evidence missing entirely is refused rather than treated as a refusal", () => {
  // `compiledEffect` absent means the page never reached that probe; that is a different fact from
  // the artifact declining, and a gate conflating the two would blame CNA for a broken page.
  const blocked = gate(strongResult({ compiledEffect: undefined }));
  assert.match(blocked, /no compiled-effect evidence/);
});
