import type { IEquatable } from "./Contracts.js";
import type { IPackedVectorOfT } from "./Graphics/PackedVector/IPackedVectorOfT.js";
import { Vector3 } from "./Vector3.js";
import { Vector4 } from "./Vector4.js";

function channel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(255, Math.max(0, Math.trunc(value)));
}

/** Mutable Microsoft.Xna.Framework.Color projection using XNA's AABBGGRR packing. */
export class Color implements IEquatable<Color>, IPackedVectorOfT<number> {
  #packedValue = 0;

  public constructor(vector: Vector3);
  public constructor(vector: Vector4);
  public constructor(r: number, g: number, b: number);
  public constructor(r: number, g: number, b: number, a: number);
  public constructor(rOrColor: number | Vector3 | Vector4, g?: number, b?: number, alpha = 255) {
    if (rOrColor instanceof Vector4) {
      this.R = rOrColor.X * 255;
      this.G = rOrColor.Y * 255;
      this.B = rOrColor.Z * 255;
      this.A = rOrColor.W * 255;
    } else if (rOrColor instanceof Vector3) {
      this.R = rOrColor.X * 255;
      this.G = rOrColor.Y * 255;
      this.B = rOrColor.Z * 255;
      this.A = 255;
    } else {
      this.R = rOrColor;
      this.G = g ?? 0;
      this.B = b ?? 0;
      this.A = alpha;
    }
  }

  public get R(): number {
    return this.#packedValue & 0xff;
  }

  public set R(value: number) {
    this.#packedValue = (this.#packedValue & 0xffffff00) | channel(value);
  }

  public get G(): number {
    return (this.#packedValue >>> 8) & 0xff;
  }

  public set G(value: number) {
    this.#packedValue = (this.#packedValue & 0xffff00ff) | (channel(value) << 8);
  }

  public get B(): number {
    return (this.#packedValue >>> 16) & 0xff;
  }

  public set B(value: number) {
    this.#packedValue = (this.#packedValue & 0xff00ffff) | (channel(value) << 16);
  }

  public get A(): number {
    return (this.#packedValue >>> 24) & 0xff;
  }

  public set A(value: number) {
    this.#packedValue =
      (this.#packedValue & 0x00ffffff) | ((channel(value) << 24) >>> 0);
  }

  public get PackedValue(): number {
    return this.#packedValue >>> 0;
  }

  public set PackedValue(value: number) {
    this.#packedValue = Math.trunc(value) >>> 0;
  }

  public static get Transparent(): Color {
    return new Color(0, 0, 0, 0);
  }

  public static get Black(): Color {
    return new Color(0, 0, 0, 255);
  }

  public static get CornflowerBlue(): Color {
    return new Color(100, 149, 237, 255);
  }

  public static get White(): Color {
    return new Color(255, 255, 255, 255);
  }

  public Equals(other: Color): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof Color && this.PackedValue === obj.PackedValue;
  }

  public static Lerp(value1: Color, value2: Color, amount: number): Color {
    const t = Math.min(1, Math.max(0, amount));
    return new Color(
      value1.R + (value2.R - value1.R) * t,
      value1.G + (value2.G - value1.G) * t,
      value1.B + (value2.B - value1.B) * t,
      value1.A + (value2.A - value1.A) * t,
    );
  }

  public ToVector3(): Vector3 {
    return new Vector3(this.R / 255, this.G / 255, this.B / 255);
  }

  public ToVector4(): Vector4 {
    return new Vector4(this.R / 255, this.G / 255, this.B / 255, this.A / 255);
  }

  public PackFromVector4(vector: Vector4): void {
    this.R = vector.X * 255;
    this.G = vector.Y * 255;
    this.B = vector.Z * 255;
    this.A = vector.W * 255;
  }

  public static Multiply(value: Color, scale: number): Color {
    return new Color(value.R * scale, value.G * scale, value.B * scale, value.A * scale);
  }

  public static FromNonPremultiplied(vector: Vector4): Color;
  public static FromNonPremultiplied(r: number, g: number, b: number, a: number): Color;
  public static FromNonPremultiplied(vectorOrX: Vector4 | number, y?: number, z?: number, alpha?: number): Color {
    const value = vectorOrX instanceof Vector4
      ? new Color(vectorOrX)
      : new Color(vectorOrX, y ?? 0, z ?? 0, alpha ?? 0);
    return new Color(
      Math.trunc((value.R * value.A) / 255),
      Math.trunc((value.G * value.A) / 255),
      Math.trunc((value.B * value.A) / 255),
      value.A,
    );
  }
}
