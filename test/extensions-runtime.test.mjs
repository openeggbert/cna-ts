import assert from "node:assert/strict";
import test from "node:test";

import {
  CnaDesktopOperatingSystem,
  CnaLog,
  CnaLogCategory,
  CnaLogLevel,
  CnaPlatform,
  GetPlatformInfo,
  GraphicsBackendCategory,
  GraphicsBackendMaturity,
  GraphicsRendererFallbackReason,
  GraphicsRendererType,
  IsGraphicsExtensionLayerAvailable,
  RendererSelection,
} from "../dist/extensions/runtime/index.js";
import { NativeUnavailableError } from "../dist/index.js";

test("modern CNA runtime services live outside Microsoft.Xna.Framework", async () => {
  const xna = await import("../dist/xna.js");
  for (const name of ["RendererSelection", "CnaLog", "GetPlatformInfo", "GraphicsRendererType"]) {
    assert.equal(name in xna, false, `${name} must not leak into the strict XNA surface`);
  }
  const framework = xna.Microsoft.Xna.Framework;
  assert.equal("RendererSelection" in framework, false);
  assert.equal("CnaLog" in framework, false);
});

test("every runtime service refuses truthfully with no backend loaded", () => {
  const calls = [
    () => GetPlatformInfo(),
    () => RendererSelection.GetState(),
    () => RendererSelection.GetAvailable(),
    () => RendererSelection.Describe(GraphicsRendererType.Vulkan),
    () => RendererSelection.IsAvailable(GraphicsRendererType.Vulkan),
    () => RendererSelection.SetPreferred(GraphicsRendererType.Headless),
    () => RendererSelection.SetPreferred("headless"),
    () => RendererSelection.TryParseName("headless"),
    () => RendererSelection.SetFallbackChain([GraphicsRendererType.Headless]),
    () => RendererSelection.SetAutomaticFallback(true),
    () => RendererSelection.GetFallbacks(),
    () => CnaLog.GetMinimumLevel(),
    () => CnaLog.SetMinimumLevel(CnaLogLevel.Info),
    () => CnaLog.Write(CnaLogLevel.Info, CnaLogCategory.Application, "x"),
    () => CnaLog.Info("x"),
    () => IsGraphicsExtensionLayerAvailable(),
  ];
  for (const call of calls) {
    assert.throws(call, NativeUnavailableError, call.toString());
  }
});

test("the identity enumerations carry the canonical CNA numbers", () => {
  // tools/cna-abi/verify-contract.mjs proves every one of these against the canonical headers;
  // these are the few a reader is most likely to write down, kept here so a careless edit is
  // caught without a CNA checkout.
  assert.equal(CnaPlatform.Desktop, 0);
  assert.equal(CnaPlatform.Web, 3);
  assert.equal(CnaDesktopOperatingSystem.Linux, 1);
  assert.equal(GraphicsBackendCategory.TranslationLayer, 1);
  assert.equal(GraphicsBackendMaturity.Experimental, 2);
  assert.equal(GraphicsRendererFallbackReason.InitializationFailed, 2);
  assert.equal(CnaLogLevel.Experiment, 100);
  assert.equal(CnaLogCategory.Gpu, 8);
  assert.equal(GraphicsRendererType.Headless, 11);
  assert.equal(GraphicsRendererType.WebGL2, 6);
  assert.equal(GraphicsRendererType.Vulkan, 8);
});

test("the renderer identity enumeration has the gaps ABI 0.20 left behind", () => {
  // Eleven identities were removed in 0.20 and their numbers were deliberately not reused, so a
  // dense enumeration here would be a lie about which integers CNA accepts.
  const values = Object.values(GraphicsRendererType).filter((value) => typeof value === "number");
  for (const retired of [10, 19, 20, 36, 37, 38, 41, 45, 47, 48]) {
    assert.equal(values.includes(retired), false, `${retired} is a retired renderer identity`);
  }
  assert.equal(Math.max(...values), 49);
});
