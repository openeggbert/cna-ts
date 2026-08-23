#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REQUIRED_SYMBOL_GROUPS = {
  versionAndErrors: [
    "cna_get_abi_version",
    "cna_error_get_last_info",
    "cna_error_get_last_message_size",
    "cna_error_copy_last_message",
  ],
  lifecycle: [
    "cna_game_create",
    "cna_game_run_one_frame",
    "cna_game_run",
    "cna_game_request_exit",
    "cna_game_destroy",
  ],
  graphicsDevice: [
    "cna_graphics_device_manager_create",
    "cna_graphics_device_manager_get_graphics_device",
    "cna_graphics_device_clear_rgba",
    "cna_graphics_device_present",
  ],
  texture2D: [
    "cna_texture2d_create_from_encoded_memory",
    "cna_texture2d_set_data",
    "cna_texture2d_get_data",
    "cna_texture2d_destroy",
  ],
  spriteBatch: [
    "cna_sprite_batch_create",
    "cna_sprite_batch_begin",
    "cna_sprite_batch_submit_many",
    "cna_sprite_batch_end",
    "cna_sprite_batch_destroy",
    "cna_sprite_batch_begin_with_effect",
  ],
  effects: [
    "cna_effect_create_empty",
    "cna_effect_create_compiled",
    "cna_effect_clone",
    "cna_effect_apply",
    "cna_effect_pass_apply",
    "cna_effect_get_parameters",
    "cna_effect_get_techniques",
    "cna_effect_get_current_technique",
    "cna_basic_effect_create",
    "cna_alpha_test_effect_create",
    "cna_dual_texture_effect_create",
    "cna_environment_map_effect_create",
    "cna_skinned_effect_create",
  ],
  input: [
    "cna_keyboard_get_state",
    "cna_keyboard_state_is_key_down",
    "cna_mouse_get_state",
  ],
  content: [
    "cna_content_manager_create",
    "cna_content_manager_load_texture2d",
    "cna_content_manager_unload",
    "cna_content_manager_destroy",
  ],
  audio: [
    "cna_audio_get_capabilities",
    "cna_sound_effect_create_pcm16",
    "cna_sound_effect_destroy",
  ],
};

function parseArgs(values) {
  const result = {
    cnaRoot: process.env.CNA_SOURCE_PATH
      ? path.resolve(process.env.CNA_SOURCE_PATH)
      : null,
    format: "text",
    output: null,
    requireWasm: false,
    nativeLibrary: process.env.CNA_NATIVE_LIBRARY
      ? path.resolve(process.env.CNA_NATIVE_LIBRARY)
      : null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--cna-root") result.cnaRoot = path.resolve(values[++index]);
    else if (value === "--format") result.format = values[++index];
    else if (value === "--output") result.output = path.resolve(values[++index]);
    else if (value === "--require-wasm") result.requireWasm = true;
    else if (value === "--native-library") result.nativeLibrary = path.resolve(values[++index]);
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!result.cnaRoot) {
    throw new Error("pass --cna-root <path> or set CNA_SOURCE_PATH");
  }
  if (!new Set(["text", "json"]).has(result.format)) {
    throw new Error(`unsupported format: ${result.format}`);
  }
  return result;
}

function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function removeComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\r\n]*/g, " ");
}

function readMacro(source, name) {
  const match = source.match(new RegExp(
    `^\\s*#define\\s+${name}\\s+UINT32_C\\((\\d+)\\)`,
    "m",
  ));
  if (!match) throw new Error(`missing ${name} in abi.h`);
  return Number.parseInt(match[1], 10);
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}

function verifyNodeBridgeSignatures(cnaRoot, bridgeSource) {
  const typedefStart = bridgeSource.indexOf("typedef uint32_t (*GetAbiVersionFn)");
  const typedefEnd = bridgeSource.indexOf("typedef struct Api {");
  if (typedefStart < 0 || typedefEnd < typedefStart) {
    throw new Error("could not locate the Node bridge function-pointer typedefs");
  }
  const imports = [...bridgeSource.matchAll(
    /LOAD_REQUIRED\(\s*[A-Za-z0-9_]+\s*,\s*([A-Za-z0-9_]+)\s*,\s*"(cna_[A-Za-z0-9_]+)"\s*\)/g,
  )].map((match) => ({ type: match[1], symbol: match[2] }));
  if (imports.length === 0) throw new Error("the Node bridge contains no typed imports");

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-abi-signatures-"));
  const sourcePath = path.join(temporary, "signatures.c");
  const checks = imports.map(
    ({ type, symbol }, index) => `  ${type} signature_${index} = &${symbol}; (void)signature_${index};`,
  );
  const source = [
    "#include <CNA/C/cna.h>",
    "#include <stdint.h>",
    bridgeSource.slice(typedefStart, typedefEnd),
    "static void verify_signatures(void) {",
    ...checks,
    "}",
    "int main(void) { verify_signatures(); return 0; }",
    "",
  ].join("\n");
  fs.writeFileSync(sourcePath, source);
  try {
    const compiler = process.env.CC ?? "cc";
    const result = spawnSync(compiler, [
      "-std=c11", "-Wall", "-Wextra", "-Werror", "-fsyntax-only",
      `-I${path.join(cnaRoot, "modules/c-api/include")}`,
      sourcePath,
    ], { encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `Node bridge signature compilation failed (${result.status ?? "signal"})\n${result.stdout}${result.stderr}`,
      );
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return imports;
}

function formatText(report) {
  const lines = [
    `CNA_REVISION=${report.cnaRevision}`,
    `ABI_VERSION=${report.abiVersion}`,
    `PUBLIC_HEADERS=${report.publicHeaders}`,
    `EXPORTED_FUNCTIONS=${report.exportedFunctions}`,
    `REQUIRED_SYMBOLS=${report.requiredSymbols}`,
    `MISSING_REQUIRED_SYMBOLS=${report.missingRequiredSymbols.length}`,
    `NODE_BRIDGE_IMPORTED_SYMBOLS=${report.nodeBridgeImportedSymbols.length}`,
    `MISSING_NODE_BRIDGE_SYMBOLS=${report.missingNodeBridgeSymbols.length}`,
    `NODE_BRIDGE_SIGNATURES_VERIFIED=${report.nodeBridgeSignaturesVerified}`,
    `NODE_BRIDGE_SIGNATURE_MISMATCHES=${report.nodeBridgeSignatureMismatches}`,
    `QUALIFIED_LIBRARY=${report.qualifiedLibrary ?? "NOT_PROVIDED"}`,
    `QUALIFIED_LIBRARY_EXPORTED_FUNCTIONS=${report.qualifiedLibraryExportedFunctions ?? 0}`,
    `MISSING_QUALIFIED_LIBRARY_IMPORTS=${report.missingQualifiedLibraryImports.length}`,
    `TRACKED_WASM_ARTIFACTS=${report.trackedWasmArtifacts.length}`,
    `TRACKED_C_API_ESM_LOADERS=${report.trackedCApiEsmLoaders.length}`,
    `EMCC_AVAILABLE=${report.emccAvailable ? 1 : 0}`,
    `EMCMAKE_AVAILABLE=${report.emcmakeAvailable ? 1 : 0}`,
    `BROWSER_ARTIFACT_STATUS=${report.browserArtifactStatus}`,
  ];
  for (const [group, symbols] of Object.entries(report.symbolGroups)) {
    lines.push(`SYMBOL_GROUP_${group.toUpperCase()}=${symbols.length}`);
  }
  for (const symbol of report.missingRequiredSymbols) {
    lines.push(`MISSING_SYMBOL=${symbol}`);
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const includeRoot = path.join(args.cnaRoot, "modules/c-api/include/CNA/C");
  if (!fs.statSync(includeRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`CNA public C headers not found: ${includeRoot}`);
  }

  const headers = fs.readdirSync(includeRoot)
    .filter((name) => name.endsWith(".h"))
    .sort();
  const sources = headers.map((name) => fs.readFileSync(path.join(includeRoot, name), "utf8"));
  const declarations = removeComments(sources.join("\n"));
  const exportedSymbols = new Set();
  const declarationPattern = /\bCNA_C_API\b[\s\S]*?\b(cna_[A-Za-z0-9_]+)\s*\(/g;
  for (const match of declarations.matchAll(declarationPattern)) exportedSymbols.add(match[1]);

  const abiSource = fs.readFileSync(path.join(includeRoot, "abi.h"), "utf8");
  const version = {
    major: readMacro(abiSource, "CNA_ABI_VERSION_MAJOR"),
    minor: readMacro(abiSource, "CNA_ABI_VERSION_MINOR"),
    patch: readMacro(abiSource, "CNA_ABI_VERSION_PATCH"),
  };
  const required = Object.values(REQUIRED_SYMBOL_GROUPS).flat();
  const missing = required.filter((symbol) => !exportedSymbols.has(symbol));
  const bridgeSource = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../native/cna_node_bridge.c"), "utf8");
  const nodeBridgeImportedSymbols = [...bridgeSource.matchAll(/LOAD_REQUIRED\([^\n]*?"(cna_[A-Za-z0-9_]+)"\)/g)]
    .map((match) => match[1]);
  const missingNodeBridgeSymbols = nodeBridgeImportedSymbols.filter(
    (symbol) => !exportedSymbols.has(symbol),
  );
  let qualifiedLibraryExports = null;
  if (args.nativeLibrary) {
    if (!fs.statSync(args.nativeLibrary, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`qualified CNA library not found: ${args.nativeLibrary}`);
    }
    const symbols = spawnSync("nm", ["-D", "--defined-only", args.nativeLibrary], { encoding: "utf8" });
    if (symbols.error) throw symbols.error;
    if (symbols.status !== 0) {
      throw new Error(`nm failed for ${args.nativeLibrary}: ${symbols.stderr.trim()}`);
    }
    qualifiedLibraryExports = new Set(
      [...symbols.stdout.matchAll(/\b(cna_[A-Za-z0-9_]+)\b/g)].map((match) => match[1]),
    );
  }
  const missingQualifiedLibraryImports = qualifiedLibraryExports == null
    ? []
    : nodeBridgeImportedSymbols.filter((symbol) => !qualifiedLibraryExports.has(symbol));
  const verifiedSignatures = verifyNodeBridgeSignatures(args.cnaRoot, bridgeSource);
  if (verifiedSignatures.length !== nodeBridgeImportedSymbols.length) {
    throw new Error(
      `verified ${verifiedSignatures.length} Node bridge signatures for ${nodeBridgeImportedSymbols.length} imports`,
    );
  }
  const trackedFiles = runGit(args.cnaRoot, ["ls-files"]).split("\n").filter(Boolean);
  const trackedWasmArtifacts = trackedFiles.filter((file) => file.endsWith(".wasm"));
  const trackedCApiEsmLoaders = trackedFiles.filter((file) => {
    const normalized = file.toLowerCase();
    const isScript = normalized.endsWith(".mjs") || normalized.endsWith(".js");
    return isScript && (normalized.includes("modules/c-api/") || normalized.includes("cna_c_api"));
  });
  const report = {
    cnaRevision: runGit(args.cnaRoot, ["rev-parse", "HEAD"]),
    abiVersion: `${version.major}.${version.minor}.${version.patch}`,
    abiVersionComponents: version,
    publicHeaders: headers.length,
    exportedFunctions: exportedSymbols.size,
    requiredSymbols: required.length,
    missingRequiredSymbols: missing,
    nodeBridgeImportedSymbols,
    missingNodeBridgeSymbols,
    nodeBridgeSignaturesVerified: verifiedSignatures.length,
    nodeBridgeSignatureMismatches: 0,
    qualifiedLibrary: args.nativeLibrary,
    qualifiedLibraryExportedFunctions: qualifiedLibraryExports?.size ?? null,
    missingQualifiedLibraryImports,
    symbolGroups: REQUIRED_SYMBOL_GROUPS,
    trackedWasmArtifacts,
    trackedCApiEsmLoaders,
    emccAvailable: commandAvailable("emcc"),
    emcmakeAvailable: commandAvailable("emcmake"),
    browserArtifactStatus:
      trackedWasmArtifacts.length > 0 && trackedCApiEsmLoaders.length > 0
        ? "CANDIDATE_PRESENT_NOT_EXECUTION_VERIFIED"
        : "MISSING",
  };
  const output = args.format === "json"
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatText(report);
  if (args.output) fs.writeFileSync(args.output, output);
  else process.stdout.write(output);

  if (
    missing.length > 0 || missingNodeBridgeSymbols.length > 0 || missingQualifiedLibraryImports.length > 0 ||
    (args.requireWasm && report.browserArtifactStatus === "MISSING")
  ) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
