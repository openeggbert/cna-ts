#!/usr/bin/env node

/**
 * Checks that every mutant in every plan still names code that exists, exactly once.
 *
 * A mutation plan is only evidence while its anchors match. When the code moves under one — a
 * refactor renaming `this.#routes` to `this.routes`, a family split out into its own file — the
 * harness refuses that mutant and reports `ANCHOR x0`, which is the correct refusal but arrives
 * only when someone runs the plan, and plans are slow enough that nobody runs them often. Between
 * the refactor and that run, the mutant is silently not testing anything while the plan still
 * claims to cover it.
 *
 * That happened here: one refactor left 12 of 29 anchors stale in a single plan and 5 more across
 * two others — 17 mutants, a seventh of the whole suite, quietly measuring nothing. This is the
 * check that catches it in a second rather than in an hour, and it runs with the other static
 * gates.
 *
 *   node tools/mutation-plans/check-anchors.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PLANS = path.join(ROOT, "tools/mutation-plans");

let mutants = 0;
const problems = [];
const plans = fs.readdirSync(PLANS).filter((entry) => entry.endsWith(".json")).sort();
for (const entry of plans) {
  const plan = JSON.parse(fs.readFileSync(path.join(PLANS, entry), "utf8"));
  for (const mutant of plan.mutants ?? []) {
    mutants += 1;
    const file = path.join(ROOT, mutant.file);
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      problems.push({ plan: entry, id: mutant.id, detail: `no such file: ${mutant.file}` });
      continue;
    }
    const source = fs.readFileSync(file, "utf8");
    const found = source.split(mutant.find).length - 1;
    if (found !== 1) {
      problems.push({
        plan: entry, id: mutant.id,
        detail: `anchor matches ${found} times in ${mutant.file} (must be exactly once)`,
      });
      continue;
    }
    // A replacement identical to the anchor plants nothing, which would look like a surviving
    // mutant rather than a broken one.
    if (mutant.replace === mutant.find) {
      problems.push({ plan: entry, id: mutant.id, detail: "replacement is identical to the anchor" });
    }
  }
}

console.log(`MUTATION_PLANS=${plans.length}`);
console.log(`MUTATION_PLAN_MUTANTS=${mutants}`);
console.log(`MUTATION_PLAN_STALE_ANCHORS=${problems.length}`);
for (const problem of problems) console.log(`STALE ${problem.plan} ${problem.id}: ${problem.detail}`);
process.exit(problems.length === 0 ? 0 : 1);
