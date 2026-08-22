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
    const amountSquared = f32(amount * amount);
    const amountCubed = f32(amountSquared * amount);
    return f32(
      0.5 *
        f32(
          f32(2 * value2) +
            f32(f32(value3 - value1) * amount) +
            f32(f32(f32(2 * value1) - f32(5 * value2) + f32(4 * value3) - value4) * amountSquared) +
            f32(f32(f32(3 * value2) - value1 - f32(3 * value3) + value4) * amountCubed),
        ),
    );
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
    if (amount === 0) return value1;
    if (amount === 1) return value2;
    const squared = f32(amount * amount);
    const cubed = f32(squared * amount);
    return f32(
      f32(f32(f32(2 * cubed) - f32(3 * squared) + 1) * value1) +
        f32(f32(f32(cubed - f32(2 * squared)) + amount) * tangent1) +
        f32(f32(f32(-2 * cubed) + f32(3 * squared)) * value2) +
        f32(f32(cubed - squared) * tangent2),
    );
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
    if (angle > -MathHelper.Pi && angle <= MathHelper.Pi) return angle;
    angle = f32(angle % MathHelper.TwoPi);
    if (angle <= -MathHelper.Pi) return f32(angle + MathHelper.TwoPi);
    if (angle > MathHelper.Pi) return f32(angle - MathHelper.TwoPi);
    return angle;
  }
}
