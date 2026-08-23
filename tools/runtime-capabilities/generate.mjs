#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(ROOT, "tools/runtime-capabilities/source.json");
const jsonPath = path.join(ROOT, "docs/runtime-capabilities.json");
const markdownPath = path.join(ROOT, "docs/runtime-capabilities.md");
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
for (const category of source.categories) console.log(`${category}=${counts[category]}`);
