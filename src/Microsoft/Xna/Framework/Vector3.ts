import type { IEquatable } from "./Contracts.js";
import { MathHelper } from "./MathHelper.js";
import { Matrix } from "./Matrix.js";
import { Quaternion } from "./Quaternion.js";
import { Vector2 } from "./Vector2.js";

const f32 = Math.fround;

/** Mutable Microsoft.Xna.Framework.Vector3 projection. */
export class Vector3 implements IEquatable<Vector3> {
  public X: number;
  public Y: number;
  public Z: number;

  public constructor(value: number);
  public constructor(value: Vector2, z: number);
  public constructor(x: number, y: number, z: number);
  public constructor(xOrValue: number | Vector2, yOrZ?: number, z?: number) {
    if (xOrValue instanceof Vector2) {
      this.X = f32(xOrValue.X);
      this.Y = f32(xOrValue.Y);
      this.Z = f32(yOrZ ?? 0);
    } else if (z === undefined) {
      this.X = this.Y = this.Z = f32(xOrValue);
    } else {
      this.X = f32(xOrValue);
      this.Y = f32(yOrZ ?? 0);
      this.Z = f32(z);
    }
  }

  public static get Zero(): Vector3 { return new Vector3(0); }
  public static get One(): Vector3 { return new Vector3(1); }
  public static get UnitX(): Vector3 { return new Vector3(1, 0, 0); }
  public static get UnitY(): Vector3 { return new Vector3(0, 1, 0); }
  public static get UnitZ(): Vector3 { return new Vector3(0, 0, 1); }
  public static get Up(): Vector3 { return new Vector3(0, 1, 0); }
  public static get Down(): Vector3 { return new Vector3(0, -1, 0); }
  public static get Right(): Vector3 { return new Vector3(1, 0, 0); }
  public static get Left(): Vector3 { return new Vector3(-1, 0, 0); }
  public static get Forward(): Vector3 { return new Vector3(0, 0, -1); }
  public static get Backward(): Vector3 { return new Vector3(0, 0, 1); }

  public Length(): number {
    return f32(Math.sqrt(this.LengthSquared()));
  }

  public LengthSquared(): number {
    return f32(f32(this.X * this.X) + f32(this.Y * this.Y) + f32(this.Z * this.Z));
  }

  public Normalize(): void {
    const inverse = f32(1 / Math.sqrt(this.LengthSquared()));
    this.X = f32(this.X * inverse);
    this.Y = f32(this.Y * inverse);
    this.Z = f32(this.Z * inverse);
  }

  public Equals(other: Vector3): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof Vector3 && this.X === obj.X && this.Y === obj.Y && this.Z === obj.Z;
  }

  public static Add(value1: Vector3, value2: Vector3): Vector3 {
    return new Vector3(f32(value1.X + value2.X), f32(value1.Y + value2.Y), f32(value1.Z + value2.Z));
  }

  public static Subtract(value1: Vector3, value2: Vector3): Vector3 {
    return new Vector3(f32(value1.X - value2.X), f32(value1.Y - value2.Y), f32(value1.Z - value2.Z));
  }

  public static Multiply(value1: Vector3, value2: Vector3): Vector3;
  public static Multiply(value1: Vector3, scaleFactor: number): Vector3;
  public static Multiply(value1: Vector3, value2: Vector3 | number): Vector3 {
    return typeof value2 === "number"
      ? new Vector3(f32(value1.X * value2), f32(value1.Y * value2), f32(value1.Z * value2))
      : new Vector3(f32(value1.X * value2.X), f32(value1.Y * value2.Y), f32(value1.Z * value2.Z));
  }

  public static Divide(value1: Vector3, value2: Vector3): Vector3;
  public static Divide(value1: Vector3, value2: number): Vector3;
  public static Divide(value1: Vector3, value2: Vector3 | number): Vector3 {
    return typeof value2 === "number"
      ? Vector3.Multiply(value1, f32(1 / value2))
      : new Vector3(f32(value1.X / value2.X), f32(value1.Y / value2.Y), f32(value1.Z / value2.Z));
  }

  public static Negate(value: Vector3): Vector3 {
    return new Vector3(f32(-value.X), f32(-value.Y), f32(-value.Z));
  }

  public static Dot(vector1: Vector3, vector2: Vector3): number {
    return f32(f32(vector1.X * vector2.X) + f32(vector1.Y * vector2.Y) + f32(vector1.Z * vector2.Z));
  }

  public static Cross(vector1: Vector3, vector2: Vector3): Vector3 {
    return new Vector3(
      f32(f32(vector1.Y * vector2.Z) - f32(vector1.Z * vector2.Y)),
      f32(f32(vector1.Z * vector2.X) - f32(vector1.X * vector2.Z)),
      f32(f32(vector1.X * vector2.Y) - f32(vector1.Y * vector2.X)),
    );
  }

  public static Distance(value1: Vector3, value2: Vector3): number {
    return Vector3.Subtract(value1, value2).Length();
  }

  public static DistanceSquared(value1: Vector3, value2: Vector3): number {
    return Vector3.Subtract(value1, value2).LengthSquared();
  }

  public static Normalize(value: Vector3): Vector3 {
    const result = new Vector3(value.X, value.Y, value.Z);
    result.Normalize();
    return result;
  }

  public static Min(value1: Vector3, value2: Vector3): Vector3 {
    return new Vector3(Math.min(value1.X, value2.X), Math.min(value1.Y, value2.Y), Math.min(value1.Z, value2.Z));
  }

  public static Max(value1: Vector3, value2: Vector3): Vector3 {
    return new Vector3(Math.max(value1.X, value2.X), Math.max(value1.Y, value2.Y), Math.max(value1.Z, value2.Z));
  }

  public static Clamp(value1: Vector3, min: Vector3, max: Vector3): Vector3 {
    return new Vector3(
      MathHelper.Clamp(value1.X, min.X, max.X),
      MathHelper.Clamp(value1.Y, min.Y, max.Y),
      MathHelper.Clamp(value1.Z, min.Z, max.Z),
    );
  }

  public static Lerp(value1: Vector3, value2: Vector3, amount: number): Vector3 {
    return new Vector3(
      MathHelper.Lerp(value1.X, value2.X, amount),
      MathHelper.Lerp(value1.Y, value2.Y, amount),
      MathHelper.Lerp(value1.Z, value2.Z, amount),
    );
  }

  public static SmoothStep(value1: Vector3, value2: Vector3, amount: number): Vector3 {
    return new Vector3(
      MathHelper.SmoothStep(value1.X, value2.X, amount),
      MathHelper.SmoothStep(value1.Y, value2.Y, amount),
      MathHelper.SmoothStep(value1.Z, value2.Z, amount),
    );
  }

  public static Reflect(vector: Vector3, normal: Vector3): Vector3 {
    const factor = f32(2 * Vector3.Dot(vector, normal));
    return Vector3.Subtract(vector, Vector3.Multiply(normal, factor));
  }

  public static Barycentric(value1: Vector3, value2: Vector3, value3: Vector3, amount1: number, amount2: number): Vector3 {
    return new Vector3(
      MathHelper.Barycentric(value1.X, value2.X, value3.X, amount1, amount2),
      MathHelper.Barycentric(value1.Y, value2.Y, value3.Y, amount1, amount2),
      MathHelper.Barycentric(value1.Z, value2.Z, value3.Z, amount1, amount2),
    );
  }

  public static CatmullRom(value1: Vector3, value2: Vector3, value3: Vector3, value4: Vector3, amount: number): Vector3 {
    return new Vector3(
      MathHelper.CatmullRom(value1.X, value2.X, value3.X, value4.X, amount),
      MathHelper.CatmullRom(value1.Y, value2.Y, value3.Y, value4.Y, amount),
      MathHelper.CatmullRom(value1.Z, value2.Z, value3.Z, value4.Z, amount),
    );
  }

  public static Hermite(value1: Vector3, tangent1: Vector3, value2: Vector3, tangent2: Vector3, amount: number): Vector3 {
    return new Vector3(
      MathHelper.Hermite(value1.X, tangent1.X, value2.X, tangent2.X, amount),
      MathHelper.Hermite(value1.Y, tangent1.Y, value2.Y, tangent2.Y, amount),
      MathHelper.Hermite(value1.Z, tangent1.Z, value2.Z, tangent2.Z, amount),
    );
  }

  public static Transform(position: Vector3, matrix: Matrix): Vector3;
  public static Transform(value: Vector3, rotation: Quaternion): Vector3;
  public static Transform(value: Vector3, transform: Matrix | Quaternion): Vector3 {
    const matrix = transform instanceof Matrix ? transform : Matrix.CreateFromQuaternion(transform);
    return new Vector3(
      f32(f32(value.X * matrix.M11) + f32(value.Y * matrix.M21) + f32(value.Z * matrix.M31) + matrix.M41),
      f32(f32(value.X * matrix.M12) + f32(value.Y * matrix.M22) + f32(value.Z * matrix.M32) + matrix.M42),
      f32(f32(value.X * matrix.M13) + f32(value.Y * matrix.M23) + f32(value.Z * matrix.M33) + matrix.M43),
    );
  }

  public static TransformNormal(normal: Vector3, matrix: Matrix): Vector3 {
    return new Vector3(
      f32(f32(normal.X * matrix.M11) + f32(normal.Y * matrix.M21) + f32(normal.Z * matrix.M31)),
      f32(f32(normal.X * matrix.M12) + f32(normal.Y * matrix.M22) + f32(normal.Z * matrix.M32)),
      f32(f32(normal.X * matrix.M13) + f32(normal.Y * matrix.M23) + f32(normal.Z * matrix.M33)),
    );
  }
}
