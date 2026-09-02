// SPDX-License-Identifier: MS-PL

/**
 * The two internal registries, measured on the invariants they were extracted to preserve.
 *
 * `internal/graphics-device-registry.js` and `internal/gamer-collection-registry.js` hold state
 * that used to live in `GraphicsDevice.ts` and `Gamer.ts`. Moving it broke two module cycles that
 * made four modules -- including two published subpaths -- unable to be a process's first import.
 * `tools/verify-module-cycles.mjs` proves the cycles are gone. This file proves the move did not
 * change what the state *means*, which is the half a cold import cannot see.
 *
 * Everything here runs against the same deterministic standalone-device backend
 * `test/standalone-device.test.mjs` uses, so it needs no CNA library, no GPU and no window: a
 * registry is a managed data structure, and its invariants are managed ones.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { getBackend, setBackendForInternalUse } from "../dist/internal/backend.js";
import { Graphics, GamerServices } from "../dist/index.js";
import {
  installGraphicsAdapterProviderForInternalUse,
} from "../dist/Microsoft/Xna/Framework/Graphics/GraphicsAdapter.js";
import { createDisplayModeForInternalUse } from
  "../dist/Microsoft/Xna/Framework/Graphics/DisplayMode.js";
import { createDisplayModeCollectionForInternalUse } from
  "../dist/Microsoft/Xna/Framework/Graphics/DisplayModeCollection.js";
import {
  graphicsDeviceBackendForInternalUse,
  graphicsDeviceParentLifetimeForInternalUse,
  liveGraphicsDeviceForInternalUse,
  resolveGraphicsDeviceHandleForInternalUse,
} from "../dist/internal/graphics-device-registry.js";
import { createGraphicsDeviceForInternalUse } from
  "../dist/Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import { NativeResourceLifetime } from "../dist/internal/ownership.js";

const { DepthFormat, GraphicsAdapter, GraphicsProfile, PresentationParameters, SurfaceFormat } = Graphics;

function adapterState() {
  const mode = createDisplayModeForInternalUse(640, 480, SurfaceFormat.Color);
  return {
    CurrentDisplayMode: mode,
    Description: "Registry Test Adapter",
    DeviceId: 1,
    DeviceName: "\\\\.\\REGISTRYTEST",
    IsDefaultAdapter: true,
    MonitorHandle: 1000n,
    Revision: 0,
    SubSystemId: 2,
    SupportedDisplayModes: createDisplayModeCollectionForInternalUse([mode]),
    VendorId: 3,
    IsProfileSupported: () => true,
    QueryBackBufferFormat: () => ({ Success: true, SelectedFormat: SurfaceFormat.Color, SelectedDepthFormat: DepthFormat.Depth24, SelectedMultiSampleCount: 0 }),
    QueryRenderTargetFormat: () => ({ Success: true, SelectedFormat: SurfaceFormat.Color, SelectedDepthFormat: DepthFormat.Depth24, SelectedMultiSampleCount: 0 }),
  };
}

/**
 * A backend that hands out handles from `handles`, in order, and records every destruction.
 *
 * The point of taking the list from the caller is that a caller can make it a list of *the same
 * handle twice*, which is how the handle-reuse invariant below is measured rather than assumed.
 */
function deviceHarness(previous, handles) {
  const destroyed = [];
  let next = 0;
  const backend = Object.create(previous);
  Object.assign(backend, {
    Kind: "node-native",
    IsAvailable: true,
    AbiVersion: "0.21.0-test",
    Detail: "registry-invariant backend",
    // Enough of a graphics slice for one real resource to be created and destroyed on the
    // device, which is what makes the ResourceCreated/ResourceDestroyed test a measurement.
    Graphics: {
      createOcclusionQuery() { return 900n; },
      destroyOcclusionQuery() {},
    },
    createStandaloneGraphicsDevice() {
      const handle = handles[Math.min(next, handles.length - 1)];
      next += 1;
      return handle;
    },
    destroyStandaloneGraphicsDevice(handle) { destroyed.push(handle); },
  });
  return { backend, destroyed };
}

function withDevices(handles, body) {
  const previous = getBackend();
  const harness = deviceHarness(previous, handles);
  setBackendForInternalUse(harness.backend);
  installGraphicsAdapterProviderForInternalUse(() => [adapterState()]);
  try {
    body(harness);
  } finally {
    installGraphicsAdapterProviderForInternalUse(null);
    setBackendForInternalUse(previous);
  }
}

function parameters(width = 32) {
  const value = new PresentationParameters();
  value.BackBufferWidth = width;
  value.BackBufferHeight = 24;
  return value;
}

test("a registered device is found by the registry, and answers the same every time", () => {
  withDevices([101n], () => {
    const device = new Graphics.GraphicsDevice(
      GraphicsAdapter.DefaultAdapter, GraphicsProfile.Reach, parameters(),
    );
    try {
      // Identity, not equality: a registry that rebuilt state per lookup would still pass an
      // equality check on the handle and fail this one on the collections.
      assert.equal(resolveGraphicsDeviceHandleForInternalUse(device), 101n);
      assert.equal(resolveGraphicsDeviceHandleForInternalUse(device), 101n);
      assert.equal(device.Textures, device.Textures, "the texture collection is one object");
      assert.equal(device.SamplerStates, device.SamplerStates);
      assert.equal(device.VertexTextures, device.VertexTextures);
      assert.equal(
        graphicsDeviceParentLifetimeForInternalUse(device),
        graphicsDeviceParentLifetimeForInternalUse(device),
        "and so is the lifetime every resource made on this device hangs off",
      );
      assert.equal(graphicsDeviceBackendForInternalUse(device), getBackend());
    } finally {
      device.Dispose();
    }
  });
});

test("two devices have separate state, and neither can read the other's", () => {
  withDevices([201n, 202n], () => {
    const first = new Graphics.GraphicsDevice(
      GraphicsAdapter.DefaultAdapter, GraphicsProfile.Reach, parameters(),
    );
    const second = new Graphics.GraphicsDevice(
      GraphicsAdapter.DefaultAdapter, GraphicsProfile.HiDef, parameters(64),
    );
    try {
      assert.notEqual(first, second);
      assert.equal(resolveGraphicsDeviceHandleForInternalUse(first), 201n);
      assert.equal(resolveGraphicsDeviceHandleForInternalUse(second), 202n);
      // A device-keyed map cannot answer for a device it was not given. A registry keyed by the
      // native handle, or one holding a single shared state, would fail every line here.
      assert.notEqual(first.Textures, second.Textures);
      assert.notEqual(first.SamplerStates, second.SamplerStates);
      assert.equal(first.GraphicsProfile, GraphicsProfile.Reach);
      assert.equal(second.GraphicsProfile, GraphicsProfile.HiDef);
      assert.equal(first.PresentationParameters.BackBufferWidth, 32);
      assert.equal(second.PresentationParameters.BackBufferWidth, 64);
      assert.equal(first.Viewport.Width, 32);
      assert.equal(second.Viewport.Width, 64, "each device kept its own viewport");
    } finally {
      first.Dispose();
      second.Dispose();
    }
  });
});

test("disposal refuses every later lookup, and IsDisposed still answers", () => {
  withDevices([301n], ({ destroyed }) => {
    const device = new Graphics.GraphicsDevice(
      GraphicsAdapter.DefaultAdapter, GraphicsProfile.Reach, parameters(),
    );
    assert.equal(device.IsDisposed, false);
    assert.equal(resolveGraphicsDeviceHandleForInternalUse(device), 301n);

    device.Dispose();

    // The entry deliberately survives disposal, marked disposed, because IsDisposed is answered
    // from it: a registry that DELETED the entry would make a disposed device report that it is
    // not disposed, which is the mutant this line exists to kill.
    assert.equal(device.IsDisposed, true, "a disposed device knows it");
    // The message is asserted exactly, not by a substring. The native lifetime this device owns
    // is disposed too, and refusing from THERE raises `ObjectDisposedException` as well -- with
    // the lifetime's label, "caller-created GraphicsDevice". A loose `/GraphicsDevice/` accepts
    // both, so a registry that stopped checking `Disposed` at all passed this test until the
    // mutant that does exactly that survived it. The two refusals are different guarantees: only
    // the registry's protects a device whose lifetime is borrowed and still alive.
    const refusedByTheRegistry = (error) =>
      error instanceof Error && error.name === "ObjectDisposedException" &&
      error.message === "GraphicsDevice";
    for (const lookup of [
      resolveGraphicsDeviceHandleForInternalUse,
      graphicsDeviceBackendForInternalUse,
      graphicsDeviceParentLifetimeForInternalUse,
    ]) {
      assert.throws(() => lookup(device), refusedByTheRegistry,
        `${lookup.name} must be refused by the registry, not merely by the released handle`);
    }
    assert.throws(() => device.Viewport, refusedByTheRegistry);

    // And the native handle went back exactly once, however many times Dispose is called.
    device.Dispose();
    device.Dispose();
    assert.deepEqual(destroyed, [301n], "a caller-created handle is released exactly once");
  });
});

test("a reused native handle does not resurrect the device that had it", () => {
  // CNA is free to hand a new device the handle a destroyed one had. The registry is keyed by the
  // device object rather than by the handle, so this is structurally impossible -- and that is
  // worth measuring rather than reasoning about, because a registry keyed the other way would
  // pass every other test in this file.
  withDevices([401n, 401n], ({ destroyed }) => {
    const first = new Graphics.GraphicsDevice(
      GraphicsAdapter.DefaultAdapter, GraphicsProfile.Reach, parameters(),
    );
    first.Dispose();
    assert.deepEqual(destroyed, [401n]);

    const second = new Graphics.GraphicsDevice(
      GraphicsAdapter.DefaultAdapter, GraphicsProfile.HiDef, parameters(64),
    );
    try {
      assert.equal(resolveGraphicsDeviceHandleForInternalUse(second), 401n,
        "the harness really did reuse the handle");
      assert.notEqual(first, second, "and it is a different facade");
      assert.equal(first.IsDisposed, true, "the old facade stays disposed");
      assert.equal(second.IsDisposed, false);
      assert.equal(second.GraphicsProfile, GraphicsProfile.HiDef,
        "the new device did not inherit the old one's state");
      assert.equal(second.Viewport.Width, 64);
      assert.throws(
        () => resolveGraphicsDeviceHandleForInternalUse(first),
        (error) => error.name === "ObjectDisposedException" && error.message === "GraphicsDevice",
        "and the disposed facade still refuses, rather than answering with the reused handle",
      );
    } finally {
      second.Dispose();
    }
  });
});

test("the live device is the one a manager made, and a caller-created one is not", () => {
  // `VideoPlayer.GetTexture` presents its frame through "the live device", and this ABI makes
  // exactly one game-owned device, so the live one is unambiguous. A device a *caller* constructs
  // is deliberately not it: a game with a standalone device on the side must not have its video
  // frames redirected onto it. Only `createGraphicsDeviceForInternalUse`, which is how
  // `GraphicsDeviceManager` builds the game's device, registers one as live.
  withDevices([501n], () => {
    assert.equal(liveGraphicsDeviceForInternalUse(), null, "nothing is live to begin with");

    const standalone = new Graphics.GraphicsDevice(
      GraphicsAdapter.DefaultAdapter, GraphicsProfile.Reach, parameters(),
    );
    try {
      assert.equal(
        liveGraphicsDeviceForInternalUse(), null,
        "a caller-created device does not become the live one",
      );
    } finally {
      standalone.Dispose();
    }

    const lifetime = new NativeResourceLifetime({
      Handle: 502n, Ownership: "borrowed", Label: "manager-created device",
    });
    const managed = createGraphicsDeviceForInternalUse({
      Backend: getBackend(),
      ResolveHandle: () => lifetime.Handle,
      ParentLifetime: lifetime,
      Adapter: GraphicsAdapter.DefaultAdapter,
      GraphicsProfile: GraphicsProfile.Reach,
      PresentationParameters: parameters(),
      DisplayMode: null,
    });
    assert.equal(liveGraphicsDeviceForInternalUse(), managed, "a manager-created device is live");
    assert.equal(resolveGraphicsDeviceHandleForInternalUse(managed), 502n);

    managed.Dispose();
    assert.equal(
      liveGraphicsDeviceForInternalUse(), null,
      "and disposing it clears the pointer rather than leaving a disposed device live",
    );
  });
});

test("resource creation and destruction reach the device's own events", () => {
  withDevices([601n], () => {
    const device = new Graphics.GraphicsDevice(
      GraphicsAdapter.DefaultAdapter, GraphicsProfile.Reach, parameters(),
    );
    try {
      // The dispatchers behind these two events are attached through the registry now. If that
      // registration were dropped, every assertion in the package would still pass except this one.
      const created = [];
      const destroyed = [];
      device.ResourceCreated.Add((sender, args) => created.push([sender, args.Resource]));
      device.ResourceDestroyed.Add((sender, args) => destroyed.push([sender, args.Name]));

      const query = new Graphics.OcclusionQuery(device);
      assert.equal(created.length, 1, "creating a resource raised ResourceCreated exactly once");
      assert.equal(created[0][0], device, "and the sender is the device it was made on");
      assert.equal(created[0][1], query, "and the resource is the one that was made");

      query.Name = "registry-probe";
      query.Dispose();
      assert.equal(destroyed.length, 1, "disposing it raised ResourceDestroyed exactly once");
      assert.equal(destroyed[0][0], device);
      assert.equal(destroyed[0][1], "registry-probe");
    } finally {
      device.Dispose();
    }
  });
});

test("a gamer collection enumerates through the registry that broke its cycle", () => {
  // The items live in `internal/gamer-collection-registry.js` now. CNA publishes no signed-in
  // gamer backend -- upstream finding 29 -- so every collection is empty, and empty is what the
  // enumerator, the iterator and the count must agree on.
  const gamers = GamerServices.Gamer.SignedInGamers;
  assert.equal(gamers.Count, 0);
  assert.deepEqual([...gamers], []);
  assert.equal(gamers.Contains(undefined), false);
  assert.equal(gamers.IndexOf(undefined), -1);

  const enumerator = gamers.GetEnumerator();
  assert.equal(enumerator.MoveNext(), false, "an empty collection advances to nothing");
  enumerator.Dispose();

  // The nested identity XNA declares is still attached, which is the module-scope read that used
  // to throw when this file's module was entered first.
  assert.equal(
    GamerServices.GamerCollection.GamerCollectionEnumerator,
    Object.getPrototypeOf(enumerator).constructor,
    "GamerCollection.GamerCollectionEnumerator is the class GetEnumerator returns",
  );
});
