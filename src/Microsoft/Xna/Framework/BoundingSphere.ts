import type { IEquatable } from "./Contracts.js";
import { BoundingBox } from "./BoundingBox.js";
import { BoundingFrustum } from "./BoundingFrustum.js";
import { ContainmentType } from "./ContainmentType.js";
import { Matrix } from "./Matrix.js";
import { Plane } from "./Plane.js";
import { PlaneIntersectionType } from "./PlaneIntersectionType.js";
import { Ray } from "./Ray.js";
import { Vector3 } from "./Vector3.js";
import { addHashes, floatHash, valueString } from "../../../internal/value.js";
import { ArgumentException } from "../../../internal/exceptions.js";

/** Mutable Microsoft.Xna.Framework.BoundingSphere projection. */
export class BoundingSphere implements IEquatable<BoundingSphere> {
  public Center: Vector3;
  public Radius: number;

  public constructor(center: Vector3, radius: number) {
    if (radius < 0) throw new ArgumentException("radius must be greater than or equal to zero");
    this.Center = new Vector3(center.X, center.Y, center.Z);
    this.Radius = Math.fround(radius);
  }

  public Equals(other: BoundingSphere): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof BoundingSphere && this.Center.Equals(obj.Center) && this.Radius === obj.Radius;
  }

  public GetHashCode(): number { return addHashes(this.Center.GetHashCode(), floatHash(this.Radius)); }

  public ToString(): string {
    return `{Center:${this.Center.ToString()} Radius:${valueString(this.Radius)}}`;
  }

  public Contains(point: Vector3): ContainmentType;
  public Contains(box: BoundingBox): ContainmentType;
  public Contains(sphere: BoundingSphere): ContainmentType;
  public Contains(frustum: BoundingFrustum): ContainmentType;
  public Contains(value: Vector3 | BoundingBox | BoundingSphere | BoundingFrustum): ContainmentType {
    if (value instanceof Vector3) {
      const distanceSquared = Vector3.DistanceSquared(value, this.Center);
      const radiusSquared = this.Radius * this.Radius;
      return distanceSquared < radiusSquared ? ContainmentType.Contains : ContainmentType.Disjoint;
    }
    if (value instanceof BoundingSphere) {
      const distance = Vector3.Distance(this.Center, value.Center);
      if (distance > this.Radius + value.Radius) return ContainmentType.Disjoint;
      if (distance <= this.Radius - value.Radius) return ContainmentType.Contains;
      return ContainmentType.Intersects;
    }
    if (value instanceof BoundingFrustum) {
      if (!this.Intersects(value)) return ContainmentType.Disjoint;
      return value.GetCorners().every((corner) => this.Contains(corner) === ContainmentType.Contains)
        ? ContainmentType.Contains
        : ContainmentType.Intersects;
    }
    if (!this.Intersects(value)) return ContainmentType.Disjoint;
    const radiusSquared = this.Radius * this.Radius;
    return value.GetCorners().every((corner) => Vector3.DistanceSquared(this.Center, corner) <= radiusSquared)
      ? ContainmentType.Contains
      : ContainmentType.Intersects;
  }

  public Intersects(sphere: BoundingSphere): boolean;
  public Intersects(box: BoundingBox): boolean;
  public Intersects(frustum: BoundingFrustum): boolean;
  public Intersects(ray: Ray): number | null;
  public Intersects(plane: Plane): PlaneIntersectionType;
  public Intersects(value: BoundingSphere | BoundingBox | BoundingFrustum | Ray | Plane): boolean | number | null | PlaneIntersectionType {
    if (value instanceof Ray) return value.Intersects(this);
    if (value instanceof Plane) {
      const distance = value.DotCoordinate(this.Center);
      if (distance > this.Radius) return PlaneIntersectionType.Front;
      if (distance < -this.Radius) return PlaneIntersectionType.Back;
      return PlaneIntersectionType.Intersecting;
    }
    if (value instanceof BoundingBox) return value.Intersects(this) as boolean;
    if (value instanceof BoundingFrustum) return value.Intersects(this);
    const radii = this.Radius + value.Radius;
    return Vector3.DistanceSquared(this.Center, value.Center) < radii * radii;
  }

  public Transform(matrix: Matrix): BoundingSphere {
    const center = Vector3.Transform(this.Center, matrix);
    const scale = Math.sqrt(Math.max(
      matrix.M11 * matrix.M11 + matrix.M12 * matrix.M12 + matrix.M13 * matrix.M13,
      matrix.M21 * matrix.M21 + matrix.M22 * matrix.M22 + matrix.M23 * matrix.M23,
      matrix.M31 * matrix.M31 + matrix.M32 * matrix.M32 + matrix.M33 * matrix.M33,
    ));
    return new BoundingSphere(center, this.Radius * scale);
  }

  public static CreateFromBoundingBox(box: BoundingBox): BoundingSphere {
    const center = Vector3.Multiply(Vector3.Add(box.Min, box.Max), 0.5);
    return new BoundingSphere(center, Vector3.Distance(center, box.Max));
  }

  public static CreateFromFrustum(frustum: BoundingFrustum): BoundingSphere {
    if (frustum == null) throw new TypeError("frustum cannot be null");
    return BoundingSphere.CreateFromPoints(frustum.GetCorners());
  }

  public static CreateFromPoints(points: Iterable<Vector3>): BoundingSphere {
    const values = [...points].map((point) => new Vector3(point.X, point.Y, point.Z));
    if (values.length === 0) throw new RangeError("points must contain at least one value");
    let minX = values[0], maxX = values[0], minY = values[0], maxY = values[0], minZ = values[0], maxZ = values[0];
    for (const point of values) {
      if (point.X < minX.X) minX = point;
      if (point.X > maxX.X) maxX = point;
      if (point.Y < minY.Y) minY = point;
      if (point.Y > maxY.Y) maxY = point;
      if (point.Z < minZ.Z) minZ = point;
      if (point.Z > maxZ.Z) maxZ = point;
    }
    const distanceX = Vector3.Distance(maxX, minX);
    const distanceY = Vector3.Distance(maxY, minY);
    const distanceZ = Vector3.Distance(maxZ, minZ);
    let first: Vector3;
    let second: Vector3;
    if (distanceX > distanceY) [first, second] = distanceX > distanceZ ? [maxX, minX] : [maxZ, minZ];
    else [first, second] = distanceY > distanceZ ? [maxY, minY] : [maxZ, minZ];
    let center = Vector3.Lerp(first, second, 0.5);
    let radius = Math.fround(Vector3.Distance(first, second) * 0.5);
    for (const point of values) {
      const offset = Vector3.Subtract(point, center);
      const distance = offset.Length();
      if (distance > radius) {
        radius = Math.fround(Math.fround(radius + distance) * 0.5);
        center = Vector3.Add(center, Vector3.Multiply(offset, Math.fround(1 - Math.fround(radius / distance))));
      }
    }
    return new BoundingSphere(center, radius);
  }

  public static CreateMerged(original: BoundingSphere, additional: BoundingSphere): BoundingSphere {
    const difference = Vector3.Subtract(additional.Center, original.Center);
    const distance = difference.Length();
    if (original.Radius + additional.Radius >= distance) {
      if (original.Radius - additional.Radius >= distance) return new BoundingSphere(original.Center, original.Radius);
      if (additional.Radius - original.Radius >= distance) return new BoundingSphere(additional.Center, additional.Radius);
    }
    const direction = distance === 0 ? Vector3.UnitX : Vector3.Divide(difference, distance);
    const minimum = Math.min(-original.Radius, distance - additional.Radius);
    const maximum = Math.max(original.Radius, distance + additional.Radius);
    const radius = (maximum - minimum) * 0.5;
    return new BoundingSphere(Vector3.Add(original.Center, Vector3.Multiply(direction, radius + minimum)), radius);
  }
}
