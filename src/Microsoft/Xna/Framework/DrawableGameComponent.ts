import { EventDispatcher } from "../../../internal/events.js";
import type { XnaEvent } from "./Contracts.js";
import { EventArgs } from "./EventArgs.js";
import type { Game } from "./Game.js";
import { GameComponent, setGameComponentDisposalForInternalUse } from "./GameComponent.js";
import type { GameTime } from "./GameTime.js";
import type { GraphicsDevice } from "./Graphics/GraphicsDevice.js";
import type { IDrawable } from "./IDrawable.js";

/** Managed drawable component state; device access preserves the owning Game's identity. */
export class DrawableGameComponent extends GameComponent implements IDrawable {
  readonly #drawOrderChanged = new EventDispatcher<unknown, EventArgs>();
  readonly #visibleChanged = new EventDispatcher<unknown, EventArgs>();
  #drawOrder = 0;
  #visible = true;
  #contentLoaded = false;

  public readonly DrawOrderChanged: XnaEvent<unknown, EventArgs> = this.#drawOrderChanged;
  public readonly VisibleChanged: XnaEvent<unknown, EventArgs> = this.#visibleChanged;

  public constructor(game: Game) {
    super(game);
    setGameComponentDisposalForInternalUse(this, () => {
      if (!this.#contentLoaded) return;
      this.UnloadContent();
      this.#contentLoaded = false;
    });
  }

  public get DrawOrder(): number { return this.#drawOrder; }
  public set DrawOrder(value: number) {
    value = Math.trunc(value);
    if (value === this.#drawOrder) return;
    this.#drawOrder = value;
    this.OnDrawOrderChanged(this, EventArgs.Empty);
  }

  public get GraphicsDevice(): GraphicsDevice { return this.Game.GraphicsDevice; }

  public get Visible(): boolean { return this.#visible; }
  public set Visible(value: boolean) {
    value = Boolean(value);
    if (value === this.#visible) return;
    this.#visible = value;
    this.OnVisibleChanged(this, EventArgs.Empty);
  }

  public Draw(gameTime: GameTime): void { void gameTime; }

  public override Initialize(): void {
    if (!this.#contentLoaded) {
      this.LoadContent();
      this.#contentLoaded = true;
    }
  }

  protected LoadContent(): void {}
  protected UnloadContent(): void {}

  protected OnDrawOrderChanged(sender: unknown, args: EventArgs): void {
    void sender;
    this.#drawOrderChanged.Dispatch(this, args);
  }

  protected OnVisibleChanged(sender: unknown, args: EventArgs): void {
    void sender;
    this.#visibleChanged.Dispatch(this, args);
  }

}
