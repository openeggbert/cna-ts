import {
  ArgumentException,
  ArgumentNullException,
} from "../../../internal/exceptions.js";
import type { IServiceProvider, XnaType } from "./Contracts.js";

/** Type-token service container corresponding to XNA GameServiceContainer. */
export class GameServiceContainer implements IServiceProvider {
  readonly #services = new Map<XnaType<unknown>, unknown>();

  public constructor() {}

  public AddService(type: XnaType<unknown>, provider: unknown): void {
    if (type == null) throw new ArgumentNullException("type cannot be null");
    if (provider == null) throw new ArgumentNullException("provider cannot be null");
    if (this.#services.has(type)) throw new ArgumentException("A provider for this service type is already present");
    if (typeof type !== "function" || !Function.prototype[Symbol.hasInstance].call(type, provider)) {
      throw new ArgumentException("The provider must be assignable to the service type");
    }
    this.#services.set(type, provider);
  }

  public GetService(type: XnaType<unknown>): unknown {
    if (type == null) throw new ArgumentNullException("type cannot be null");
    return this.#services.get(type) ?? null;
  }

  public RemoveService(type: XnaType<unknown>): void {
    if (type == null) throw new ArgumentNullException("type cannot be null");
    this.#services.delete(type);
  }
}
