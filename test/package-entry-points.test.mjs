// SPDX-License-Identifier: MS-PL

/**
 * Every published entry point, imported cold, in a process of its own.
 *
 * This exists because two of them did not work. `cna-ts/extensions/devices` and
 * `cna-ts/extensions/input` threw
 * `ReferenceError: Cannot access 'Texture2D' before initialization` when they were a consumer's
 * *first* import — a real crash, on a published export, in a package whose every other gate was
 * green.
 *
 * The cause is a cycle in the graphics graph that only resolves in one direction:
 * `RenderTarget2D extends Texture2D`, `GraphicsDevice` needs both as values for `instanceof` in
 * `SetRenderTarget`, and `Texture2D` needs `GraphicsDevice`'s internal accessors. Entered at
 * `GraphicsDevice` it evaluates cleanly, because `Texture2D` only calls those accessors and never
 * runs them at module scope. Entered at `Texture2D` — which is what those two subpaths did — it
 * reaches `class RenderTarget2D extends Texture2D` while `Texture2D` is still initialising.
 *
 * Nothing caught it for the same reason it is easy to write: every test, page and example in this
 * package imports the root barrel first, which enters the graph from the working end. So the check
 * has to be a **cold** import, and it has to be one process per entry point, because the first
 * successful import warms the graph for every import after it in the same process.
 *
 * The list comes from `package.json`'s own `exports` map rather than being written out here, so a
 * subpath added later is covered by having been published rather than by being remembered.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

/**
 * Every subpath the package publishes as a *module*, with the built file it resolves to.
 *
 * `./package.json` is exported too -- a package publishing its own manifest is conventional and
 * `import()`ing it is not what a consumer does with it -- so the filter is on what can be a module
 * rather than a name written here.
 */
/** `process.env` with every variable this package reads to find a native library removed. */
const CONSUMER_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !["CNA_NATIVE_LIBRARY", "CNA_WINDOWED_LIBRARY", "CNA_NODE_BRIDGE", "CNA_WASM_ARTIFACT_DIR"]
    .includes(name)));

const entryPoints = Object.entries(manifest.exports ?? {})
  .map(([subpath, target]) => [subpath, typeof target === "string" ? target : target?.import])
  .filter(([, file]) => typeof file === "string" && file.endsWith(".js"));

test("the package publishes entry points at all", () => {
  assert.ok(entryPoints.length > 0, "package.json declares no exports, so this gate is vacuous");
});

for (const [subpath, file] of entryPoints) {
  test(`${subpath === "." ? "cna-ts" : `cna-ts${subpath.slice(1)}`} imports on its own`, () => {
    const resolved = path.join(ROOT, file);
    assert.ok(fs.existsSync(resolved), `${file} is exported and was not built`);
    // A child process per entry point: in one process the first import that succeeds initialises
    // the shared module graph and every later one is testing that warm graph rather than itself.
    const source = `await import(${JSON.stringify(pathToFileURL(resolved).href)});`;
    try {
      execFileSync(process.execPath, ["--input-type=module", "-e", source], {
        cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000,
        // A consumer who has installed the package and nothing else. Importing a public entry
        // point must not need a native library, a bridge or a Wasm artifact -- only *using* native
        // functionality may -- and a developer with one of these exported would otherwise be
        // measuring their own shell rather than the package.
        env: CONSUMER_ENV,
      });
    } catch (error) {
      const detail = String(error.stderr ?? error.message).split("\n")
        .filter((line) => line.trim().length > 0).slice(0, 6).join(" | ");
      assert.fail(`${subpath} does not load as a first import: ${detail}`);
    }
  });
}
