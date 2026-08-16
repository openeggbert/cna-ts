import { requireNative } from "../../../internal/native.js";
export * as Graphics from "./Graphics/index.js";
export * as Input from "./Input/index.js";
export * as Content from "./Content/index.js";

/** Microsoft.Xna.Framework two-dimensional vector. */
export class Vector2 {
  constructor(X, Y) {
    this.X = X;
    this.Y = Y;
    Object.freeze(this);
  }

  Add(other) {
    return new Vector2(this.X + other.X, this.Y + other.Y);
  }

  get LengthSquared() {
    return this.X * this.X + this.Y * this.Y;
  }
}

/** Microsoft.Xna.Framework non-premultiplied RGBA color. */
export class Color {
  constructor(R, G, B, A = 255) {
    for (const [name, value] of Object.entries({ R, G, B, A })) {
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new RangeError(`${name} must be an integer between 0 and 255`);
      }
    }
    this.R = R;
    this.G = G;
    this.B = B;
    this.A = A;
    Object.freeze(this);
  }

  static CornflowerBlue = new Color(100, 149, 237, 255);
  static White = new Color(255, 255, 255, 255);
}

/** Microsoft.Xna.Framework timing snapshot. */
export class GameTime {
  constructor({
    TotalMilliseconds = 0,
    ElapsedMilliseconds = 0,
    IsRunningSlowly = false,
  } = {}) {
    this.TotalMilliseconds = TotalMilliseconds;
    this.ElapsedMilliseconds = ElapsedMilliseconds;
    this.IsRunningSlowly = IsRunningSlowly;
    Object.freeze(this);
  }
}

/** Microsoft.Xna.Framework game lifecycle backed by CNA. */
export class Game {
  #disposed = false;

  async Run() {
    this.#ensureActive();
    requireNative();
  }

  Exit() {
    this.#ensureActive();
  }

  Initialize() {}

  LoadContent() {}

  Update(gameTime) {}

  Draw(gameTime) {}

  UnloadContent() {}

  get Content() { return null; }
  get GraphicsDevice() { return null; }
  set IsMouseVisible(value) {}

  Dispose() {
    this.#disposed = true;
  }

  #ensureActive() {
    if (this.#disposed) {
      throw new Error("Game is already disposed");
    }
  }
}
