import {
  ArgumentException,
  ArgumentNullException,
} from "./exceptions.js";
import { Color } from "../Microsoft/Xna/Framework/Color.js";
import { Vector2 } from "../Microsoft/Xna/Framework/Vector2.js";
import { Vector3 } from "../Microsoft/Xna/Framework/Vector3.js";
import type { VertexDeclaration } from "../Microsoft/Xna/Framework/Graphics/VertexDeclaration.js";
import {
  VertexPositionColor,
  VertexPositionColorTexture,
  VertexPositionNormalTexture,
  VertexPositionTexture,
} from "../Microsoft/Xna/Framework/Graphics/VertexValues.js";

export interface VertexCodec {
  readonly NativeType: number;
  readonly UserSource: number;
  readonly Stride: number;
  encode(values: unknown[], startIndex: number, elementCount: number, preserveCapacity: boolean): Uint8Array;
  decode(bytes: Uint8Array, values: unknown[], startIndex: number, elementCount: number): void;
}

type SupportedVertex =
  | VertexPositionColor
  | VertexPositionColorTexture
  | VertexPositionNormalTexture
  | VertexPositionTexture;

function sameDeclaration(left: VertexDeclaration, right: VertexDeclaration): boolean {
  if (left.VertexStride !== right.VertexStride) return false;
  const a = left.GetVertexElements();
  const b = right.GetVertexElements();
  return a.length === b.length && a.every((value, index) =>
    value.Offset === b[index].Offset &&
    value.VertexElementFormat === b[index].VertexElementFormat &&
    value.VertexElementUsage === b[index].VertexElementUsage &&
    value.UsageIndex === b[index].UsageIndex);
}

function putVector2(view: DataView, offset: number, value: Vector2): void {
  view.setFloat32(offset, value.X, true);
  view.setFloat32(offset + 4, value.Y, true);
}

function putVector3(view: DataView, offset: number, value: Vector3): void {
  view.setFloat32(offset, value.X, true);
  view.setFloat32(offset + 4, value.Y, true);
  view.setFloat32(offset + 8, value.Z, true);
}

function getVector2(view: DataView, offset: number): Vector2 {
  return new Vector2(view.getFloat32(offset, true), view.getFloat32(offset + 4, true));
}

function getVector3(view: DataView, offset: number): Vector3 {
  return new Vector3(
    view.getFloat32(offset, true), view.getFloat32(offset + 4, true),
    view.getFloat32(offset + 8, true),
  );
}

function makeCodec<T extends SupportedVertex>(
  type: new (...args: never[]) => T,
  nativeType: number,
  userSource: number,
  declaration: VertexDeclaration,
  write: (view: DataView, offset: number, value: T) => void,
  read: (view: DataView, offset: number) => T,
): VertexCodec {
  const stride = declaration.VertexStride;
  return {
    NativeType: nativeType,
    UserSource: userSource,
    Stride: stride,
    encode(values, startIndex, elementCount, preserveCapacity) {
      const outputCount = preserveCapacity ? values.length : elementCount;
      const output = new Uint8Array(outputCount * stride);
      const view = new DataView(output.buffer);
      for (let index = 0; index < elementCount; index += 1) {
        const value = values[startIndex + index];
        if (!(value instanceof type)) {
          throw new ArgumentException(`data[${startIndex + index}] does not use the selected built-in vertex layout`);
        }
        write(view, (preserveCapacity ? startIndex + index : index) * stride, value);
      }
      return output;
    },
    decode(bytes, values, startIndex, elementCount) {
      if (bytes.byteLength !== elementCount * stride) {
        throw new ArgumentException("native vertex readback returned an inconsistent byte count");
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let index = 0; index < elementCount; index += 1) {
        values[startIndex + index] = read(view, index * stride);
      }
    },
  };
}

const codecs: readonly { readonly Type: new (...args: never[]) => SupportedVertex; readonly Declaration: VertexDeclaration; readonly Codec: VertexCodec }[] = [
  {
    Type: VertexPositionColor,
    Declaration: VertexPositionColor.VertexDeclaration,
    Codec: makeCodec(
      VertexPositionColor as unknown as new (...args: never[]) => VertexPositionColor,
      0,
      1,
      VertexPositionColor.VertexDeclaration,
      (view, offset, value) => {
        putVector3(view, offset, value.Position);
        view.setUint8(offset + 12, value.Color.R);
        view.setUint8(offset + 13, value.Color.G);
        view.setUint8(offset + 14, value.Color.B);
        view.setUint8(offset + 15, value.Color.A);
      },
      (view, offset) => new VertexPositionColor(
        getVector3(view, offset),
        new Color(
          view.getUint8(offset + 12), view.getUint8(offset + 13),
          view.getUint8(offset + 14), view.getUint8(offset + 15),
        ),
      ),
    ),
  },
  {
    Type: VertexPositionColorTexture,
    Declaration: VertexPositionColorTexture.VertexDeclaration,
    Codec: makeCodec(
      VertexPositionColorTexture as unknown as new (...args: never[]) => VertexPositionColorTexture,
      1,
      2,
      VertexPositionColorTexture.VertexDeclaration,
      (view, offset, value) => {
        putVector3(view, offset, value.Position);
        view.setUint8(offset + 12, value.Color.R);
        view.setUint8(offset + 13, value.Color.G);
        view.setUint8(offset + 14, value.Color.B);
        view.setUint8(offset + 15, value.Color.A);
        putVector2(view, offset + 16, value.TextureCoordinate);
      },
      (view, offset) => new VertexPositionColorTexture(
        getVector3(view, offset),
        new Color(
          view.getUint8(offset + 12), view.getUint8(offset + 13),
          view.getUint8(offset + 14), view.getUint8(offset + 15),
        ),
        getVector2(view, offset + 16),
      ),
    ),
  },
  {
    Type: VertexPositionTexture,
    Declaration: VertexPositionTexture.VertexDeclaration,
    Codec: makeCodec(
      VertexPositionTexture as unknown as new (...args: never[]) => VertexPositionTexture,
      6,
      3,
      VertexPositionTexture.VertexDeclaration,
      (view, offset, value) => {
        putVector3(view, offset, value.Position);
        putVector2(view, offset + 12, value.TextureCoordinate);
      },
      (view, offset) => new VertexPositionTexture(
        getVector3(view, offset), getVector2(view, offset + 12),
      ),
    ),
  },
  {
    Type: VertexPositionNormalTexture,
    Declaration: VertexPositionNormalTexture.VertexDeclaration,
    Codec: makeCodec(
      VertexPositionNormalTexture as unknown as new (...args: never[]) => VertexPositionNormalTexture,
      4,
      4,
      VertexPositionNormalTexture.VertexDeclaration,
      (view, offset, value) => {
        putVector3(view, offset, value.Position);
        putVector3(view, offset + 12, value.Normal);
        putVector2(view, offset + 24, value.TextureCoordinate);
      },
      (view, offset) => new VertexPositionNormalTexture(
        getVector3(view, offset), getVector3(view, offset + 12), getVector2(view, offset + 24),
      ),
    ),
  },
];

export function resolveVertexCodec(
  values: unknown,
  declaration: VertexDeclaration,
  startIndex: number,
  elementCount: number,
): VertexCodec {
  if (values == null) throw new ArgumentNullException("data");
  if (!Array.isArray(values)) throw new ArgumentException("data must be an array of a mapped built-in vertex type");
  const sample = elementCount > 0 ? values[startIndex] : undefined;
  const matches = codecs.filter((entry) => sameDeclaration(entry.Declaration, declaration));
  const selected = sample == null
    ? matches[0]
    : codecs.find((entry) => sample instanceof entry.Type);
  if (!selected || !sameDeclaration(selected.Declaration, declaration)) {
    throw new ArgumentException(
      "data must use VertexPositionColor, VertexPositionColorTexture, VertexPositionTexture, or VertexPositionNormalTexture with its exact declaration",
    );
  }
  return selected.Codec;
}
