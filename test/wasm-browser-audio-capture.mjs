#!/usr/bin/env node

/**
 * CNA's `Microphone`, capturing a file this repository wrote, from a device that is not one.
 *
 * The physical-hardware rule this suite exists under: it must never be possible for a run to
 * record the room. That is enforced in three places rather than promised in one.
 *
 * - Chromium is launched with `--use-fake-device-for-media-stream`, which replaces *every*
 *   capture device it offers with a synthetic one, and `--use-file-for-fake-audio-capture`, which
 *   makes that device play `test/fixtures/fake-audio.mjs` instead of Chromium's own beep.
 * - The harness refuses to launch at all when the fixture is missing. There is no path from here
 *   to "open the default device", and the microphone permission is granted to this run's origin
 *   in a context of its own that dies with it -- no profile, no stored grant.
 * - The oracle asserts both flags were present, and separately asserts that every audio input the
 *   *browser* enumerated is one of Chromium's fake ones. Flags and platform have to agree.
 *
 * What is proved is that the samples CNA produced are the samples this repository authored: both
 * tones present, in the 2:1 amplitude ratio they were written at, at least ten times above
 * anything else in the spectrum. Chromium's gain control costs about 20 dB of absolute level and
 * leaves that shape alone, so the assertions are on the shape.
 *
 *     SYNTHETIC_BROWSER_CAPTURE_VERIFIED
 *     PHYSICAL_MICROPHONE_CAPTURE_NOT_VERIFIED
 *
 * The second is not a hedge. Nothing here says anything about a real microphone, and a synthetic
 * device passing is not evidence that a physical one would.
 *
 *   node --test test/wasm-browser-audio-capture.mjs
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fakeCaptureBlocked, runFrames } from "./support/browser-harness.mjs";
import { requiredSuite } from "./support/required-suite.mjs";
import { assertSyntheticCaptureEvidence } from "./support/audio-oracle.mjs";
import { FAKE_CAPTURE_TONES, writeFakeCaptureWav } from "./fixtures/fake-audio.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Probed rather than assumed: Playwright's bundled headless shell has no media-capture stack at
// all, so a run there would fail with `NotSupportedError` and say nothing about CNA.
const blocked = await fakeCaptureBlocked();

const { test, skip } = requiredSuite({
  label: "synthetic browser microphone capture",
  envVar: "CNA_REQUIRE_AUDIO_CAPTURE_TESTS",
  counter: "AUDIO_CAPTURE_TESTS",
  blocked,
});

// Written under `build/`, which is git-ignored and outside this package's published `files`.
const fixture = skip ? null : writeFakeCaptureWav(path.join(ROOT, "build/fake-media"));

const run = skip ? null
  : await runFrames(1, "audio-capture-page.html", { activate: true, fakeAudioCapture: fixture })
    .catch((error) => ({
      result: { status: "failed", error: String(error?.stack ?? error), errors: [], frames: 0 },
      consoleErrors: [], reports: [], mixerFormat: null, launchArgs: [],
    }));
const result = run?.result ?? {};
const evidence = result.evidence ?? {};

test("the page runs, records and disposes cleanly", () => {
  assert.equal(result.status, "ok", result.error ?? "the page did not finish");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(run.consoleErrors, []);
  assert.equal(result.drew, true);
  assert.equal(result.disposed, true);
});

test("the capture device is synthetic and the samples are the authored ones", () => {
  assertSyntheticCaptureEvidence(evidence, {
    launchArgs: run.launchArgs,
    tones: FAKE_CAPTURE_TONES,
  });
});

test("SDL's silence stands in until the capture stream is live, and is not mistaken for it", () => {
  // Worth asserting rather than tolerating. SDL3's Emscripten recording backend writes zeroes on
  // a timer until its own `getUserMedia` resolves, and a run that stopped at the first buffer
  // would collect that silence and read it as a microphone that delivered nothing. This run waits
  // for sound, and the count says the wait was real.
  assert.ok(evidence.capture.silentChunksBeforeSound > 0,
    "no silent buffers preceded the audio, so nothing here shows the wait was needed");
  assert.ok(evidence.capture.firstSoundedAt !== null,
    "the capture never sounded at all");
  assert.ok(evidence.capture.chunks > 1,
    "one buffer is not a capture stream");
});

test("what this run does and does not claim", () => {
  console.log(`SYNTHETIC_CAPTURE_SOURCE=${fixture}`);
  console.log(`SYNTHETIC_CAPTURE_BYTES=${evidence.capture.capturedBytes}`);
  console.log(`SYNTHETIC_CAPTURE_RATE=${evidence.capture.sampleRate}`);
  console.log("SYNTHETIC_BROWSER_CAPTURE_VERIFIED=1");
  console.log("PHYSICAL_MICROPHONE_ACCESSED=0");
  console.log("PHYSICAL_CAPTURE_VERIFIED=0");
});
