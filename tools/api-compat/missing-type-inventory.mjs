#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const FAMILY_ORDER = [
  "Framework/core",
  "Graphics foundation",
  "Graphics resources",
  "Graphics states",
  "Vertex/buffer",
  "SpriteBatch/font",
  "Effects",
  "Models",
  "Content readers",
  "Audio/XACT",
  "Media",
  "Storage",
  "GamerServices/other selected-profile runtime types",
];

function parseArgs(values) {
  const result = {
    referenceDir: process.env.XNA_REFERENCE_PATH,
    report: null,
    output: null,
    jsonOutput: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--reference-dir") result.referenceDir = path.resolve(values[++index]);
    else if (value === "--report") result.report = path.resolve(values[++index]);
    else if (value === "--output") result.output = path.resolve(values[++index]);
    else if (value === "--json-output") result.jsonOutput = path.resolve(values[++index]);
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!result.report && !result.referenceDir) {
    throw new Error("set XNA_REFERENCE_PATH, pass --reference-dir, or pass an API report with --report");
  }
  return result;
}

function createReport(referenceDir) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-missing-types-"));
  const report = path.join(temporary, "api-report.json");
  const result = spawnSync(process.execPath, [
    path.join(ROOT, "tools/api-compat/verify.mjs"),
    "--reference-dir", referenceDir,
    "--report-only",
    "--format", "json",
    "--output", report,
  ], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw new Error(`API report failed (${result.status ?? "signal"})\n${result.stdout}${result.stderr}`);
  }
  const value = JSON.parse(fs.readFileSync(report, "utf8"));
  fs.rmSync(temporary, { recursive: true, force: true });
  return value;
}

function graphicsFamily(shortName) {
  if (/^(?:SpriteBatch|SpriteFont|SpriteEffects|SpriteSortMode)$/.test(shortName)) {
    return "SpriteBatch/font";
  }
  if (/^Model/.test(shortName)) return "Models";
  if (/Effect|DirectionalLight|^IEffect/.test(shortName)) return "Effects";
  if (/Vertex|Buffer|PrimitiveType|IndexElementSize|SetDataOptions/.test(shortName)) {
    return "Vertex/buffer";
  }
  if (
    /^(?:Blend|BlendFunction|BlendState|ColorWriteChannels|CompareFunction|CullMode|DepthStencilState|FillMode|RasterizerState|SamplerState|SamplerStateCollection|StencilOperation|TextureAddressMode|TextureCollection|TextureFilter)$/.test(shortName)
  ) {
    return "Graphics states";
  }
  if (/Texture|RenderTarget|OcclusionQuery|GraphicsResource|CubeMapFace/.test(shortName)) {
    return "Graphics resources";
  }
  return "Graphics foundation";
}

function classify(fullName) {
  const prefix = "Microsoft.Xna.Framework.";
  if (!fullName.startsWith(prefix)) return "GamerServices/other selected-profile runtime types";
  const relative = fullName.slice(prefix.length);
  if (relative.startsWith("Content.")) return "Content readers";
  if (relative.startsWith("Audio.")) return "Audio/XACT";
  if (relative.startsWith("Media.")) return "Media";
  if (relative.startsWith("Storage.")) return "Storage";
  if (relative.startsWith("GamerServices.") || relative.startsWith("Design.")) {
    return "GamerServices/other selected-profile runtime types";
  }
  if (relative.startsWith("Graphics.")) {
    return graphicsFamily(relative.slice("Graphics.".length));
  }
  if (/^(?:GraphicsDeviceInformation|GraphicsDeviceManager|IGraphicsDeviceManager|PreparingDeviceSettingsEventArgs)$/.test(relative)) {
    return "Graphics foundation";
  }
  return "Framework/core";
}

function inventory(report) {
  const missing = report.diagnostics
    .filter((value) => value.code === "MISSING_TYPE")
    .map((value) => value.subject)
    .sort();
  const groups = Object.fromEntries(FAMILY_ORDER.map((name) => [name, []]));
  for (const name of missing) groups[classify(name)].push(name);
  const count = Object.values(groups).reduce((total, values) => total + values.length, 0);
  if (count !== missing.length || count !== report.summary.diagnosticCounts.MISSING_TYPE) {
    throw new Error(`inventory count ${count} does not match verifier count ${missing.length}`);
  }
  return {
    profile: report.summary.profile,
    referenceTypes: report.summary.referenceTypes,
    referenceMembers: report.summary.referenceMembers,
    expectedMappedTypes: report.summary.expectedMappedTypes,
    targetTypes: report.summary.targetTypes,
    missingTypeCount: count,
    families: FAMILY_ORDER.map((name) => ({ name, count: groups[name].length, types: groups[name] })),
  };
}

function markdown(value) {
  const lines = [
    "# Generated missing-type work queue",
    "",
    "> Generated from strict `MISSING_TYPE` diagnostics by `tools/api-compat/missing-type-inventory.mjs`; do not edit this queue manually.",
    "",
    `Profile: ${value.profile}`,
    "",
    `Missing types: ${value.missingTypeCount}`,
    "",
    "| Family | Count |",
    "| --- | ---: |",
    ...value.families.map((family) => `| ${family.name} | ${family.count} |`),
  ];
  for (const family of value.families) {
    lines.push("", `## ${family.name} (${family.count})`, "");
    if (family.types.length === 0) lines.push("_None._");
    else lines.push(...family.types.map((name) => `- \`${name}\``));
  }
  return `${lines.join("\n")}\n`;
}

const options = parseArgs(process.argv.slice(2));
const report = options.report
  ? JSON.parse(fs.readFileSync(options.report, "utf8"))
  : createReport(options.referenceDir);
const value = inventory(report);
const text = markdown(value);
if (options.output) fs.writeFileSync(options.output, text);
else process.stdout.write(text);
if (options.jsonOutput) fs.writeFileSync(options.jsonOutput, `${JSON.stringify(value, null, 2)}\n`);
