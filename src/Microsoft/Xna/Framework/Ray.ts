import type { IEquatable } from "./Contracts.js";
import type { BoundingBox } from "./BoundingBox.js";
import { BoundingFrustum } from "./BoundingFrustum.js";
import type { BoundingSphere } from "./BoundingSphere.js";
import { Plane } from "./Plane.js";
import { Vector3 } from "./Vector3.js";

const EPSILON = 1e-5;

/** Mutable Microsoft.Xna.Framework.Ray projection. */
export class Ray implements IEquatable<Ray> {
  public Position: Vector3;
  public Direction: Vector3;

  public constructor(position: Vector3, direction: Vector3) {
    this.Position = new Vector3(position.X, position.Y, position.Z);
    this.Direction = new Vector3(direction.X, direction.Y, direction.Z);
  }

  public Equals(other: Ray): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof Ray && this.Position.Equals(obj.Position) && this.Direction.Equals(obj.Direction);
  }

  public Intersects(plane: Plane): number | null;
  public Intersects(box: BoundingBox): number | null;
  public Intersects(sphere: BoundingSphere): number | null;
  public Intersects(frustum: BoundingFrustum): number | null;
  public Intersects(value: Plane | BoundingBox | BoundingSphere | BoundingFrustum): number | null {
    if (value instanceof Plane) {
      const denominator = Vector3.Dot(value.Normal, this.Direction);
      if (Math.abs(denominator) < EPSILON) return null;
      let distance = (-value.D - Vector3.Dot(value.Normal, this.Position)) / denominator;
      if (distance < 0) {
        if (distance < -EPSILON) return null;
        distance = 0;
      }
      return Math.fround(distance);
    }
    if (value instanceof BoundingFrustum) return value.Intersects(this) as number | null;
    if ("Min" in value) {
      let minimum = 0;
      let maximum = Number.POSITIVE_INFINITY;
      for (const axis of ["X", "Y", "Z"] as const) {
        const direction = this.Direction[axis];
        const position = this.Position[axis];
        if (Math.abs(direction) < EPSILON) {
          if (position < value.Min[axis] || position > value.Max[axis]) return null;
        } else {
          const inverse = 1 / direction;
          let first = (value.Min[axis] - position) * inverse;
          let second = (value.Max[axis] - position) * inverse;
          if (first > second) [first, second] = [second, first];
          minimum = Math.max(minimum, first);
          maximum = Math.min(maximum, second);
          if (minimum > maximum) return null;
        }
      }
      return Math.fround(minimum);
    }
    const difference = Vector3.Subtract(value.Center, this.Position);
    const projection = Vector3.Dot(difference, this.Direction);
    const distanceSquared = difference.LengthSquared() - projection * projection;
    const radiusSquared = value.Radius * value.Radius;
    if (distanceSquared > radiusSquared) return null;
    const offset = Math.sqrt(radiusSquared - distanceSquared);
    const distance = projection - offset;
    if (distance >= 0) return Math.fround(distance);
    const exit = projection + offset;
    return exit >= 0 ? 0 : null;
  }
}
