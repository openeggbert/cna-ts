// SPDX-License-Identifier: MS-PL

/**
 * The synthetic capture source: a WAV file Chromium plays into a fake microphone.
 *
 * This exists so that a microphone test can never reach the host's real one. Chromium's
 * `--use-fake-device-for-media-stream` replaces every capture device with a synthetic one, and
 * `--use-file-for-fake-audio-capture` makes that device play *this file* instead of Chromium's
 * built-in beep -- so what `getUserMedia` delivers is bytes this repository authored, and the
 * assertion can be that the captured signal IS those bytes rather than that something arrived.
 *
 * Two tones rather than one, at a deliberate 2:1 amplitude ratio. One tone can be matched by a
 * check that has hard-coded the answer; two, plus the ratio between them, cannot -- and neither
 * can be produced by a room. The ratio also survives Chromium's own capture processing, which
 * applies automatic gain control and noise suppression that no page constraint here can switch
 * off: measured, it drops the absolute level by about 20 dB and leaves the ratio at 2.007.
 *
 * Both frequencies are whole numbers of cycles per second of file, so the fake device's looping
 * playback rejoins the start of the waveform without the click a broadband transient would put
 * across the whole spectrum.
 *
 * The file is written under `build/`, which is git-ignored and outside the `files` list this
 * package publishes, so it is neither committed nor packaged.
 */

import fs from "node:fs";
import path from "node:path";

/** The rate the file is authored at, which is the rate Chromium's capture pipeline runs at. */
export const FAKE_CAPTURE_SAMPLE_RATE = 48000;

/** How long the file is. It loops, so this only has to be long enough to be seamless. */
export const FAKE_CAPTURE_SECONDS = 2;

/**
 * The two tones, each an exact multiple of both 0.5 Hz (so the loop is seamless) and of the
 * 93.75 Hz bin width a 512-point transform gives at this rate.
 */
export const FAKE_CAPTURE_TONES = [
  { frequencyHz: 16 * FAKE_CAPTURE_SAMPLE_RATE / 512, amplitude: 0.6 },
  { frequencyHz: 34 * FAKE_CAPTURE_SAMPLE_RATE / 512, amplitude: 0.3 },
];

/** The mono 16-bit PCM the tones sum to, without the RIFF wrapper. */
export function fakeCapturePcm() {
  const frames = FAKE_CAPTURE_SAMPLE_RATE * FAKE_CAPTURE_SECONDS;
  const bytes = new Uint8Array(frames * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < frames; index += 1) {
    let value = 0;
    for (const tone of FAKE_CAPTURE_TONES) {
      value += Math.sin(2 * Math.PI * tone.frequencyHz * index / FAKE_CAPTURE_SAMPLE_RATE)
        * tone.amplitude;
    }
    view.setInt16(index * 2, Math.round(value * 32767), true);
  }
  return bytes;
}

/** That PCM in the RIFF/WAVE framing Chromium's file-backed fake capture reads. */
export function fakeCaptureWav() {
  const pcm = fakeCapturePcm();
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const ascii = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);          // PCM header length
  view.setUint16(20, 1, true);           // format: PCM
  view.setUint16(22, 1, true);           // channels: mono
  view.setUint32(24, FAKE_CAPTURE_SAMPLE_RATE, true);
  view.setUint32(28, FAKE_CAPTURE_SAMPLE_RATE * 2, true);  // bytes per second
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  ascii(36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

/**
 * Writes the file where Chromium can open it and answers the path.
 *
 * A real path is unavoidable: the flag takes one, and a browser process cannot read a buffer this
 * one holds.
 */
export function writeFakeCaptureWav(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "fake-capture-tones.wav");
  fs.writeFileSync(file, fakeCaptureWav());
  return file;
}
