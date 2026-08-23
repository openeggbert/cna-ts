import type { Effect } from "../Effect.js";
import type { ModelEffectCollection } from "../Model.js";

export class Enumerator {
  readonly #collection: ModelEffectCollection;
  #position = -1;

  private constructor(collection: ModelEffectCollection) { this.#collection = collection; }
  public get Current(): Effect { return this.#collection.Get(this.#position); }
  public MoveNext(): boolean {
    this.#position += 1;
    if (this.#position < this.#collection.Count) return true;
    this.#position = this.#collection.Count;
    return false;
  }
  public Dispose(): void {}
}

export function createEnumerator(collection: ModelEffectCollection): Enumerator {
  const type = Enumerator as unknown as { new (value: ModelEffectCollection): Enumerator };
  return new type(collection);
}
