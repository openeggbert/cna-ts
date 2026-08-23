import type { ModelBone, ModelBoneCollection } from "../Model.js";

export class Enumerator {
  readonly #collection: ModelBoneCollection;
  #position = -1;

  private constructor(collection: ModelBoneCollection) { this.#collection = collection; }
  public get Current(): ModelBone { return this.#collection.Get(this.#position); }
  public MoveNext(): boolean {
    this.#position += 1;
    if (this.#position < this.#collection.Count) return true;
    this.#position = this.#collection.Count;
    return false;
  }
  public Dispose(): void {}
}

export function createEnumerator(collection: ModelBoneCollection): Enumerator {
  const type = Enumerator as unknown as { new (value: ModelBoneCollection): Enumerator };
  return new type(collection);
}
