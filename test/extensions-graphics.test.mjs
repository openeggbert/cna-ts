import assert from "node:assert/strict";
import test from "node:test";

import {
  AlphaMode,
  ComputeShader,
  GpuTimer,
  GraphicsCapability,
  GraphicsDeviceCapabilities,
  GraphicsImageAccess,
  GraphicsMemoryBarrier,
  StorageBuffer,
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

test("the compute path stays outside Microsoft.Xna.Framework too", async () => {
  const xna = await import("../dist/xna.js");
  for (const name of [
    "ComputeShader", "StorageBuffer", "GpuTimer", "GraphicsCapability",
    "GraphicsDeviceCapabilities", "GraphicsMemoryBarrier",
  ]) {
    assert.equal(name in xna, false, `${name} must not leak into the strict XNA surface`);
  }
  const graphics = xna.Microsoft.Xna.Framework.Graphics;
  for (const name of ["ComputeShader", "StorageBuffer", "GpuTimer", "GraphicsCapability"]) {
    assert.equal(name in graphics, false, `${name} must not appear in the XNA Graphics namespace`);
  }
});

test("the compute identities carry the canonical CNA numbers", () => {
  // These are the values tools/cna-abi/contract.json proves against the headers; restating the
  // ends of each family here is what makes a silent renumbering visible in this suite too.
  assert.equal(GraphicsCapability.ThreeD, 0);
  assert.equal(GraphicsCapability.ComputeShaders, 17);
  assert.equal(GraphicsCapability.IndirectDraw, 18);
  assert.equal(GraphicsImageAccess.ReadOnly, 0);
  assert.equal(GraphicsImageAccess.ReadWrite, 2);
  assert.equal(GraphicsMemoryBarrier.None, 0);
  assert.equal(GraphicsMemoryBarrier.ShaderStorage, 32);
  assert.equal(GraphicsMemoryBarrier.IndirectCommand, 256);
  // `All` is the OR of every named bit, so it must equal exactly that and nothing more.
  const named = Object.entries(GraphicsMemoryBarrier)
    .filter(([name, value]) => typeof value === "number" && name !== "None" && name !== "All")
    .reduce((accumulated, [, value]) => accumulated | value, 0);
  assert.equal(GraphicsMemoryBarrier.All, named, "All is the union of the named bits");
});

test("every compute entry point refuses truthfully with no backend", () => {
  for (const call of [
    () => GraphicsDeviceCapabilities.Supports({}, GraphicsCapability.ComputeShaders),
    () => GraphicsDeviceCapabilities.MaxComputeWorkGroupCount({}, 0),
    () => GraphicsDeviceCapabilities.MaxComputeWorkGroupSize({}, 0),
    () => GraphicsDeviceCapabilities.MaxComputeWorkGroupInvocations({}),
    () => StorageBuffer.Create({}, 16),
    () => StorageBuffer.CreateTyped({}, 4, 4),
    () => new ComputeShader({}, "#version 310 es\nvoid main() {}\n"),
    () => new GpuTimer({}),
  ]) {
    assert.throws(call, NativeUnavailableError, call.toString());
  }
});

test("the compute surface validates its arguments before reaching any backend", () => {
  // These refusals are this package's own, so they hold with no backend loaded at all: the
  // argument never has a chance to reach CNA and be reinterpreted there.
  for (const [call, expected] of [
    [() => GraphicsDeviceCapabilities.Supports(null, 0), TypeError],
    [() => GraphicsDeviceCapabilities.Supports({}, 19), RangeError],
    [() => GraphicsDeviceCapabilities.Supports({}, -1), RangeError],
    [() => GraphicsDeviceCapabilities.Supports({}, 1.5), RangeError],
    [() => GraphicsDeviceCapabilities.MaxComputeWorkGroupSize({}, 3), RangeError],
    [() => GraphicsDeviceCapabilities.MaxComputeWorkGroupCount({}, -1), RangeError],
    [() => StorageBuffer.Create(null, 16), TypeError],
    [() => StorageBuffer.Create({}, -1), RangeError],
    [() => StorageBuffer.Create({}, 1.5), RangeError],
    [() => StorageBuffer.CreateTyped({}, 4, 0), RangeError],
    [() => StorageBuffer.CreateTyped({}, -1, 4), RangeError],
    [() => new ComputeShader(null, "x"), TypeError],
    [() => new ComputeShader({}, ""), TypeError],
    [() => new GpuTimer(null), TypeError],
  ]) {
    assert.throws(call, expected, call.toString());
  }
  // A capability just past the last one is refused; the last one itself is not. Both matter: an
  // off-by-one in either direction changes which capability a caller can ask about.
  assert.throws(
    () => GraphicsDeviceCapabilities.Supports({}, GraphicsCapability.IndirectDraw + 1), RangeError,
  );
  assert.throws(
    () => GraphicsDeviceCapabilities.Supports({}, GraphicsCapability.IndirectDraw),
    NativeUnavailableError,
    "the last capability is in range and fails only for want of a backend",
  );
});
