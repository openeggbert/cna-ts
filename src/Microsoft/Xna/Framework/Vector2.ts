const f32 = Math.fround;

/** Mutable projection of the Microsoft.Xna.Framework.Vector2 CLR struct. */
export class Vector2 {
  public X: number;
  public Y: number;

  public constructor(value: number);
  public constructor(x: number, y: number);
  public constructor(x: number, y = x) {
    this.X = f32(x);
    this.Y = f32(y);
  }

  public static get Zero(): Vector2 {
    return new Vector2(0, 0);
  }

  public static get One(): Vector2 {
    return new Vector2(1, 1);
  }

  public static get UnitX(): Vector2 {
    return new Vector2(1, 0);
  }

  public static get UnitY(): Vector2 {
    return new Vector2(0, 1);
  }

  public Length(): number {
    return f32(Math.sqrt(f32(f32(this.X * this.X) + f32(this.Y * this.Y))));
  }

  public LengthSquared(): number {
    return f32(f32(this.X * this.X) + f32(this.Y * this.Y));
  }

  public Normalize(): void {
    const inverse = f32(1 / Math.sqrt(f32(f32(this.X * this.X) + f32(this.Y * this.Y))));
    this.X = f32(this.X * inverse);
    this.Y = f32(this.Y * inverse);
  }

  public Equals(other: Vector2): boolean {
    return this.X === other.X && this.Y === other.Y;
  }

  public static Add(value1: Vector2, value2: Vector2): Vector2 {
    return new Vector2(f32(value1.X + value2.X), f32(value1.Y + value2.Y));
  }

  public static Subtract(value1: Vector2, value2: Vector2): Vector2 {
    return new Vector2(f32(value1.X - value2.X), f32(value1.Y - value2.Y));
  }

  public static Multiply(value1: Vector2, value2: Vector2): Vector2;
  public static Multiply(value1: Vector2, scaleFactor: number): Vector2;
  public static Multiply(value1: Vector2, value2: Vector2 | number): Vector2 {
    return typeof value2 === "number"
      ? new Vector2(f32(value1.X * value2), f32(value1.Y * value2))
      : new Vector2(f32(value1.X * value2.X), f32(value1.Y * value2.Y));
  }

  public static Divide(value1: Vector2, value2: Vector2): Vector2;
  public static Divide(value1: Vector2, divider: number): Vector2;
  public static Divide(value1: Vector2, value2: Vector2 | number): Vector2 {
    return typeof value2 === "number"
      ? Vector2.Multiply(value1, f32(1 / value2))
      : new Vector2(f32(value1.X / value2.X), f32(value1.Y / value2.Y));
  }

  public static Negate(value: Vector2): Vector2 {
    return new Vector2(f32(-value.X), f32(-value.Y));
  }

  public static Dot(value1: Vector2, value2: Vector2): number {
    return f32(f32(value1.X * value2.X) + f32(value1.Y * value2.Y));
  }

  public static Distance(value1: Vector2, value2: Vector2): number {
    return Vector2.Subtract(value1, value2).Length();
  }

  public static DistanceSquared(value1: Vector2, value2: Vector2): number {
    return Vector2.Subtract(value1, value2).LengthSquared();
  }

  public static Lerp(value1: Vector2, value2: Vector2, amount: number): Vector2 {
    return new Vector2(
      f32(value1.X + f32(f32(value2.X - value1.X) * amount)),
      f32(value1.Y + f32(f32(value2.Y - value1.Y) * amount)),
    );
  }
}
