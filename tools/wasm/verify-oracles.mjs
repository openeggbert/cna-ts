#!/usr/bin/env node

// SPDX-License-Identifier: MS-PL
//
// Every oracle is watched by something that would notice if it stopped rejecting.
//
// This package's browser claims are all one shape: a page produces evidence, and an oracle in
// `test/support` decides whether that evidence describes a working backend. So an oracle that
// accepts anything makes its whole suite green and meaningless, and it is worth being precise
// about what "watched" means, because there are two genuinely different answers.
//
// **A rejection case.** `test/oracles.test.mjs` and `test/non-engine-oracles.test.mjs` give an
// oracle evidence with exactly one thing wrong and require it to say so. That is the only option
// for an oracle whose subject the mutation harness cannot reach -- the engine census reads
// accessors on public classes, and a mutation of the *census* is a mutation of `test/support`,
// which `dist` does not contain, so the built artifact comes out byte-identical and the harness
// rightly refuses a verdict.
//
// **A mutation plan.** Where the harness *can* reach the subject, a killed mutant is stronger
// evidence than a hand-written case: a defect was planted in production code, the package was
// rebuilt, and the oracle refused the result. An oracle imported by a suite some plan runs is
// therefore watched by that plan, and saying otherwise would demand a weaker duplicate of a check
// that already exists.
//
// What this gate refuses is the third case: an oracle exported, used, and covered by neither. It
// reports which oracles are watched by which, so the answer is a number rather than a belief.
//
//   node tools/wasm/verify-oracles.mjs

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SUPPORT = path.join(ROOT, "test/support");
const TEST_DIR = path.join(ROOT, "test");
const PLAN_DIR = path.join(ROOT, "tools/mutation-plans");

/** Every `export function assert...` in `test/support`, which is what an oracle is. */
function exportedOracles() {
  const found = new Map();
  for (const entry of fs.readdirSync(SUPPORT).sort()) {
    if (!entry.endsWith(".mjs")) continue;
    const source = fs.readFileSync(path.join(SUPPORT, entry), "utf8");
    for (const match of source.matchAll(/^export function (assert[A-Za-z0-9_]*)\s*\(/gm)) {
      found.set(match[1], entry);
    }
  }
  return found;
}

/**
 * The text of every rejection-case table, which is where an oracle is named to be broken.
 *
 * A `CASES` array is the convention both oracle suites use: one entry per defect, each returning a
 * thunk the test asserts throws. Taking the array's text rather than the file's is what makes this
 * mean "rejected" rather than "mentioned".
 */
function rejectionCases() {
  let text = "";
  let count = 0;
  for (const entry of fs.readdirSync(TEST_DIR).sort()) {
    if (!entry.endsWith(".test.mjs") && !entry.endsWith(".mjs")) continue;
    const file = path.join(TEST_DIR, entry);
    if (!fs.statSync(file).isFile()) continue;
    const source = fs.readFileSync(file, "utf8");
    const start = source.indexOf("const CASES = [");
    if (start === -1) continue;
    let index = source.indexOf("[", start), depth = 0, end = index;
    for (; index < source.length; index += 1) {
      if (source[index] === "[") depth += 1;
      else if (source[index] === "]") { depth -= 1; if (depth === 0) { end = index; break; } }
    }
    const block = source.slice(start, end);
    text += block;
    count += (block.match(/\],\s*\[/g) ?? []).length + 1;
  }
  return { text, count };
}

/** The suites the mutation plans run, taken from each plan's own command. */
function mutatedSuites() {
  const suites = new Set();
  for (const entry of fs.readdirSync(PLAN_DIR).sort()) {
    if (!entry.endsWith(".json")) continue;
    const plan = JSON.parse(fs.readFileSync(path.join(PLAN_DIR, entry), "utf8"));
    for (const match of String(plan.command ?? "").matchAll(/test\/([A-Za-z0-9._-]+\.mjs)/g)) {
      suites.add(match[1]);
    }
  }
  return suites;
}

/** Which oracles a suite imports, so a plan that runs it is watching them. */
function importedBy(suiteFile) {
  const file = path.join(TEST_DIR, suiteFile);
  if (!fs.existsSync(file)) return new Set();
  const source = fs.readFileSync(file, "utf8");
  const names = new Set();
  for (const match of source.matchAll(/\b(assert[A-Za-z0-9_]*)\s*\(/g)) names.add(match[1]);
  return names;
}

const oracles = exportedOracles();
const cases = rejectionCases();
const suites = mutatedSuites();
const watchedByMutation = new Set();
for (const suite of suites) for (const name of importedBy(suite)) watchedByMutation.add(name);

const byCase = [];
const byMutation = [];
const unwatched = [];
for (const [name, file] of oracles) {
  if (cases.text.includes(`${name}(`)) byCase.push(name);
  else if (watchedByMutation.has(name)) byMutation.push(name);
  else unwatched.push(`${file} exports ${name}`);
}

console.log(`ORACLES_EXPORTED=${oracles.size}`);
console.log(`ORACLE_REJECTION_CASES=${cases.count}`);
console.log(`ORACLES_WATCHED_BY_REJECTION=${byCase.length}`);
console.log(`ORACLES_WATCHED_BY_MUTATION=${byMutation.length}`);
console.log(`ORACLES_UNWATCHED=${unwatched.length}`);
if (cases.count === 0) {
  console.error("no rejection-case table was found; this gate would pass vacuously");
  process.exit(1);
}
for (const line of unwatched) {
  console.log(`UNWATCHED ${line} and neither a rejection case nor a mutation plan reaches it`);
}
process.exit(unwatched.length === 0 ? 0 : 1);
