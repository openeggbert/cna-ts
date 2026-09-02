#!/usr/bin/env node

/**
 * Checks that every structure field the WebAssembly backend names actually exists in the measured
 * layout.
 *
 * `WasmStruct` looks a field up by name and throws "the measured layout has no field X" when it is
 * not there. That throw happens at the *first call*, not at build time, so a field the layout probe
 * never measured is invisible until something reaches the accessor that reads it -- and for an
 * accessor no scenario calls, that is never.
 *
 * Three structures shipped exactly that way. `CNA_GltfMaterialSourceEXT`,
 * `CNA_GltfMaterialTexturesEXT` and `CNA_ShadowCascadeStateEXT` each had fields the backend reads
 * and the spec did not list, so each threw the first time anything touched it; the browser census
 * never called those three accessors, because they are not zero-argument getters on a public class.
 * `tools/wasm/generate-layout.mjs` now derives the field list from CNA's headers so the spec cannot
 * fall behind, and this checks the other direction: that nothing names a field the layout has not
 * got, whatever the reason.
 *
 * The structure a given access belongs to is found by scope. A method binds one with
 * `allocateStruct(..., "CNA_Foo")` or `new WasmStruct(..., "CNA_Foo", ...)`, and every field access
 * in that method is checked against the structures named in it. A method that names none is
 * reported as UNSCOPED rather than skipped, so a helper that takes a `WasmStruct` from its caller
 * is a thing a reader is told about rather than a hole.
 *
 *   node tools/wasm/verify-struct-fields.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WASM_DIR = path.join(ROOT, "src/internal/wasm");
const LAYOUT = path.join(WASM_DIR, "layout.ts");

/** The measured layouts, read out of the generated module rather than re-measured. */
function measuredLayouts() {
  const source = fs.readFileSync(LAYOUT, "utf8");
  const layouts = new Map();
  const structPattern = /^ {2}(CNA_[A-Za-z0-9_]+): \{$/gm;
  for (const match of source.matchAll(structPattern)) {
    const end = source.indexOf("\n  },", match.index);
    const body = source.slice(match.index, end);
    const fields = new Set();
    for (const field of body.matchAll(/^ {6}([a-z_0-9]+): \{ offset:/gm)) fields.add(field[1]);
    layouts.set(match[1], fields);
  }
  return layouts;
}

/**
 * Splits a file into method-sized regions.
 *
 * A region runs from one method or function signature to the next, which is coarser than a real
 * parse and deliberately so: the question is only which structure names are in scope, and a region
 * that is slightly too large can accept a field it should have rejected but can never reject one it
 * should have accepted. False negatives, never false positives.
 */
function regions(source) {
  const starts = [];
  const pattern =
    /^ {2}(?:(?:public|private|protected)\s+)?(?:override\s+)?(?:static\s+)?(?:get\s+|set\s+)?[#a-zA-Z][A-Za-z0-9_]*(?:<[^>]*>)?\(|^(?:export\s+)?function\s/gm;
  for (const match of source.matchAll(pattern)) starts.push(match.index);
  starts.push(source.length);
  const found = [];
  for (let index = 0; index + 1 < starts.length; index += 1) {
    const start = starts[index];
    // The doc comment above a signature belongs to it. These helpers take a `WasmStruct` from
    // their caller and so name no structure in their body, but every one of them already says
    // which structure it reads in its first line -- `Reads a \`CNA_GltfMaterialTexturesEXT\` a
    // route has written`. Including the comment makes that sentence load-bearing rather than
    // decorative, which is why the convention is worth keeping.
    const before = source.slice(0, start);
    const commentEnd = before.lastIndexOf("*/");
    const commentStart = commentEnd === -1 ? -1 : before.lastIndexOf("/**", commentEnd);
    const attached = commentStart !== -1
      && before.slice(commentEnd + 2).trim() === ""
      ? source.slice(commentStart, start)
      : "";
    let end = starts[index + 1];
    const nextComment = source.lastIndexOf("/**", end);
    if (nextComment > start && source.slice(source.indexOf("*/", nextComment) + 2, end).trim() === "") {
      end = nextComment;
    }
    found.push({ start, text: attached + source.slice(start, end) });
  }
  return found;
}

/** Escapes a helper name for use in a pattern; `#` and `$` are the only characters that occur. */
function escape(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The helpers that take a structure and a field name, read from their own declarations.
 *
 * `readVector4(structure: WasmStruct, field: string)` is one; `#retainSceneCallback(pipeline, name)`
 * is not, and telling them apart by signature is what keeps a callback tag from being checked as a
 * structure field.
 */
function fieldHelpers(sources) {
  const names = new Set();
  for (const source of sources) {
    const pattern =
      /(?:function\s+|^\s{2}(?:(?:public|private|protected)\s+)?(?:override\s+)?)([#a-zA-Z][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\(\s*[a-zA-Z][A-Za-z0-9_]*\s*:\s*WasmStruct\s*,\s*[a-zA-Z][A-Za-z0-9_]*\s*:\s*string/gm;
    for (const match of source.matchAll(pattern)) names.add(match[1]);
  }
  return names;
}

const layouts = measuredLayouts();
const sources = fs.readdirSync(WASM_DIR).sort()
  .filter((entry) => entry.endsWith(".ts") && entry !== "layout.ts")
  .map((entry) => fs.readFileSync(path.join(WASM_DIR, entry), "utf8"));
const helpers = fieldHelpers(sources);
const problems = [];
let checked = 0;
let unscoped = 0;
const unscopedRegions = new Set();

for (const entry of fs.readdirSync(WASM_DIR).sort()) {
  if (!entry.endsWith(".ts") || entry === "layout.ts") continue;
  const source = fs.readFileSync(path.join(WASM_DIR, entry), "utf8");
  for (const region of regions(source)) {
    const names = [
      ...region.text.matchAll(/["`](CNA_[A-Za-z0-9_]+)["`]/g),
      ...region.text.matchAll(/WASM_STRUCT_LAYOUTS\.(CNA_[A-Za-z0-9_]+)/g),
    ].map((match) => match[1]).filter((name) => layouts.has(name));
    const accesses = [
      // `structure.getF32("field")` -- the field named on the structure itself.
      // Every accessor `WasmStruct` declares, plus `nested` and `element`, which name a field as
      // surely as a getter does. The first version listed five of them, so `setPointer`,
      // `getI64` and every nested-structure field were silently unchecked -- and the whole point
      // of this file is that an unmeasured field is invisible until something reads it.
      ...region.text.matchAll(
        /\.(?:get|set)(?:F32|F64|U32|I32|U8|U16|I64|U64|Pointer)(?:Array|Element)?\("([a-z_0-9]+)"/g),
      ...region.text.matchAll(/\.(?:nested|element)\("([a-z_0-9]+)"/g),
      // `readVector4(structure, "field")` -- the field named to a helper that reads it. These are
      // most of the interesting ones: a `CNA_Vector4`, a `CNA_BoundingBox` and a nested array all
      // reach their bytes through a helper, and the field name is an argument rather than a
      // method. A checker that only saw the first form would have missed the glTF material's
      // coordinate sets, which is the defect that prompted this file.
      //
      // Which helpers those are is read from their own signatures rather than guessed, so a call
      // like `#retainSceneCallback(pipeline, "shadow")` is not mistaken for a field access.
      ...(helpers.size === 0 ? [] : region.text.matchAll(
        new RegExp(
          `\\b(?:${[...helpers].map(escape).join("|")})\\(\\s*[A-Za-z][A-Za-z0-9_.]*\\s*,` +
          `\\s*"([a-z][a-z_0-9]*)"`,
          "g",
        ))),
    ];
    if (accesses.length === 0) continue;
    if (names.length === 0) {
      unscoped += accesses.length;
      unscopedRegions.add(`${entry}:${source.slice(0, region.start).split("\n").length}`);
      continue;
    }
    const allowed = new Set();
    for (const name of names) for (const field of layouts.get(name)) allowed.add(field);
    for (const access of accesses) {
      checked += 1;
      if (allowed.has(access[1])) continue;
      const line = source.slice(0, region.start + access.index).split("\n").length;
      problems.push({
        file: entry, line, field: access[1], structures: [...new Set(names)].join("/"),
      });
    }
  }
}

console.log(`WASM_STRUCT_LAYOUTS_MEASURED=${layouts.size}`);
console.log(`WASM_STRUCT_FIELD_HELPERS=${helpers.size}`);
console.log(`WASM_STRUCT_FIELD_ACCESSES_CHECKED=${checked}`);
console.log(`WASM_STRUCT_FIELD_ACCESSES_UNSCOPED=${unscoped}`);
console.log(`WASM_STRUCT_FIELD_UNMEASURED=${problems.length}`);
for (const region of [...unscopedRegions].sort()) console.log(`UNSCOPED ${region}`);
for (const problem of problems) {
  console.log(
    `UNMEASURED ${problem.file}:${problem.line} ${problem.structures} has no field ` +
    `${problem.field}`,
  );
}
process.exit(problems.length === 0 ? 0 : 1);
