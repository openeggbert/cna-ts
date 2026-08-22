import type { IEquatable } from "./Contracts.js";
import { MathHelper } from "./MathHelper.js";
import { Matrix } from "./Matrix.js";
import { Quaternion } from "./Quaternion.js";
import { addHashes, floatHash, transformQuaternionComponents, valueString } from "../../../internal/value.js";
import { transformArray } from "../../../internal/exceptions.js";

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

  public GetHashCode(): number { return addHashes(floatHash(this.X), floatHash(this.Y)); }

  public ToString(): string { return `{X:${valueString(this.X)} Y:${valueString(this.Y)}}`; }

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
    return new Vector2(MathHelper.Min(value1.X, value2.X), MathHelper.Min(value1.Y, value2.Y));
  }

  public static Max(value1: Vector2, value2: Vector2): Vector2 {
    return new Vector2(MathHelper.Max(value1.X, value2.X), MathHelper.Max(value1.Y, value2.Y));
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
  public static Transform(sourceArray: Vector2[], matrix: Matrix, destinationArray: Vector2[]): void;
  public static Transform(sourceArray: Vector2[], rotation: Quaternion, destinationArray: Vector2[]): void;
  public static Transform(sourceArray: Vector2[], sourceIndex: number, matrix: Matrix, destinationArray: Vector2[], destinationIndex: number, length: number): void;
  public static Transform(sourceArray: Vector2[], sourceIndex: number, rotation: Quaternion, destinationArray: Vector2[], destinationIndex: number, length: number): void;
  public static Transform(
    value: Vector2 | Vector2[],
    transformOrIndex: Matrix | Quaternion | number,
    transformOrDestination?: Matrix | Quaternion | Vector2[],
    destinationArray?: Vector2[],
    destinationIndex?: number,
    length?: number,
  ): Vector2 | void {
    if (Array.isArray(value)) {
      const ranged = typeof transformOrIndex === "number";
      const transform = (ranged ? transformOrDestination : transformOrIndex) as Matrix | Quaternion;
      const destination = (ranged ? destinationArray : transformOrDestination) as Vector2[];
      transformArray(
        value,
        ranged ? transformOrIndex : 0,
        destination,
        ranged ? destinationIndex ?? 0 : 0,
        ranged ? length ?? 0 : value.length,
        (item) => transform instanceof Matrix
          ? Vector2.Transform(item, transform)
          : Vector2.Transform(item, transform),
      );
      return;
    }
    const transform = transformOrIndex as Matrix | Quaternion;
    if (transform instanceof Matrix) {
      let x = f32(value.X * transform.M11);
      x = f32(x + f32(value.Y * transform.M21));
      x = f32(x + transform.M41);
      let y = f32(value.X * transform.M12);
      y = f32(y + f32(value.Y * transform.M22));
      y = f32(y + transform.M42);
      return new Vector2(
        x,
        y,
      );
    }
    const [x, y] = transformQuaternionComponents(
      value.X, value.Y, 0, transform.X, transform.Y, transform.Z, transform.W,
    );
    return new Vector2(x, y);
  }

  public static TransformNormal(normal: Vector2, matrix: Matrix): Vector2;
  public static TransformNormal(sourceArray: Vector2[], matrix: Matrix, destinationArray: Vector2[]): void;
  public static TransformNormal(sourceArray: Vector2[], sourceIndex: number, matrix: Matrix, destinationArray: Vector2[], destinationIndex: number, length: number): void;
  public static TransformNormal(
    normal: Vector2 | Vector2[],
    matrixOrIndex: Matrix | number,
    matrixOrDestination?: Matrix | Vector2[],
    destinationArray?: Vector2[],
    destinationIndex?: number,
    length?: number,
  ): Vector2 | void {
    if (Array.isArray(normal)) {
      const ranged = typeof matrixOrIndex === "number";
      const matrix = (ranged ? matrixOrDestination : matrixOrIndex) as Matrix;
      const destination = (ranged ? destinationArray : matrixOrDestination) as Vector2[];
      transformArray(
        normal,
        ranged ? matrixOrIndex : 0,
        destination,
        ranged ? destinationIndex ?? 0 : 0,
        ranged ? length ?? 0 : normal.length,
        (item) => Vector2.TransformNormal(item, matrix),
      );
      return;
    }
    const matrix = matrixOrIndex as Matrix;
    let x = f32(normal.X * matrix.M11);
    x = f32(x + f32(normal.Y * matrix.M21));
    let y = f32(normal.X * matrix.M12);
    y = f32(y + f32(normal.Y * matrix.M22));
    return new Vector2(
      x,
      y,
    );
  }
}
