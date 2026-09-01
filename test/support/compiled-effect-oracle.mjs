// SPDX-License-Identifier: MS-PL

/**
 * The compiled-effect expectation, shared by the two browser suites that assert it.
 *
 * `test/wasm-browser.mjs` reaches it only when the artifact in front of it happens to carry
 * the compiled-effect runtime; `test/wasm-browser-strong.mjs` requires that artifact and fails
 * without it. One implementation of the expectation is what stops those two claiming different
 * things about the same pixels.
 */

import assert from "node:assert/strict";

/*
 * The two pixel shaders of `CnaConformanceEffect.fx`, transcribed from CNA's own source so the
 * expected pixel is computed from the *shader* and the values the page sets -- never from
 * `GetValue*`, which answers from managed state and would agree with its own setter whether or not
 * anything reached the GPU. These are the same three functions
 * `test/effect-reflection.integration.mjs` computes its windowed expectations from, so the two
 * backends are held to one expectation rather than to two that resemble each other.
 *
 *     float4 FlatPixelShader(VertexOut input) : COLOR0
 *     {
 *         return Tint * Weights[1];
 *     }
 *
 *     float4 MainPixelShader(VertexOut input) : COLOR0
 *     {
 *         float4 sampled = tex2D(FxSampler, input.TexCoord);
 *         float lighting = saturate(Lighting.Intensity + Lighting.Thresholds[0]);
 *         return sampled * Tint * Gain * lighting;
 *     }
 */

/** `Tint * Weights[1]`, on four channels. */
const flatShader = (tint, weights) => tint.map((component) => component * weights[1]);

/** `sampled * Tint * Gain * saturate(Lighting.Intensity + Lighting.Thresholds[0])`. */
const mainShader = (sampled, tint, gain, intensity, thresholds) => {
  const lighting = Math.min(Math.max(intensity + thresholds[0], 0), 1);
  return tint.map((component, index) => sampled[index] * component * gain * lighting);
};

/** A shader's float output as the byte an eight-bit render target stores. */
const asColor = (channels) =>
  channels.map((value) => Math.round(Math.min(Math.max(value, 0), 1) * 255));

/**
 * Eight-bit render targets quantise and two rasterizers round a half differently, so an
 * expectation computed in floats is compared to within one byte -- the same tolerance the windowed
 * suite uses, and for the same reason. Every pair of states below differs by far more than that,
 * which is what makes a wrong parameter, a wrong technique or a skipped `Apply` fail here rather
 * than round into agreement.
 */
function assertTexel(actual, expected, what) {
  assert.ok(Array.isArray(actual), `${what}: the probe produced no texel: ${actual}`);
  const names = ["R", "G", "B", "A"];
  for (let index = 0; index < 4; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= 1,
      `${what}: ${names[index]} is ${actual[index]}, expected ${expected[index]} ` +
      `(actual ${actual}, expected ${expected})`,
    );
  }
}

/**
 * The compiled-effect scenario, asserted whole.
 *
 * Split out because it is run twice: once by the ordinary browser suite, where it is reached only
 * when the artifact in front of it happens to carry the compiled-effect runtime, and once by the
 * required strong-artifact gate, where its absence is a failure. One implementation means the two
 * cannot claim different things.
 */
export function assertCompiledEffectEvidence(compiled) {
  // --- reflection ---------------------------------------------------------------------------
  assert.equal(compiled.parameters, 6, "CnaConformanceEffect.fxb declares six parameters");
  assert.equal(compiled.techniques, 2, "and two techniques");
  const byName = new Map(compiled.reflection.map((item) => [item.Name, item]));
  for (const name of ["Tint", "Weights", "Gain", "FxTexture", "Lighting", "Transform"]) {
    assert.ok(byName.has(name), `${name} is one of the reflected parameters`);
  }
  // The metadata is XNA's own numbering passed straight through, which is an assumption worth
  // failing on rather than discovering as mistyped parameters.
  assert.equal(byName.get("Tint").ParameterClass, 1, "Tint is a vector");
  assert.equal(byName.get("Tint").ColumnCount, 4, "of four columns");
  assert.equal(byName.get("Transform").ParameterClass, 2, "Transform is a matrix");
  assert.equal(byName.get("Transform").RowCount, 4);
  assert.equal(byName.get("Gain").ParameterClass, 0, "Gain is a scalar");
  assert.equal(byName.get("FxTexture").ParameterClass, 3, "FxTexture is an object");
  assert.equal(byName.get("Weights").Elements, 2, "Weights is a two-element array");
  assert.ok(
    byName.get("Lighting").StructureMembers >= 2,
    `Lighting is a struct with members: ${byName.get("Lighting").StructureMembers}`,
  );
  assert.deepEqual(
    compiled.techniqueNames.map((item) => item.Name), ["FirstTechnique", "SecondTechnique"],
    "the techniques reflect by their own names, in declaration order",
  );

  // --- native write-through -------------------------------------------------------------------
  assert.deepEqual(
    compiled.nativeTint.map((value) => Math.round(value * 1000) / 1000),
    [0.25, 0.5, 0.75, 0.375],
    "a Vector4 parameter arrives at CNA as four components in order",
  );
  assert.ok(
    Math.abs(compiled.nativeGain[0] - 12.5) < 1e-6,
    `a scalar arrives too: ${compiled.nativeGain[0]}`,
  );
  assert.deepEqual(
    compiled.nativeWeights.native.map((value) => Math.round(value * 1000) / 1000),
    compiled.nativeWeights.wanted,
    "every element of an array parameter arrives, in order",
  );

  // --- the pixels ------------------------------------------------------------------------------
  assert.equal(compiled.states.length, 3);
  for (const state of compiled.states) {
    assertTexel(
      state.actual, asColor(flatShader(state.tint, state.weights)),
      `SecondTechnique/P1 with state ${state.label}`,
    );
  }
  const [a, b, c] = compiled.states.map((state) => state.actual);
  assert.notDeepEqual(a, b, "changing only Tint changes the image");
  assert.notDeepEqual(b, c, "changing only Weights[1] changes the image");

  const { main, halvedGain } = compiled;
  assertTexel(
    main.actual,
    asColor(mainShader([1, 1, 1, 1], main.tint, main.gain, main.intensity, main.thresholds)),
    "FirstTechnique/P0 (MainPixelShader) -- Lighting.Intensity and Lighting.Thresholds[0] included",
  );
  assert.notDeepEqual(
    main.actual, asColor(flatShader(main.tint, compiled.states[2].weights)),
    "MainPixelShader and FlatPixelShader over identical parameters must not agree, or the " +
    "technique selection proves nothing",
  );
  assertTexel(
    halvedGain.actual,
    asColor(mainShader([1, 1, 1, 1], main.tint, halvedGain.gain, main.intensity, main.thresholds)),
    "FirstTechnique/P0 with Gain halved",
  );
  // Not vacuous: had either struct write-through been dropped, the shader would have used the
  // fixture's own Lighting and produced a different -- and much brighter -- image.
  assert.notDeepEqual(
    asColor(mainShader([1, 1, 1, 1], main.tint, main.gain, main.intensity, main.thresholds)),
    asColor(mainShader([1, 1, 1, 1], main.tint, main.gain, 0.5, [0])),
    "the fixture's own Lighting and this scenario's differ, so the assertion above can fail",
  );

  // Finding 22's second half, measured for the compiled route on WebGL2 rather than assumed.
  assert.equal(
    compiled.mrtAfterDraw, "SUCCESS",
    "a multiple-render-target bind straight after a compiled-effect draw",
  );
}
