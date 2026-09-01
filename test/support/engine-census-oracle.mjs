// SPDX-License-Identifier: MS-PL

/**
 * The engine layer, class by class, as a reachability census.
 *
 * The other oracles prove particular families against arithmetic. This one proves something
 * broader and shallower, and it is the only kind of evidence that scales to a slice this size:
 * that **every** public engine class this backend binds can be constructed, that every accessor on
 * it can be read, and that every settable one survives a write.
 *
 * A slice of nine hundred routes fails in ways no scenario reaches -- a field read four bytes off,
 * an enumeration read as a signed integer, a growable structure whose `struct_size` was never
 * written, a `uint64_t` parameter handed a `Number`. Those show up here as a getter that throws, a
 * value that does not survive its own round trip, or a class that will not construct.
 *
 * They are not hypothetical. This census found four real defects on its first run:
 *
 *   - a `StorageBuffer` whose size reached CNA as a `Number` where the route takes a `uint64_t`;
 *   - three counted `int32_t` array copies read through the *matrix* reader, because their
 *     TypeScript answer is `readonly number[]` and so is a matrix's;
 *   - a settings block normalised through a two-structure call where CNA edits one in place;
 *   - a Hammersley point read as one `CNA_Vector2` where the route writes two separate floats.
 *
 * The last three were then found statically as well, by `tools/wasm/verify-route-calls.mjs`, which
 * this census is the reason for.
 *
 * What is **not** claimed here is semantics. A class that constructs and round-trips is a class
 * whose marshalling works; whether its shader draws the right thing is a question for the family
 * oracles beside this one, and `docs/wasm-backend.md` says which families have that and which have
 * only this.
 */

import assert from "node:assert/strict";

/**
 * The classes CNA refuses on a renderer without compute, with the result code it refuses with.
 *
 * `CNA_RESULT_NOT_SUPPORTED` is 6. These are not gaps in the binding: the routes are bound, they
 * are reached, and CNA answers that this context has no compute stage -- which is a fact about
 * WebGL 2.0 that no build option changes.
 */
const COMPUTE_DEPENDENT = new Set(["AutoExposure", "StorageBuffer", "StorageBufferTyped"]);

/**
 * Asserts the census.
 *
 * `computeOnly` is what a strong-artifact run requires: that the *only* classes CNA refuses are
 * the ones needing a compute stage. An artifact built without `CNA_CNAEXT` refuses most of the
 * layer instead -- with the same `NOT_SUPPORTED` and a different sentence -- and the ordinary
 * suite records that rather than requiring it, because which artifact a consumer built is theirs
 * to decide. Both runs require every refusal to be **CNA's**, never the binding's.
 */
export function assertEngineCensus(census, { computeOnly = true } = {}) {
  assert.equal(
    census.censusError ?? null, null,
    `the census itself failed: ${census.stack ?? ""}`,
  );
  assert.ok(census.rows.length >= 20, `the census covers the engine layer (${census.rows.length})`);

  let read = 0, wrote = 0, roundTripped = 0, refused = 0;
  for (const row of census.rows) {
    if (!row.constructed) {
      if (computeOnly) {
        assert.ok(
          COMPUTE_DEPENDENT.has(row.name),
          `${row.name} would not construct and is not one of the compute-dependent classes: ` +
          `${row.error}`,
        );
      }
      assert.equal(
        row.cnaResult, 6,
        `${row.name} must be refused by CNA's own NOT_SUPPORTED rather than by the binding: ` +
        `${row.error}`,
      );
      refused += 1;
      continue;
    }
    assert.deepEqual(
      row.failures, [],
      `${row.name} has members that do not marshal: ${row.failures.join("; ")}`,
    );
    read += row.read;
    wrote += row.wrote;
    roundTripped += row.roundTripped;
  }

  if (computeOnly) {
    // The compute-dependent classes are refused, and nothing else is.
    assert.equal(
      refused, COMPUTE_DEPENDENT.size,
      "exactly the compute-dependent classes are refused on this renderer",
    );
    // And the census actually exercised something: a run that constructed everything and read
    // nothing would satisfy every assertion above.
    assert.ok(read >= 50, `the census read at least fifty accessors (${read})`);
    assert.ok(wrote >= 15, `and wrote at least fifteen (${wrote})`);
    assert.ok(
      roundTripped > 0 && roundTripped <= wrote,
      `and some of those survived unchanged (${roundTripped} of ${wrote})`,
    );
  }
  return { classes: census.rows.length, read, wrote, roundTripped, refused };
}
