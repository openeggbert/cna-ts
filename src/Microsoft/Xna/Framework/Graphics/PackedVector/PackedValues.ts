import type { IEquatable } from "../../Contracts.js";
import { Vector2 } from "../../Vector2.js";
import { Vector3 } from "../../Vector3.js";
import { Vector4 } from "../../Vector4.js";
import {
  packHalf, packedHash, packedHex, packSigned, packSNorm, packUNorm, packUnsigned,
  signed16, unpackHalf, unpackSNorm, unpackUNorm,
} from "../../../../../internal/packed.js";
import { valueString } from "../../../../../internal/value.js";
import type { IPackedVectorOfT } from "./IPackedVectorOfT.js";

export class Alpha8 implements IPackedVectorOfT<number>, IEquatable<Alpha8> {
  #packedValue: number;
  public constructor(alpha: number) { this.#packedValue = packUNorm(255, alpha); }
  public get PackedValue(): number { return this.#packedValue; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) & 0xff; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = packUNorm(255, vector.W); }
  public ToAlpha(): number { return unpackUNorm(255, this.#packedValue); }
  public ToVector4(): Vector4 { return new Vector4(0, 0, 0, this.ToAlpha()); }
  public ToString(): string { return packedHex(this.#packedValue, 2); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: Alpha8): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof Alpha8 && this.#packedValue === obj.#packedValue; }
}

export class Bgr565 implements IPackedVectorOfT<number>, IEquatable<Bgr565> {
  #packedValue: number;
  public constructor(vector: Vector3);
  public constructor(x: number, y: number, z: number);
  public constructor(vectorOrX: Vector3 | number, y?: number, z?: number) {
    const x = vectorOrX instanceof Vector3 ? vectorOrX.X : vectorOrX;
    this.#packedValue = Bgr565.pack(x, vectorOrX instanceof Vector3 ? vectorOrX.Y : y ?? 0, vectorOrX instanceof Vector3 ? vectorOrX.Z : z ?? 0);
  }
  public get PackedValue(): number { return this.#packedValue; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) & 0xffff; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = Bgr565.pack(vector.X, vector.Y, vector.Z); }
  public ToVector3(): Vector3 {
    return new Vector3(unpackUNorm(31, this.#packedValue >>> 11), unpackUNorm(63, this.#packedValue >>> 5), unpackUNorm(31, this.#packedValue));
  }
  public ToVector4(): Vector4 { const v = this.ToVector3(); return new Vector4(v, 1); }
  public ToString(): string { return packedHex(this.#packedValue, 4); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: Bgr565): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof Bgr565 && this.#packedValue === obj.#packedValue; }
  private static pack(x: number, y: number, z: number): number {
    return ((packUNorm(31, x) << 11) | (packUNorm(63, y) << 5) | packUNorm(31, z)) & 0xffff;
  }
}

export class Bgra4444 implements IPackedVectorOfT<number>, IEquatable<Bgra4444> {
  #packedValue: number;
  public constructor(vector: Vector4);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(vectorOrX: Vector4 | number, y?: number, z?: number, w?: number) {
    const values = vectorOrX instanceof Vector4 ? [vectorOrX.X, vectorOrX.Y, vectorOrX.Z, vectorOrX.W] : [vectorOrX, y ?? 0, z ?? 0, w ?? 0];
    this.#packedValue = Bgra4444.pack(...(values as [number, number, number, number]));
  }
  public get PackedValue(): number { return this.#packedValue; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) & 0xffff; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = Bgra4444.pack(vector.X, vector.Y, vector.Z, vector.W); }
  public ToVector4(): Vector4 {
    return new Vector4(unpackUNorm(15, this.#packedValue >>> 8), unpackUNorm(15, this.#packedValue >>> 4), unpackUNorm(15, this.#packedValue), unpackUNorm(15, this.#packedValue >>> 12));
  }
  public ToString(): string { return packedHex(this.#packedValue, 4); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: Bgra4444): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof Bgra4444 && this.#packedValue === obj.#packedValue; }
  private static pack(x: number, y: number, z: number, w: number): number {
    return ((packUNorm(15, x) << 8) | (packUNorm(15, y) << 4) | packUNorm(15, z) | (packUNorm(15, w) << 12)) & 0xffff;
  }
}

export class Bgra5551 implements IPackedVectorOfT<number>, IEquatable<Bgra5551> {
  #packedValue: number;
  public constructor(vector: Vector4);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(vectorOrX: Vector4 | number, y?: number, z?: number, w?: number) {
    const values = vectorOrX instanceof Vector4 ? [vectorOrX.X, vectorOrX.Y, vectorOrX.Z, vectorOrX.W] : [vectorOrX, y ?? 0, z ?? 0, w ?? 0];
    this.#packedValue = Bgra5551.pack(...(values as [number, number, number, number]));
  }
  public get PackedValue(): number { return this.#packedValue; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) & 0xffff; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = Bgra5551.pack(vector.X, vector.Y, vector.Z, vector.W); }
  public ToVector4(): Vector4 {
    return new Vector4(unpackUNorm(31, this.#packedValue >>> 10), unpackUNorm(31, this.#packedValue >>> 5), unpackUNorm(31, this.#packedValue), unpackUNorm(1, this.#packedValue >>> 15));
  }
  public ToString(): string { return packedHex(this.#packedValue, 4); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: Bgra5551): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof Bgra5551 && this.#packedValue === obj.#packedValue; }
  private static pack(x: number, y: number, z: number, w: number): number {
    return ((packUNorm(31, x) << 10) | (packUNorm(31, y) << 5) | packUNorm(31, z) | (packUNorm(1, w) << 15)) & 0xffff;
  }
}

export class Byte4 implements IPackedVectorOfT<number>, IEquatable<Byte4> {
  #packedValue: number;
  public constructor(vector: Vector4);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(vectorOrX: Vector4 | number, y?: number, z?: number, w?: number) {
    const values = vectorOrX instanceof Vector4 ? [vectorOrX.X, vectorOrX.Y, vectorOrX.Z, vectorOrX.W] : [vectorOrX, y ?? 0, z ?? 0, w ?? 0];
    this.#packedValue = Byte4.pack(...(values as [number, number, number, number]));
  }
  public get PackedValue(): number { return this.#packedValue >>> 0; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) >>> 0; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = Byte4.pack(vector.X, vector.Y, vector.Z, vector.W); }
  public ToVector4(): Vector4 {
    return new Vector4(this.#packedValue & 0xff, (this.#packedValue >>> 8) & 0xff, (this.#packedValue >>> 16) & 0xff, (this.#packedValue >>> 24) & 0xff);
  }
  public ToString(): string { return packedHex(this.#packedValue, 8); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: Byte4): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof Byte4 && this.PackedValue === obj.PackedValue; }
  private static pack(x: number, y: number, z: number, w: number): number {
    return (packUnsigned(255, x) | (packUnsigned(255, y) << 8) | (packUnsigned(255, z) << 16) | (packUnsigned(255, w) << 24)) >>> 0;
  }
}

export class HalfSingle implements IPackedVectorOfT<number>, IEquatable<HalfSingle> {
  #packedValue: number;
  public constructor(value: number) { this.#packedValue = packHalf(value); }
  public get PackedValue(): number { return this.#packedValue; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) & 0xffff; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = packHalf(vector.X); }
  public ToSingle(): number { return unpackHalf(this.#packedValue); }
  public ToVector4(): Vector4 { return new Vector4(this.ToSingle(), 0, 0, 1); }
  public ToString(): string { return valueString(this.ToSingle()); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: HalfSingle): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof HalfSingle && this.#packedValue === obj.#packedValue; }
}

export class HalfVector2 implements IPackedVectorOfT<number>, IEquatable<HalfVector2> {
  #packedValue: number;
  public constructor(vector: Vector2);
  public constructor(x: number, y: number);
  public constructor(vectorOrX: Vector2 | number, y?: number) {
    const x = vectorOrX instanceof Vector2 ? vectorOrX.X : vectorOrX;
    this.#packedValue = HalfVector2.pack(x, vectorOrX instanceof Vector2 ? vectorOrX.Y : y ?? 0);
  }
  public get PackedValue(): number { return this.#packedValue >>> 0; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) >>> 0; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = HalfVector2.pack(vector.X, vector.Y); }
  public ToVector2(): Vector2 { return new Vector2(unpackHalf(this.#packedValue), unpackHalf(this.#packedValue >>> 16)); }
  public ToVector4(): Vector4 { const value = this.ToVector2(); return new Vector4(value, 0, 1); }
  public ToString(): string { return this.ToVector2().ToString(); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: HalfVector2): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof HalfVector2 && this.PackedValue === obj.PackedValue; }
  private static pack(x: number, y: number): number { return (packHalf(x) | (packHalf(y) << 16)) >>> 0; }
}

export class HalfVector4 implements IPackedVectorOfT<bigint>, IEquatable<HalfVector4> {
  #packedValue: bigint;
  public constructor(vector: Vector4);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(vectorOrX: Vector4 | number, y?: number, z?: number, w?: number) {
    const values = vectorOrX instanceof Vector4 ? [vectorOrX.X, vectorOrX.Y, vectorOrX.Z, vectorOrX.W] : [vectorOrX, y ?? 0, z ?? 0, w ?? 0];
    this.#packedValue = HalfVector4.pack(...(values as [number, number, number, number]));
  }
  public get PackedValue(): bigint { return this.#packedValue; }
  public set PackedValue(value: bigint) { this.#packedValue = BigInt.asUintN(64, value); }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = HalfVector4.pack(vector.X, vector.Y, vector.Z, vector.W); }
  public ToVector4(): Vector4 {
    return new Vector4(
      unpackHalf(Number(this.#packedValue & 0xffffn)), unpackHalf(Number((this.#packedValue >> 16n) & 0xffffn)),
      unpackHalf(Number((this.#packedValue >> 32n) & 0xffffn)), unpackHalf(Number((this.#packedValue >> 48n) & 0xffffn)),
    );
  }
  public ToString(): string { return this.ToVector4().ToString(); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: HalfVector4): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof HalfVector4 && this.#packedValue === obj.#packedValue; }
  private static pack(x: number, y: number, z: number, w: number): bigint {
    return BigInt(packHalf(x)) | (BigInt(packHalf(y)) << 16n) | (BigInt(packHalf(z)) << 32n) | (BigInt(packHalf(w)) << 48n);
  }
}

export class NormalizedByte2 implements IPackedVectorOfT<number>, IEquatable<NormalizedByte2> {
  #packedValue: number;
  public constructor(vector: Vector2);
  public constructor(x: number, y: number);
  public constructor(vectorOrX: Vector2 | number, y?: number) {
    const x = vectorOrX instanceof Vector2 ? vectorOrX.X : vectorOrX;
    this.#packedValue = NormalizedByte2.pack(x, vectorOrX instanceof Vector2 ? vectorOrX.Y : y ?? 0);
  }
  public get PackedValue(): number { return this.#packedValue; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) & 0xffff; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = NormalizedByte2.pack(vector.X, vector.Y); }
  public ToVector2(): Vector2 { return new Vector2(unpackSNorm(255, this.#packedValue), unpackSNorm(255, this.#packedValue >>> 8)); }
  public ToVector4(): Vector4 { const value = this.ToVector2(); return new Vector4(value, 0, 1); }
  public ToString(): string { return packedHex(this.#packedValue, 4); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: NormalizedByte2): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof NormalizedByte2 && this.#packedValue === obj.#packedValue; }
  private static pack(x: number, y: number): number { return (packSNorm(255, x) | (packSNorm(255, y) << 8)) & 0xffff; }
}

export class NormalizedByte4 implements IPackedVectorOfT<number>, IEquatable<NormalizedByte4> {
  #packedValue: number;
  public constructor(vector: Vector4);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(vectorOrX: Vector4 | number, y?: number, z?: number, w?: number) {
    const values = vectorOrX instanceof Vector4 ? [vectorOrX.X, vectorOrX.Y, vectorOrX.Z, vectorOrX.W] : [vectorOrX, y ?? 0, z ?? 0, w ?? 0];
    this.#packedValue = NormalizedByte4.pack(...(values as [number, number, number, number]));
  }
  public get PackedValue(): number { return this.#packedValue >>> 0; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) >>> 0; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = NormalizedByte4.pack(vector.X, vector.Y, vector.Z, vector.W); }
  public ToVector4(): Vector4 {
    return new Vector4(unpackSNorm(255, this.#packedValue), unpackSNorm(255, this.#packedValue >>> 8), unpackSNorm(255, this.#packedValue >>> 16), unpackSNorm(255, this.#packedValue >>> 24));
  }
  public ToString(): string { return packedHex(this.#packedValue, 8); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: NormalizedByte4): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof NormalizedByte4 && this.PackedValue === obj.PackedValue; }
  private static pack(x: number, y: number, z: number, w: number): number {
    return (packSNorm(255, x) | (packSNorm(255, y) << 8) | (packSNorm(255, z) << 16) | (packSNorm(255, w) << 24)) >>> 0;
  }
}

export class NormalizedShort2 implements IPackedVectorOfT<number>, IEquatable<NormalizedShort2> {
  #packedValue: number;
  public constructor(vector: Vector2);
  public constructor(x: number, y: number);
  public constructor(vectorOrX: Vector2 | number, y?: number) {
    const x = vectorOrX instanceof Vector2 ? vectorOrX.X : vectorOrX;
    this.#packedValue = NormalizedShort2.pack(x, vectorOrX instanceof Vector2 ? vectorOrX.Y : y ?? 0);
  }
  public get PackedValue(): number { return this.#packedValue >>> 0; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) >>> 0; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = NormalizedShort2.pack(vector.X, vector.Y); }
  public ToVector2(): Vector2 { return new Vector2(unpackSNorm(65535, this.#packedValue), unpackSNorm(65535, this.#packedValue >>> 16)); }
  public ToVector4(): Vector4 { const value = this.ToVector2(); return new Vector4(value, 0, 1); }
  public ToString(): string { return packedHex(this.#packedValue, 8); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: NormalizedShort2): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof NormalizedShort2 && this.PackedValue === obj.PackedValue; }
  private static pack(x: number, y: number): number { return (packSNorm(65535, x) | (packSNorm(65535, y) << 16)) >>> 0; }
}

export class NormalizedShort4 implements IPackedVectorOfT<bigint>, IEquatable<NormalizedShort4> {
  #packedValue: bigint;
  public constructor(vector: Vector4);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(vectorOrX: Vector4 | number, y?: number, z?: number, w?: number) {
    const values = vectorOrX instanceof Vector4 ? [vectorOrX.X, vectorOrX.Y, vectorOrX.Z, vectorOrX.W] : [vectorOrX, y ?? 0, z ?? 0, w ?? 0];
    this.#packedValue = NormalizedShort4.pack(...(values as [number, number, number, number]));
  }
  public get PackedValue(): bigint { return this.#packedValue; }
  public set PackedValue(value: bigint) { this.#packedValue = BigInt.asUintN(64, value); }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = NormalizedShort4.pack(vector.X, vector.Y, vector.Z, vector.W); }
  public ToVector4(): Vector4 {
    return new Vector4(
      unpackSNorm(65535, Number(this.#packedValue & 0xffffn)), unpackSNorm(65535, Number((this.#packedValue >> 16n) & 0xffffn)),
      unpackSNorm(65535, Number((this.#packedValue >> 32n) & 0xffffn)), unpackSNorm(65535, Number((this.#packedValue >> 48n) & 0xffffn)),
    );
  }
  public ToString(): string { return packedHex(this.#packedValue, 16); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: NormalizedShort4): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof NormalizedShort4 && this.#packedValue === obj.#packedValue; }
  private static pack(x: number, y: number, z: number, w: number): bigint {
    return BigInt(packSNorm(65535, x)) | (BigInt(packSNorm(65535, y)) << 16n) | (BigInt(packSNorm(65535, z)) << 32n) | (BigInt(packSNorm(65535, w)) << 48n);
  }
}

export class Rg32 implements IPackedVectorOfT<number>, IEquatable<Rg32> {
  #packedValue: number;
  public constructor(vector: Vector2);
  public constructor(x: number, y: number);
  public constructor(vectorOrX: Vector2 | number, y?: number) {
    const x = vectorOrX instanceof Vector2 ? vectorOrX.X : vectorOrX;
    this.#packedValue = Rg32.pack(x, vectorOrX instanceof Vector2 ? vectorOrX.Y : y ?? 0);
  }
  public get PackedValue(): number { return this.#packedValue >>> 0; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) >>> 0; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = Rg32.pack(vector.X, vector.Y); }
  public ToVector2(): Vector2 { return new Vector2(unpackUNorm(65535, this.#packedValue), unpackUNorm(65535, this.#packedValue >>> 16)); }
  public ToVector4(): Vector4 { const value = this.ToVector2(); return new Vector4(value, 0, 1); }
  public ToString(): string { return packedHex(this.#packedValue, 8); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: Rg32): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof Rg32 && this.PackedValue === obj.PackedValue; }
  private static pack(x: number, y: number): number { return (packUNorm(65535, x) | (packUNorm(65535, y) << 16)) >>> 0; }
}

export class Rgba1010102 implements IPackedVectorOfT<number>, IEquatable<Rgba1010102> {
  #packedValue: number;
  public constructor(vector: Vector4);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(vectorOrX: Vector4 | number, y?: number, z?: number, w?: number) {
    const values = vectorOrX instanceof Vector4 ? [vectorOrX.X, vectorOrX.Y, vectorOrX.Z, vectorOrX.W] : [vectorOrX, y ?? 0, z ?? 0, w ?? 0];
    this.#packedValue = Rgba1010102.pack(...(values as [number, number, number, number]));
  }
  public get PackedValue(): number { return this.#packedValue >>> 0; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) >>> 0; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = Rgba1010102.pack(vector.X, vector.Y, vector.Z, vector.W); }
  public ToVector4(): Vector4 {
    return new Vector4(unpackUNorm(1023, this.#packedValue), unpackUNorm(1023, this.#packedValue >>> 10), unpackUNorm(1023, this.#packedValue >>> 20), unpackUNorm(3, this.#packedValue >>> 30));
  }
  public ToString(): string { return packedHex(this.#packedValue, 8); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: Rgba1010102): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof Rgba1010102 && this.PackedValue === obj.PackedValue; }
  private static pack(x: number, y: number, z: number, w: number): number {
    return (packUNorm(1023, x) | (packUNorm(1023, y) << 10) | (packUNorm(1023, z) << 20) | (packUNorm(3, w) << 30)) >>> 0;
  }
}

export class Rgba64 implements IPackedVectorOfT<bigint>, IEquatable<Rgba64> {
  #packedValue: bigint;
  public constructor(vector: Vector4);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(vectorOrX: Vector4 | number, y?: number, z?: number, w?: number) {
    const values = vectorOrX instanceof Vector4 ? [vectorOrX.X, vectorOrX.Y, vectorOrX.Z, vectorOrX.W] : [vectorOrX, y ?? 0, z ?? 0, w ?? 0];
    this.#packedValue = Rgba64.pack(...(values as [number, number, number, number]));
  }
  public get PackedValue(): bigint { return this.#packedValue; }
  public set PackedValue(value: bigint) { this.#packedValue = BigInt.asUintN(64, value); }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = Rgba64.pack(vector.X, vector.Y, vector.Z, vector.W); }
  public ToVector4(): Vector4 {
    return new Vector4(
      unpackUNorm(65535, Number(this.#packedValue & 0xffffn)), unpackUNorm(65535, Number((this.#packedValue >> 16n) & 0xffffn)),
      unpackUNorm(65535, Number((this.#packedValue >> 32n) & 0xffffn)), unpackUNorm(65535, Number((this.#packedValue >> 48n) & 0xffffn)),
    );
  }
  public ToString(): string { return packedHex(this.#packedValue, 16); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: Rgba64): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof Rgba64 && this.#packedValue === obj.#packedValue; }
  private static pack(x: number, y: number, z: number, w: number): bigint {
    return BigInt(packUNorm(65535, x)) | (BigInt(packUNorm(65535, y)) << 16n) | (BigInt(packUNorm(65535, z)) << 32n) | (BigInt(packUNorm(65535, w)) << 48n);
  }
}

export class Short2 implements IPackedVectorOfT<number>, IEquatable<Short2> {
  #packedValue: number;
  public constructor(vector: Vector2);
  public constructor(x: number, y: number);
  public constructor(vectorOrX: Vector2 | number, y?: number) {
    const x = vectorOrX instanceof Vector2 ? vectorOrX.X : vectorOrX;
    this.#packedValue = Short2.pack(x, vectorOrX instanceof Vector2 ? vectorOrX.Y : y ?? 0);
  }
  public get PackedValue(): number { return this.#packedValue >>> 0; }
  public set PackedValue(value: number) { this.#packedValue = Math.trunc(value) >>> 0; }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = Short2.pack(vector.X, vector.Y); }
  public ToVector2(): Vector2 { return new Vector2(signed16(this.#packedValue), signed16(this.#packedValue >>> 16)); }
  public ToVector4(): Vector4 { const value = this.ToVector2(); return new Vector4(value, 0, 1); }
  public ToString(): string { return packedHex(this.#packedValue, 8); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: Short2): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof Short2 && this.PackedValue === obj.PackedValue; }
  private static pack(x: number, y: number): number { return (packSigned(65535, x) | (packSigned(65535, y) << 16)) >>> 0; }
}

export class Short4 implements IPackedVectorOfT<bigint>, IEquatable<Short4> {
  #packedValue: bigint;
  public constructor(vector: Vector4);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(vectorOrX: Vector4 | number, y?: number, z?: number, w?: number) {
    const values = vectorOrX instanceof Vector4 ? [vectorOrX.X, vectorOrX.Y, vectorOrX.Z, vectorOrX.W] : [vectorOrX, y ?? 0, z ?? 0, w ?? 0];
    this.#packedValue = Short4.pack(...(values as [number, number, number, number]));
  }
  public get PackedValue(): bigint { return this.#packedValue; }
  public set PackedValue(value: bigint) { this.#packedValue = BigInt.asUintN(64, value); }
  public PackFromVector4(vector: Vector4): void { this.#packedValue = Short4.pack(vector.X, vector.Y, vector.Z, vector.W); }
  public ToVector4(): Vector4 {
    return new Vector4(
      signed16(Number(this.#packedValue & 0xffffn)), signed16(Number((this.#packedValue >> 16n) & 0xffffn)),
      signed16(Number((this.#packedValue >> 32n) & 0xffffn)), signed16(Number((this.#packedValue >> 48n) & 0xffffn)),
    );
  }
  public ToString(): string { return packedHex(this.#packedValue, 16); }
  public GetHashCode(): number { return packedHash(this.#packedValue); }
  public Equals(other: Short4): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean { return obj instanceof Short4 && this.#packedValue === obj.#packedValue; }
  private static pack(x: number, y: number, z: number, w: number): bigint {
    return BigInt(packSigned(65535, x)) | (BigInt(packSigned(65535, y)) << 16n) | (BigInt(packSigned(65535, z)) << 32n) | (BigInt(packSigned(65535, w)) << 48n);
  }
}
