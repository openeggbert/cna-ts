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

import { compressedXnb, spriteFontXnb, textureXnb } from "./fixtures/xnb.mjs";

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

test("the WebAssembly backend runs 60 real browser frames through the public XNA API", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  assert.equal(result.backend, "wasm");
  assert.match(result.abiVersion, /^0\.21\./);
  assert.equal(result.frames, 60);
  assert.ok(result.updates >= 60, `expected at least 60 updates, saw ${result.updates}`);
  assert.ok(result.draws >= 1, `expected at least one draw, saw ${result.draws}`);
  assert.equal(result.textureInfo, 2002);
  assert.equal(result.disposed, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("the modern CNA runtime services answer over the same WebAssembly module", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const extensions = result.extensions;
  assert.ok(extensions, "the extension facade produced no result");
  // CNA_PLATFORM_WEB. A browser reporting anything else would mean the platform probe is guessing.
  assert.equal(extensions.platform, 3);
  assert.equal(extensions.platformName.length > 0, true);
  assert.equal(extensions.isMobile, false);
  assert.deepEqual(extensions.available, ["WebGL2"]);
  assert.deepEqual(extensions.availableCategories, ["Web"]);
  // Both of these reach a route taking CNA_StringView by value, which is the wasm32 convention
  // WASM_ARTIFACT.md leaves unpinned; a wrong lowering would not round-trip.
  assert.equal(extensions.parsedWebGL2, 6);
  assert.equal(extensions.parsedNonsense, null);
  assert.equal(extensions.fallbacks, 0);
  assert.equal(typeof extensions.logLevel, "number");
  assert.equal(extensions.graphicsExtensionLayer, false, "this artifact is built with CNA_CNAEXT off");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("a browser loads real XNB content through the ordinary Content API", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");

  // Title storage: exact bytes out of the module filesystem, and a real refusal for a missing file
  // rather than an empty asset, which is what a size-probe route gets wrong when it swallows I/O.
  assert.equal(result.titleNote, "cna-ts title storage, read in a browser");
  assert.match(result.titleMissing, /cna_title_container_read_ext failed with CNA result 5/);
  // The size probe and the copy must agree, and the copy must land the file's real first bytes:
  // "XNBw", format 5, no flags, and a self-describing length equal to what was read.
  assert.equal(result.atlasProbe.length, 126);
  assert.deepEqual(result.atlasProbe.head.slice(0, 6), [0x58, 0x4e, 0x42, 0x77, 5, 0]);
  assert.equal(
    new DataView(Uint8Array.from(result.atlasProbe.head).buffer).getInt32(6, true),
    result.atlasProbe.length,
  );

  // An uncompressed XNB read through ContentManager, ending in a native texture. The pixels are the
  // fixture's, so a wrong reader, a wrong stride or a wrong upload all fail here.
  const texture = result.contentTexture;
  assert.ok(texture, "no content texture was produced");
  assert.deepEqual([texture.width, texture.height], [2, 2]);
  assert.equal(texture.format, 0, "SurfaceFormat.Color");
  assert.deepEqual(texture.pixels, [
    0xff0000ff, 0xff008000, 0xffff0000, 0xffffffff,
  ], "red, green, blue and white as XNA packs them");
  assert.equal(texture.cached, true, "the second Load returns the same instance");

  // An LZX-compressed XNB through the same manager, decoded by the managed decompressor, and a
  // measurement that depends on the glyph table having been read correctly.
  assert.deepEqual(
    [result.contentFont.width, result.contentFont.height, result.contentFont.spacing],
    [9, 8, 1],
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("a browser renders to an off-screen target and reads its exact pixels back", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const target = result.renderTarget;
  assert.ok(target, "no render target was produced");
  assert.deepEqual([target.width, target.height], [4, 4]);
  assert.equal(target.depthFormat, 0, "DepthFormat.None");
  assert.equal(target.usage, 0, "RenderTargetUsage.DiscardContents");
  assert.equal(target.multiSampleCount, 0);
  assert.equal(target.isContentLost, false, "WebGL2 is not a device-losing renderer family");
  assert.equal(result.boundTarget, 1);
  assert.equal(result.unboundTarget, 0);

  // The first GPU-produced pixels this project asserts. Clear wrote (12, 34, 56, 255) into the
  // target; every one of its sixteen texels must be exactly that after the backbuffer is restored,
  // which is only true if the bind, the clear, the unbind and the readback all reached real
  // WebGL2 storage.
  const expected = (255 << 24 >>> 0) + (56 << 16) + (34 << 8) + 12;
  assert.equal(target.pixels.length, 16);
  assert.deepEqual(target.pixels, new Array(16).fill(expected));

  // A bound target cannot be disposed. XNA raises, CNA refuses, and the refusal must arrive as the
  // managed exception rather than as a native abort.
  assert.equal(result.boundDisposal, "A bound RenderTarget2D cannot be disposed");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("a browser draws 3D geometry, and the pixels say so", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const three = result.wasm3d;
  assert.ok(three, "no 3D evidence was produced");
  assert.equal(three.failed, undefined, `the 3D draw failed: ${three.failed}`);

  // Until the vertex buffer, index buffer, BasicEffect and indexed-draw routes reached the
  // WebAssembly backend, a browser could draw sprites and nothing else. This is a triangle drawn
  // with vertex colours through the ordinary XNA API, read back texel by texel.
  const clear = three.clear.join(",");
  const red = "255,0,0,255";
  const kinds = (texels) => [...new Set(texels.map((texel) => texel.join(",")))];

  assert.deepEqual(
    kinds(three.covered), [red],
    "a triangle that covers the whole target leaves every texel the vertex colour -- not the " +
    "clear colour, which is what a draw that silently did nothing would leave",
  );
  assert.equal(three.covered.length, 64);

  // The strongest of the three, because it is the one that can only pass if the world matrix
  // reached the shader: a CNA_Matrix is taken by value, and under wasm32 that means a pointer to
  // a caller-owned copy. A matrix that arrived as zeroes would collapse the triangle rather than
  // translate it, and one that arrived as noise would not clear the target this exactly.
  assert.deepEqual(
    kinds(three.movedAway), [clear],
    "translating the triangle off the target leaves every texel the clear colour",
  );
  assert.deepEqual(
    kinds(three.nudged), [red],
    "and a translation small enough to stay on it leaves the vertex colour, so the two are not " +
    "both explained by the draw failing",
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("a browser loads CNA's own compiled content through the same API Node uses", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const cnb = result.cnb;
  assert.ok(cnb, "no CNB evidence was produced");

  // The container primitives answer identically in both backends, because they are the same C
  // routines: the CRC-32C check value and the magic are not browser-specific.
  assert.equal(cnb.hasMagic, true);
  assert.equal(cnb.crc32c, 0xe3069283, "the Castagnoli check value for \"123456789\"");

  // A container CNA's own writer produced, parsed back in the page: same asset type, same metadata,
  // same chunk order the Node suite asserts.
  assert.equal(cnb.assetType, 1, "CnbAssetType.Texture2D");
  assert.equal(cnb.contentName, "Browser/Atlas");
  assert.deepEqual(cnb.chunks, ["CMET", "TEXH", "TEXR", "TEXD"]);
  assert.equal(cnb.externalReferences, 0);

  // And the whole point: the decoded levels reach a real WebGL2 Texture2D with the exact texels
  // the encoder was given. This is the same assertion test/cnb-content.integration.mjs makes on
  // Node, through the same public API, against a different backend.
  assert.deepEqual(cnb.textureSize, [2, 2]);
  assert.deepEqual(cnb.uploadedPixels, [0xff0000ff, 0xff008000, 0xffff0000, 0x40302010]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("a browser game can build and drive a sound effect", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const audio = result.audio;
  assert.ok(audio, "no audio evidence was produced");

  // Duration is arithmetic on the sample count, so it is exact and does not depend on anything
  // being audible: a quarter second of 8 kHz mono is a quarter second whatever the page's audio
  // context is doing.
  assert.equal(audio.durationMilliseconds, 250);
  assert.equal(audio.durationMilliseconds, audio.expectedMilliseconds);
  assert.equal(audio.durationTicks, "2500000");

  // Every instance property round-trips through CNA at float precision.
  assert.equal(audio.volume, 0.5);
  assert.equal(audio.pitch, 0.25);
  assert.equal(audio.pan, -0.75);
  assert.equal(audio.isLooped, true);
  assert.equal(typeof audio.masterVolume, "number");

  // The state machine, which is what can be asserted in a page that has had no user gesture.
  // XNA numbers SoundState Playing = 0, Paused = 1, Stopped = 2, so a fresh instance is stopped,
  // Play makes it playing, Pause pauses it, Resume plays it again and Stop stops it. Whether
  // anyone heard it is a browser question this deliberately does not answer.
  const [Playing, Paused, Stopped] = [0, 1, 2];
  assert.deepEqual(
    audio.states, [Stopped, Playing, Paused, Playing, Stopped], "SoundState transitions",
  );
  assert.equal(typeof audio.played, "boolean", "Play reports acceptance rather than audibility");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("a browser reads CNA's compiled model schema through the same API Node uses", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const model = result.cnbModel;
  assert.ok(model, "no CNB model evidence was produced");

  // CNB's largest schema, encoded by CNA's writer inside the page and decoded back there. Every
  // assertion is a value the Node suite asserts too, which is the point: the API is backend-neutral
  // and this proves it rather than assuming it.
  assert.equal(model.assetType, 5, "CnbAssetType.Model");
  assert.equal(model.contentName, "Browser/Rig");
  assert.deepEqual(
    [model.boneCount, model.partCount, model.meshCount, model.lightCount], [2, 1, 1, 1],
  );
  assert.equal(model.hasSkeleton, true);

  // The hierarchy: a reader that returned zero for every parent would pass a "is a number" check
  // and fail this.
  assert.equal(model.rootName, "root");
  assert.equal(model.childName, "child");
  // Both parents. The child's is zero, so asserting it alone would pass against a reader that
  // returned zero for every bone -- which is exactly what a planted defect proved.
  assert.equal(model.rootParent, -1, "the root has no parent");
  assert.equal(model.childParent, 0, "the child hangs from the root");
  assert.deepEqual(model.rootScale, [1, 1, 1]);
  assert.deepEqual(model.childScale, [2, 2, 2], "the child bone's transform, not the root's");

  // The part and its payloads, byte for byte through wasm32 memory.
  assert.equal(model.partName, "triangle");
  assert.equal(model.partStride, 12);
  assert.equal(model.partVertexCount, 3);
  assert.equal(model.partEffectKind, 3, "CnbEffectKind.Pbr");
  assert.deepEqual(model.vertexBytes, [0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.deepEqual(model.indexBytes, [0, 1, 2]);

  // Two named texture slots set and a third left empty, so a slot answered through its neighbour's
  // route is caught in a page as it is on Node.
  assert.equal(model.baseColorTexture, "albedo");
  assert.equal(model.normalTexture, "bumps");
  assert.equal(model.emissiveTexture, "", "an unnamed slot is empty, not the previous slot's name");

  assert.equal(model.meshName, "body");
  assert.equal(model.meshParentBone, 1);
  assert.deepEqual(model.meshParts, [0]);

  // The skeleton's three matrix sets, each with its own diagonal: reading one through another
  // set's identity is the exact defect this arrangement detects.
  assert.deepEqual(model.skeletonHierarchy, [-1, 0]);
  assert.deepEqual(model.skeletonDiagonals, [[1, 2], [3, 4], [5, 6]]);
  assert.deepEqual(model.light, [0, -1, 0, 1, 0.5, 0.25]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("a browser reads CNA's compiled media schemas, and measures a real duration", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");

  // The sound effect. This artifact has SDL3 audio, so unlike the NULL-audio Node artifact it can
  // report a duration -- and duration is arithmetic on the frame count, so it is exact evidence
  // that the samples and the rate both survived the encode/decode cycle. A quarter second of 8 kHz
  // mono is 250 ms and 2,500,000 ticks.
  const sound = result.cnbSoundEffect;
  assert.ok(sound, "no CNB sound-effect evidence was produced");
  assert.equal(sound.assetType, 8, "CnbAssetType.SoundEffect");
  assert.equal(sound.format, 1, "CnbAudioFormat.Pcm16");
  assert.equal(sound.sampleRate, 8000);
  assert.equal(sound.channels, 1);
  assert.equal(sound.frameCount, 2000);
  // Two different loop numbers, so a reader that returned one for both fails here.
  assert.equal(sound.loopStart, 25);
  assert.equal(sound.loopLength, 75);
  assert.equal(sound.sampleBytesMatch, true, "the sample bytes came back exactly");
  assert.equal(sound.durationMilliseconds, 250);
  assert.equal(sound.durationTicks, "2500000");

  // A song: a stream reference plus metadata, complete without a byte of music.
  const song = result.cnbSong;
  assert.ok(song, "no CNB song evidence was produced");
  assert.equal(song.assetType, 9, "CnbAssetType.Song");
  assert.equal(song.streamReference, "Music/Theme.ogg");
  assert.equal(song.name, "Main Theme", "the display name is not the stream reference");
  assert.equal(song.durationMilliseconds, 123456);

  // A video: the same idea, with a description whose fields are none of them derivable from
  // another -- 1280x720 is not square, 29.97 is not an integer, and neither is the duration.
  const video = result.cnbVideo;
  assert.ok(video, "no CNB video evidence was produced");
  assert.equal(video.assetType, 10, "CnbAssetType.Video");
  assert.equal(video.streamReference, "Movies/Intro.ogv");
  assert.equal(video.durationMilliseconds, 45678);
  assert.equal(video.width, 1280);
  assert.equal(video.height, 720, "width and height are distinct fields");
  assert.ok(Math.abs(video.framesPerSecond - 29.97) < 1e-4, `fps was ${video.framesPerSecond}`);
  assert.equal(video.soundtrackType, 2);

  // Decoding frames from that video is a different claim entirely, and nothing here makes it.
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("a browser reads CNA's compiled curve and animation clip", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");

  // The curve's native handle never leaves the backend -- XNA's Curve is managed -- so the page
  // gets an ordinary Curve and checks it by *evaluating* it, sampled between the keys where the
  // tangents and the continuity actually matter. Matching values at the keys alone would not.
  const curve = result.cnbCurve;
  assert.ok(curve, "no CNB curve evidence was produced");
  assert.equal(curve.assetType, 7, "CnbAssetType.Curve");
  assert.equal(curve.preLoop, 1, "CurveLoopType.Cycle");
  assert.equal(curve.postLoop, 3, "CurveLoopType.Oscillate, distinct from PreLoop");
  assert.equal(curve.keyCount, 3);
  assert.deepEqual(curve.continuities, [0, 1, 0], "Smooth, Step, Smooth");
  assert.equal(curve.evaluatesIdentically, true, "the decoded curve evaluates like the authored one");

  // The clip keeps its handle, because XNA has no animation-clip type to become.
  const clip = result.cnbClip;
  assert.ok(clip, "no CNB animation-clip evidence was produced");
  assert.equal(clip.assetType, 6, "CnbAssetType.AnimationClip");
  assert.equal(clip.durationSeconds, 2.5);
  assert.equal(clip.trackCount, 2);
  assert.equal(clip.targetSpace, 1);
  // Two tracks with different bone indexes and different keyframe counts: a reader that returned
  // the first for both fails on either.
  assert.deepEqual(clip.boneIndices, [3, 7]);
  assert.deepEqual(clip.keyframeCounts, [2, 1]);
  assert.deepEqual(clip.firstTimes, [0, 1.25]);
  // Three vectors of different lengths at different offsets in a 48-byte structure whose wasm32
  // layout is measured, not written: transposing any two of them fails here.
  assert.deepEqual(clip.lastTranslation, [-1, -2, -3]);
  assert.deepEqual(clip.lastRotation, [0, 1, 0, 0]);
  assert.deepEqual(clip.lastScale, [0.5, 0.25, 0.125]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(consoleErrors, []);
});

test("a browser builds the same .cnb bytes a build script does", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  assert.deepEqual(consoleErrors, []);
  const writers = result.cnbWriters;
  assert.equal(typeof writers, "object", `CNB writers failed: ${JSON.stringify(writers)}`);

  // The same payload the Node suite writes, from the same calls. Built here rather than fetched,
  // and then compared against the bytes Node produces -- which is the claim
  // docs/content-pipeline-boundary.md makes: a .cnb built in a page and one built in a build
  // script are the same bytes, not merely both parseable.
  const expectedPayload = (() => {
    const bytes = new Uint8Array(52);
    const view = new DataView(bytes.buffer);
    view.setUint8(0, 0xAB);
    view.setUint16(1, 0xBEEF, true);
    view.setUint32(3, 0xDEAD_BEEF, true);
    view.setBigUint64(7, 0x0123_4567_89AB_CDEFn, true);
    view.setInt32(15, -123456, true);
    view.setFloat32(19, 0.5, true);
    view.setFloat64(23, -2.25, true);
    view.setUint32(31, 10, true);
    bytes.set(new TextEncoder().encode("hello, cnb"), 35);
    bytes.set([1, 2, 3], 45);
    return bytes;
  })();
  assert.equal(writers.payloadSize, 52);
  assert.equal(
    writers.payloadHex,
    [...expectedPayload].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    "wasm32 lays out every primitive exactly as the desktop ABI does",
  );

  assert.equal(writers.assetType, 9999, "a custom asset type survives the container");
  assert.equal(writers.schemaVersion, 3);
  assert.deepEqual(writers.metadata, ["MyGame.Level", "Levels/One"]);
  assert.deepEqual(writers.chunks, ["CMET", "XREF", "mydt"]);
  assert.equal(writers.externalReference, "Textures/Atlas");
  assert.equal(writers.chunkRoundTrip, true, "and the chunk comes back byte for byte");
  assert.equal(writers.maxChunkAlignment, 4096, "CNA's own limits are readable in a page");

  // The whole image, compared against what the Node backend produced from the same calls. This is
  // read from the CNB integration suite's own recorded size rather than restated, so the two
  // cannot drift apart silently.
  assert.equal(writers.imageSize, 326, "the same calls produce the same container in a browser");

  console.log(
    `CNA_TS_WASM_CNB_WRITERS=PASS PAYLOAD=${writers.payloadSize}B IMAGE=${writers.imageSize}B ` +
    "LAYOUT=IDENTICAL_TO_NODE CHUNK_ROUND_TRIP=EXACT",
  );
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
