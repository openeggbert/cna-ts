/** Little-endian, bounds-checked reader used by the TypeScript ContentReader projection. */
export class BinaryReader {
  #bytes: Uint8Array;
  #view: DataView;
  #position = 0;

  public constructor(bytes: Uint8Array) {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("BinaryReader input must be Uint8Array");
    this.#bytes = new Uint8Array(bytes);
    this.#view = new DataView(this.#bytes.buffer, this.#bytes.byteOffset, this.#bytes.byteLength);
  }

  public get BaseStream(): Uint8Array { return new Uint8Array(this.#bytes); }

  /**
   * Internal: replaces the buffer and rewinds. A received network packet reuses one reader rather
   * than allocating a new one every frame, which is why this exists.
   */
  public resetForInternalUse(bytes: Uint8Array): void {
    this.#bytes = new Uint8Array(bytes);
    this.#view = new DataView(this.#bytes.buffer, this.#bytes.byteOffset, this.#bytes.byteLength);
    this.Position = 0;
  }
  public get Position(): number { return this.#position; }
  public set Position(value: number) {
    const position = Math.trunc(value);
    if (position < 0 || position > this.#bytes.byteLength) {
      throw new RangeError("Position is outside the buffer");
    }
    this.#position = position;
  }
  public get Length(): number { return this.#bytes.byteLength; }
  public get Remaining(): number { return this.Length - this.#position; }

  public ReadBoolean(): boolean { return this.ReadByte() !== 0; }
  public ReadByte(): number { this.#require(1); return this.#bytes[this.#position++]; }
  public ReadSByte(): number { this.#require(1); return this.#view.getInt8(this.#position++); }
  public ReadInt16(): number { return this.#number(2, (at) => this.#view.getInt16(at, true)); }
  public ReadUInt16(): number { return this.#number(2, (at) => this.#view.getUint16(at, true)); }
  public ReadInt32(): number { return this.#number(4, (at) => this.#view.getInt32(at, true)); }
  public ReadUInt32(): number { return this.#number(4, (at) => this.#view.getUint32(at, true)); }
  public ReadInt64(): bigint { return this.#number(8, (at) => this.#view.getBigInt64(at, true)); }
  public ReadUInt64(): bigint { return this.#number(8, (at) => this.#view.getBigUint64(at, true)); }
  public ReadSingle(): number { return this.#number(4, (at) => this.#view.getFloat32(at, true)); }
  public ReadDouble(): number { return this.#number(8, (at) => this.#view.getFloat64(at, true)); }
  public ReadBytes(count: number): Uint8Array {
    if (!Number.isInteger(count) || count < 0) throw new RangeError("count");
    this.#require(count);
    const result = this.#bytes.slice(this.#position, this.#position + count);
    this.#position += count;
    return result;
  }
  public Read7BitEncodedInt32(): number {
    let result = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const value = this.ReadByte();
      result |= (value & 0x7f) << shift;
      if ((value & 0x80) === 0) return result;
    }
    throw new RangeError("Invalid 7-bit encoded integer");
  }
  public ReadString(): string {
    const length = this.Read7BitEncodedInt32();
    return new TextDecoder("utf-8", { fatal: true }).decode(this.ReadBytes(length));
  }
  public ReadChar(): string { return String.fromCharCode(this.ReadUInt16()); }
  public Dispose(): void {}

  #require(count: number): void {
    if (count > this.Remaining) throw new RangeError("Unexpected end of binary data");
  }
  #number<T>(size: number, read: (position: number) => T): T {
    this.#require(size);
    const result = read(this.#position);
    this.#position += size;
    return result;
  }
}
