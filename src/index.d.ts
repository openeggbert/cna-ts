export class NativeUnavailableError extends Error {}

export namespace CNA {
  namespace Interop {
    const bindingsAvailable: boolean;
  }

  namespace Framework {
    class Vector2 {
      constructor(X: number, Y: number);
      readonly X: number;
      readonly Y: number;
      readonly LengthSquared: number;
      Add(other: Vector2): Vector2;
    }

    class Color {
      constructor(R: number, G: number, B: number, A?: number);
      readonly R: number;
      readonly G: number;
      readonly B: number;
      readonly A: number;
      static readonly CornflowerBlue: Color;
      static readonly White: Color;
    }

    interface GameTimeOptions {
      TotalMilliseconds?: number;
      ElapsedMilliseconds?: number;
      IsRunningSlowly?: boolean;
    }

    class GameTime {
      constructor(value?: GameTimeOptions);
      readonly TotalMilliseconds: number;
      readonly ElapsedMilliseconds: number;
      readonly IsRunningSlowly: boolean;
    }

    class Game {
      Run(): Promise<void>;
      Exit(): void;
      protected Initialize(): void | Promise<void>;
      protected LoadContent(): void | Promise<void>;
      protected Update(gameTime: GameTime): void | Promise<void>;
      protected Draw(gameTime: GameTime): void | Promise<void>;
      protected UnloadContent(): void | Promise<void>;
      Dispose(): void;
    }

    namespace Graphics {}
    namespace Input {}
    namespace Content {}
  }
}

export namespace Microsoft {
  namespace Xna {
    namespace Framework {
      type Vector2 = CNA.Framework.Vector2;
      const Vector2: typeof CNA.Framework.Vector2;
      type Color = CNA.Framework.Color;
      const Color: typeof CNA.Framework.Color;
      type GameTime = CNA.Framework.GameTime;
      const GameTime: typeof CNA.Framework.GameTime;
      type Game = CNA.Framework.Game;
      const Game: typeof CNA.Framework.Game;

      namespace Graphics {}
      namespace Input {}
      namespace Content {}
    }
  }
}
