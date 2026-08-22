import { EventArgs } from "./EventArgs.js";
import type { IGameComponent } from "./IGameComponent.js";

/** Event data for GameComponentCollection mutations. */
export class GameComponentCollectionEventArgs extends EventArgs {
  readonly #gameComponent: IGameComponent;

  public constructor(gameComponent: IGameComponent) {
    super();
    this.#gameComponent = gameComponent;
  }

  public get GameComponent(): IGameComponent { return this.#gameComponent; }
}
