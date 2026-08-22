import { Matrix } from "../Matrix.js";
import { Rectangle } from "../Rectangle.js";
import { Vector3 } from "../Vector3.js";
import { valueString } from "../../../../internal/value.js";

const f32 = Math.fround;
const FLOAT_EPSILON = 1.401298464324817e-45;

/** Runtime-independent XNA viewport transform and state value. */
export class Viewport {
  #x: number;
  #y: number;
  #width: number;
  #height: number;
  #minDepth = 0;
  #maxDepth = 1;

  public constructor(bounds: Rectangle);
  public constructor(x: number, y: number, width: number, height: number);
  public constructor(boundsOrX: Rectangle | number, y?: number, width?: number, height?: number) {
    if (boundsOrX instanceof Rectangle) {
      this.#x = boundsOrX.X;
      this.#y = boundsOrX.Y;
      this.#width = boundsOrX.Width;
      this.#height = boundsOrX.Height;
    } else {
      this.#x = Math.trunc(boundsOrX);
      this.#y = Math.trunc(y ?? 0);
      this.#width = Math.trunc(width ?? 0);
      this.#height = Math.trunc(height ?? 0);
    }
  }

  public get X(): number { return this.#x; }
  public set X(value: number) { this.#x = Math.trunc(value); }
  public get Y(): number { return this.#y; }
  public set Y(value: number) { this.#y = Math.trunc(value); }
  public get Width(): number { return this.#width; }
  public set Width(value: number) { this.#width = Math.trunc(value); }
  public get Height(): number { return this.#height; }
  public set Height(value: number) { this.#height = Math.trunc(value); }
  public get MinDepth(): number { return this.#minDepth; }
  public set MinDepth(value: number) { this.#minDepth = f32(value); }
  public get MaxDepth(): number { return this.#maxDepth; }
  public set MaxDepth(value: number) { this.#maxDepth = f32(value); }

  public get Bounds(): Rectangle { return new Rectangle(this.X, this.Y, this.Width, this.Height); }
  public set Bounds(value: Rectangle) {
    this.X = value.X;
    this.Y = value.Y;
    this.Width = value.Width;
    this.Height = value.Height;
  }

  public get AspectRatio(): number {
    return this.Width === 0 || this.Height === 0 ? 0 : f32(this.Width / this.Height);
  }

  public get TitleSafeArea(): Rectangle { return this.Bounds; }

  public Project(source: Vector3, projection: Matrix, view: Matrix, world: Matrix): Vector3 {
    const transform = Matrix.Multiply(Matrix.Multiply(world, view), projection);
    let result = Vector3.Transform(source, transform);
    let divisor = f32(source.X * transform.M14);
    divisor = f32(divisor + f32(source.Y * transform.M24));
    divisor = f32(divisor + f32(source.Z * transform.M34));
    divisor = f32(divisor + transform.M44);
    if (!Viewport.withinEpsilon(divisor, 1)) result = Vector3.Divide(result, divisor);
    result.X = f32(f32(f32(f32(result.X + 1) * 0.5) * this.Width) + this.X);
    result.Y = f32(f32(f32(f32(-result.Y + 1) * 0.5) * this.Height) + this.Y);
    result.Z = f32(f32(result.Z * f32(this.MaxDepth - this.MinDepth)) + this.MinDepth);
    return result;
  }

  public Unproject(source: Vector3, projection: Matrix, view: Matrix, world: Matrix): Vector3 {
    const transform = Matrix.Invert(Matrix.Multiply(Matrix.Multiply(world, view), projection));
    let x = f32(source.X - this.X);
    x = f32(x / this.Width);
    x = f32(x * 2);
    x = f32(x - 1);
    let y = f32(source.Y - this.Y);
    y = f32(y / this.Height);
    y = f32(y * 2);
    y = f32(y - 1);
    const normalized = new Vector3(
      x,
      f32(-y),
      f32(f32(source.Z - this.MinDepth) / f32(this.MaxDepth - this.MinDepth)),
    );
    let result = Vector3.Transform(normalized, transform);
    let divisor = f32(normalized.X * transform.M14);
    divisor = f32(divisor + f32(normalized.Y * transform.M24));
    divisor = f32(divisor + f32(normalized.Z * transform.M34));
    divisor = f32(divisor + transform.M44);
    if (!Viewport.withinEpsilon(divisor, 1)) result = Vector3.Divide(result, divisor);
    return result;
  }

  public ToString(): string {
    return `{X:${this.X} Y:${this.Y} Width:${this.Width} Height:${this.Height} ` +
      `MinDepth:${valueString(this.MinDepth)} MaxDepth:${valueString(this.MaxDepth)}}`;
  }

  private static withinEpsilon(left: number, right: number): boolean {
    const difference = f32(left - right);
    return -FLOAT_EPSILON <= difference && difference <= FLOAT_EPSILON;
  }
}
