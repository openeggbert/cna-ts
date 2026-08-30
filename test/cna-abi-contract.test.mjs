import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { run } from "../tools/cna-abi/verify-contract.mjs";
import {
  fromCnaBlendFunction,
  fromCnaGamePadType,
  toCnaBlendFunction,
  toCnaBlendState,
  toCnaGamePadType,
} from "../dist/internal/cna-enums.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = path.join(ROOT, "tools/cna-abi/contract.json");
const CNA_ROOT = path.resolve(process.env.CNA_SOURCE_PATH ?? path.join(ROOT, "../../cnanext"));
const SOURCE_DIR = path.join(ROOT, "src");
const headersPresent = fs
  .statSync(path.join(CNA_ROOT, "modules/c-api/include/CNA/C/cna.h"), { throwIfNoEntry: false })
  ?.isFile() === true;
const skip = headersPresent
  ? false
  : `canonical CNA headers not found at ${CNA_ROOT}; set CNA_SOURCE_PATH`;

const baseline = JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
const scratch = [];
test.after(() => {
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
});

function withContract(mutate) {
  const contract = structuredClone(baseline);
  mutate(contract);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-contract-mutation-"));
  scratch.push(directory);
  const file = path.join(directory, "contract.json");
  fs.writeFileSync(file, JSON.stringify(contract, null, 2));
  return run({ cnaRoot: CNA_ROOT, contract: file, sourceDir: SOURCE_DIR, format: "json", output: null, reportOnly: true });
}

function codes(report) {
  return new Set(report.diagnostics.map((diagnostic) => diagnostic.code));
}

function family(contract, name) {
  const found = contract.enumFamilies.find((entry) => entry.typeScriptEnum === name);
  assert.ok(found, `contract has no ${name} family`);
  return found;
}

test("the contract holds against the canonical CNA headers", { skip }, () => {
  const report = run({ cnaRoot: CNA_ROOT, contract: CONTRACT, sourceDir: SOURCE_DIR, format: "json", output: null, reportOnly: true });
  assert.equal(report.diagnostics.length, 0, JSON.stringify(report.diagnostics, null, 2));
  assert.equal(report.staticAssertionsCompiled, true);
  assert.equal(report.claims, report.identicalClaims + report.translatedClaims);
  assert.ok(report.claims > 400, `expected the whole projected enum surface, saw ${report.claims}`);
  assert.equal(report.typeScriptEnums, report.verifiedFamilies + report.managedEnums);
});

test("a wrong scalar representation fails to compile", { skip }, () => {
  const report = withContract((contract) => {
    contract.scalarRepresentations[0].value = 2;
  });
  assert.ok(codes(report).has("STATIC_ASSERT_FAILED"));
});

test("a wrong result code fails to compile", { skip }, () => {
  const report = withContract((contract) => {
    contract.resultCodes.constants.CNA_RESULT_NOT_SUPPORTED = 7;
  });
  assert.ok(codes(report).has("STATIC_ASSERT_FAILED"));
});

test("a wrong descriptor version fails to compile", { skip }, () => {
  const report = withContract((contract) => {
    contract.structVersions.declared.CNA_VIDEO_FRAME_EXT_STRUCT_VERSION = 2;
  });
  assert.ok(codes(report).has("STATIC_ASSERT_FAILED"));
});

test("a suffix override that names no CNA constant is reported", { skip }, () => {
  const report = withContract((contract) => {
    family(contract, "FillMode").suffixOverrides.WireFrame = "WIRE_FRAME";
  });
  const found = codes(report);
  assert.ok(found.has("ABSENT_CNA_CONSTANT"));
  assert.ok(found.has("STATIC_ASSERT_FAILED"));
});

test("a mapped prefix that points at the wrong family fails to compile", { skip }, () => {
  const report = withContract((contract) => {
    family(contract, "CompareFunction").cnaPrefix = "CNA_STENCIL";
  });
  assert.ok(codes(report).has("STATIC_ASSERT_FAILED"));
});

test("dropping a family leaves its TypeScript enum unclassified", { skip }, () => {
  const report = withContract((contract) => {
    contract.enumFamilies = contract.enumFamilies.filter((entry) => entry.typeScriptEnum !== "SurfaceFormat");
  });
  const subjects = report.diagnostics
    .filter((entry) => entry.code === "UNCLASSIFIED_TYPESCRIPT_ENUM")
    .map((entry) => entry.subject);
  assert.deepEqual(subjects, ["SurfaceFormat"]);
});

test("a declared translation with no translator is reported", { skip }, () => {
  const report = withContract((contract) => {
    family(contract, "BlendFunction").translations.Min.translator = "toCnaBlendFunctionThatDoesNotExist";
  });
  assert.ok(codes(report).has("MISSING_TRANSLATOR"));
});

test("a translation that claims the wrong CNA value fails to compile", { skip }, () => {
  const report = withContract((contract) => {
    family(contract, "BlendFunction").translations.Min.cnaValue = 3;
  });
  assert.ok(codes(report).has("STATIC_ASSERT_FAILED"));
});

test("removing a translation exposes the underlying value disagreement", { skip }, () => {
  const report = withContract((contract) => {
    delete family(contract, "BlendFunction").translations.Min;
  });
  assert.ok(codes(report).has("STATIC_ASSERT_FAILED"));
});

test("an undeclared CNA-only constant in a mapped family is reported", { skip }, () => {
  const report = withContract((contract) => {
    contract.expectedCnaOnlyConstants.constants =
      contract.expectedCnaOnlyConstants.constants.filter((name) => name !== "CNA_PRIMITIVE_POINT_LIST_EXT");
  });
  const diagnostic = report.diagnostics.find((entry) => entry.code === "UNDECLARED_CNA_ONLY_CONSTANT");
  assert.ok(diagnostic);
  assert.match(diagnostic.subject, /CNA_PRIMITIVE_POINT_LIST_EXT/);
});

test("a declared CNA-only constant the headers no longer define is reported", { skip }, () => {
  const report = withContract((contract) => {
    contract.expectedCnaOnlyConstants.constants.push("CNA_SURFACE_FORMAT_RETIRED_EXT");
  });
  assert.ok(codes(report).has("VANISHED_CNA_ONLY_CONSTANT"));
});

test("a TypeScript enum member whose value drifts fails to compile", { skip }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-contract-source-"));
  scratch.push(directory);
  const relative = "Microsoft/Xna/Framework/Graphics/VertexEnums.ts";
  fs.mkdirSync(path.join(directory, path.dirname(relative)), { recursive: true });
  const original = fs.readFileSync(path.join(SOURCE_DIR, relative), "utf8");
  fs.writeFileSync(
    path.join(directory, relative),
    original.replace("export enum SetDataOptions { None = 0, Discard = 1, NoOverwrite = 2 }",
      "export enum SetDataOptions { None = 0, Discard = 2, NoOverwrite = 1 }"),
  );
  const report = run({
    cnaRoot: CNA_ROOT,
    contract: path.join(ROOT, "tools/cna-abi/contract.json"),
    sourceDir: directory,
    format: "json",
    output: null,
    reportOnly: true,
  });
  assert.ok(codes(report).has("STATIC_ASSERT_FAILED"));
});

test("the declared translations are the identity everywhere else", () => {
  // XNA BlendFunction: Add=0 Subtract=1 ReverseSubtract=2 Min=3 Max=4.
  assert.deepEqual([0, 1, 2, 3, 4].map(toCnaBlendFunction), [0, 1, 2, 4, 3]);
  assert.deepEqual([0, 1, 2, 3, 4].map(fromCnaBlendFunction), [0, 1, 2, 4, 3]);
  for (const value of [0, 1, 2, 3, 4]) {
    assert.equal(fromCnaBlendFunction(toCnaBlendFunction(value)), value);
  }
  assert.equal(toCnaGamePadType(0x300), 9);
  assert.equal(fromCnaGamePadType(9), 0x300);
  for (const value of [0, 1, 2, 3, 4, 5, 6, 7, 8, 0x300]) {
    assert.equal(fromCnaGamePadType(toCnaGamePadType(value)), value);
  }
});

test("a blend-state snapshot is translated without disturbing its other members", () => {
  const snapshot = Object.freeze({
    AlphaBlendFunction: 3,
    AlphaDestinationBlend: 1,
    AlphaSourceBlend: 0,
    ColorBlendFunction: 4,
    ColorDestinationBlend: 1,
    ColorSourceBlend: 0,
    ColorWriteChannels: 15,
    ColorWriteChannels1: 15,
    ColorWriteChannels2: 15,
    ColorWriteChannels3: 15,
    MultiSampleMask: -1,
  });
  const translated = toCnaBlendState(snapshot);
  assert.equal(translated.AlphaBlendFunction, 4);
  assert.equal(translated.ColorBlendFunction, 3);
  assert.equal(snapshot.AlphaBlendFunction, 3, "the caller's snapshot must not be mutated");
  for (const key of Object.keys(snapshot)) {
    if (key === "AlphaBlendFunction" || key === "ColorBlendFunction") continue;
    assert.equal(translated[key], snapshot[key], key);
  }
});
