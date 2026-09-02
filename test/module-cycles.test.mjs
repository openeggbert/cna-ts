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

import {
  checkColdImports,
  checkRegistries,
  checkTestDeepImports,
  deepImportFailuresIn,
} from "../tools/verify-module-cycles.mjs";

test("no registry imports the layer it sits below at runtime", () => {
  const violations = checkRegistries();
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("every dist module a test or a page names by hand still has what it asks for", async () => {
  // The suites and the browser pages reach past the exports map into internal modules on purpose,
  // and nothing typechecks them. Moving one internal export broke two of them in this session
  // while `npm test`, `npm run check`, `verify:leaks` and `verify:package` were all green.
  const broken = await checkTestDeepImports();
  assert.deepEqual(broken, [], broken.join("\n"));
});

test("and the rule that says so refuses a page that asks for an export that moved", async () => {
  // A rejection case rather than a mutant, and deliberately so: the mutation harness scores by
  // rebuilding `dist` and refuses a verdict when the artifact is byte-identical, which is what a
  // defect in a test page produces. So the rule is given evidence with exactly one thing wrong.
  const asksForAMovedExport = await deepImportFailuresIn([{
    file: "test/wasm/a-page-that-does-not-exist.html",
    text: `const { resolveGraphicsDeviceHandleForInternalUse } =\n` +
      `  await import("/cna-ts/Microsoft/Xna/Framework/Graphics/GraphicsDevice.js");`,
  }]);
  assert.equal(asksForAMovedExport.length, 1, "one broken binding, one complaint");
  assert.match(asksForAMovedExport[0], /has no export "resolveGraphicsDeviceHandleForInternalUse"/);
  assert.match(asksForAMovedExport[0], /a-page-that-does-not-exist\.html/);

  const namesAModuleThatWasNeverBuilt = await deepImportFailuresIn([{
    file: "test/a-suite-that-does-not-exist.mjs",
    text: `import { anything } from "../dist/internal/no-such-registry.js";`,
  }]);
  assert.equal(namesAModuleThatWasNeverBuilt.length, 1);
  assert.match(namesAModuleThatWasNeverBuilt[0], /was not built/);

  // And the same shape with nothing wrong is accepted, so the rule is not simply always angry.
  assert.deepEqual(await deepImportFailuresIn([{
    file: "test/a-correct-suite.mjs",
    text: `import { resolveGraphicsDeviceHandleForInternalUse } from\n` +
      `  "../dist/internal/graphics-device-registry.js";`,
  }]), []);
});

test("every built module can be the first module a process imports", async () => {
  const cold = await checkColdImports();
  assert.ok(cold.modules > 0, "dist has no modules, so this gate would be vacuous");
  assert.deepEqual(
    cold.failures.map(([file, why]) => `${file}: ${why}`), [],
    "a module that cannot be imported first is a published subpath waiting to be added on top of it",
  );
});
