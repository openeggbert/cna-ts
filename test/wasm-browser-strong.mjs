#!/usr/bin/env node

/**
 * The browser suite for an artifact built with CNA's optional runtimes.
 *
 * `wasm-browser.mjs` deliberately asks the artifact in front of it what it can do and asserts the
 * consequences of either answer, because a consumer's artifact is theirs to build and the default
 * one carries neither optional runtime. That is the right shape for the ordinary suite and it is
 * useless as a *claim*: a run against the default artifact takes the refusal branch, passes, and
 * proves nothing at all about compiled effects.
 *
 * So the claim lives here instead, and this file cannot take a weaker branch. With
 * `CNA_REQUIRE_STRONG_WASM_TESTS=1` it fails, by name and before a test registers, when
 *
 *   - there is no artifact to point at;
 *   - `cna_graphics_ext_is_available` answers false, so the artifact has no `CNA_CNAEXT`;
 *   - the artifact refuses a compiled effect, so it has no `CNA_EASYGL_COMPILED_EFFECTS`;
 *   - the page produced no compiled-effect evidence at all;
 *
 * and the shared `requiredSuite` gate refuses a run in which nothing executed or anything skipped.
 * Every arm is exercised in `test/wasm-strong-gate.test.mjs`, against the shape the default
 * artifact really produces, because a gate nobody has watched fail is a gate nobody knows the
 * shape of.
 *
 * Build such an artifact with:
 *
 *     emcmake cmake -S . -B cmake-build-tswasm-fx -G Ninja \
 *       -DCMAKE_BUILD_TYPE=Release -DCNA_BUILD_C_API=ON \
 *       -DCNA_GRAPHICS_RENDERER=WEBGL2 \
 *       -DCNA_EASYGL_COMPILED_EFFECTS=ON -DCNA_CNAEXT=ON
 *     cmake --build cmake-build-tswasm-fx --target cna_c_api_wasm
 */

import assert from "node:assert/strict";
import { after } from "node:test";

import { browserBlocked, runFrames, WASM_DIR } from "./support/browser-harness.mjs";
import { assertColourGradeEvidence } from "./support/colour-grade-oracle.mjs";
import { assertLodEvidence } from "./support/lod-oracle.mjs";
import {
  assertParticleEvidence, assertParticleSimulationOracle,
} from "./support/particle-oracle.mjs";
import { assertEngineArithmeticEvidence } from "./support/engine-arithmetic-oracle.mjs";
import {
  assertEngineCensus, assertNestedStructures, assertStructureFields,
} from "./support/engine-census-oracle.mjs";
import { assertPostProcessEvidence } from "./support/post-process-oracle.mjs";
import {
  assertDecalState, assertPrepassMaths, assertPrepassState, multipleRenderTargetsDraw,
} from "./support/prepass-decal-oracle.mjs";
import { assertShadowPassEvidence } from "./support/shadow-oracle.mjs";
import { assertShadowVariantEvidence } from "./support/shadow-variant-oracle.mjs";
import { assertCompiledEffectEvidence } from "./support/compiled-effect-oracle.mjs";
import { requiredSuite } from "./support/required-suite.mjs";
import { strongArtifactBlocked } from "./support/strong-artifact-gate.mjs";

/**
 * The page is run once and every test reads that one run.
 *
 * Not an optimisation: the capability gate below has to be decided from the *running artifact*
 * rather than from a build flag or a file name, so the page has to have run before the suite knows
 * whether it may skip -- and running it again per test would be three more browsers for answers
 * that cannot differ.
 */
const evidence = browserBlocked ? null : await runFrames(60);

/** What the artifact answered, or null where the harness could not ask. */
const capabilities = evidence == null ? null : {
  status: evidence.result.status,
  cnaext: evidence.result.extensions?.graphicsExtensionLayer ?? null,
  compiled: evidence.result.compiledEffect ?? null,
};

const { test } = requiredSuite({
  label: "strong-wasm",
  envVar: "CNA_REQUIRE_STRONG_WASM_TESTS",
  counter: "STRONG_WASM_TESTS",
  blocked: strongArtifactBlocked({
    browserBlocked, result: evidence?.result ?? null, wasmDir: WASM_DIR,
  }),
});

/**
 * How many of the tests below were about a compiled effect specifically.
 *
 * Counted separately from the suite total because the two answer different questions: the total
 * says the strong-artifact suite ran, and this says the compiled-effect claim in particular was
 * made. A run reporting four executed tests and zero compiled-effect ones would be a suite that
 * checked two capability flags and asserted no pixels.
 */
let compiledEffectTests = 0;
const compiledEffectTest = (name, body) => test(name, () => { compiledEffectTests += 1; body(); });
after(() => console.log(`COMPILED_EFFECT_BROWSER_TESTS_EXECUTED=${compiledEffectTests}`));

test("the artifact reports CNA's extended graphics layer as present", () => {
  assert.equal(capabilities.cnaext, true);
  // The same routes exist in every build and answer NOT_SUPPORTED where the layer is absent, so a
  // structurally present API is not evidence. This is the one answer that separates the two.
  console.log("STRONG_WASM_CNAEXT=ON");
});

compiledEffectTest("the artifact reports GraphicsCapability::CompiledEffects as true", () => {
  const compiled = capabilities.compiled;
  assert.equal(compiled.outcome, "created", compiled.error ?? "");
  // Stated as the negation of the default artifact's answer, because that answer is the thing this
  // suite exists to distinguish itself from: the same bytes through the same public constructor
  // give CNA result 6 there and a live effect here, and the difference is one CMake option.
  assert.equal(compiled.cnaResult ?? null, null, "nothing refused these bytes");

  // The same answer by a second route, and one that never touches the Effect constructor: CNA's
  // own capability query, through the public `GraphicsDeviceCapabilities`. Two independent paths
  // to one fact is what separates "the constructor happened to work" from "the device says it
  // supports this" -- and on the default artifact this reads false while every other capability
  // below reads the same, so it is the build option and nothing else that moved.
  const caps = evidence.result.deviceCapabilities;
  assert.equal(
    caps.supported.CompiledEffects, true,
    "GraphicsCapability.CompiledEffects, asked of the device rather than inferred from the draw",
  );
  // Two that no build option can change, because they are facts about WebGL 2.0 rather than about
  // CNA: there is no compute stage and no indirect draw in the specification at all. Asserted so
  // that a future context which does have them fails here and gets classified rather than assumed.
  assert.equal(caps.supported.ComputeShaders, false, "WebGL 2.0 has no compute stage");
  assert.equal(caps.supported.IndirectDraw, false, "and no indirect draw");
  console.log("STRONG_WASM_COMPILED_EFFECTS=true (constructor and capability query agree)");
});

compiledEffectTest("a compiled effect reflects, writes through to CNA and draws predicted pixels", () => {
  assertCompiledEffectEvidence(capabilities.compiled);
  console.log(
    `COMPILED_EFFECT_BROWSER_PARAMETERS=${capabilities.compiled.parameters} ` +
    `TECHNIQUES=${capabilities.compiled.techniques} ` +
    `DRAWS=${capabilities.compiled.states.length + 2}`,
  );
});

test("the engine layer's colour grade runs, and its texels are the arithmetic", () => {
  const grade = evidence.result.colourGrade;
  assert.ok(grade, "no extended-graphics evidence was produced");
  assert.equal(
    grade.layerAbsent, false,
    `the artifact reports CNAEXT available and then refused a FullscreenPass: ${grade.error}`,
  );
  assertColourGradeEvidence(grade);
  console.log(
    "STRONG_WASM_ENGINE_SLICE=post-process PASSES=blit,grade,tonemap,bloom,fxaa,aberration,grain " +
    `CHAIN=${grade.chain.twoCount}-pass GPU_TIMING=${grade.chain.timingEnabled ? "ON" : "REFUSED"} ` +
    `TIMINGS=${grade.chain.timings.length}`,
  );
});

test("the rest of the post-process family runs, and CNA's own arithmetic checks it", () => {
  const postProcess = evidence.result.postProcess;
  assert.ok(postProcess, "no post-process evidence was produced");
  assert.equal(
    postProcess.layerAbsent, false,
    `the artifact reports CNAEXT available and then refused an SsaoPass: ${postProcess.error}`,
  );
  // Required rather than recorded: this suite exists to make the claim, so every pass in the group
  // has to have answered `cna_post_process_pass_is_supported` with true on this context.
  assertPostProcessEvidence(postProcess, { expectSupported: true });
  console.log(
    `STRONG_WASM_POST_PROCESS=ssao,ssr,dof,lensflare,motionblur,ascii,aerial,heightfog,` +
    `lightshaft,volumetricfog,contactshadow,spatialupscale ` +
    `SUPPORTED=${Object.values(postProcess.passes).filter((p) => p.supported).length}/11 ` +
    `SSAO_KERNEL=${postProcess.scalars.ssaoKernel.length} ` +
    `CLAMPS=${Object.keys(postProcess.clamps).length} ` +
    `ASCII_GRIDS=${postProcess.ascii.colour.grid.join("x")},` +
    `${postProcess.ascii.collapsed.grid.join("x")},${postProcess.ascii.oblong.grid.join("x")}`,
  );
});

test("particles draw where the camera puts them, and CNA's own step says where they went", () => {
  const particles = evidence.result.particles;
  assert.ok(particles, "no particle evidence was produced");
  assert.equal(
    particles.layerAbsent, false,
    `the artifact reports CNAEXT available and then refused a ParticleSystem: ${particles.error}`,
  );
  // The same oracle, on the same scenario, that test/windowed-renderer.integration.mjs applies to
  // the OPENGLES3 build: two emitters, one camera move, one empty system, and upstream finding 12's
  // unchanged fade. This is the one engine family in this session whose pixels a browser gets --
  // it draws into a single bound target, so finding 30 takes nothing from it.
  assertParticleEvidence(particles);
  // And the half the windowed suite does not have: CNA's own simulation, integrated forward here
  // through its own pure step and compared with the closed form for the same motion.
  assertParticleSimulationOracle(particles.simulation);
  const [far, near] = particles.straightOn.blobs;
  console.log(
    `STRONG_WASM_PARTICLES=DRAWN NEAR=${near.count}px@${near.minX},${near.minY} ` +
    `FAR=${far.count}px@${far.minX},${far.minY} ` +
    `CAMERA_SHIFT=${particles.straightOn.blobs[0].minX - particles.shifted.blobs[0].minX}px ` +
    `CAPACITY=${particles.defaultCapacity} STEPS=${particles.simulation.trajectory.steps} ` +
    `SOFT_FADE=BLOCKED_UPSTREAM_FINDING_12`,
  );
});

test("the depth/normal prepass answers, and its renderer says what it can draw into", () => {
  const prepass = evidence.result.prepass;
  assert.ok(prepass, "no prepass evidence was produced");
  assert.equal(
    prepass.layerAbsent, false,
    `the artifact reports CNAEXT available and then refused a DepthNormalPrepass: ${prepass.error}`,
  );
  assert.equal(prepass.evidenceError ?? null, null, prepass.evidenceStack ?? "");

  // The arithmetic and the state, neither of which touches a pixel. Both come from the same
  // oracle the windowed suite applies, so the two backends are held to one expectation.
  assertPrepassMaths(prepass.maths);
  assertPrepassState(prepass.prepass, { width: prepass.width, height: prepass.height });
  assertDecalState(prepass.decalDefaults);

  // The stock rasteriser drew the rectangle, so the scene itself is sound and anything the prepass
  // failed to write is the prepass's -- or its renderer's.
  assert.ok(prepass.rasterised.count > 200, "the stock effect drew the rectangle");

  const canDrawIntoManyTargets = multipleRenderTargetsDraw(prepass.multipleTargetProbe);
  if (!canDrawIntoManyTargets) {
    // Upstream finding 30. The prepass reports `IsUsingMultipleRenderTargets` here and does all of
    // its work inside one such bind, so with a draw unable to reach two bound targets it writes
    // nothing -- and the decal projector, whose only depth input is that buffer, paints nothing.
    // Both are asserted rather than skipped, because "wrote nothing" is a claim that fails the
    // moment the renderer starts working and this is the test that has to notice.
    assert.equal(
      prepass.prepass.multipleRenderTargets, true,
      "the prepass takes the multiple-render-target path on this renderer",
    );
    assert.equal(
      prepass.firstDrawOccupancy, 0,
      "with a two-target bind unable to receive a draw, the prepass writes no surface at all",
    );
    assert.equal(prepass.secondDrawOccupancy, 0, "and a second run of it writes none either");
    assert.equal(
      prepass.overRect.count, 0,
      "so the decal projector, whose only depth input is that buffer, paints nothing",
    );
    assert.equal(prepass.noDepth.count, 0, "as it also does with no depth input at all");
    console.log(
      "STRONG_WASM_PREPASS=STATE_AND_ARITHMETIC_ONLY " +
      `RENDER=BLOCKED_UPSTREAM_FINDING_30 MRT_ONE=${prepass.multipleTargetProbe.oneTarget[0]} ` +
      `MRT_TWO=${prepass.multipleTargetProbe.twoTargets.join(",")} ` +
      `RASTERISED=${prepass.rasterised.count} SWEEP=${prepass.maths.sweep.length}`,
    );
    return;
  }
  // The renderer draws into many targets, so the pixels are required rather than excused.
  assert.ok(
    prepass.prepassOccupied.count > 0,
    "UPSTREAM FINDING 30 REPAIRED: a two-target bind now receives a draw, so the prepass must " +
    "put the rectangle where the renderer's own rasteriser put it. Extend this suite to the " +
    "geometric predictions the windowed suite already makes, and update the finding",
  );
  console.log(
    `STRONG_WASM_PREPASS=DRAWS OCCUPIED=${prepass.prepassOccupied.count} ` +
    `DECAL=${prepass.overRect.count}`,
  );
});

test("the engine layer casts a shadow map, and its depths are the light transform's", () => {
  const shadows = evidence.result.shadows;
  assert.ok(shadows, "no shadow evidence was produced");
  assert.equal(
    shadows.layerAbsent, false,
    `the artifact reports CNAEXT available and then refused a ShadowMap: ${shadows.error}`,
  );
  assert.equal(shadows.evidenceError ?? null, null, "the layer was present and the probe failed");
  // Not asserted as an assumption: a renderer is allowed to say it cannot cast, and this one is
  // asked. What is required of a *strong-artifact* run is that the answer be recorded and, where
  // it is yes, that the pass then be held to the prediction rather than merely run.
  assert.equal(typeof shadows.supported, "boolean");
  assert.equal(typeof shadows.sampling, "boolean");
  if (!shadows.supported) {
    console.log(`STRONG_WASM_SHADOWS=NOT_SUPPORTED_RENDERER SIZE=${shadows.size}`);
    return;
  }
  assertShadowPassEvidence(shadows);
  console.log(
    `STRONG_WASM_SHADOWS=CAST SIZE=${shadows.size} SAMPLING=${shadows.sampling} ` +
    `OCCLUDED=${shadows.high.occluded} HIGH=${shadows.high.low.toFixed(6)} ` +
    `LOW=${shadows.low.low.toFixed(6)}`,
  );
});

test("every public engine class constructs, reads and round-trips in a browser", () => {
  const census = evidence.result.engineCensus;
  assert.ok(census, "no engine census was produced");
  // Broad rather than deep, and deliberately: the oracles above prove particular families against
  // arithmetic, and this proves that every class in the layer marshals at all. A slice this size
  // fails in ways no scenario reaches, and this census found four such defects on its first run.
  const totals = assertEngineCensus(census);
  console.log(
    `STRONG_WASM_ENGINE_CENSUS=OK CLASSES=${totals.classes} ACCESSORS_READ=${totals.read} ` +
    `SETTERS=${totals.wrote} ROUND_TRIPPED=${totals.roundTripped} ` +
    `REFUSED_BY_CNA=${totals.refused}/compute-dependent`,
  );
});

test("every field of a material reaches CNA, and the nested structures survive whole", () => {
  const fields = evidence.result.structureFields;
  const nested = evidence.result.nestedStructures;
  assert.ok(fields, "no structure-field evidence was produced");
  assert.ok(nested, "no nested-structure evidence was produced");
  // The census proves accessors marshal; this proves the *contents* do. A field dropped inside a
  // structure round-trips perfectly through a getter that never reads it either, so the question
  // has to be put to CNA -- which compares two materials itself, and culls a box itself.
  const fieldTotals = assertStructureFields(fields);
  const nestedTotals = assertNestedStructures(nested);
  console.log(
    `STRONG_WASM_STRUCTURE_FIELDS=OK FIELDS_ASKED=${fieldTotals.fields} ` +
    `BOUNDS_CULLED=${nestedTotals.boundsTested} SLOT_READS=${nestedTotals.slotsTested} ` +
    `CASCADE_MATRICES=${nestedTotals.cascades}`,
  );
});

test("the sky, light probes and clustered lighting answer their own arithmetic", () => {
  const engine = evidence.result.engineArithmetic;
  assert.ok(engine, "no engine-arithmetic evidence was produced");
  assert.equal(
    engine.layerAbsent, false,
    `the artifact reports CNAEXT available and then refused an AtmosphericSky: ${engine.error}`,
  );
  assertEngineArithmeticEvidence(engine);
  console.log(
    `STRONG_WASM_SKY=SUPPORTED BAKER=SUPPORTED CLUSTER_COMPUTE=RENDERER_BLOCKED ` +
    `PROBE_COEFFICIENTS=9 BAKE_FACES=${engine.baker.capture.faces} ` +
    `CLUSTERS=${engine.grid.tiles[3]} SLICES=${engine.grid.tiles[2]} ` +
    `REFERENCES=${engine.assignment.totalReferences}`,
  );
});

test("the spot, cube and cascaded shadow maps agree with the transforms behind them", () => {
  const variants = evidence.result.shadowVariants;
  assert.ok(variants, "no shadow-variant evidence was produced");
  assert.equal(
    variants.layerAbsent, false,
    `the artifact reports CNAEXT available and then refused a CascadedShadowMap: ${variants.error}`,
  );
  assertShadowVariantEvidence(variants);
  console.log(
    `STRONG_WASM_SHADOW_VARIANTS=cascaded,spot,cube SUPPORTED=3/3 ` +
    `CASCADES=${variants.sizes.cascadeCount}@${variants.sizes.cascade} ` +
    `SPLITS=${variants.cascade.splitDistances.map((d) => d.toFixed(1)).join(",")} ` +
    `CUBE_FACES=6 SPOT=${variants.sizes.spot} CUBE=${variants.sizes.cube}`,
  );
});

test("level-of-detail selection is present and complete", () => {
  const lod = evidence.result.lod;
  assert.ok(lod, "no level-of-detail evidence was produced");
  assert.equal(lod.layerAbsent, false, `the artifact refused a LodGroup: ${lod.error}`);
  assert.equal(lod.evidenceError ?? null, null, "the layer was present and the probe failed");
  // The same oracle the ordinary suite applies. A strong run that asserted less than the ordinary
  // one would let a defect through on exactly the run that exists to make the claim -- and did:
  // a planted eight-byte stride for CNA_LodLevelEXT survived that gap before this was shared.
  assertLodEvidence(lod);
  console.log(`STRONG_WASM_LOD=COMPLETE LEVELS=${lod.count} MODES=distance,screen-space`);
});

test("the page raised nothing while doing it", () => {
  assert.deepEqual(evidence.result.errors, []);
  assert.deepEqual(evidence.consoleErrors, []);
});
