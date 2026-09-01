// SPDX-License-Identifier: MS-PL
//
// `Effect.Parameters` for a compiled effect, on a renderer that can actually run one.
//
// This package used to build a natively reflected `Effect` with an **empty** parameter collection.
// It did not look like a gap: a stock effect's native parameter collection really is empty
// (`cna_basic_effect_create` then `cna_effect_get_parameters` answers count 0 -- measured on both
// the headless and the windowed builds), so there appeared to be nothing to reflect.
//
// The measurement that changed it: `CNA_GRAPHICS_CAPABILITY_COMPILED_EFFECTS` is **true** on the
// windowed OPENGLES3 build and false on HEADLESS, and on the windowed one a compiled `.fxb` loads
// and carries the real reflection -- twenty-three parameters for XNA's own `BasicEffect.fxb`. So a
// consumer loading a compiled effect got a shader it could draw with and not one uniform it could
// set. This file pins the repair.
//
// It needs the windowed library for that reason and skips without it, exactly as
// `windowed-renderer.integration.mjs` does.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { requiredSuite } from "./support/required-suite.mjs";

import {
  Color, Game, Graphics, GraphicsDeviceManager, LoadNodeNativeBackend, Matrix, Vector2, Vector3,
  Vector4,
} from "../dist/index.js";
import { readNativeParameterValueForInternalUse, readNativeParameterValuesForInternalUse }
  from "../dist/Microsoft/Xna/Framework/Graphics/Effect.js";

const library = process.env.CNA_WINDOWED_LIBRARY;
const display = process.env.DISPLAY;
// Optional for a developer with no windowed CNA to hand; `CNA_REQUIRE_EFFECT_TESTS=1` makes the
// missing environment a named failure and requires the suite to prove it executed.
const { test, skip } = requiredSuite({
  label: "compiled-effect",
  envVar: "CNA_REQUIRE_EFFECT_TESTS",
  counter: "EFFECT_REFLECTION_TESTS",
  blocked: library
    ? (display ? null : "no DISPLAY; run this under xvfb-run or on a session with a screen")
    : "set CNA_WINDOWED_LIBRARY to a CNA library built with a windowed renderer",
});

const cnaSource = path.resolve(process.env.CNA_SOURCE_PATH ?? "../../cnanext");
const effectPath = (name) =>
  path.join(cnaSource, "modules/renderers/fna3d/effects", name);

if (!skip) {
  await LoadNodeNativeBackend({
    CnaLibrary: path.resolve(library),
    BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
  });
}

/** A Matrix as the sixteen numbers CNA holds, in the order XNA names them. */
function matrixRow(matrix) {
  return [
    matrix.M11, matrix.M12, matrix.M13, matrix.M14,
    matrix.M21, matrix.M22, matrix.M23, matrix.M24,
    matrix.M31, matrix.M32, matrix.M33, matrix.M34,
    matrix.M41, matrix.M42, matrix.M43, matrix.M44,
  ];
}

/*
 * The two pixel shaders of `CnaConformanceEffect.fx`, transcribed from CNA's own source so the
 * expected pixel is computed from the *shader* and the values this file sets -- never from
 * `GetValue*`, which answers from managed state and would agree with its own setter whether or not
 * anything reached the GPU.
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
 * The values `CnaConformanceEffect.fx` *declares*, used only where the test draws without setting
 * anything -- the one case where the fixture rather than this file owns the expectation.
 *
 * `Lighting`'s declared `Thresholds = { 0.9f, 1.0f }` is deliberately not among them: the committed
 * `.fxb` behaves as though `Thresholds[0]` were zero, which is what CNA's own golden-pixel test
 * (`EasyGLCompiledEffectDrawTest.RendersTheAppliedPassesExpectedPixelsIntoARenderTarget`) also
 * expects. That is the effect compiler's output for a struct array member, baked into a binary
 * neither project builds here, so every `MainPixelShader` expectation below sets `Lighting` itself.
 */
const DECLARED_TINT = [0.1, 0.2, 0.3, 0.4];
const DECLARED_WEIGHTS = [0.2, 0.8];

/** A full-screen quad already in clip space: `Transform` is the identity, so the vertex shader
 * passes `Position` through unchanged and these must already be NDC. */
const QUAD = [
  [-1, 1, 0, 0], [-1, -1, 0, 1], [1, -1, 1, 1],
  [-1, 1, 0, 0], [1, -1, 1, 1], [1, 1, 1, 0],
].map(([x, y, u, v]) =>
  new Graphics.VertexPositionTexture(new Vector3(x, y, 0), new Vector2(u, v)));

/** A colour no expectation below is close to, so a lost draw reads as the clear and not as a pass. */
const RENDER_CLEAR = new Color(50, 50, 50, 255);

/** CNA's tagged value identities, repeated here so the test does not import the implementation. */
const VALUE_INT32 = 1;
const VALUE_SINGLE = 2;
const VALUE_MATRIX = 3;
const VALUE_VECTOR4 = 8;

const evidence = Object.create(null);

class EffectProbeGame extends Game {
  constructor() {
    super();
    this.graphics = new GraphicsDeviceManager(this);
    this.graphics.PreferredBackBufferWidth = 160;
    this.graphics.PreferredBackBufferHeight = 120;
  }

  LoadContent() {
    const device = this.GraphicsDevice;
    const record = (name, body) => {
      try { evidence[name] = body(); }
      catch (error) { evidence[name] = `${error?.constructor?.name}: ${error?.message}`; }
    };

    record("basic", () => {
      const bytes = fs.readFileSync(effectPath("BasicEffect.fxb"));
      const effect = new Graphics.Effect(device, [...bytes]);
      try {
        const names = [];
        for (let index = 0; index < effect.Parameters.Count; index += 1) {
          const parameter = effect.Parameters.Get(index);
          names.push({
            Name: parameter.Name,
            Semantic: parameter.Semantic,
            ParameterClass: parameter.ParameterClass,
            ParameterType: parameter.ParameterType,
            RowCount: parameter.RowCount,
            ColumnCount: parameter.ColumnCount,
            Elements: parameter.Elements.Count,
            StructureMembers: parameter.StructureMembers.Count,
            Annotations: parameter.Annotations.Count,
          });
        }

        // The write-through. `GetValue*` answers from managed state, so the proof that a value
        // reached the shader is CNA's own read-back, not this package's.
        const world = effect.Parameters.Get("World");
        const matrix = Matrix.CreateTranslation(new Vector3(1.5, -2.25, 3.75));
        world.SetValue(matrix);
        const nativeWorld = readNativeParameterValueForInternalUse(world, VALUE_MATRIX);

        // DiffuseColor is a float4 here, not a float3: FNA's BasicEffect packs alpha into .w and
        // ships no separate Alpha parameter. The reflection is what says so.
        const diffuse = effect.Parameters.Get("DiffuseColor");
        diffuse.SetValue(new Vector4(0.25, 0.5, 0.75, 0.375));
        const nativeDiffuse = readNativeParameterValueForInternalUse(diffuse, VALUE_VECTOR4);

        // SetValueTranspose stores the transpose and must send that, not the original: it used to
        // store without writing through at all, which is the same defect this file exists for.
        const worldViewProj = effect.Parameters.Get("WorldViewProj");
        const source = Matrix.CreateTranslation(new Vector3(5, 6, 7));
        worldViewProj.SetValueTranspose(source);
        const nativeTransposed = readNativeParameterValueForInternalUse(worldViewProj, VALUE_MATRIX);

        // The array overload. `VSIndices` is a 32-element int array in XNA's own BasicEffect, and
        // SetValue(number[]) has to reach the shader element for element rather than being stored
        // managed -- the failure that would look like a working call and draw the wrong thing.
        const indices = effect.Parameters.Get("VSIndices");
        const wanted = Array.from({ length: indices.Elements.Count }, (_, i) => (i * 3) % 17);
        indices.SetValue(wanted);
        const nativeIndices = readNativeParameterValuesForInternalUse(
          indices, VALUE_INT32, indices.Elements.Count);

        const power = effect.Parameters.Get("SpecularPower");
        power.SetValue(12.5);
        const nativePower = readNativeParameterValueForInternalUse(power, VALUE_SINGLE);

        return {
          Count: effect.Parameters.Count,
          Parameters: names,
          World: {
            managed: [
              matrix.M11, matrix.M12, matrix.M13, matrix.M14,
              matrix.M21, matrix.M22, matrix.M23, matrix.M24,
              matrix.M31, matrix.M32, matrix.M33, matrix.M34,
              matrix.M41, matrix.M42, matrix.M43, matrix.M44,
            ],
            native: nativeWorld,
          },
          Diffuse: nativeDiffuse,
          Power: nativePower,
          Indices: { native: nativeIndices, wanted },
          Transposed: {
            native: nativeTransposed,
            expected: matrixRow(Matrix.Transpose(source)),
            untransposed: matrixRow(source),
          },
        };
      } finally {
        effect.Dispose();
      }
    });

    record("conformance", () => {
      const bytes = fs.readFileSync(effectPath("CnaConformanceEffect.fxb"));
      const effect = new Graphics.Effect(device, [...bytes]);
      try {
        const names = [];
        for (let index = 0; index < effect.Parameters.Count; index += 1) {
          names.push(effect.Parameters.Get(index).Name);
        }
        return { Count: effect.Parameters.Count, Names: names };
      } finally {
        effect.Dispose();
      }
    });

    // The execution half. Reflection and write-through are proved above by asking CNA what it
    // holds; none of that says the value reaches the *shader*. This draws with the compiled
    // program and reads the texels back, which is the only evidence that closes the chain
    // reflection -> lookup -> native SetValue -> technique -> pass Apply -> draw -> pixels.
    record("render", () => {
      const bytes = fs.readFileSync(effectPath("CnaConformanceEffect.fxb"));
      const effect = new Graphics.Effect(device, [...bytes]);
      const target = new Graphics.RenderTarget2D(device, 8, 8);
      const white = new Graphics.Texture2D(device, 1, 1);
      // Neither P0 nor P1 sets a CullMode of its own -- only StatePass does -- so the winding is
      // decided by the device's own rasterizer state, exactly as it is for CNA's own draw test.
      device.RasterizerState = Graphics.RasterizerState.CullNone;

      /** Draws the quad through one technique/pass and returns the centre texel as four bytes. */
      const drawCentre = (techniqueIndex, passIndex) => {
        device.SetRenderTarget(target);
        try {
          device.Clear(RENDER_CLEAR);
          effect.CurrentTechnique = effect.Techniques.Get(techniqueIndex);
          effect.CurrentTechnique.Passes.Get(passIndex).Apply();
          device.DrawUserPrimitives(Graphics.PrimitiveType.TriangleList, QUAD, 0, 2);
        } finally {
          // Unbound even when the draw refuses, so a failure surfaces here and not later as a
          // frame that cannot be presented.
          device.SetRenderTarget(null);
        }
        const texels = new Array(64);
        target.GetData(texels);
        const centre = texels[8 * 4 + 4];
        return [centre.R, centre.G, centre.B, centre.A];
      };

      try {
        white.SetData([new Color(255, 255, 255, 255)]);

        // 1. The first draw of a freshly constructed effect, before anything is set. Finding 22
        //    says a `ShaderEffect`'s first `SpriteBatch` draw is lost; whether that extends to a
        //    compiled effect is a question this has to *measure*, so it draws once and no more.
        const firstDraw = drawCentre(1, 0);

        // 2. Three states through SecondTechnique/P1 (FlatPixelShader), which samples nothing:
        //    its output is arithmetic on two parameters and nothing else. A -> B moves only Tint,
        //    B -> C moves only Weights, so each says which parameter reached the shader.
        const tint = effect.Parameters.Get("Tint");
        const weights = effect.Parameters.Get("Weights");
        const states = [
          { label: "A", tint: [0.8, 0.6, 0.4, 1.0], weights: [0.125, 0.5] },
          { label: "B", tint: [0.2, 1.0, 0.8, 0.6], weights: [0.125, 0.5] },
          { label: "C", tint: [0.2, 1.0, 0.8, 0.6], weights: [0.125, 0.25] },
        ].map((state) => {
          tint.SetValue(new Vector4(...state.tint));
          weights.SetValue([...state.weights]);
          return { ...state, actual: drawCentre(1, 0) };
        });

        // 3. The same parameters, the other technique. FirstTechnique/P0 is MainPixelShader, which
        //    samples the texture and scales by Gain and the Lighting struct -- a different program
        //    over identical parameter state, so the answer says which technique actually ran.
        effect.Parameters.Get("FxTexture").SetValue(white);
        effect.Parameters.Get("Gain").SetValue(0.5);
        const lighting = effect.Parameters.Get("Lighting");
        const intensity = 0.25;
        const thresholds = [0.125, 0.0];
        lighting.StructureMembers.Get("Intensity").SetValue(intensity);
        lighting.StructureMembers.Get("Thresholds").SetValue([...thresholds]);
        const mainTint = [1.0, 0.75, 0.5, 1.0];
        tint.SetValue(new Vector4(...mainTint));
        const mainDraw = drawCentre(0, 0);

        // 4. Gain alone, halved. Nothing else moves, so the whole image has to halve with it.
        effect.Parameters.Get("Gain").SetValue(0.25);
        const halvedGain = drawCentre(0, 0);

        // 5. Finding 22's other half: a `ShaderEffect` draw leaves a GL error pending and the next
        //    multiple-render-target bind refuses on it. Whether a *compiled* effect does the same
        //    is again a measurement, not an assumption.
        const extra = [
          new Graphics.RenderTarget2D(device, 8, 8), new Graphics.RenderTarget2D(device, 8, 8),
        ];
        let mrtAfterDraw;
        try {
          device.SetRenderTargets(extra.map((item) => new Graphics.RenderTargetBinding(item)));
          device.SetRenderTarget(null);
          mrtAfterDraw = "SUCCESS";
        } catch (error) {
          mrtAfterDraw = `${error?.constructor?.name}: ${error?.message}`;
        } finally {
          for (const item of extra) item.Dispose();
        }

        return {
          firstDraw,
          states,
          main: { actual: mainDraw, tint: mainTint, gain: 0.5, intensity, thresholds },
          halvedGain: { actual: halvedGain, gain: 0.25 },
          mrtAfterDraw,
        };
      } finally {
        // The effect retains the texture it was given for `FxTexture`, so it is released first:
        // disposing the texture while the effect still holds it is refused by name.
        effect.Dispose();
        white.Dispose();
        target.Dispose();
      }
    });

    // A stock effect is the control: its collection is empty, and this package's own stock state
    // stays authoritative. If this ever stops being empty, the managed/native split needs revisiting.
    record("stock", () => {
      const effect = new Graphics.BasicEffect(device);
      try { return { Count: effect.Parameters.Count }; }
      finally { effect.Dispose(); }
    });

    this.Exit();
  }
}

if (!skip) {
  const game = new EffectProbeGame();
  await game.Run();
  game.Dispose();
}

test("a compiled effect reflects its parameters", { skip }, () => {
  const basic = evidence.basic;
  assert.equal(typeof basic, "object", `the probe failed: ${basic}`);
  assert.ok(
    basic.Count >= 20,
    `XNA's own BasicEffect.fxb carries a full parameter set, not a handful: ${basic.Count}`,
  );
  const byName = new Map(basic.Parameters.map((item) => [item.Name, item]));
  for (const name of ["World", "DiffuseColor", "Texture", "WorldViewProj"]) {
    assert.ok(byName.has(name), `${name} is one of the reflected parameters`);
  }
  assert.ok(
    basic.Parameters.every((item) => typeof item.Name === "string" && item.Name.length > 0),
    "every reflected parameter has a name",
  );
});

test("the reflected metadata is XNA's, not a renumbering of it", { skip }, () => {
  // CNA's CNA_EFFECT_PARAMETER_CLASS_* and _TYPE_* happen to use XNA's own numbering, and this
  // package passes them straight through. That is an assumption worth failing on rather than
  // discovering as mistyped parameters, so it is asserted against a parameter whose shape is known.
  const world = evidence.basic.Parameters.find((item) => item.Name === "World");
  assert.equal(world.ParameterClass, Graphics.EffectParameterClass.Matrix, "World is a matrix");
  assert.equal(world.ParameterType, Graphics.EffectParameterType.Single, "of singles");
  assert.equal(world.RowCount, 4);
  assert.equal(world.ColumnCount, 4);

  const power = evidence.basic.Parameters.find((item) => item.Name === "SpecularPower");
  assert.equal(power.ParameterClass, Graphics.EffectParameterClass.Scalar);
  assert.equal(power.ParameterType, Graphics.EffectParameterType.Single);
  assert.equal(power.RowCount, 1);
  assert.equal(power.ColumnCount, 1);

  // A sampler reflects as an object of a texture type, which is the case a scalar-only projection
  // would have got wrong.
  const texture = evidence.basic.Parameters.find((item) => item.Name === "Texture");
  assert.equal(texture.ParameterClass, Graphics.EffectParameterClass.Object);
  assert.equal(texture.ParameterType, Graphics.EffectParameterType.Texture2D);

  // And an array parameter reflects its elements, which is what makes SetValue(T[]) meaningful.
  const indices = evidence.basic.Parameters.find((item) => item.Name === "VSIndices");
  assert.equal(indices.Elements, 32, "VSIndices is a 32-element array in XNA's own BasicEffect");
  assert.equal(indices.ParameterType, Graphics.EffectParameterType.Int32);
});

test("SetValue reaches CNA, not just managed state", { skip }, () => {
  const world = evidence.basic.World;
  assert.ok(Array.isArray(world.native), `CNA answered a value for World: ${world.native}`);
  assert.equal(world.native.length, 16);
  for (let index = 0; index < 16; index += 1) {
    assert.ok(
      Math.abs(world.native[index] - world.managed[index]) < 1e-5,
      `component ${index} arrived: ${world.native[index]} vs ${world.managed[index]}`,
    );
  }
  assert.deepEqual(
    evidence.basic.Diffuse.map((value) => Math.round(value * 1000) / 1000),
    [0.25, 0.5, 0.75, 0.375],
    "a Vector4 parameter arrives as four components in order",
  );
  assert.ok(
    Math.abs(evidence.basic.Power[0] - 12.5) < 1e-6,
    `a scalar arrives too: ${evidence.basic.Power[0]}`,
  );

  const indices = evidence.basic.Indices;
  assert.ok(Array.isArray(indices.native), `CNA answered an array: ${indices.native}`);
  assert.deepEqual(
    indices.native, indices.wanted,
    "every element of an array parameter arrives, in order -- 32 of them, not just the first",
  );
  assert.equal(new Set(indices.wanted).size > 1, true, "and the values differ, so order is testable");

  const transposed = evidence.basic.Transposed;
  for (let index = 0; index < 16; index += 1) {
    assert.ok(
      Math.abs(transposed.native[index] - transposed.expected[index]) < 1e-5,
      `SetValueTranspose sends the transpose: component ${index} is ` +
      `${transposed.native[index]}, expected ${transposed.expected[index]}`,
    );
  }
  assert.notDeepEqual(
    transposed.expected, transposed.untransposed,
    "and the fixture matrix is not symmetric, so sending the untransposed one would fail above",
  );
});

test("a second compiled effect reflects its own parameters, not the first one's", { skip }, () => {
  const conformance = evidence.conformance;
  assert.equal(typeof conformance, "object", `the probe failed: ${conformance}`);
  assert.ok(conformance.Count > 0, `the conformance effect has parameters: ${conformance.Count}`);
  assert.notEqual(
    conformance.Count, evidence.basic.Count,
    "two different effects reflect two different parameter sets -- if these matched, the " +
    "reflection could be coming from somewhere other than the effect that was loaded",
  );
});

test("a stock effect stays managed-authoritative", { skip }, () => {
  assert.deepEqual(
    evidence.stock, { Count: 0 },
    "CNA's stock effects carry no native parameter collection, so this package's own stock state " +
    "remains the only authority for BasicEffect and its siblings",
  );
});

// ---------------------------------------------------------------------------------------------
// Execution. Everything above proves the parameter reached CNA; these prove it reached the shader.
// ---------------------------------------------------------------------------------------------

/**
 * Eight-bit render targets quantise, so an expectation computed in floats is compared to within one
 * byte. Every pair of states below differs by far more than that, which is what makes a wrong
 * parameter, a wrong technique or a skipped `Apply` fail here rather than round into agreement.
 */
function assertTexel(actual, expected, what) {
  assert.ok(Array.isArray(actual), `${what}: the probe failed: ${actual}`);
  const names = ["R", "G", "B", "A"];
  for (let index = 0; index < 4; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= 1,
      `${what}: ${names[index]} is ${actual[index]}, expected ${expected[index]} ` +
      `(actual ${actual}, expected ${expected})`,
    );
  }
}

test("a compiled effect's pass draws, and does not lose its first draw", { skip }, () => {
  const render = evidence.render;
  assert.equal(typeof render, "object", `the probe failed: ${render}`);

  // The fixture's own declared values, since this draw sets nothing. CNA's own golden-pixel test
  // expects the same four bytes through its internal renderer API, which is a second implementation
  // of this expectation reached by a different route.
  const expected = asColor(flatShader(DECLARED_TINT, DECLARED_WEIGHTS));
  assert.deepEqual(expected, [20, 41, 61, 82], "0.1,0.2,0.3,0.4 times 0.8, quantised");
  assertTexel(render.firstDraw, expected, "a fresh compiled effect's first draw");

  // Said explicitly because the opposite is true one API over: finding 22 records that a
  // `ShaderEffect`'s first `SpriteBatch` draw produces nothing at all and needs a priming `Apply`.
  // This draw is the first one this effect ever performed and it is already correct, so that
  // defect does not reach the compiled-effect route and nothing here primes anything. If a
  // compiled effect ever starts losing its first draw too, this is the test that says so.
  assert.notDeepEqual(
    render.firstDraw, [RENDER_CLEAR.R, RENDER_CLEAR.G, RENDER_CLEAR.B, RENDER_CLEAR.A],
    "the first draw is not the clear colour, so a pass really ran",
  );
});

test("moving a reflected parameter moves the pixels it feeds", { skip }, () => {
  const { states } = evidence.render;
  assert.equal(states.length, 3);
  for (const state of states) {
    assertTexel(
      state.actual, asColor(flatShader(state.tint, state.weights)),
      `SecondTechnique/P1 with state ${state.label}`,
    );
  }

  // A and B differ only in Tint; B and C only in Weights. Asserting the images differ is what
  // makes the three expectations above evidence rather than three agreeing constants: a binding
  // that ignored SetValue entirely would draw the fixture's declared colour all three times.
  const [a, b, c] = states.map((state) => state.actual);
  assert.notDeepEqual(a, b, "changing only Tint changes the image");
  assert.notDeepEqual(b, c, "changing only Weights[1] changes the image");
});

test("the selected technique decides which program runs", { skip }, () => {
  const { main, halvedGain, states } = evidence.render;

  // FirstTechnique/P0 samples a white texel and scales by Gain and the Lighting struct.
  const expected = asColor(
    mainShader([1, 1, 1, 1], main.tint, main.gain, main.intensity, main.thresholds));
  assertTexel(main.actual, expected, "FirstTechnique/P0 (MainPixelShader)");

  // The same parameter state through the other technique is a different program and a different
  // answer -- so `CurrentTechnique` selected the pass that drew, rather than the draw always
  // running whichever program was compiled first.
  const flat = asColor(flatShader(main.tint, states[2].weights));
  assert.notDeepEqual(
    main.actual, flat,
    "MainPixelShader and FlatPixelShader over identical parameters must not agree, or the " +
    "technique selection above proves nothing",
  );

  // Gain is a scalar the second technique's program does not read at all, so halving it has to
  // halve this image and would have left the previous one alone.
  assertTexel(
    halvedGain.actual,
    asColor(mainShader([1, 1, 1, 1], main.tint, halvedGain.gain, main.intensity, main.thresholds)),
    "FirstTechnique/P0 with Gain halved",
  );
});

test("a struct member and a struct array element reach the shader", { skip }, () => {
  const { main } = evidence.render;

  // `Lighting.Intensity` and `Lighting.Thresholds[0]` are only ever read through `saturate()` in
  // MainPixelShader, so the image above already depends on both. This states the consequence the
  // way a defect would break it: had either write-through been dropped, the shader would have used
  // the fixture's own values and produced a different, and here much brighter, image.
  const withDroppedMembers = asColor(mainShader([1, 1, 1, 1], main.tint, main.gain, 0.5, [0]));
  assert.notDeepEqual(
    asColor(mainShader([1, 1, 1, 1], main.tint, main.gain, main.intensity, main.thresholds)),
    withDroppedMembers,
    "the fixture's own Lighting and this test's differ, so the assertion above is not vacuous",
  );
  assertTexel(
    main.actual,
    asColor(mainShader([1, 1, 1, 1], main.tint, main.gain, main.intensity, main.thresholds)),
    "Lighting.Intensity and Lighting.Thresholds[0] both reached MainPixelShader",
  );
});

test("a compiled-effect draw leaves no pending GL error behind it", { skip }, () => {
  // Finding 22's second half: after a `ShaderEffect` draw, the next multiple-render-target bind
  // fails with a GL error some earlier call left pending. Measured here for the compiled route,
  // which is a different code path and, on this renderer, does not do it. This is a detector: if
  // the compiled route ever acquires the same defect, it fails here with the message.
  assert.equal(
    evidence.render.mrtAfterDraw, "SUCCESS",
    "a multiple-render-target bind straight after a compiled-effect draw",
  );
});
