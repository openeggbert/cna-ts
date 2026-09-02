#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    portable: false,
    nativeLibrary: process.env.CNA_NATIVE_LIBRARY
      ? path.resolve(process.env.CNA_NATIVE_LIBRARY)
      : null,
    wasmArtifactDir: process.env.CNA_WASM_ARTIFACT_DIR
      ? path.resolve(process.env.CNA_WASM_ARTIFACT_DIR)
      : null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--cna-root") result.cnaRoot = path.resolve(values[++index]);
    else if (value === "--format") result.format = values[++index];
    else if (value === "--output") result.output = path.resolve(values[++index]);
    else if (value === "--require-wasm") result.requireWasm = true;
    else if (value === "--portable") result.portable = true;
    else if (value === "--native-library") result.nativeLibrary = path.resolve(values[++index]);
    else if (value === "--wasm-artifact-dir") result.wasmArtifactDir = path.resolve(values[++index]);
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

/**
 * Resolves a build tool to an absolute path. An installed but unsourced Emscripten SDK is the
 * common local case -- emcc lives in the SDK tree rather than on PATH -- so what is reachable is
 * reported rather than merely what a bare shell exports.
 */
function toolPath(command) {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, command);
    if (fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
  }
  for (const root of emsdkRoots()) {
    const candidate = path.join(root, "upstream/emscripten", command);
    if (fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
  }
  return null;
}

/** True when the compiler is present and answers a version query. */
function compilerAvailable(command) {
  const resolved = toolPath(command);
  if (!resolved) return false;
  const probe = spawnSync(resolved, ["--version"], { encoding: "utf8" });
  return !probe.error && probe.status === 0;
}

function emsdkRoots() {
  const roots = [];
  if (process.env.EMSDK) roots.push(path.resolve(process.env.EMSDK));
  const home = os.homedir();
  if (home) roots.push(path.join(home, "emsdk"));
  return roots.filter((root) => fs.statSync(root, { throwIfNoEntry: false })?.isDirectory());
}

/** Reads the ABI generation this package declares in src/internal/abi.ts. */
function readTargetedAbi() {
  const source = fs.readFileSync(path.join(ROOT_DIR, "src/internal/abi.ts"), "utf8");
  const read = (name) => {
    const match = source.match(new RegExp(`export const ${name} = (\\d+);`));
    if (!match) throw new Error(`missing ${name} in src/internal/abi.ts`);
    return Number.parseInt(match[1], 10);
  };
  return { major: read("CNA_ABI_MAJOR"), minor: read("CNA_ABI_MINOR") };
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
    `TARGETED_ABI_MAJOR=${report.targetedAbi.major}`,
    `TARGETED_ABI_MINOR=${report.targetedAbi.minor}`,
    `TARGETED_ABI_MATCHES_HEADERS=${report.targetedAbiMatchesHeaders ? 1 : 0}`,
    `PUBLIC_HEADERS=${report.publicHeaders}`,
    `EXPORTED_FUNCTIONS=${report.exportedFunctions}`,
    `REQUIRED_SYMBOLS=${report.requiredSymbols}`,
    `MISSING_REQUIRED_SYMBOLS=${report.missingRequiredSymbols.length}`,
    `NODE_BRIDGE_IMPORTED_SYMBOLS=${report.nodeBridgeImportedSymbols.length}`,
    `MISSING_NODE_BRIDGE_SYMBOLS=${report.missingNodeBridgeSymbols.length}`,
    `NODE_BRIDGE_SIGNATURES_VERIFIED=${report.nodeBridgeSignaturesVerified}`,
    `NODE_BRIDGE_SIGNATURE_MISMATCHES=${report.nodeBridgeSignatureMismatches}`,
    `NODE_BRIDGE_NEVER_LOADED_FIELDS=${report.neverLoadedBridgeFields.length}`,
    `QUALIFIED_LIBRARY=${report.qualifiedLibrary ?? "NOT_PROVIDED"}`,
    `QUALIFIED_LIBRARY_EXPORTED_FUNCTIONS=${report.qualifiedLibraryExportedFunctions ?? 0}`,
    `MISSING_QUALIFIED_LIBRARY_IMPORTS=${report.missingQualifiedLibraryImports.length}`,
    `UPSTREAM_TRACKED_WASM_ARTIFACTS=${report.trackedWasmArtifacts.length}`,
    `UPSTREAM_TRACKED_C_API_ESM_LOADERS=${report.trackedCApiEsmLoaders.length}`,
    `EMCC_AVAILABLE=${report.emccAvailable ? 1 : 0}`,
    `EMCMAKE_AVAILABLE=${report.emcmakeAvailable ? 1 : 0}`,
    `WASM_ARTIFACT_DIRECTORY=${report.wasmArtifact.directory ?? "NOT_PROVIDED"}`,
    `WASM_ARTIFACT_MODULE_SHA256=${report.wasmArtifact.moduleSha256 ?? "ABSENT"}`,
    `WASM_ARTIFACT_WASM_SHA256=${report.wasmArtifact.wasmSha256 ?? "ABSENT"}`,
    `WASM_ARTIFACT_WASM_BYTES=${report.wasmArtifact.wasmBytes ?? 0}`,
    `WASM_ARTIFACT_EXPORTED_FUNCTIONS=${report.wasmArtifact.exportedFunctions ?? 0}`,
    `WASM_ARTIFACT_ASYNCIFY_RUNTIME=${report.wasmArtifact.asyncifyRuntime === null ? "UNMEASURED" : report.wasmArtifact.asyncifyRuntime ? 1 : 0}`,
    `WASM_ARTIFACT_WEBGL_MAJOR_VERSIONS=${report.wasmArtifact.webglMajorVersions == null ? "UNMEASURED" : (report.wasmArtifact.webglMajorVersions.join(",") || "NONE")}`,
    `WASM_ARTIFACT_LINK_CONTRACT=${report.wasmArtifactLinkContract}`,
    `WASM_BACKEND_ROUTES=${report.wasmBackendRoutes.length}`,
    `MISSING_WASM_BACKEND_EXPORTS=${report.missingWasmBackendExports.length}`,
    `BROWSER_ARTIFACT_STATUS=${report.browserArtifactStatus}`,
  ];
  for (const symbol of report.missingWasmBackendExports) {
    lines.push(`MISSING_WASM_EXPORT=${symbol}`);
  }
  for (const [group, symbols] of Object.entries(report.symbolGroups)) {
    lines.push(`SYMBOL_GROUP_${group.toUpperCase()}=${symbols.length}`);
  }
  for (const symbol of report.missingRequiredSymbols) {
    lines.push(`MISSING_SYMBOL=${symbol}`);
  }
  return `${lines.join("\n")}\n`;
}

/** The routes {@link WasmBackend} resolves when it is constructed, read from its own list. */
function readWasmBackendRoutes() {
  const file = path.join(ROOT_DIR, "src/internal/wasm/wasm-backend.ts");
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return [];
  const source = fs.readFileSync(file, "utf8");
  const block = /const ROUTES = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) return [];
  return [...block[1].matchAll(/"(cna_[A-Za-z0-9_]+)"/g)].map((match) => match[1]);
}

/**
 * Measures the WebAssembly artifact this binding actually consumes.
 *
 * The artifact is built out of tree from `cnanext`, not committed anywhere, so "is there a tracked
 * `.wasm` in the CNA worktree" -- which is what this audit used to answer -- says nothing about
 * whether a browser consumer has something to load.
 *
 * The route names come from the ESM loader, not from the `.wasm` export section: a Release link
 * minifies wasm export names (`Mi`, `Ni`, ...), and the loader is what maps a readable
 * `Module["_cna_..."]` onto one. Since `route()` resolves exactly that property, reading the same
 * assignments the loader emits measures what the backend will actually find.
 */
function readWasmArtifact(directory) {
  const empty = {
    directory,
    module: null,
    wasm: null,
    moduleSha256: null,
    wasmSha256: null,
    wasmBytes: null,
    exportedFunctions: null,
    exports: null,
    asyncifyRuntime: null,
    webglMajorVersions: null,
  };
  if (!directory || !fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return empty;
  const modulePath = path.join(directory, "cna_c_api.mjs");
  const wasmPath = path.join(directory, "cna_c_api.wasm");
  const hasModule = fs.statSync(modulePath, { throwIfNoEntry: false })?.isFile() === true;
  if (!fs.statSync(wasmPath, { throwIfNoEntry: false })?.isFile() || !hasModule) return empty;
  const wasmBytes = fs.readFileSync(wasmPath);
  const moduleSource = fs.readFileSync(modulePath, "utf8");
  const exports = new Set(
    [...moduleSource.matchAll(/Module\["(_cna_[A-Za-z0-9_]+)"\]\s*=/g)].map((match) => match[1]),
  );
  // Two link-contract properties this binding used to supply itself, measured from the artifact
  // rather than from the CMake that produced it. CNA repaired both in ABI 0.21; if a later build
  // regresses, a browser consumer sees a WebGL 1 context whose GLSL ES 3.00 shaders will not
  // compile, or an Asyncify unwind that loses every i64 handle. Both fail loudly here instead.
  const asyncifyRuntime = /var[ \t]+Asyncify|Asyncify[ \t]*=[ \t]*\{/.test(moduleSource);
  const webglMajorVersions = [
    ...new Set(
      [...moduleSource.matchAll(/majorVersion[ \t]*:[ \t]*(\d)/g)].map((match) => Number(match[1])),
    ),
  ].sort();
  return {
    directory,
    module: modulePath,
    wasm: wasmPath,
    moduleSha256: crypto.createHash("sha256").update(moduleSource).digest("hex"),
    wasmSha256: crypto.createHash("sha256").update(wasmBytes).digest("hex"),
    wasmBytes: wasmBytes.byteLength,
    exportedFunctions: exports.size,
    exports,
    asyncifyRuntime,
    webglMajorVersions,
  };
}

/**
 * The link contract the WebAssembly backend depends on, measured from the artifact's own generated
 * JavaScript. Until ABI 0.21 this package supplied both properties itself through extra CMake
 * settings, because `cna_c_api_wasm` set neither; CNA now states both on the target and gates them
 * with its own `CApi_WasmLinkContract` test. That is why the overrides are gone -- and why this
 * check stays: a rebuilt artifact that silently reacquires Asyncify loses every `i64` handle on the
 * first SDL present, and one that negotiates WebGL 1 cannot compile EasyGL's GLSL ES 3.00 shaders.
 * Both failures appear far from their cause, so they are caught at the artifact instead.
 */
function wasmArtifactLinkContract(artifact) {
  if (artifact.moduleSha256 == null) return "NOT_PROVIDED";
  if (artifact.asyncifyRuntime) return "BROKEN_ASYNCIFY_PRESENT";
  const versions = artifact.webglMajorVersions ?? [];
  if (versions.length !== 1 || versions[0] !== 2) {
    return `BROKEN_WEBGL_MAJOR_VERSIONS_${versions.join("_") || "NONE"}`;
  }
  return "OK_ASYNCIFY_OFF_WEBGL2";
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
  const targetedAbi = readTargetedAbi();
  const required = Object.values(REQUIRED_SYMBOL_GROUPS).flat();
  const missing = required.filter((symbol) => !exportedSymbols.has(symbol));
  const bridgeSource = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../native/cna_node_bridge.c"), "utf8");
  const nodeBridgeImportedSymbols = [...bridgeSource.matchAll(/LOAD_REQUIRED\([^\n]*?"(cna_[A-Za-z0-9_]+)"\)/g)]
    .map((match) => match[1]);
  const missingNodeBridgeSymbols = nodeBridgeImportedSymbols.filter(
    (symbol) => !exportedSymbols.has(symbol),
  );
  // A field declared in the adapter's function-pointer table but never given a LOAD_REQUIRED is a
  // null pointer that segfaults the process the first time a route calls it -- silently, because
  // every other gate here counts LOAD_REQUIRED lines and so cannot see it. Three such fields were
  // shipped this way before this check existed. The field names are the ones LOAD_REQUIRED
  // assigns to, so the two lists are directly comparable.
  const bridgeLoadedFields = new Set(
    [...bridgeSource.matchAll(/LOAD_REQUIRED\(\s*([A-Za-z0-9_]+)\s*,/g)].map((match) => match[1]),
  );
  const neverLoadedBridgeFields = [
    ...bridgeSource.matchAll(/^ {2}[A-Za-z_][A-Za-z0-9_]*Fn {1,}([a-z][A-Za-z0-9_]*);$/gm),
  ]
    .map((match) => match[1])
    .filter((field) => !bridgeLoadedFields.has(field))
    .sort();
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
  // `--portable` deletes every git-derived field below before the report is written, so asking git
  // for them is work whose answer is thrown away -- and it makes the *portable* report, the one
  // whose whole point is not to depend on this machine's checkout, require a git checkout. It
  // does: regenerating the pinned reports against an extracted header tree failed with
  // "not a git repository" and left `wasmBackendRoutes` at a stale 1403. The output is unchanged
  // either way, because these three fields are dropped.
  const trackedFiles = args.portable ? [] : runGit(args.cnaRoot, ["ls-files"]).split("\n").filter(Boolean);
  const trackedWasmArtifacts = trackedFiles.filter((file) => file.endsWith(".wasm"));
  const trackedCApiEsmLoaders = trackedFiles.filter((file) => {
    const normalized = file.toLowerCase();
    const isScript = normalized.endsWith(".mjs") || normalized.endsWith(".js");
    return isScript && (normalized.includes("modules/c-api/") || normalized.includes("cna_c_api"));
  });
  const wasmArtifact = readWasmArtifact(args.wasmArtifactDir);
  const wasmBackendRoutes = readWasmBackendRoutes();
  // The loader exposes a C function as `Module["_name"]`, which is what `route()` looks up. A
  // route the backend resolves at construction time that the module does not expose is a broken
  // artifact, and the audit is where that is cheap to find -- before a browser run fails on
  // `route()` with no context.
  const missingWasmBackendExports = wasmArtifact.exports == null
    ? []
    : wasmBackendRoutes.filter((name) => !wasmArtifact.exports.has(`_${name}`));
  const report = {
    cnaRevision: args.portable ? null : runGit(args.cnaRoot, ["rev-parse", "HEAD"]),
    abiVersion: `${version.major}.${version.minor}.${version.patch}`,
    abiVersionComponents: version,
    targetedAbi,
    targetedAbiMatchesHeaders:
      targetedAbi.major === version.major && targetedAbi.minor === version.minor,
    publicHeaders: headers.length,
    exportedFunctions: exportedSymbols.size,
    requiredSymbols: required.length,
    missingRequiredSymbols: missing,
    nodeBridgeImportedSymbols,
    missingNodeBridgeSymbols,
    nodeBridgeSignaturesVerified: verifiedSignatures.length,
    neverLoadedBridgeFields,
    nodeBridgeSignatureMismatches: 0,
    qualifiedLibrary: args.nativeLibrary,
    qualifiedLibraryExportedFunctions: qualifiedLibraryExports?.size ?? null,
    missingQualifiedLibraryImports,
    symbolGroups: REQUIRED_SYMBOL_GROUPS,
    trackedWasmArtifacts,
    trackedCApiEsmLoaders,
    emccAvailable: compilerAvailable("emcc"),
    emcmakeAvailable: toolPath("emcmake") != null,
    wasmArtifact,
    wasmArtifactLinkContract: wasmArtifactLinkContract(wasmArtifact),
    wasmBackendRoutes,
    missingWasmBackendExports,
    browserArtifactStatus:
      wasmArtifact.wasmSha256 == null
        ? "MISSING"
        : missingWasmBackendExports.length > 0
          ? "PRESENT_BUT_INCOMPLETE"
          : "PRESENT_NOT_EXECUTION_VERIFIED",
  };
  // The checked-in JSON is a function of this repository plus the pinned headers, and nothing else.
  // A dependency revision, an absolute library path and an artifact hash are all facts about the
  // machine that ran the audit, so `--portable` leaves them out and CI compares what it can
  // reproduce. The text format always prints them, because that is what a human reading a
  // qualification run wants to see.
  const environment = [
    "cnaRevision", "cnaRoot", "qualifiedLibrary", "qualifiedLibraryExportedFunctions",
    "trackedWasmArtifacts", "trackedCApiEsmLoaders", "emccAvailable", "emcmakeAvailable",
    "wasmArtifact", "browserArtifactStatus",
  ];
  const serializable = { ...report, wasmArtifact: { ...report.wasmArtifact, exports: undefined } };
  if (args.portable) for (const field of environment) delete serializable[field];
  const output = args.format === "json"
    ? `${JSON.stringify(serializable, null, 2)}\n`
    : formatText(report);
  if (args.output) fs.writeFileSync(args.output, output);
  else process.stdout.write(output);

  if (
    missing.length > 0 || missingNodeBridgeSymbols.length > 0 || missingQualifiedLibraryImports.length > 0 ||
    report.neverLoadedBridgeFields.length > 0 ||
    !report.targetedAbiMatchesHeaders ||
    report.missingWasmBackendExports.length > 0 ||
    report.wasmArtifactLinkContract.startsWith("BROKEN_") ||
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
