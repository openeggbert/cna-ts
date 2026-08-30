// SPDX-License-Identifier: MS-PL

import * as IO from "../../../../IO/index.js";
import { Color } from "../Color.js";
import { Matrix } from "../Matrix.js";
import { Quaternion } from "../Quaternion.js";
import { Vector2 } from "../Vector2.js";
import { Vector3 } from "../Vector3.js";
import { Vector4 } from "../Vector4.js";

/**
 * The packet buffers a networked game writes into and reads out of.
 *
 * XNA derives these from `System.IO.BinaryReader`/`BinaryWriter`. The projection derives them from
 * this package's own little-endian reader and writer, which is what those base classes are for a
 * game: the primitive Read/Write set over a buffer. What the XNA subclass adds -- the framework
 * value types, `Length` and `Position` -- is declared here.
 */

/** Reads framework values out of a received packet. */
export class PacketReader extends IO.BinaryReader {
  /** Creates an empty packet reader. */
  public constructor();
  /** Creates a packet reader with room reserved for a packet of a size. */
  public constructor(capacity: number);
  public constructor(capacity = 0) {
    super(new Uint8Array(Math.max(Math.trunc(capacity), 0)));
  }

  /** How many bytes the packet holds. */
  public override get Length(): number { return super.Length; }

  /** Where the next read starts. */
  public override get Position(): number { return super.Position; }
  public override set Position(value: number) { super.Position = value; }

  /** Reads a single-precision value. */
  public override ReadSingle(): number { return super.ReadSingle(); }
  /** Reads a double-precision value. */
  public override ReadDouble(): number { return super.ReadDouble(); }

  /** Reads a packed colour. */
  public ReadColor(): Color {
    // The packed value is what PacketWriter sent, so the channels go back exactly as they came.
    // FromNonPremultiplied would multiply them by the alpha a second time.
    const packed = super.ReadUInt32();
    return new Color(
      packed & 0xff, (packed >>> 8) & 0xff, (packed >>> 16) & 0xff, (packed >>> 24) & 0xff,
    );
  }

  /** Reads a two-component vector. */
  public ReadVector2(): Vector2 { return new Vector2(super.ReadSingle(), super.ReadSingle()); }

  /** Reads a three-component vector. */
  public ReadVector3(): Vector3 {
    return new Vector3(super.ReadSingle(), super.ReadSingle(), super.ReadSingle());
  }

  /** Reads a four-component vector. */
  public ReadVector4(): Vector4 {
    return new Vector4(
      super.ReadSingle(), super.ReadSingle(), super.ReadSingle(), super.ReadSingle(),
    );
  }

  /** Reads a quaternion. */
  public ReadQuaternion(): Quaternion {
    return new Quaternion(
      super.ReadSingle(), super.ReadSingle(), super.ReadSingle(), super.ReadSingle(),
    );
  }

  /** Reads a matrix in the row-major order `PacketWriter` writes it. */
  public ReadMatrix(): Matrix {
    const values: number[] = [];
    for (let index = 0; index < 16; index += 1) values.push(super.ReadSingle());
    return new Matrix(
      values[0] as number, values[1] as number, values[2] as number, values[3] as number,
      values[4] as number, values[5] as number, values[6] as number, values[7] as number,
      values[8] as number, values[9] as number, values[10] as number, values[11] as number,
      values[12] as number, values[13] as number, values[14] as number, values[15] as number,
    );
  }
}

/** Writes framework values into a packet to send. */
export class PacketWriter extends IO.BinaryWriter {
  /** Creates an empty packet writer. */
  public constructor();
  /** Creates a packet writer with room reserved for a packet of a size. */
  public constructor(capacity: number);
  public constructor(capacity = 64) {
    super(capacity);
  }

  /** How many bytes have been written. */
  public override get Length(): number { return super.Length; }

  /** Where the next write goes. */
  public override get Position(): number { return super.Position; }
  public override set Position(value: number) { super.Position = value; }

  /** Writes a single-precision value. */
  public Write(value: number): void;
  /** Writes a packed colour. */
  public Write(value: Color): void;
  /** Writes a two-component vector. */
  public Write(value: Vector2): void;
  /** Writes a three-component vector. */
  public Write(value: Vector3): void;
  /** Writes a four-component vector. */
  public Write(value: Vector4): void;
  /** Writes a quaternion. */
  public Write(value: Quaternion): void;
  /** Writes a matrix in row-major order. */
  public Write(value: Matrix): void;
  public Write(value: number | Color | Vector2 | Vector3 | Vector4 | Quaternion | Matrix): void {
    if (typeof value === "number") { super.WriteSingle(value); return; }
    if (value instanceof Color) { super.WriteUInt32(value.PackedValue); return; }
    if (value instanceof Vector2) {
      super.WriteSingle(value.X);
      super.WriteSingle(value.Y);
      return;
    }
    if (value instanceof Vector3) {
      super.WriteSingle(value.X);
      super.WriteSingle(value.Y);
      super.WriteSingle(value.Z);
      return;
    }
    if (value instanceof Vector4 || value instanceof Quaternion) {
      super.WriteSingle(value.X);
      super.WriteSingle(value.Y);
      super.WriteSingle(value.Z);
      super.WriteSingle(value.W);
      return;
    }
    for (const component of [
      value.M11, value.M12, value.M13, value.M14,
      value.M21, value.M22, value.M23, value.M24,
      value.M31, value.M32, value.M33, value.M34,
      value.M41, value.M42, value.M43, value.M44,
    ]) super.WriteSingle(component);
  }
}

/** Internal: hands a received packet to a reader. */
export function setPacketReaderBytesForInternalUse(reader: PacketReader, bytes: Uint8Array): void {
  reader.resetForInternalUse(bytes);
}

/** Internal: the bytes a game wrote into a packet. */
export function getPacketWriterBytesForInternalUse(writer: PacketWriter): Uint8Array {
  return writer.BaseStream;
}
