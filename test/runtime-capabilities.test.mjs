import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATOR = path.join(ROOT, "tools/runtime-capabilities/generate.mjs");
const SOURCE = path.join(ROOT, "tools/runtime-capabilities/source.json");
const baseline = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
const scratch = [];
test.after(() => {
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
});

function generate(mutate) {
  const source = structuredClone(baseline);
  if (mutate) mutate(source);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-capabilities-"));
  scratch.push(directory);
  const file = path.join(directory, "source.json");
  fs.writeFileSync(file, JSON.stringify(source, null, 2));
  return spawnSync(process.execPath, [
    GENERATOR,
    "--source", file,
    "--json-output", path.join(directory, "out.json"),
    "--markdown-output", path.join(directory, "out.md"),
  ], { encoding: "utf8" });
}

function entry(source, operation) {
  const found = source.entries.find((candidate) => candidate.operation === operation);
  assert.ok(found, `no capability row named ${operation}`);
  return found;
}

test("the checked-in inventory satisfies its own consistency gate", () => {
  const result = generate(null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CONSISTENCY_GATE=PASS/);
});

test("a verified-native row with no imported route is refused", () => {
  const result = generate((source) => {
    entry(source, "GraphicsDevice.Clear and Present").proof = ["route:cna_not_a_real_route"];
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not import cna_not_a_real_route/);
});

test("a verified-native row with no proof at all is refused", () => {
  const result = generate((source) => {
    delete entry(source, "GraphicsDevice.Clear and Present").proof;
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VERIFIED_NATIVE needs at least one route proof/);
});

test("a verified-managed row naming a test that does not exist is refused", () => {
  const result = generate((source) => {
    entry(source, "KeyboardState, MouseState, GamePad values and Touch values/collections").proof =
      ["test:test/not-a-real-suite.test.mjs"];
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /test\/not-a-real-suite\.test\.mjs does not exist/);
});

test("a WebAssembly row naming a route that backend does not import is refused", () => {
  const result = generate((source) => {
    entry(source, "Browser/Wasm CNA runtime").proof =
      ["wasmRoute:cna_audio_engine_create", "test:test/wasm-browser.mjs"];
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WebAssembly backend does not import cna_audio_engine_create/);
});

test("claiming something is unimplemented while a backend imports it is refused", () => {
  const result = generate((source) => {
    entry(source, "RenderTarget ContentLost event signaling").proof = ["absentRoute:cna_texture2d_create"];
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /claims cna_texture2d_create is unimplemented but a backend imports it/);
});

test("a source-audit count that drifts is refused", () => {
  const result = generate((source) => {
    source.sourceAudit.notSupportedExceptionSites += 1;
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source audit notSupportedExceptionSites changed/);
});

test("a duplicate operation family is refused", () => {
  const result = generate((source) => {
    source.entries.push({ ...entry(source, "GraphicsDevice.Clear and Present") });
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate operation family/);
});
