import type { Vector4 } from "../../Vector4.js";

/** Non-generic XNA packed-vector conversion contract. */
export interface IPackedVector {
  PackFromVector4(vector: Vector4): void;
  ToVector4(): Vector4;
}
