import { TimeSpan } from "./TimeSpan.js";

/** Immutable timing snapshot corresponding to Microsoft.Xna.Framework.GameTime. */
export class GameTime {
  readonly #totalGameTime: TimeSpan;
  readonly #elapsedGameTime: TimeSpan;
  readonly #isRunningSlowly: boolean;

  public constructor();
  public constructor(totalGameTime: TimeSpan, elapsedGameTime: TimeSpan);
  public constructor(
    totalGameTime: TimeSpan,
    elapsedGameTime: TimeSpan,
    isRunningSlowly: boolean,
  );
  public constructor(
    totalGameTime = TimeSpan.Zero,
    elapsedGameTime = TimeSpan.Zero,
    isRunningSlowly = false,
  ) {
    this.#totalGameTime = TimeSpan.FromTicks(totalGameTime.Ticks);
    this.#elapsedGameTime = TimeSpan.FromTicks(elapsedGameTime.Ticks);
    this.#isRunningSlowly = isRunningSlowly;
  }

  public get TotalGameTime(): TimeSpan {
    return this.#totalGameTime;
  }

  public get ElapsedGameTime(): TimeSpan {
    return this.#elapsedGameTime;
  }

  public get IsRunningSlowly(): boolean {
    return this.#isRunningSlowly;
  }
}
