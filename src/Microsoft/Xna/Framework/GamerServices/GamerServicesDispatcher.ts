// SPDX-License-Identifier: MS-PL

import { EventDispatcher } from "../../../../internal/events.js";
import type { EventArgs } from "../EventArgs.js";
import type { IServiceProvider, XnaEvent } from "../Contracts.js";
import { GamerServicesNotAvailableException } from "./Exceptions.js";

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

  /** Whether `Initialize` has run. */
  public static get IsInitialized(): boolean { return GamerServicesDispatcher.#isInitialized; }

  /**
   * The window gamer services draws its screens over.
   *
   * A native window handle, `IntPtr` in XNA and a `bigint` here so a 64-bit handle survives. It is
   * not a CNA handle and carries no ownership.
   */
  public static get WindowHandle(): bigint { return GamerServicesDispatcher.#windowHandle; }
  public static set WindowHandle(value: bigint) { GamerServicesDispatcher.#windowHandle = BigInt(value); }

  /** Raised while the platform installs a title update. */
  public static readonly InstallingTitleUpdate: XnaEvent<unknown, EventArgs> =
    GamerServicesDispatcher.#installingTitleUpdate;

  /** Prepares gamer services for a game that pumps them itself. */
  public static Initialize(serviceProvider: IServiceProvider): void {
    throw new GamerServicesNotAvailableException();
  }

  /** Pumps gamer services once. Must follow `Initialize`. */
  public static Update(): void {
    throw new GamerServicesNotAvailableException();
  }
}
