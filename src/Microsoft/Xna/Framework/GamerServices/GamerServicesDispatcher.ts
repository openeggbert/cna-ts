// SPDX-License-Identifier: MS-PL

import { getBackend } from "../../../../internal/backend.js";
import type { CnaGamerServicesBackend } from "../../../../internal/backend.js";
import { EventDispatcher } from "../../../../internal/events.js";
import type { EventArgs } from "../EventArgs.js";
import type { IServiceProvider, XnaEvent } from "../Contracts.js";
import { ArgumentNullException, InvalidOperationException } from "../../../../internal/exceptions.js";
import { GamerServicesNotAvailableException } from "./Exceptions.js";

/**
 * The gamer-services state CNA holds, when a backend is loaded.
 *
 * Without one there is nothing behind these members but managed defaults, which is exactly what a
 * backendless `GamerServicesDispatcher` should be: no platform, no pump, and `Update` refusing the
 * way XNA refuses on a machine with no gamer services.
 */
function services(): CnaGamerServicesBackend | undefined {
  return getBackend().GamerServices;
}

/**
 * The pump gamer services needs when a game drives it directly rather than through
 * `GamerServicesComponent`.
 *
 * A static class in XNA and a static class here. `Update` before `Initialize` is the mistake this
 * type exists to catch, and it catches it the way XNA does.
 */
export abstract class GamerServicesDispatcher {
  static #isInitialized = false;
  static #windowHandle = 0n;
  static readonly #installingTitleUpdate = new EventDispatcher<unknown, EventArgs>();

  /**
   * Whether `Initialize` has run.
   *
   * Read from CNA where a backend is loaded, so a native gamer-services component and this class
   * see one truth rather than two that can disagree.
   */
  public static get IsInitialized(): boolean {
    return services()?.getGamerServicesIsInitialized() ?? GamerServicesDispatcher.#isInitialized;
  }

  /**
   * The window gamer services draws its screens over.
   *
   * A native window handle, `IntPtr` in XNA and a `bigint` here so a 64-bit handle survives. It is
   * not a CNA handle and carries no ownership.
   */
  public static get WindowHandle(): bigint {
    return services()?.getGamerServicesWindowHandle() ?? GamerServicesDispatcher.#windowHandle;
  }
  public static set WindowHandle(value: bigint) {
    const handle = BigInt(value);
    GamerServicesDispatcher.#windowHandle = handle;
    // CNA stores it verbatim without interpreting it, which is what XNA does too; it is a platform
    // window handle rather than a CNA handle, and nothing in either runtime dereferences it.
    services()?.setGamerServicesWindowHandle(handle);
  }

  /** Raised while the platform installs a title update. */
  public static readonly InstallingTitleUpdate: XnaEvent<unknown, EventArgs> =
    GamerServicesDispatcher.#installingTitleUpdate;

  /**
   * Prepares gamer services for a game that pumps them itself.
   *
   * With a CNA backend this initialises CNA's own dispatcher against the running game, which is
   * what a native gamer-services component would do. With no backend there is no platform to
   * initialise and it refuses the way XNA does on a machine without gamer services.
   */
  public static Initialize(serviceProvider: IServiceProvider): void {
    if (serviceProvider == null) throw new ArgumentNullException("serviceProvider");
    const backend = services();
    if (!backend) throw new GamerServicesNotAvailableException();
    backend.initializeGamerServices();
    GamerServicesDispatcher.#isInitialized = true;
  }

  /**
   * Pumps gamer services once. Must follow `Initialize`.
   *
   * XNA refuses an un-initialised pump with an `InvalidOperationException`, and **CNA does not** --
   * measured, not assumed: `cna_gamer_services_dispatcher_update` succeeds before
   * `cna_gamer_services_dispatcher_initialize` has run. So the guard lives here, which is where a
   * projection's job is anyway: CNA is a runtime for several bindings and need not enforce one
   * framework's ordering rule, but a game written against XNA must get XNA's answer.
   */
  public static Update(): void {
    const backend = services();
    if (!backend) throw new GamerServicesNotAvailableException();
    if (!backend.getGamerServicesIsInitialized()) {
      throw new InvalidOperationException("GamerServicesDispatcher.Initialize has not been called");
    }
    backend.updateGamerServices();
  }
}
