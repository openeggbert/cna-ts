#!/usr/bin/env node

/**
 * CNA's browser audio, behind a browser-trusted user activation.
 *
 * What this suite exists to correct: every audio claim this package made about a browser stopped
 * at "a browser will not start WebAudio without a user gesture", and no run had ever supplied one.
 * That sentence turned out to be hiding two different facts and one accident.
 *
 * - The gesture is real: a fresh `AudioContext` is `suspended` at load, and a page-initiated
 *   `element.click()` -- untrusted -- leaves it suspended. A Playwright input action does not.
 * - CNA does not need it in order to mix. SDL3's Emscripten backend pumps the audio callback from
 *   a timer while the context is suspended, so the mixer runs, CNA's own visualization tap sees
 *   the authored waveform, and only the *output* is discarded. So sample consumption was provable
 *   all along and audibility still is not.
 * - And the accident: `page.evaluate` and `page.waitForFunction` reach the page through CDP with
 *   `userGesture: true`, so the existing suites have been handing their pages an activation
 *   without asking for one. That is why this suite's pre-gesture facts come back over the
 *   harness's HTTP channel instead -- see `test/support/browser-harness.mjs`.
 *
 * What is asserted is a spectrum, not the absence of zeroes. Four tones -- two authored by
 * `test/fixtures/xact.mjs` and two by the page -- each have to land in the FFT bin arithmetic
 * predicts from their own frequency and the sample rate CNA's mixer announced, at the magnitude
 * the transform's own documented scaling implies, with the Hann window's shape around it. A
 * second and entirely independent observable, `DynamicSoundEffectInstance.PendingBufferCount`,
 * is CNA counting the same consumption itself.
 *
 * The honest ceiling is `WEB_AUDIO_RENDERING_VERIFIED`: a real context left `suspended` for a real
 * mixer that consumed real samples. Nobody listened to it, and no headless browser can.
 *
 *   node --test test/wasm-browser-audio.mjs
 *   CNA_WASM_ARTIFACT_DIR=.../cmake-build-tswasm-fx/modules/c-api node --test \
 *     test/wasm-browser-audio.mjs
 */

import assert from "node:assert/strict";

import { browserBlocked, runFrames, WASM_DIR } from "./support/browser-harness.mjs";
import { requiredSuite } from "./support/required-suite.mjs";
import {
  assertActivationIndependentMixingEvidence,
  assertDynamicBufferEvidence,
  assertMixerSpectrumEvidence,
  assertUserActivationEvidence,
  assertXactSpectrumEvidence,
} from "./support/audio-oracle.mjs";

const { test, skip } = requiredSuite({
  label: "browser audio activation",
  envVar: "CNA_REQUIRE_AUDIO_WASM_TESTS",
  counter: "AUDIO_WASM_TESTS",
  blocked: browserBlocked,
});

/**
 * The one run every test reads.
 *
 * `activate: true` is what makes this page different from every other: the harness waits for the
 * page to say it is ready on the HTTP channel and then sends a real Playwright click. Waiting any
 * other way would grant the activation before the button was pressed.
 *
 * The rejection is caught rather than left to reject a top-level await, because a module that
 * throws registers no tests and `node --test` reports that as zero passes and zero failures --
 * which reads green and which the mutation harness rightly refuses to score.
 */
const run = skip ? null : await runFrames(1, "audio-activation-page.html", { activate: true })
  .catch((error) => ({
    result: { status: "failed", error: String(error?.stack ?? error), errors: [], frames: 0 },
    consoleErrors: [], reports: [], mixerFormat: null,
  }));
const result = run?.result ?? {};
const evidence = result.evidence ?? {};
const reports = run?.reports ?? [];

test("the page runs, draws and disposes cleanly", () => {
  assert.equal(result.status, "ok", result.error ?? "the page did not finish");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(run.consoleErrors, []);
  assert.equal(result.drew, true, "the game reached Draw, so CNA's frame loop really ran");
  assert.equal(result.disposed, true);
  assert.ok(result.frames > 0);
});

test("CNA announces the format its mixer negotiated, and it is not the browser's", () => {
  // The rate every expectation below is computed from. It is CNA's own number, taken from the
  // notice it writes when the mixer opens, because the C ABI exposes no route for it and the
  // AudioContext's sample rate is a *different* rate -- SDL resamples between them. A binding
  // reading VisualizationData.Frequencies as frequencies therefore has nowhere supported to learn
  // what a bin is worth; see docs/upstream-cna-findings.md.
  assert.ok(run.mixerFormat, "no [AudioMixer] notice reached the harness, so no run happened");
  assert.ok(run.mixerFormat.freq > 0);
  assert.ok(run.mixerFormat.channels > 0);
  assert.notEqual(run.mixerFormat.freq, evidence.contextAfterActivation.sampleRate,
    "the mixer's rate and the AudioContext's are different numbers on this platform, which is " +
    `the trap: ${run.mixerFormat.freq} against ` +
    `${evidence.contextAfterActivation.sampleRate}. Reading bins at the browser's rate would put ` +
    "every tone in the wrong bin and still look like a working spectrum");
});

test("a synthetic click is not a user gesture and a Playwright click is", () => {
  assertUserActivationEvidence(reports);
});

test("CNA mixes and consumes samples while the context is still suspended", () => {
  assertActivationIndependentMixingEvidence(reports, evidence, run.mixerFormat);
});

test("two authored XACT cues land in the two bins their frequencies predict", () => {
  assertXactSpectrumEvidence(evidence, run.mixerFormat);
});

test("a SoundEffect reaches the same mixer tap, on the bin centre, with a Hann window's shape", () => {
  assertMixerSpectrumEvidence(evidence, run.mixerFormat);
});

test("CNA's own pending-buffer count drains as its mixer consumes the buffers", () => {
  assertDynamicBufferEvidence(evidence, run.mixerFormat);
});

test("what this run does and does not claim", () => {
  // Written down rather than implied. A headless browser has no speaker, so the strongest true
  // statement is that a real WebAudio context was running and a real mixer consumed the authored
  // samples -- which is what the two labels below mean and all they mean.
  assert.equal(evidence.contextAfterActivation.state, "running");
  console.log(`WEB_AUDIO_ARTIFACT=${WASM_DIR}`);
  console.log(`WEB_AUDIO_MIXER_RATE=${run.mixerFormat.freq}`);
  console.log(`WEB_AUDIO_CONTEXT_RATE=${evidence.contextAfterActivation.sampleRate}`);
  console.log("WEB_AUDIO_RENDERING_VERIFIED=1");
  console.log("XACT_SAMPLE_CONSUMPTION_VERIFIED=1");
  console.log("AUDIBLE_OUTPUT_VERIFIED=0");
});
