import type { IEquatable } from "./Contracts.js";
import { Quaternion } from "./Quaternion.js";
import { Vector3 } from "./Vector3.js";

const f32 = Math.fround;

/** Mutable row-major Microsoft.Xna.Framework.Matrix projection. */
export class Matrix implements IEquatable<Matrix> {
  public M11: number; public M12: number; public M13: number; public M14: number;
  public M21: number; public M22: number; public M23: number; public M24: number;
  public M31: number; public M32: number; public M33: number; public M34: number;
  public M41: number; public M42: number; public M43: number; public M44: number;

  public constructor(
    m11: number, m12: number, m13: number, m14: number,
    m21: number, m22: number, m23: number, m24: number,
    m31: number, m32: number, m33: number, m34: number,
    m41: number, m42: number, m43: number, m44: number,
  ) {
    this.M11 = f32(m11); this.M12 = f32(m12); this.M13 = f32(m13); this.M14 = f32(m14);
    this.M21 = f32(m21); this.M22 = f32(m22); this.M23 = f32(m23); this.M24 = f32(m24);
    this.M31 = f32(m31); this.M32 = f32(m32); this.M33 = f32(m33); this.M34 = f32(m34);
    this.M41 = f32(m41); this.M42 = f32(m42); this.M43 = f32(m43); this.M44 = f32(m44);
  }

  public static get Identity(): Matrix {
    return new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }

  public get Translation(): Vector3 { return new Vector3(this.M41, this.M42, this.M43); }
  public set Translation(value: Vector3) { this.M41 = f32(value.X); this.M42 = f32(value.Y); this.M43 = f32(value.Z); }
  public get Right(): Vector3 { return new Vector3(this.M11, this.M12, this.M13); }
  public set Right(value: Vector3) { this.M11 = f32(value.X); this.M12 = f32(value.Y); this.M13 = f32(value.Z); }
  public get Up(): Vector3 { return new Vector3(this.M21, this.M22, this.M23); }
  public set Up(value: Vector3) { this.M21 = f32(value.X); this.M22 = f32(value.Y); this.M23 = f32(value.Z); }
  public get Backward(): Vector3 { return new Vector3(this.M31, this.M32, this.M33); }
  public set Backward(value: Vector3) { this.M31 = f32(value.X); this.M32 = f32(value.Y); this.M33 = f32(value.Z); }
  public get Left(): Vector3 { return Vector3.Negate(this.Right); }
  public set Left(value: Vector3) { this.Right = Vector3.Negate(value); }
  public get Down(): Vector3 { return Vector3.Negate(this.Up); }
  public set Down(value: Vector3) { this.Up = Vector3.Negate(value); }
  public get Forward(): Vector3 { return Vector3.Negate(this.Backward); }
  public set Forward(value: Vector3) { this.Backward = Vector3.Negate(value); }

  public Equals(other: Matrix): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof Matrix && Matrix.values(this).every((value, index) => value === Matrix.values(obj)[index]);
  }

  public Determinant(): number {
    const a = this.M11, b = this.M12, c = this.M13, d = this.M14;
    const e = this.M21, f = this.M22, g = this.M23, h = this.M24;
    const i = this.M31, j = this.M32, k = this.M33, l = this.M34;
    const m = this.M41, n = this.M42, o = this.M43, p = this.M44;
    return f32(
      a * (f * (k * p - l * o) - g * (j * p - l * n) + h * (j * o - k * n)) -
      b * (e * (k * p - l * o) - g * (i * p - l * m) + h * (i * o - k * m)) +
      c * (e * (j * p - l * n) - f * (i * p - l * m) + h * (i * n - j * m)) -
      d * (e * (j * o - k * n) - f * (i * o - k * m) + g * (i * n - j * m))
    );
  }

  private static values(value: Matrix): number[] {
    return [
      value.M11, value.M12, value.M13, value.M14, value.M21, value.M22, value.M23, value.M24,
      value.M31, value.M32, value.M33, value.M34, value.M41, value.M42, value.M43, value.M44,
    ];
  }

  private static fromValues(value: number[]): Matrix { return new Matrix(...(value as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number])); }

  public static Add(matrix1: Matrix, matrix2: Matrix): Matrix { return Matrix.fromValues(Matrix.values(matrix1).map((value, index) => f32(value + Matrix.values(matrix2)[index]))); }
  public static Subtract(matrix1: Matrix, matrix2: Matrix): Matrix { return Matrix.fromValues(Matrix.values(matrix1).map((value, index) => f32(value - Matrix.values(matrix2)[index]))); }
  public static Negate(matrix: Matrix): Matrix { return Matrix.fromValues(Matrix.values(matrix).map((item) => f32(-item))); }
  public static Multiply(matrix1: Matrix, matrix2: Matrix): Matrix;
  public static Multiply(matrix1: Matrix, scaleFactor: number): Matrix;
  public static Multiply(matrix1: Matrix, matrix2: Matrix | number): Matrix {
    if (typeof matrix2 === "number") return Matrix.fromValues(Matrix.values(matrix1).map((item) => f32(item * matrix2)));
    const a = Matrix.values(matrix1), b = Matrix.values(matrix2), result = new Array<number>(16);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        result[row * 4 + column] = f32(
          f32(a[row * 4] * b[column]) + f32(a[row * 4 + 1] * b[4 + column]) +
          f32(a[row * 4 + 2] * b[8 + column]) + f32(a[row * 4 + 3] * b[12 + column]),
        );
      }
    }
    return Matrix.fromValues(result);
  }
  public static Divide(matrix1: Matrix, matrix2: Matrix): Matrix;
  public static Divide(matrix1: Matrix, divider: number): Matrix;
  public static Divide(matrix1: Matrix, matrix2: Matrix | number): Matrix {
    if (typeof matrix2 === "number") return Matrix.Multiply(matrix1, f32(1 / matrix2));
    const right = Matrix.values(matrix2);
    return Matrix.fromValues(Matrix.values(matrix1).map((item, index) => f32(item / right[index])));
  }
  public static Lerp(matrix1: Matrix, matrix2: Matrix, amount: number): Matrix {
    const right = Matrix.values(matrix2);
    return Matrix.fromValues(Matrix.values(matrix1).map((item, index) => f32(item + f32((right[index] - item) * amount))));
  }
  public static Transpose(matrix: Matrix): Matrix {
    return new Matrix(
      matrix.M11, matrix.M21, matrix.M31, matrix.M41,
      matrix.M12, matrix.M22, matrix.M32, matrix.M42,
      matrix.M13, matrix.M23, matrix.M33, matrix.M43,
      matrix.M14, matrix.M24, matrix.M34, matrix.M44,
    );
  }
  public static Invert(matrix: Matrix): Matrix {
    const rows = [0, 1, 2, 3].map((row) => [
      ...Matrix.values(matrix).slice(row * 4, row * 4 + 4),
      ...[0, 1, 2, 3].map((column) => (column === row ? 1 : 0)),
    ]);
    for (let column = 0; column < 4; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < 4; row += 1) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      const divisor = rows[column][column];
      for (let item = 0; item < 8; item += 1) rows[column][item] /= divisor;
      for (let row = 0; row < 4; row += 1) {
        if (row === column) continue;
        const factor = rows[row][column];
        for (let item = 0; item < 8; item += 1) rows[row][item] -= factor * rows[column][item];
      }
    }
    return Matrix.fromValues(rows.flatMap((row) => row.slice(4)).map(f32));
  }

  public static CreateTranslation(position: Vector3): Matrix;
  public static CreateTranslation(xPosition: number, yPosition: number, zPosition: number): Matrix;
  public static CreateTranslation(positionOrX: Vector3 | number, y = 0, z = 0): Matrix {
    const result = Matrix.Identity;
    if (positionOrX instanceof Vector3) result.Translation = positionOrX;
    else result.Translation = new Vector3(positionOrX, y, z);
    return result;
  }
  public static CreateScale(scale: number): Matrix;
  public static CreateScale(scales: Vector3): Matrix;
  public static CreateScale(xScale: number, yScale: number, zScale: number): Matrix;
  public static CreateScale(value: Vector3 | number, y?: number, z?: number): Matrix {
    const xScale = value instanceof Vector3 ? value.X : value;
    const yScale = value instanceof Vector3 ? value.Y : y ?? value;
    const zScale = value instanceof Vector3 ? value.Z : z ?? value;
    return new Matrix(xScale, 0, 0, 0, 0, yScale, 0, 0, 0, 0, zScale, 0, 0, 0, 0, 1);
  }
  public static CreateRotationX(radians: number): Matrix {
    const cosine = f32(Math.cos(radians)), sine = f32(Math.sin(radians));
    return new Matrix(1, 0, 0, 0, 0, cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1);
  }
  public static CreateRotationY(radians: number): Matrix {
    const cosine = f32(Math.cos(radians)), sine = f32(Math.sin(radians));
    return new Matrix(cosine, 0, -sine, 0, 0, 1, 0, 0, sine, 0, cosine, 0, 0, 0, 0, 1);
  }
  public static CreateRotationZ(radians: number): Matrix {
    const cosine = f32(Math.cos(radians)), sine = f32(Math.sin(radians));
    return new Matrix(cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }
  public static CreateFromQuaternion(quaternion: Quaternion): Matrix {
    const xx = quaternion.X * quaternion.X, yy = quaternion.Y * quaternion.Y, zz = quaternion.Z * quaternion.Z;
    const xy = quaternion.X * quaternion.Y, xz = quaternion.X * quaternion.Z, yz = quaternion.Y * quaternion.Z;
    const wx = quaternion.W * quaternion.X, wy = quaternion.W * quaternion.Y, wz = quaternion.W * quaternion.Z;
    return new Matrix(
      1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
      2 * (xy - wz), 1 - 2 * (zz + xx), 2 * (yz + wx), 0,
      2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (yy + xx), 0,
      0, 0, 0, 1,
    );
  }
  public static CreateFromYawPitchRoll(yaw: number, pitch: number, roll: number): Matrix {
    return Matrix.CreateFromQuaternion(Quaternion.CreateFromYawPitchRoll(yaw, pitch, roll));
  }
  public static CreateLookAt(cameraPosition: Vector3, cameraTarget: Vector3, cameraUpVector: Vector3): Matrix {
    const backward = Vector3.Normalize(Vector3.Subtract(cameraPosition, cameraTarget));
    const right = Vector3.Normalize(Vector3.Cross(cameraUpVector, backward));
    const up = Vector3.Cross(backward, right);
    return new Matrix(
      right.X, up.X, backward.X, 0,
      right.Y, up.Y, backward.Y, 0,
      right.Z, up.Z, backward.Z, 0,
      -Vector3.Dot(right, cameraPosition), -Vector3.Dot(up, cameraPosition), -Vector3.Dot(backward, cameraPosition), 1,
    );
  }
  public static CreatePerspectiveFieldOfView(fieldOfView: number, aspectRatio: number, nearPlaneDistance: number, farPlaneDistance: number): Matrix {
    if (fieldOfView <= 0 || fieldOfView >= Math.PI) throw new RangeError("fieldOfView must be between 0 and Pi");
    if (nearPlaneDistance <= 0) throw new RangeError("nearPlaneDistance must be positive");
    if (farPlaneDistance <= 0) throw new RangeError("farPlaneDistance must be positive");
    if (nearPlaneDistance >= farPlaneDistance) throw new RangeError("nearPlaneDistance must be less than farPlaneDistance");
    const yScale = 1 / Math.tan(fieldOfView * 0.5), xScale = yScale / aspectRatio;
    return new Matrix(
      xScale, 0, 0, 0, 0, yScale, 0, 0,
      0, 0, farPlaneDistance / (nearPlaneDistance - farPlaneDistance), -1,
      0, 0, nearPlaneDistance * farPlaneDistance / (nearPlaneDistance - farPlaneDistance), 0,
    );
  }
}
