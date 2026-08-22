import type { IEquatable } from "./Contracts.js";
import { BoundingBox } from "./BoundingBox.js";
import { BoundingSphere } from "./BoundingSphere.js";
import { ContainmentType } from "./ContainmentType.js";
import { Matrix } from "./Matrix.js";
import { Plane } from "./Plane.js";
import { PlaneIntersectionType } from "./PlaneIntersectionType.js";
import { Ray } from "./Ray.js";
import { Vector3 } from "./Vector3.js";

function copyMatrix(value: Matrix): Matrix {
  return new Matrix(
    value.M11, value.M12, value.M13, value.M14, value.M21, value.M22, value.M23, value.M24,
    value.M31, value.M32, value.M33, value.M34, value.M41, value.M42, value.M43, value.M44,
  );
}

function copyPlane(value: Plane): Plane {
  return new Plane(value.Normal, value.D);
}

/** Microsoft.Xna.Framework.BoundingFrustum projection with snapshotted Matrix values. */
export class BoundingFrustum implements IEquatable<BoundingFrustum> {
  public static readonly CornerCount = 8;
  #matrix: Matrix;
  #planes: Plane[] = [];
  #corners: Vector3[] = [];

  public constructor(value: Matrix) {
    this.#matrix = copyMatrix(value);
    this.#recalculate();
  }

  public get Matrix(): Matrix { return copyMatrix(this.#matrix); }
  public set Matrix(value: Matrix) { this.#matrix = copyMatrix(value); this.#recalculate(); }
  public get Near(): Plane { return copyPlane(this.#planes[0]); }
  public get Far(): Plane { return copyPlane(this.#planes[1]); }
  public get Left(): Plane { return copyPlane(this.#planes[2]); }
  public get Right(): Plane { return copyPlane(this.#planes[3]); }
  public get Top(): Plane { return copyPlane(this.#planes[4]); }
  public get Bottom(): Plane { return copyPlane(this.#planes[5]); }

  public GetCorners(): Vector3[];
  public GetCorners(corners: Vector3[]): void;
  public GetCorners(corners?: Vector3[]): Vector3[] | void {
    const result = this.#corners.map((value) => new Vector3(value.X, value.Y, value.Z));
    if (corners === undefined) return result;
    if (corners.length < BoundingFrustum.CornerCount) throw new RangeError("corners must have room for eight values");
    for (let index = 0; index < BoundingFrustum.CornerCount; index += 1) corners[index] = result[index];
  }

  public Contains(point: Vector3): ContainmentType;
  public Contains(box: BoundingBox): ContainmentType;
  public Contains(sphere: BoundingSphere): ContainmentType;
  public Contains(frustum: BoundingFrustum): ContainmentType;
  public Contains(value: Vector3 | BoundingBox | BoundingSphere | BoundingFrustum): ContainmentType {
    if (value instanceof Vector3) {
      let intersects = false;
      for (const plane of this.#planes) {
        const distance = plane.DotCoordinate(value);
        if (distance > 0) return ContainmentType.Disjoint;
        if (distance === 0) intersects = true;
      }
      return intersects ? ContainmentType.Intersects : ContainmentType.Contains;
    }
    let intersects = false;
    for (const plane of this.#planes) {
      const classification = value instanceof BoundingFrustum
        ? value.Intersects(plane)
        : value.Intersects(plane) as PlaneIntersectionType;
      if (classification === PlaneIntersectionType.Front) return ContainmentType.Disjoint;
      if (classification === PlaneIntersectionType.Intersecting) intersects = true;
    }
    return intersects ? ContainmentType.Intersects : ContainmentType.Contains;
  }

  public Intersects(box: BoundingBox): boolean;
  public Intersects(sphere: BoundingSphere): boolean;
  public Intersects(frustum: BoundingFrustum): boolean;
  public Intersects(plane: Plane): PlaneIntersectionType;
  public Intersects(ray: Ray): number | null;
  public Intersects(value: BoundingBox | BoundingSphere | BoundingFrustum | Plane | Ray): boolean | PlaneIntersectionType | number | null {
    if (value instanceof Plane) {
      let front = false;
      let back = false;
      for (const corner of this.#corners) {
        const distance = value.DotCoordinate(corner);
        front ||= distance > 0;
        back ||= distance < 0;
        if (front && back) return PlaneIntersectionType.Intersecting;
      }
      return front ? PlaneIntersectionType.Front : PlaneIntersectionType.Back;
    }
    if (value instanceof Ray) {
      let enter = 0;
      let exit = Number.POSITIVE_INFINITY;
      for (const plane of this.#planes) {
        const distance = plane.DotCoordinate(value.Position);
        const denominator = plane.DotNormal(value.Direction);
        if (Math.abs(denominator) < 1e-6) {
          if (distance > 0) return null;
          continue;
        }
        const crossing = -distance / denominator;
        if (denominator < 0) enter = Math.max(enter, crossing);
        else exit = Math.min(exit, crossing);
        if (enter > exit) return null;
      }
      return exit < 0 ? null : Math.fround(Math.max(0, enter));
    }
    if (value instanceof BoundingBox) return this.Contains(value) !== ContainmentType.Disjoint;
    if (value instanceof BoundingSphere) return this.Contains(value) !== ContainmentType.Disjoint;
    return this.Contains(value) !== ContainmentType.Disjoint;
  }

  public Equals(other: BoundingFrustum): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof BoundingFrustum && this.#matrix.Equals(obj.#matrix);
  }

  public GetHashCode(): number { return this.#matrix.GetHashCode(); }

  public ToString(): string {
    return `{Near:${this.Near.ToString()} Far:${this.Far.ToString()} Left:${this.Left.ToString()} Right:${this.Right.ToString()} Top:${this.Top.ToString()} Bottom:${this.Bottom.ToString()}}`;
  }

  #recalculate(): void {
    const f32 = Math.fround;
    const m = this.#matrix;
    this.#planes = [
      new Plane(-m.M13, -m.M23, -m.M33, -m.M43),
      new Plane(m.M13 - m.M14, m.M23 - m.M24, m.M33 - m.M34, m.M43 - m.M44),
      new Plane(-m.M14 - m.M11, -m.M24 - m.M21, -m.M34 - m.M31, -m.M44 - m.M41),
      new Plane(m.M11 - m.M14, m.M21 - m.M24, m.M31 - m.M34, m.M41 - m.M44),
      new Plane(m.M12 - m.M14, m.M22 - m.M24, m.M32 - m.M34, m.M42 - m.M44),
      new Plane(-m.M14 - m.M12, -m.M24 - m.M22, -m.M34 - m.M32, -m.M44 - m.M42),
    ];
    for (const plane of this.#planes) {
      const length = plane.Normal.Length();
      plane.Normal = Vector3.Divide(plane.Normal, length);
      plane.D = f32(plane.D / length);
    }
    const intersectionLine = (first: Plane, second: Plane): Ray => {
      const direction = Vector3.Cross(first.Normal, second.Normal);
      const lengthSquared = direction.LengthSquared();
      const weightedNormals = Vector3.Add(
        Vector3.Multiply(second.Normal, f32(-first.D)),
        Vector3.Multiply(first.Normal, second.D),
      );
      const position = Vector3.Divide(Vector3.Cross(weightedNormals, direction), lengthSquared);
      return new Ray(position, direction);
    };
    const intersection = (plane: Plane, ray: Ray): Vector3 => {
      const numerator = f32(f32(-plane.D) - Vector3.Dot(plane.Normal, ray.Position));
      const distance = f32(numerator / Vector3.Dot(plane.Normal, ray.Direction));
      return Vector3.Add(ray.Position, Vector3.Multiply(ray.Direction, distance));
    };
    const [near, far, left, right, top, bottom] = this.#planes;
    const nearLeft = intersectionLine(near, left);
    const rightNear = intersectionLine(right, near);
    const leftFar = intersectionLine(left, far);
    const farRight = intersectionLine(far, right);
    this.#corners = [
      intersection(top, nearLeft), intersection(top, rightNear),
      intersection(bottom, rightNear), intersection(bottom, nearLeft),
      intersection(top, leftFar), intersection(top, farRight),
      intersection(bottom, farRight), intersection(bottom, leftFar),
    ];
  }
}
