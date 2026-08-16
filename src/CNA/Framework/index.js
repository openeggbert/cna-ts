import {
  NativeUnavailableError,
  requireNative,
} from "../../internal/native.js";

export { NativeUnavailableError };
export * as Graphics from "./Graphics/index.js";
export * as Input from "./Input/index.js";
export * as Content from "./Content/index.js";

/** CNA.Framework two-dimensional vector. */
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

/** CNA.Framework non-premultiplied RGBA color. */
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

/** CNA.Framework timing snapshot. */
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

/** CNA.Framework game lifecycle base class. */
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

  Dispose() {
    this.#disposed = true;
  }

  #ensureActive() {
    if (this.#disposed) {
      throw new Error("Game is already disposed");
    }
  }
}
