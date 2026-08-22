import type { IEquatable } from "./Contracts.js";

/** Mutable Microsoft.Xna.Framework.Point projection. */
export class Point implements IEquatable<Point> {
  public X: number;
  public Y: number;

  public constructor(x: number, y: number) {
    this.X = Math.trunc(x);
    this.Y = Math.trunc(y);
  }

  public static get Zero(): Point {
    return new Point(0, 0);
  }

  public Equals(other: Point): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof Point && this.X === obj.X && this.Y === obj.Y;
  }
}
