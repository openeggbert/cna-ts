/**
 * XNB fixtures shared by every backend's integration evidence.
 *
 * These were written inside the Node integration suite, which meant the browser could not use
 * them: a second copy is a second thing to keep correct, and two copies of a hand-rolled binary
 * format drift silently. Both suites now build content from this one source, so a Texture2D loaded
 * in Node and the same one loaded in a browser are byte-identical by construction.
 *
 * Everything here is the documented Windows XNB v5 framing -- the magic, the platform and version
 * bytes, the seven-bit-encoded reader table, and for the compressed variants the XNA LZX
 * frame/block wrapper carrying a single uncompressed block.
 */

import { Color, Graphics } from "../../dist/index.js";

function seven(value) {
  const result = [];
  value >>>= 0;
  do {
    let item = value & 0x7f;
    value >>>= 7;
    if (value !== 0) item |= 0x80;
    result.push(item);
  } while (value !== 0);
  return result;
}

function integer(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return [...bytes];
}

function single(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value, true);
  return [...bytes];
}

function text(value) {
  const bytes = [...new TextEncoder().encode(value)];
  return [...seven(bytes.length), ...bytes];
}

function rectangle(x, y, width, height) {
  return [...integer(x), ...integer(y), ...integer(width), ...integer(height)];
}

export function spriteFontXnb() {
  const names = [
    "Microsoft.Xna.Framework.Content.SpriteFontReader",
    "Microsoft.Xna.Framework.Content.Texture2DReader",
    "Microsoft.Xna.Framework.Content.ListReader`1[[Microsoft.Xna.Framework.Rectangle]]",
    "Microsoft.Xna.Framework.Content.RectangleReader",
    "Microsoft.Xna.Framework.Content.ListReader`1[[System.Char]]",
    "Microsoft.Xna.Framework.Content.CharReader",
    "Microsoft.Xna.Framework.Content.ListReader`1[[Microsoft.Xna.Framework.Vector3]]",
    "Microsoft.Xna.Framework.Content.Vector3Reader",
  ];
  const atlas = Array.from({ length: 8 * 8 * 4 }, (_value, index) =>
    index % 4 === 3 ? 255 : 255);
  const payload = [
    ...seven(names.length),
    ...names.flatMap((name) => [...text(`${name}, Microsoft.Xna.Framework`), ...integer(0)]),
    ...seven(0),
    ...seven(1),
    ...seven(2), ...integer(Graphics.SurfaceFormat.Color), ...integer(8), ...integer(8), ...integer(1),
    ...integer(atlas.length), ...atlas,
    ...seven(3), ...integer(2), ...rectangle(0, 0, 4, 8), ...rectangle(4, 0, 4, 8),
    ...seven(3), ...integer(2), ...rectangle(0, 0, 4, 8), ...rectangle(0, 0, 4, 8),
    ...seven(5), ...integer(2), 65, 0, 63, 0,
    ...integer(8), ...single(1),
    ...seven(7), ...integer(2),
    ...single(0), ...single(4), ...single(0),
    ...single(0), ...single(4), ...single(0),
    1, 63, 0,
  ];
  const length = 10 + payload.length;
  return Uint8Array.from([0x58, 0x4e, 0x42, 0x77, 5, 0, ...integer(length), ...payload]);
}

export function textureXnb() {
  const pixels = [Color.Red, Color.Green, Color.Blue, Color.White]
    .flatMap((color) => [color.R, color.G, color.B, color.A]);
  const payload = [
    ...seven(1),
    ...text("Microsoft.Xna.Framework.Content.Texture2DReader, Microsoft.Xna.Framework"),
    ...integer(0), ...seven(0), ...seven(1),
    ...integer(Graphics.SurfaceFormat.Color), ...integer(2), ...integer(2), ...integer(1),
    ...integer(pixels.length), ...pixels,
  ];
  const length = 10 + payload.length;
  return Uint8Array.from([0x58, 0x4e, 0x42, 0x77, 5, 0, ...integer(length), ...payload]);
}

function lzxUncompressedBlock(payload) {
  const headerBits = (3 << 28) | (payload.length << 4);
  const result = new Uint8Array(16 + payload.length);
  result[0] = headerBits >>> 16;
  result[1] = headerBits >>> 24;
  result[2] = headerBits;
  result[3] = headerBits >>> 8;
  result[4] = 1;
  result[8] = 1;
  result[12] = 1;
  result.set(payload, 16);
  return result;
}

export function compressedXnb(uncompressed) {
  const payload = uncompressed.slice(10);
  const block = lzxUncompressedBlock(payload);
  const result = new Uint8Array(19 + block.length);
  result.set([0x58, 0x4e, 0x42, 0x77, 5, 0x80]);
  result.set(integer(result.length), 6);
  result.set(integer(payload.length), 10);
  result.set([0xff, payload.length >>> 8, payload.length, block.length >>> 8, block.length], 14);
  result.set(block, 19);
  return result;
}

export function modelVertexBytes() {
  return [
    ...single(0), ...single(0), ...single(0),
    ...single(1), ...single(0), ...single(0),
    ...single(0), ...single(1), ...single(0),
  ];
}

export function modelXnb() {
  const names = [
    "Microsoft.Xna.Framework.Content.ModelReader",
    "Microsoft.Xna.Framework.Content.StringReader",
    "Microsoft.Xna.Framework.Content.VertexBufferReader",
    "Microsoft.Xna.Framework.Content.IndexBufferReader",
    "Microsoft.Xna.Framework.Content.BasicEffectReader",
  ];
  const identity = [
    ...single(1), ...single(0), ...single(0), ...single(0),
    ...single(0), ...single(1), ...single(0), ...single(0),
    ...single(0), ...single(0), ...single(1), ...single(0),
    ...single(0), ...single(0), ...single(0), ...single(1),
  ];
  const payload = [
    ...seven(names.length),
    ...names.flatMap((name) => [...text(`${name}, Microsoft.Xna.Framework`), ...integer(0)]),
    ...seven(3),
    ...seven(1),
    ...integer(1),
    ...seven(2), ...text("Root"), ...identity,
    0, ...integer(0),
    ...integer(1),
    ...seven(2), ...text("Triangle"), 1,
    ...single(0), ...single(0), ...single(0), ...single(2),
    ...seven(0),
    ...integer(1),
    ...integer(0), ...integer(3), ...integer(0), ...integer(1),
    ...seven(0), ...seven(1), ...seven(2), ...seven(3),
    1, ...seven(0),
    ...seven(3),
    ...integer(12), ...integer(1),
    ...integer(0), ...integer(Graphics.VertexElementFormat.Vector3),
    ...integer(Graphics.VertexElementUsage.Position), ...integer(0),
    ...integer(3), ...modelVertexBytes(),
    ...seven(4), 1, ...integer(6), 0, 0, 1, 0, 2, 0,
    ...seven(5), ...text("../Textures/Atlas"),
    ...single(1), ...single(1), ...single(1),
    ...single(0), ...single(0), ...single(0),
    ...single(1), ...single(1), ...single(1),
    ...single(16), ...single(1), 0,
  ];
  const length = 10 + payload.length;
  return Uint8Array.from([0x58, 0x4e, 0x42, 0x77, 5, 0, ...integer(length), ...payload]);
}
