import type { IEquatable } from "./Contracts.js";
import { Point } from "./Point.js";

/** Mutable Microsoft.Xna.Framework.Rectangle projection. */
export class Rectangle implements IEquatable<Rectangle> {
  public X: number;
  public Y: number;
  public Width: number;
  public Height: number;

  public constructor(x: number, y: number, width: number, height: number) {
    this.X = Math.trunc(x);
    this.Y = Math.trunc(y);
    this.Width = Math.trunc(width);
    this.Height = Math.trunc(height);
  }

  public static get Empty(): Rectangle {
    return new Rectangle(0, 0, 0, 0);
  }

  public get Left(): number {
    return this.X;
  }

  public get Right(): number {
    return this.X + this.Width;
  }

  public get Top(): number {
    return this.Y;
  }

  public get Bottom(): number {
    return this.Y + this.Height;
  }

  public get Center(): Point {
    return new Point(this.X + Math.trunc(this.Width / 2), this.Y + Math.trunc(this.Height / 2));
  }

  public get IsEmpty(): boolean {
    return this.X === 0 && this.Y === 0 && this.Width === 0 && this.Height === 0;
  }

  public Contains(value: Point): boolean;
  public Contains(value: Rectangle): boolean;
  public Contains(x: number, y: number): boolean;
  public Contains(valueOrX: Point | Rectangle | number, y?: number): boolean {
    if (valueOrX instanceof Rectangle) {
      return (
        this.X <= valueOrX.X &&
        valueOrX.Right <= this.Right &&
        this.Y <= valueOrX.Y &&
        valueOrX.Bottom <= this.Bottom
      );
    }
    const point = valueOrX instanceof Point ? valueOrX : new Point(valueOrX, y ?? 0);
    return this.X <= point.X && point.X < this.Right && this.Y <= point.Y && point.Y < this.Bottom;
  }

  public Intersects(value: Rectangle): boolean {
    return value.X < this.Right && this.X < value.Right && value.Y < this.Bottom && this.Y < value.Bottom;
  }

  public Inflate(horizontalAmount: number, verticalAmount: number): void {
    const horizontal = Math.trunc(horizontalAmount);
    const vertical = Math.trunc(verticalAmount);
    this.X -= horizontal;
    this.Y -= vertical;
    this.Width += horizontal * 2;
    this.Height += vertical * 2;
  }

  public Offset(amount: Point): void;
  public Offset(offsetX: number, offsetY: number): void;
  public Offset(amountOrX: Point | number, offsetY?: number): void {
    if (amountOrX instanceof Point) {
      this.X += amountOrX.X;
      this.Y += amountOrX.Y;
    } else {
      this.X += Math.trunc(amountOrX);
      this.Y += Math.trunc(offsetY ?? 0);
    }
  }

  public Equals(other: Rectangle): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return (
      obj instanceof Rectangle &&
      this.X === obj.X &&
      this.Y === obj.Y &&
      this.Width === obj.Width &&
      this.Height === obj.Height
    );
  }

  public static Intersect(value1: Rectangle, value2: Rectangle): Rectangle {
    const left = Math.max(value1.Left, value2.Left);
    const top = Math.max(value1.Top, value2.Top);
    const right = Math.min(value1.Right, value2.Right);
    const bottom = Math.min(value1.Bottom, value2.Bottom);
    return right > left && bottom > top ? new Rectangle(left, top, right - left, bottom - top) : Rectangle.Empty;
  }

  public static Union(value1: Rectangle, value2: Rectangle): Rectangle {
    const left = Math.min(value1.Left, value2.Left);
    const top = Math.min(value1.Top, value2.Top);
    const right = Math.max(value1.Right, value2.Right);
    const bottom = Math.max(value1.Bottom, value2.Bottom);
    return new Rectangle(left, top, right - left, bottom - top);
  }
}
