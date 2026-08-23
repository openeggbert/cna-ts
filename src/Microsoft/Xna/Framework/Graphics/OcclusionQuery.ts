import { ArgumentNullException } from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import { GraphicsResource } from "./GraphicsResource.js";

export class OcclusionQuery extends GraphicsResource {
  public constructor(graphicsDevice: GraphicsDevice) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    throw new NativeUnavailableError("OcclusionQuery requires CNA query routes");
  }
  public get IsComplete(): boolean { throw new NativeUnavailableError("OcclusionQuery is unavailable"); }
  public get PixelCount(): number { throw new NativeUnavailableError("OcclusionQuery is unavailable"); }
  public Begin(): void { throw new NativeUnavailableError("OcclusionQuery.Begin requires CNA query routes"); }
  public End(): void { throw new NativeUnavailableError("OcclusionQuery.End requires CNA query routes"); }
}
