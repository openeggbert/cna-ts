/**
 * The backing arrays of the gamer collections, held here rather than in `Gamer.ts`.
 *
 * The reason is the same one that moved the graphics device state into
 * `graphics-device-registry.ts`. `GamerCollection.GetEnumerator` needs the enumerator class, and
 * the enumerator needs the collection's items — so `Gamer.ts` imported
 * `GamerCollectionEnumerator.ts` as a value and it imported `Gamer.ts` back for
 * `gamerCollectionItemsForInternalUse`. That cycle had a module-scope read in it:
 *
 * ```ts
 *   export namespace GamerCollection {
 *     export const GamerCollectionEnumerator = NestedGamerCollectionEnumerator;
 *   }
 * ```
 *
 * which is how XNA's nested `GamerCollection<T>.GamerCollectionEnumerator` identity is attached.
 * Entered at `Gamer.ts` it evaluated; entered at `GamerCollectionEnumerator.ts` the assignment ran
 * while the enumerator class was still in its temporal dead zone and threw
 * `ReferenceError: Cannot access 'NestedGamerCollectionEnumerator' before initialization`.
 *
 * Holding the items here removes the enumerator's edge back to `Gamer.ts` entirely, so the cycle is
 * gone rather than ordered. This module imports nothing at runtime.
 *
 * The map is never written. XNA's collections are filled by the platform and never by a game, and
 * CNA publishes no signed-in gamer backend to fill them from — upstream finding 29 — so every
 * collection reads as empty. That is the shipping behaviour, not a stub: a game asking a
 * `SignedInGamerCollection` for its count on a platform with no gamer service gets zero.
 */

import type { Gamer, GamerCollection } from "../Microsoft/Xna/Framework/GamerServices/Gamer.js";

const collectionItems = new WeakMap<GamerCollection<Gamer>, readonly Gamer[]>();

/** Internal: the items one gamer collection holds. */
export function gamerCollectionItemsForInternalUse<T extends Gamer>(
  collection: GamerCollection<T>,
): readonly T[] {
  return (collectionItems.get(collection as GamerCollection<Gamer>) ?? []) as readonly T[];
}
