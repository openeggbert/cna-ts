import assert from "node:assert/strict";
import test from "node:test";

import {
  AlphaMode,
  ClusterGrid,
  ClusterGridMaximumSliceCount,
  ClusterGridMaximumTilesPerAxis,
  ClusteredLightAssignment,
  ClusteredLightSet,
  ClusteredLightSetMaximum,
  ClusteredLightType,
  ClusteredShadowPolicy,
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
import { Matrix, NativeUnavailableError, Vector3 } from "../dist/index.js";

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

test("clustered lighting stays outside Microsoft.Xna.Framework", async () => {
  const xna = await import("../dist/xna.js");
  for (const name of [
    "ClusteredLightSet", "ClusterGrid", "ClusteredLightAssignment", "ClusteredShadowPolicy",
    "ClusteredLightType",
  ]) {
    assert.equal(name in xna, false, `${name} must not leak into the strict XNA surface`);
  }
  assert.equal("ClusterGrid" in xna.Microsoft.Xna.Framework.Graphics, false);
});

test("the clustered lighting identities carry the canonical CNA numbers", () => {
  assert.equal(ClusteredLightType.Point, 0);
  assert.equal(ClusteredLightType.Spot, 1);
  // The three bounds CNA refuses past. They are values rather than behaviour, so they are stated
  // once here and proved against the headers by tools/cna-abi/contract.json.
  assert.equal(ClusteredLightSetMaximum, 256);
  assert.equal(ClusterGridMaximumTilesPerAxis, 128);
  assert.equal(ClusterGridMaximumSliceCount, 256);
});

test("every clustered lighting entry point refuses truthfully with no backend", () => {
  for (const call of [
    () => new ClusteredLightSet({}),
    () => ClusteredLightSet.IsUsable({
      Type: ClusteredLightType.Point, Position: Vector3.Zero, Direction: Vector3.Zero,
      Color: Vector3.One, Intensity: 1, Range: 1, InnerAngle: 0, OuterAngle: 0,
      CastsShadows: false,
    }),
    () => new ClusterGrid({}, 4, 2, 8),
    () => new ClusteredLightAssignment({}),
    () => new ClusteredShadowPolicy({}, 1),
  ]) {
    assert.throws(call, NativeUnavailableError, call.toString());
  }
});

test("clustered lighting validates its arguments before reaching any backend", () => {
  for (const [call, expected] of [
    [() => new ClusterGrid(null, 4, 2, 8), TypeError],
    [() => new ClusterGrid({}, 0, 2, 8), RangeError],
    [() => new ClusterGrid({}, ClusterGridMaximumTilesPerAxis + 1, 2, 8), RangeError],
    [() => new ClusterGrid({}, 4, ClusterGridMaximumTilesPerAxis + 1, 8), RangeError],
    [() => new ClusterGrid({}, 4, 2, 0), RangeError],
    [() => new ClusterGrid({}, 4, 2, ClusterGridMaximumSliceCount + 1), RangeError],
    [() => new ClusterGrid({}, 4.5, 2, 8), RangeError],
    [() => new ClusteredShadowPolicy(null, 1), TypeError],
    [() => new ClusteredShadowPolicy({}, -1), RangeError],
    [() => new ClusteredShadowPolicy({}, 1.5), RangeError],
    [() => new ClusteredLightSet(null), TypeError],
    [() => new ClusteredLightAssignment(null), TypeError],
    [() => ClusteredLightSet.IsUsable(null), TypeError],
    [() => ClusteredLightSet.IsUsable({ Type: 7 }), RangeError],
    [() => ClusteredLightSet.IsUsable({
      Type: ClusteredLightType.Point, Position: Vector3.Zero, Direction: Vector3.Zero,
      Color: Vector3.One, Intensity: Number.NaN, Range: 1, InnerAngle: 0, OuterAngle: 0,
      CastsShadows: false,
    }), TypeError],
    [() => ClusteredLightSet.IsUsable({
      Type: ClusteredLightType.Point, Position: null, Direction: Vector3.Zero,
      Color: Vector3.One, Intensity: 1, Range: 1, InnerAngle: 0, OuterAngle: 0,
      CastsShadows: false,
    }), TypeError],
  ]) {
    assert.throws(call, expected, call.toString());
  }
  // The largest legal grid is in range and fails only for want of a backend, so the bound is a
  // bound rather than an off-by-one.
  assert.throws(
    () => new ClusterGrid(
      {}, ClusterGridMaximumTilesPerAxis, ClusterGridMaximumTilesPerAxis,
      ClusterGridMaximumSliceCount,
    ),
    NativeUnavailableError,
  );
});

test("an assignment refuses a grid that is not one, and a policy a set that is not one", () => {
  // These two calls take an object rather than a handle, so they must check what they were given
  // before it reaches the boundary. With no backend loaded the refusal for the *right* kind of
  // object is NativeUnavailableError, and for the wrong kind it is a TypeError -- which is what
  // separates "you passed the wrong thing" from "there is nothing to pass it to".
  const assignment = Object.create(ClusteredLightAssignment.prototype);
  assert.throws(
    () => ClusteredLightAssignment.prototype.Assign.call(assignment, {}, Matrix.Identity, []),
    TypeError,
  );
  const policy = Object.create(ClusteredShadowPolicy.prototype);
  assert.throws(
    () => ClusteredShadowPolicy.prototype.Select.call(
      policy, {}, Matrix.Identity, Matrix.Identity, Vector3.Zero,
    ),
    TypeError,
  );
});
