import { requireNative } from "../../../runtime/index.js";
import { GameTime } from "./GameTime.js";

/** XNA game lifecycle shell. Native execution remains unavailable until a backend is loaded. */
export class Game {
  #disposed = false;
  #isMouseVisible = false;

  public async Run(): Promise<void> {
    this.#ensureActive();
    requireNative();
  }

  public Exit(): void {
    this.#ensureActive();
  }

  protected Initialize(): void | Promise<void> {}

  protected LoadContent(): void | Promise<void> {}

  protected Update(_gameTime: GameTime): void | Promise<void> {}

  protected Draw(_gameTime: GameTime): void | Promise<void> {}

  protected UnloadContent(): void | Promise<void> {}

  public get IsMouseVisible(): boolean {
    return this.#isMouseVisible;
  }

  public set IsMouseVisible(value: boolean) {
    this.#ensureActive();
    this.#isMouseVisible = value;
  }

  public Dispose(): void {
    this.#disposed = true;
  }

  #ensureActive(): void {
    if (this.#disposed) {
      throw new Error("Game is already disposed");
    }
  }
}
