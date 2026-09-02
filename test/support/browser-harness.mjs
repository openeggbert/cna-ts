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
const PAGE_DIRECTORY = path.join(ROOT, "test/wasm");
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

function serve(page, reports) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let file = null;
    // The page-to-harness channel, and the reason it is HTTP rather than `page.evaluate`.
    //
    // Playwright issues CDP `Runtime.evaluate`/`callFunctionOn` with `userGesture: true`, so
    // `page.evaluate`, `page.waitForFunction` and `page.title()` all hand the page a *user
    // activation* as a side effect: measured here, `navigator.userActivation.hasBeenActive` is
    // false at parse and true inside the very first `page.evaluate`. That is harmless for
    // everything this package asserts through the DOM and fatal for anything asserting what a
    // browser does BEFORE a gesture, because the act of asking would supply the answer.
    //
    // So a page that has something to say about its own pre-gesture state says it over this
    // route instead, and the harness learns it without touching CDP at all.
    if (url.pathname === "/harness/report") {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        try { reports.push(JSON.parse(body)); }
        catch { reports.push({ label: "unparseable", body: body.slice(0, 200) }); }
        response.writeHead(204).end();
      });
      return;
    }
    // Playwright's headless shell never asks for one; the full Chromium build a capture run needs
    // does, and a 404 would arrive as a console error in a suite that requires none.
    if (url.pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    if (url.pathname === "/" || url.pathname === "/index.html") file = page;
    // The fixture *generators*, served as modules so a page can build its own assets rather than
    // fetch bytes somebody else produced. `xact.mjs` is the reason: an XACT bank is three files
    // whose offsets depend on each other, and generating them in the page keeps that arithmetic
    // in one place for both backends.
    else if (url.pathname.startsWith("/fixture-modules/")) {
      file = path.join(ROOT, "test/fixtures", url.pathname.slice("/fixture-modules/".length));
    }
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

/**
 * The build a capture run needs, and it is not the default one.
 *
 * `chromium.launch()` runs Playwright's *headless shell*, which is a stripped Chromium with no
 * media-capture stack at all: `getUserMedia({ audio: true })` there rejects with
 * `NotSupportedError: Not supported`, before any permission or device question is reached. The
 * full build, still headless, has it. So a capture run asks for the channel by name and skips with
 * a reason where it is not installed, rather than degrading to something that cannot capture.
 */
const FAKE_MEDIA_CHANNEL = "chromium";

/** Why a synthetic-capture run cannot happen here, or `false`. */
export async function fakeCaptureBlocked() {
  if (browserBlocked) return browserBlocked;
  try {
    const probe = await playwright.chromium.launch({ channel: FAKE_MEDIA_CHANNEL });
    await probe.close();
    return false;
  } catch (error) {
    return `a synthetic capture run needs Playwright's full "${FAKE_MEDIA_CHANNEL}" build, ` +
      "because the bundled headless shell has no media-capture stack: " +
      String(error?.message ?? error).split("\n")[0];
  }
}

/**
 * Waits for a page to post `label` on the harness channel, polling the array the server fills.
 *
 * A plain interval rather than an event, because the point is to reach this without Playwright:
 * every Playwright wait helper runs a polling function *in the page*, and running a function in
 * the page is what grants the activation this is waiting to be asked for.
 */
function waitForReport(reports, label, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const found = reports.find((report) => report.label === label);
      if (found) { clearInterval(timer); resolve(found); return; }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`the page never reported ${JSON.stringify(label)}; it reported ` +
          `${JSON.stringify(reports.map((report) => report.label))}`));
      }
    }, 25);
  });
}

/**
 * Runs a harness page for `frames` frames and returns its result object and console errors.
 *
 * `page` names a file in `test/wasm`; the default is the engine-layer page every existing suite
 * uses. The non-engine families have their own page because they need a different game -- one that
 * writes XACT banks and a content root into the module filesystem before CNA is asked about them
 * -- and because one page collecting both would make a failure in either read as a failure of the
 * whole run.
 *
 * `options.activate` opts the run into a **browser-trusted user activation**: the page renders a
 * control, reports `waiting-for-user-activation` on the harness channel, and this sends a real
 * Playwright click to `options.activate` when it is a selector (`#activate` when it is `true`).
 * It is opt-in because most pages have nothing to say about gestures and a click before their
 * first frame would be a different run; the audio page needs it, because a browser will not let a
 * WebAudio context leave `suspended` without one.
 *
 * The returned `reports` are what the page posted on that channel, and `mixerFormat` is the
 * channel count and sample rate CNA's own mixer notice announced, or `null` if no audio was opened.
 */
export async function runFrames(frames, pageFile = "browser-page.html", options = {}) {
  const { activate = false, fakeAudioCapture = null } = options;
  const activationSelector = typeof activate === "string" ? activate : "#activate";
  const reports = [];
  const { server, port } = await serve(path.join(PAGE_DIRECTORY, pageFile), reports);
  const launch = {
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
  };
  if (fakeAudioCapture) {
    // The hard guarantee, and it is a refusal rather than a fallback. Without BOTH flags a page
    // granted the microphone permission below would open whatever capture device this host has,
    // and record the room. There is deliberately no path from here to "use the default device".
    if (!fs.existsSync(fakeAudioCapture)) {
      throw new Error(
        `refusing to start a capture run: there is no synthetic audio source at ` +
        `${fakeAudioCapture}, and without --use-file-for-fake-audio-capture the browser would ` +
        "open this host's real microphone");
    }
    launch.channel = FAKE_MEDIA_CHANNEL;
    launch.args.push(
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${path.resolve(fakeAudioCapture)}`,
    );
  }
  const browser = await playwright.chromium.launch(launch);
  // A context of its own, so the microphone permission below is scoped to this run's origin and
  // dies with it. Nothing persists: no profile directory, no stored permission.
  const context = await browser.newContext();
  try {
    if (fakeAudioCapture) {
      await context.grantPermissions(["microphone"], { origin: `http://127.0.0.1:${port}` });
    }
    const page = await context.newPage();
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
    // That same notice is the only place CNA states the format its mixer actually negotiated:
    // there is no C ABI route for it (`GetMixerSampleRate` is internal), and the browser's own
    // `AudioContext.sampleRate` is a different number -- 48000 here, where the mixer runs at
    // 44100 and SDL resamples between them. A page reading `VisualizationData.Frequencies` needs
    // the mixer's rate to know what a bin is worth in Hz, so it is captured rather than assumed.
    let mixerFormat = null;
    const applicationFormat =
      /application format=0x[0-9a-f]+ channels=(\d+) freq=(\d+)/;
    // Nor does CNA's PCM plausibility advisory, which is a *warning about the audio* rather than a
    // failure and is written straight to stderr. It fires on this package's own synthesised XACT
    // tones: CNA flags raw PCM16 whose byte histogram exceeds 7.9 bits of entropy as probably not
    // being PCM at all, and a clean high-amplitude sine has a very nearly uniform low byte -- three
    // of the four fixture tones measure 7.90 and one measures 7.71. Recorded upstream rather than
    // dodged by making the fixture quieter, which would have hidden a real false positive.
    const pcmAdvisory = /^\[SoundEffect\] Warning: raw PCM buffer has implausibly high byte-level entropy/;
    // And three more of the same shape: XACT's loaders each announce a *successful* load on
    // stderr with no level, so a page that opens an audio engine reports three console errors on a
    // path where nothing went wrong. Same defect and same fix as the mixer notice above; recorded
    // together as upstream finding 2.
    const xactNotice = /^\[(AudioEngine|WaveBank|SoundBank)\] Loaded (XGS|XWB|XSB): /;
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (mixerNotice.test(text)) {
        const format = applicationFormat.exec(text);
        if (format) mixerFormat = { channels: Number(format[1]), freq: Number(format[2]) };
        return;
      }
      if (runtimeLog.test(text) || pcmAdvisory.test(text) || xactNotice.test(text)) return;
      consoleErrors.push(text);
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));
    await page.goto(`http://127.0.0.1:${port}/?frames=${frames}`, { waitUntil: "load" });
    if (activate) {
      // The page says it is ready over the HTTP channel above, so nothing has touched CDP yet and
      // the click below is the FIRST user activation the page has ever had. Waiting with
      // `page.waitForFunction` instead would grant one before the button was ever pressed, and the
      // suite would be asserting Playwright's polling rather than its own gesture.
      await waitForReport(reports, "waiting-for-user-activation");
      // A real Playwright input action. Not `element.click()`, not `dispatchEvent`, not
      // `page.evaluate` -- those are `isTrusted: false` and the page's own negative control proves
      // they grant no activation.
      await page.locator(activationSelector).click();
    }
    await page.waitForFunction(
      () => globalThis.__cnaHarness && globalThis.__cnaHarness.status !== "running",
      undefined,
      { timeout: 180_000 },
    );
    const result = await page.evaluate(() => globalThis.__cnaHarness);
    // `launchArgs` goes back so a capture suite can assert the fake-device flags were really
    // present rather than trusting that this function passed them.
    return { result, consoleErrors, reports, mixerFormat, launchArgs: launch.args };
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
}
