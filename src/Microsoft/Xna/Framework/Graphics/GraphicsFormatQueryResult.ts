import type { DepthFormat, SurfaceFormat } from "./DeviceEnums.js";

/** Named output projection for XNA adapter format queries. */
export interface GraphicsFormatQueryResult {
  readonly Success: boolean;
  readonly Format: SurfaceFormat;
  readonly DepthFormat: DepthFormat;
  readonly MultiSampleCount: number;
}
