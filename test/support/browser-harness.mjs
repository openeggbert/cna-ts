// SPDX-License-Identifier: MS-PL

/**
 * The browser harness two WebAssembly suites share: an HTTP server over the built package, the
 * artifact and the fixtures, and one headless Chromium run of `test/wasm/browser-page.html`.
 *
 * It lives here because there are now two suites rather than one. `wasm-browser.mjs` asks what the
 * artifact in front of it can do and asserts the consequences either way;
 * `wasm-browser-strong.mjs` requires an artifact built with the optional compiled-effect and
 * extended-graphics runtimes and fails without them. Two copies of a hundred lines of server and
 * browser plumbing is how those two would come to disagree about what they were measuring.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { compressedXnb, spriteFontXnb, textureXnb } from "../fixtures/xnb.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** The artifact under test: `CNA_WASM_ARTIFACT_DIR`, or the default build directory. */
export const WASM_DIR = process.env.CNA_WASM_ARTIFACT_DIR
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

/**
 * The assets the page writes into the module filesystem, from the same generators the Node
 * integration suite loads. A browser fetches its content; this server is where it fetches it from,
 * so the bytes a browser loads and the bytes Node loads are the same bytes.
 */
const FIXTURES = new Map([
  ["title-note.txt", new TextEncoder().encode("cna-ts title storage, read in a browser")],
  // Uncompressed for the texture and LZX-compressed for the font, so the browser exercises both
  // XNB framings rather than only the simple one.
  ["Atlas.xnb", textureXnb()],
  ["SyntheticFont.xnb", compressedXnb(spriteFontXnb())],
]);

/**
 * The compiled effect the windowed Node suite draws with, served here so the browser is asked the
 * same question with the same bytes. It lives in `cnanext`, so it is optional: without it the page
 * records that it had no fixture rather than inventing one.
 */
const COMPILED_EFFECT = (() => {
  const source = path.resolve(process.env.CNA_SOURCE_PATH ?? "../../cnanext");
  const file = path.join(source, "modules/renderers/fna3d/effects/CnaConformanceEffect.fxb");
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
})();
if (COMPILED_EFFECT) FIXTURES.set("CnaConformanceEffect.fxb", COMPILED_EFFECT);

function serve() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let file = null;
    if (url.pathname === "/" || url.pathname === "/index.html") file = PAGE;
    else if (url.pathname.startsWith("/cna-ts/")) file = path.join(DIST, url.pathname.slice("/cna-ts/".length));
    else if (url.pathname.startsWith("/wasm/")) file = path.join(WASM_DIR, url.pathname.slice("/wasm/".length));
    else if (url.pathname.startsWith("/fixtures/")) {
      const bytes = FIXTURES.get(url.pathname.slice("/fixtures/".length));
      if (bytes) {
        response.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store" });
        response.end(Buffer.from(bytes));
        return;
      }
    }
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

/** Why neither suite can run, or `false`. */
export const browserBlocked = blocked ?? (playwright ? false : "playwright is not installed");

/** Runs the harness page for `frames` frames and returns its result object and console errors. */
export async function runFrames(frames) {
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
    // One CNA line does not go through that logger: the SDL3 mixer prints its negotiated audio
    // format to stderr unconditionally, *after* it has successfully created the mixer, and
    // Emscripten routes stderr to console.error. It is a success notice, so it is classified out
    // by its exact shape rather than by widening the rule above -- and recorded upstream in
    // docs/upstream-cna-findings.md, because a browser consumer collecting console errors sees it.
    const mixerNotice = /^\[AudioMixer\] Requested format=0x[0-9a-f]+ channels=\d+ freq=\d+; /;
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (runtimeLog.test(text) || mixerNotice.test(text)) return;
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
