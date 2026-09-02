// SPDX-License-Identifier: MS-PL

/**
 * XACT fixtures: a settings file, a wave bank and a sound bank, authored here.
 *
 * XACT is the one family in this package whose assets a game normally *buys*: an `.xgs`, an `.xsb`
 * and an `.xwb` come out of Microsoft's Cross-Platform Audio Creation Tool, and downloading
 * somebody's shipped banks to test a binding is not an option. That made the whole family look
 * `BLOCKED_FIXTURE`.
 *
 * It is not, because the formats are not secret: CNA parses them, CNA's own XACT demo *writes*
 * them, and the three writers below produce the same framings from scratch. Nothing here is
 * downloaded, nothing is stubbed, and the bytes CNA parses are real XACT bytes -- which is exactly
 * the argument `xnb.mjs` already makes for XNB.
 *
 * What the fixture describes:
 *
 * - **Settings** (`.xgs`): two categories, `Music` and `SFX`, and two global variables --
 *   `SpeedOfSound`, writable and initialised to 343, and `Ceiling`, read-only at 12.
 * - **Wave bank** (`.xwb`): mono 16-bit PCM at 44100 Hz, one entry per tone.
 * - **Sound bank** (`.xsb`): one simple cue per wave, each in a named category.
 *
 * The *accessibility byte* is load-bearing, and there are two variables here because it has two
 * interesting values. `SpeedOfSound` is `0x01` -- PUBLIC only, so it is an engine global rather
 * than a per-cue variable and it is writable. `Ceiling` is `0x03` -- PUBLIC | READONLY, which CNA
 * accepts and then silently ignores every write to.
 *
 * That pair exists because one variable would have hidden a mistake this fixture actually made:
 * its first version used `0x03` for its only variable, following a comment in CNA's demo that
 * calls that byte "global + settable". It is not -- `0x2` is READONLY, and a probe that set the
 * variable to 500 read back 343 and looked like a marshalling bug in the binding. With both
 * present, a write that lands and a write that is ignored are two assertions rather than one
 * ambiguous one.
 */

const SAMPLE_RATE = 44100;

class Writer {
  #bytes = [];

  get length() { return this.#bytes.length; }

  u8(value) { this.#bytes.push(value & 0xff); return this; }

  u16(value) {
    this.#bytes.push(value & 0xff, (value >>> 8) & 0xff);
    return this;
  }

  u32(value) {
    this.#bytes.push(
      value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff,
    );
    return this;
  }

  i32(value) { return this.u32(value >>> 0); }

  f32(value) {
    const buffer = new DataView(new ArrayBuffer(4));
    buffer.setFloat32(0, value, true);
    for (let at = 0; at < 4; at += 1) this.#bytes.push(buffer.getUint8(at));
    return this;
  }

  /** Zero padding, in bytes. */
  pad(count) {
    for (let at = 0; at < count; at += 1) this.#bytes.push(0);
    return this;
  }

  /** Zero padding up to an absolute offset. */
  padTo(offset) { return this.pad(Math.max(0, offset - this.#bytes.length)); }

  /** A NUL-terminated string, which is how both name tables are written. */
  cstr(value) {
    for (const code of new TextEncoder().encode(value)) this.#bytes.push(code);
    this.#bytes.push(0);
    return this;
  }

  /** A fixed 64-byte name field, truncated at 63 characters and NUL-padded. */
  str64(value) {
    const bytes = new TextEncoder().encode(value).slice(0, 63);
    for (const code of bytes) this.#bytes.push(code);
    return this.pad(64 - bytes.length);
  }

  raw(bytes) {
    for (const byte of bytes) this.#bytes.push(byte);
    return this;
  }

  done() { return new Uint8Array(this.#bytes); }
}

/**
 * 16-bit signed mono PCM of a sine tone, with a short fade at each end.
 *
 * The fade is not decoration: a tone that starts and ends at full amplitude clicks, and a click is
 * a broadband transient that would make any spectrum assertion about this audio meaningless.
 */
export function sineWave(frequencyHz, seconds, sampleRate = SAMPLE_RATE) {
  const count = Math.round(sampleRate * seconds);
  const bytes = new Uint8Array(count * 2);
  const view = new DataView(bytes.buffer);
  const fade = 0.02 * sampleRate;
  for (let index = 0; index < count; index += 1) {
    const time = index / sampleRate;
    let envelope = 1;
    if (index < fade) envelope = index / fade;
    else if (index > count - fade) envelope = (count - index) / fade;
    view.setInt16(
      index * 2, Math.trunc(Math.sin(2 * Math.PI * frequencyHz * time) * envelope * 28000), true,
    );
  }
  return bytes;
}

/** The two category names the settings file defines, in index order. */
export const XACT_CATEGORIES = ["Music", "SFX"];

/**
 * The global variables the settings file defines.
 *
 * `Accessibility` is CNA's own bitfield: PUBLIC = 0x1, READONLY = 0x2, CUE = 0x4.
 */
export const XACT_GLOBAL_VARIABLES = [
  { Name: "SpeedOfSound", Initial: 343, Minimum: 0, Maximum: 1000, Accessibility: 0x01 },
  { Name: "Ceiling", Initial: 12, Minimum: 0, Maximum: 100, Accessibility: 0x03 },
];

/** An `.xgs` settings file with two categories and two global variables. */
export function xgsSettings() {
  const named = (values) => values.reduce((total, value) => total + value.length + 1, 0);
  const CATEGORY_OFFSET = 80;
  const VARIABLE_OFFSET = CATEGORY_OFFSET + XACT_CATEGORIES.length * 10;
  const CATEGORY_NAME_OFFSET = VARIABLE_OFFSET + XACT_GLOBAL_VARIABLES.length * 13;
  const VARIABLE_NAME_OFFSET = CATEGORY_NAME_OFFSET + named(XACT_CATEGORIES);

  const out = new Writer();
  out.u32(0x46534758);          // "XGSF"
  out.u16(46).u16(0).u16(0);    // contentVersion, toolVersion, unknown
  out.pad(8);                   // lastModified
  out.u8(0);                    // platform
  out.u16(XACT_CATEGORIES.length).u16(XACT_GLOBAL_VARIABLES.length);
  out.u16(0).u16(0).u16(0).u16(0).u16(0);  // blob1, blob2, rpc, dspPreset, dspParameter counts
  out.u32(CATEGORY_OFFSET).u32(VARIABLE_OFFSET);
  out.u32(0).u32(0).u32(0).u32(0);         // blob1, categoryNameIndex, blob2, variableNameIndex
  out.u32(CATEGORY_NAME_OFFSET).u32(VARIABLE_NAME_OFFSET);
  out.padTo(CATEGORY_OFFSET);

  for (const _ of XACT_CATEGORIES) {
    out.u8(255);        // instanceLimit
    out.u16(0).u16(0);  // fadeInMS, fadeOutMS
    out.u8(0);          // maxInstanceBehavior
    out.u16(0xffff);    // parentIndex: none
    out.u8(180);        // volume byte, about amplitude 1.0
    out.u8(1);          // visibility
  }

  for (const variable of XACT_GLOBAL_VARIABLES) {
    out.u8(variable.Accessibility);
    out.f32(variable.Initial);
    out.f32(variable.Minimum);
    out.f32(variable.Maximum);
  }

  for (const name of XACT_CATEGORIES) out.cstr(name);
  for (const variable of XACT_GLOBAL_VARIABLES) out.cstr(variable.Name);
  return out.done();
}

/** An `.xwb` wave bank holding the given mono 16-bit PCM waves at 44100 Hz. */
export function xwbWaveBank(bankName, waves) {
  const BANK_DATA_SIZE = 96;
  const playOffsets = [];
  let totalAudio = 0;
  for (const wave of waves) {
    playOffsets.push(totalAudio);
    totalAudio += wave.byteLength;
  }
  const segment0 = { offset: 52, length: BANK_DATA_SIZE };
  const segment1 = { offset: segment0.offset + segment0.length, length: 24 * waves.length };
  const wavesOffset = (segment1.offset + segment1.length + 3) & ~3;

  const out = new Writer();
  out.u32(0x444e4257);   // "WBND"
  out.u32(46);           // version
  out.u32(44);           // headerVersion
  out.u32(segment0.offset).u32(segment0.length);
  out.u32(segment1.offset).u32(segment1.length);
  out.u32(0).u32(0);     // SEEKTABLE, empty
  out.u32(0).u32(0);     // ENTRYNAMES, empty
  out.u32(wavesOffset).u32(totalAudio);

  out.u32(0);            // wbFlags
  out.u32(waves.length);
  out.str64(bankName);
  out.u32(24);           // entryMetaDataSize
  out.u32(0);            // entryNameElemSize
  out.u32(4);            // alignment
  out.u32(0);            // compactFormat
  out.u32(0).u32(0);     // buildTime

  // The format bitfield: fmtTag 0 (PCM), channels-1 = 0 (mono), the sample rate, block align 0
  // and bits-per-sample 1 (16-bit) in the top bit.
  const format = ((SAMPLE_RATE << 5) | 0x80000000) >>> 0;
  waves.forEach((wave, index) => {
    out.u32(0);                    // flagsAndDuration
    out.u32(format);
    out.u32(playOffsets[index]);
    out.u32(wave.byteLength);
    out.u32(0).u32(0);             // loopStart, loopTotal
  });

  out.padTo(wavesOffset);
  for (const wave of waves) out.raw(wave);
  return out.done();
}

/**
 * An `.xsb` sound bank: one simple cue per entry, each pointing at one wave in one wave bank.
 *
 * Each cue is `{ Name, WaveIndex, CategoryIndex }`, the category index being into
 * {@link XACT_CATEGORIES}.
 */
export function xsbSoundBank(bankName, waveBankName, cues) {
  const HEADER = 138;
  const soundOffset = HEADER;
  const cueSimpleOffset = soundOffset + 12 * cues.length;
  const waveBankNameOffset = cueSimpleOffset + 5 * cues.length;
  const cueNameIndexOffset = waveBankNameOffset + 64;

  const nameOffsets = [];
  let cursor = cueNameIndexOffset + 6 * cues.length;
  for (const cue of cues) {
    nameOffsets.push(cursor);
    cursor += new TextEncoder().encode(cue.Name).length + 1;
  }

  const out = new Writer();
  out.u32(0x4b424453);   // "SDBK"
  out.u16(46).u16(0).u16(0);   // contentVersion, toolVersion, CRC
  out.pad(8);                  // lastModified
  out.u8(0);                   // platform
  out.u16(cues.length);        // cueSimpleCount
  out.u16(0);                  // cueComplexCount
  out.u16(0).u16(0);           // unknown, cueTotalAlign
  out.u8(1);                   // wavebankCount
  out.u16(cues.length);        // soundCount
  out.u16(0).u16(0);           // cueNameLength, unknown

  out.i32(cueSimpleOffset);
  out.i32(-1);                 // cueComplexOffset
  out.i32(-1);                 // cueNameOffset
  out.i32(-1);                 // unknown
  out.i32(-1);                 // variationOffset
  out.i32(-1);                 // transitionOffset
  out.i32(waveBankNameOffset);
  out.i32(-1);                 // cueHashOffset
  out.i32(cueNameIndexOffset);
  out.i32(soundOffset);
  out.str64(bankName);

  for (const cue of cues) {
    out.u8(0);                    // flags: simple, no RPC or DSP
    out.u16(cue.CategoryIndex);
    out.u8(180);                  // volume byte
    out.u16(0);                   // pitch cents
    out.u8(255);                  // priority
    out.u16(0);                   // sound length, unused
    out.u16(cue.WaveIndex);
    out.u8(0);                    // wave bank index
  }

  cues.forEach((_, index) => {
    out.u8(0);                            // flags
    out.u32(soundOffset + 12 * index);    // the sound's absolute file offset
  });

  out.str64(waveBankName);

  cues.forEach((_, index) => {
    out.u32(nameOffsets[index]);
    out.u16(index);
  });

  for (const cue of cues) out.cstr(cue.Name);
  return out.done();
}

/** The cues the shared fixture defines: two in `Music`, two in `SFX`. */
export const XACT_CUES = [
  { Name: "Tone261", WaveIndex: 0, CategoryIndex: 0, FrequencyHz: 261.6 },
  { Name: "Tone330", WaveIndex: 1, CategoryIndex: 0, FrequencyHz: 329.6 },
  { Name: "Tone392", WaveIndex: 2, CategoryIndex: 1, FrequencyHz: 392.0 },
  { Name: "Tone523", WaveIndex: 3, CategoryIndex: 1, FrequencyHz: 523.3 },
];

/** The whole fixture: the three files, by the name each is written under. */
export function xactFixture({ seconds = 0.25 } = {}) {
  const waves = XACT_CUES.map((cue) => sineWave(cue.FrequencyHz, seconds));
  return {
    "cna-ts.xgs": xgsSettings(),
    "cna-ts.xwb": xwbWaveBank("cna-ts", waves),
    "cna-ts.xsb": xsbSoundBank("cna-ts", "cna-ts", XACT_CUES),
  };
}
