import { GameComponent } from "../GameComponent.js";
import type { Game } from "../Game.js";
import type { GameTime } from "../GameTime.js";

/** Historical Gamer Services lifecycle component; no replacement account service is fabricated. */
export class GamerServicesComponent extends GameComponent {
  public constructor(game: Game) { super(game); }
  public override Initialize(): void { super.Initialize(); }
  public override Update(gameTime: GameTime): void { void gameTime; }
}
