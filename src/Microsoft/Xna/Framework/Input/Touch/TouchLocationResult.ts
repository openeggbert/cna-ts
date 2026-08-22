import type { TouchLocation } from "./TouchValues.js";

/** Named TypeScript projection of an XNA touch out parameter. */
export interface TouchLocationResult {
  readonly Success: boolean;
  readonly Value: TouchLocation;
}
