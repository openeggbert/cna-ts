// SPDX-License-Identifier: MS-PL

/**
 * The browser-audio oracles, checked against evidence that should fail them.
 *
 * An oracle lives in `test/support`, which `dist` does not contain, so mutating one leaves the
 * built package byte-identical and the mutation harness correctly refuses to score it. These
 * oracles decide whether a browser really consumed the samples CNA was handed, which is exactly
 * the kind of claim that is worthless if the check is a formality -- so each starts from evidence
 * a working run produced, breaks one thing the way a real defect would break it, and requires the
 * oracle to say so.
 *
 * The spectra are *built* here rather than pasted: 256 floats copied out of a run would be a
 * recorded number pretending to be a shape, and what the oracle checks is the shape -- a Hann
 * window's response to one tone. `spectrumFor` produces that shape and nothing else, so a case
 * that moves the peak, flattens the skirts or silences the whole array is a case about the
 * property the oracle actually asserts.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertActivationIndependentMixingEvidence,
  assertDynamicBufferEvidence,
  assertMixerSpectrumEvidence,
  assertSyntheticCaptureEvidence,
  assertUserActivationEvidence,
  assertXactSpectrumEvidence,
} from "./support/audio-oracle.mjs";
import { FAKE_CAPTURE_TONES } from "./fixtures/fake-audio.mjs";

const clone = (value) => structuredClone(value);

/** The rate CNA's mixer announced on the run these shapes came from. */
const MIXER = { channels: 2, freq: 44100 };
const BIN_COUNT = 256;
const bin = (frequencyHz) => Math.round(frequencyHz * BIN_COUNT * 2 / MIXER.freq);

/**
 * One tone's magnitude spectrum: the peak in its own bin, half of it either side, and essentially
 * nothing beyond the four-bin main lobe -- which is what a Hann window does and what a real run
 * measured (0.39921 at the peak, 0.20019 at ±1, 0.00026 at ±2).
 */
function spectrumFor(peakBin, magnitude) {
  const spectrum = new Array(BIN_COUNT).fill(0);
  spectrum[peakBin] = magnitude;
  for (const offset of [-1, 1]) {
    if (spectrum[peakBin + offset] !== undefined) spectrum[peakBin + offset] = magnitude * 0.5013;
  }
  for (const offset of [-2, 2]) {
    if (spectrum[peakBin + offset] !== undefined) spectrum[peakBin + offset] = magnitude * 0.00065;
  }
  return spectrum;
}

function tone(frequencyHz, amplitude, extra = {}) {
  const peakBin = bin(frequencyHz);
  const magnitude = amplitude * 0.5 * 0.998;
  return {
    frequencyHz, amplitude, peakBin, magnitude,
    spectrum: spectrumFor(peakBin, magnitude),
    samplePeak: amplitude - 0.00003,
    sampleRms: amplitude / Math.SQRT2,
    before: { magnitude: 0, peakBin: 0, samplePeak: 0 },
    after: { magnitude: 0, peakBin: 0, samplePeak: 0 },
    ...extra,
  };
}

const XACT_AMPLITUDE = 28000 / 32768;
const SOUND_AMPLITUDE = 0.8;

const WORKING = {
  reports: [
    { label: "boot", activation: { hasBeenActive: false, isActive: false },
      autoplay: "suspended", sdl: null },
    { label: "synthetic-click",
      click: { isTrusted: false, hasBeenActive: false, isActive: false },
      activation: { hasBeenActive: false, isActive: false }, autoplay: "suspended" },
    { label: "xact-before-activation", peakBin: bin(261.6),
      magnitude: XACT_AMPLITUDE * 0.5 * 0.998, samplePeak: XACT_AMPLITUDE - 0.00003,
      silenceMagnitude: 0, activation: { hasBeenActive: false, isActive: false },
      autoplay: "suspended", sdl: { state: "suspended", sampleRate: 48000 } },
    { label: "waiting-for-user-activation",
      activation: { hasBeenActive: false, isActive: false },
      sdl: { state: "suspended", sampleRate: 48000 } },
    { label: "trusted-click",
      click: { isTrusted: true, hasBeenActive: true, isActive: true },
      activation: { hasBeenActive: true, isActive: true }, autoplay: "running",
      sdl: { state: "running", sampleRate: 48000 } },
  ],
  evidence: {
    xactBeforeActivation: tone(261.6, XACT_AMPLITUDE, { cueName: "Tone261", playing: true }),
    xactTones: [
      tone(261.6, XACT_AMPLITUDE, { cueName: "Tone261", playing: true }),
      tone(523.3, XACT_AMPLITUDE, { cueName: "Tone523", playing: true }),
    ],
    soundEffectTones: [
      tone(16 * 44100 / 512, SOUND_AMPLITUDE,
        { sourceSampleRate: 44100, durationMilliseconds: 1500,
          expectedDurationMilliseconds: 1500, state: 0 }),
      tone(32 * 44100 / 512, SOUND_AMPLITUDE,
        { sourceSampleRate: 44100, durationMilliseconds: 1500,
          expectedDurationMilliseconds: 1500, state: 0 }),
    ],
    dynamicBuffers: {
      submitted: 6, pending: [6, 6, 5, 4, 3, 2, 2, 1, 1, 0, 0, 0], drainedState: 0,
      frequencyHz: 32 * 44100 / 512, amplitude: SOUND_AMPLITUDE,
      whilePlaying: { peakBin: 32, magnitude: SOUND_AMPLITUDE * 0.5 * 0.998,
                      samplePeak: SOUND_AMPLITUDE - 0.00003, binCount: BIN_COUNT },
    },
  },
};

/**
 * A capture the way Chromium's fake device delivers one: the authored tones, resampled to CNA's
 * rate and attenuated about 20 dB by the gain control nothing in the page can switch off.
 *
 * Built rather than pasted for the same reason the spectra above are -- what the oracle checks is
 * the shape, so a case that flattens it, silences it or moves one tone is a case about the
 * property being asserted.
 */
function capturedPcm({ tones = FAKE_CAPTURE_TONES, sampleRate = 44100, frames = 20000,
                       gain = 0.105, noise = 0 } = {}) {
  const bytes = new Uint8Array(frames * 2);
  const view = new DataView(bytes.buffer);
  // A fixed sequence rather than Math.random, so a failure is reproducible.
  let seed = 12345;
  const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let index = 0; index < frames; index += 1) {
    let value = noise * next();
    for (const tone of tones) {
      value += Math.sin(2 * Math.PI * tone.frequencyHz * index / sampleRate) * tone.amplitude * gain;
    }
    view.setInt16(index * 2, Math.max(-32768, Math.min(32767, Math.round(value * 32767))), true);
  }
  return Buffer.from(bytes).toString("base64");
}

const CAPTURE = {
  launchArgs: ["--use-gl=swiftshader", "--use-fake-device-for-media-stream",
    "--use-file-for-fake-audio-capture=/build/fake-media/fake-capture-tones.wav"],
  evidence: {
    browserAudioInputs: ["Fake Default Audio Input", "Fake Audio Input 1"],
    microphones: [
      { Index: 0, Name: "Default Device", SampleRate: 44100, State: 1, IsHeadset: false,
        IsDefault: true, BufferDurationTicks: "3000000" },
      { Index: 1, Name: "System audio recording device", SampleRate: 44100, State: 1,
        IsHeadset: false, IsDefault: false, BufferDurationTicks: "10000000" },
    ],
    capture: {
      requestedTicks: "3000000", durationAfter: "3000000",
      stoppedBefore: 1, started: 0, stopped: 1,
      requestedBytes: 65536, capturedBytes: 40000, chunks: 12, largestChunk: 7528,
      silentChunksBeforeSound: 3, firstSoundedAt: 4, sampleRate: 44100,
      pcmBase64: capturedPcm(),
    },
  },
};

// The shapes above have to pass before any of the rejections below mean anything: an oracle that
// refuses everything would satisfy every case in the table and prove nothing.
test("the working shapes are accepted", () => {
  assertUserActivationEvidence(WORKING.reports);
  assertActivationIndependentMixingEvidence(WORKING.reports, WORKING.evidence, MIXER);
  assertXactSpectrumEvidence(WORKING.evidence, MIXER);
  assertMixerSpectrumEvidence(WORKING.evidence, MIXER);
  assertDynamicBufferEvidence(WORKING.evidence, MIXER);
  assertSyntheticCaptureEvidence(CAPTURE.evidence,
    { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
});

const CASES = [
  ["a page that had already been activated before the button was pressed", () => {
    const broken = clone(WORKING.reports);
    broken.find((report) => report.label === "boot").activation.hasBeenActive = true;
    return () => assertUserActivationEvidence(broken);
  }],
  ["an autoplay policy that was never blocking anything", () => {
    const broken = clone(WORKING.reports);
    broken.find((report) => report.label === "boot").autoplay = "running";
    return () => assertUserActivationEvidence(broken);
  }],
  ["a synthetic click the harness sent through page.evaluate, so the browser trusted it", () => {
    const broken = clone(WORKING.reports);
    broken.find((report) => report.label === "synthetic-click").click.isTrusted = true;
    return () => assertUserActivationEvidence(broken);
  }],
  ["a synthetic click that granted activation, which would make the control meaningless", () => {
    const broken = clone(WORKING.reports);
    const synthetic = broken.find((report) => report.label === "synthetic-click");
    synthetic.click.hasBeenActive = true;
    synthetic.click.isActive = true;
    return () => assertUserActivationEvidence(broken);
  }],
  ["a trusted click that granted sticky but not transient activation", () => {
    const broken = clone(WORKING.reports);
    broken.find((report) => report.label === "trusted-click").click.isActive = false;
    return () => assertUserActivationEvidence(broken);
  }],
  ["an SDL context still suspended after the real click", () => {
    const broken = clone(WORKING.reports);
    broken.find((report) => report.label === "trusted-click").sdl.state = "suspended";
    return () => assertUserActivationEvidence(broken);
  }],
  ["the negative control measured after the real click, where it would pass anything", () => {
    const broken = clone(WORKING.reports);
    const synthetic = broken.splice(broken.findIndex((r) => r.label === "synthetic-click"), 1)[0];
    synthetic.click.hasBeenActive = true;
    synthetic.click.isActive = true;
    broken.push(synthetic);
    return () => assertUserActivationEvidence(broken);
  }],
  ["a pre-activation measurement taken after the activation", () => {
    const broken = clone(WORKING.reports);
    broken.find((r) => r.label === "xact-before-activation").activation.hasBeenActive = true;
    return () => assertActivationIndependentMixingEvidence(broken, WORKING.evidence, MIXER);
  }],
  ["a pre-activation run whose context was already running", () => {
    const broken = clone(WORKING.reports);
    broken.find((r) => r.label === "xact-before-activation").sdl.state = "running";
    return () => assertActivationIndependentMixingEvidence(broken, WORKING.evidence, MIXER);
  }],
  ["a channel report and a read-back that are two different measurements", () => {
    const broken = clone(WORKING.reports);
    broken.find((r) => r.label === "xact-before-activation").peakBin += 1;
    return () => assertActivationIndependentMixingEvidence(broken, WORKING.evidence, MIXER);
  }],
  ["a mixer that consumed nothing until the page was clicked", () => {
    const broken = clone(WORKING.evidence);
    broken.xactBeforeActivation.spectrum = new Array(BIN_COUNT).fill(0);
    broken.xactBeforeActivation.magnitude = 0;
    broken.xactBeforeActivation.samplePeak = 0;
    broken.xactBeforeActivation.sampleRms = 0;
    broken.xactBeforeActivation.peakBin = 0;
    return () => assertActivationIndependentMixingEvidence(WORKING.reports, broken, MIXER);
  }],
  ["a cue whose peak is one bin from where its frequency puts it", () => {
    const broken = clone(WORKING.evidence);
    broken.xactTones[0].peakBin += 1;
    return () => assertXactSpectrumEvidence(broken, MIXER);
  }],
  ["a spectrum read at the browser's sample rate rather than the mixer's", () => {
    // The exact mistake the suite warns about: 48000 instead of 44100 moves 1378.125 Hz from bin
    // 16 to bin 15, and every tone with it, while the spectrum still looks perfectly healthy.
    return () => assertMixerSpectrumEvidence(WORKING.evidence, { channels: 2, freq: 48000 });
  }],
  ["a cue that was measured while it was not playing", () => {
    const broken = clone(WORKING.evidence);
    broken.xactTones[1].playing = false;
    return () => assertXactSpectrumEvidence(broken, MIXER);
  }],
  ["two cues an octave apart that answer the same bin", () => {
    const broken = clone(WORKING.evidence);
    broken.xactTones[1].peakBin = broken.xactTones[0].peakBin;
    broken.xactTones[1].spectrum = spectrumFor(broken.xactTones[0].peakBin,
      broken.xactTones[1].magnitude);
    return () => assertXactSpectrumEvidence(broken, MIXER);
  }],
  ["a spectrum that has not gone quiet before the tone starts", () => {
    const broken = clone(WORKING.evidence);
    broken.xactTones[0].before.magnitude = 0.4;
    return () => assertXactSpectrumEvidence(broken, MIXER);
  }],
  ["a visualization buffer nobody clears when the audio stops", () => {
    const broken = clone(WORKING.evidence);
    broken.xactTones[0].after.magnitude = 0.4;
    return () => assertXactSpectrumEvidence(broken, MIXER);
  }],
  ["a tone at half its authored amplitude, in the right bin", () => {
    const broken = clone(WORKING.evidence);
    broken.soundEffectTones[0].magnitude *= 0.5;
    broken.soundEffectTones[0].spectrum =
      spectrumFor(broken.soundEffectTones[0].peakBin, broken.soundEffectTones[0].magnitude);
    return () => assertMixerSpectrumEvidence(broken, MIXER);
  }],
  ["a sample array whose peak does not match the waveform that was submitted", () => {
    const broken = clone(WORKING.evidence);
    broken.soundEffectTones[1].samplePeak = 0.5;
    return () => assertMixerSpectrumEvidence(broken, MIXER);
  }],
  ["a sample array with the right peak and the wrong energy", () => {
    const broken = clone(WORKING.evidence);
    broken.soundEffectTones[1].sampleRms *= 0.6;
    return () => assertMixerSpectrumEvidence(broken, MIXER);
  }],
  ["a single spike where a windowed tone should have skirts", () => {
    const broken = clone(WORKING.evidence);
    const spike = new Array(BIN_COUNT).fill(0);
    spike[broken.soundEffectTones[0].peakBin] = broken.soundEffectTones[0].magnitude;
    broken.soundEffectTones[0].spectrum = spike;
    return () => assertMixerSpectrumEvidence(broken, MIXER);
  }],
  ["energy two bins out, which no Hann main lobe reaches", () => {
    const broken = clone(WORKING.evidence);
    const tone0 = broken.soundEffectTones[0];
    tone0.spectrum[tone0.peakBin + 2] = tone0.magnitude * 0.4;
    return () => assertMixerSpectrumEvidence(broken, MIXER);
  }],
  ["a SoundEffect reporting a duration its own sample count does not imply", () => {
    const broken = clone(WORKING.evidence);
    broken.soundEffectTones[0].durationMilliseconds = 750;
    return () => assertMixerSpectrumEvidence(broken, MIXER);
  }],
  ["a pending-buffer count that never drains", () => {
    const broken = clone(WORKING.evidence);
    broken.dynamicBuffers.pending = new Array(12).fill(6);
    return () => assertDynamicBufferEvidence(broken, MIXER);
  }],
  ["a pending-buffer count that goes back up", () => {
    const broken = clone(WORKING.evidence);
    broken.dynamicBuffers.pending = [6, 5, 4, 5, 3, 2, 1, 0];
    return () => assertDynamicBufferEvidence(broken, MIXER);
  }],
  ["a count that starts somewhere other than what was submitted", () => {
    const broken = clone(WORKING.evidence);
    broken.dynamicBuffers.pending[0] = 3;
    return () => assertDynamicBufferEvidence(broken, MIXER);
  }],
  ["a queue that drained while something else was making the sound", () => {
    const broken = clone(WORKING.evidence);
    broken.dynamicBuffers.whilePlaying.peakBin = 16;
    return () => assertDynamicBufferEvidence(broken, MIXER);
  }],
  ["a drain nobody ever sampled the audio during", () => {
    const broken = clone(WORKING.evidence);
    broken.dynamicBuffers.whilePlaying = null;
    return () => assertDynamicBufferEvidence(broken, MIXER);
  }],
  ["a browser launched without a fake media device, where a real one is reachable", () => {
    const args = CAPTURE.launchArgs.filter((a) => a !== "--use-fake-device-for-media-stream");
    return () => assertSyntheticCaptureEvidence(CAPTURE.evidence,
      { launchArgs: args, tones: FAKE_CAPTURE_TONES });
  }],
  ["a fake device with no authored file behind it, playing Chromium's own beep", () => {
    const args = CAPTURE.launchArgs.filter((a) => !a.startsWith("--use-file-for-fake-audio-capture="));
    return () => assertSyntheticCaptureEvidence(CAPTURE.evidence,
      { launchArgs: args, tones: FAKE_CAPTURE_TONES });
  }],
  ["a real capture device the browser was still willing to enumerate", () => {
    const broken = clone(CAPTURE.evidence);
    broken.browserAudioInputs.push("HD-Audio Generic: ALC257 Analog");
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["a capture of silence, which is what a microphone nobody granted looks like", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture.pcmBase64 = capturedPcm({ gain: 0 });
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["a capture of a room rather than the fixture", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture.pcmBase64 = capturedPcm({ gain: 0, noise: 0.2 });
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["a capture carrying one authored tone and not the other", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture.pcmBase64 = capturedPcm({ tones: [FAKE_CAPTURE_TONES[0]] });
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["two tones that arrived in the wrong amplitude ratio", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture.pcmBase64 = capturedPcm({
      tones: [FAKE_CAPTURE_TONES[0], { ...FAKE_CAPTURE_TONES[1], amplitude: 0.6 }],
    });
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["a read that answered the byte count it was asked for rather than what it captured", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture.largestChunk = broken.capture.requestedBytes;
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["a buffer duration that did not survive the round trip", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture.durationAfter = "10000000";
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["a microphone that reports the same state started and stopped", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture.started = broken.capture.stoppedBefore;
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["a stop that left the microphone running", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture.stopped = broken.capture.started;
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["too little audio to say anything about its spectrum", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture.pcmBase64 = capturedPcm({ frames: 200 });
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["an odd byte count, which is not whole 16-bit samples", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture.capturedBytes = 40001;
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
  ["a microphone enumerated and never captured from", () => {
    const broken = clone(CAPTURE.evidence);
    broken.capture = null;
    return () => assertSyntheticCaptureEvidence(broken,
      { launchArgs: CAPTURE.launchArgs, tones: FAKE_CAPTURE_TONES });
  }],
];

for (const [name, build] of CASES) {
  test(`the audio oracles reject ${name}`, () => {
    assert.throws(build(), assert.AssertionError, `${name} was accepted`);
  });
}
