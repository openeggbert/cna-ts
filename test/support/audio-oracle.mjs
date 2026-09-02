// SPDX-License-Identifier: MS-PL

/**
 * What a browser run of CNA's audio path has to show before any of it counts as evidence.
 *
 * Three claims live here and they are deliberately separate, because the vague one they replace
 * ("audibility is blocked because WebAudio needs a user gesture") was two different facts wearing
 * one sentence:
 *
 * 1. **The gesture is real.** A fresh `AudioContext` is `suspended` at page load and a
 *    page-initiated `element.click()` -- `isTrusted: false` -- does not change that. A browser
 *    input event does. This is asserted from what the page posted on the harness channel *before*
 *    Playwright ran any script in it, because Playwright's CDP evaluate carries
 *    `userGesture: true` and would otherwise have supplied the answer to its own question.
 *
 * 2. **Sample consumption does not depend on it.** CNA mixes, and its own visualization tap sees
 *    the authored waveform, while the context is still suspended -- SDL3's Emscripten backend
 *    pumps the audio callback from a timer and throws the samples away. So the gesture gates
 *    *output*, not mixing, and the two must not be asserted as one thing.
 *
 * 3. **The samples are the right samples.** Not "the spectrum is non-zero" -- the peak lands in
 *    the bin arithmetic says it must, at the magnitude the window's own documented scaling says it
 *    must, with the neighbouring bins in the shape a Hann window makes. Every expectation below is
 *    computed from the tone the fixture authored and the sample rate CNA itself announced. Nothing
 *    is a recorded number, so a mixer that renegotiated its rate would move the expectations with
 *    it rather than fail.
 */

import assert from "node:assert/strict";

/**
 * The bin a tone must land in.
 *
 * CNA's `VisualizationFFT` transforms `InputSize` real samples and publishes `InputSize / 2`
 * magnitudes, so bin *i* covers `i * sampleRate / InputSize` -- and the input size is taken from
 * the array CNA actually returned rather than from a constant this file would have to keep in
 * step.
 */
function expectedBin(frequencyHz, sampleRate, binCount) {
  return Math.round(frequencyHz * (binCount * 2) / sampleRate);
}

/**
 * The magnitude a tone of amplitude `a` must read in its own bin.
 *
 * `ComputeMagnitudes` scales by `2 / InputSize` so a full-scale sine reaches ~1.0, and leaves the
 * Hann window's 0.5 coherent gain uncompensated -- documented upstream as a choice rather than an
 * accident. Half the amplitude is therefore the prediction, not a fitted constant.
 */
const HANN_COHERENT_GAIN = 0.5;

/** A tone not centred on a bin loses a little to scalloping; one that is loses essentially none. */
const MAGNITUDE_TOLERANCE = 0.02;

/** The peak sample, which is the authored amplitude minus at most the generator's own rounding. */
const SAMPLE_PEAK_TOLERANCE = 0.002;

/** A sine's RMS is its amplitude over root two, over a window holding whole-ish cycles. */
const RMS_TOLERANCE = 0.02;

/** Nothing playing has to look like nothing playing, well below any tone's half-amplitude peak. */
const SILENCE_CEILING = 0.02;

function relative(measured, predicted) {
  return Math.abs(measured - predicted) / predicted;
}

/**
 * One measured tone, against what the tone itself says it should be.
 *
 * `centred` says the frequency is an exact multiple of the bin width, which is worth separating:
 * a centred tone has a textbook Hann response -- exactly half the peak in each adjacent bin and
 * essentially nothing two bins out -- and that shape is far harder to fake than a maximum.
 */
function assertTone(tone, { sampleRate, label, centred }) {
  const binCount = tone.spectrum.length;
  const inputSize = binCount * 2;
  const bin = expectedBin(tone.frequencyHz, sampleRate, binCount);

  assert.ok(bin > 0 && bin < binCount,
    `${label}: ${tone.frequencyHz} Hz is bin ${bin} of ${binCount} at ${sampleRate} Hz, which is ` +
    "outside the spectrum the transform publishes");
  assert.equal(tone.peakBin, bin,
    `${label}: ${tone.frequencyHz} Hz over a ${inputSize}-point transform at ${sampleRate} Hz is ` +
    `bin ${bin}, and the loudest bin measured was ${tone.peakBin} ` +
    `(${(tone.peakBin * sampleRate / inputSize).toFixed(1)} Hz)`);

  const predicted = tone.amplitude * HANN_COHERENT_GAIN;
  assert.ok(relative(tone.magnitude, predicted) < MAGNITUDE_TOLERANCE,
    `${label}: an amplitude of ${tone.amplitude} reads ${predicted.toFixed(5)} in its own bin ` +
    `after the 2/N scale and the window's uncompensated 0.5 gain; measured ${tone.magnitude}`);

  assert.ok(Math.abs(tone.samplePeak - tone.amplitude) < SAMPLE_PEAK_TOLERANCE,
    `${label}: the sample-domain peak is the authored amplitude ${tone.amplitude}; ` +
    `measured ${tone.samplePeak}`);
  assert.ok(relative(tone.sampleRms, tone.amplitude / Math.SQRT2) < RMS_TOLERANCE,
    `${label}: a sine of amplitude ${tone.amplitude} has RMS ` +
    `${(tone.amplitude / Math.SQRT2).toFixed(5)}; measured ${tone.sampleRms}`);

  // The window's own shape, which is the part a fabricated peak cannot produce.
  if (centred) {
    for (const offset of [-1, 1]) {
      assert.ok(relative(tone.spectrum[bin + offset], tone.magnitude * 0.5) < 0.05,
        `${label}: a Hann window puts exactly half the peak in each bin adjacent to a centred ` +
        `tone; bin ${bin + offset} measured ${tone.spectrum[bin + offset]} beside a peak of ` +
        `${tone.magnitude}`);
    }
    for (const offset of [-2, 2]) {
      assert.ok(tone.spectrum[bin + offset] < tone.magnitude * 0.02,
        `${label}: a Hann main lobe is four bins wide, so bin ${bin + offset} is outside it; ` +
        `measured ${tone.spectrum[bin + offset]}`);
    }
  }

  assert.ok(tone.before.magnitude < SILENCE_CEILING,
    `${label}: the spectrum before the tone played was ${tone.before.magnitude}, which is not ` +
    "silence -- so the peak that follows cannot be attributed to this tone");
  assert.ok(tone.after.magnitude < SILENCE_CEILING,
    `${label}: the spectrum returned to ${tone.after.magnitude} after the tone stopped, so what ` +
    "was measured is a tone rather than a buffer nobody clears");
}

/** Every report the page posted, by label, failing by name where one is missing. */
function reported(reports, label) {
  const found = reports.find((report) => report.label === label);
  assert.ok(found, `the page never reported ${JSON.stringify(label)}; it reported ` +
    `${JSON.stringify(reports.map((report) => report.label))}`);
  assert.ok(!found.failed, `the page reported ${JSON.stringify(label)} as a failure: ${found.failed}`);
  return found;
}

/**
 * That the activation the audio ran behind was a browser's, and that an untrusted one is not.
 *
 * The order is the assertion. User activation is sticky -- `hasBeenActive` never goes back to
 * false -- so a synthetic click measured after a real one proves nothing, and the page's own
 * ordering is checked here rather than trusted.
 */
export function assertUserActivationEvidence(reports) {
  const order = reports.map((report) => report.label);
  assert.deepEqual(
    order.filter((label) => label === "synthetic-click" || label === "trusted-click"),
    ["synthetic-click", "trusted-click"],
    "the untrusted click must be measured before the trusted one, because activation is sticky " +
    "and a negative control taken afterwards would pass whatever the browser did");

  const boot = reported(reports, "boot");
  assert.equal(boot.activation.hasBeenActive, false,
    "the page has had no user activation at boot -- if this is true, something granted one " +
    "before the button was pressed and every measurement below is about that instead");
  assert.equal(boot.activation.isActive, false);
  assert.equal(boot.autoplay, "suspended",
    "a fresh AudioContext starts suspended without a gesture, which is the browser policy this " +
    "whole page exists to hold CNA's audio up against");

  const synthetic = reported(reports, "synthetic-click");
  assert.equal(synthetic.click.isTrusted, false,
    "a click dispatched by the page's own script is untrusted");
  assert.equal(synthetic.click.hasBeenActive, false,
    "and grants no user activation, which is the whole difference this suite turns on: " +
    "element.click() is not a user gesture no matter how real the handler looks");
  assert.equal(synthetic.click.isActive, false);
  assert.equal(synthetic.autoplay, "suspended",
    "so an AudioContext created after it is still suspended");

  const trusted = reported(reports, "trusted-click");
  assert.equal(trusted.click.isTrusted, true,
    "the harness's click is a real browser input event");
  assert.equal(trusted.click.hasBeenActive, true,
    "which grants user activation -- and transient activation inside the handler, which is what " +
    "actually gates starting audio");
  assert.equal(trusted.click.isActive, true);
  assert.equal(trusted.autoplay, "running",
    "an AudioContext created after it starts running rather than suspended");
  assert.equal(trusted.sdl.state, "running",
    "and SDL's own context, the one CNA plays through, has left suspended");
}

/**
 * That CNA mixes whether or not the page has been clicked -- which is the precise statement that
 * replaces "blocked because WebAudio needs a user gesture".
 *
 * It is not a footnote. SDL3's Emscripten playback backend, finding the context suspended,
 * installs a timer that calls the audio thread's iterate function with a buffer it discards, so
 * the mixer really does run and CNA's own visualization tap really does see the samples. The
 * gesture gates whether anyone can hear them, and nothing else -- so a browser binding can prove
 * every sample-consuming path it has without one, and cannot prove audibility with one.
 */
export function assertActivationIndependentMixingEvidence(reports, evidence, mixerFormat) {
  const before = reported(reports, "xact-before-activation");
  assert.equal(before.activation.hasBeenActive, false,
    "this measurement is only worth anything if it really was taken before any activation");
  assert.equal(before.sdl.state, "suspended",
    "and with SDL's audio context still suspended");
  assert.equal(before.autoplay, "suspended");

  const tone = evidence.xactBeforeActivation;
  assert.ok(tone, "the page recorded no pre-activation tone");
  assertTone(tone, {
    sampleRate: mixerFormat.freq, centred: false,
    label: "XACT with no user activation",
  });
  assert.equal(before.peakBin, tone.peakBin,
    "the bin posted on the channel before the click and the bin read back afterwards are the " +
    "same measurement, and disagreeing would mean one of them was taken somewhere else");
  assert.equal(before.magnitude, tone.magnitude);
}

/**
 * XACT, at two authored frequencies, through the mixer a browser is running.
 *
 * Two rather than one because a single tone cannot tell a spectrum from a constant: the two bins
 * differ, and each is predicted from its own cue's authored frequency.
 */
export function assertXactSpectrumEvidence(evidence, mixerFormat) {
  const tones = evidence.xactTones ?? [];
  assert.equal(tones.length, 2, "two authored cues are measured, not one");
  for (const tone of tones) {
    assert.equal(tone.playing, true, `${tone.cueName} was not playing while it was measured`);
    assertTone(tone, { sampleRate: mixerFormat.freq, centred: false, label: `XACT ${tone.cueName}` });
  }
  assert.notEqual(tones[0].peakBin, tones[1].peakBin,
    "two cues an octave apart land in two different bins; the same bin twice would mean the " +
    "spectrum is not following the audio");
  assert.ok(tones[1].frequencyHz > tones[0].frequencyHz
    ? tones[1].peakBin > tones[0].peakBin
    : tones[1].peakBin < tones[0].peakBin,
    "and the higher tone is the higher bin, which a swapped pair would not satisfy");

  // Each tone's own bin is quiet while the other is playing: the spectrum is not a smear that
  // happens to contain both peaks.
  for (const [tone, other] of [[tones[0], tones[1]], [tones[1], tones[0]]]) {
    const otherBin = other.peakBin;
    assert.ok(tone.spectrum[otherBin] < tone.magnitude * 0.5,
      `${tone.cueName}'s spectrum has ${tone.spectrum[otherBin]} at bin ${otherBin}, where the ` +
      `other cue peaks at ${other.magnitude} -- one tone is not producing both peaks`);
  }
}

/**
 * The same tap, reached by a SoundEffect this page authored rather than by XACT.
 *
 * This is what makes the visualization claim a claim about CNA's *mixer* rather than about XACT:
 * `MediaPlayer.GetVisualizationData` is fed by a post-mix callback on the whole mixer, so any CNA
 * audio object reaches it. Authoring the tone here also frees the frequency, so both sit exactly
 * on a bin centre where the window's response is textbook and the amplitude prediction is exact.
 */
export function assertMixerSpectrumEvidence(evidence, mixerFormat) {
  const tones = evidence.soundEffectTones ?? [];
  assert.equal(tones.length, 2, "two page-authored tones are measured");
  for (const tone of tones) {
    const binWidth = mixerFormat.freq / (tone.spectrum.length * 2);
    assert.ok(Math.abs(tone.frequencyHz / binWidth - Math.round(tone.frequencyHz / binWidth)) < 1e-6,
      `${tone.frequencyHz} Hz is not a whole number of ${binWidth} Hz bins, so the centred-tone ` +
      "assertions below would be measuring the wrong thing");
    assertTone(tone, {
      sampleRate: mixerFormat.freq, centred: true,
      label: `SoundEffect ${tone.frequencyHz} Hz`,
    });
    assert.equal(tone.durationMilliseconds, tone.expectedDurationMilliseconds,
      "the SoundEffect reports the duration its own sample count and rate imply");
  }
  assert.notEqual(tones[0].peakBin, tones[1].peakBin,
    "two authored frequencies land in two bins");
  assert.equal(tones[1].peakBin, tones[0].peakBin * 2,
    "and the second tone is exactly an octave above the first, so its bin is exactly twice -- " +
    "which a fixed bin, or a rate read at the wrong scale, cannot satisfy");
}

/**
 * A count CNA advances itself, which owes nothing to this package's arithmetic.
 *
 * The spectrum is this repository's own FFT reading of CNA's array. A
 * `DynamicSoundEffectInstance`'s pending-buffer count is CNA reporting how many of the buffers it
 * was handed its mixer has finished with, so the two are independent statements that the same
 * samples were consumed -- and a defect that faked one would have to fake the other in step.
 */
export function assertDynamicBufferEvidence(evidence, mixerFormat) {
  const dynamic = evidence.dynamicBuffers;
  assert.ok(dynamic, "the page recorded no dynamic-buffer evidence");
  assert.equal(dynamic.pending[0], dynamic.submitted,
    `${dynamic.submitted} buffers were submitted and the count before playing was ` +
    `${dynamic.pending[0]}`);
  for (let index = 1; index < dynamic.pending.length; index += 1) {
    assert.ok(dynamic.pending[index] <= dynamic.pending[index - 1],
      `the pending count rose from ${dynamic.pending[index - 1]} to ${dynamic.pending[index]}; ` +
      "buffers are only added by SubmitBuffer and none was submitted while it played");
  }
  assert.equal(dynamic.pending.at(-1), 0,
    `the queue never drained: it ended at ${dynamic.pending.at(-1)} of ${dynamic.submitted}`);

  const playing = dynamic.whilePlaying;
  assert.ok(playing,
    "no frame was sampled while the queue was part-drained, so nothing connects the count to the " +
    "audio it is counting");
  assert.equal(playing.peakBin,
    expectedBin(dynamic.frequencyHz, mixerFormat.freq, playing.binCount),
    "the audio being drained is the audio that was submitted, at the frequency it was authored at");
  assert.ok(relative(playing.magnitude, dynamic.amplitude * HANN_COHERENT_GAIN)
    < MAGNITUDE_TOLERANCE,
    `and at its authored amplitude; measured ${playing.magnitude}`);
}
