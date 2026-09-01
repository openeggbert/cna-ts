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
import test from "node:test";

import { Game, Graphics, GraphicsDeviceManager, LoadNodeNativeBackend, Matrix, Vector3, Vector4 }
  from "../dist/index.js";
import { readNativeParameterValueForInternalUse, readNativeParameterValuesForInternalUse }
  from "../dist/Microsoft/Xna/Framework/Graphics/Effect.js";

const library = process.env.CNA_WINDOWED_LIBRARY;
const display = process.env.DISPLAY;
const skip = library
  ? (display ? false : "no DISPLAY; run this under xvfb-run or on a session with a screen")
  : "set CNA_WINDOWED_LIBRARY to a CNA library built with a windowed renderer";

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

test("the reflected metadata is XNA's, not a renumbering of it", () => {
  // CNA's CNA_EFFECT_PARAMETER_CLASS_* and _TYPE_* happen to use XNA's own numbering, and this
  // package passes them straight through. That is an assumption worth failing on rather than
  // discovering as mistyped parameters, so it is asserted against a parameter whose shape is known.
  if (skip) return;
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
