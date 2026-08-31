/**
 * Mutation controls for the WebAssembly artifact's link contract.
 *
 * Until CNA C ABI 0.21 this package supplied two Emscripten link settings itself, because
 * `cna_c_api_wasm` set neither: the WebGL version its renderer needs, and `-sASYNCIFY=0`. CNA
 * repaired both, the overrides are gone, and `docs/wasm-backend.md` records the repair. What is
 * left is the risk that a later artifact quietly reacquires either defect — and both fail far from
 * their cause, an Asyncify unwind losing every `i64` handle on the first SDL present and a WebGL 1
 * context failing to compile EasyGL's GLSL ES 3.00 shaders somewhere inside a draw.
 *
 * `npm run audit:cna-abi` therefore measures both properties out of the artifact's own generated
 * JavaScript. A gate nobody has seen fail is not a gate, so these tests plant each defect in a copy
 * of the real artifact and require the audit to reject it.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = path.join(ROOT, "tools/audit-cna-abi.mjs");
const ARTIFACT_DIR = process.env.CNA_WASM_ARTIFACT_DIR
  ? path.resolve(process.env.CNA_WASM_ARTIFACT_DIR)
  : path.resolve(ROOT, "../../cnanext/cmake-build-tswasm/modules/c-api");
const CNA_ROOT = process.env.CNA_SOURCE_PATH
  ? path.resolve(process.env.CNA_SOURCE_PATH)
  : path.resolve(ROOT, "../../cnanext");

function blocked() {
  if (!fs.statSync(path.join(CNA_ROOT, "modules/c-api/include/CNA/C/cna.h"), { throwIfNoEntry: false })?.isFile()) {
    return `no CNA C headers under ${CNA_ROOT}; set CNA_SOURCE_PATH`;
  }
  for (const name of ["cna_c_api.mjs", "cna_c_api.wasm"]) {
    if (!fs.statSync(path.join(ARTIFACT_DIR, name), { throwIfNoEntry: false })?.isFile()) {
      return `no CNA C ABI wasm artifact at ${ARTIFACT_DIR}; set CNA_WASM_ARTIFACT_DIR`;
    }
  }
  return null;
}

const skip = blocked() ?? false;

/**
 * Runs the audit against a directory holding a possibly-mutated copy of the artifact. The `.wasm`
 * is symlinked rather than copied: it is nineteen megabytes and no mutation here touches it.
 */
function auditMutatedModule(mutate) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-wasm-link-contract-"));
  try {
    fs.symlinkSync(path.join(ARTIFACT_DIR, "cna_c_api.wasm"), path.join(directory, "cna_c_api.wasm"));
    const source = fs.readFileSync(path.join(ARTIFACT_DIR, "cna_c_api.mjs"), "utf8");
    fs.writeFileSync(path.join(directory, "cna_c_api.mjs"), mutate(source));
    const result = spawnSync(process.execPath, [AUDIT], {
      encoding: "utf8",
      env: { ...process.env, CNA_SOURCE_PATH: CNA_ROOT, CNA_WASM_ARTIFACT_DIR: directory },
    });
    const line = (name) =>
      result.stdout.split("\n").find((row) => row.startsWith(`${name}=`))?.slice(name.length + 1);
    return { status: result.status, contract: line("WASM_ARTIFACT_LINK_CONTRACT"), stdout: result.stdout };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("the unmutated artifact satisfies the link contract", { skip }, () => {
  const clean = auditMutatedModule((source) => source);
  assert.equal(clean.contract, "OK_ASYNCIFY_OFF_WEBGL2", clean.stdout);
  assert.equal(clean.status, 0);
});

test("an artifact that reacquires the Asyncify runtime is rejected", { skip }, () => {
  // Emscripten emits this object into the generated JavaScript when Asyncify is linked in, which
  // is what CNA's own CApi_WasmLinkContract greps for. Appending it is the smallest faithful
  // reproduction of the upstream regression.
  const mutated = auditMutatedModule((source) => `${source}\nvar Asyncify = { instrumentWasmExports: 1 };\n`);
  assert.equal(mutated.contract, "BROKEN_ASYNCIFY_PRESENT", mutated.stdout);
  assert.equal(mutated.status, 1, "the audit must exit nonzero on a broken artifact");
});

test("an artifact that negotiates WebGL 1 is rejected", { skip }, () => {
  const mutated = auditMutatedModule((source) => source.replaceAll("majorVersion:2", "majorVersion:1"));
  assert.equal(mutated.contract, "BROKEN_WEBGL_MAJOR_VERSIONS_1", mutated.stdout);
  assert.equal(mutated.status, 1, "the audit must exit nonzero on a broken artifact");
});

test("an artifact that requests no WebGL context at all is rejected", { skip }, () => {
  // A silently dropped context request is not the same defect as the wrong version, and it must not
  // pass by producing an empty version list that happens to satisfy nothing.
  const mutated = auditMutatedModule((source) => source.replaceAll("majorVersion:2", "majorVersionX:2"));
  assert.equal(mutated.contract, "BROKEN_WEBGL_MAJOR_VERSIONS_NONE", mutated.stdout);
  assert.equal(mutated.status, 1, "the audit must exit nonzero on a broken artifact");
});
