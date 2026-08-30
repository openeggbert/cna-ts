#!/usr/bin/env node

/**
 * Proves the CNA C ABI contract this package depends on against the canonical CNA headers.
 *
 * The check is a generated C translation unit rather than a JSON comparison: every claim becomes a
 * `_Static_assert`, so an absent constant, a changed value, a changed scalar width or a changed
 * descriptor version fails to compile. The TypeScript side of each claim is read out of `src/`
 * rather than restated here, so the enumerations the package actually publishes are what gets
 * proved.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_CONTRACT = path.join(ROOT, "tools/cna-abi/contract.json");

function parseArgs(values) {
  const result = {
    cnaRoot: process.env.CNA_SOURCE_PATH
      ? path.resolve(process.env.CNA_SOURCE_PATH)
      : path.join(ROOT, "../../cnanext"),
    contract: DEFAULT_CONTRACT,
    sourceDir: path.join(ROOT, "src"),
    format: "text",
    output: null,
    reportOnly: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--cna-root") result.cnaRoot = path.resolve(values[++index]);
    else if (value === "--contract") result.contract = path.resolve(values[++index]);
    else if (value === "--source-dir") result.sourceDir = path.resolve(values[++index]);
    else if (value === "--format") result.format = values[++index];
    else if (value === "--output") result.output = path.resolve(values[++index]);
    else if (value === "--report-only") result.reportOnly = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!new Set(["text", "json"]).has(result.format)) throw new Error("--format must be text or json");
  return result;
}

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(child, out);
    else if (child.endsWith(".ts")) out.push(child);
  }
  return out;
}

/** Reads every `export enum` in the package with its evaluated member values. */
export function readTypeScriptEnums(sourceDir) {
  const enums = new Map();
  const pattern = /export enum (\w+)\s*\{([^}]*)\}/gs;
  for (const file of walk(sourceDir).sort()) {
    const text = fs.readFileSync(file, "utf8");
    let match;
    while ((match = pattern.exec(text))) {
      const members = new Map();
      for (const member of match[2].matchAll(/(\w+)\s*=\s*([^,\n]+)/g)) {
        const expression = member[2].trim();
        if (!/^[-+0-9box_a-fA-F\s|<>()]+$/.test(expression)) {
          throw new Error(`enum ${match[1]}.${member[1]} has a non-numeric initializer: ${expression}`);
        }
        members.set(member[1], Number(Function(`"use strict"; return (${expression});`)()));
      }
      enums.set(match[1], { file: path.relative(ROOT, file).replaceAll(path.sep, "/"), members });
    }
  }
  return enums;
}

function screamingSnake(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

/** Every `CNA_*` object-like macro name the canonical headers define. */
function readHeaderConstantNames(includeRoot) {
  const names = new Set();
  for (const file of fs.readdirSync(includeRoot).filter((name) => name.endsWith(".h"))) {
    const text = fs.readFileSync(path.join(includeRoot, file), "utf8");
    for (const match of text.matchAll(/^\s*#define\s+(CNA_[A-Z0-9_]+)(?![\w(])/gm)) names.add(match[1]);
  }
  return names;
}

/** Builds the claim list: one row per TypeScript enum member that must agree with a CNA constant. */
export function buildClaims(contract, enums) {
  const claims = [];
  const diagnostics = [];
  const covered = new Set(Object.keys(contract.managedEnums ?? {}));
  for (const family of contract.enumFamilies) {
    const name = family.typeScriptEnum;
    covered.add(name);
    const declaration = enums.get(name);
    if (!declaration) {
      diagnostics.push({ code: "MISSING_TYPESCRIPT_ENUM", subject: name });
      continue;
    }
    for (const [member, value] of declaration.members) {
      const translation = family.translations?.[member];
      if (translation) {
        claims.push({
          kind: "TRANSLATED",
          enumName: name,
          member,
          constant: translation.cnaConstant,
          expected: translation.cnaValue,
          typeScriptValue: value,
          translator: translation.translator,
        });
        continue;
      }
      const suffix = family.suffixOverrides?.[member] ?? screamingSnake(member);
      claims.push({
        kind: "IDENTICAL",
        enumName: name,
        member,
        constant: `${family.cnaPrefix}_${suffix}`,
        expected: value,
        typeScriptValue: value,
      });
    }
  }
  for (const name of enums.keys()) {
    if (!covered.has(name)) diagnostics.push({ code: "UNCLASSIFIED_TYPESCRIPT_ENUM", subject: name });
  }
  for (const name of Object.keys(contract.managedEnums ?? {})) {
    if (!enums.has(name)) diagnostics.push({ code: "MISSING_TYPESCRIPT_ENUM", subject: name });
  }
  return { claims, diagnostics };
}

function generateProbe(contract, claims, resultCodes) {
  const lines = [
    "/* Generated by tools/cna-abi/verify-contract.mjs. Do not edit or commit. */",
    "#include <CNA/C/cna.h>",
    "#include <stdint.h>",
    "",
  ];
  let index = 0;
  for (const scalar of contract.scalarRepresentations) {
    lines.push(
      `_Static_assert((uint64_t)(${scalar.expression}) == UINT64_C(${scalar.value}), ` +
      `"scalar ${index}: ${scalar.expression}");`,
    );
    index += 1;
  }
  for (const [name, value] of Object.entries(contract.resultCodes.constants)) {
    lines.push(`_Static_assert((uint64_t)(${name}) == UINT64_C(${value}), "result ${name}");`);
  }
  for (const [member, value] of resultCodes.values) {
    const constant = resultCodes.constants.get(member);
    if (!constant) continue;
    lines.push(
      `_Static_assert((uint64_t)(${constant}) == UINT64_C(${value}), ` +
      `"CnaResult.${member}");`,
    );
  }
  for (const [name, value] of Object.entries(contract.structVersions.declared)) {
    lines.push(`_Static_assert((uint64_t)(${name}) == UINT64_C(${value}), "version ${name}");`);
  }
  for (const claim of claims) {
    lines.push(
      `_Static_assert((uint64_t)(${claim.constant}) == UINT64_C(${claim.expected}), ` +
      `"${claim.enumName}.${claim.member}");`,
    );
  }
  lines.push("", "int main(void) { return 0; }", "");
  return lines.join("\n");
}

function compileProbe(cnaRoot, source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-contract-"));
  const file = path.join(directory, "contract_probe.c");
  fs.writeFileSync(file, source);
  try {
    const compiler = process.env.CC ?? "cc";
    const result = spawnSync(compiler, [
      "-std=c11", "-Wall", "-Wextra", "-Werror", "-fsyntax-only",
      `-I${path.join(cnaRoot, "modules/c-api/include")}`,
      file,
    ], { encoding: "utf8" });
    if (result.error) throw result.error;
    return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

/** Constants in a mapped family that no TypeScript member claims. */
function unclaimedFamilyConstants(contract, claims, headerNames) {
  const claimed = new Set(claims.map((claim) => claim.constant));
  const rows = [];
  for (const family of contract.enumFamilies) {
    const prefix = `${family.cnaPrefix}_`;
    for (const name of headerNames) {
      if (!name.startsWith(prefix) || claimed.has(name)) continue;
      rows.push({ family: family.typeScriptEnum, constant: name });
    }
  }
  return rows.sort((left, right) => left.constant.localeCompare(right.constant));
}

/** Every translation the contract declares must exist in src/internal/cna-enums.ts. */
function verifyTranslators(claims) {
  const source = fs.readFileSync(path.join(ROOT, "src/internal/cna-enums.ts"), "utf8");
  const missing = [];
  for (const claim of claims) {
    if (claim.kind !== "TRANSLATED") continue;
    if (!new RegExp(`export function ${claim.translator}\\b`).test(source)) {
      missing.push({ code: "MISSING_TRANSLATOR", subject: `${claim.enumName}.${claim.member}`, translator: claim.translator });
    }
  }
  return missing;
}

/**
 * Reads the package's own `CnaResult` table and the `CNA_RESULT_*` constant each member claims.
 *
 * The result codes were proved against the headers from `contract.json` while the TypeScript that
 * branches on them restated the numbers inline, so a wrong literal in a backend was invisible to
 * this gate. Reading the table the code actually uses closes that: the constant names come from
 * the same module, and every pair becomes a `_Static_assert` below.
 */
export function readTypeScriptResultCodes(sourceDir) {
  const file = path.join(sourceDir, "internal/cna-results.ts");
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return { values: new Map(), constants: new Map() };
  const source = fs.readFileSync(file, "utf8");
  const table = /export const CnaResult = \{([\s\S]*?)\} as const;/.exec(source);
  const names = /export const CNA_RESULT_CONSTANT_NAMES[^=]*=\s*\{([\s\S]*?)\} as const;/.exec(source);
  const values = new Map();
  const constants = new Map();
  for (const match of (table?.[1] ?? "").matchAll(/(\w+):\s*(\d+)\s*,/g)) {
    values.set(match[1], Number(match[2]));
  }
  for (const match of (names?.[1] ?? "").matchAll(/(\w+):\s*"(CNA_RESULT_\w+)"\s*,/g)) {
    constants.set(match[1], match[2]);
  }
  return { values, constants };
}

/** Diagnoses a member with no named constant, or a constant no member claims. */
export function checkResultCodeTable(resultCodes, headerNames) {
  const diagnostics = [];
  for (const [member, value] of resultCodes.values) {
    const constant = resultCodes.constants.get(member);
    if (!constant) {
      diagnostics.push({ code: "UNNAMED_RESULT_CODE", subject: `CnaResult.${member}`, detail: String(value) });
      continue;
    }
    if (!headerNames.has(constant)) {
      diagnostics.push({ code: "ABSENT_CNA_CONSTANT", subject: `CnaResult.${member}`, constant });
    }
  }
  for (const member of resultCodes.constants.keys()) {
    if (!resultCodes.values.has(member)) {
      diagnostics.push({ code: "UNVALUED_RESULT_CODE", subject: `CnaResult.${member}` });
    }
  }
  return diagnostics;
}

export function run(args) {
  const contract = JSON.parse(fs.readFileSync(args.contract, "utf8"));
  const includeRoot = path.join(args.cnaRoot, "modules/c-api/include/CNA/C");
  if (!fs.statSync(includeRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`CNA public C headers not found: ${includeRoot}`);
  }
  const enums = readTypeScriptEnums(args.sourceDir);
  const { claims, diagnostics } = buildClaims(contract, enums);
  const headerNames = readHeaderConstantNames(includeRoot);
  const absent = claims
    .filter((claim) => !headerNames.has(claim.constant))
    .map((claim) => ({ code: "ABSENT_CNA_CONSTANT", subject: `${claim.enumName}.${claim.member}`, constant: claim.constant }));
  const resultCodes = readTypeScriptResultCodes(args.sourceDir);
  const resultCodeDiagnostics = checkResultCodeTable(resultCodes, headerNames);
  const compiled = compileProbe(args.cnaRoot, generateProbe(contract, claims, resultCodes));
  const translatorDiagnostics = verifyTranslators(claims);
  const unclaimed = unclaimedFamilyConstants(contract, claims, headerNames);
  const declaredCnaOnly = new Set(contract.expectedCnaOnlyConstants?.constants ?? []);
  const undeclaredCnaOnly = unclaimed
    .filter((row) => !declaredCnaOnly.has(row.constant))
    .map((row) => ({ code: "UNDECLARED_CNA_ONLY_CONSTANT", subject: `${row.family}: ${row.constant}` }));
  const vanishedCnaOnly = [...declaredCnaOnly]
    .filter((name) => !headerNames.has(name))
    .map((name) => ({ code: "VANISHED_CNA_ONLY_CONSTANT", subject: name }));
  const all = [
    ...diagnostics,
    ...absent,
    ...translatorDiagnostics,
    ...resultCodeDiagnostics,
    ...undeclaredCnaOnly,
    ...vanishedCnaOnly,
    ...(compiled.ok ? [] : [{ code: "STATIC_ASSERT_FAILED", subject: "generated contract probe", detail: compiled.output.trim().split("\n").slice(0, 40).join("\n") }]),
  ];
  return {
    contract: path.relative(ROOT, args.contract).replaceAll(path.sep, "/"),
    cnaRoot: args.cnaRoot,
    typeScriptEnums: enums.size,
    verifiedFamilies: contract.enumFamilies.length,
    managedEnums: Object.keys(contract.managedEnums ?? {}).length,
    claims: claims.length,
    identicalClaims: claims.filter((claim) => claim.kind === "IDENTICAL").length,
    translatedClaims: claims.filter((claim) => claim.kind === "TRANSLATED").length,
    scalarAssertions: contract.scalarRepresentations.length,
    resultCodeAssertions: Object.keys(contract.resultCodes.constants).length,
    typeScriptResultCodes: resultCodes.values.size,
    structVersionAssertions: Object.keys(contract.structVersions.declared).length,
    staticAssertionsCompiled: compiled.ok,
    cnaOnlyFamilyConstants: unclaimed,
    declaredCnaOnlyConstants: declaredCnaOnly.size,
    diagnostics: all,
    translations: claims.filter((claim) => claim.kind === "TRANSLATED").map((claim) => ({
      subject: `${claim.enumName}.${claim.member}`,
      typeScriptValue: claim.typeScriptValue,
      cnaConstant: claim.constant,
      cnaValue: claim.expected,
      translator: claim.translator,
    })),
  };
}

function formatText(report) {
  const lines = [
    `CNA_ROOT=${report.cnaRoot}`,
    `TYPESCRIPT_ENUMS=${report.typeScriptEnums}`,
    `VERIFIED_ENUM_FAMILIES=${report.verifiedFamilies}`,
    `MANAGED_ONLY_ENUMS=${report.managedEnums}`,
    `ENUM_MEMBER_CLAIMS=${report.claims}`,
    `IDENTICAL_CLAIMS=${report.identicalClaims}`,
    `TRANSLATED_CLAIMS=${report.translatedClaims}`,
    `SCALAR_ASSERTIONS=${report.scalarAssertions}`,
    `RESULT_CODE_ASSERTIONS=${report.resultCodeAssertions}`,
    `TYPESCRIPT_RESULT_CODES=${report.typeScriptResultCodes}`,
    `STRUCT_VERSION_ASSERTIONS=${report.structVersionAssertions}`,
    `STATIC_ASSERTIONS_COMPILED=${report.staticAssertionsCompiled ? "PASS" : "FAIL"}`,
    `CNA_ONLY_FAMILY_CONSTANTS=${report.cnaOnlyFamilyConstants.length}`,
    `DECLARED_CNA_ONLY_CONSTANTS=${report.declaredCnaOnlyConstants}`,
    `DIAGNOSTICS=${report.diagnostics.length}`,
  ];
  for (const translation of report.translations) {
    lines.push(`TRANSLATION=${translation.subject} ${translation.typeScriptValue}->${translation.cnaValue} via ${translation.translator}`);
  }
  for (const diagnostic of report.diagnostics) {
    lines.push(`DIAGNOSTIC=${diagnostic.code} ${diagnostic.subject}${diagnostic.detail ? `\n${diagnostic.detail}` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = run(args);
  const output = args.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : formatText(report);
  if (args.output) fs.writeFileSync(args.output, output);
  else process.stdout.write(output);
  if (!args.reportOnly && report.diagnostics.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
