#!/usr/bin/env node

/**
 * A mutation harness that refuses to produce a number it cannot justify.
 *
 * Planting a defect and watching a suite go red is only evidence if four things are true, and a
 * harness that assumes any of them reports a score that is worse than no score at all. A previous
 * run of this project's media-library suite reported `KILLED=0` for a mutant that could not
 * possibly survive; it had scored a run whose tests never executed. So each of the four is checked
 * rather than assumed:
 *
 * 1. **The mutation was applied exactly once.** An anchor matching twice patches a call site the
 *    author did not mean, and one matching zero times patches nothing while still "running". Either
 *    is reported as `ANCHOR xN` and scored as nothing at all.
 * 2. **A new artifact was built from the mutated source.** The tests run against `dist/`, not
 *    against `src/`, so the build output is hashed before and after: an unchanged hash means the
 *    suite would have run the baseline artifact and the verdict would be a lie.
 * 3. **The tests actually executed.** The TAP summary is parsed, and `pass + fail == 0` is refused
 *    outright -- a suite that skipped everything looks exactly like a suite that passed.
 * 4. **The tree came back.** The source is restored and rebuilt, and the artifact hash is required
 *    to match the baseline again, so the next run and the next commit see the original.
 *
 * A mutant that survives is reported as surviving, with no attempt to reclassify it. Whether a
 * survivor is equivalent, fixture-limited or a real gap is a judgement for the person reading the
 * plan, and this tool deliberately does not make it.
 *
 * ```sh
 * node tools/mutation-harness.mjs tools/mutation-plans/compiled-effect-render.json
 * ```
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const planPath = process.argv[2];
if (!planPath) {
  console.error("usage: node tools/mutation-harness.mjs <plan.json>");
  process.exit(2);
}
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const only = process.argv.slice(3).filter((argument) => !argument.startsWith("-"));

/** Every emitted file, hashed as one value, so "was a new artifact built" has an exact answer. */
function artifactHash(root) {
  const hash = createHash("sha256");
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name < b.name ? -1 : 1)) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(entry.name).update(fs.readFileSync(full));
    }
  };
  if (!fs.existsSync(root)) return "ABSENT";
  walk(root);
  return hash.digest("hex").slice(0, 16);
}

/**
 * A suite's whole output, which has to include its TAP summary or the verdict is unreadable.
 *
 * `maxBuffer` is 64 MiB rather than Node's 1 MiB default for a measured reason: a mutant that made
 * the backend read a string array at the wrong stride produced assertion messages carrying
 * megabytes of misread WebAssembly heap, `execSync` truncated the pipe at 1 MiB, the `# pass` line
 * was cut off with it, and the harness scored a plainly-killed mutant as `REFUSED -- no test
 * executed`. Losing a verdict to an output limit is the same failure as losing it to a suite that
 * skipped: a number nobody can justify.
 */
function run(command) {
  const options = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 };
  try {
    return { ok: true, output: execSync(command, options) };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

/** The TAP counts the verdict is allowed to be built from, and nothing else. */
function tapCounts(output) {
  const read = (label) => {
    const match = output.match(new RegExp(`^# ${label} (\\d+)$`, "m"));
    return match ? Number(match[1]) : null;
  };
  return { pass: read("pass"), fail: read("fail"), skipped: read("skipped") };
}

const targets = plan.mutants.filter((mutant) => only.length === 0 || only.includes(mutant.id));
const sources = [...new Set(targets.map((mutant) => mutant.file))];
const originals = new Map(sources.map((file) => [file, fs.readFileSync(file, "utf8")]));

console.log(`# mutation plan: ${plan.name}`);
console.log(`# build:   ${plan.build}`);
console.log(`# command: ${plan.command}`);

// The baseline, which everything else is measured against: the artifact the working tree produces,
// and the counts the suite reports when nothing is wrong with it.
const build = run(plan.build);
if (!build.ok) {
  console.error("the baseline build failed; nothing was mutated\n" + build.output);
  process.exit(1);
}
const baselineArtifact = artifactHash(plan.artifact);
const baselineRun = run(plan.command);
const baseline = tapCounts(baselineRun.output);
console.log(`# baseline artifact ${baselineArtifact}  pass=${baseline.pass} fail=${baseline.fail} skipped=${baseline.skipped}`);
if (!baselineRun.ok || baseline.fail !== 0 || !baseline.pass) {
  console.error("the baseline suite is not green and empty-handed; fix that before mutating");
  process.exit(1);
}

const results = [];
let restoreFailed = false;

for (const mutant of targets) {
  const original = originals.get(mutant.file);
  const occurrences = original.split(mutant.find).length - 1;
  if (occurrences !== 1) {
    results.push({ id: mutant.id, verdict: `ANCHOR x${occurrences}`, detail: "not scored" });
    console.log(`ANCHOR x${occurrences}  ${mutant.id}  -- the anchor must match exactly once`);
    continue;
  }

  fs.writeFileSync(mutant.file, original.replace(mutant.find, mutant.replace));
  const mutantBuild = run(plan.build);
  const mutantArtifact = artifactHash(plan.artifact);
  let verdict;
  let detail = "";

  if (!mutantBuild.ok) {
    verdict = "BUILD_FAILED";
    detail = "the mutated source does not compile; not scored";
  } else if (mutantArtifact === baselineArtifact) {
    verdict = "NO_NEW_ARTIFACT";
    detail = "the build output is byte-identical to the baseline; not scored";
  } else {
    const attempt = run(plan.command);
    const counts = tapCounts(attempt.output);
    const executed = (counts.pass ?? 0) + (counts.fail ?? 0);
    if (executed === 0) {
      verdict = "REFUSED";
      detail = "no test executed against the mutated artifact; not scored";
    } else if (counts.fail > 0) {
      verdict = "KILLED";
      detail = `fail=${counts.fail} of ${executed}`;
    } else {
      verdict = "SURVIVED";
      detail = `pass=${counts.pass} fail=0`;
    }
  }

  results.push({ id: mutant.id, verdict, detail, why: mutant.why });
  console.log(`${verdict.padEnd(15)} ${mutant.id}  ${detail}`);

  fs.writeFileSync(mutant.file, original);
}

// The tree comes back, and the artifact is proved back rather than assumed back: a restored source
// beside a stale artifact makes the *next* mutant look killed by this one.
for (const [file, original] of originals) fs.writeFileSync(file, original);
const restored = run(plan.build);
const restoredArtifact = artifactHash(plan.artifact);
if (!restored.ok || restoredArtifact !== baselineArtifact) {
  restoreFailed = true;
  console.error(`RESTORE FAILED: artifact is ${restoredArtifact}, baseline was ${baselineArtifact}`);
}

const count = (verdict) => results.filter((item) => item.verdict === verdict).length;
console.log("");
console.log(`MUTANTS=${results.length}`);
console.log(`KILLED=${count("KILLED")}`);
console.log(`SURVIVED=${count("SURVIVED")}`);
console.log(`NOT_SCORED=${results.length - count("KILLED") - count("SURVIVED")}`);
console.log(`SOURCE_RESTORED=${restoreFailed ? "NO" : "YES"}`);
console.log(`ARTIFACT_RESTORED=${restoreFailed ? "NO" : "YES"} (${restoredArtifact})`);
for (const item of results.filter((entry) => entry.verdict === "SURVIVED")) {
  console.log(`# survived: ${item.id} -- ${item.why ?? "no note in the plan"}`);
}
process.exit(restoreFailed ? 1 : 0);
