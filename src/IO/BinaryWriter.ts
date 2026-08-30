// SPDX-License-Identifier: MS-PL

/**
 * The little-endian counterpart of {@link BinaryReader}, over a buffer that grows as it is written.
 *
 * This is package support, not `Microsoft.Xna.Framework` surface: it exists because XNA's
 * `PacketWriter` derives from `System.IO.BinaryWriter`, and a projection of that subclass needs a
 * base with the same shape.
 */
export class BinaryWriter {
  #bytes: Uint8Array;
  #view: DataView;
  #position = 0;
  #length = 0;

  public constructor(capacity = 64) {
    const size = Math.max(Math.trunc(capacity), 1);
    this.#bytes = new Uint8Array(size);
    this.#view = new DataView(this.#bytes.buffer);
  }

  /** The bytes written so far, copied. */
  public get BaseStream(): Uint8Array { return new Uint8Array(this.#bytes.subarray(0, this.#length)); }

  /** How many bytes have been written. */
  public get Length(): number { return this.#length; }

  /** Where the next write goes. */
  public get Position(): number { return this.#position; }
  public set Position(value: number) {
    const position = Math.trunc(value);
    if (position < 0 || position > this.#length) throw new RangeError("Position is outside the buffer");
    this.#position = position;
  }

  /** Discards everything written. */
  public Clear(): void {
    this.#position = 0;
    this.#length = 0;
  }

  #reserve(size: number): DataView {
    const required = this.#position + size;
    if (required > this.#bytes.byteLength) {
      const grown = new Uint8Array(Math.max(required, this.#bytes.byteLength * 2));
      grown.set(this.#bytes);
      this.#bytes = grown;
      this.#view = new DataView(this.#bytes.buffer);
    }
    const at = this.#position;
    this.#position += size;
    if (this.#position > this.#length) this.#length = this.#position;
    return new DataView(this.#view.buffer, at, size);
  }

  public WriteByte(value: number): void { this.#reserve(1).setUint8(0, value & 0xff); }
  public WriteInt16(value: number): void { this.#reserve(2).setInt16(0, value, true); }
  public WriteUInt16(value: number): void { this.#reserve(2).setUint16(0, value, true); }
  public WriteInt32(value: number): void { this.#reserve(4).setInt32(0, value | 0, true); }
  public WriteUInt32(value: number): void { this.#reserve(4).setUint32(0, value >>> 0, true); }
  public WriteSingle(value: number): void { this.#reserve(4).setFloat32(0, Math.fround(value), true); }
  public WriteDouble(value: number): void { this.#reserve(8).setFloat64(0, value, true); }
  public WriteBytes(bytes: Uint8Array): void {
    const view = this.#reserve(bytes.byteLength);
    new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(bytes);
  }
}
