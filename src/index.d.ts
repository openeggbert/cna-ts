export const bindingsAvailable: boolean;

export class NativeUnavailableError extends Error {}

export class Vector2 {
  constructor(x: number, y: number);
  readonly x: number;
  readonly y: number;
  readonly lengthSquared: number;
  add(other: Vector2): Vector2;
  scale(scale: number): Vector2;
}

export class Color {
  constructor(red: number, green: number, blue: number, alpha?: number);
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
  static readonly CORNFLOWER_BLUE: Color;
  static readonly WHITE: Color;
}

export interface GameTimeOptions {
  totalMilliseconds?: number;
  elapsedMilliseconds?: number;
  runningSlowly?: boolean;
}

export class GameTime {
  constructor(value?: GameTimeOptions);
  readonly totalMilliseconds: number;
  readonly elapsedMilliseconds: number;
  readonly runningSlowly: boolean;
}

export class Game {
  run(): Promise<void>;
  exit(): void;
  protected initialize(): void | Promise<void>;
  protected loadContent(): void | Promise<void>;
  protected update(gameTime: GameTime): void | Promise<void>;
  protected draw(gameTime: GameTime): void | Promise<void>;
  protected unloadContent(): void | Promise<void>;
  dispose(): void;
}
