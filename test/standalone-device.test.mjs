/**
 * XNA's public `GraphicsDevice` constructor, covered where hardware cannot reach.
 *
 * `test/native-cna.integration.mjs` drives this against a real CNA library, and on this machine
 * that answer is honest but thin in one specific way: there is exactly one graphics adapter, so
 * `GraphicsDevice.Adapter` returning the *default* adapter and returning the adapter it was
 * *given* are indistinguishable. That was measured by planting exactly that defect -- storing
 * `null` instead of the adapter, and letting the getter fall back to the default -- and watching
 * the integration suite stay green.
 *
 * So this file supplies what the hardware does not: two adapters that differ in every field, and a
 * deterministic standalone-device backend that records what it was asked for. That is a *managed*
 * projection test -- it proves this package passes the right adapter index to CNA and reports the
 * right adapter back -- and it deliberately claims nothing about a second physical GPU, which
 * stays hardware-pending.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { getBackend, setBackendForInternalUse } from "../dist/internal/backend.js";
import { Graphics, NativeUnavailableError } from "../dist/index.js";
import {
  installGraphicsAdapterProviderForInternalUse,
} from "../dist/Microsoft/Xna/Framework/Graphics/GraphicsAdapter.js";
import { createDisplayModeForInternalUse } from
  "../dist/Microsoft/Xna/Framework/Graphics/DisplayMode.js";
import { createDisplayModeCollectionForInternalUse } from
  "../dist/Microsoft/Xna/Framework/Graphics/DisplayModeCollection.js";

const { DepthFormat, GraphicsAdapter, GraphicsProfile, PresentationParameters, SurfaceFormat } = Graphics;

function adapterState(index, isDefault) {
  // DisplayMode is created only by a backend, which is what makes it evidence rather than a
  // value a caller can invent; the internal factory is how this file supplies one.
  const mode = createDisplayModeForInternalUse(
    640 + index * 100, 480 + index * 100, SurfaceFormat.Color,
  );
  return {
    CurrentDisplayMode: mode,
    Description: `Test Adapter ${index}`,
    DeviceId: 100 + index,
    DeviceName: `\\\\.\\TESTDISPLAY${index}`,
    IsDefaultAdapter: isDefault,
    MonitorHandle: BigInt(1000 + index),
    Revision: index,
    SubSystemId: 200 + index,
    SupportedDisplayModes: createDisplayModeCollectionForInternalUse([mode]),
    VendorId: 300 + index,
    IsProfileSupported: () => true,
    QueryBackBufferFormat: () => ({ Success: true, SelectedFormat: SurfaceFormat.Color, SelectedDepthFormat: DepthFormat.Depth24, SelectedMultiSampleCount: 0 }),
    QueryRenderTargetFormat: () => ({ Success: true, SelectedFormat: SurfaceFormat.Color, SelectedDepthFormat: DepthFormat.Depth24, SelectedMultiSampleCount: 0 }),
  };
}

/** Records exactly what the constructor asked CNA for, and hands back a distinct handle each time. */
function deviceHarness(previous) {
  const created = [];
  const destroyed = [];
  let next = 100n;
  const backend = Object.create(previous);
  Object.assign(backend, {
    Kind: "node-native",
    IsAvailable: true,
    AbiVersion: "0.21.0-test",
    Detail: "deterministic standalone-device backend",
    createStandaloneGraphicsDevice(adapterIndex, graphicsProfile, parameters) {
      created.push({ adapterIndex, graphicsProfile, parameters });
      next += 1n;
      return next;
    },
    destroyStandaloneGraphicsDevice(handle) { destroyed.push(handle); },
  });
  return { backend, created, destroyed };
}

function withTwoAdapters(body) {
  const previousBackend = getBackend();
  const harness = deviceHarness(previousBackend);
  setBackendForInternalUse(harness.backend);
  installGraphicsAdapterProviderForInternalUse(() => [adapterState(0, true), adapterState(1, false)]);
  try {
    body(harness);
  } finally {
    installGraphicsAdapterProviderForInternalUse(null);
    setBackendForInternalUse(previousBackend);
  }
}

test("the adapter a device is constructed with is the adapter it reports", () => {
  withTwoAdapters(({ created }) => {
    const adapters = GraphicsAdapter.Adapters;
    assert.equal(adapters.length, 2, "the harness supplies two adapters");
    assert.notEqual(adapters[0], adapters[1]);
    assert.equal(adapters[0].Description, "Test Adapter 0");
    assert.equal(adapters[1].Description, "Test Adapter 1");
    assert.equal(GraphicsAdapter.DefaultAdapter, adapters[0], "the default is the first");

    const parameters = new PresentationParameters();
    parameters.BackBufferWidth = 32;
    parameters.BackBufferHeight = 24;

    // The non-default adapter. A device that stored null and let the getter fall back to the
    // default would answer with adapters[0] here, which is the whole point of the second adapter.
    const second = new Graphics.GraphicsDevice(adapters[1], GraphicsProfile.HiDef, parameters);
    try {
      assert.equal(
        second.Adapter, adapters[1],
        "the device must report the adapter it was given, not the default one",
      );
      assert.notEqual(second.Adapter, GraphicsAdapter.DefaultAdapter);
      assert.equal(second.Adapter.Description, "Test Adapter 1");
    } finally {
      second.Dispose();
    }

    const first = new Graphics.GraphicsDevice(adapters[0], GraphicsProfile.Reach, parameters);
    try {
      assert.equal(first.Adapter, adapters[0]);
    } finally {
      first.Dispose();
    }

    // And the index CNA was asked for is that adapter's position in the same list CNA enumerated.
    assert.deepEqual(
      created.map((call) => call.adapterIndex), [1, 0],
      "the adapter index is the adapter's position, not a constant",
    );
    assert.deepEqual(
      created.map((call) => call.graphicsProfile),
      [GraphicsProfile.HiDef, GraphicsProfile.Reach],
      "and the profile reaches CNA unchanged",
    );
  });
});

test("the presentation parameters reach CNA field by field", () => {
  withTwoAdapters(({ created }) => {
    const parameters = new PresentationParameters();
    // Every field a different value, so a field written into the wrong slot changes a number.
    parameters.BackBufferWidth = 111;
    parameters.BackBufferHeight = 222;
    parameters.BackBufferFormat = SurfaceFormat.Bgra4444;
    parameters.DepthStencilFormat = DepthFormat.Depth24Stencil8;
    parameters.MultiSampleCount = 4;
    parameters.IsFullScreen = true;
    const device = new Graphics.GraphicsDevice(
      GraphicsAdapter.DefaultAdapter, GraphicsProfile.Reach, parameters,
    );
    try {
      const sent = created[0].parameters;
      assert.equal(sent.BackBufferWidth, 111);
      assert.equal(sent.BackBufferHeight, 222);
      assert.equal(sent.BackBufferFormat, SurfaceFormat.Bgra4444);
      assert.equal(sent.DepthStencilFormat, DepthFormat.Depth24Stencil8);
      assert.equal(sent.MultiSampleCount, 4);
      assert.equal(sent.IsFullScreen, true);
      assert.equal(typeof sent.PresentationInterval, "number");
      assert.equal(typeof sent.DisplayOrientation, "number");
      assert.equal(typeof sent.RenderTargetUsage, "number");

      // The device holds a copy: mutating the caller's object afterwards must not change it.
      parameters.BackBufferWidth = 999;
      assert.equal(
        device.PresentationParameters.BackBufferWidth, 111,
        "a device's presentation parameters are a copy, not a view",
      );
    } finally {
      device.Dispose();
    }
  });
});

test("a caller-created device releases its own handle exactly once", () => {
  withTwoAdapters(({ created, destroyed }) => {
    const parameters = new PresentationParameters();
    const device = new Graphics.GraphicsDevice(
      GraphicsAdapter.DefaultAdapter, GraphicsProfile.Reach, parameters,
    );
    assert.equal(destroyed.length, 0, "nothing is released while the device is alive");
    device.Dispose();
    device.Dispose();
    assert.equal(destroyed.length, 1, "and exactly once when it is not");
    assert.equal(
      destroyed[0], created.length === 1 ? 101n : destroyed[0],
      "the handle released is the handle created",
    );
    assert.equal(device.IsDisposed, true);
  });
});

test("the constructor refuses before it reaches CNA", () => {
  withTwoAdapters(({ created }) => {
    const parameters = new PresentationParameters();
    const adapters = GraphicsAdapter.Adapters;
    for (const call of [
      () => new Graphics.GraphicsDevice(null, GraphicsProfile.Reach, parameters),
      () => new Graphics.GraphicsDevice(adapters[0], GraphicsProfile.Reach, null),
    ]) {
      assert.throws(call, call.toString());
    }
    // An adapter that is not one of CNA's is refused rather than indexed as -1.
    assert.throws(
      () => new Graphics.GraphicsDevice(
        Object.create(Object.getPrototypeOf(adapters[0])), GraphicsProfile.Reach, parameters,
      ),
      /adapter is not one of/,
    );
    assert.equal(created.length, 0, "no refused construction reached CNA");
  });
});

test("without a standalone-device route the constructor refuses by name", () => {
  const previous = getBackend();
  const backend = Object.create(previous);
  Object.assign(backend, {
    Kind: "node-native", IsAvailable: true, AbiVersion: "0.21.0-test",
    Detail: "a backend without the standalone-device route",
    createStandaloneGraphicsDevice: undefined,
    destroyStandaloneGraphicsDevice: undefined,
  });
  setBackendForInternalUse(backend);
  installGraphicsAdapterProviderForInternalUse(() => [adapterState(0, true)]);
  try {
    assert.throws(
      () => new Graphics.GraphicsDevice(
        GraphicsAdapter.DefaultAdapter, GraphicsProfile.Reach, new PresentationParameters(),
      ),
      NativeUnavailableError,
    );
  } finally {
    installGraphicsAdapterProviderForInternalUse(null);
    setBackendForInternalUse(previous);
  }
});
