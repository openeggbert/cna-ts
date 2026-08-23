import type { ModelMeshPart, ModelMeshPartCollection } from "../Model.js";

export class Enumerator {
  readonly #collection: ModelMeshPartCollection;
  #position = -1;

  private constructor(collection: ModelMeshPartCollection) { this.#collection = collection; }
  public get Current(): ModelMeshPart { return this.#collection.Get(this.#position); }
  public MoveNext(): boolean {
    this.#position += 1;
    if (this.#position < this.#collection.Count) return true;
    this.#position = this.#collection.Count;
    return false;
  }
  public Dispose(): void {}
}

export function createEnumerator(collection: ModelMeshPartCollection): Enumerator {
  const type = Enumerator as unknown as { new (value: ModelMeshPartCollection): Enumerator };
  return new type(collection);
}
