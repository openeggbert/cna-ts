import type { IEquatable } from "./Contracts.js";
import { Matrix } from "./Matrix.js";
import { Vector3 } from "./Vector3.js";

const f32 = Math.fround;

/** Mutable Microsoft.Xna.Framework.Quaternion projection. */
export class Quaternion implements IEquatable<Quaternion> {
  public X: number;
  public Y: number;
  public Z: number;
  public W: number;

  public constructor(vectorPart: Vector3, scalarPart: number);
  public constructor(x: number, y: number, z: number, w: number);
  public constructor(xOrVector: number | Vector3, yOrScalar: number, z?: number, w?: number) {
    if (xOrVector instanceof Vector3) {
      this.X = f32(xOrVector.X); this.Y = f32(xOrVector.Y); this.Z = f32(xOrVector.Z); this.W = f32(yOrScalar);
    } else {
      this.X = f32(xOrVector); this.Y = f32(yOrScalar); this.Z = f32(z ?? 0); this.W = f32(w ?? 0);
    }
  }

  public static get Identity(): Quaternion { return new Quaternion(0, 0, 0, 1); }

  public Length(): number { return f32(Math.sqrt(this.LengthSquared())); }
  public LengthSquared(): number {
    let result = f32(f32(this.X * this.X) + f32(this.Y * this.Y));
    result = f32(result + f32(this.Z * this.Z));
    return f32(result + f32(this.W * this.W));
  }
  public Normalize(): void {
    const inverse = f32(1 / Math.sqrt(this.LengthSquared()));
    this.X = f32(this.X * inverse); this.Y = f32(this.Y * inverse);
    this.Z = f32(this.Z * inverse); this.W = f32(this.W * inverse);
  }
  public Conjugate(): void {
    this.X = f32(-this.X); this.Y = f32(-this.Y); this.Z = f32(-this.Z);
  }
  public Equals(other: Quaternion): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof Quaternion && this.X === obj.X && this.Y === obj.Y && this.Z === obj.Z && this.W === obj.W;
  }

  public static Add(quaternion1: Quaternion, quaternion2: Quaternion): Quaternion {
    return new Quaternion(f32(quaternion1.X + quaternion2.X), f32(quaternion1.Y + quaternion2.Y), f32(quaternion1.Z + quaternion2.Z), f32(quaternion1.W + quaternion2.W));
  }
  public static Subtract(quaternion1: Quaternion, quaternion2: Quaternion): Quaternion {
    return new Quaternion(f32(quaternion1.X - quaternion2.X), f32(quaternion1.Y - quaternion2.Y), f32(quaternion1.Z - quaternion2.Z), f32(quaternion1.W - quaternion2.W));
  }
  public static Negate(quaternion: Quaternion): Quaternion {
    return new Quaternion(-quaternion.X, -quaternion.Y, -quaternion.Z, -quaternion.W);
  }
  public static Multiply(quaternion1: Quaternion, quaternion2: Quaternion): Quaternion;
  public static Multiply(quaternion1: Quaternion, scaleFactor: number): Quaternion;
  public static Multiply(quaternion1: Quaternion, quaternion2: Quaternion | number): Quaternion {
    if (typeof quaternion2 === "number") {
      return new Quaternion(
        f32(quaternion1.X * quaternion2), f32(quaternion1.Y * quaternion2), f32(quaternion1.Z * quaternion2), f32(quaternion1.W * quaternion2),
      );
    }
    const x = quaternion1.X, y = quaternion1.Y, z = quaternion1.Z, w = quaternion1.W;
    const x2 = quaternion2.X, y2 = quaternion2.Y, z2 = quaternion2.Z, w2 = quaternion2.W;
    const crossX = f32(f32(y * z2) - f32(z * y2));
    const crossY = f32(f32(z * x2) - f32(x * z2));
    const crossZ = f32(f32(x * y2) - f32(y * x2));
    const dot = f32(f32(f32(x * x2) + f32(y * y2)) + f32(z * z2));
    return new Quaternion(
      f32(f32(f32(x * w2) + f32(x2 * w)) + crossX),
      f32(f32(f32(y * w2) + f32(y2 * w)) + crossY),
      f32(f32(f32(z * w2) + f32(z2 * w)) + crossZ),
      f32(f32(w * w2) - dot),
    );
  }
  public static Divide(quaternion1: Quaternion, quaternion2: Quaternion): Quaternion {
    return Quaternion.Multiply(quaternion1, Quaternion.Inverse(quaternion2));
  }
  public static Dot(quaternion1: Quaternion, quaternion2: Quaternion): number {
    let result = f32(f32(quaternion1.X * quaternion2.X) + f32(quaternion1.Y * quaternion2.Y));
    result = f32(result + f32(quaternion1.Z * quaternion2.Z));
    return f32(result + f32(quaternion1.W * quaternion2.W));
  }
  public static Normalize(quaternion: Quaternion): Quaternion {
    const result = new Quaternion(quaternion.X, quaternion.Y, quaternion.Z, quaternion.W); result.Normalize(); return result;
  }
  public static Conjugate(value: Quaternion): Quaternion {
    return new Quaternion(-value.X, -value.Y, -value.Z, value.W);
  }
  public static Inverse(quaternion: Quaternion): Quaternion {
    const inverse = f32(1 / quaternion.LengthSquared());
    return new Quaternion(
      f32(-quaternion.X * inverse), f32(-quaternion.Y * inverse), f32(-quaternion.Z * inverse), f32(quaternion.W * inverse),
    );
  }
  public static Concatenate(value1: Quaternion, value2: Quaternion): Quaternion {
    return Quaternion.Multiply(value2, value1);
  }
  public static Lerp(quaternion1: Quaternion, quaternion2: Quaternion, amount: number): Quaternion {
    const inverse = f32(1 - amount);
    const sign = Quaternion.Dot(quaternion1, quaternion2) >= 0 ? 1 : -1;
    return Quaternion.Normalize(new Quaternion(
      f32(f32(inverse * quaternion1.X) + f32(amount * quaternion2.X * sign)),
      f32(f32(inverse * quaternion1.Y) + f32(amount * quaternion2.Y * sign)),
      f32(f32(inverse * quaternion1.Z) + f32(amount * quaternion2.Z * sign)),
      f32(f32(inverse * quaternion1.W) + f32(amount * quaternion2.W * sign)),
    ));
  }
  public static Slerp(quaternion1: Quaternion, quaternion2: Quaternion, amount: number): Quaternion {
    amount = f32(amount);
    let dot = Quaternion.Dot(quaternion1, quaternion2);
    let sign = 1;
    if (dot < 0) { dot = -dot; sign = -1; }
    let inverseWeight;
    let weight;
    if (dot > 0.999999) {
      inverseWeight = f32(1 - amount);
      weight = f32(amount * sign);
    } else {
      const angle = f32(Math.acos(dot));
      const inverseSin = f32(1 / Math.sin(angle));
      inverseWeight = f32(f32(Math.sin(f32(f32(1 - amount) * angle))) * inverseSin);
      weight = f32(f32(Math.sin(f32(amount * angle))) * inverseSin * sign);
    }
    return new Quaternion(
      f32(f32(inverseWeight * quaternion1.X) + f32(weight * quaternion2.X)),
      f32(f32(inverseWeight * quaternion1.Y) + f32(weight * quaternion2.Y)),
      f32(f32(inverseWeight * quaternion1.Z) + f32(weight * quaternion2.Z)),
      f32(f32(inverseWeight * quaternion1.W) + f32(weight * quaternion2.W)),
    );
  }
  public static CreateFromAxisAngle(axis: Vector3, angle: number): Quaternion {
    angle = f32(angle);
    const half = f32(angle * 0.5);
    const sine = f32(Math.sin(half));
    return new Quaternion(f32(axis.X * sine), f32(axis.Y * sine), f32(axis.Z * sine), f32(Math.cos(half)));
  }
  public static CreateFromYawPitchRoll(yaw: number, pitch: number, roll: number): Quaternion {
    const halfRoll = roll * 0.5, sr = Math.sin(halfRoll), cr = Math.cos(halfRoll);
    const halfPitch = pitch * 0.5, sp = Math.sin(halfPitch), cp = Math.cos(halfPitch);
    const halfYaw = yaw * 0.5, sy = Math.sin(halfYaw), cy = Math.cos(halfYaw);
    return new Quaternion(
      f32(cy * sp * cr + sy * cp * sr),
      f32(sy * cp * cr - cy * sp * sr),
      f32(cy * cp * sr - sy * sp * cr),
      f32(cy * cp * cr + sy * sp * sr),
    );
  }
  public static CreateFromRotationMatrix(matrix: Matrix): Quaternion {
    const trace = f32(f32(matrix.M11 + matrix.M22) + matrix.M33);
    if (trace > 0) {
      const s = f32(Math.sqrt(f32(trace + 1)));
      const inverse = f32(0.5 / s);
      return new Quaternion(
        f32(f32(matrix.M23 - matrix.M32) * inverse),
        f32(f32(matrix.M31 - matrix.M13) * inverse),
        f32(f32(matrix.M12 - matrix.M21) * inverse),
        f32(s * 0.5),
      );
    }
    if (matrix.M11 >= matrix.M22 && matrix.M11 >= matrix.M33) {
      const s = Math.sqrt(1 + matrix.M11 - matrix.M22 - matrix.M33);
      const inverse = 0.5 / s;
      return new Quaternion(f32(s * 0.5), f32((matrix.M12 + matrix.M21) * inverse), f32((matrix.M13 + matrix.M31) * inverse), f32((matrix.M23 - matrix.M32) * inverse));
    }
    if (matrix.M22 > matrix.M33) {
      const s = Math.sqrt(1 + matrix.M22 - matrix.M11 - matrix.M33);
      const inverse = 0.5 / s;
      return new Quaternion(f32((matrix.M21 + matrix.M12) * inverse), f32(s * 0.5), f32((matrix.M32 + matrix.M23) * inverse), f32((matrix.M31 - matrix.M13) * inverse));
    }
    const s = Math.sqrt(1 + matrix.M33 - matrix.M11 - matrix.M22);
    const inverse = 0.5 / s;
    return new Quaternion(f32((matrix.M31 + matrix.M13) * inverse), f32((matrix.M32 + matrix.M23) * inverse), f32(s * 0.5), f32((matrix.M12 - matrix.M21) * inverse));
  }
}
