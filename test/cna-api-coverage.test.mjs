/**
 * The coverage report is only worth reading if it can be wrong. These tests plant the two
 * contradictions it exists to catch -- a route no rule claims, and a route a backend imports while
 * its family is still ruled deferred -- and prove each is reported rather than absorbed.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { BACKENDS, classify, findReachableButDeferred, run, summarize } from "../tools/cna-abi/coverage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULES = path.join(ROOT, "tools/cna-abi/coverage-rules.json");
const CNA_ROOT = path.resolve(process.env.CNA_SOURCE_PATH ?? path.join(ROOT, "../../cnanext"));
const headersPresent = fs
  .statSync(path.join(CNA_ROOT, "modules/c-api/include/CNA/C/cna.h"), { throwIfNoEntry: false })
  ?.isFile() === true;
const skip = headersPresent ? false : `canonical CNA headers not found at ${CNA_ROOT}; set CNA_SOURCE_PATH`;

const rules = JSON.parse(fs.readFileSync(RULES, "utf8"));

test("the live CNA C API is completely classified with no reachable-but-deferred route", { skip }, () => {
  const report = run({ cnaRoot: CNA_ROOT, rules: RULES, format: "json", output: null, jsonOutput: null });
  assert.deepEqual(report.unexplained, []);
  assert.deepEqual(report.reachableButDeferred, []);
  const summed = Object.values(report.totals).reduce((total, value) => total + value, 0);
  assert.equal(summed, report.totalFunctions, "every declaration lands in exactly one purpose");
  assert.deepEqual(report.backends, BACKENDS);
});

test("purpose and reachability are independent axes", { skip }, () => {
  const report = run({ cnaRoot: CNA_ROOT, rules: RULES, format: "json", output: null, jsonOutput: null });
  // The bug this replaced: an imported route was classified by the import, so every route both
  // backends reached counted as Node's alone and the WebAssembly column was zero everywhere.
  assert.ok(report.reachable.WASM > 0, "the WebAssembly backend reaches routes");
  // The browser slice is a subset of the Node adapter's: the two backends answer the same public
  // API, so a route only the browser reaches would be a route the Node consumer cannot use for the
  // same call. Node reaching more is expected; the reverse is a gap.
  assert.equal(report.reachableByAll, report.reachable.WASM, "this slice is a subset of Node's");
  assert.equal(report.reachableExclusively.WASM, 0);
  assert.equal(
    report.reachable.NODE,
    report.reachableExclusively.NODE + report.reachableByAll,
    "Node's reach splits exactly into its exclusive routes and the shared ones",
  );
  // A backend reaching a route says nothing about which purpose it serves, and both are populated.
  assert.ok(report.reachabilityByCategory.XNA_BACKING.WASM > 0);
  assert.ok(report.reachabilityByCategory.CNA_EXTENSION_BACKING.WASM > 0);
  for (const category of Object.keys(report.totals)) {
    for (const backend of BACKENDS) {
      assert.ok(
        report.reachabilityByCategory[category][backend] <= report.totals[category],
        `${category}/${backend} reach cannot exceed the category`,
      );
    }
  }
});

test("a route no rule claims is reported as UNEXPLAINED", () => {
  const declarations = new Map([["cna_invented_route_nobody_ruled", "not_a_real_header.h"]]);
  const rows = classify(declarations, rules, { NODE: new Set(), WASM: new Set() });
  const report = summarize(rows, rules);
  assert.deepEqual(report.unexplained, ["not_a_real_header.h:cna_invented_route_nobody_ruled"]);
});

test("a deferred route a backend imports is reported rather than absorbed", () => {
  // gamer_services.h is ruled INTENTIONALLY_DEFERRED as a whole family. Importing one of its
  // routes without moving the rule would publish reachable surface as unbound.
  const declarations = new Map([["cna_gamer_services_initialize", "gamer_services.h"]]);
  const deferred = classify(declarations, rules, { NODE: new Set(), WASM: new Set() });
  assert.equal(deferred[0].category, "INTENTIONALLY_DEFERRED");
  assert.deepEqual(findReachableButDeferred(deferred), []);

  const imported = classify(declarations, rules, {
    NODE: new Set(["cna_gamer_services_initialize"]),
    WASM: new Set(),
  });
  assert.equal(imported[0].category, "INTENTIONALLY_DEFERRED");
  assert.deepEqual(imported[0].backends, ["NODE"]);
  assert.deepEqual(findReachableButDeferred(imported), ["gamer_services.h:cna_gamer_services_initialize"]);
});

test("a header no backend reaches defers its whole family, and one imported route lifts it", () => {
  const declarations = new Map([
    ["cna_texture2d_create", "texture.h"],
    ["cna_texture2d_get_info", "texture.h"],
  ]);
  const unreached = classify(declarations, rules, { NODE: new Set(), WASM: new Set() });
  assert.deepEqual(unreached.map((row) => row.category), ["INTENTIONALLY_DEFERRED", "INTENTIONALLY_DEFERRED"]);

  const reached = classify(declarations, rules, { NODE: new Set(["cna_texture2d_create"]), WASM: new Set() });
  assert.deepEqual(reached.map((row) => row.category), ["XNA_BACKING", "XNA_BACKING"]);
  assert.deepEqual(reached.map((row) => row.backends), [["NODE"], []]);
});
