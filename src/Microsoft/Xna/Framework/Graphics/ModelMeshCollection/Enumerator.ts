import type { ModelMesh, ModelMeshCollection } from "../Model.js";

export class Enumerator {
  readonly #collection: ModelMeshCollection;
  #position = -1;

  private constructor(collection: ModelMeshCollection) { this.#collection = collection; }
  public get Current(): ModelMesh { return this.#collection.Get(this.#position); }
  public MoveNext(): boolean {
    this.#position += 1;
    if (this.#position < this.#collection.Count) return true;
    this.#position = this.#collection.Count;
    return false;
  }
  public Dispose(): void {}
}

export function createEnumerator(collection: ModelMeshCollection): Enumerator {
  const type = Enumerator as unknown as { new (value: ModelMeshCollection): Enumerator };
  return new type(collection);
}
