import type { XnaEvent } from "./Contracts.js";
import type { EventArgs } from "./EventArgs.js";
import type { GameTime } from "./GameTime.js";

/** Update contract used by Game's ordered managed component pipeline. */
export interface IUpdateable {
  get Enabled(): boolean;
  get UpdateOrder(): number;
  readonly EnabledChanged: XnaEvent<unknown, EventArgs>;
  readonly UpdateOrderChanged: XnaEvent<unknown, EventArgs>;
  Update(gameTime: GameTime): void;
}
