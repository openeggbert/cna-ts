import { TimeSpan } from "./TimeSpan.js";

/** Immutable timing snapshot corresponding to Microsoft.Xna.Framework.GameTime. */
export class GameTime {
  public readonly TotalGameTime: TimeSpan;
  public readonly ElapsedGameTime: TimeSpan;
  public readonly IsRunningSlowly: boolean;

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
    this.TotalGameTime = TimeSpan.FromTicks(totalGameTime.Ticks);
    this.ElapsedGameTime = TimeSpan.FromTicks(elapsedGameTime.Ticks);
    this.IsRunningSlowly = isRunningSlowly;
  }
}
