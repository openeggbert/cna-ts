/**
 * Source files for the importers to read.
 *
 * These are deliberately written here rather than checked in as binaries, and deliberately written
 * as **source** formats rather than as anything resembling CNB. The point of an importer test is
 * that CNA reads a file this package did not produce with CNA — so the PNG below is encoded from
 * first principles against the PNG specification, and its pixels are four values no two of which
 * share a channel, so a transposed or swizzled decode cannot pass.
 */

/** CRC-32 with the PNG/zlib polynomial, which is the same one CRC-32C is deliberately not. */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Adler-32, which is what a zlib stream ends with. */
function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type, payload) {
  const body = new Uint8Array(4 + payload.length);
  for (let index = 0; index < 4; index += 1) body[index] = type.charCodeAt(index);
  body.set(payload, 4);
  const out = new Uint8Array(8 + payload.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, payload.length, false);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body), false);
  return out;
}

/**
 * A zlib stream carrying `data` in **stored** (uncompressed) deflate blocks.
 *
 * Stored blocks are legal deflate and every decoder must accept them, so this needs no compressor
 * and produces bytes whose relationship to the pixels is inspectable.
 */
function zlibStored(data) {
  const parts = [Uint8Array.from([0x78, 0x01])];
  for (let offset = 0; offset < data.length || offset === 0; offset += 0xffff) {
    const slice = data.subarray(offset, Math.min(offset + 0xffff, data.length));
    const last = offset + slice.length >= data.length ? 1 : 0;
    const header = new Uint8Array(5);
    const view = new DataView(header.buffer);
    header[0] = last;
    view.setUint16(1, slice.length, true);
    view.setUint16(3, ~slice.length & 0xffff, true);
    parts.push(header, slice);
    if (last === 1) break;
  }
  const trailer = new Uint8Array(4);
  new DataView(trailer.buffer).setUint32(0, adler32(data), false);
  parts.push(trailer);
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * An 8-bit RGBA PNG of the given size, from `pixels` in row-major order as `[r, g, b, a]` bytes.
 *
 * Filter type 0 on every scanline, so the stored bytes are the pixels: nothing here depends on a
 * filter implementation being right, and a decoder that ignored the filter byte would produce
 * visibly shifted rows rather than accidentally correct ones.
 */
export function encodePng(width, height, pixels) {
  if (pixels.length !== width * height * 4) {
    throw new Error(`expected ${width * height * 4} bytes, got ${pixels.length}`);
  }
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) {
    const at = row * (1 + width * 4);
    raw[at] = 0;
    raw.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), at + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  header[8] = 8;   // bit depth
  header[9] = 6;   // colour type 6 = RGBA
  header[10] = 0;  // deflate
  header[11] = 0;  // adaptive filtering
  header[12] = 0;  // no interlace
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** A minimal RIFF/WAVE image around 16-bit mono PCM samples. */
export function encodeWav(sampleRate, samples) {
  const bytes = new Uint8Array(44 + samples.byteLength);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.byteLength, true);
  bytes.set(samples, 44);
  return bytes;
}
