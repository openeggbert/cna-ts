// SPDX-License-Identifier: MS-PL

/**
 * A suite that is optional for a developer and mandatory for a qualification run.
 *
 * Three of this package's suites need something the default test run does not have -- a native
 * library, a windowed one, a display -- and all three skip cleanly without it. That is right for
 * someone working on the binding who has none of them to hand, and it is dangerous everywhere else,
 * because `node --test` reports a suite that ran nothing exactly the way it reports a suite that
 * passed: zero failures, exit zero, a green tick. A CI job missing one environment variable
 * therefore claims to have qualified the very tests it silently declined to run.
 *
 * So each of those suites takes its gate from here instead, and a required run has to prove three
 * things rather than one:
 *
 * - the environment is present, or the suite fails **by name** at load rather than skipping;
 * - at least one test body actually ran;
 * - nothing was skipped for any other reason.
 *
 * The counts are printed either way, so an ordinary run says how much it covered and a
 * qualification run has a number to record rather than an exit code to interpret.
 */

import nodeTest, { after } from "node:test";

/**
 * @param {object} options
 * @param {string} options.label      what the suite is, for the failure message.
 * @param {string} options.envVar     the variable that turns skipping into failing.
 * @param {string} options.counter    the name the executed count is printed under.
 * @param {string|null} options.blocked  why the suite cannot run, or null when it can.
 * @returns {{ test: Function, skip: string|false, required: boolean }}
 */
export function requiredSuite({ label, envVar, counter, blocked }) {
  const required = process.env[envVar] === "1";
  if (required && blocked) {
    // Thrown at module load, before a single test registers, so the run fails with the reason
    // rather than reporting a suite of skips.
    throw new Error(`${envVar}=1 but the ${label} suite cannot run: ${blocked}`);
  }

  const skip = blocked ?? false;
  let executed = 0;
  let skipped = 0;

  /** `node:test`'s own signature, with this suite's skip applied and the outcome counted. */
  const test = (name, options, body) => {
    if (typeof options === "function") { body = options; options = {}; }
    const merged = { ...options };
    if (skip && merged.skip === undefined) merged.skip = skip;
    if (merged.skip) {
      skipped += 1;
      return nodeTest(name, merged, body);
    }
    // Counted where the body starts, not where the test is registered: a test that fails still
    // executed, and a required run wants the failure, not a claim that nothing ran.
    return nodeTest(name, merged, async (t) => {
      executed += 1;
      return body(t);
    });
  };

  after(() => {
    console.log(`${counter}_EXECUTED=${executed}`);
    console.log(`${counter}_SKIPPED=${skipped}`);
    if (!required) return;
    if (executed === 0) {
      throw new Error(
        `${envVar}=1 but no ${label} test executed; the environment was present and the suite ` +
        `still ran nothing`,
      );
    }
    if (skipped > 0) {
      throw new Error(`${envVar}=1 but ${skipped} ${label} test(s) skipped; a required run has none`);
    }
  });

  return { test, skip, required };
}
