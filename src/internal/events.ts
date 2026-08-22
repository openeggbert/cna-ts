import type {
  XnaEvent,
  XnaEventHandler,
} from "../Microsoft/Xna/Framework/Contracts.js";

/** Internal multicast-event implementation with CLR-compatible ordering/removal behavior. */
export class EventDispatcher<TSender, TArgs> implements XnaEvent<TSender, TArgs> {
  readonly #handlers: XnaEventHandler<TSender, TArgs>[] = [];

  public Add(handler: XnaEventHandler<TSender, TArgs>): void {
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    this.#handlers.push(handler);
  }

  public Remove(handler: XnaEventHandler<TSender, TArgs>): boolean {
    const index = this.#handlers.lastIndexOf(handler);
    if (index < 0) return false;
    this.#handlers.splice(index, 1);
    return true;
  }

  public Dispatch(sender: TSender, args: TArgs): void {
    for (const handler of [...this.#handlers]) handler(sender, args);
  }
}
