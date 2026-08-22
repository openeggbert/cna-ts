const f32 = Math.fround;

/** Microsoft.Xna.Framework.MathHelper single-precision helpers. */
export class MathHelper {
  public static readonly E = f32(Math.E);
  public static readonly Log10E = f32(Math.LOG10E);
  public static readonly Log2E = f32(Math.LOG2E);
  public static readonly Pi = f32(Math.PI);
  public static readonly PiOver2 = f32(Math.PI / 2);
  public static readonly PiOver4 = f32(Math.PI / 4);
  public static readonly TwoPi = f32(Math.PI * 2);

  private constructor() {}

  public static Barycentric(value1: number, value2: number, value3: number, amount1: number, amount2: number): number {
    return f32(value1 + f32(amount1 * f32(value2 - value1)) + f32(amount2 * f32(value3 - value1)));
  }

  public static CatmullRom(value1: number, value2: number, value3: number, value4: number, amount: number): number {
    amount = f32(amount);
    const amountSquared = f32(amount * amount);
    const amountCubed = f32(amount * amountSquared);
    const first = f32(2 * value2);
    const second = f32(f32(-value1 + value3) * amount);
    const thirdCoefficient = f32(f32(f32(f32(2 * value1) - f32(5 * value2)) + f32(4 * value3)) - value4);
    const fourthCoefficient = f32(f32(f32(f32(-value1 + f32(3 * value2)) - f32(3 * value3)) + value4));
    const sum = f32(f32(f32(first + second) + f32(thirdCoefficient * amountSquared)) + f32(fourthCoefficient * amountCubed));
    return f32(0.5 * sum);
  }

  public static Clamp(value: number, min: number, max: number): number {
    if (value > max) value = max;
    if (value < min) value = min;
    return value;
  }

  public static Distance(value1: number, value2: number): number {
    return Math.abs(value1 - value2);
  }

  public static Hermite(value1: number, tangent1: number, value2: number, tangent2: number, amount: number): number {
    amount = f32(amount);
    const squared = f32(amount * amount);
    const cubed = f32(amount * squared);
    const value1Basis = f32(f32(f32(2 * cubed) - f32(3 * squared)) + 1);
    const value2Basis = f32(f32(-2 * cubed) + f32(3 * squared));
    const tangent1Basis = f32(f32(cubed - f32(2 * squared)) + amount);
    const tangent2Basis = f32(cubed - squared);
    let result = f32(value1 * value1Basis);
    result = f32(result + f32(value2 * value2Basis));
    result = f32(result + f32(tangent1 * tangent1Basis));
    return f32(result + f32(tangent2 * tangent2Basis));
  }

  public static Lerp(value1: number, value2: number, amount: number): number {
    return f32(value1 + f32(f32(value2 - value1) * amount));
  }

  public static Max(value1: number, value2: number): number {
    return value1 > value2 ? value1 : value2;
  }

  public static Min(value1: number, value2: number): number {
    return value1 < value2 ? value1 : value2;
  }

  public static SmoothStep(value1: number, value2: number, amount: number): number {
    amount = MathHelper.Clamp(amount, 0, 1);
    return MathHelper.Hermite(value1, 0, value2, 0, amount);
  }

  public static ToDegrees(radians: number): number {
    return f32(radians * 57.29577951308232);
  }

  public static ToRadians(degrees: number): number {
    return f32(degrees * 0.017453292519943295);
  }

  public static WrapAngle(angle: number): number {
    angle = f32(angle);
    const quotient = angle / MathHelper.TwoPi;
    const lower = Math.floor(quotient);
    const fraction = quotient - lower;
    const nearest = fraction < 0.5 ? lower : fraction > 0.5 ? lower + 1 : lower % 2 === 0 ? lower : lower + 1;
    angle = f32(angle - nearest * MathHelper.TwoPi);
    if (angle <= -MathHelper.Pi) return f32(angle + MathHelper.TwoPi);
    if (angle > MathHelper.Pi) return f32(angle - MathHelper.TwoPi);
    return angle;
  }
}
