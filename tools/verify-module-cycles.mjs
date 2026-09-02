// SPDX-License-Identifier: MS-PL

/**
 * Proves that every module this package builds can be the FIRST module a process imports.
 *
 * ## Why a gate rather than a convention
 *
 * ES modules make a cycle harmless right up until one of the modules in it reads a binding at
 * module scope — an `extends` clause, a `const X = Y` at the top level, a decorator. Then the
 * evaluation order decides whether the graph works, and the order is decided by whoever imports
 * first. This package shipped exactly that defect: `cna-ts/extensions/devices` and
 * `cna-ts/extensions/input` threw `ReferenceError: Cannot access 'Texture2D' before initialization`
 * when they were a consumer's first import, and every gate in the repository was green, because
 * every test, page and example imports the root barrel first and enters the graph from the end that
 * happens to work.
 *
 * So the measurement has to be a cold import, one process per module, over every module rather than
 * only the published ones — a deep module that cannot be entered is a published subpath waiting to
 * be added on top of it. `internal/sprite-font-oracle.js` was one: not exported, not reachable
 * through the exports map, and unable to be imported first.
 *
 * ## The two checks
 *
 * **COLD IMPORT** — every `.js` under `dist/`, imported in a child process of its own, with the
 * native-library environment removed. Importing a public entry point must not need
 * `CNA_NATIVE_LIBRARY`, a bridge, or a Wasm artifact; only *using* native functionality may. In one
 * process the first import that succeeds initialises the shared graph and every import after it
 * measures that instead of itself, which is why this is not a loop in one runtime.
 *
 * **REGISTRY DEPENDENCE** — a source-level rule on the modules that exist to break these cycles.
 * A registry holds state for a facade; if it ever imports that facade, or an extension, as a value,
 * it is back in the cycle it was extracted to end. Type-only imports are exempt and expected: the
 * registry is typed in terms of the facade and erases to nothing.
 *
 * **TEST DEEP IMPORTS** — every `dist/` module a test file or a browser page names by hand, and
 * every binding it asks that module for. The suites and pages reach past the exports map into
 * internal modules on purpose, and nothing typechecks them: they are `.mjs` and `.html`, and the
 * browser ones resolve their specifiers at run time in Chromium. So moving one internal export
 * broke `test/native-cna.integration.mjs` and `test/wasm/non-engine-page.html` while `npm test`,
 * `npm run check`, `verify:leaks` and `verify:package` were all green -- because neither file is in
 * the default battery, and the one that is not even a module was going to fail in a browser.
 *
 * The first check is the one that cannot be fooled — it runs the code. The second and third fail at
 * the source, with the rule written out, before anyone spends a build finding out.
 *
 * ## What it deliberately does not check
 *
 * Not "are there cycles". There are: `Matrix`/`Vector3`/`Quaternion` are mutually recursive by
 * arithmetic, and so are `BoundingBox`/`BoundingFrustum`/`Ray`. Neither reads a binding at module
 * scope, both cold-import from any entry point, and a gate that failed them would be a gate this
 * package had to switch off. A cycle is not a defect; an unreachable entry point is.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const SRC = path.join(ROOT, "src");

/**
 * The environment a consumer who has installed the package and nothing else has. Everything this
 * package reads to find a native library is removed, so a module that needs one to be *imported*
 * fails here rather than in a consumer's build.
 */
const NATIVE_ENV = [
  "CNA_NATIVE_LIBRARY",
  "CNA_WINDOWED_LIBRARY",
  "CNA_NODE_BRIDGE",
  "CNA_WASM_ARTIFACT_DIR",
];

/**
 * Each registry module, and the modules it is allowed to import at runtime.
 *
 * The list is the point: a registry that grows a runtime import is a registry that has stopped
 * being below the layer it serves. Type-only imports are not listed because they are erased and
 * cannot participate in an initialisation cycle.
 */
const REGISTRIES = [
  {
    module: "internal/graphics-device-registry.ts",
    holdsStateFor: "Microsoft/Xna/Framework/Graphics/GraphicsDevice.ts",
    runtimeImportsAllowed: [
      "internal/exceptions.ts",
      "internal/native-error.ts",
      "Microsoft/Xna/Framework/Graphics/ResourceEventArgs.ts",
    ],
  },
  {
    module: "internal/gamer-collection-registry.ts",
    holdsStateFor: "Microsoft/Xna/Framework/GamerServices/Gamer.ts",
    runtimeImportsAllowed: [],
  },
];

function walk(dir, filter, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The runtime import specifiers of one TypeScript source, without a parser.
 *
 * `import type ...` and `export type ...` are erased by the compiler and are skipped; an import
 * whose every named specifier is `type`-prefixed erases to nothing too and is skipped as well. A
 * bare `import "x"` is kept, because a side-effect import is the most runtime an import gets.
 */
function runtimeImportsOf(file) {
  const source = fs.readFileSync(file, "utf8");
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  const found = [];
  const statement = /^(?:import|export)\b([\s\S]*?)from\s*"([^"]+)";|^import\s*"([^"]+)";/gm;
  for (const match of withoutComments.matchAll(statement)) {
    const specifier = match[2] ?? match[3];
    if (!specifier?.startsWith(".")) continue;
    const clause = match[1];
    if (clause === undefined) { found.push(specifier); continue; }   // bare side-effect import
    if (/^\s*type\s/.test(clause)) continue;                         // import type { ... }
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      const names = braces[1].split(",").map((n) => n.trim()).filter(Boolean);
      const values = names.filter((n) => !/^type\s/.test(n));
      const outside = clause.replace(/\{[\s\S]*\}/, "").replace(/[,\s]/g, "");
      if (values.length === 0 && outside.length === 0) continue;     // every specifier type-only
    }
    found.push(specifier);
  }
  return found;
}

function resolveSource(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = base.endsWith(".js")
    ? [`${base.slice(0, -3)}.ts`]
    : [`${base}.ts`, path.join(base, "index.ts")];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function checkRegistries() {
  const failures = [];
  for (const registry of REGISTRIES) {
    const file = path.join(SRC, registry.module);
    if (!fs.existsSync(file)) {
      failures.push(`${registry.module} is named by this gate and does not exist`);
      continue;
    }
    const allowed = new Set(registry.runtimeImportsAllowed);
    for (const specifier of runtimeImportsOf(file)) {
      const target = resolveSource(file, specifier);
      const name = target ? path.relative(SRC, target) : specifier;
      if (allowed.has(name)) continue;
      const why = name === registry.holdsStateFor
        ? "it holds that module's state, so importing it as a value restores the cycle it was extracted to break"
        : name.startsWith("extensions/")
          ? "a registry sits below the extension layer and may not import from it"
          : "it is not in this registry's allowed runtime-import list";
      failures.push(`${registry.module} imports ${name} at runtime: ${why}`);
    }
  }
  return failures;
}

/**
 * Every `dist/` module a hand-written test or page names, with the bindings it asks for.
 *
 * Two specifier shapes reach the built package: `../dist/x.js` from a test file, and
 * `/cna-ts/x.js` from a browser page the harness serves `dist` under. Both are matched with the
 * name list that follows or precedes them, and a name that module does not export is the failure
 * -- which is exactly what a moved internal export looks like from here.
 */
export async function checkTestDeepImports() {
  const TEST = path.join(ROOT, "test");
  if (!fs.existsSync(TEST)) return [];
  return deepImportFailuresIn(
    walk(TEST, (name) => name.endsWith(".mjs") || name.endsWith(".html"))
      .map((file) => ({ file: path.relative(ROOT, file), text: fs.readFileSync(file, "utf8") }))
      // The rule reads source text, so a file that QUOTES a broken import to prove the rule
      // rejects it is indistinguishable from a file that contains one. Exactly one file does
      // that -- the rule's own rejection cases -- and it is named rather than pattern-matched, so
      // no other file can opt itself out by how it is written.
      .filter(({ file }) => file !== path.join("test", "module-cycles.test.mjs")),
  );
}

/**
 * The rule itself, over sources given rather than read.
 *
 * Taking the text lets `test/module-cycles.test.mjs` hand it a page that asks for an export that
 * moved and require it to say so -- a rejection case, which is the only option here: the mutation
 * harness scores a plan by rebuilding `dist` and refuses a verdict when the artifact comes out
 * byte-identical, and a defect in a test page changes no built file.
 */
export async function deepImportFailuresIn(sources) {
  const failures = [];
  if (!fs.existsSync(DIST)) return failures;
  // `import { a, b } from "spec"` and `const { a, b } = await import("spec")`, which is how a page
  // that must not load the module at parse time reaches one.
  const statik = /import\s*(?:\{([^}]*)\}|(\w+))?\s*from\s*["']((?:\.\.\/)+dist\/[^"']+|\/cna-ts\/[^"']+)["']/g;
  const dynamic = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*["']((?:\.\.\/)+dist\/[^"']+|\/cna-ts\/[^"']+)["']\s*\)/g;

  const wanted = new Map();   // dist-relative module -> Map<name, Set<test file>>
  for (const { file, text: source } of sources) {
    for (const [pattern, nameGroup, specGroup] of [[statik, 1, 3], [dynamic, 1, 2]]) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const specifier = match[specGroup];
        const relative = specifier.startsWith("/cna-ts/")
          ? specifier.slice("/cna-ts/".length)
          : specifier.replace(/^(?:\.\.\/)+dist\//, "");
        // `{ a, b as c }` in an import and `{ a, b: c }` in a destructured dynamic one both name
        // `b` in the module; the local alias is the half that is not the module's business.
        const names = (match[nameGroup] ?? "").split(",")
          .map((n) => n.trim().split(/\s+as\s+|:/)[0].trim())
          .filter((n) => n.length > 0 && n !== "type");
        const entry = wanted.get(relative) ?? new Map();
        for (const name of names) {
          entry.set(name, (entry.get(name) ?? new Set()).add(file));
        }
        if (!entry.has("\0module")) entry.set("\0module", new Set());
        entry.get("\0module").add(file);
        wanted.set(relative, entry);
      }
    }
  }

  for (const [relative, names] of [...wanted].sort()) {
    const target = path.join(DIST, relative);
    const users = [...(names.get("\0module") ?? [])].sort().join(", ");
    if (!fs.existsSync(target)) {
      failures.push(`dist/${relative} is imported by ${users} and was not built`);
      continue;
    }
    let exported;
    try {
      exported = new Set(Object.keys(await import(pathToFileURL(target).href)));
    } catch (error) {
      failures.push(`dist/${relative}, imported by ${users}, does not load: ${String(error).split("\n")[0]}`);
      continue;
    }
    for (const [name, from] of names) {
      if (name === "\0module" || exported.has(name)) continue;
      failures.push(`dist/${relative} has no export "${name}", asked for by ${[...from].sort().join(", ")}`);
    }
  }
  return failures;
}

export async function checkColdImports() {
  if (!fs.existsSync(DIST)) {
    return { modules: 0, failures: [["dist", "dist/ does not exist -- run npm run build first"]] };
  }
  const modules = walk(DIST, (name) => name.endsWith(".js")).sort();
  const env = { ...process.env };
  for (const name of NATIVE_ENV) delete env[name];

  const failures = [];
  const limit = Math.max(2, os.cpus().length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, modules.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= modules.length) return;
      const file = modules[index];
      const source = `await import(${JSON.stringify(pathToFileURL(file).href)});`;
      const error = await new Promise((resolve) => {
        execFile(process.execPath, ["--input-type=module", "-e", source],
          { cwd: ROOT, env, timeout: 60_000 },
          (err, _out, stderr) => resolve(err ? String(stderr || err.message) : null));
      });
      if (error) {
        const line = error.split("\n").map((l) => l.trim())
          .find((l) => /^[A-Za-z]*Error\b/.test(l)) ?? error.split("\n")[0]?.trim() ?? "";
        failures.push([path.relative(DIST, file), line]);
      }
    }
  }));
  failures.sort(([a], [b]) => a.localeCompare(b));
  return { modules: modules.length, failures };
}

// Run as a script this is the CI gate; imported, it is what `test/module-cycles.test.mjs` asserts,
// so the same two checks run under `npm test` and can be scored by the mutation harness -- which
// reads TAP counts and cannot see a tool's exit code.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const registryFailures = checkRegistries();
  const deepImports = await checkTestDeepImports();
  const cold = await checkColdImports();

  console.log(`REGISTRY_MODULES=${REGISTRIES.length}  REGISTRY_VIOLATIONS=${registryFailures.length}`);
  for (const failure of registryFailures) console.log(`  VIOLATION ${failure}`);
  console.log(`TEST_DEEP_IMPORTS_BROKEN=${deepImports.length}`);
  for (const failure of deepImports) console.log(`  BROKEN ${failure}`);
  console.log(`BUILT_MODULES=${cold.modules}  COLD_IMPORT_FAILURES=${cold.failures.length}`);
  for (const [file, why] of cold.failures) console.log(`  FAIL ${file}\n       ${why}`);

  if (registryFailures.length > 0 || deepImports.length > 0 || cold.failures.length > 0) {
    console.error("\nmodule-cycle gate FAILED");
    process.exit(1);
  }
  console.log("MODULE_CYCLE_GATE=PASS");
}
