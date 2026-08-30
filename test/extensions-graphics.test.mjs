import assert from "node:assert/strict";
import test from "node:test";

import {
  AlphaMode,
  CreatePbrMaterial,
  CreateRenderPipelineSettings,
  IsGraphicsExtensionLayerAvailable,
  RenderPipeline,
  RenderQuality,
  ShadowQuality,
  TonemappingMode,
} from "../dist/extensions/graphics/index.js";
import { NativeUnavailableError } from "../dist/index.js";

test("the extended graphics layer lives outside Microsoft.Xna.Framework", async () => {
  const xna = await import("../dist/xna.js");
  for (const name of ["RenderPipeline", "CreatePbrMaterial", "TonemappingMode"]) {
    assert.equal(name in xna, false, `${name} must not leak into the strict XNA surface`);
  }
  assert.equal("RenderPipeline" in xna.Microsoft.Xna.Framework.Graphics, false);
});

test("the extended graphics identities carry the canonical CNA numbers", () => {
  assert.equal(TonemappingMode.None, 0);
  assert.equal(TonemappingMode.Aces, 3);
  assert.equal(TonemappingMode.Uncharted2, 4);
  assert.equal(RenderQuality.Ultra, 3);
  assert.equal(ShadowQuality.Disabled, 0);
  assert.equal(ShadowQuality.Ultra, 4);
  assert.equal(AlphaMode.Opaque, 0);
  assert.equal(AlphaMode.Blend, 2);
});

test("every extended graphics entry point refuses truthfully with no backend", () => {
  for (const call of [
    () => CreatePbrMaterial(),
    () => CreateRenderPipelineSettings(),
    () => IsGraphicsExtensionLayerAvailable(),
    () => new RenderPipeline({}),
  ]) {
    assert.throws(call, NativeUnavailableError, call.toString());
  }
});

test("a render pipeline refuses a missing graphics device before it reaches CNA", () => {
  assert.throws(() => new RenderPipeline(null), TypeError);
});
