import type { IEquatable } from "./Contracts.js";
import { BoundingFrustum } from "./BoundingFrustum.js";
import { BoundingSphere } from "./BoundingSphere.js";
import { ContainmentType } from "./ContainmentType.js";
import { Plane } from "./Plane.js";
import { PlaneIntersectionType } from "./PlaneIntersectionType.js";
import { Ray } from "./Ray.js";
import { Vector3 } from "./Vector3.js";

/** Mutable Microsoft.Xna.Framework.BoundingBox projection. */
export class BoundingBox implements IEquatable<BoundingBox> {
  public static readonly CornerCount = 8;
  public Min: Vector3;
  public Max: Vector3;

  public constructor(min: Vector3, max: Vector3) {
    this.Min = new Vector3(min.X, min.Y, min.Z);
    this.Max = new Vector3(max.X, max.Y, max.Z);
  }

  public Equals(other: BoundingBox): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof BoundingBox && this.Min.Equals(obj.Min) && this.Max.Equals(obj.Max);
  }

  public GetCorners(): Vector3[];
  public GetCorners(corners: Vector3[]): void;
  public GetCorners(corners?: Vector3[]): Vector3[] | void {
    const result = [
      new Vector3(this.Min.X, this.Max.Y, this.Max.Z), new Vector3(this.Max.X, this.Max.Y, this.Max.Z),
      new Vector3(this.Max.X, this.Min.Y, this.Max.Z), new Vector3(this.Min.X, this.Min.Y, this.Max.Z),
      new Vector3(this.Min.X, this.Max.Y, this.Min.Z), new Vector3(this.Max.X, this.Max.Y, this.Min.Z),
      new Vector3(this.Max.X, this.Min.Y, this.Min.Z), new Vector3(this.Min.X, this.Min.Y, this.Min.Z),
    ];
    if (corners === undefined) return result;
    if (corners.length < BoundingBox.CornerCount) throw new RangeError("corners must have room for eight values");
    for (let index = 0; index < BoundingBox.CornerCount; index += 1) corners[index] = result[index];
  }

  public Contains(point: Vector3): ContainmentType;
  public Contains(box: BoundingBox): ContainmentType;
  public Contains(sphere: BoundingSphere): ContainmentType;
  public Contains(frustum: BoundingFrustum): ContainmentType;
  public Contains(value: Vector3 | BoundingBox | BoundingSphere | BoundingFrustum): ContainmentType {
    if (value instanceof Vector3) {
      return value.X < this.Min.X || value.X > this.Max.X || value.Y < this.Min.Y || value.Y > this.Max.Y || value.Z < this.Min.Z || value.Z > this.Max.Z
        ? ContainmentType.Disjoint
        : ContainmentType.Contains;
    }
    if (value instanceof BoundingBox) {
      if (!this.Intersects(value)) return ContainmentType.Disjoint;
      return this.Min.X <= value.Min.X && value.Max.X <= this.Max.X && this.Min.Y <= value.Min.Y && value.Max.Y <= this.Max.Y && this.Min.Z <= value.Min.Z && value.Max.Z <= this.Max.Z
        ? ContainmentType.Contains
        : ContainmentType.Intersects;
    }
    if (value instanceof BoundingFrustum) {
      if (!this.Intersects(value)) return ContainmentType.Disjoint;
      return value.GetCorners().every((corner) => this.Contains(corner) === ContainmentType.Contains)
        ? ContainmentType.Contains
        : ContainmentType.Intersects;
    }
    const closest = Vector3.Clamp(value.Center, this.Min, this.Max);
    if (Vector3.DistanceSquared(value.Center, closest) > value.Radius * value.Radius) return ContainmentType.Disjoint;
    return value.Center.X - this.Min.X >= value.Radius && this.Max.X - value.Center.X >= value.Radius &&
      value.Center.Y - this.Min.Y >= value.Radius && this.Max.Y - value.Center.Y >= value.Radius &&
      value.Center.Z - this.Min.Z >= value.Radius && this.Max.Z - value.Center.Z >= value.Radius
      ? ContainmentType.Contains
      : ContainmentType.Intersects;
  }

  public Intersects(box: BoundingBox): boolean;
  public Intersects(sphere: BoundingSphere): boolean;
  public Intersects(frustum: BoundingFrustum): boolean;
  public Intersects(ray: Ray): number | null;
  public Intersects(plane: Plane): PlaneIntersectionType;
  public Intersects(value: BoundingBox | BoundingSphere | BoundingFrustum | Ray | Plane): boolean | number | null | PlaneIntersectionType {
    if (value instanceof Ray) return value.Intersects(this);
    if (value instanceof Plane) {
      const negative = new Vector3(
        value.Normal.X >= 0 ? this.Min.X : this.Max.X,
        value.Normal.Y >= 0 ? this.Min.Y : this.Max.Y,
        value.Normal.Z >= 0 ? this.Min.Z : this.Max.Z,
      );
      const positive = new Vector3(
        value.Normal.X >= 0 ? this.Max.X : this.Min.X,
        value.Normal.Y >= 0 ? this.Max.Y : this.Min.Y,
        value.Normal.Z >= 0 ? this.Max.Z : this.Min.Z,
      );
      if (value.DotCoordinate(negative) > 0) return PlaneIntersectionType.Front;
      if (value.DotCoordinate(positive) < 0) return PlaneIntersectionType.Back;
      return PlaneIntersectionType.Intersecting;
    }
    if (value instanceof BoundingSphere) {
      const closest = Vector3.Clamp(value.Center, this.Min, this.Max);
      return Vector3.DistanceSquared(value.Center, closest) <= value.Radius * value.Radius;
    }
    if (value instanceof BoundingFrustum) return value.Intersects(this);
    return this.Min.X <= value.Max.X && this.Max.X >= value.Min.X &&
      this.Min.Y <= value.Max.Y && this.Max.Y >= value.Min.Y &&
      this.Min.Z <= value.Max.Z && this.Max.Z >= value.Min.Z;
  }

  public static CreateFromPoints(points: Iterable<Vector3>): BoundingBox {
    let min = new Vector3(Number.POSITIVE_INFINITY);
    let max = new Vector3(Number.NEGATIVE_INFINITY);
    let count = 0;
    for (const point of points) { min = Vector3.Min(min, point); max = Vector3.Max(max, point); count += 1; }
    if (count === 0) throw new RangeError("points must contain at least one value");
    return new BoundingBox(min, max);
  }

  public static CreateFromSphere(sphere: BoundingSphere): BoundingBox {
    const radius = new Vector3(sphere.Radius);
    return new BoundingBox(Vector3.Subtract(sphere.Center, radius), Vector3.Add(sphere.Center, radius));
  }

  public static CreateMerged(original: BoundingBox, additional: BoundingBox): BoundingBox {
    return new BoundingBox(Vector3.Min(original.Min, additional.Min), Vector3.Max(original.Max, additional.Max));
  }
}
