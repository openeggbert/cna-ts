#!/usr/bin/env node

/**
 * Inventories every retained Microsoft XNA 4.0 reference profile on this host.
 *
 * The selected Windows runtime profile is what this package projects and holds at zero
 * differences. It is not the whole XNA 4.0 product surface, and reporting it as though it were is
 * the mistake this tool exists to prevent: each profile is measured separately, with its own exact
 * assembly hashes, and the superset is labelled as discovery rather than as a compile-time target.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { readDeclarationModel } from "./lib/declarations.mjs";
import { mapTypeIdentity } from "./verify.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROFILE_DIR = path.join(ROOT, "tools/api-compat/profiles");
const DEFAULT_RULES = path.join(ROOT, "tools/api-compat/mapping-rules.json");

function parseArgs(values) {
  const result = {
    referenceRoot: process.env.XNA_REFERENCE_ROOT ?? null,
    declarations: path.join(ROOT, "dist/Microsoft/Xna/Framework"),
    rules: DEFAULT_RULES,
    format: "text",
    output: null,
    jsonOutput: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--reference-root") result.referenceRoot = path.resolve(values[++index]);
    else if (value === "--declarations") result.declarations = path.resolve(values[++index]);
    else if (value === "--format") result.format = values[++index];
    else if (value === "--output") result.output = path.resolve(values[++index]);
    else if (value === "--json-output") result.jsonOutput = path.resolve(values[++index]);
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!result.referenceRoot) {
    throw new Error(
      "set XNA_REFERENCE_ROOT or pass --reference-root: the XNA Game Studio 4.0 References directory",
    );
  }
  return result;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status ?? "signal"})\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

function buildExtractor(temporary) {
  const executable = path.join(temporary, "XnaContractExtractor.exe");
  run("mcs", [
    "-warnaserror+", "-r:System.Core", "-r:System.Web.Extensions", `-out:${executable}`,
    path.join(ROOT, "tools/api-compat/extractor/XnaContractExtractor.cs"),
  ]);
  return executable;
}

function extract(executable, referenceDir, profile, temporary, name) {
  for (const assembly of profile.referenceAssemblies) {
    const file = path.join(referenceDir, assembly);
    if (!fs.existsSync(file)) throw new Error(`missing XNA reference assembly: ${file}`);
    const expected = profile.referenceSha256[assembly];
    const actual = sha256(file);
    if (expected !== actual) {
      throw new Error(`reference SHA-256 mismatch for ${assembly}: expected ${expected}, got ${actual}`);
    }
  }
  const output = path.join(temporary, `${name}.json`);
  run("mono", [executable, referenceDir, output, ...profile.referenceAssemblies], {
    env: { ...process.env, XNA_PROFILE_NAME: profile.name },
  });
  return JSON.parse(fs.readFileSync(output, "utf8"));
}

function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rules = JSON.parse(fs.readFileSync(args.rules, "utf8"));
  const declarations = readDeclarationModel(args.declarations);
  const projected = new Set(declarations.types.map((type) => type.name));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-profile-inventory-"));
  const profiles = [];
  try {
    const executable = buildExtractor(temporary);
    for (const file of fs.readdirSync(PROFILE_DIR).filter((name) => name.endsWith(".json")).sort()) {
      const name = path.basename(file, ".json");
      const profile = JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, file), "utf8"));
      const referenceDir = path.join(args.referenceRoot, profile.referenceSubdirectory);
      const reference = extract(executable, referenceDir, profile, temporary, name);
      const types = reference.types;
      const memberCount = types.reduce((total, type) => total + type.members.length, 0);
      const identities = types.map((type) => mapTypeIdentity(type.name, rules));
      const projectedTypes = identities.filter((identity) => projected.has(identity));
      profiles.push({
        id: name,
        name: profile.name,
        role: profile.role ?? "inventory",
        description: profile.description,
        referenceSubdirectory: profile.referenceSubdirectory,
        assemblies: profile.referenceAssemblies.length,
        referenceSha256: profile.referenceSha256,
        referenceTypes: types.length,
        referenceMembers: memberCount,
        namespaces: countBy(types, "namespace"),
        typesByAssembly: countBy(types, "assembly"),
        projectedTypes: projectedTypes.length,
        unprojectedTypes: types.length - projectedTypes.length,
        unprojectedTypeNames: identities.filter((identity) => !projected.has(identity)).sort(),
        typeIdentities: identities.slice().sort(),
      });
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }

  const target = profiles.find((profile) => profile.role === "target");
  const deltas = [];
  for (const profile of profiles) {
    if (!target || profile.id === target.id) continue;
    const here = new Set(profile.typeIdentities);
    const there = new Set(target.typeIdentities);
    deltas.push({
      profile: profile.id,
      against: target.id,
      onlyHere: [...here].filter((name) => !there.has(name)).sort(),
      onlyInTarget: [...there].filter((name) => !here.has(name)).sort(),
      shared: [...here].filter((name) => there.has(name)).length,
    });
  }
  const runtimeSurface = new Set();
  for (const profile of profiles) {
    if (profile.role === "target" || profile.id === "xna40-windows-live" || profile.id === "xna40-xbox360") {
      for (const name of profile.typeIdentities) runtimeSurface.add(name);
    }
  }
  const report = {
    referenceRoot: args.referenceRoot,
    typeScriptTypes: declarations.types.length,
    runtimeSupersetTypes: runtimeSurface.size,
    runtimeSupersetProjectedTypes: [...runtimeSurface].filter((name) => projected.has(name)).length,
    runtimeSupersetUnprojectedTypes: [...runtimeSurface].filter((name) => !projected.has(name)).sort(),
    platformDeltas: deltas,
    profiles,
  };
  if (args.jsonOutput) fs.writeFileSync(args.jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
  const text = formatText(report);
  if (args.output) fs.writeFileSync(args.output, text);
  else process.stdout.write(args.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : text);
}

function formatText(report) {
  const lines = [
    "# Retained Microsoft XNA 4.0 reference profiles",
    "",
    "Generated by `npm run api:profiles`. Every profile is admitted by exact SHA-256 and measured",
    "separately; no Microsoft binary is committed or packaged. `TARGET` is the profile this package",
    "projects and holds at zero differences. `INVENTORY` profiles are discovery: they record what",
    "exists, not what is promised.",
    "",
    `TYPESCRIPT_PROJECTED_TYPES=${report.typeScriptTypes}`,
    `RUNTIME_SUPERSET_TYPES=${report.runtimeSupersetTypes}`,
    `RUNTIME_SUPERSET_PROJECTED_TYPES=${report.runtimeSupersetProjectedTypes}`,
    `RUNTIME_SUPERSET_UNPROJECTED_TYPES=${report.runtimeSupersetUnprojectedTypes.length}`,
    "",
    "The runtime superset is the union of every profile a game runs against -- the Windows runtime,",
    "the Windows LIVE assemblies and the Xbox 360 set. It deliberately excludes the content pipeline,",
    "which runs in the content build rather than in a game.",
    "",
    "| Profile | Role | Assemblies | Types | Members | Projected | Unprojected |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const profile of report.profiles) {
    lines.push(
      `| \`${profile.id}\` | ${profile.role.toUpperCase()} | ${profile.assemblies} | ` +
      `${profile.referenceTypes} | ${profile.referenceMembers} | ${profile.projectedTypes} | ` +
      `${profile.unprojectedTypes} |`,
    );
  }
  for (const delta of report.platformDeltas) {
    // Only profiles that actually overlap the target say anything useful here; a build-time
    // profile shares nothing with it and listing all 257 target types would be noise.
    if (delta.shared === 0) continue;
    lines.push("", `### \`${delta.profile}\` against \`${delta.against}\``, "", "```text",
      `SHARED_TYPES=${delta.shared}`,
      `ONLY_IN_${delta.profile.replaceAll("-", "_").toUpperCase()}=${delta.onlyHere.length}`,
      `ONLY_IN_TARGET=${delta.onlyInTarget.length}`,
      "```");
    if (delta.onlyInTarget.length > 0) {
      lines.push("", "Types the target profile has and this one does not:", "");
      for (const name of delta.onlyInTarget) lines.push(`- \`${name}\``);
    }
  }
  for (const profile of report.profiles) {
    lines.push("", `## ${profile.name}`, "", profile.description, "", "```text",
      `ID=${profile.id}`,
      `ROLE=${profile.role.toUpperCase()}`,
      `REFERENCE_SUBDIRECTORY=${profile.referenceSubdirectory}`,
      `ASSEMBLIES=${profile.assemblies}`,
      `REFERENCE_TYPES=${profile.referenceTypes}`,
      `REFERENCE_MEMBERS=${profile.referenceMembers}`,
      `PROJECTED_TYPES=${profile.projectedTypes}`,
      `UNPROJECTED_TYPES=${profile.unprojectedTypes}`,
      "```", "", "Namespaces:", "");
    for (const [namespace, count] of Object.entries(profile.namespaces)) {
      lines.push(`- \`${namespace}\` — ${count}`);
    }
    lines.push("", "Assemblies and exact hashes:", "");
    for (const [assembly, hash] of Object.entries(profile.referenceSha256)) {
      lines.push(`- \`${assembly}\` — \`${hash}\` — ${profile.typesByAssembly[assembly.replace(/\.dll$/, "")] ?? 0} types`);
    }
  }
  return `${lines.join("\n")}\n`;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
