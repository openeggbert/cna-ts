import type { IEquatable } from "./Contracts.js";
import type { IPackedVectorOfT } from "./Graphics/PackedVector/IPackedVectorOfT.js";
import { Vector3 } from "./Vector3.js";
import { Vector4 } from "./Vector4.js";

function channel(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.min(255, Math.max(0, Math.trunc(value)));
}

function roundToEven(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

function normalizedChannel(value: number): number {
  const scaled = Math.fround(Math.fround(value) * 255);
  if (Number.isNaN(scaled) || scaled <= 0) return 0;
  if (scaled >= 255) return 255;
  return roundToEven(scaled);
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
      this.R = normalizedChannel(rOrColor.X);
      this.G = normalizedChannel(rOrColor.Y);
      this.B = normalizedChannel(rOrColor.Z);
      this.A = normalizedChannel(rOrColor.W);
    } else if (rOrColor instanceof Vector3) {
      this.R = normalizedChannel(rOrColor.X);
      this.G = normalizedChannel(rOrColor.Y);
      this.B = normalizedChannel(rOrColor.Z);
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
    return new Color(255, 255, 255, 0);
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
    const scaled = Math.fround(Math.fround(amount) * 65_536);
    const fraction = Number.isNaN(scaled) || scaled <= 0
      ? 0
      : scaled >= 65_536 ? 65_536 : Math.trunc(scaled);
    return new Color(
      value1.R + (((value2.R - value1.R) * fraction) >> 16),
      value1.G + (((value2.G - value1.G) * fraction) >> 16),
      value1.B + (((value2.B - value1.B) * fraction) >> 16),
      value1.A + (((value2.A - value1.A) * fraction) >> 16),
    );
  }

  public ToVector3(): Vector3 {
    return new Vector3(this.R / 255, this.G / 255, this.B / 255);
  }

  public ToVector4(): Vector4 {
    return new Vector4(this.R / 255, this.G / 255, this.B / 255, this.A / 255);
  }

  public PackFromVector4(vector: Vector4): void {
    this.R = normalizedChannel(vector.X);
    this.G = normalizedChannel(vector.Y);
    this.B = normalizedChannel(vector.Z);
    this.A = normalizedChannel(vector.W);
  }

  public static Multiply(value: Color, scale: number): Color {
    const scaled = Math.fround(Math.fround(scale) * 65_536);
    const fixedScale = Number.isNaN(scaled) || scaled <= 0
      ? 0
      : scaled >= 16_777_215 ? 16_777_215 : Math.trunc(scaled);
    return new Color(
      Math.min(255, Math.trunc((value.R * fixedScale) / 65_536)),
      Math.min(255, Math.trunc((value.G * fixedScale) / 65_536)),
      Math.min(255, Math.trunc((value.B * fixedScale) / 65_536)),
      Math.min(255, Math.trunc((value.A * fixedScale) / 65_536)),
    );
  }

  public static FromNonPremultiplied(vector: Vector4): Color;
  public static FromNonPremultiplied(r: number, g: number, b: number, a: number): Color;
  public static FromNonPremultiplied(vectorOrX: Vector4 | number, y?: number, z?: number, alpha?: number): Color {
    if (vectorOrX instanceof Vector4) {
      return new Color(new Vector4(
        Math.fround(vectorOrX.X * vectorOrX.W),
        Math.fround(vectorOrX.Y * vectorOrX.W),
        Math.fround(vectorOrX.Z * vectorOrX.W),
        vectorOrX.W,
      ));
    }
    const value = new Color(vectorOrX, y ?? 0, z ?? 0, alpha ?? 0);
    return new Color(
      Math.trunc((value.R * value.A) / 255),
      Math.trunc((value.G * value.A) / 255),
      Math.trunc((value.B * value.A) / 255),
      value.A,
    );
  }
}
