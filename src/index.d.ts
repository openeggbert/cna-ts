export class NativeUnavailableError extends Error {}

export const bindingsAvailable: boolean;

export namespace Microsoft {
  namespace Xna {
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
}
