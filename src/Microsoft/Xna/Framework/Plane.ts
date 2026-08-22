import type { IEquatable } from "./Contracts.js";
import { Matrix } from "./Matrix.js";
import { Quaternion } from "./Quaternion.js";
import { Vector3 } from "./Vector3.js";
import { Vector4 } from "./Vector4.js";

const f32 = Math.fround;

/** Mutable Microsoft.Xna.Framework.Plane projection. */
export class Plane implements IEquatable<Plane> {
  public Normal: Vector3;
  public D: number;

  public constructor(value: Vector4);
  public constructor(normal: Vector3, d: number);
  public constructor(a: number, b: number, c: number, d: number);
  public constructor(point1: Vector3, point2: Vector3, point3: Vector3);
  public constructor(a: Vector3 | Vector4 | number, b?: Vector3 | number, c?: Vector3 | number, d?: number) {
    if (a instanceof Vector4) {
      this.Normal = new Vector3(a.X, a.Y, a.Z); this.D = f32(a.W);
    } else if (a instanceof Vector3 && b instanceof Vector3 && c instanceof Vector3) {
      this.Normal = Vector3.Normalize(Vector3.Cross(Vector3.Subtract(b, a), Vector3.Subtract(c, a)));
      this.D = f32(-Vector3.Dot(this.Normal, a));
    } else if (a instanceof Vector3) {
      this.Normal = new Vector3(a.X, a.Y, a.Z); this.D = f32(typeof b === "number" ? b : 0);
    } else {
      this.Normal = new Vector3(a, typeof b === "number" ? b : 0, typeof c === "number" ? c : 0);
      this.D = f32(d ?? 0);
    }
  }

  public Normalize(): void {
    const inverse = f32(1 / this.Normal.Length());
    this.Normal = Vector3.Multiply(this.Normal, inverse);
    this.D = f32(this.D * inverse);
  }

  public Dot(value: Vector4): number {
    return f32(Vector3.Dot(this.Normal, new Vector3(value.X, value.Y, value.Z)) + f32(this.D * value.W));
  }

  public DotCoordinate(value: Vector3): number {
    return f32(Vector3.Dot(this.Normal, value) + this.D);
  }

  public DotNormal(value: Vector3): number {
    return Vector3.Dot(this.Normal, value);
  }

  public Equals(other: Plane): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof Plane && this.Normal.Equals(obj.Normal) && this.D === obj.D;
  }

  public static Normalize(value: Plane): Plane {
    const result = new Plane(value.Normal, value.D); result.Normalize(); return result;
  }

  public static Transform(plane: Plane, matrix: Matrix): Plane;
  public static Transform(plane: Plane, rotation: Quaternion): Plane;
  public static Transform(plane: Plane, transform: Matrix | Quaternion): Plane {
    if (transform instanceof Quaternion) {
      return new Plane(Vector3.Transform(plane.Normal, transform), plane.D);
    }
    const inverse = Matrix.Invert(transform);
    const value = Vector4.Transform(new Vector4(plane.Normal, plane.D), Matrix.Transpose(inverse));
    return new Plane(value);
  }
}
