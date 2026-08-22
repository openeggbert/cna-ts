import { KeyState, Keys } from "./Enums.js";

const validKeyMasks = new Uint32Array(8);
for (const value of Object.values(Keys)) {
  if (typeof value !== "number") continue;
  const word = value >> 5;
  if (word >= 0 && word < 8) validKeyMasks[word] |= 1 << (value & 31);
}
/** Immutable 256-bit XNA keyboard snapshot. */
export class KeyboardState {
  readonly #words = new Uint32Array(8);

  public constructor(keys: Keys[]) {
    if (keys == null) return;
    for (const key of keys) {
      const value = Math.trunc(key);
      const word = value >> 5;
      if (word < 0 || word >= 8) continue;
      this.#words[word] |= (1 << (value & 31)) & validKeyMasks[word];
    }
  }

  public Equals(obj: unknown): boolean {
    if (!(obj instanceof KeyboardState)) return false;
    for (let index = 0; index < 8; index += 1) {
      if (this.#words[index] !== obj.#words[index]) return false;
    }
    return true;
  }

  public GetHashCode(): number {
    let result = 0;
    for (const word of this.#words) result = (result ^ word) | 0;
    return result;
  }

  public GetPressedKeys(): Keys[] {
    const result: Keys[] = [];
    for (let value = 0; value < 256; value += 1) {
      if (this.IsKeyDown(value as Keys)) result.push(value as Keys);
    }
    return result;
  }

  public IsKeyDown(key: Keys): boolean {
    const value = Math.trunc(key);
    const word = value >> 5;
    if (word < 0 || word >= 8) return false;
    return (this.#words[word] & (1 << (value & 31))) !== 0;
  }

  public IsKeyUp(key: Keys): boolean { return !this.IsKeyDown(key); }

  public Get(key: Keys): KeyState {
    return this.IsKeyDown(key) ? KeyState.Down : KeyState.Up;
  }
}
