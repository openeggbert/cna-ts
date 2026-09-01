#!/usr/bin/env node

/**
 * Checks every CNA route call in the WebAssembly backend against that route's C declaration.
 *
 * Two mistakes this catches, both of which compile and both of which fail only at the call:
 *
 * **Arity.** A route invoked with the wrong number of arguments reaches the module as a call with
 * missing or extra parameters. Emscripten does not check, so a missing trailing out-pointer is a
 * write to address zero and an extra argument is ignored — either way the failure surfaces
 * somewhere else, later.
 *
 * **64-bit arguments.** The artifact is linked with `WASM_BIGINT`, so an `i64` parameter must be
 * given a JavaScript `BigInt`. Handing it a `Number` throws `Cannot convert 256 to a BigInt` from
 * inside the export — a runtime error in a route that type-checks perfectly. This was not
 * hypothetical: `createStorageBuffer` shipped that way for the length of one build, and the
 * browser census found it.
 *
 * The declaration is read from CNA's own headers, so this is the WebAssembly counterpart of the
 * signature verification `audit:cna-abi` already does for the Node-API bridge.
 *
 *   CNA_SOURCE_PATH=/path/to/cnanext node tools/wasm/verify-route-calls.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WASM_DIR = path.join(ROOT, "src/internal/wasm");
const CNA_ROOT = process.env.CNA_SOURCE_PATH
  ? path.resolve(process.env.CNA_SOURCE_PATH)
  : path.resolve(ROOT, "../../cnanext");
const HEADER_DIR = path.join(CNA_ROOT, "modules/c-api/include/CNA/C");

if (!fs.statSync(HEADER_DIR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`no CNA headers at ${HEADER_DIR}; set CNA_SOURCE_PATH`);
  process.exit(2);
}

/** Every route's declared parameter list, flattened so a declaration can span lines. */
function declarations() {
  let text = "";
  for (const entry of fs.readdirSync(HEADER_DIR)) {
    if (entry.endsWith(".h")) text += fs.readFileSync(path.join(HEADER_DIR, entry), "utf8");
  }
  const flat = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
  const routes = new Map();
  for (const match of flat.matchAll(/CNA_C_API CNA_Result (cna_[a-z0-9_]+)\s*\(([^;]*?)\)\s*;/g)) {
    const parameters = match[2].trim() === "void" ? [] : match[2].split(",").map((p) => p.trim());
    routes.set(match[1], parameters);
  }
  return routes;
}

/** The `uint64_t`/`int64_t`/`CNA_Handle` parameters, which must be given a `BigInt`. */
function wideParameters(parameters) {
  return parameters.map((parameter) =>
    !/\*/.test(parameter) && /\b(uint64_t|int64_t|CNA_Handle|CNA_[A-Za-z]*Handle)\b/.test(parameter));
}

/** Splits an argument list on top-level commas. */
function splitArguments(text) {
  const parts = [];
  let depth = 0, current = "";
  for (const character of text) {
    if (character === "," && depth === 0) { parts.push(current.trim()); current = ""; continue; }
    if ("([{".includes(character)) depth += 1;
    else if (")]}".includes(character)) depth -= 1;
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** An argument that certainly is a `BigInt`, certainly is not, or cannot be decided statically. */
function bigintness(argument) {
  if (/^BigInt\(/.test(argument) || /^\d+n$/.test(argument)) return true;
  if (/^0x[0-9a-f]+n$/i.test(argument)) return true;
  if (/^-?\d+(\.\d+)?$/.test(argument)) return false;
  if (/^Math\.trunc\(/.test(argument) || /^Number\(/.test(argument)) return false;
  if (/>>>\s*0$/.test(argument) || /\|\s*0$/.test(argument)) return false;
  return null;
}

/** The routes each helper adds after the caller's own arguments. */
const TRAILING = {
  invoke: 0, call: 0, outHandle: 1, outU64: 1, outU32: 1,
  bool: 1, int: 1, u32: 1, float: 1, u64AsNumber: 1, vector2: 1, vector3: 1, matrix: 1,
  bounds: 1, create: 1,
};

const routes = declarations();
const problems = [];
let checked = 0;
let spread = 0;
for (const entry of fs.readdirSync(WASM_DIR)) {
  if (!entry.endsWith(".ts")) continue;
  const file = path.join(WASM_DIR, entry);
  const source = fs.readFileSync(file, "utf8");
  const lines = source.split("\n");
  // Calls are matched across lines, so a wrapped argument list is one call rather than several --
  // and the closing bracket is found by counting rather than by a non-greedy match, because nearly
  // every call in this backend has another call inside its argument list.
  const flat = source.replace(/\n\s*/g, " ");
  const pattern =
    /\.(invoke|call|outHandle|outU64|outU32|bool|int|u32|float|u64AsNumber|vector2|vector3|matrix|bounds|create)\(\s*"(cna_[a-z0-9_]+)"/g;
  for (const match of flat.matchAll(pattern)) {
    const [, helper, route] = match;
    let index = match.index + match[0].length, depth = 1, end = index;
    for (; index < flat.length; index += 1) {
      const character = flat[index];
      if ("([{".includes(character)) depth += 1;
      else if (")]}".includes(character)) {
        depth -= 1;
        if (depth === 0) { end = index; break; }
      }
    }
    const rest = flat.slice(match.index + match[0].length, end).replace(/^\s*,\s*/, "");
    const declared = routes.get(route);
    if (declared === undefined) {
      problems.push({ file: entry, route, kind: "UNDECLARED", detail: "no CNA declaration" });
      continue;
    }
    checked += 1;
    const args = rest ? splitArguments(rest) : [];
    // A spread stands for an unknown number of arguments, so its call's arity cannot be counted
    // statically. Reported as unchecked rather than as a violation: `pack_depth` takes four
    // `float*` outputs written as one array, and a checker that called that wrong would be
    // training a reader to ignore it.
    if (args.some((argument) => argument.startsWith("..."))) {
      spread += 1;
      continue;
    }
    const expected = declared.length - TRAILING[helper];
    if (args.length !== expected) {
      problems.push({
        file: entry, route, kind: "ARITY",
        detail: `${args.length} argument(s) for ${expected}` +
          ` (${declared.length} declared, ${TRAILING[helper]} supplied by ${helper})`,
      });
      continue;
    }
    const wide = wideParameters(declared);
    args.forEach((argument, index) => {
      const isBig = bigintness(argument);
      if (isBig === null) return;
      if (wide[index] && !isBig) {
        problems.push({
          file: entry, route, kind: "NOT_BIGINT",
          detail: `argument ${index} (${declared[index]}) is given ${argument}`,
        });
      }
      if (!wide[index] && isBig) {
        problems.push({
          file: entry, route, kind: "UNEXPECTED_BIGINT",
          detail: `argument ${index} (${declared[index]}) is given ${argument}`,
        });
      }
    });
  }
  void lines;
}

console.log(`WASM_ROUTE_CALLS_CHECKED=${checked - spread}`);
console.log(`WASM_ROUTE_CALLS_SPREAD_UNCHECKED=${spread}`);
for (const kind of ["UNDECLARED", "ARITY", "NOT_BIGINT", "UNEXPECTED_BIGINT"]) {
  console.log(`WASM_ROUTE_CALL_${kind}=${problems.filter((p) => p.kind === kind).length}`);
}
for (const problem of problems) {
  console.log(`${problem.kind} ${problem.file} ${problem.route}: ${problem.detail}`);
}
process.exit(problems.length === 0 ? 0 : 1);
