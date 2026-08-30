#!/usr/bin/env node

/**
 * Proves the WebAssembly backend in a real browser.
 *
 * Bundling is not running: a page that builds is evidence of nothing about a runtime. This harness
 * serves the built package and the CNA C ABI wasm artifact over HTTP, drives an ordinary XNA
 * `Game` from `requestAnimationFrame` in headless Chromium, and asserts the frame counts, the
 * resources the game created, deterministic disposal, and an empty console-error list.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WASM_DIR = process.env.CNA_WASM_ARTIFACT_DIR
  ? path.resolve(process.env.CNA_WASM_ARTIFACT_DIR)
  : path.join(ROOT, "../../cnanext/cmake-build-tswasm/modules/c-api");
const PAGE = path.join(ROOT, "test/wasm/browser-page.html");
const DIST = path.join(ROOT, "dist");

const TYPES = new Map(Object.entries({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
}));

function missing() {
  if (!fs.existsSync(path.join(WASM_DIR, "cna_c_api.mjs"))) {
    return `no CNA C ABI wasm artifact at ${WASM_DIR}; build the cna_c_api_wasm target and set CNA_WASM_ARTIFACT_DIR`;
  }
  if (!fs.existsSync(path.join(DIST, "index.js"))) return "run npm run build first";
  return null;
}

/**
 * Playwright is not a dependency of this package: a browser driver has no business in the
 * dependency tree of a game framework binding. It is used where it is already installed --
 * a local dependency, `CNA_PLAYWRIGHT_MODULE`, or a global install beside the Node that runs this
 * -- and the tests skip with a reason where it is not.
 */
async function importPlaywright() {
  const candidates = [];
  if (process.env.CNA_PLAYWRIGHT_MODULE) candidates.push(process.env.CNA_PLAYWRIGHT_MODULE);
  candidates.push("playwright");
  const globalRoot = path.resolve(path.dirname(process.execPath), "../lib/node_modules/playwright/index.mjs");
  candidates.push(globalRoot);
  for (const candidate of candidates) {
    try {
      const specifier = candidate.startsWith(".") || path.isAbsolute(candidate)
        ? pathToFileURL(candidate).href
        : candidate;
      return await import(specifier);
    } catch {
      continue;
    }
  }
  return null;
}

function serve() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let file = null;
    if (url.pathname === "/" || url.pathname === "/index.html") file = PAGE;
    else if (url.pathname.startsWith("/cna-ts/")) file = path.join(DIST, url.pathname.slice("/cna-ts/".length));
    else if (url.pathname.startsWith("/wasm/")) file = path.join(WASM_DIR, url.pathname.slice("/wasm/".length));
    if (file == null || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": TYPES.get(path.extname(file)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const blocked = missing();
const playwright = blocked ? null : await importPlaywright();
const skip = blocked ?? (playwright ? false : "playwright is not installed");

async function runFrames(frames) {
  const { server, port } = await serve();
  const browser = await playwright.chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    // CNA writes its own log to stderr, which Emscripten routes to console.error regardless of
    // level. An INFO banner is not a page error, so the runtime's own non-error levels are
    // classified out by their exact log-line shape; an ERROR or FATAL from CNA still fails.
    const runtimeLog = /^\[(INFO|DEBUG|TRACE|WARN|WARNING|EXPERIMENT)\]\[[A-Z]+\] /;
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (runtimeLog.test(text)) return;
      consoleErrors.push(text);
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));
    await page.goto(`http://127.0.0.1:${port}/?frames=${frames}`, { waitUntil: "load" });
    await page.waitForFunction(
      () => globalThis.__cnaHarness && globalThis.__cnaHarness.status !== "running",
      undefined,
      { timeout: 180_000 },
    );
    const result = await page.evaluate(() => globalThis.__cnaHarness);
    return { result, consoleErrors };
  } finally {
    await browser.close();
    server.close();
  }
}

test("the WebAssembly backend runs 60 real browser frames through the public XNA API", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  assert.equal(result.backend, "wasm");
  assert.match(result.abiVersion, /^0\.20\./);
  assert.equal(result.frames, 60);
  assert.ok(result.updates >= 60, `expected at least 60 updates, saw ${result.updates}`);
  assert.ok(result.draws >= 1, `expected at least one draw, saw ${result.draws}`);
  assert.equal(result.textureInfo, 2002);
  assert.equal(result.disposed, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("the WebAssembly backend runs 600 real browser frames without drift", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(600);
  assert.equal(result.status, "ok", result.error ?? "");
  assert.equal(result.frames, 600);
  assert.ok(result.updates >= 600, `expected at least 600 updates, saw ${result.updates}`);
  assert.equal(result.disposed, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});
