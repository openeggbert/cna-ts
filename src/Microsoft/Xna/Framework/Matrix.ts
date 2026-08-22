import type { IEquatable } from "./Contracts.js";
import { MathHelper } from "./MathHelper.js";
import type { MatrixDecomposeResult } from "./MatrixDecomposeResult.js";
import { Plane } from "./Plane.js";
import { Quaternion } from "./Quaternion.js";
import { Vector3 } from "./Vector3.js";
import { addHashes, floatHash, valueString } from "../../../internal/value.js";
import { ArgumentOutOfRangeException } from "../../../internal/exceptions.js";

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

  public GetHashCode(): number { return addHashes(...Matrix.values(this).map(floatHash)); }

  public ToString(): string {
    const v = Matrix.values(this).map(valueString);
    return `{ {M11:${v[0]} M12:${v[1]} M13:${v[2]} M14:${v[3]}} ` +
      `{M21:${v[4]} M22:${v[5]} M23:${v[6]} M24:${v[7]}} ` +
      `{M31:${v[8]} M32:${v[9]} M33:${v[10]} M34:${v[11]}} ` +
      `{M41:${v[12]} M42:${v[13]} M43:${v[14]} M44:${v[15]}} }`;
  }

  public Decompose(): MatrixDecomposeResult {
    const rows = [
      new Vector3(this.M11, this.M12, this.M13),
      new Vector3(this.M21, this.M22, this.M23),
      new Vector3(this.M31, this.M32, this.M33),
    ];
    const scaleValues = rows.map((row) => row.Length());
    const order = [0, 1, 2].sort((left, right) => scaleValues[right] - scaleValues[left]);
    const canonical = [Vector3.UnitX, Vector3.UnitY, Vector3.UnitZ];
    const basis = rows.map((row) => new Vector3(row.X, row.Y, row.Z));

    const first = order[0];
    if (scaleValues[first] < 0.0001) basis[first] = canonical[first];
    basis[first].Normalize();

    const second = order[1];
    if (scaleValues[second] < 0.0001) {
      const absolute = [Math.abs(basis[first].X), Math.abs(basis[first].Y), Math.abs(basis[first].Z)];
      const leastAligned = absolute[0] < absolute[1]
        ? (absolute[0] < absolute[2] ? 0 : 2)
        : (absolute[1] < absolute[2] ? 1 : 2);
      basis[second] = Vector3.Cross(canonical[leastAligned], basis[first]);
    }
    basis[second].Normalize();

    const third = order[2];
    if (scaleValues[third] < 0.0001) basis[third] = Vector3.Cross(basis[first], basis[second]);
    basis[third].Normalize();

    const rotationMatrix = new Matrix(
      basis[0].X, basis[0].Y, basis[0].Z, 0,
      basis[1].X, basis[1].Y, basis[1].Z, 0,
      basis[2].X, basis[2].Y, basis[2].Z, 0,
      0, 0, 0, 1,
    );
    let determinant = rotationMatrix.Determinant();
    if (determinant < 0) {
      scaleValues[first] = f32(-scaleValues[first]);
      basis[first] = Vector3.Negate(basis[first]);
      if (first === 0) rotationMatrix.Right = basis[first];
      else if (first === 1) rotationMatrix.Up = basis[first];
      else rotationMatrix.Backward = basis[first];
      determinant = f32(-determinant);
    }
    const error = f32(determinant - 1);
    const success = !(f32(error * error) > 0.0001);
    return {
      Success: success,
      Scale: new Vector3(scaleValues[0], scaleValues[1], scaleValues[2]),
      Rotation: success ? Quaternion.CreateFromRotationMatrix(rotationMatrix) : Quaternion.Identity,
      Translation: new Vector3(this.M41, this.M42, this.M43),
    };
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

  public static CreateFromAxisAngle(axis: Vector3, angle: number): Matrix {
    angle = f32(angle);
    const sine = f32(Math.sin(angle));
    const cosine = f32(Math.cos(angle));
    const x = axis.X, y = axis.Y, z = axis.Z;
    const xx = f32(x * x), yy = f32(y * y), zz = f32(z * z);
    const xy = f32(x * y), xz = f32(x * z), yz = f32(y * z);
    return new Matrix(
      f32(xx + f32(cosine * f32(1 - xx))), f32(f32(xy - f32(cosine * xy)) + f32(sine * z)), f32(f32(xz - f32(cosine * xz)) - f32(sine * y)), 0,
      f32(f32(xy - f32(cosine * xy)) - f32(sine * z)), f32(yy + f32(cosine * f32(1 - yy))), f32(f32(yz - f32(cosine * yz)) + f32(sine * x)), 0,
      f32(f32(xz - f32(cosine * xz)) + f32(sine * y)), f32(f32(yz - f32(cosine * yz)) - f32(sine * x)), f32(zz + f32(cosine * f32(1 - zz))), 0,
      0, 0, 0, 1,
    );
  }

  public static CreateBillboard(objectPosition: Vector3, cameraPosition: Vector3, cameraUpVector: Vector3, cameraForwardVector: Vector3 | null): Matrix {
    let backward = Vector3.Subtract(objectPosition, cameraPosition);
    const lengthSquared = backward.LengthSquared();
    backward = lengthSquared < 0.0001
      ? (cameraForwardVector == null ? Vector3.Forward : Vector3.Negate(cameraForwardVector))
      : Vector3.Multiply(backward, f32(1 / Math.sqrt(lengthSquared)));
    const right = Vector3.Normalize(Vector3.Cross(cameraUpVector, backward));
    const up = Vector3.Cross(backward, right);
    return new Matrix(
      right.X, right.Y, right.Z, 0,
      up.X, up.Y, up.Z, 0,
      backward.X, backward.Y, backward.Z, 0,
      objectPosition.X, objectPosition.Y, objectPosition.Z, 1,
    );
  }

  public static CreateConstrainedBillboard(
    objectPosition: Vector3,
    cameraPosition: Vector3,
    rotateAxis: Vector3,
    cameraForwardVector: Vector3 | null,
    objectForwardVector: Vector3 | null,
  ): Matrix {
    let faceDirection = Vector3.Subtract(objectPosition, cameraPosition);
    const lengthSquared = faceDirection.LengthSquared();
    faceDirection = lengthSquared < 0.0001
      ? (cameraForwardVector == null ? Vector3.Forward : Vector3.Negate(cameraForwardVector))
      : Vector3.Multiply(faceDirection, f32(1 / Math.sqrt(lengthSquared)));
    const up = new Vector3(rotateAxis.X, rotateAxis.Y, rotateAxis.Z);
    let forward: Vector3;
    let right: Vector3;
    if (Math.abs(Vector3.Dot(rotateAxis, faceDirection)) > 0.99825466) {
      forward = objectForwardVector == null
        ? (Math.abs(Vector3.Dot(rotateAxis, Vector3.Forward)) > 0.99825466 ? Vector3.Right : Vector3.Forward)
        : new Vector3(objectForwardVector.X, objectForwardVector.Y, objectForwardVector.Z);
      if (Math.abs(Vector3.Dot(rotateAxis, forward)) > 0.99825466) {
        forward = Math.abs(Vector3.Dot(rotateAxis, Vector3.Forward)) > 0.99825466 ? Vector3.Right : Vector3.Forward;
      }
      right = Vector3.Normalize(Vector3.Cross(rotateAxis, forward));
      forward = Vector3.Normalize(Vector3.Cross(right, rotateAxis));
    } else {
      right = Vector3.Normalize(Vector3.Cross(rotateAxis, faceDirection));
      forward = Vector3.Normalize(Vector3.Cross(right, up));
    }
    return new Matrix(
      right.X, right.Y, right.Z, 0,
      up.X, up.Y, up.Z, 0,
      forward.X, forward.Y, forward.Z, 0,
      objectPosition.X, objectPosition.Y, objectPosition.Z, 1,
    );
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
    const fov = f32(fieldOfView);
    const aspect = f32(aspectRatio);
    const near = f32(nearPlaneDistance);
    const far = f32(farPlaneDistance);
    if (fov <= 0 || fov >= MathHelper.Pi) throw new ArgumentOutOfRangeException("fieldOfView must be between 0 and Pi");
    if (near <= 0) throw new ArgumentOutOfRangeException("nearPlaneDistance must be positive");
    if (far <= 0) throw new ArgumentOutOfRangeException("farPlaneDistance must be positive");
    if (near >= far) throw new ArgumentOutOfRangeException("nearPlaneDistance must be less than farPlaneDistance");
    const difference = f32(near - far);
    const yScale = f32(1 / f32(Math.tan(f32(fov * 0.5))));
    const xScale = f32(yScale / aspect);
    return new Matrix(
      xScale, 0, 0, 0, 0, yScale, 0, 0,
      0, 0, f32(far / difference), -1,
      0, 0, f32(f32(near * far) / difference), 0,
    );
  }

  public static CreatePerspective(width: number, height: number, nearPlaneDistance: number, farPlaneDistance: number): Matrix {
    Matrix.validatePerspective(nearPlaneDistance, farPlaneDistance);
    return new Matrix(
      f32(f32(2 * nearPlaneDistance) / width), 0, 0, 0,
      0, f32(f32(2 * nearPlaneDistance) / height), 0, 0,
      0, 0, f32(farPlaneDistance / f32(nearPlaneDistance - farPlaneDistance)), -1,
      0, 0, f32(f32(nearPlaneDistance * farPlaneDistance) / f32(nearPlaneDistance - farPlaneDistance)), 0,
    );
  }

  public static CreatePerspectiveOffCenter(left: number, right: number, bottom: number, top: number, nearPlaneDistance: number, farPlaneDistance: number): Matrix {
    Matrix.validatePerspective(nearPlaneDistance, farPlaneDistance);
    return new Matrix(
      f32(f32(2 * nearPlaneDistance) / f32(right - left)), 0, 0, 0,
      0, f32(f32(2 * nearPlaneDistance) / f32(top - bottom)), 0, 0,
      f32(f32(left + right) / f32(right - left)), f32(f32(top + bottom) / f32(top - bottom)),
      f32(farPlaneDistance / f32(nearPlaneDistance - farPlaneDistance)), -1,
      0, 0, f32(f32(nearPlaneDistance * farPlaneDistance) / f32(nearPlaneDistance - farPlaneDistance)), 0,
    );
  }

  public static CreateOrthographic(width: number, height: number, zNearPlane: number, zFarPlane: number): Matrix {
    return new Matrix(
      f32(2 / width), 0, 0, 0,
      0, f32(2 / height), 0, 0,
      0, 0, f32(1 / f32(zNearPlane - zFarPlane)), 0,
      0, 0, f32(zNearPlane / f32(zNearPlane - zFarPlane)), 1,
    );
  }

  public static CreateOrthographicOffCenter(left: number, right: number, bottom: number, top: number, zNearPlane: number, zFarPlane: number): Matrix {
    return new Matrix(
      f32(2 / f32(right - left)), 0, 0, 0,
      0, f32(2 / f32(top - bottom)), 0, 0,
      0, 0, f32(1 / f32(zNearPlane - zFarPlane)), 0,
      f32(f32(left + right) / f32(left - right)), f32(f32(top + bottom) / f32(bottom - top)),
      f32(zNearPlane / f32(zNearPlane - zFarPlane)), 1,
    );
  }

  public static CreateWorld(position: Vector3, forward: Vector3, up: Vector3): Matrix {
    const backward = Vector3.Normalize(Vector3.Negate(forward));
    const right = Vector3.Normalize(Vector3.Cross(up, backward));
    const actualUp = Vector3.Cross(backward, right);
    return new Matrix(
      right.X, right.Y, right.Z, 0,
      actualUp.X, actualUp.Y, actualUp.Z, 0,
      backward.X, backward.Y, backward.Z, 0,
      position.X, position.Y, position.Z, 1,
    );
  }

  public static CreateShadow(lightDirection: Vector3, plane: Plane): Matrix {
    const normalized = Plane.Normalize(new Plane(plane.Normal, plane.D));
    const dot = Vector3.Dot(normalized.Normal, lightDirection);
    const x = f32(-normalized.Normal.X), y = f32(-normalized.Normal.Y);
    const z = f32(-normalized.Normal.Z), d = f32(-normalized.D);
    return new Matrix(
      f32(f32(x * lightDirection.X) + dot), f32(x * lightDirection.Y), f32(x * lightDirection.Z), 0,
      f32(y * lightDirection.X), f32(f32(y * lightDirection.Y) + dot), f32(y * lightDirection.Z), 0,
      f32(z * lightDirection.X), f32(z * lightDirection.Y), f32(f32(z * lightDirection.Z) + dot), 0,
      f32(d * lightDirection.X), f32(d * lightDirection.Y), f32(d * lightDirection.Z), dot,
    );
  }

  public static CreateReflection(value: Plane): Matrix {
    const plane = Plane.Normalize(new Plane(value.Normal, value.D));
    const x = plane.Normal.X, y = plane.Normal.Y, z = plane.Normal.Z;
    const x2 = f32(-2 * x), y2 = f32(-2 * y), z2 = f32(-2 * z);
    return new Matrix(
      f32(f32(x2 * x) + 1), f32(y2 * x), f32(z2 * x), 0,
      f32(x2 * y), f32(f32(y2 * y) + 1), f32(z2 * y), 0,
      f32(x2 * z), f32(y2 * z), f32(f32(z2 * z) + 1), 0,
      f32(x2 * plane.D), f32(y2 * plane.D), f32(z2 * plane.D), 1,
    );
  }

  public static Transform(value: Matrix, rotation: Quaternion): Matrix {
    const doubledX = f32(rotation.X + rotation.X);
    const doubledY = f32(rotation.Y + rotation.Y);
    const doubledZ = f32(rotation.Z + rotation.Z);
    const wx = f32(rotation.W * doubledX), wy = f32(rotation.W * doubledY), wz = f32(rotation.W * doubledZ);
    const xx = f32(rotation.X * doubledX), xy = f32(rotation.X * doubledY), xz = f32(rotation.X * doubledZ);
    const yy = f32(rotation.Y * doubledY), yz = f32(rotation.Y * doubledZ), zz = f32(rotation.Z * doubledZ);
    const r11 = f32(f32(1 - yy) - zz), r12 = f32(xy - wz), r13 = f32(xz + wy);
    const r21 = f32(xy + wz), r22 = f32(f32(1 - xx) - zz), r23 = f32(yz - wx);
    const r31 = f32(xz - wy), r32 = f32(yz + wx), r33 = f32(f32(1 - xx) - yy);
    const row = (a: number, b: number, c: number): [number, number, number] => [
      f32(f32(f32(a * r11) + f32(b * r12)) + f32(c * r13)),
      f32(f32(f32(a * r21) + f32(b * r22)) + f32(c * r23)),
      f32(f32(f32(a * r31) + f32(b * r32)) + f32(c * r33)),
    ];
    const a = row(value.M11, value.M12, value.M13);
    const b = row(value.M21, value.M22, value.M23);
    const c = row(value.M31, value.M32, value.M33);
    const d = row(value.M41, value.M42, value.M43);
    return new Matrix(
      ...a, value.M14, ...b, value.M24, ...c, value.M34, ...d, value.M44,
    );
  }

  private static validatePerspective(nearPlaneDistance: number, farPlaneDistance: number): void {
    if (nearPlaneDistance <= 0) throw new ArgumentOutOfRangeException("nearPlaneDistance must be positive");
    if (farPlaneDistance <= 0) throw new ArgumentOutOfRangeException("farPlaneDistance must be positive");
    if (nearPlaneDistance >= farPlaneDistance) throw new ArgumentOutOfRangeException("nearPlaneDistance must be less than farPlaneDistance");
  }
}
