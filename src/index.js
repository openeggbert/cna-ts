import {
  bindingsAvailable,
  NativeUnavailableError,
  requireNative,
} from "./internal/native.js";

export { bindingsAvailable, NativeUnavailableError };

/** A two-dimensional vector implemented entirely in JavaScript. */
export class Vector2 {
  /** @param {number} x @param {number} y */
  constructor(x, y) {
    this.x = x;
    this.y = y;
    Object.freeze(this);
  }

  /** @param {Vector2} other @returns {Vector2} */
  add(other) {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  /** @param {number} scale @returns {Vector2} */
  scale(scale) {
    return new Vector2(this.x * scale, this.y * scale);
  }

  /** @returns {number} */
  get lengthSquared() {
    return this.x * this.x + this.y * this.y;
  }
}

/** A non-premultiplied color with unsigned-byte RGBA channels. */
export class Color {
  /**
   * @param {number} red
   * @param {number} green
   * @param {number} blue
   * @param {number} [alpha]
   */
  constructor(red, green, blue, alpha = 255) {
    for (const [name, value] of Object.entries({ red, green, blue, alpha })) {
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new RangeError(`${name} must be an integer between 0 and 255`);
      }
    }
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.alpha = alpha;
    Object.freeze(this);
  }

  static CORNFLOWER_BLUE = new Color(100, 149, 237, 255);
  static WHITE = new Color(255, 255, 255, 255);
}

/** Timing information supplied to one update or draw callback. */
export class GameTime {
  /**
   * @param {object} [value]
   * @param {number} [value.totalMilliseconds]
   * @param {number} [value.elapsedMilliseconds]
   * @param {boolean} [value.runningSlowly]
   */
  constructor({
    totalMilliseconds = 0,
    elapsedMilliseconds = 0,
    runningSlowly = false,
  } = {}) {
    this.totalMilliseconds = totalMilliseconds;
    this.elapsedMilliseconds = elapsedMilliseconds;
    this.runningSlowly = runningSlowly;
    Object.freeze(this);
  }
}

/** Base class for CNA games. */
export class Game {
  #disposed = false;

  /** Run CNA's asynchronous browser/native game loop. */
  async run() {
    this.#ensureActive();
    requireNative();
  }

  /** Request normal game-loop termination. */
  exit() {
    this.#ensureActive();
  }

  /** Initialize game-owned state. */
  initialize() {}

  /** Load game content. */
  loadContent() {}

  /** @param {GameTime} gameTime */
  update(gameTime) {}

  /** @param {GameTime} gameTime */
  draw(gameTime) {}

  /** Release game-owned content during shutdown. */
  unloadContent() {}

  /** Release the future native game handle; repeated calls are harmless. */
  dispose() {
    this.#disposed = true;
  }

  #ensureActive() {
    if (this.#disposed) {
      throw new Error("Game is already disposed");
    }
  }
}
