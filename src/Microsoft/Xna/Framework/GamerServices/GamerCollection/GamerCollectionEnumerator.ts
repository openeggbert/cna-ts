// SPDX-License-Identifier: MS-PL

import { gamerCollectionItemsForInternalUse } from
  "../../../../../internal/gamer-collection-registry.js";
import type { Gamer, GamerCollection } from "../Gamer.js";

/**
 * `GamerCollection<T>.GamerCollectionEnumerator`, the nested struct XNA's collection returns from
 * `GetEnumerator`.
 *
 * A CLR struct, projected as a mutable class under the package's one struct rule. Its position is
 * its own, so two enumerators over the same collection do not interfere.
 */
export class GamerCollectionEnumerator<T extends Gamer> {
  readonly #items: readonly T[];
  #position = -1;

  private constructor(items: readonly T[]) { this.#items = items; }

  /** The gamer the enumerator is on. */
  public get Current(): T { return this.#items[this.#position] as T; }

  /** Advances to the next gamer, reporting whether there was one. */
  public MoveNext(): boolean {
    if (this.#position >= this.#items.length) return false;
    this.#position += 1;
    return this.#position < this.#items.length;
  }

  /** Releases the enumerator. Walking a collection holds nothing, so this does nothing. */
  public Dispose(): void {}
}

/** Internal: makes an enumerator over a collection's backing array. */
export function createGamerCollectionEnumerator<T extends Gamer>(
  collection: GamerCollection<T>,
): GamerCollectionEnumerator<T> {
  const type = GamerCollectionEnumerator as unknown as {
    new (items: readonly T[]): GamerCollectionEnumerator<T>;
  };
  return new type(gamerCollectionItemsForInternalUse(collection));
}
