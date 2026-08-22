import type { XnaEvent } from "./Contracts.js";
import type { EventArgs } from "./EventArgs.js";
import type { GameTime } from "./GameTime.js";

/** Draw contract used by Game's ordered managed component pipeline. */
export interface IDrawable {
  get DrawOrder(): number;
  get Visible(): boolean;
  readonly DrawOrderChanged: XnaEvent<unknown, EventArgs>;
  readonly VisibleChanged: XnaEvent<unknown, EventArgs>;
  Draw(gameTime: GameTime): void;
}
