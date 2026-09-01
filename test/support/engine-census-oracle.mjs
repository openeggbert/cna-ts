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

/**
 * Every field of the largest structure in the layer, asked of CNA one at a time.
 *
 * The census above proves that accessors marshal. It cannot see a *field* dropped inside a
 * structure: a material whose alpha never reaches CNA still round-trips through a getter that
 * never reads the alpha either, because both halves of the round trip are the binding's.
 *
 * CNA's own comparison can see it. Take CNA's defaults, change one field, and ask CNA whether the
 * two materials are still equal -- if they are, that field never arrived. Nineteen fields, nineteen
 * questions, and a marshaller that drops any one of them fails on exactly that one.
 *
 * `GetHashCode` is asked as a second route over the same bytes. `ToText` is recorded but not
 * required: CNA's own text omits several fields, so two materials it calls unequal can describe
 * themselves identically, and requiring otherwise would be asserting against CNA rather than with
 * it.
 */
export function assertStructureFields(evidence) {
  assert.equal(
    evidence.evidenceError ?? null, null,
    `the structure-field evidence failed: ${evidence.evidenceStack ?? ""}`,
  );
  assert.ok(evidence.equalsItself, "a material equals itself");
  assert.ok(evidence.equalsFreshCopy, "and equals a separately created copy of CNA's defaults");
  assert.ok(evidence.hashOfCopiesAgree, "which hash alike, so the hash is over the values");

  // CNA's own defaults, which the changes below are all read against.
  assert.equal(evidence.defaults.alphaCutoff, 0.5, "CNA's default alpha cutoff");
  assert.equal(evidence.defaults.metallic, 1, "CNA's default metallic factor");
  assert.equal(evidence.defaults.roughness, 1, "CNA's default roughness factor");
  assert.equal(
    evidence.defaults.transforms, 7,
    "one texture transform per slot, read as an array of structures",
  );
  assert.deepEqual(
    evidence.defaults.coordinateSets, [0, 0, 0, 0, 0, 0, 0],
    "one texture-coordinate set per slot, read at a four-byte stride",
  );

  assert.ok(evidence.fields.length >= 19, `every field is asked (${evidence.fields.length})`);
  for (const [name, equal, hashEqual] of evidence.fields) {
    assert.notEqual(equal, "threw", `${name} could not be set: ${hashEqual}`);
    assert.equal(
      equal, false,
      `changing ${name} must change the material CNA sees; CNA still calls the two equal, so ` +
      "that field does not reach it",
    );
    assert.equal(
      hashEqual, false,
      `and must change its hash; ${name} hashes identically after being changed`,
    );
  }
  return { fields: evidence.fields.length };
}

/**
 * The structures whose contents no accessor reads back, proved by what CNA does with them.
 *
 * Four shapes cross this boundary nested inside something else, and each fails in a way the census
 * cannot see, because for three of them nothing reads the value back at all:
 *
 *   - a `CNA_BoundingBox` **written** as two vectors, where writing one leaves the maximum at
 *     whatever the allocation held. Read by CNA's frustum test, which is the only thing that uses
 *     both corners: a box nine hundred units off the origin is outside the frustum, and the same
 *     box with its maximum collapsed to zero spans the camera.
 *   - a `CNA_Vector4` **read** out of a structure, whose fourth component a three-component read
 *     drops. glTF's own default base colour is opaque white, so W is one.
 *   - a `CNA_Handle[7]` read at the eight-byte stride a handle takes rather than the four a wasm32
 *     pointer takes, which turns fifty-six bytes into thirteen slots instead of seven.
 *   - a texture slot read through a route with *two* outputs, where taking the handle without
 *     asking whether there is one answers with whatever the allocation held. The binding poisons
 *     the handle first, so that value is one CNA cannot issue rather than a zero that looks
 *     exactly like a correct absence.
 */
export function assertNestedStructures(evidence) {
  assert.equal(evidence.gltfError ?? null, null, `the glTF source failed: ${evidence.gltfError}`);
  assert.equal(evidence.cullerError ?? null, null, `the culler failed: ${evidence.cullerError}`);
  assert.equal(evidence.slotError ?? null, null, `the texture slot failed: ${evidence.slotError}`);
  assert.equal(
    evidence.gltfSlotError ?? null, null, `the glTF slots failed: ${evidence.gltfSlotError}`,
  );

  // A `CNA_Vector4` nested in a structure, whose W is the component a short read drops.
  assert.deepEqual(
    evidence.gltfBaseColor, [1, 1, 1, 1],
    "glTF's default base colour is opaque white, so its fourth component is one and not zero",
  );
  assert.deepEqual(
    evidence.gltfCoordinateSets, [0, 0, 0, 0, 0, 0, 0],
    "and its texture-coordinate sets are seven zeroes",
  );
  assert.equal(evidence.gltfTransformCount, 7, "with one transform per slot");

  // A `CNA_Handle[7]`, whose stride is the handle's and not the pointer's.
  assert.equal(
    evidence.gltfSlotCount, 7,
    "seven texture slots; thirteen would be the same bytes walked at a wasm32 pointer's stride",
  );

  // A `CNA_BoundingBox` written whole, read by CNA's frustum test.
  assert.equal(evidence.nearVisible, true, "a box in front of the camera is visible");
  assert.equal(
    evidence.farVisible, false,
    "a box nine hundred units away is not -- unless its maximum was never written, which stretches " +
    "it back to the origin, where the camera is",
  );
  assert.equal(
    evidence.farNegativeVisible, false,
    "and the same box mirrored is not either, so the answer is not a sign test on one corner",
  );

  // A slot with two outputs, the handle poisoned before the call.
  assert.equal(evidence.emptySlot, "0", "an empty slot reads as no handle");
  assert.equal(
    evidence.filledSlotIsPoison, false,
    "a filled slot does not read back the poison, so CNA wrote the handle output",
  );
  assert.equal(evidence.filledSlotIsZero, false, "and does not read back as empty");
  assert.equal(
    evidence.clearedSlot, "0",
    "a slot cleared after being filled reads as no handle again, rather than as the handle it held",
  );

  // CNA's own refusal, recorded rather than required.
  assert.equal(
    evidence.gpuCullerSupported, false,
    "the GPU instance culler needs a compute stage this renderer has not got",
  );
  assert.match(
    evidence.gpuCullerReason ?? "", /compute/i,
    "and says so in CNA's own words",
  );
  return { boundsTested: 3, slotsTested: 4 };
}
