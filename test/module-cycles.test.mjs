// SPDX-License-Identifier: MS-PL

/**
 * The module-cycle gate, run as tests so `npm test` carries it.
 *
 * `tools/verify-module-cycles.mjs` is the same two checks and is what CI runs directly. They are
 * asserted here as well for two reasons: a defect this class is found by running the package, not
 * by a CI job someone remembers to read, and the mutation harness scores a plan from TAP counts
 * rather than from a tool's exit code -- so a rule that only ever failed a tool could never kill a
 * mutant, and `tools/mutation-plans/module-cycles.json` plants one that only this rule catches.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { checkColdImports, checkRegistries } from "../tools/verify-module-cycles.mjs";

test("no registry imports the layer it sits below at runtime", () => {
  const violations = checkRegistries();
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("every built module can be the first module a process imports", async () => {
  const cold = await checkColdImports();
  assert.ok(cold.modules > 0, "dist has no modules, so this gate would be vacuous");
  assert.deepEqual(
    cold.failures.map(([file, why]) => `${file}: ${why}`), [],
    "a module that cannot be imported first is a published subpath waiting to be added on top of it",
  );
});
