import type { TouchCollection } from "../TouchCollection.js";
import type { TouchLocation } from "../TouchValues.js";

/** XNA's value enumerator for a TouchCollection snapshot. */
export class Enumerator {
  readonly #collection: TouchCollection;
  #position = -1;

  private constructor(collection: TouchCollection) { this.#collection = collection; }

  public get Current(): TouchLocation { return this.#collection.Get(this.#position); }

  public MoveNext(): boolean {
    this.#position += 1;
    if (this.#position < this.#collection.Count) return true;
    this.#position = this.#collection.Count;
    return false;
  }

  public Dispose(): void {}
}

export function createEnumerator(collection: TouchCollection): Enumerator {
  const Constructor = Enumerator as unknown as { new (value: TouchCollection): Enumerator };
  return new Constructor(collection);
}
