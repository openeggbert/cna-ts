#!/usr/bin/env node

/**
 * The WebAssembly backend's frontier: what it binds, what it does not, and — for what it does not —
 * what the running artifact answers when asked anyway.
 *
 * Every interface in `src/internal/backend-base.ts` is either implemented whole by this backend or
 * absent from it. "Absent" is not one condition, and the family name never says which it is: CNA
 * may refuse the routes on this build, or CNA may answer them perfectly well and nobody has bound
 * them yet. Those call for opposite decisions, so this asks rather than infers.
 *
 * The asking is deliberately crude. Every argument is a null handle or a zeroed buffer, so
 * `INVALID_HANDLE` and `INVALID_ARGUMENT` are the *expected* answers: they mean CNA got as far as
 * validating, which is all this needs to know. The answer that matters is `NOT_SUPPORTED`, because
 * that is CNA saying this build or this platform cannot, however the binding is written.
 *
 * Result codes come from `src/internal/cna-results.ts`, which this package verifies against the
 * headers. A first version of this tool guessed them, and read `INVALID_HANDLE` as `OUT_OF_MEMORY`
 * — which turned "CNA validated my null handle" into "CNA failed to allocate", and would have made
 * fourteen healthy families look broken.
 *
 *   CNA_WASM_ARTIFACT_DIR=.../cmake-build-tswasm-fx/modules/c-api \
 *     CNA_SOURCE_PATH=.../cnanext node tools/wasm/report-frontier.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CNA = path.resolve(process.env.CNA_SOURCE_PATH ?? path.join(ROOT, "../../cnanext"));
const HEADERS = path.join(CNA, "modules/c-api/include/CNA/C");

let text = "";
for (const entry of fs.readdirSync(HEADERS)) {
  if (entry.endsWith(".h")) text += fs.readFileSync(path.join(HEADERS, entry), "utf8");
}
const flat = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
const declared = new Map();
for (const m of flat.matchAll(/CNA_C_API CNA_Result (cna_[a-z0-9_]+)\s*\(([^;]*?)\)\s*;/g)) {
  declared.set(m[1], m[2].trim() === "void" ? [] : m[2].split(",").map((p) => p.trim()));
}

const dir = process.env.CNA_WASM_ARTIFACT_DIR;
const factory = (await import(path.join(dir, "cna_c_api.mjs"))).default;
const module = await factory({
  locateFile: (f) => path.join(dir, f), print: () => {}, printErr: () => {},
});

// Taken from src/internal/cna-results.ts, which is the table this package verifies against the
// headers -- not guessed. A first attempt guessed, and read INVALID_HANDLE as OUT_OF_MEMORY, which
// turned "CNA validated my null handle" into "CNA failed to allocate".
const RESULT = Object.fromEntries(Object.entries(
  (await import(path.join(ROOT, "dist/internal/cna-results.js"))).CnaResult,
).map(([name, code]) => [code, name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()]));

/** One argument per declared parameter: a handle is a BigInt, a pointer is zeroed memory. */
function synthesise(parameters, scope) {
  return parameters.map((parameter) => {
    if (/\*/.test(parameter)) { const p = module._malloc(64); new Uint8Array(module.HEAPU8.buffer, p, 64).fill(0); scope.push(p); return p; }
    if (/\b(uint64_t|int64_t|CNA_Handle|CNA_[A-Za-z]*Handle)\b/.test(parameter)) return 0n;
    if (/\b(float|double)\b/.test(parameter)) return 0;
    return 0;
  });
}

function ask(route) {
  const fn = module[`_${route}`];
  const parameters = declared.get(route);
  if (typeof fn !== "function") return "NOT_EXPORTED";
  if (parameters === undefined) return "NOT_DECLARED";
  const scope = [];
  try {
    const code = fn(...synthesise(parameters, scope));
    return RESULT[code] ?? `RESULT_${code}`;
  } catch (error) {
    return `THREW ${String(error?.message ?? error).slice(0, 40)}`;
  } finally { for (const p of scope) module._free(p); }
}

// The absent families' routes, taken from the Node bridge so they are the routes Node proved.
const base = await import(path.join(ROOT, "dist/internal/backend-base.js"));
const mods = {};
for (const entry of fs.readdirSync(path.join(ROOT, "dist/internal/wasm"))) {
  if (entry.endsWith(".js")) mods[entry] = await import(path.join(ROOT, "dist/internal/wasm", entry));
}
const impl = new Map();
for (const m of Object.values(mods)) for (const value of Object.values(m)) {
  if (typeof value !== "function" || !/^Wasm/.test(value.name)) continue;
  const members = new Set();
  for (let p = value.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const n of Object.getOwnPropertyNames(p)) members.add(n);
  }
  for (const [bn, cls] of Object.entries(base)) {
    if (typeof cls !== "function" || !/BackendBase$/.test(bn)) continue;
    if (value.prototype instanceof cls) {
      const prev = impl.get(bn);
      if (!prev || members.size > prev.members.size) impl.set(bn, { members });
    }
  }
}
const backendClass = Object.values(mods).flatMap((m) => Object.values(m))
  .find((v) => typeof v === "function" && v.name === "WasmBackend");
const backendMembers = new Set();
for (let p = backendClass?.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
  for (const n of Object.getOwnPropertyNames(p)) backendMembers.add(n);
}
const bridge = fs.readFileSync(path.join(ROOT, "native/cna_node_bridge.c"), "utf8");
const exported = new Map();
for (const m of bridge.matchAll(/\{\s*"([A-Za-z0-9_]+)"\s*,\s*NULL\s*,\s*([A-Za-z0-9_]+)\s*,/g)) exported.set(m[1], m[2]);
const bodies = new Map();
const fnRe = /static\s+napi_value\s+([A-Za-z0-9_]+)\s*\(napi_env[^)]*\)\s*\{/g;
let match;
while ((match = fnRe.exec(bridge))) {
  let i = fnRe.lastIndex - 1, depth = 0, end = i;
  for (; i < bridge.length; i += 1) {
    if (bridge[i] === "{") depth += 1;
    else if (bridge[i] === "}") { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  bodies.set(match[1], bridge.slice(fnRe.lastIndex, end));
}

const totals = new Map();
for (const [bn, cls] of Object.entries(base)) {
  if (typeof cls !== "function" || !/BackendBase$/.test(bn)) continue;
  const all = Object.getOwnPropertyNames(cls.prototype)
    .filter((m) => m !== "constructor" && m !== "unsupported")
    .filter((m) => typeof Object.getOwnPropertyDescriptor(cls.prototype, m)?.value === "function");
  const got = impl.get(bn);
  const missing = all.filter((m) => !got?.members.has(m) && !backendMembers.has(m));
  if (missing.length === 0) continue;
  const routes = new Set();
  for (const method of missing) {
    const body = bodies.get(exported.get(method));
    if (!body) continue;
    for (const r of body.matchAll(/\bcna_[a-z0-9_]+/g)) if (declared.has(r[0])) routes.add(r[0]);
  }
  const answers = new Map();
  for (const route of routes) {
    const answer = ask(route);
    answers.set(answer, (answers.get(answer) ?? 0) + 1);
  }
  totals.set(bn.replace(/^Cna|BackendBase$/g, ""), { missing: missing.length, routes: routes.size, answers });
}

// The bound families, so the report is the whole frontier rather than only its far side.
let bound = 0, boundFamilies = 0;
for (const [bn, cls] of Object.entries(base)) {
  if (typeof cls !== "function" || !/BackendBase$/.test(bn)) continue;
  const all = Object.getOwnPropertyNames(cls.prototype)
    .filter((m) => m !== "constructor" && m !== "unsupported")
    .filter((m) => typeof Object.getOwnPropertyDescriptor(cls.prototype, m)?.value === "function");
  const got = impl.get(bn);
  const done = all.filter((m) => got?.members.has(m) || backendMembers.has(m));
  if (done.length === all.length && all.length > 0) { bound += done.length; boundFamilies += 1; }
}
console.log(`WASM_BOUND_INTERFACES=${boundFamilies} WASM_BOUND_METHODS=${bound}\n`);

let notSupported = 0, reached = 0, allRoutes = 0;
for (const [family, row] of [...totals].sort((a, b) => b[1].missing - a[1].missing)) {
  const summary = [...row.answers].sort((a, b) => b[1] - a[1])
    .map(([answer, count]) => `${answer}=${count}`).join(" ");
  notSupported += row.answers.get("NOT_SUPPORTED") ?? 0;
  allRoutes += row.routes;
  reached += row.routes - (row.answers.get("NOT_SUPPORTED") ?? 0);
  console.log(`${String(row.missing).padStart(4)} ${family.padEnd(22)} routes=${String(row.routes).padStart(3)}  ${summary}`);
}
console.log(`\nWASM_ABSENT_INTERFACES=${totals.size}`);
console.log(`ABSENT_FAMILY_ROUTES_ASKED=${allRoutes}`);
console.log(`ANSWERED_NOT_SUPPORTED=${notSupported}`);
console.log(`ANSWERED_SOMETHING_ELSE=${reached}`);
