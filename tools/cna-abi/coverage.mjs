#!/usr/bin/env node

/**
 * Classifies every public CNA C API declaration so that no route is unaccounted for.
 *
 * Binding every declaration blindly would be a worse contract than binding none: most of the
 * surface is either XNA value semantics this package keeps exact in TypeScript, modern CNA surface
 * that belongs outside `Microsoft.Xna.Framework`, or an alternative spelling of a route the adapter
 * already reaches. What matters is that every route has a decision behind it, so `UNEXPLAINED` is
 * the number this tool exists to hold at zero.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_RULES = path.join(ROOT, "tools/cna-abi/coverage-rules.json");

function parseArgs(values) {
  const result = {
    cnaRoot: process.env.CNA_SOURCE_PATH
      ? path.resolve(process.env.CNA_SOURCE_PATH)
      : path.join(ROOT, "../../cnanext"),
    rules: DEFAULT_RULES,
    format: "text",
    output: null,
    jsonOutput: null,
    reportOnly: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--cna-root") result.cnaRoot = path.resolve(values[++index]);
    else if (value === "--rules") result.rules = path.resolve(values[++index]);
    else if (value === "--format") result.format = values[++index];
    else if (value === "--output") result.output = path.resolve(values[++index]);
    else if (value === "--json-output") result.jsonOutput = path.resolve(values[++index]);
    else if (value === "--report-only") result.reportOnly = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  return result;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\r\n]*/g, " ");
}

/** Every `CNA_C_API` function declaration, with the header that declares it. */
export function readDeclarations(includeRoot) {
  const declarations = new Map();
  for (const header of fs.readdirSync(includeRoot).filter((name) => name.endsWith(".h")).sort()) {
    const source = stripComments(fs.readFileSync(path.join(includeRoot, header), "utf8"));
    for (const match of source.matchAll(/\bCNA_C_API\b[\s\S]*?\b(cna_[A-Za-z0-9_]+)\s*\(/g)) {
      if (!declarations.has(match[1])) declarations.set(match[1], header);
    }
  }
  return declarations;
}

function readImportedSymbols(file) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return new Set();
  const source = fs.readFileSync(file, "utf8");
  return new Set([...source.matchAll(/LOAD_REQUIRED\([^\n]*?"(cna_[A-Za-z0-9_]+)"\)/g)].map((m) => m[1]));
}

function readWasmImportedSymbols(directory) {
  if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return new Set();
  const names = new Set();
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(child);
      else if (child.endsWith(".ts")) {
        const source = fs.readFileSync(child, "utf8");
        for (const match of source.matchAll(/"(_?cna_[A-Za-z0-9_]+)"/g)) {
          names.add(match[1].replace(/^_/, ""));
        }
      }
    }
  }
  return names;
}

export function classify(declarations, rules, nodeImports, wasmImports) {
  // A header the adapter imports nothing from is a family it does not reach at all; saying its
  // routes "back a member the binding covers" would be false. Measure reach first.
  const reachedHeaders = new Set();
  for (const [name, header] of declarations) {
    if (nodeImports.has(name) || wasmImports.has(name)) reachedHeaders.add(header);
  }
  const rows = [];
  for (const [name, header] of [...declarations].sort(([left], [right]) => left.localeCompare(right))) {
    if (nodeImports.has(name)) {
      rows.push({ name, header, category: "NODE_IMPORTED", reason: "imported by the Node-API adapter" });
      continue;
    }
    if (wasmImports.has(name)) {
      rows.push({ name, header, category: "WASM_IMPORTED", reason: "imported by the WebAssembly backend" });
      continue;
    }
    const rule = rules.rules.find((candidate) => {
      if (candidate.headers && !candidate.headers.includes(header)) return false;
      if (candidate.namePattern && !new RegExp(candidate.namePattern).test(name)) return false;
      return Boolean(candidate.headers || candidate.namePattern);
    });
    if (!rule) {
      rows.push({ name, header, category: "UNEXPLAINED", reason: "no rule claims this route" });
      continue;
    }
    const unreached = rule.requireHeaderReached === true && !reachedHeaders.has(header);
    rows.push({
      name,
      header,
      category: unreached ? rule.unreachedCategory : rule.category,
      reason: unreached ? rule.unreachedReason : rule.reason,
    });
  }
  return rows;
}

export function summarize(rows, rules) {
  const totals = Object.fromEntries(Object.keys(rules.categories).map((key) => [key, 0]));
  for (const row of rows) totals[row.category] = (totals[row.category] ?? 0) + 1;
  const byHeader = new Map();
  for (const row of rows) {
    if (!byHeader.has(row.header)) byHeader.set(row.header, {});
    const bucket = byHeader.get(row.header);
    bucket[row.category] = (bucket[row.category] ?? 0) + 1;
  }
  return {
    totalFunctions: rows.length,
    totals,
    byHeader: Object.fromEntries([...byHeader].sort(([left], [right]) => left.localeCompare(right))),
    unexplained: rows.filter((row) => row.category === "UNEXPLAINED").map((row) => `${row.header}:${row.name}`),
  };
}

export function run(args) {
  const includeRoot = path.join(args.cnaRoot, "modules/c-api/include/CNA/C");
  if (!fs.statSync(includeRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`CNA public C headers not found: ${includeRoot}`);
  }
  const rules = JSON.parse(fs.readFileSync(args.rules, "utf8"));
  const declarations = readDeclarations(includeRoot);
  const nodeImports = readImportedSymbols(path.join(ROOT, "native/cna_node_bridge.c"));
  const wasmImports = readWasmImportedSymbols(path.join(ROOT, "src/internal/wasm"));
  const rows = classify(declarations, rules, nodeImports, wasmImports);
  // A route both backends import is counted once in the exclusive category and again in these
  // per-backend totals, because "how much of the ABI does each backend reach" is a different
  // question from "what is each route for".
  const declared = new Set(declarations.keys());
  const nodeTotal = [...nodeImports].filter((name) => declared.has(name)).length;
  const wasmTotal = [...wasmImports].filter((name) => declared.has(name)).length;
  const bothTotal = [...wasmImports].filter((name) => declared.has(name) && nodeImports.has(name)).length;
  return {
    cnaRoot: args.cnaRoot,
    headers: new Set([...declarations.values()]).size,
    nodeImportedTotal: nodeTotal,
    wasmImportedTotal: wasmTotal,
    importedByBothBackends: bothTotal,
    ...summarize(rows, rules),
    rows,
  };
}

function formatText(report) {
  const lines = [
    "# CNA C API coverage",
    "",
    "Generated by `npm run coverage:cna-abi`. Every public `CNA_C_API` declaration is classified;",
    "`UNEXPLAINED` is the number this report exists to hold at zero.",
    "",
    "```text",
    `TOTAL_C_API_FUNCTIONS=${report.totalFunctions}`,
    `PUBLIC_HEADERS=${report.headers}`,
    `NODE_IMPORTED_TOTAL=${report.nodeImportedTotal}`,
    `WASM_IMPORTED_TOTAL=${report.wasmImportedTotal}`,
    `IMPORTED_BY_BOTH_BACKENDS=${report.importedByBothBackends}`,
    ...Object.entries(report.totals).map(([key, value]) => `${key}=${value}`),
    "```",
    "",
    "| Header | " + Object.keys(report.totals).filter((key) => key !== "UNEXPLAINED").join(" | ") + " | UNEXPLAINED |",
    "| --- |" + Object.keys(report.totals).map(() => " ---: |").join(""),
  ];
  const columns = [...Object.keys(report.totals).filter((key) => key !== "UNEXPLAINED"), "UNEXPLAINED"];
  for (const [header, counts] of Object.entries(report.byHeader)) {
    lines.push(`| \`${header}\` | ` + columns.map((key) => counts[key] ?? 0).join(" | ") + " |");
  }
  if (report.unexplained.length > 0) {
    lines.push("", "## Unexplained", "");
    for (const name of report.unexplained) lines.push(`- \`${name}\``);
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = run(args);
  if (args.jsonOutput) fs.writeFileSync(args.jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
  const text = args.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : formatText(report);
  if (args.output) fs.writeFileSync(args.output, text);
  else process.stdout.write(text);
  if (!args.reportOnly && report.unexplained.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
