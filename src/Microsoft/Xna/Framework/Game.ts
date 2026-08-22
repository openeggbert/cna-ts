import { requireNative } from "../../../runtime/index.js";
import type { IDisposable } from "./Contracts.js";
import { GameTime } from "./GameTime.js";

/** XNA game lifecycle shell. Native execution remains unavailable until a backend is loaded. */
export class Game implements IDisposable {
  #disposed = false;
  #isMouseVisible = false;

  public async Run(): Promise<void> {
    this.#ensureActive();
    requireNative();
  }

  public Exit(): void {
    this.#ensureActive();
  }

  protected Initialize(): void {}

  protected LoadContent(): void {}

  protected Update(gameTime: GameTime): void {
    void gameTime;
  }

  protected Draw(gameTime: GameTime): void {
    void gameTime;
  }

  protected UnloadContent(): void {}

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
