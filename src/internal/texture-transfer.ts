import { Color } from "../Microsoft/Xna/Framework/Color.js";
import { Vector2 } from "../Microsoft/Xna/Framework/Vector2.js";
import { Vector4 } from "../Microsoft/Xna/Framework/Vector4.js";
import { SurfaceFormat } from "../Microsoft/Xna/Framework/Graphics/DeviceEnums.js";
import {
  Alpha8,
  Bgr565,
  Bgra4444,
  Bgra5551,
  HalfSingle,
  HalfVector2,
  HalfVector4,
  NormalizedByte2,
  NormalizedByte4,
  Rg32,
  Rgba1010102,
  Rgba64,
} from "../Microsoft/Xna/Framework/Graphics/PackedVector/PackedValues.js";
import { ArgumentException, NotSupportedException } from "./exceptions.js";

export interface TextureElementCodec {
  readonly DataType: number;
  readonly ElementSize: number;
  readonly Name: string;
  readonly Kind:
    | "byte" | "ushort" | "single" | "color" | "vector2" | "vector4" | "packed";
  readonly Constructor?: abstract new (...args: never[]) => object;
}

const BYTE: TextureElementCodec = { DataType: 4, ElementSize: 1, Name: "byte", Kind: "byte" };
const USHORT: TextureElementCodec = { DataType: 17, ElementSize: 2, Name: "ushort", Kind: "ushort" };
const SINGLE: TextureElementCodec = { DataType: 11, ElementSize: 4, Name: "float", Kind: "single" };
const COLOR: TextureElementCodec = {
  DataType: 0, ElementSize: 4, Name: "Color", Kind: "color", Constructor: Color,
};
const VECTOR2: TextureElementCodec = {
  DataType: 12, ElementSize: 8, Name: "Vector2", Kind: "vector2", Constructor: Vector2,
};
const VECTOR4: TextureElementCodec = {
  DataType: 13, ElementSize: 16, Name: "Vector4", Kind: "vector4", Constructor: Vector4,
};

function packed(
  dataType: number,
  elementSize: number,
  name: string,
  Constructor: abstract new (...args: never[]) => object,
): TextureElementCodec {
  return { DataType: dataType, ElementSize: elementSize, Name: name, Kind: "packed", Constructor };
}

const PACKED_CODECS = [
  packed(1, 2, "Bgr565", Bgr565),
  packed(2, 2, "Bgra5551", Bgra5551),
  packed(3, 2, "Bgra4444", Bgra4444),
  packed(5, 2, "NormalizedByte2", NormalizedByte2),
  packed(6, 4, "NormalizedByte4", NormalizedByte4),
  packed(7, 4, "Rgba1010102", Rgba1010102),
  packed(8, 4, "Rg32", Rg32),
  packed(9, 8, "Rgba64", Rgba64),
  packed(10, 1, "Alpha8", Alpha8),
  packed(14, 2, "HalfSingle", HalfSingle),
  packed(15, 4, "HalfVector2", HalfVector2),
  packed(16, 8, "HalfVector4", HalfVector4),
] as const;

const CANONICAL_BY_FORMAT = new Map<number, TextureElementCodec>([
  [SurfaceFormat.Color, COLOR],
  [SurfaceFormat.Bgr565, PACKED_CODECS[0]],
  [SurfaceFormat.Bgra5551, PACKED_CODECS[1]],
  [SurfaceFormat.Bgra4444, PACKED_CODECS[2]],
  [SurfaceFormat.Dxt1, BYTE],
  [SurfaceFormat.Dxt3, BYTE],
  [SurfaceFormat.Dxt5, BYTE],
  [SurfaceFormat.NormalizedByte2, PACKED_CODECS[3]],
  [SurfaceFormat.NormalizedByte4, PACKED_CODECS[4]],
  [SurfaceFormat.Rgba1010102, PACKED_CODECS[5]],
  [SurfaceFormat.Rg32, PACKED_CODECS[6]],
  [SurfaceFormat.Rgba64, PACKED_CODECS[7]],
  [SurfaceFormat.Alpha8, PACKED_CODECS[8]],
  [SurfaceFormat.Single, SINGLE],
  [SurfaceFormat.Vector2, VECTOR2],
  [SurfaceFormat.Vector4, VECTOR4],
  [SurfaceFormat.HalfSingle, PACKED_CODECS[9]],
  [SurfaceFormat.HalfVector2, PACKED_CODECS[10]],
  [SurfaceFormat.HalfVector4, PACKED_CODECS[11]],
  [SurfaceFormat.HdrBlendable, PACKED_CODECS[11]],
]);

export function textureTransferArrayLength(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data instanceof Uint8Array || data instanceof Uint8ClampedArray ||
      data instanceof Uint16Array || data instanceof Float32Array) return data.length;
  if (ArrayBuffer.isView(data)) {
    throw new NotSupportedException(
      "Texture transfers support Uint8Array, Uint8ClampedArray, Uint16Array, Float32Array, " +
      "or arrays of mapped XNA value types",
    );
  }
  throw new ArgumentException("data must be an array or a supported typed array");
}

function codecFromValue(value: unknown): TextureElementCodec | null {
  if (value instanceof Color) return COLOR;
  if (value instanceof Vector2) return VECTOR2;
  if (value instanceof Vector4) return VECTOR4;
  return PACKED_CODECS.find((codec) =>
    codec.Constructor != null && value instanceof codec.Constructor
  ) ?? null;
}

function isCompressed(format: SurfaceFormat): boolean {
  return format === SurfaceFormat.Dxt1 || format === SurfaceFormat.Dxt3 ||
    format === SurfaceFormat.Dxt5;
}

function formatUnitSize(format: SurfaceFormat): number {
  switch (format) {
    case SurfaceFormat.Color:
    case SurfaceFormat.NormalizedByte4:
    case SurfaceFormat.Rgba1010102:
    case SurfaceFormat.Rg32:
    case SurfaceFormat.Single:
    case SurfaceFormat.HalfVector2:
      return 4;
    case SurfaceFormat.Bgr565:
    case SurfaceFormat.Bgra5551:
    case SurfaceFormat.Bgra4444:
    case SurfaceFormat.NormalizedByte2:
    case SurfaceFormat.HalfSingle:
      return 2;
    case SurfaceFormat.Dxt1:
      return 8;
    case SurfaceFormat.Dxt3:
    case SurfaceFormat.Dxt5:
    case SurfaceFormat.Vector4:
      return 16;
    case SurfaceFormat.Rgba64:
    case SurfaceFormat.Vector2:
    case SurfaceFormat.HalfVector4:
    case SurfaceFormat.HdrBlendable:
      return 8;
    case SurfaceFormat.Alpha8:
      return 1;
    default:
      throw new ArgumentException("format is not a selected XNA SurfaceFormat value");
  }
}

export function textureRegionByteCount(
  format: SurfaceFormat,
  width: number,
  height: number,
): number {
  const unit = formatUnitSize(format);
  return isCompressed(format)
    ? Math.ceil(width / 4) * Math.ceil(height / 4) * unit
    : width * height * unit;
}

function numericArrayCodec(
  data: readonly unknown[],
  startIndex: number,
  elementCount: number,
  format: SurfaceFormat,
  requiredBytes: number,
): TextureElementCodec {
  const values = data.slice(startIndex, startIndex + elementCount);
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new NotSupportedException("A numeric texture transfer contains a non-finite or non-number value");
  }
  if (elementCount === requiredBytes) {
    if (!values.every((value) =>
      typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xff
    )) {
      throw new ArgumentException("byte texture data must contain integers from 0 through 255");
    }
    return BYTE;
  }
  if (format === SurfaceFormat.Single && elementCount * 4 === requiredBytes) return SINGLE;
  if (elementCount * 2 === requiredBytes) {
    if (!values.every((value) =>
      typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffff
    )) {
      throw new ArgumentException("ushort texture data must contain integers from 0 through 65535");
    }
    return USHORT;
  }
  throw new ArgumentException(
    "A number[] transfer is ambiguous; use exact byte/ushort/float element counts or mapped XNA values",
  );
}

export function resolveTextureElementCodec(
  data: unknown,
  startIndex: number,
  elementCount: number,
  format: SurfaceFormat,
  requiredBytes: number,
  forReadback: boolean,
): TextureElementCodec {
  let codec: TextureElementCodec;
  if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) codec = BYTE;
  else if (data instanceof Uint16Array) codec = USHORT;
  else if (data instanceof Float32Array) codec = SINGLE;
  else if (Array.isArray(data)) {
    const sample = data.slice(startIndex, startIndex + elementCount)
      .find((value) => value !== undefined && value !== null);
    const valueCodec = codecFromValue(sample);
    if (sample != null && valueCodec == null && typeof sample !== "number") {
      throw new NotSupportedException("The texture array contains an unsupported element representation");
    }
    codec = valueCodec ?? (typeof sample === "number"
      ? numericArrayCodec(data, startIndex, elementCount, format, requiredBytes)
      : CANONICAL_BY_FORMAT.get(format) ?? BYTE);
    if (!forReadback && sample == null && elementCount > 0) {
      throw new NotSupportedException("SetData cannot infer an element representation from an empty array window");
    }
  } else {
    textureTransferArrayLength(data);
    throw new NotSupportedException("Unsupported texture element representation");
  }

  const unit = formatUnitSize(format);
  const canonical = CANONICAL_BY_FORMAT.get(format);
  if (canonical == null || codec !== canonical) {
    throw new ArgumentException(
      `${codec.Name} (${codec.ElementSize} bytes) is incompatible with SurfaceFormat ${format}`,
    );
  }
  if (codec.ElementSize > unit || unit % codec.ElementSize !== 0) {
    throw new ArgumentException("The mapped element size is incompatible with the surface format unit");
  }
  if (requiredBytes % codec.ElementSize !== 0 || requiredBytes / codec.ElementSize !== elementCount) {
    throw new ArgumentException("elementCount does not exactly cover the selected texture region");
  }
  return codec;
}

function writePacked(view: DataView, offset: number, size: number, value: number | bigint): void {
  if (size === 1) view.setUint8(offset, Number(value));
  else if (size === 2) view.setUint16(offset, Number(value), true);
  else if (size === 4) view.setUint32(offset, Number(value), true);
  else view.setBigUint64(offset, BigInt(value), true);
}

function packedValue(value: object): number | bigint {
  return (value as { readonly PackedValue: number | bigint }).PackedValue;
}

export function encodeTextureTransfer(
  data: unknown,
  codec: TextureElementCodec,
  startIndex: number,
  elementCount: number,
  capacity: number,
): Uint8Array {
  const bytes = new Uint8Array(capacity * codec.ElementSize);
  const view = new DataView(bytes.buffer);
  for (let index = startIndex; index < startIndex + elementCount; index += 1) {
    const value = (data as { readonly [key: number]: unknown })[index];
    const offset = index * codec.ElementSize;
    if (codec.Kind === "byte") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xff) {
        throw new ArgumentException("byte texture data must contain integers from 0 through 255");
      }
      view.setUint8(offset, value);
    } else if (codec.Kind === "ushort") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xffff) {
        throw new ArgumentException("ushort texture data must contain integers from 0 through 65535");
      }
      view.setUint16(offset, value, true);
    } else if (codec.Kind === "single") {
      if (typeof value !== "number") throw new ArgumentException("float texture data must contain numbers");
      view.setFloat32(offset, value, true);
    } else if (codec.Kind === "color") {
      if (!(value instanceof Color)) throw new ArgumentException("Color texture data contains a different value type");
      view.setUint8(offset, value.R);
      view.setUint8(offset + 1, value.G);
      view.setUint8(offset + 2, value.B);
      view.setUint8(offset + 3, value.A);
    } else if (codec.Kind === "vector2") {
      if (!(value instanceof Vector2)) throw new ArgumentException("Vector2 texture data contains a different value type");
      view.setFloat32(offset, value.X, true);
      view.setFloat32(offset + 4, value.Y, true);
    } else if (codec.Kind === "vector4") {
      if (!(value instanceof Vector4)) throw new ArgumentException("Vector4 texture data contains a different value type");
      view.setFloat32(offset, value.X, true);
      view.setFloat32(offset + 4, value.Y, true);
      view.setFloat32(offset + 8, value.Z, true);
      view.setFloat32(offset + 12, value.W, true);
    } else {
      if (codec.Constructor == null || !(value instanceof codec.Constructor)) {
        throw new ArgumentException(`${codec.Name} texture data contains a different value type`);
      }
      writePacked(view, offset, codec.ElementSize, packedValue(value));
    }
  }
  return bytes;
}

function makePacked(codec: TextureElementCodec, value: number | bigint): object {
  let result: { PackedValue: number | bigint };
  switch (codec.DataType) {
    case 1: result = new Bgr565(0, 0, 0); break;
    case 2: result = new Bgra5551(0, 0, 0, 0); break;
    case 3: result = new Bgra4444(0, 0, 0, 0); break;
    case 5: result = new NormalizedByte2(0, 0); break;
    case 6: result = new NormalizedByte4(0, 0, 0, 0); break;
    case 7: result = new Rgba1010102(0, 0, 0, 0); break;
    case 8: result = new Rg32(0, 0); break;
    case 9: result = new Rgba64(0, 0, 0, 0); break;
    case 10: result = new Alpha8(0); break;
    case 14: result = new HalfSingle(0); break;
    case 15: result = new HalfVector2(0, 0); break;
    case 16: result = new HalfVector4(0, 0, 0, 0); break;
    default: throw new NotSupportedException(`Unsupported packed texture data type ${codec.DataType}`);
  }
  result.PackedValue = value;
  return result;
}

export function decodeTextureTransfer(
  target: unknown,
  codec: TextureElementCodec,
  bytes: Uint8Array,
  startIndex: number,
  elementCount: number,
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output = target as { [key: number]: unknown };
  for (let index = startIndex; index < startIndex + elementCount; index += 1) {
    const offset = index * codec.ElementSize;
    if (codec.Kind === "byte") output[index] = view.getUint8(offset);
    else if (codec.Kind === "ushort") output[index] = view.getUint16(offset, true);
    else if (codec.Kind === "single") output[index] = view.getFloat32(offset, true);
    else if (codec.Kind === "color") {
      output[index] = new Color(
        view.getUint8(offset), view.getUint8(offset + 1),
        view.getUint8(offset + 2), view.getUint8(offset + 3),
      );
    } else if (codec.Kind === "vector2") {
      output[index] = new Vector2(view.getFloat32(offset, true), view.getFloat32(offset + 4, true));
    } else if (codec.Kind === "vector4") {
      output[index] = new Vector4(
        view.getFloat32(offset, true), view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true), view.getFloat32(offset + 12, true),
      );
    } else {
      const value = codec.ElementSize === 1 ? view.getUint8(offset)
        : codec.ElementSize === 2 ? view.getUint16(offset, true)
          : codec.ElementSize === 4 ? view.getUint32(offset, true)
            : view.getBigUint64(offset, true);
      output[index] = makePacked(codec, value);
    }
  }
}
