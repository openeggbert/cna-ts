function channel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(255, Math.max(0, Math.trunc(value)));
}

/** Mutable Microsoft.Xna.Framework.Color projection using XNA's AABBGGRR packing. */
export class Color implements IEquatable<Color> {
  #packedValue = 0;

  public constructor(r: number, g: number, b: number);
  public constructor(r: number, g: number, b: number, alpha: number);
  public constructor(r: number, g: number, b: number, alpha = 255) {
    this.R = r;
    this.G = g;
    this.B = b;
    this.A = alpha;
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
}
import type { IEquatable } from "./Contracts.js";
