import type { Quaternion } from "./Quaternion.js";
import type { Vector3 } from "./Vector3.js";

/** Named TypeScript projection of Matrix.Decompose's CLR out parameters. */
export interface MatrixDecomposeResult {
  readonly Success: boolean;
  readonly Scale: Vector3;
  readonly Rotation: Quaternion;
  readonly Translation: Vector3;
}
