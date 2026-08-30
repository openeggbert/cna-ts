import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { LoadNodeNativeBackend } from "../dist/index.js";
import {
  CnaDesktopOperatingSystem,
  CnaLog,
  CnaLogCategory,
  CnaLogLevel,
  CnaPlatform,
  GetPlatformInfo,
  GraphicsBackendCategory,
  GraphicsBackendMaturity,
  GraphicsRendererType,
  IsGraphicsExtensionLayerAvailable,
  RendererSelection,
} from "../dist/extensions/runtime/index.js";

const library = process.env.CNA_NATIVE_LIBRARY;
if (!library) throw new Error("CNA_NATIVE_LIBRARY must name an existing CNA shared library");
await LoadNodeNativeBackend({
  CnaLibrary: path.resolve(library),
  BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
});

test("CNA reports the host it is running on", () => {
  const platform = GetPlatformInfo();
  assert.ok(Object.values(CnaPlatform).includes(platform.Platform));
  assert.ok(platform.Name.length > 0);
  assert.equal(typeof platform.IsApple, "boolean");
  assert.equal(typeof platform.IsMobile, "boolean");
  if (platform.Platform === CnaPlatform.Desktop) {
    assert.equal(platform.IsMobile, false);
    assert.ok(Object.values(CnaDesktopOperatingSystem).includes(platform.DesktopOperatingSystem));
  } else {
    assert.equal(platform.DesktopOperatingSystem, null);
  }
  assert.equal(Object.isFrozen(platform), true);
});

test("the renderer selection distinguishes asked-for from actually running", () => {
  const state = RendererSelection.GetState();
  assert.ok(Object.values(GraphicsRendererType).includes(state.Selected));
  assert.equal(typeof state.IsLatched, "boolean");
  assert.equal(typeof state.AutomaticFallback, "boolean");
  // Before a device exists CNA refuses to name an active renderer rather than guessing, and that
  // refusal reaches the caller as null instead of as an exception.
  if (state.Active === null) assert.equal(state.IsLatched, false);
  if (state.Current === null) assert.equal(state.CurrentName, null);
  else assert.ok(String(state.CurrentName).length > 0);
});

test("every available renderer carries CNA's own category and maturity", () => {
  const available = RendererSelection.GetAvailable();
  assert.ok(available.length >= 1, "a build with no runnable renderer cannot draw at all");
  for (const renderer of available) {
    assert.equal(renderer.IsAvailable, true);
    assert.ok(Object.values(GraphicsBackendCategory).includes(renderer.Category));
    assert.ok(Object.values(GraphicsBackendMaturity).includes(renderer.Maturity));
    assert.ok(renderer.CategoryName.length > 0);
    assert.ok(renderer.MaturityName.length > 0);
    assert.equal(renderer.Name, GraphicsRendererType[renderer.Type]);
    assert.equal(RendererSelection.IsAvailable(renderer.Type), true);
    assert.equal(Object.isFrozen(renderer), true);
  }
});

test("a renderer this build cannot run is still describable", () => {
  // The identity, its category and its maturity are properties of the renderer, not of the build,
  // so CNA answers for one that was compiled out. Only IsAvailable depends on the build.
  const described = RendererSelection.Describe(GraphicsRendererType.Vulkan);
  assert.equal(described.Type, GraphicsRendererType.Vulkan);
  assert.equal(described.Name, "Vulkan");
  assert.equal(described.Category, GraphicsBackendCategory.Native);
  assert.ok(described.CategoryName.length > 0);
  assert.ok(described.MaturityName.length > 0);
});

test("renderer names resolve the way CNA resolves them", () => {
  assert.equal(RendererSelection.TryParseName("headless"), GraphicsRendererType.Headless);
  assert.equal(RendererSelection.TryParseName("HEADLESS"), GraphicsRendererType.Headless);
  assert.equal(RendererSelection.TryParseName("not-a-renderer"), null);
});

test("the fallback record is a list, empty when nothing was rejected", () => {
  const fallbacks = RendererSelection.GetFallbacks();
  assert.ok(Array.isArray(fallbacks));
  for (const fallback of fallbacks) {
    assert.ok(Object.values(GraphicsRendererType).includes(fallback.Type));
    assert.ok(fallback.ReasonName.length > 0);
    assert.equal(Object.isFrozen(fallback), true);
  }
});

test("the runtime log round-trips its minimum level and accepts a record", () => {
  const original = CnaLog.GetMinimumLevel();
  try {
    CnaLog.SetMinimumLevel(CnaLogLevel.Fatal);
    assert.equal(CnaLog.GetMinimumLevel(), CnaLogLevel.Fatal);
    // Below the minimum: accepted and discarded, which is the contract, not an error.
    CnaLog.Info("cna-ts runtime services suppressed record", CnaLogCategory.Test);
    CnaLog.Write(CnaLogLevel.Debug, CnaLogCategory.Test, "cna-ts runtime services debug record");
    CnaLog.SetMinimumLevel(CnaLogLevel.Info);
    assert.equal(CnaLog.GetMinimumLevel(), CnaLogLevel.Info);
  } finally {
    CnaLog.SetMinimumLevel(original);
  }
  assert.equal(CnaLog.GetMinimumLevel(), original);
});

test("the extended graphics layer reports its real presence", () => {
  // Structural presence is not availability: the routes exist in every build and answer
  // NOT_SUPPORTED where the layer was compiled out. This asks the runtime, not the header.
  assert.equal(typeof IsGraphicsExtensionLayerAvailable(), "boolean");
});

test("an unnamed renderer identity is refused rather than accepted", () => {
  assert.throws(
    () => RendererSelection.Describe(9999),
    (error) => error.cnaResult === 1,
  );
});

test("the extended graphics layer answers with CNA's own defaults", async () => {
  const graphics = await import("../dist/extensions/graphics/index.js");
  // Pure value operations: CNA documents these as answering in either build, so they are what a
  // game can rely on before it knows whether the layer is compiled in.
  const material = graphics.CreatePbrMaterial();
  assert.ok(material.RoughnessFactor >= 0 && material.RoughnessFactor <= 1);
  assert.ok(material.AlphaCutoff >= 0 && material.AlphaCutoff <= 1);
  assert.equal(typeof material.AlphaBlendEnabled, "boolean");
  assert.equal(material.AlbedoColor.A, 255, "the default albedo must be opaque");

  const settings = graphics.CreateRenderPipelineSettings();
  assert.ok(settings.Exposure > 0);
  assert.ok(settings.Gamma > 1);
  assert.ok(Object.values(graphics.TonemappingMode).includes(settings.TonemappingMode));
  assert.ok(Object.values(graphics.RenderQuality).includes(settings.RenderQuality));
  assert.ok(Object.values(graphics.ShadowQuality).includes(settings.ShadowQuality));

  // Two calls must not share state: these are values, not a view onto one runtime object.
  const second = graphics.CreateRenderPipelineSettings();
  second.Exposure = settings.Exposure + 1;
  assert.notEqual(settings.Exposure, second.Exposure);
});
