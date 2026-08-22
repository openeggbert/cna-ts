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
        let value = f32(a[row * 4] * b[column]);
        value = f32(value + f32(a[row * 4 + 1] * b[4 + column]));
        value = f32(value + f32(a[row * 4 + 2] * b[8 + column]));
        result[row * 4 + column] = f32(value + f32(a[row * 4 + 3] * b[12 + column]));
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
    const difference = (a: number, b: number, c: number, d: number): number => f32(f32(a * b) - f32(c * d));
    const sum3 = (a: number, b: number, c: number): number => f32(f32(a + b) + c);
    const n1 = matrix.M11, n2 = matrix.M12, n3 = matrix.M13, n4 = matrix.M14;
    const n5 = matrix.M21, n6 = matrix.M22, n7 = matrix.M23, n8 = matrix.M24;
    const n9 = matrix.M31, n10 = matrix.M32, n11 = matrix.M33, n12 = matrix.M34;
    const n13 = matrix.M41, n14 = matrix.M42, n15 = matrix.M43, n16 = matrix.M44;
    const n17 = difference(n11, n16, n12, n15);
    const n18 = difference(n10, n16, n12, n14);
    const n19 = difference(n10, n15, n11, n14);
    const n20 = difference(n9, n16, n12, n13);
    const n21 = difference(n9, n15, n11, n13);
    const n22 = difference(n9, n14, n10, n13);
    const n23 = sum3(f32(n6 * n17), f32(-n7 * n18), f32(n8 * n19));
    const n24 = f32(-sum3(f32(n5 * n17), f32(-n7 * n20), f32(n8 * n21)));
    const n25 = sum3(f32(n5 * n18), f32(-n6 * n20), f32(n8 * n22));
    const n26 = f32(-sum3(f32(n5 * n19), f32(-n6 * n21), f32(n7 * n22)));
    const determinant = f32(f32(f32(f32(n1 * n23) + f32(n2 * n24)) + f32(n3 * n25)) + f32(n4 * n26));
    const n27 = f32(1 / determinant);
    const result = new Array<number>(16);
    result[0] = f32(n23 * n27);
    result[4] = f32(n24 * n27);
    result[8] = f32(n25 * n27);
    result[12] = f32(n26 * n27);
    result[1] = f32(-sum3(f32(n2 * n17), f32(-n3 * n18), f32(n4 * n19)) * n27);
    result[5] = f32(sum3(f32(n1 * n17), f32(-n3 * n20), f32(n4 * n21)) * n27);
    result[9] = f32(-sum3(f32(n1 * n18), f32(-n2 * n20), f32(n4 * n22)) * n27);
    result[13] = f32(sum3(f32(n1 * n19), f32(-n2 * n21), f32(n3 * n22)) * n27);
    const n28 = difference(n7, n16, n8, n15);
    const n29 = difference(n6, n16, n8, n14);
    const n30 = difference(n6, n15, n7, n14);
    const n31 = difference(n5, n16, n8, n13);
    const n32 = difference(n5, n15, n7, n13);
    const n33 = difference(n5, n14, n6, n13);
    result[2] = f32(sum3(f32(n2 * n28), f32(-n3 * n29), f32(n4 * n30)) * n27);
    result[6] = f32(-sum3(f32(n1 * n28), f32(-n3 * n31), f32(n4 * n32)) * n27);
    result[10] = f32(sum3(f32(n1 * n29), f32(-n2 * n31), f32(n4 * n33)) * n27);
    result[14] = f32(-sum3(f32(n1 * n30), f32(-n2 * n32), f32(n3 * n33)) * n27);
    const n34 = difference(n7, n12, n8, n11);
    const n35 = difference(n6, n12, n8, n10);
    const n36 = difference(n6, n11, n7, n10);
    const n37 = difference(n5, n12, n8, n9);
    const n38 = difference(n5, n11, n7, n9);
    const n39 = difference(n5, n10, n6, n9);
    result[3] = f32(-sum3(f32(n2 * n34), f32(-n3 * n35), f32(n4 * n36)) * n27);
    result[7] = f32(sum3(f32(n1 * n34), f32(-n3 * n37), f32(n4 * n38)) * n27);
    result[11] = f32(-sum3(f32(n1 * n35), f32(-n2 * n37), f32(n4 * n39)) * n27);
    result[15] = f32(sum3(f32(n1 * n36), f32(-n2 * n38), f32(n3 * n39)) * n27);
    return Matrix.fromValues(result);
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
    radians = f32(radians);
    const cosine = f32(Math.cos(radians)), sine = f32(Math.sin(radians));
    return new Matrix(1, 0, 0, 0, 0, cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1);
  }
  public static CreateRotationY(radians: number): Matrix {
    radians = f32(radians);
    const cosine = f32(Math.cos(radians)), sine = f32(Math.sin(radians));
    return new Matrix(cosine, 0, -sine, 0, 0, 1, 0, 0, sine, 0, cosine, 0, 0, 0, 0, 1);
  }
  public static CreateRotationZ(radians: number): Matrix {
    radians = f32(radians);
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
