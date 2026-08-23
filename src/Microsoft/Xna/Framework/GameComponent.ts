import { EventDispatcher } from "../../../internal/events.js";
import type { IDisposable, XnaEvent } from "./Contracts.js";
import { EventArgs } from "./EventArgs.js";
import type { Game } from "./Game.js";
import type { GameTime } from "./GameTime.js";
import type { IGameComponent } from "./IGameComponent.js";
import type { IUpdateable } from "./IUpdateable.js";

const disposalCallbacks = new WeakMap<GameComponent, () => void>();

/** Backend-independent XNA game component with managed events and ordering state. */
export class GameComponent implements IGameComponent, IUpdateable, IDisposable {
  readonly #game: Game;
  readonly #enabledChanged = new EventDispatcher<unknown, EventArgs>();
  readonly #updateOrderChanged = new EventDispatcher<unknown, EventArgs>();
  readonly #disposed = new EventDispatcher<unknown, EventArgs>();
  #enabled = true;
  #updateOrder = 0;

  public readonly EnabledChanged: XnaEvent<unknown, EventArgs> = this.#enabledChanged;
  public readonly UpdateOrderChanged: XnaEvent<unknown, EventArgs> = this.#updateOrderChanged;
  public readonly Disposed: XnaEvent<unknown, EventArgs> = this.#disposed;

  public constructor(game: Game) {
    this.#game = game;
  }

  public get Enabled(): boolean { return this.#enabled; }
  public set Enabled(value: boolean) {
    value = Boolean(value);
    if (this.#enabled === value) return;
    this.#enabled = value;
    this.OnEnabledChanged(this, EventArgs.Empty);
  }

  public get UpdateOrder(): number { return this.#updateOrder; }
  public set UpdateOrder(value: number) {
    value = Math.trunc(value);
    if (this.#updateOrder === value) return;
    this.#updateOrder = value;
    this.OnUpdateOrderChanged(this, EventArgs.Empty);
  }

  public get Game(): Game { return this.#game; }

  public Initialize(): void {}

  public Update(gameTime: GameTime): void { void gameTime; }

  public Dispose(): void {
    disposalCallbacks.get(this)?.();
    disposalCallbacks.delete(this);
    this.#game?.Components.Remove(this);
    this.#disposed.Dispatch(this, EventArgs.Empty);
  }

  protected OnEnabledChanged(sender: unknown, args: EventArgs): void {
    void sender;
    this.#enabledChanged.Dispatch(this, args);
  }

  protected OnUpdateOrderChanged(sender: unknown, args: EventArgs): void {
    void sender;
    this.#updateOrderChanged.Dispatch(this, args);
  }
}

export function setGameComponentDisposalForInternalUse(
  component: GameComponent,
  callback: () => void,
): void {
  disposalCallbacks.set(component, callback);
}
