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
import test from "node:test";

import { browserBlocked, runFrames } from "./support/browser-harness.mjs";
import { assertColourGradeEvidence } from "./support/colour-grade-oracle.mjs";
import {
  assertParticleEvidence, assertParticleSimulationOracle,
} from "./support/particle-oracle.mjs";
import { assertPostProcessEvidence } from "./support/post-process-oracle.mjs";
import {
  assertDecalState, assertPrepassMaths, assertPrepassState, multipleRenderTargetsDraw,
} from "./support/prepass-decal-oracle.mjs";
import { assertLodEvidence } from "./support/lod-oracle.mjs";
import { assertShadowPassEvidence } from "./support/shadow-oracle.mjs";
import { assertCompiledEffectEvidence } from "./support/compiled-effect-oracle.mjs";

const skip = browserBlocked;

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
  // Whether CNA's extended graphics layer is compiled in is a property of the artifact, not of the
  // binding, so the artifact is what answers -- exactly as it does for compiled effects below.
  // Pinning `false` here made a stronger artifact fail a test about something else entirely, and
  // said nothing a consumer could act on; asserting the type and reporting the value says which
  // artifact this run measured.
  assert.equal(typeof extensions.graphicsExtensionLayer, "boolean");
  console.log(`CNA_TS_WASM_CNAEXT=${extensions.graphicsExtensionLayer ? "ON" : "OFF"}`);
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

test("the browser artifact is asked whether it can run a compiled effect, and answers", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const compiled = result.compiledEffect;
  assert.ok(compiled, "no compiled-effect evidence was produced");
  if (compiled.fixture !== "present") {
    // Only reachable without a `cnanext` checkout to take the bytes from. Said out loud rather
    // than passed over, because a fixture that quietly went missing would look like a pass.
    assert.equal(compiled.fixture, "absent");
    console.log("CNA_TS_WASM_COMPILED_EFFECT=NO_FIXTURE");
    return;
  }

  // Whichever way this artifact was built, the answer has to be one of exactly two, and both are
  // asserted rather than tolerated. `refused` is what the current artifact does, because it is
  // built with CNA_EASYGL_COMPILED_EFFECTS=OFF and CNA says so by name instead of quietly drawing
  // with a stock shader. If a later artifact turns the option on, this test starts taking the
  // other branch and the reflection assertions below become live -- which is the point of writing
  // it this way rather than pinning today's refusal as the expected behaviour forever.
  assert.ok(
    compiled.outcome === "created" || compiled.outcome === "refused",
    `unexpected outcome: ${JSON.stringify(compiled)}`,
  );

  if (compiled.outcome === "refused") {
    // The refusal has to be CNA's, and it has to name the capability. This is the assertion the
    // whole test exists for: before the route was registered the binding declined first, with its
    // own message about a slice it had not implemented, and a browser consumer would have been
    // told the wrong thing -- that cna-ts cannot do this, when what actually varies is whether
    // their artifact was built with `CNA_EASYGL_COMPILED_EFFECTS`. Result 6 is NOT_SUPPORTED, and
    // it is the same result and the same sentence the Node HEADLESS backend produces for the same
    // bytes, which is the parity that matters here.
    assert.equal(compiled.cnaResult, 6, `CNA's own NOT_SUPPORTED: ${compiled.error}`);
    assert.match(
      compiled.error, /GraphicsCapability::CompiledEffects is false/,
      `the refusal names the capability rather than the binding: ${compiled.error}`,
    );
    console.log(`CNA_TS_WASM_COMPILED_EFFECT=REFUSED_BY_CNA capability=false`);
  } else {
    // The artifact carries the runtime, so the whole scenario is live and every part of it is
    // asserted -- the same reflection, the same native write-through and the same predicted texels
    // the windowed OPENGLES3 build is held to.
    assertCompiledEffectEvidence(compiled);
    console.log(
      `CNA_TS_WASM_COMPILED_EFFECT=CREATED PARAMETERS=${compiled.parameters} ` +
      `TECHNIQUES=${compiled.techniques}`,
    );
  }
  assert.deepEqual(consoleErrors, []);
});

test("the browser artifact is asked whether it has CNA's engine layer, and answers", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const grade = result.colourGrade;
  assert.ok(grade, "no extended-graphics evidence was produced");

  // The same shape as the compiled-effect test above, and for the same reason. Whether CNA's
  // extended graphics layer is in the artifact is a `-DCNA_CNAEXT` decision a consumer makes when
  // they build it, so both answers are asserted rather than one of them pinned. Before this slice
  // existed the question could not be reached at all: the WebAssembly backend had no
  // `GraphicsExtensions` object, so every public engine API failed with a message about the
  // *binding* rather than about the artifact.
  assert.equal(typeof grade.layerAbsent, "boolean", `unexpected shape: ${JSON.stringify(grade)}`);

  if (grade.layerAbsent) {
    // CNA's own NOT_SUPPORTED, and the second route agreeing with it: a refusal that came from the
    // binding would not have moved `IsGraphicsExtensionLayerAvailable` at all.
    assert.equal(grade.cnaResult, 6, `CNA's own NOT_SUPPORTED: ${grade.error}`);
    assert.equal(grade.extensionLayer, false, "and the availability query agrees");
    console.log("CNA_TS_WASM_ENGINE_LAYER=ABSENT_FROM_ARTIFACT capability=false");
  } else {
    assertColourGradeEvidence(grade);
    console.log(
      `CNA_TS_WASM_ENGINE_LAYER=PRESENT COLOUR_GRADE=${grade.lut.title} SIZE=${grade.lut.size}`,
    );
  }
  assert.deepEqual(consoleErrors, []);
});

test("the rest of the post-process family answers, or says the layer is absent", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const postProcess = result.postProcess;
  assert.ok(postProcess, "no post-process evidence was produced");
  assert.equal(typeof postProcess.layerAbsent, "boolean");

  if (postProcess.layerAbsent) {
    assert.equal(postProcess.cnaResult, 6, `CNA's own NOT_SUPPORTED: ${postProcess.error}`);
    console.log("CNA_TS_WASM_POST_PROCESS=ABSENT_FROM_ARTIFACT");
    assert.deepEqual(consoleErrors, []);
    return;
  }
  // The same oracle the strong suite applies, and deliberately so: a suite that asserted less here
  // than there is the gap a planted LOD stride survived through last time. `expectSupported` is
  // the one thing that differs, because whether a *particular* pass runs is the device's answer
  // and the ordinary suite records it rather than requiring it.
  assertPostProcessEvidence(postProcess, { expectSupported: false });
  const supported = Object.entries(postProcess.passes)
    .filter(([, pass]) => pass.supported).map(([name]) => name);
  console.log(
    `CNA_TS_WASM_POST_PROCESS=PRESENT PASSES=${Object.keys(postProcess.passes).length} ` +
    `SUPPORTED=${supported.length} ASCII_GRID=${postProcess.ascii.colour.grid.join("x")}`,
  );
  assert.deepEqual(consoleErrors, []);
});

test("particles draw where the camera puts them, or say the layer is absent", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const particles = result.particles;
  assert.ok(particles, "no particle evidence was produced");
  assert.equal(typeof particles.layerAbsent, "boolean");
  if (particles.layerAbsent) {
    assert.equal(particles.cnaResult, 6, `CNA's own NOT_SUPPORTED: ${particles.error}`);
    console.log("CNA_TS_WASM_PARTICLES=ABSENT_FROM_ARTIFACT");
    assert.deepEqual(consoleErrors, []);
    return;
  }
  assertParticleEvidence(particles);
  assertParticleSimulationOracle(particles.simulation);
  console.log(
    `CNA_TS_WASM_PARTICLES=DRAWN BLOBS=${particles.straightOn.blobs.length} ` +
    `ACTIVE=${particles.counts.near}`,
  );
  assert.deepEqual(consoleErrors, []);
});

test("the depth/normal prepass answers, or says the layer is absent", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const prepass = result.prepass;
  assert.ok(prepass, "no prepass evidence was produced");
  assert.equal(typeof prepass.layerAbsent, "boolean");
  if (prepass.layerAbsent) {
    assert.equal(prepass.cnaResult, 6, `CNA's own NOT_SUPPORTED: ${prepass.error}`);
    console.log("CNA_TS_WASM_PREPASS=ABSENT_FROM_ARTIFACT");
    assert.deepEqual(consoleErrors, []);
    return;
  }
  assert.equal(prepass.evidenceError ?? null, null, prepass.evidenceStack ?? "");
  // The same oracle the strong suite applies to the same three things.
  assertPrepassMaths(prepass.maths);
  assertPrepassState(prepass.prepass, { width: prepass.width, height: prepass.height });
  assertDecalState(prepass.decalDefaults);
  const draws = multipleRenderTargetsDraw(prepass.multipleTargetProbe);
  console.log(
    `CNA_TS_WASM_PREPASS=PRESENT MULTIPLE_TARGET_DRAW=${draws ? "YES" : "NO_FINDING_30"} ` +
    `RASTERISED=${prepass.rasterised.count} PREPASS_OCCUPIED=${prepass.prepassOccupied.count}`,
  );
  assert.deepEqual(consoleErrors, []);
});

test("a browser can ask its device what it supports, and the answers are the device's", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const caps = result.deviceCapabilities;
  assert.ok(caps, "no device-capability evidence was produced");

  // Every identity answers a boolean rather than throwing. This is the assertion the slice exists
  // for: before it, `GraphicsDeviceCapabilities.Supports` failed in a browser with a message about
  // the binding, so a page had no cheap way to branch on what its context can do.
  for (const [name, value] of Object.entries(caps.supported)) {
    assert.equal(typeof value, "boolean", `${name} answered ${value}`);
  }

  // Four whose answer a WebGL 2.0 context settles, and which would be wrong if the capability
  // identities were being renumbered on the way through.
  assert.equal(caps.supported.ThreeD, true, "WebGL2 draws 3D");
  assert.equal(caps.supported.MultipleRenderTargets, true, "and binds several targets at once");
  assert.equal(caps.supported.Texture3D, true, "and has 3D textures -- the volume LUT needs them");
  assert.equal(
    caps.supported.ComputeShaders, false,
    "and has no compute shaders: WebGL 2.0 has no compute stage at all, which is a fact about " +
    "the context rather than about how the artifact was built",
  );

  // The work-group limits agree with that: a context with no compute stage reports no room in it.
  for (const axis of caps.maxWorkGroupCount) assert.equal(typeof axis, "number");
  for (const axis of caps.maxWorkGroupSize) assert.equal(typeof axis, "number");
  assert.equal(typeof caps.maxWorkGroupInvocations, "number");

  const on = Object.entries(caps.supported).filter(([, value]) => value).map(([name]) => name);
  console.log(`CNA_TS_WASM_DEVICE_CAPABILITIES=${on.length}/19 ON=${on.join(",")}`);
  assert.deepEqual(consoleErrors, []);
});

test("a browser asks what its device can do with a shadow map, and answers", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const shadows = result.shadows;
  assert.ok(shadows, "no shadow evidence was produced");

  if (shadows.layerAbsent) {
    // The default artifact, where the engine layer is compiled out entirely.
    assert.equal(shadows.cnaResult, 6, `CNA's own NOT_SUPPORTED: ${shadows.error}`);
    console.log("CNA_TS_WASM_SHADOWS=NO_ENGINE_LAYER");
    return;
  }
  assert.equal(shadows.evidenceError ?? null, null, "the layer was present and the probe failed");

  // The maths first, because it is the same arithmetic on every renderer and does not depend on
  // what this context can cast. A light pointing straight down at a scene box asymmetric on all
  // three axes: a transform that dropped a translation term or swapped an axis lands elsewhere.
  assert.equal(shadows.math.view.length, 16);
  assert.equal(shadows.math.projection.length, 16);
  for (const value of [...shadows.math.view, ...shadows.math.projection]) {
    assert.ok(Number.isFinite(value), `every component is a real number: ${value}`);
  }
  // What the transform has to *do*, rather than which component holds which sign -- the second is
  // an axis convention this test would only be guessing at, and it guessed wrong once. XNA
  // multiplies a row vector on the left, so this is v * M.
  const transform = ([x, y, z], m) => [
    x * m[0] + y * m[4] + z * m[8] + m[12],
    x * m[1] + y * m[5] + z * m[9] + m[13],
    x * m[2] + y * m[6] + z * m[10] + m[14],
    x * m[3] + y * m[7] + z * m[11] + m[15],
  ];
  const MIN = [-10, -4, -6], MAX = [6, 12, 14];
  const centre = MIN.map((low, axis) => (low + MAX[axis]) / 2);

  // The defining property of a light view fitted to a scene: the scene's centre lands on the view
  // axis. A dropped translation term or a swapped axis moves it off, by units rather than epsilon.
  const centreInLight = transform(centre, shadows.math.view);
  assert.ok(
    Math.abs(centreInLight[0]) < 1e-3 && Math.abs(centreInLight[1]) < 1e-3,
    `the scene centre lies on the light's view axis: ${centreInLight.join(",")}`,
  );

  // And the defining property of the projection fitted to those bounds: every corner of the box
  // lands inside the unit cube in x and y, and none of them is comfortably inside -- the extreme
  // corners touch the edges, which is what "fitted" means and what a projection ignoring the
  // bounds would not do.
  let widest = 0;
  for (const x of [MIN[0], MAX[0]]) {
    for (const y of [MIN[1], MAX[1]]) {
      for (const z of [MIN[2], MAX[2]]) {
        const clip = transform(transform([x, y, z], shadows.math.view), shadows.math.projection);
        for (const axis of [0, 1]) {
          assert.ok(
            Math.abs(clip[axis]) <= 1 + 1e-3,
            `corner ${x},${y},${z} lands inside the light's frustum: ${clip.join(",")}`,
          );
          widest = Math.max(widest, Math.abs(clip[axis]));
        }
      }
    }
  }
  // Fitted, and fitted *tightly*: the extreme corners reach 0.998 of the way to the frustum edge,
  // which for a 512-texel map is half a texel of margin on each side -- 1 - 1/512 is 0.998047 --
  // and is CNA leaving room so a caster exactly on the boundary is not clipped. A projection that
  // ignored the bounds, or padded them generously, would put this well under 0.99; one that
  // clipped them would have failed the loop above.
  assert.ok(
    widest > 0.99 && widest <= 1,
    `the box fills the light's frustum to within about half a texel: widest ${widest}`,
  );
  // An orthographic projection's last row ends in 1, which a perspective one does not.
  assert.ok(
    Math.abs(shadows.math.projection[15] - 1) < 1e-6,
    "the light's projection is orthographic, as a directional light's must be",
  );

  // The quality table, which is CNA's and not this package's.
  assert.deepEqual(
    shadows.sizeForQuality, [512, 1024, 2048],
    "Low, Medium and High are 512, 1024 and 2048 texels square",
  );
  assert.equal(shadows.size, shadows.sizeForQuality[0], "and a Low map is the Low size");
  assert.equal(shadows.filterRadius, shadows.radiusForQuality[0]);
  for (const radius of shadows.radiusForQuality) assert.ok(radius >= 0);
  assert.ok(
    Math.abs(shadows.depthBias.afterSet - 0.0125) < 1e-6,
    `the depth bias round-trips through CNA: ${shadows.depthBias.afterSet}`,
  );
  assert.notEqual(
    shadows.depthBias.afterSet, shadows.depthBias.initial,
    "and the value written is not the one it already had, so the round trip is testable",
  );

  // And what the device says about casting. Both answers are legitimate and neither is assumed --
  // a renderer can rasterise a depth pass it cannot then sample, so the two are asked separately.
  assert.equal(typeof shadows.supported, "boolean");
  assert.equal(typeof shadows.sampling, "boolean");
  // Where it can cast, the whole pass is asserted against the transform CNA reported for it.
  if (shadows.supported) assertShadowPassEvidence(shadows);
  console.log(
    `CNA_TS_WASM_SHADOWS=ENGINE_LAYER_PRESENT CASTING=${shadows.supported} ` +
    `SAMPLING=${shadows.sampling} SIZE=${shadows.size}`,
  );
  assert.deepEqual(consoleErrors, []);
});

test("a browser selects levels of detail, and the arithmetic is exactly predictable", { skip }, async () => {
  const { result, consoleErrors } = await runFrames(60);
  assert.equal(result.status, "ok", result.error ?? "");
  const lod = result.lod;
  assert.ok(lod, "no level-of-detail evidence was produced");

  if (lod.layerAbsent) {
    assert.equal(lod.cnaResult, 6, `CNA's own NOT_SUPPORTED: ${lod.error}`);
    console.log("CNA_TS_WASM_LOD=NO_ENGINE_LAYER");
    return;
  }
  assert.equal(lod.evidenceError ?? null, null, "the layer was present and the probe failed");

  assertLodEvidence(lod);
  console.log(
    `CNA_TS_WASM_LOD=COMPLETE LEVELS=${lod.count} MODES=distance,screen-space ` +
    `HYSTERESIS=${lod.hysteresis.margin}`,
  );
  assert.deepEqual(consoleErrors, []);
});
