#!/usr/bin/env node

// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's gap, one public backend method at a time.
//
// `report-frontier.mjs` answers a *family* question — is CNA refusing this build, or has nobody
// bound it? — by calling one representative set of routes with null handles. That is the right
// shape for deciding which family to open next and the wrong shape for deciding a family is
// finished, because it cannot see a method: it reports "Storage, 16 absent, 13 routes reached
// validation" whether the reason is one blocker or thirteen.
//
// This tool is the method-level counterpart. For every method of every backend interface that the
// WebAssembly backend does not implement it records:
//
//   * the interface and the public backend method
//   * where the Node-API backend implements it, and which bridge export it calls
//   * the CNA routes that bridge export reaches, resolved through the loader table so a
//     macro-generated bridge function is read as exactly as a hand-written one
//   * whether the running artifact exports each of those routes
//   * its classification, from `tools/wasm/backend-gap.json`
//
// and then refuses to be silent about anything left over. An absent method with no classification
// is `UNCLASSIFIED_WASM_BACKEND_GAP`, and `--check` exits 1 while any exists. That is the gate the
// engine layer never needed and this one does: an engine interface was implemented whole or absent
// whole, but a browser cannot have all of `Storage` or all of `Xact`, so "partial" has to be a
// state the repository can describe rather than a state it can only be in.
//
// Route resolution is deliberately transitive through the bridge's own static helpers. A first
// version matched `cna_...` string literals in a bridge function body and concluded that
// `ExtendedInput` and `GraphicsAdapter` reach no CNA routes at all — they reach sixty and fifteen.
// The bridge calls CNA through `g_api.<field>`, and the literal name appears only in the error
// message of a route that has one.
//
//   CNA_SOURCE_PATH=/path/to/cnanext \
//   CNA_WASM_ARTIFACT_DIR=/path/to/cmake-build-tswasm-fx/modules/c-api \
//     node tools/wasm/backend-gap.mjs [--check] [--json <file>] [--markdown <file>]

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CNA_ROOT = process.env.CNA_SOURCE_PATH
  ? path.resolve(process.env.CNA_SOURCE_PATH)
  : path.resolve(ROOT, "../../cnanext");
const HEADER_DIR = path.join(CNA_ROOT, "modules/c-api/include/CNA/C");
const BRIDGE = path.join(ROOT, "native/cna_node_bridge.c");
const NODE_BACKEND = path.join(ROOT, "src/internal/node-native-backend.ts");
const CLASSIFICATION = path.join(ROOT, "tools/wasm/backend-gap.json");

/** The classifications a still-absent method may carry. Anything else is a spelling mistake. */
const BLOCKERS = new Set([
  "BLOCKED_CNA_NOT_SUPPORTED",
  "BLOCKED_UPSTREAM",
  "BLOCKED_UPSTREAM_TESTABILITY",
  "BLOCKED_PLATFORM",
  "BLOCKED_HARDWARE",
  "BLOCKED_FIXTURE",
  "BLOCKED_ARCHITECTURE",
  "DELIBERATE_NON_BINDING",
]);

if (!fs.statSync(HEADER_DIR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`no CNA headers at ${HEADER_DIR}; set CNA_SOURCE_PATH`);
  process.exit(2);
}

// ---- CNA's declared routes -----------------------------------------------------------------

function declarations() {
  let text = "";
  for (const entry of fs.readdirSync(HEADER_DIR)) {
    if (entry.endsWith(".h")) text += fs.readFileSync(path.join(HEADER_DIR, entry), "utf8");
  }
  const flat = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
  const routes = new Map();
  for (const match of flat.matchAll(/CNA_C_API CNA_Result (cna_[a-z0-9_]+)\s*\(([^;]*?)\)\s*;/g)) {
    routes.set(match[1], match[2].trim() === "void" ? [] : match[2].split(",").map((p) => p.trim()));
  }
  return routes;
}

const declared = declarations();

// ---- the Node-API bridge: export name -> CNA routes ------------------------------------------

const bridge = fs.readFileSync(BRIDGE, "utf8");

/** `LOAD_REQUIRED(field, Type, "cna_route")` — how every route reaches `g_api`. */
const fieldRoutes = new Map();
for (const match of bridge.matchAll(
  /LOAD_REQUIRED\(\s*([A-Za-z0-9_]+)\s*,\s*[A-Za-z0-9_]+\s*,\s*"(cna_[a-z0-9_]+)"\s*\)/g,
)) fieldRoutes.set(match[1], match[2]);

/** `{ "exportName", NULL, c_function, ... }` — the module's property table. */
const bridgeExports = new Map();
for (const match of bridge.matchAll(
  /\{\s*"([A-Za-z0-9_]+)"\s*,\s*NULL\s*,\s*([A-Za-z0-9_]+)\s*,/g,
)) bridgeExports.set(match[1], match[2]);

/** Every `static` function body in the bridge, brace-matched so nested blocks stay inside it. */
function bodies(pattern) {
  const found = new Map();
  let match;
  while ((match = pattern.exec(bridge))) {
    let index = pattern.lastIndex - 1, depth = 0, end = index;
    for (; index < bridge.length; index += 1) {
      if (bridge[index] === "{") depth += 1;
      else if (bridge[index] === "}") { depth -= 1; if (depth === 0) { end = index; break; } }
    }
    if (!found.has(match[1])) found.set(match[1], bridge.slice(pattern.lastIndex, end));
  }
  return found;
}

const napiBodies = bodies(/static\s+napi_value\s+([A-Za-z0-9_]+)\s*\(\s*napi_env[^)]*\)\s*\{/g);
const helperBodies = bodies(/static\s+(?:[A-Za-z_][A-Za-z0-9_ *]*?)\s+([A-Za-z0-9_]+)\s*\(([^;{)]*)\)\s*\{/g);

/**
 * The macro-generated bridge functions — `AUDIO_HANDLE_METHOD(pause_cue, cue_pause, "cna_cue_pause")`
 * and its eight siblings. Fifty of the boundary's methods reach CNA only through one of these, so
 * a resolver that reads function bodies alone reports them as reaching no route at all.
 */
const macroRoutes = new Map();
for (const match of bridge.matchAll(/^[A-Z][A-Z0-9_]*\(([a-z][A-Za-z0-9_]*)\s*,([^\n]*)\)\s*$/gm)) {
  const routes = new Set();
  for (const literal of match[2].matchAll(/"(cna_[a-z0-9_]+)"/g)) {
    if (declared.has(literal[1])) routes.add(literal[1]);
  }
  for (const word of match[2].matchAll(/\b([a-z][a-z0-9_]*)\b/g)) {
    const route = fieldRoutes.get(word[1]);
    if (route) routes.add(route);
  }
  if (routes.size > 0) macroRoutes.set(match[1], routes);
}

/** Every CNA route one bridge function reaches, following its own static helpers. */
function routesReached(name, depth = 0, seen = new Set()) {
  const routes = new Set(macroRoutes.get(name) ?? []);
  const body = napiBodies.get(name) ?? helperBodies.get(name);
  if (!body) return routes;
  for (const match of body.matchAll(/g_api\.([A-Za-z0-9_]+)/g)) {
    const route = fieldRoutes.get(match[1]);
    if (route) routes.add(route);
  }
  for (const match of body.matchAll(/\bcna_[a-z0-9_]+\b/g)) {
    if (declared.has(match[0])) routes.add(match[0]);
  }
  if (depth >= 4) return routes;
  for (const match of body.matchAll(/\b([a-z][A-Za-z0-9_]*)\s*\(/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    if (!napiBodies.has(match[1]) && !helperBodies.has(match[1]) && !macroRoutes.has(match[1])) continue;
    for (const route of routesReached(match[1], depth + 1, seen)) routes.add(route);
  }
  return routes;
}

// ---- the Node backend: boundary method -> bridge export --------------------------------------

const nodeSource = fs.readFileSync(NODE_BACKEND, "utf8");
const nodeMethods = new Map();
{
  const starts = [];
  for (const match of nodeSource.matchAll(
    /^[ \t]*public\s+(?:override\s+)?(?:get\s+|set\s+)?([A-Za-z0-9_]+)\s*[(<]/gm,
  )) starts.push({ name: match[1], index: match.index });
  for (let at = 0; at < starts.length; at += 1) {
    const from = starts[at].index;
    const to = at + 1 < starts.length ? starts[at + 1].index : nodeSource.length;
    const calls = new Set();
    for (const call of nodeSource.slice(from, to).matchAll(/this\.#bridge\.([A-Za-z0-9_]+)/g)) {
      calls.add(call[1]);
    }
    const line = nodeSource.slice(0, from).split("\n").length;
    const previous = nodeMethods.get(starts[at].name);
    if (!previous || calls.size > previous.calls.length) {
      nodeMethods.set(starts[at].name, { calls: [...calls], line });
    }
  }
}

// ---- what the WebAssembly backend implements -------------------------------------------------

const base = await import(path.join(ROOT, "dist/internal/backend-base.js"));
const wasmModules = [];
for (const entry of fs.readdirSync(path.join(ROOT, "dist/internal/wasm"))) {
  if (entry.endsWith(".js")) wasmModules.push(await import(path.join(ROOT, "dist/internal/wasm", entry)));
}

/** Every member a class and its prototype chain declare, which is how an override is seen. */
function members(constructor) {
  const found = new Set();
  for (let p = constructor?.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const name of Object.getOwnPropertyNames(p)) found.add(name);
  }
  return found;
}

/**
 * The facades `WasmBackend` actually constructs.
 *
 * A facade class that exists and is never wired implements nothing a consumer can reach, and the
 * frontier tool counts it as bound anyway because it only looks at prototypes. That is not
 * hypothetical: `WasmAvatarBackend` moved this report from fifteen absent interfaces to fourteen
 * the moment the file existed, before one line of `wasm-backend.ts` mentioned it.
 */
const backendSource = fs.readFileSync(path.join(ROOT, "src/internal/wasm/wasm-backend.ts"), "utf8");
const constructed = new Set(
  [...backendSource.matchAll(/=\s*new\s+(Wasm[A-Za-z0-9_]+)\s*\(/g)].map((match) => match[1]),
);
const constructedClasses = wasmModules
  .flatMap((module) => Object.values(module))
  .filter((value) => typeof value === "function" && constructed.has(value.name));

/**
 * Whether a facade class is reachable from `WasmBackend`: either it is constructed, or something
 * constructed derives from it. The graphics-extension facade is four classes deep and only the
 * last is ever named with `new`, so a check on the name alone reports three abstract halves of one
 * working object as dead code.
 */
function reachable(value) {
  if (constructed.has(value.name) || value.name === "WasmBackend") return true;
  return constructedClasses.some((other) => other === value || other.prototype instanceof value);
}
const unwired = [];

const implemented = new Map();
for (const module of wasmModules) {
  for (const value of Object.values(module)) {
    if (typeof value !== "function" || !/^Wasm/.test(value.name)) continue;
    const own = members(value);
    for (const [name, constructor] of Object.entries(base)) {
      if (typeof constructor !== "function" || !/BackendBase$/.test(name)) continue;
      if (!(value.prototype instanceof constructor)) continue;
      if (!reachable(value)) {
        if (!unwired.includes(value.name)) unwired.push(value.name);
        continue;
      }
      const previous = implemented.get(name);
      if (!previous || own.size > previous.size) implemented.set(name, own);
    }
  }
}
const backendMembers = members(
  wasmModules.flatMap((m) => Object.values(m)).find((v) => typeof v === "function" && v.name === "WasmBackend"),
);

/** The boundary's own methods, excluding the two every refusing base declares. */
function boundaryMethods(constructor) {
  return Object.getOwnPropertyNames(constructor.prototype)
    .filter((name) => name !== "constructor" && name !== "unsupported")
    .filter((name) => typeof Object.getOwnPropertyDescriptor(constructor.prototype, name)?.value === "function");
}

// ---- the running artifact ---------------------------------------------------------------------

let artifact = null;
const artifactDir = process.env.CNA_WASM_ARTIFACT_DIR;
if (artifactDir) {
  const factory = (await import(path.join(artifactDir, "cna_c_api.mjs"))).default;
  artifact = await factory({
    locateFile: (file) => path.join(artifactDir, file), print: () => {}, printErr: () => {},
  });
}

// ---- the report ---------------------------------------------------------------------------------

const classification = JSON.parse(fs.readFileSync(CLASSIFICATION, "utf8"));

/** The classification for one method: an exact entry first, then the family's wildcard. */
function classify(family, method) {
  return classification[`${family}.${method}`] ?? classification[`${family}.*`] ?? null;
}

const rows = [];
const families = new Map();
for (const [name, constructor] of Object.entries(base)) {
  if (typeof constructor !== "function" || !/BackendBase$/.test(name)) continue;
  const family = name.replace(/^Cna|BackendBase$/g, "");
  const all = boundaryMethods(constructor);
  if (all.length === 0) continue;
  const own = implemented.get(name);
  const bound = all.filter((method) => own?.has(method) || backendMembers.has(method));
  families.set(family, { total: all.length, bound: bound.length, absent: all.length - bound.length });
  for (const method of all) {
    if (own?.has(method) || backendMembers.has(method)) continue;
    const node = nodeMethods.get(method);
    const routes = new Set();
    for (const call of node?.calls ?? []) {
      const fn = bridgeExports.get(call);
      if (fn) for (const route of routesReached(fn)) routes.add(route);
    }
    const sorted = [...routes].sort();
    const missingExports = artifact
      ? sorted.filter((route) => typeof artifact[`_${route}`] !== "function")
      : [];
    const entry = classify(family, method);
    rows.push({
      Interface: family,
      Method: method,
      NodeImplementation: node ? `src/internal/node-native-backend.ts:${node.line}` : null,
      BridgeExports: node?.calls ?? [],
      CnaRoutes: sorted,
      RoutesNotExported: missingExports,
      Status: entry?.status ?? "ACTIONABLE_LOCAL",
      Reason: entry?.reason ?? null,
      Evidence: entry?.evidence ?? null,
    });
  }
}

const unknownStatus = rows.filter((row) => row.Status !== "ACTIONABLE_LOCAL" && !BLOCKERS.has(row.Status));
const actionable = rows.filter((row) => row.Status === "ACTIONABLE_LOCAL");
// A classification that names no reason explains nothing, so it is not a classification.
const unreasoned = rows.filter((row) => row.Status !== "ACTIONABLE_LOCAL" && !row.Reason);
// An entry for a method this backend now implements is stale: it would keep a blocker alive after
// the blocker was removed, which is the failure this whole file exists to make impossible.
const present = new Set(rows.map((row) => `${row.Interface}.${row.Method}`));
const wildcardFamilies = new Set(rows.map((row) => `${row.Interface}.*`));
const stale = Object.keys(classification)
  .filter((key) => !present.has(key) && !wildcardFamilies.has(key));

const boundInterfaces = [...families.values()].filter((f) => f.absent === 0).length;
const partialInterfaces = [...families.values()].filter((f) => f.absent > 0 && f.bound > 0).length;
const absentInterfaces = [...families.values()].filter((f) => f.bound === 0).length;
const boundMethods = [...families.values()].reduce((sum, f) => sum + f.bound, 0);

const report = {
  GeneratedFrom: {
    Artifact: artifactDir ?? null,
    CnaHeaders: HEADER_DIR,
  },
  Totals: {
    WASM_BOUND_INTERFACES: boundInterfaces,
    WASM_PARTIAL_INTERFACES: partialInterfaces,
    WASM_ABSENT_INTERFACES: absentInterfaces,
    WASM_BOUND_METHODS: boundMethods,
    WASM_ABSENT_METHODS: rows.length,
    ACTIONABLE_LOCAL: actionable.length,
    UNCLASSIFIED_WASM_BACKEND_GAP: actionable.length + unreasoned.length + unknownStatus.length,
    STALE_CLASSIFICATIONS: stale.length,
    UNWIRED_WASM_FACADES: unwired.length,
  },
  Interfaces: Object.fromEntries([...families].sort(([a], [b]) => a.localeCompare(b))),
  Methods: rows.sort((a, b) =>
    a.Interface.localeCompare(b.Interface) || a.Method.localeCompare(b.Method)),
};

const jsonAt = argumentAfter("--json");
if (jsonAt) fs.writeFileSync(jsonAt, `${JSON.stringify(report, null, 2)}\n`);
const markdownAt = argumentAfter("--markdown");
if (markdownAt) fs.writeFileSync(markdownAt, markdown(report));

for (const [key, value] of Object.entries(report.Totals)) console.log(`${key}=${value}`);
const byStatus = new Map();
for (const row of rows) byStatus.set(row.Status, (byStatus.get(row.Status) ?? 0) + 1);
for (const [status, count] of [...byStatus].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${status.padEnd(30)} ${count}`);
}
for (const row of actionable) console.log(`ACTIONABLE ${row.Interface}.${row.Method}`);
for (const row of unreasoned) console.log(`NO_REASON  ${row.Interface}.${row.Method}`);
for (const row of unknownStatus) console.log(`BAD_STATUS ${row.Interface}.${row.Method} ${row.Status}`);
for (const key of stale) console.log(`STALE      ${key}`);
for (const name of unwired) console.log(`UNWIRED    ${name} is never constructed by WasmBackend`);

function argumentAfter(flag) {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : null;
}

function markdown(model) {
  const lines = [
    "# The WebAssembly backend's gap, method by method",
    "",
    "Generated by `tools/wasm/backend-gap.mjs`. Every public backend method the WebAssembly",
    "backend does not implement appears here with the CNA routes the Node-API backend reaches for",
    "it, whether the running artifact exports them, and why this backend does not.",
    "",
    `Artifact: \`${model.GeneratedFrom.Artifact ?? "not asked"}\``,
    "",
    "## Totals",
    "",
    "```text",
    ...Object.entries(model.Totals).map(([key, value]) => `${key}=${value}`),
    "```",
    "",
    "## Interfaces",
    "",
    "| interface | methods | bound | absent |",
    "| --- | ---: | ---: | ---: |",
    ...Object.entries(model.Interfaces).map(([name, f]) =>
      `| \`${name}\` | ${f.total} | ${f.bound} | ${f.absent} |`),
    "",
    "## Absent methods",
    "",
    "| interface | method | status | reason | CNA routes |",
    "| --- | --- | --- | --- | ---: |",
    ...model.Methods.map((row) =>
      `| \`${row.Interface}\` | \`${row.Method}\` | ${row.Status} | ${row.Reason ?? ""} | ${row.CnaRoutes.length} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

if (process.argv.includes("--check")) {
  const failures =
    actionable.length + unreasoned.length + unknownStatus.length + stale.length + unwired.length;
  process.exit(failures === 0 ? 0 : 1);
}
