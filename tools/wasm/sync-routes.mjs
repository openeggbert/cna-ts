// SPDX-License-Identifier: MS-PL
//
// Keeps `ROUTES` in `src/internal/wasm/wasm-backend.ts` equal to the routes the backend actually
// names.
//
// `WasmRouteTable` resolves every route in that array once, at construction, so the list has to
// contain each route a backend method calls -- a missing one fails mid-frame with
// `WasmRouteMissingError` rather than at load. It is also what `audit:cna-abi` counts as
// `WASM_BACKEND_ROUTES`, which makes the *other* direction a truthfulness problem: a route left in
// the list after nothing calls it any more is still counted as bound, and a route added
// speculatively is counted as bound before anything reaches it. Neither drift is visible in a
// test, because both leave every suite green.
//
// So the list is derived rather than maintained: this tool reads the `"cna_..."` literals out of
// every file in `src/internal/wasm`, and either rewrites the array to match (default) or reports
// the difference and exits 1 (`--check`, which is what CI runs).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WASM_DIR = path.join(ROOT, "src/internal/wasm");
const BACKEND = path.join(WASM_DIR, "wasm-backend.ts");

/** Every `"cna_..."` literal in the WebAssembly backend, except the `ROUTES` array itself. */
function namedRoutes() {
  const names = new Set();
  for (const entry of fs.readdirSync(WASM_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    let source = fs.readFileSync(path.join(WASM_DIR, entry.name), "utf8");
    if (entry.name === "wasm-backend.ts") source = source.replace(ROUTES_BLOCK, "");
    for (const match of source.matchAll(/"(cna_[A-Za-z0-9_]+)"/g)) names.add(match[1]);
  }
  return names;
}

const ROUTES_BLOCK = /const ROUTES = \[[\s\S]*?\] as const;/;

function currentRoutes(source) {
  const block = ROUTES_BLOCK.exec(source);
  if (!block) throw new Error("wasm-backend.ts has no ROUTES array");
  return [...block[0].matchAll(/"(cna_[A-Za-z0-9_]+)"/g)].map((match) => match[1]);
}

const source = fs.readFileSync(BACKEND, "utf8");
const listed = currentRoutes(source);
const named = namedRoutes();
const missing = [...named].filter((name) => !listed.includes(name)).sort();
const unused = listed.filter((name) => !named.has(name)).sort();
// A repeated entry resolves twice and is counted twice by `audit:cna-abi`, which is the same
// overstatement as an unused one reached by a different mistake.
const duplicated = [...new Set(listed.filter((name, at) => listed.indexOf(name) !== at))].sort();
const check = process.argv.includes("--check");

if (check) {
  console.log(`WASM_ROUTES_LISTED=${listed.length}`);
  console.log(`WASM_ROUTES_NAMED=${named.size}`);
  console.log(`WASM_ROUTES_MISSING_FROM_LIST=${missing.length}`);
  console.log(`WASM_ROUTES_LISTED_BUT_UNUSED=${unused.length}`);
  console.log(`WASM_ROUTES_DUPLICATED=${duplicated.length}`);
  for (const name of missing) console.log(`MISSING   ${name}`);
  for (const name of unused) console.log(`UNUSED    ${name}`);
  for (const name of duplicated) console.log(`DUPLICATE ${name}`);
  process.exit(missing.length + unused.length + duplicated.length === 0 ? 0 : 1);
}

// Rewrite: keep the array's declaration order for routes that stay, then append the new ones in
// the order the source names them, so a diff shows what a change added rather than a resort.
const kept = listed.filter((name, at) => named.has(name) && listed.indexOf(name) === at);
const updated = [...kept, ...missing];
const rendered = `const ROUTES = [\n${updated.map((name) => `  "${name}",`).join("\n")}\n] as const;`;
fs.writeFileSync(BACKEND, source.replace(ROUTES_BLOCK, rendered));
console.log(`WASM_ROUTES_ADDED=${missing.length}`);
console.log(`WASM_ROUTES_REMOVED=${unused.length}`);
console.log(`WASM_ROUTES_DEDUPLICATED=${duplicated.length}`);
console.log(`WASM_ROUTES_TOTAL=${updated.length}`);
