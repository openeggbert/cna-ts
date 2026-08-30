#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? path.resolve(process.argv[index + 1]) : fallback;
}
// The inputs and outputs are addressable so the mutation controls in
// test/runtime-capabilities.test.mjs can prove the consistency gate fails, without writing over
// the checked-in evidence.
const sourcePath = argument("--source", path.join(ROOT, "tools/runtime-capabilities/source.json"));
const jsonPath = argument("--json-output", path.join(ROOT, "docs/runtime-capabilities.json"));
const markdownPath = argument("--markdown-output", path.join(ROOT, "docs/runtime-capabilities.md"));
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

function sourceFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(file));
    else if (entry.isFile() && file.endsWith(".ts")) result.push(file);
  }
  return result;
}

const auditedFiles = sourceFiles(path.join(ROOT, source.sourceAudit.root));
const auditedSources = auditedFiles.map((file) => fs.readFileSync(file, "utf8"));
const sourceAudit = {
  ...source.sourceAudit,
  nativeUnavailableErrorSites: auditedSources.reduce(
    (total, value) => total + [...value.matchAll(/throw new NativeUnavailableError/g)].length, 0),
  notSupportedExceptionSites: auditedSources.reduce(
    (total, value) => total + [...value.matchAll(/throw new NotSupportedException/g)].length, 0),
  filesWithExplicitFailureSites: auditedSources.filter((value) =>
    value.includes("throw new NativeUnavailableError") || value.includes("throw new NotSupportedException")).length,
};
for (const field of ["nativeUnavailableErrorSites", "notSupportedExceptionSites", "filesWithExplicitFailureSites"]) {
  if (sourceAudit[field] !== source.sourceAudit[field]) {
    throw new Error(`source audit ${field} changed: expected ${source.sourceAudit[field]}, found ${sourceAudit[field]}`);
  }
}
const categories = new Set(source.categories);
const operations = new Set();
for (const [index, entry] of source.entries.entries()) {
  if (!entry.operation?.trim()) throw new Error(`entry ${index} has no operation`);
  if (!categories.has(entry.category)) throw new Error(`entry ${index} has invalid category ${entry.category}`);
  if (!entry.owner?.trim() || !entry.evidence?.trim()) throw new Error(`entry ${index} lacks owner/evidence`);
  if (operations.has(entry.operation)) throw new Error(`duplicate operation family: ${entry.operation}`);
  operations.add(entry.operation);
}

/**
 * The consistency gate. Prose is not evidence, so a row claiming a category has to name something
 * a machine can look at: a test file that exists, a route the Node adapter imports, a route the
 * WebAssembly backend imports, or -- for a row claiming something is *not* implemented -- a route
 * that is declared upstream and imported by neither backend. A row that says "verified" while
 * nothing backs it is exactly the documentation contradiction this exists to refuse.
 */
const nodeRoutes = new Set(
  [...fs.readFileSync(path.join(ROOT, "native/cna_node_bridge.c"), "utf8")
    .matchAll(/LOAD_REQUIRED\([^\n]*?"(cna_[A-Za-z0-9_]+)"\)/g)].map((match) => match[1]),
);
const wasmRoutes = new Set(
  [...fs.readFileSync(path.join(ROOT, "src/internal/wasm/wasm-backend.ts"), "utf8")
    .matchAll(/"(cna_[A-Za-z0-9_]+)"/g)].map((match) => match[1]),
);
const headerRoot = path.resolve(
  process.env.CNA_SOURCE_PATH ?? path.join(ROOT, "../../cnanext"), "modules/c-api/include/CNA/C",
);
const headersPresent = fs.statSync(headerRoot, { throwIfNoEntry: false })?.isDirectory() === true;
const declaredRoutes = new Set();
if (headersPresent) {
  for (const header of fs.readdirSync(headerRoot).filter((name) => name.endsWith(".h"))) {
    const text = fs.readFileSync(path.join(headerRoot, header), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
    for (const match of text.matchAll(/\bCNA_C_API\b[\s\S]*?\b(cna_[A-Za-z0-9_]+)\s*\(/g)) {
      declaredRoutes.add(match[1]);
    }
  }
}
const REQUIRED_PROOF = {
  VERIFIED_MANAGED: ["test"],
  VERIFIED_NATIVE: ["route"],
  VERIFIED_WEBASSEMBLY: ["wasmRoute", "test"],
  UNIMPLEMENTED_CNA_TS: ["absentRoute"],
};
const consistency = [];
for (const entry of source.entries) {
  const required = REQUIRED_PROOF[entry.category];
  const proof = entry.proof ?? [];
  for (const claim of proof) {
    const [kind, value] = [claim.slice(0, claim.indexOf(":")), claim.slice(claim.indexOf(":") + 1)];
    if (kind === "test" || kind === "source") {
      if (!fs.existsSync(path.join(ROOT, value))) {
        consistency.push(`${entry.operation}: ${value} does not exist`);
      }
    } else if (kind === "route") {
      if (!nodeRoutes.has(value)) consistency.push(`${entry.operation}: the Node adapter does not import ${value}`);
    } else if (kind === "wasmRoute") {
      if (!wasmRoutes.has(value)) consistency.push(`${entry.operation}: the WebAssembly backend does not import ${value}`);
    } else if (kind === "absentRoute") {
      if (nodeRoutes.has(value) || wasmRoutes.has(value)) {
        consistency.push(`${entry.operation}: claims ${value} is unimplemented but a backend imports it`);
      }
      if (headersPresent && !declaredRoutes.has(value)) {
        consistency.push(`${entry.operation}: ${value} is not declared by the canonical headers`);
      }
    } else {
      consistency.push(`${entry.operation}: unknown proof kind ${kind}`);
    }
  }
  if (!required) continue;
  for (const kind of required) {
    if (!proof.some((claim) => claim.startsWith(`${kind}:`))) {
      consistency.push(`${entry.operation}: ${entry.category} needs at least one ${kind} proof`);
    }
  }
}
if (consistency.length > 0) {
  throw new Error(`runtime capability inventory is inconsistent:\n  ${consistency.join("\n  ")}`);
}
const counts = Object.fromEntries(source.categories.map((category) => [category, 0]));
for (const entry of source.entries) counts[entry.category] += 1;
const output = {
  schemaVersion: source.schemaVersion,
  generatedFrom: "tools/runtime-capabilities/source.json",
  profile: source.profile,
  environment: source.environment,
  granularity: source.granularity,
  sourceAudit,
  counts,
  entries: [...source.entries].sort((left, right) =>
    left.category.localeCompare(right.category) || left.operation.localeCompare(right.operation)),
};
fs.writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);

const lines = [
  "# Runtime capability and blocker inventory",
  "",
  `Profile: **${source.profile}**`,
  "",
  `Selected evidence environment: **${source.environment}**`,
  "",
  source.granularity,
  "This inventory is independent of the strict API verifier: API shape completeness does not imply runtime capability.",
  "",
  "## Explicit failure-site audit",
  "",
  sourceAudit.scope,
  "",
  `- NativeUnavailableError construction sites: ${sourceAudit.nativeUnavailableErrorSites}`,
  `- NotSupportedException construction sites: ${sourceAudit.notSupportedExceptionSites}`,
  `- Framework files containing those sites: ${sourceAudit.filesWithExplicitFailureSites}`,
  "",
  "## Counts",
  "",
  "| Category | Operation families |",
  "| --- | ---: |",
  ...source.categories.map((category) => `| ${category} | ${counts[category]} |`),
];
for (const category of source.categories) {
  lines.push("", `## ${category}`, "", "| Operation family | Owner/boundary | Evidence |", "| --- | --- | --- |");
  for (const entry of output.entries.filter((value) => value.category === category)) {
    const clean = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
    lines.push(`| ${clean(entry.operation)} | ${clean(entry.owner)} | ${clean(entry.evidence)} |`);
  }
}
fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`);
console.log(`RUNTIME_CAPABILITY_ENTRIES=${source.entries.length}`);
console.log(`CONSISTENCY_GATE=PASS`);
console.log(`PROVED_ENTRIES=${source.entries.filter((entry) => (entry.proof ?? []).length > 0).length}`);
console.log(`CANONICAL_HEADERS_READ=${headersPresent ? 1 : 0}`);
for (const category of source.categories) console.log(`${category}=${counts[category]}`);
