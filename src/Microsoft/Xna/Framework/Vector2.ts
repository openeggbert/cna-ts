import type { IEquatable } from "./Contracts.js";
import { MathHelper } from "./MathHelper.js";
import { Matrix } from "./Matrix.js";
import { Quaternion } from "./Quaternion.js";

const f32 = Math.fround;

/** Mutable projection of the Microsoft.Xna.Framework.Vector2 CLR struct. */
export class Vector2 implements IEquatable<Vector2> {
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

  public Equals(other: Vector2): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof Vector2 && this.X === obj.X && this.Y === obj.Y;
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

  public static Normalize(value: Vector2): Vector2 {
    const result = new Vector2(value.X, value.Y);
    result.Normalize();
    return result;
  }

  public static Min(value1: Vector2, value2: Vector2): Vector2 {
    return new Vector2(Math.min(value1.X, value2.X), Math.min(value1.Y, value2.Y));
  }

  public static Max(value1: Vector2, value2: Vector2): Vector2 {
    return new Vector2(Math.max(value1.X, value2.X), Math.max(value1.Y, value2.Y));
  }

  public static Clamp(value1: Vector2, min: Vector2, max: Vector2): Vector2 {
    return new Vector2(
      MathHelper.Clamp(value1.X, min.X, max.X),
      MathHelper.Clamp(value1.Y, min.Y, max.Y),
    );
  }

  public static Reflect(vector: Vector2, normal: Vector2): Vector2 {
    const factor = f32(2 * Vector2.Dot(vector, normal));
    return Vector2.Subtract(vector, Vector2.Multiply(normal, factor));
  }

  public static SmoothStep(value1: Vector2, value2: Vector2, amount: number): Vector2 {
    return new Vector2(
      MathHelper.SmoothStep(value1.X, value2.X, amount),
      MathHelper.SmoothStep(value1.Y, value2.Y, amount),
    );
  }

  public static Barycentric(value1: Vector2, value2: Vector2, value3: Vector2, amount1: number, amount2: number): Vector2 {
    return new Vector2(
      MathHelper.Barycentric(value1.X, value2.X, value3.X, amount1, amount2),
      MathHelper.Barycentric(value1.Y, value2.Y, value3.Y, amount1, amount2),
    );
  }

  public static CatmullRom(value1: Vector2, value2: Vector2, value3: Vector2, value4: Vector2, amount: number): Vector2 {
    return new Vector2(
      MathHelper.CatmullRom(value1.X, value2.X, value3.X, value4.X, amount),
      MathHelper.CatmullRom(value1.Y, value2.Y, value3.Y, value4.Y, amount),
    );
  }

  public static Hermite(value1: Vector2, tangent1: Vector2, value2: Vector2, tangent2: Vector2, amount: number): Vector2 {
    return new Vector2(
      MathHelper.Hermite(value1.X, tangent1.X, value2.X, tangent2.X, amount),
      MathHelper.Hermite(value1.Y, tangent1.Y, value2.Y, tangent2.Y, amount),
    );
  }

  public static Transform(position: Vector2, matrix: Matrix): Vector2;
  public static Transform(value: Vector2, rotation: Quaternion): Vector2;
  public static Transform(value: Vector2, transform: Matrix | Quaternion): Vector2 {
    if (transform instanceof Matrix) {
      return new Vector2(
        f32(f32(value.X * transform.M11) + f32(value.Y * transform.M21) + transform.M41),
        f32(f32(value.X * transform.M12) + f32(value.Y * transform.M22) + transform.M42),
      );
    }
    const matrix = Matrix.CreateFromQuaternion(transform);
    return Vector2.Transform(value, matrix);
  }

  public static TransformNormal(normal: Vector2, matrix: Matrix): Vector2 {
    return new Vector2(
      f32(f32(normal.X * matrix.M11) + f32(normal.Y * matrix.M21)),
      f32(f32(normal.X * matrix.M12) + f32(normal.Y * matrix.M22)),
    );
  }
}
