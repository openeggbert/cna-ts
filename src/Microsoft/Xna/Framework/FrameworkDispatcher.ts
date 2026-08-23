import { getBackend } from "../../../internal/backend.js";
import { pumpFrameworkServicesForInternalUse } from "../../../internal/framework-pump.js";

/** Pumps framework services when a backend provides the corresponding runtime route. */
export abstract class FrameworkDispatcher {
  private constructor() {}

  public static Update(): void {
    const backend = getBackend();
    if (backend.IsAvailable) backend.updateFrameworkDispatcher();
    pumpFrameworkServicesForInternalUse();
  }
}
