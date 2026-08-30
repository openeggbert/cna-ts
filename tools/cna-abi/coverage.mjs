#!/usr/bin/env node

/**
 * Classifies every public CNA C API declaration so that no route is unaccounted for.
 *
 * Binding every declaration blindly would be a worse contract than binding none: most of the
 * surface is either XNA value semantics this package keeps exact in TypeScript, modern CNA surface
 * that belongs outside `Microsoft.Xna.Framework`, or an alternative spelling of a route the adapter
 * already reaches. What matters is that every route has a decision behind it, so `UNEXPLAINED` is
 * the number this tool exists to hold at zero.
 *
 * The report has two independent axes, because "what is this route for" and "can a consumer reach
 * it today" are different questions:
 *
 * - **purpose** is exclusive and rule-driven: exactly one of `XNA_BACKING`,
 *   `CNA_EXTENSION_BACKING`, `INTERNAL_RUNTIME_ONLY`, `MANAGED_BY_DESIGN`, `TOOLING_ONLY`,
 *   `INTENTIONALLY_DEFERRED`, `UPSTREAM_RUNTIME_UNAVAILABLE` or `UNEXPLAINED`;
 * - **reachability** is measured, not declared: which backends import the route, read out of the
 *   Node adapter's C source and the WebAssembly backend's route table.
 *
 * Collapsing the two -- which this report used to do, by classifying an imported route as
 * `NODE_IMPORTED` before any rule ran -- made both unanswerable. Every route both backends import
 * landed in the Node column, so the WebAssembly column was zero for every header and "what is
 * usable in a browser" could not be read off the table at all; and an imported route had no
 * purpose, so "what backs XNA" counted only the routes the adapter does *not* import.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_RULES = path.join(ROOT, "tools/cna-abi/coverage-rules.json");

/** Backends whose reach is measured, in report order. */
export const BACKENDS = ["NODE", "WASM"];

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

export function readImportedSymbols(file) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return new Set();
  const source = fs.readFileSync(file, "utf8");
  return new Set([...source.matchAll(/LOAD_REQUIRED\([^\n]*?"(cna_[A-Za-z0-9_]+)"\)/g)].map((m) => m[1]));
}

export function readWasmImportedSymbols(directory) {
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

/**
 * Assigns each declaration its purpose and the set of backends that import it.
 *
 * `reachedHeaders` still gates the deferred-family rule: a header no backend imports anything from
 * is a family the binding does not reach at all, and saying its routes "back a member this package
 * covers" would be false. That is measured from the same import sets, so the two axes stay
 * consistent without either being hand-declared.
 */
export function classify(declarations, rules, backendImports) {
  const reachedHeaders = new Set();
  for (const [name, header] of declarations) {
    if (BACKENDS.some((backend) => backendImports[backend]?.has(name))) reachedHeaders.add(header);
  }
  const rows = [];
  for (const [name, header] of [...declarations].sort(([left], [right]) => left.localeCompare(right))) {
    const backends = BACKENDS.filter((backend) => backendImports[backend]?.has(name));
    const rule = rules.rules.find((candidate) => {
      if (candidate.headers && !candidate.headers.includes(header)) return false;
      if (candidate.namePattern && !new RegExp(candidate.namePattern).test(name)) return false;
      return Boolean(candidate.headers || candidate.namePattern);
    });
    if (!rule) {
      rows.push({ name, header, category: "UNEXPLAINED", reason: "no rule claims this route", backends });
      continue;
    }
    const unreached = rule.requireHeaderReached === true && !reachedHeaders.has(header);
    rows.push({
      name,
      header,
      category: unreached ? rule.unreachedCategory : rule.category,
      reason: unreached ? rule.unreachedReason : rule.reason,
      backends,
    });
  }
  return rows;
}

/**
 * A route a backend imports is by definition not deferred. This catches the contradiction a purely
 * header-keyed rule set can produce once a family starts being bound: importing one
 * `gamer_services.h` route while the whole header is still ruled `INTENTIONALLY_DEFERRED` would
 * otherwise be reported as deferred surface a consumer can already call.
 */
export function findReachableButDeferred(rows) {
  return rows
    .filter((row) => row.category === "INTENTIONALLY_DEFERRED" && row.backends.length > 0)
    .map((row) => `${row.header}:${row.name}`);
}

export function summarize(rows, rules) {
  const totals = Object.fromEntries(Object.keys(rules.categories).map((key) => [key, 0]));
  for (const row of rows) totals[row.category] = (totals[row.category] ?? 0) + 1;

  const byHeader = new Map();
  for (const row of rows) {
    if (!byHeader.has(row.header)) byHeader.set(row.header, {});
    const bucket = byHeader.get(row.header);
    bucket[row.category] = (bucket[row.category] ?? 0) + 1;
    for (const backend of row.backends) bucket[`REACHABLE_${backend}`] = (bucket[`REACHABLE_${backend}`] ?? 0) + 1;
  }

  // "What is usable through Wasm, and what is it for" is the question this cross-tabulation exists
  // to answer; a per-backend total alone cannot distinguish a browser that reaches XNA surface from
  // one that only reaches extensions.
  const reachabilityByCategory = {};
  for (const category of Object.keys(rules.categories)) {
    reachabilityByCategory[category] = Object.fromEntries(BACKENDS.map((backend) => [backend, 0]));
  }
  const reachable = Object.fromEntries(BACKENDS.map((backend) => [backend, 0]));
  let reachableByAny = 0;
  let reachableByAll = 0;
  for (const row of rows) {
    for (const backend of row.backends) {
      reachable[backend] += 1;
      reachabilityByCategory[row.category][backend] += 1;
    }
    if (row.backends.length > 0) reachableByAny += 1;
    if (row.backends.length === BACKENDS.length) reachableByAll += 1;
  }

  return {
    totalFunctions: rows.length,
    totals,
    reachable,
    reachableByAny,
    reachableByAll,
    reachableExclusively: Object.fromEntries(
      BACKENDS.map((backend) => [
        backend,
        rows.filter((row) => row.backends.length === 1 && row.backends[0] === backend).length,
      ]),
    ),
    reachabilityByCategory,
    byHeader: Object.fromEntries([...byHeader].sort(([left], [right]) => left.localeCompare(right))),
    unexplained: rows.filter((row) => row.category === "UNEXPLAINED").map((row) => `${row.header}:${row.name}`),
    reachableButDeferred: findReachableButDeferred(rows),
  };
}

export function run(args) {
  const includeRoot = path.join(args.cnaRoot, "modules/c-api/include/CNA/C");
  if (!fs.statSync(includeRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`CNA public C headers not found: ${includeRoot}`);
  }
  const rules = JSON.parse(fs.readFileSync(args.rules, "utf8"));
  const declarations = readDeclarations(includeRoot);
  const declared = new Set(declarations.keys());
  // Only declared routes count as reach: a name matched in the backend sources that the headers do
  // not declare is not part of the public C API and must not inflate a coverage number.
  const restrict = (names) => new Set([...names].filter((name) => declared.has(name)));
  const backendImports = {
    NODE: restrict(readImportedSymbols(path.join(ROOT, "native/cna_node_bridge.c"))),
    WASM: restrict(readWasmImportedSymbols(path.join(ROOT, "src/internal/wasm"))),
  };
  const rows = classify(declarations, rules, backendImports);
  return {
    cnaRoot: args.cnaRoot,
    headers: new Set([...declarations.values()]).size,
    backends: BACKENDS,
    ...summarize(rows, rules),
    rows,
  };
}

function formatText(report) {
  const categories = Object.keys(report.totals);
  const lines = [
    "# CNA C API coverage",
    "",
    "Generated by `npm run coverage:cna-abi`. Every public `CNA_C_API` declaration is classified on",
    "two independent axes: what the route is *for*, which is exclusive and must never be",
    "`UNEXPLAINED`, and which backends actually *reach* it, which is measured from the Node adapter's",
    "C source and the WebAssembly backend's route table rather than declared.",
    "",
    "```text",
    `TOTAL_C_API_FUNCTIONS=${report.totalFunctions}`,
    `PUBLIC_HEADERS=${report.headers}`,
    ...categories.map((key) => `${key}=${report.totals[key]}`),
    "```",
    "",
    "## Backend reach",
    "",
    "```text",
    ...BACKENDS.map((backend) => `REACHABLE_${backend}=${report.reachable[backend]}`),
    `REACHABLE_BY_ANY_BACKEND=${report.reachableByAny}`,
    `REACHABLE_BY_EVERY_BACKEND=${report.reachableByAll}`,
    ...BACKENDS.map((backend) => `REACHABLE_${backend}_ONLY=${report.reachableExclusively[backend]}`),
    `REACHABLE_BUT_DEFERRED=${report.reachableButDeferred.length}`,
    "```",
    "",
    "What each backend reaches, by what the routes are for:",
    "",
    `| Purpose | Total | ${BACKENDS.map((backend) => `${backend} reach`).join(" | ")} |`,
    `| --- | ---: |${BACKENDS.map(() => " ---: |").join("")}`,
    ...categories
      .filter((key) => report.totals[key] > 0)
      .map(
        (key) =>
          `| \`${key}\` | ${report.totals[key]} | ` +
          BACKENDS.map((backend) => report.reachabilityByCategory[key][backend]).join(" | ") +
          " |",
      ),
    "",
    "## By header",
    "",
  ];
  const columns = [
    ...BACKENDS.map((backend) => `REACHABLE_${backend}`),
    ...categories.filter((key) => key !== "UNEXPLAINED"),
    "UNEXPLAINED",
  ];
  lines.push(
    `| Header | ${columns.join(" | ")} |`,
    "| --- |" + columns.map(() => " ---: |").join(""),
  );
  for (const [header, counts] of Object.entries(report.byHeader)) {
    lines.push(`| \`${header}\` | ` + columns.map((key) => counts[key] ?? 0).join(" | ") + " |");
  }
  if (report.unexplained.length > 0) {
    lines.push("", "## Unexplained", "");
    for (const name of report.unexplained) lines.push(`- \`${name}\``);
  }
  if (report.reachableButDeferred.length > 0) {
    lines.push("", "## Reachable but classified deferred", "");
    for (const name of report.reachableButDeferred) lines.push(`- \`${name}\``);
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
  if (!args.reportOnly && (report.unexplained.length > 0 || report.reachableButDeferred.length > 0)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
