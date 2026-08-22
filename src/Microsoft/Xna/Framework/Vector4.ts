import type { IEquatable } from "./Contracts.js";
import { MathHelper } from "./MathHelper.js";
import { Matrix } from "./Matrix.js";
import { Quaternion } from "./Quaternion.js";
import { Vector2 } from "./Vector2.js";
import { Vector3 } from "./Vector3.js";

const f32 = Math.fround;

/** Mutable Microsoft.Xna.Framework.Vector4 projection. */
export class Vector4 implements IEquatable<Vector4> {
  public X: number;
  public Y: number;
  public Z: number;
  public W: number;

  public constructor(value: number);
  public constructor(value: Vector2, z: number, w: number);
  public constructor(value: Vector3, w: number);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(xOrValue: number | Vector2 | Vector3, y?: number, z?: number, w?: number) {
    if (xOrValue instanceof Vector2) {
      this.X = f32(xOrValue.X); this.Y = f32(xOrValue.Y); this.Z = f32(y ?? 0); this.W = f32(z ?? 0);
    } else if (xOrValue instanceof Vector3) {
      this.X = f32(xOrValue.X); this.Y = f32(xOrValue.Y); this.Z = f32(xOrValue.Z); this.W = f32(y ?? 0);
    } else if (w === undefined) {
      this.X = this.Y = this.Z = this.W = f32(xOrValue);
    } else {
      this.X = f32(xOrValue); this.Y = f32(y ?? 0); this.Z = f32(z ?? 0); this.W = f32(w);
    }
  }

  public static get Zero(): Vector4 { return new Vector4(0); }
  public static get One(): Vector4 { return new Vector4(1); }
  public static get UnitX(): Vector4 { return new Vector4(1, 0, 0, 0); }
  public static get UnitY(): Vector4 { return new Vector4(0, 1, 0, 0); }
  public static get UnitZ(): Vector4 { return new Vector4(0, 0, 1, 0); }
  public static get UnitW(): Vector4 { return new Vector4(0, 0, 0, 1); }

  public Length(): number { return f32(Math.sqrt(this.LengthSquared())); }
  public LengthSquared(): number {
    return f32(f32(this.X * this.X) + f32(this.Y * this.Y) + f32(this.Z * this.Z) + f32(this.W * this.W));
  }
  public Normalize(): void {
    const inverse = f32(1 / Math.sqrt(this.LengthSquared()));
    this.X = f32(this.X * inverse); this.Y = f32(this.Y * inverse);
    this.Z = f32(this.Z * inverse); this.W = f32(this.W * inverse);
  }
  public Equals(other: Vector4): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof Vector4 && this.X === obj.X && this.Y === obj.Y && this.Z === obj.Z && this.W === obj.W;
  }

  public static Add(value1: Vector4, value2: Vector4): Vector4 {
    return new Vector4(f32(value1.X + value2.X), f32(value1.Y + value2.Y), f32(value1.Z + value2.Z), f32(value1.W + value2.W));
  }
  public static Subtract(value1: Vector4, value2: Vector4): Vector4 {
    return new Vector4(f32(value1.X - value2.X), f32(value1.Y - value2.Y), f32(value1.Z - value2.Z), f32(value1.W - value2.W));
  }
  public static Multiply(value1: Vector4, value2: Vector4): Vector4;
  public static Multiply(value1: Vector4, scaleFactor: number): Vector4;
  public static Multiply(value1: Vector4, value2: Vector4 | number): Vector4 {
    return typeof value2 === "number"
      ? new Vector4(f32(value1.X * value2), f32(value1.Y * value2), f32(value1.Z * value2), f32(value1.W * value2))
      : new Vector4(f32(value1.X * value2.X), f32(value1.Y * value2.Y), f32(value1.Z * value2.Z), f32(value1.W * value2.W));
  }
  public static Divide(value1: Vector4, value2: Vector4): Vector4;
  public static Divide(value1: Vector4, divider: number): Vector4;
  public static Divide(value1: Vector4, value2: Vector4 | number): Vector4 {
    return typeof value2 === "number"
      ? Vector4.Multiply(value1, f32(1 / value2))
      : new Vector4(f32(value1.X / value2.X), f32(value1.Y / value2.Y), f32(value1.Z / value2.Z), f32(value1.W / value2.W));
  }
  public static Negate(value: Vector4): Vector4 { return new Vector4(-value.X, -value.Y, -value.Z, -value.W); }
  public static Dot(vector1: Vector4, vector2: Vector4): number {
    return f32(f32(vector1.X * vector2.X) + f32(vector1.Y * vector2.Y) + f32(vector1.Z * vector2.Z) + f32(vector1.W * vector2.W));
  }
  public static Distance(value1: Vector4, value2: Vector4): number { return Vector4.Subtract(value1, value2).Length(); }
  public static DistanceSquared(value1: Vector4, value2: Vector4): number { return Vector4.Subtract(value1, value2).LengthSquared(); }
  public static Normalize(vector: Vector4): Vector4 {
    const result = new Vector4(vector.X, vector.Y, vector.Z, vector.W); result.Normalize(); return result;
  }
  public static Min(value1: Vector4, value2: Vector4): Vector4 {
    return new Vector4(MathHelper.Min(value1.X, value2.X), MathHelper.Min(value1.Y, value2.Y), MathHelper.Min(value1.Z, value2.Z), MathHelper.Min(value1.W, value2.W));
  }
  public static Max(value1: Vector4, value2: Vector4): Vector4 {
    return new Vector4(MathHelper.Max(value1.X, value2.X), MathHelper.Max(value1.Y, value2.Y), MathHelper.Max(value1.Z, value2.Z), MathHelper.Max(value1.W, value2.W));
  }
  public static Clamp(value1: Vector4, min: Vector4, max: Vector4): Vector4 {
    return new Vector4(
      MathHelper.Clamp(value1.X, min.X, max.X), MathHelper.Clamp(value1.Y, min.Y, max.Y),
      MathHelper.Clamp(value1.Z, min.Z, max.Z), MathHelper.Clamp(value1.W, min.W, max.W),
    );
  }
  public static Lerp(value1: Vector4, value2: Vector4, amount: number): Vector4 {
    return new Vector4(
      MathHelper.Lerp(value1.X, value2.X, amount), MathHelper.Lerp(value1.Y, value2.Y, amount),
      MathHelper.Lerp(value1.Z, value2.Z, amount), MathHelper.Lerp(value1.W, value2.W, amount),
    );
  }
  public static SmoothStep(value1: Vector4, value2: Vector4, amount: number): Vector4 {
    return new Vector4(
      MathHelper.SmoothStep(value1.X, value2.X, amount), MathHelper.SmoothStep(value1.Y, value2.Y, amount),
      MathHelper.SmoothStep(value1.Z, value2.Z, amount), MathHelper.SmoothStep(value1.W, value2.W, amount),
    );
  }

  public static Transform(position: Vector2, matrix: Matrix): Vector4;
  public static Transform(value: Vector2, rotation: Quaternion): Vector4;
  public static Transform(position: Vector3, matrix: Matrix): Vector4;
  public static Transform(value: Vector3, rotation: Quaternion): Vector4;
  public static Transform(vector: Vector4, matrix: Matrix): Vector4;
  public static Transform(value: Vector4, rotation: Quaternion): Vector4;
  public static Transform(value: Vector2 | Vector3 | Vector4, transform: Matrix | Quaternion): Vector4 {
    const vector = value instanceof Vector4
      ? value
      : value instanceof Vector3
        ? new Vector4(value, 1)
        : new Vector4(value, 0, 1);
    const matrix = transform instanceof Matrix ? transform : Matrix.CreateFromQuaternion(transform);
    return new Vector4(
      f32(f32(vector.X * matrix.M11) + f32(vector.Y * matrix.M21) + f32(vector.Z * matrix.M31) + f32(vector.W * matrix.M41)),
      f32(f32(vector.X * matrix.M12) + f32(vector.Y * matrix.M22) + f32(vector.Z * matrix.M32) + f32(vector.W * matrix.M42)),
      f32(f32(vector.X * matrix.M13) + f32(vector.Y * matrix.M23) + f32(vector.Z * matrix.M33) + f32(vector.W * matrix.M43)),
      f32(f32(vector.X * matrix.M14) + f32(vector.Y * matrix.M24) + f32(vector.Z * matrix.M34) + f32(vector.W * matrix.M44)),
    );
  }
}
