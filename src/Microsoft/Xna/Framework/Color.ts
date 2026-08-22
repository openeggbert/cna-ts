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

  private static FromPacked(value: number): Color {
    const result = new Color(0, 0, 0, 0);
    result.PackedValue = value;
    return result;
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

  public static get AliceBlue(): Color { return Color.FromPacked(4294965488); }

  public static get AntiqueWhite(): Color { return Color.FromPacked(4292340730); }

  public static get Aqua(): Color { return Color.FromPacked(4294967040); }

  public static get Aquamarine(): Color { return Color.FromPacked(4292149119); }

  public static get Azure(): Color { return Color.FromPacked(4294967280); }

  public static get Beige(): Color { return Color.FromPacked(4292670965); }

  public static get Bisque(): Color { return Color.FromPacked(4291093759); }

  public static get BlanchedAlmond(): Color { return Color.FromPacked(4291685375); }

  public static get Blue(): Color { return Color.FromPacked(4294901760); }

  public static get BlueViolet(): Color { return Color.FromPacked(4293012362); }

  public static get Brown(): Color { return Color.FromPacked(4280953509); }

  public static get BurlyWood(): Color { return Color.FromPacked(4287084766); }

  public static get CadetBlue(): Color { return Color.FromPacked(4288716383); }

  public static get Chartreuse(): Color { return Color.FromPacked(4278255487); }

  public static get Chocolate(): Color { return Color.FromPacked(4280183250); }

  public static get Coral(): Color { return Color.FromPacked(4283465727); }

  public static get Cornsilk(): Color { return Color.FromPacked(4292671743); }

  public static get Crimson(): Color { return Color.FromPacked(4282127580); }

  public static get Cyan(): Color { return Color.FromPacked(4294967040); }

  public static get DarkBlue(): Color { return Color.FromPacked(4287299584); }

  public static get DarkCyan(): Color { return Color.FromPacked(4287335168); }

  public static get DarkGoldenrod(): Color { return Color.FromPacked(4278945464); }

  public static get DarkGray(): Color { return Color.FromPacked(4289309097); }

  public static get DarkGreen(): Color { return Color.FromPacked(4278215680); }

  public static get DarkKhaki(): Color { return Color.FromPacked(4285249469); }

  public static get DarkMagenta(): Color { return Color.FromPacked(4287299723); }

  public static get DarkOliveGreen(): Color { return Color.FromPacked(4281297749); }

  public static get DarkOrange(): Color { return Color.FromPacked(4278226175); }

  public static get DarkOrchid(): Color { return Color.FromPacked(4291572377); }

  public static get DarkRed(): Color { return Color.FromPacked(4278190219); }

  public static get DarkSalmon(): Color { return Color.FromPacked(4286224105); }

  public static get DarkSeaGreen(): Color { return Color.FromPacked(4287347855); }

  public static get DarkSlateBlue(): Color { return Color.FromPacked(4287315272); }

  public static get DarkSlateGray(): Color { return Color.FromPacked(4283387695); }

  public static get DarkTurquoise(): Color { return Color.FromPacked(4291939840); }

  public static get DarkViolet(): Color { return Color.FromPacked(4292018324); }

  public static get DeepPink(): Color { return Color.FromPacked(4287829247); }

  public static get DeepSkyBlue(): Color { return Color.FromPacked(4294950656); }

  public static get DimGray(): Color { return Color.FromPacked(4285098345); }

  public static get DodgerBlue(): Color { return Color.FromPacked(4294938654); }

  public static get Firebrick(): Color { return Color.FromPacked(4280427186); }

  public static get FloralWhite(): Color { return Color.FromPacked(4293982975); }

  public static get ForestGreen(): Color { return Color.FromPacked(4280453922); }

  public static get Fuchsia(): Color { return Color.FromPacked(4294902015); }

  public static get Gainsboro(): Color { return Color.FromPacked(4292664540); }

  public static get GhostWhite(): Color { return Color.FromPacked(4294965496); }

  public static get Gold(): Color { return Color.FromPacked(4278245375); }

  public static get Goldenrod(): Color { return Color.FromPacked(4280329690); }

  public static get Gray(): Color { return Color.FromPacked(4286611584); }

  public static get Green(): Color { return Color.FromPacked(4278222848); }

  public static get GreenYellow(): Color { return Color.FromPacked(4281335725); }

  public static get Honeydew(): Color { return Color.FromPacked(4293984240); }

  public static get HotPink(): Color { return Color.FromPacked(4290013695); }

  public static get IndianRed(): Color { return Color.FromPacked(4284243149); }

  public static get Indigo(): Color { return Color.FromPacked(4286709835); }

  public static get Ivory(): Color { return Color.FromPacked(4293984255); }

  public static get Khaki(): Color { return Color.FromPacked(4287424240); }

  public static get Lavender(): Color { return Color.FromPacked(4294633190); }

  public static get LavenderBlush(): Color { return Color.FromPacked(4294308095); }

  public static get LawnGreen(): Color { return Color.FromPacked(4278254716); }

  public static get LemonChiffon(): Color { return Color.FromPacked(4291689215); }

  public static get LightBlue(): Color { return Color.FromPacked(4293318829); }

  public static get LightCoral(): Color { return Color.FromPacked(4286611696); }

  public static get LightCyan(): Color { return Color.FromPacked(4294967264); }

  public static get LightGoldenrodYellow(): Color { return Color.FromPacked(4292016890); }

  public static get LightGreen(): Color { return Color.FromPacked(4287688336); }

  public static get LightGray(): Color { return Color.FromPacked(4292072403); }

  public static get LightPink(): Color { return Color.FromPacked(4290885375); }

  public static get LightSalmon(): Color { return Color.FromPacked(4286226687); }

  public static get LightSeaGreen(): Color { return Color.FromPacked(4289376800); }

  public static get LightSkyBlue(): Color { return Color.FromPacked(4294626951); }

  public static get LightSlateGray(): Color { return Color.FromPacked(4288252023); }

  public static get LightSteelBlue(): Color { return Color.FromPacked(4292789424); }

  public static get LightYellow(): Color { return Color.FromPacked(4292935679); }

  public static get Lime(): Color { return Color.FromPacked(4278255360); }

  public static get LimeGreen(): Color { return Color.FromPacked(4281519410); }

  public static get Linen(): Color { return Color.FromPacked(4293325050); }

  public static get Magenta(): Color { return Color.FromPacked(4294902015); }

  public static get Maroon(): Color { return Color.FromPacked(4278190208); }

  public static get MediumAquamarine(): Color { return Color.FromPacked(4289383782); }

  public static get MediumBlue(): Color { return Color.FromPacked(4291624960); }

  public static get MediumOrchid(): Color { return Color.FromPacked(4292040122); }

  public static get MediumPurple(): Color { return Color.FromPacked(4292571283); }

  public static get MediumSeaGreen(): Color { return Color.FromPacked(4285641532); }

  public static get MediumSlateBlue(): Color { return Color.FromPacked(4293814395); }

  public static get MediumSpringGreen(): Color { return Color.FromPacked(4288346624); }

  public static get MediumTurquoise(): Color { return Color.FromPacked(4291613000); }

  public static get MediumVioletRed(): Color { return Color.FromPacked(4286911943); }

  public static get MidnightBlue(): Color { return Color.FromPacked(4285536537); }

  public static get MintCream(): Color { return Color.FromPacked(4294639605); }

  public static get MistyRose(): Color { return Color.FromPacked(4292994303); }

  public static get Moccasin(): Color { return Color.FromPacked(4290110719); }

  public static get NavajoWhite(): Color { return Color.FromPacked(4289584895); }

  public static get Navy(): Color { return Color.FromPacked(4286578688); }

  public static get OldLace(): Color { return Color.FromPacked(4293326333); }

  public static get Olive(): Color { return Color.FromPacked(4278222976); }

  public static get OliveDrab(): Color { return Color.FromPacked(4280520299); }

  public static get Orange(): Color { return Color.FromPacked(4278232575); }

  public static get OrangeRed(): Color { return Color.FromPacked(4278207999); }

  public static get Orchid(): Color { return Color.FromPacked(4292243674); }

  public static get PaleGoldenrod(): Color { return Color.FromPacked(4289390830); }

  public static get PaleGreen(): Color { return Color.FromPacked(4288215960); }

  public static get PaleTurquoise(): Color { return Color.FromPacked(4293848751); }

  public static get PaleVioletRed(): Color { return Color.FromPacked(4287852763); }

  public static get PapayaWhip(): Color { return Color.FromPacked(4292210687); }

  public static get PeachPuff(): Color { return Color.FromPacked(4290370303); }

  public static get Peru(): Color { return Color.FromPacked(4282353101); }

  public static get Pink(): Color { return Color.FromPacked(4291543295); }

  public static get Plum(): Color { return Color.FromPacked(4292714717); }

  public static get PowderBlue(): Color { return Color.FromPacked(4293320880); }

  public static get Purple(): Color { return Color.FromPacked(4286578816); }

  public static get Red(): Color { return Color.FromPacked(4278190335); }

  public static get RosyBrown(): Color { return Color.FromPacked(4287598524); }

  public static get RoyalBlue(): Color { return Color.FromPacked(4292962625); }

  public static get SaddleBrown(): Color { return Color.FromPacked(4279453067); }

  public static get Salmon(): Color { return Color.FromPacked(4285694202); }

  public static get SandyBrown(): Color { return Color.FromPacked(4284523764); }

  public static get SeaGreen(): Color { return Color.FromPacked(4283927342); }

  public static get SeaShell(): Color { return Color.FromPacked(4293850623); }

  public static get Sienna(): Color { return Color.FromPacked(4281160352); }

  public static get Silver(): Color { return Color.FromPacked(4290822336); }

  public static get SkyBlue(): Color { return Color.FromPacked(4293643911); }

  public static get SlateBlue(): Color { return Color.FromPacked(4291648106); }

  public static get SlateGray(): Color { return Color.FromPacked(4287660144); }

  public static get Snow(): Color { return Color.FromPacked(4294638335); }

  public static get SpringGreen(): Color { return Color.FromPacked(4286578432); }

  public static get SteelBlue(): Color { return Color.FromPacked(4290019910); }

  public static get Tan(): Color { return Color.FromPacked(4287411410); }

  public static get Teal(): Color { return Color.FromPacked(4286611456); }

  public static get Thistle(): Color { return Color.FromPacked(4292394968); }

  public static get Tomato(): Color { return Color.FromPacked(4282868735); }

  public static get Turquoise(): Color { return Color.FromPacked(4291878976); }

  public static get Violet(): Color { return Color.FromPacked(4293821166); }

  public static get Wheat(): Color { return Color.FromPacked(4289978101); }

  public static get WhiteSmoke(): Color { return Color.FromPacked(4294309365); }

  public static get Yellow(): Color { return Color.FromPacked(4278255615); }

  public static get YellowGreen(): Color { return Color.FromPacked(4281519514); }

  public Equals(other: Color): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof Color && this.PackedValue === obj.PackedValue;
  }

  public GetHashCode(): number { return this.PackedValue | 0; }

  public ToString(): string {
    return `{R:${this.R} G:${this.G} B:${this.B} A:${this.A}}`;
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
