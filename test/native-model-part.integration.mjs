// SPDX-License-Identifier: MS-PL
//
// The native model-mesh-part side-car, and the two engine families it unlocks.
//
// The subject is a real XNB-loaded `Model` -- the same synthetic asset the main native suite reads,
// through the same strict `ContentManager` -- so what is measured here is the object a consumer
// actually holds, not a hand-built stand-in.
//
// Four claims are worth more than "the routes returned success", and each has its own test:
//
//   * the native view shares the managed buffers rather than copying the geometry;
//   * the same public part yields the same native object however often it is borrowed;
//   * `LodGroup.Select` hands back the very `ModelMeshPart` that was added, by object identity;
//   * disposing the managed `VertexBuffer` still works, which it would not if the side-car were
//     left holding CNA's retention (see docs/native-model-graph.md, stage 8).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import {
  Color,
  Content,
  Game,
  Graphics,
  GraphicsDeviceManager,
  GraphicsDeviceManager as _Manager,
  LoadNodeNativeBackend,
  Matrix,
  Vector3,
} from "../dist/index.js";
import { CNA_ABI_MAJOR, CNA_ABI_MINOR } from "../dist/internal/abi.js";
import * as graphicsExtensions from "../dist/extensions/graphics/index.js";
import {
  describeNativeMeshPartForInternalUse,
  acquireNativeMeshPartForInternalUse,
} from "../dist/internal/native-mesh-part.js";
import { compressedXnb, modelXnb, textureXnb } from "./fixtures/xnb.mjs";

void _Manager;

const library = process.env.CNA_NATIVE_LIBRARY;
if (!library) {
  throw new Error(
    `CNA_NATIVE_LIBRARY must name an existing CNA C ABI ${CNA_ABI_MAJOR}.${CNA_ABI_MINOR}.x shared library`,
  );
}
const storageHome = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-model-part-"));
process.env.XDG_DATA_HOME = storageHome;
after(() => fs.rmSync(storageHome, { recursive: true, force: true }));

await LoadNodeNativeBackend({
  CnaLibrary: path.resolve(library),
  BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
});

/** Everything the frame measured, keyed by claim. A thrown error is recorded, never swallowed. */
const evidence = Object.create(null);

function record(name, action) {
  try {
    evidence[name] = action();
  } catch (error) {
    evidence[name] = { failed: `${error?.constructor?.name}: ${error?.message}` };
  }
}

class ModelPartProbeGame extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
  }

  LoadContent() {
    const modelBytes = compressedXnb(modelXnb());
    const textureBytes = compressedXnb(textureXnb());
    class Assets extends Content.ContentManager {
      OpenStream(assetName) {
        if (assetName === "Models\\SyntheticModel") return modelBytes;
        if (assetName === "Textures\\Atlas") return textureBytes;
        throw new Error(`Unknown synthetic asset ${assetName}`);
      }
    }
    this.content = new Assets({
      GetService: (type) => (type === Graphics.GraphicsDevice ? this.GraphicsDevice : null),
    });
    this.model = this.content.Load(Graphics.Model, "Models/SyntheticModel");
    this.part = this.model.Meshes.Get(0).MeshParts.Get(0);
  }

  Draw(_gameTime) {
    const part = this.part;
    const device = this.GraphicsDevice;

    // --- 1. the side-car mirrors the managed part and shares its buffers ----------------------
    record("description", () => {
      const described = describeNativeMeshPartForInternalUse(part);
      return {
        ...described,
        managed: {
          NumVertices: part.NumVertices,
          PrimitiveCount: part.PrimitiveCount,
          StartIndex: part.StartIndex,
          VertexOffset: part.VertexOffset,
        },
      };
    });

    // --- 2. identity: one public part, one native object -------------------------------------
    record("identity", () => {
      const first = acquireNativeMeshPartForInternalUse(part);
      const second = acquireNativeMeshPartForInternalUse(part);
      const sibling = this.model.Meshes.Get(0).MeshParts.Get(0);
      return {
        stable: first === second,
        sameCollectionAccess: acquireNativeMeshPartForInternalUse(sibling) === first,
        publicIdentity: sibling === part,
      };
    });

    // --- 3. the instanced renderer, over that part --------------------------------------------
    record("instancing", () => {
      const renderer = new graphicsExtensions.InstancedRenderer(device, part);
      try {
        const transforms = [
          Matrix.CreateTranslation(new Vector3(-2, 0, 0)),
          Matrix.CreateTranslation(new Vector3(0, 0, 0)),
          Matrix.CreateTranslation(new Vector3(2, 0, 0)),
        ];
        renderer.SetInstances(transforms);
        const afterThree = renderer.InstanceCount;
        const capacityAfterThree = renderer.InstanceCapacity;
        renderer.SetInstances(transforms.slice(0, 2));
        const afterTwo = renderer.InstanceCount;
        const capacityAfterTwo = renderer.InstanceCapacity;
        renderer.SetInstances([]);
        const afterNone = renderer.InstanceCount;
        renderer.SetInstances(transforms);

        renderer.SetTints([Color.Red, Color.Green, Color.Blue]);
        const tintsOffByDefault = renderer.TintsEnabled;
        renderer.TintsEnabled = true;
        const tintsOn = renderer.TintsEnabled;
        renderer.TintsEnabled = false;

        return {
          partIdentity: renderer.Part === part,
          afterThree, afterTwo, afterNone,
          capacityAfterThree, capacityAfterTwo,
          supported: renderer.IsInstancingSupported,
          fallbackDefault: renderer.FallbackEnabled,
          tintsOffByDefault, tintsOn,
          disposedTwice: (() => { renderer.Dispose(); renderer.Dispose(); return true; })(),
          isDisposed: renderer.IsDisposed,
        };
      } finally {
        renderer.Dispose();
      }
    });

    // --- 4. drawing: whether it instanced, or fell back, or refused ----------------------------
    record("draw", () => {
      const renderer = new graphicsExtensions.InstancedRenderer(device, part);
      const effect = part.Effect;
      try {
        renderer.SetInstances([Matrix.Identity, Matrix.CreateTranslation(new Vector3(3, 0, 0))]);
        let refusedWithoutFallback = null;
        renderer.FallbackEnabled = false;
        try {
          renderer.Draw(effect);
          refusedWithoutFallback = "DREW";
        } catch (error) {
          refusedWithoutFallback = `Error(${error?.cnaResult})`;
        }
        renderer.FallbackEnabled = true;
        let withFallback = null;
        try {
          renderer.Draw(effect);
          withFallback = {
            calls: renderer.LastDrawCallCount,
            instanced: renderer.DidLastDrawInstance,
          };
        } catch (error) {
          withFallback = `Error(${error?.cnaResult})`;
        }
        return { supported: renderer.IsInstancingSupported, refusedWithoutFallback, withFallback };
      } finally {
        renderer.Dispose();
      }
    });

    // --- 5. LOD selection returns the public object, not a wrapper -----------------------------
    record("lod", () => {
      const group = new graphicsExtensions.LodGroup();
      try {
        group.AddLevel(50, null);        // coarse: draws nothing past the near band
        group.AddLevel(10, part);        // fine
        const near = group.Select(1);
        const nearIndex = group.SelectIndex(1);
        const far = group.Select(30);
        const farIndex = group.SelectIndex(30);
        const empty = new graphicsExtensions.LodGroup();
        const emptySelect = empty.Select(5);
        const emptyIndex = empty.SelectIndex(5);
        empty.Dispose();
        return {
          nearIsPart: near === part,
          nearIndex,
          farIsNull: far === null,
          farIndex,
          thresholds: [...group.Thresholds],
          emptySelectIsNull: emptySelect === null,
          emptyIndex,
        };
      } finally {
        group.Dispose();
      }
    });

    // --- 6. the group borrows: destroying it leaves the part and its native view alive ---------
    record("lodBorrow", () => {
      const before = acquireNativeMeshPartForInternalUse(part);
      const group = new graphicsExtensions.LodGroup();
      group.AddLevel(10, part);
      group.Dispose();
      return {
        sameAfterGroupDisposed: acquireNativeMeshPartForInternalUse(part) === before,
        stillDescribable: describeNativeMeshPartForInternalUse(part).SharesManagedBuffers,
      };
    });

    // --- 7. a part with no buffers is refused by name, not by CNA later ------------------------
    record("refusals", () => {
      const results = {};
      try {
        new graphicsExtensions.InstancedRenderer(device, null);
        results.nullPart = "ACCEPTED";
      } catch (error) { results.nullPart = error?.constructor?.name; }
      try {
        new graphicsExtensions.InstancedRenderer(null, part);
        results.nullDevice = "ACCEPTED";
      } catch (error) { results.nullDevice = error?.constructor?.name; }
      const group = new graphicsExtensions.LodGroup();
      try {
        group.AddLevel(Number.NaN, part);
        results.nanThreshold = "ACCEPTED";
      } catch (error) { results.nanThreshold = error?.constructor?.name; }
      try {
        group.Select(Number.POSITIVE_INFINITY);
        results.infiniteDistance = "ACCEPTED";
      } catch (error) { results.infiniteDistance = error?.constructor?.name; }
      group.Dispose();
      return results;
    });

    // --- 8. disposal order: the managed buffer must still dispose cleanly ----------------------
    // A side-car left holding CNA's retention would make this throw INVALID_STATE. It is the
    // release guard, not luck, that keeps XNA's IDisposable contract intact.
    record("disposalOrder", () => {
      const owned = this.OwnDisposableCopy();
      const handleBefore = acquireNativeMeshPartForInternalUse(owned.part);
      const description = describeNativeMeshPartForInternalUse(owned.part);
      let disposeResult = "DISPOSED";
      try {
        owned.vertexBuffer.Dispose();
      } catch (error) {
        disposeResult = `Error(${error?.cnaResult ?? error?.message})`;
      }
      let reacquire = null;
      try {
        acquireNativeMeshPartForInternalUse(owned.part);
        reacquire = "ACCEPTED";
      } catch (error) { reacquire = error?.constructor?.name; }
      owned.indexBuffer.Dispose();
      return {
        hadSideCar: typeof handleBefore === "bigint",
        shared: description.SharesManagedBuffers,
        disposeResult,
        vertexDisposed: owned.vertexBuffer.IsDisposed,
        reacquire,
      };
    });

    // --- 9. a dependent must give up its borrow before the part it borrows is destroyed -------
    record("dependents", () => {
      const owned = this.OwnDisposableCopy();
      const renderer = new graphicsExtensions.InstancedRenderer(device, owned.part);
      const group = new graphicsExtensions.LodGroup();
      group.AddLevel(10, owned.part);
      group.AddLevel(50, null);
      const selectedBefore = group.Select(1) === owned.part;
      const rendererLiveBefore = !renderer.IsDisposed;

      owned.vertexBuffer.Dispose();

      const results = {
        selectedBefore,
        rendererLiveBefore,
        rendererDisposedAfter: renderer.IsDisposed,
      };
      try { group.Select(1); results.selectAfter = "ANSWERED"; }
      catch (error) { results.selectAfter = error?.constructor?.name; }
      const effect = new Graphics.BasicEffect(device);
      try { renderer.Draw(effect); results.drawAfter = "ACCEPTED"; }
      catch (error) { results.drawAfter = error?.constructor?.name; }
      effect.Dispose();
      // Clearing is the documented way back: after it the group borrows nothing.
      group.Clear();
      try { results.clearedIndex = group.SelectIndex(1); }
      catch (error) { results.clearedIndex = error?.constructor?.name; }
      group.Dispose();
      renderer.Dispose();
      owned.indexBuffer.Dispose();
      return results;
    });

    this.Exit();
  }

  /**
   * A second `Model` over buffers this test owns outright, so the disposal test can dispose them
   * without taking the ContentManager's asset apart. Built through the same factory the XNB reader
   * uses, so the part is the same kind of object.
   */
  OwnDisposableCopy() {
    const device = this.GraphicsDevice;
    const vertexBuffer = new Graphics.VertexBuffer(
      device, Graphics.VertexPositionColor, 3, Graphics.BufferUsage.None,
    );
    vertexBuffer.SetData([
      new Graphics.VertexPositionColor(new Vector3(0, 0, 0), Color.Red),
      new Graphics.VertexPositionColor(new Vector3(1, 0, 0), Color.Green),
      new Graphics.VertexPositionColor(new Vector3(0, 1, 0), Color.Blue),
    ]);
    const indexBuffer = new Graphics.IndexBuffer(
      device, Graphics.IndexElementSize.SixteenBits, 3, Graphics.BufferUsage.None,
    );
    indexBuffer.SetData([0, 1, 2]);
    const model = Graphics.CreateModelForTests
      ? Graphics.CreateModelForTests()
      : buildModel(device, vertexBuffer, indexBuffer);
    return { part: model.Meshes.Get(0).MeshParts.Get(0), vertexBuffer, indexBuffer };
  }
}

let buildModel;
{
  const { createModelForInternalUse } =
    await import("../dist/Microsoft/Xna/Framework/Graphics/Model.js");
  const { BoundingSphere } = await import("../dist/Microsoft/Xna/Framework/BoundingSphere.js");
  buildModel = (device, vertexBuffer, indexBuffer) => createModelForInternalUse(device, {
    Bones: [{ Name: "Root", Transform: Matrix.Identity }],
    Meshes: [{
      Name: "Owned",
      ParentBoneIndex: 0,
      BoundingSphere: new BoundingSphere(Vector3.Zero, 1),
      Parts: [{
        VertexBuffer: vertexBuffer,
        IndexBuffer: indexBuffer,
        Effect: null,
        NumVertices: 3,
        PrimitiveCount: 1,
        StartIndex: 0,
        VertexOffset: 0,
      }],
    }],
  });
}

{
  const game = new ModelPartProbeGame();
  await game.Run();
  game.Dispose();
}

function claim(name) {
  const value = evidence[name];
  assert.ok(
    value != null && value.failed == null,
    `the "${name}" measurement did not run: ${value?.failed ?? "absent"}`,
  );
  return value;
}

test("the native view mirrors the managed part and shares its buffers", () => {
  const seen = claim("description");
  assert.equal(seen.NumVertices, seen.managed.NumVertices);
  assert.equal(seen.PrimitiveCount, seen.managed.PrimitiveCount);
  assert.equal(seen.StartIndex, seen.managed.StartIndex);
  assert.equal(seen.VertexOffset, seen.managed.VertexOffset);
  assert.equal(seen.NumVertices, 3, "the synthetic model's one part is a single triangle");
  assert.equal(seen.PrimitiveCount, 1);
  assert.ok(seen.HasVertexBuffer && seen.HasIndexBuffer);
  assert.equal(
    seen.SharesManagedBuffers, true,
    "the native part must point at the managed part's own buffers -- if this is false the " +
    "bridge has uploaded the geometry a second time, which is the one thing it must never do",
  );
  assert.equal(
    seen.HasEffect, true,
    "the XNB part carries a BasicEffect, and the side-car mirrors it rather than leaving the " +
    "slot empty",
  );
});

test("one public part maps to one native object, however it is reached", () => {
  const seen = claim("identity");
  assert.equal(seen.publicIdentity, true, "the collection hands back the same public object");
  assert.equal(
    seen.stable, true,
    "borrowing twice must not mint a second native part; the whole point of the cache",
  );
  assert.equal(seen.sameCollectionAccess, true);
});

test("an instanced renderer borrows the part and tracks its instance buffer", () => {
  const seen = claim("instancing");
  assert.equal(seen.partIdentity, true, "Part is the object that was passed in");
  assert.equal(seen.afterThree, 3);
  assert.equal(seen.afterTwo, 2, "uploading fewer instances lowers the count");
  assert.equal(seen.afterNone, 0, "and an empty upload is accepted rather than refused");
  assert.ok(
    seen.capacityAfterTwo >= seen.capacityAfterThree,
    "the buffer is reused rather than reallocated when the count falls: " +
    `${seen.capacityAfterThree} then ${seen.capacityAfterTwo}`,
  );
  assert.ok(seen.capacityAfterThree >= 3);
  assert.equal(seen.tintsOffByDefault, false, "the tint stream starts unbound");
  assert.equal(seen.fallbackDefault, false, "and the per-instance fallback starts off");
  assert.equal(seen.tintsOn, true);
  assert.equal(seen.disposedTwice, true, "disposing twice is harmless");
  assert.equal(seen.isDisposed, true);
  assert.equal(
    seen.supported, false,
    "HEADLESS cannot draw instances in one call -- measured, and the reason the draw test " +
    "below exercises the fallback rather than the instanced path",
  );
});

test("drawing names which path it took rather than only whether it succeeded", () => {
  const seen = claim("draw");
  assert.equal(seen.supported, false, "HEADLESS again");
  // Upstream finding 25. The header documents INVALID_STATE and the C shim's own comment says
  // "the exception barrier maps logic_error to INVALID_STATE" -- but the barrier has no
  // std::logic_error arm at all, only out_of_range and invalid_argument, so both of this
  // renderer's canonical refusals fall through to the std::exception arm and arrive as INTERNAL.
  // Reproduced in pure C before being asserted here. When it is repaired this line fails and says
  // so, rather than the binding quietly outgrowing a stale expectation.
  assert.equal(
    seen.refusedWithoutFallback, "Error(12)",
    "a renderer that cannot instance and may not fall back refuses rather than quietly drawing " +
    "nothing -- as INTERNAL rather than the documented INVALID_STATE, upstream finding 25",
  );
  assert.equal(
    typeof seen.withFallback, "object",
    `enabling the fallback must let the draw through: ${JSON.stringify(seen.withFallback)}`,
  );
  assert.equal(
    seen.withFallback.instanced, false,
    "and it must say it did not instance, so a per-instance loop is never mistaken for one call",
  );
  assert.equal(
    seen.withFallback.calls, 2,
    "two instances drawn one at a time is two draw calls, which is the observable that " +
    "separates the fallback from the instanced path",
  );
});

test("LodGroup.Select returns the ModelMeshPart itself, by object identity", () => {
  const seen = claim("lod");
  assert.equal(
    seen.nearIsPart, true,
    "the near band must select the very object that was added -- not a new wrapper around an " +
    "equal handle, which is what makes the reverse map worth having",
  );
  assert.equal(seen.nearIndex, 0, "index zero is always the finest level");
  assert.equal(
    seen.farIsNull, true,
    "a level added with no part deliberately draws nothing, and answers null",
  );
  assert.equal(seen.farIndex, 1, "which SelectIndex separates from an empty group by answering 1");
  assert.deepEqual(seen.thresholds, [10, 50], "the group sorts finest-first whatever the add order");
  assert.equal(seen.emptySelectIsNull, true);
  assert.equal(seen.emptyIndex, -1, "an empty group answers -1 rather than refusing");
});

test("a LOD group borrows its parts and leaves them alive", () => {
  const seen = claim("lodBorrow");
  assert.equal(seen.sameAfterGroupDisposed, true);
  assert.equal(seen.stillDescribable, true);
});

test("bad arguments are refused here, by name", () => {
  const seen = claim("refusals");
  assert.equal(seen.nullPart, "TypeError");
  assert.equal(seen.nullDevice, "TypeError");
  assert.equal(seen.nanThreshold, "TypeError");
  assert.equal(seen.infiniteDistance, "TypeError");
});

test("a dependent gives up its borrow before the part it borrows is destroyed", () => {
  const seen = claim("dependents");
  assert.equal(seen.selectedBefore, true, "the group selects the part while its buffers live");
  assert.equal(seen.rendererLiveBefore, true);
  assert.equal(
    seen.rendererDisposedAfter, true,
    "disposing the VertexBuffer must dispose the renderer that borrowed the part -- CNA " +
    "dereferences the part when it draws, so a renderer outliving it is a use-after-free",
  );
  assert.equal(
    seen.selectAfter, "ObjectDisposedException",
    "and the group refuses rather than answering null, which would report \"this level draws " +
    "nothing\" for geometry that has been freed",
  );
  assert.equal(seen.drawAfter, "NativeUnavailableError", "the disposed renderer refuses by name");
  assert.equal(seen.clearedIndex, -1, "Clear is the way back: an emptied group answers again");
});

test("disposing a managed buffer still works with a side-car built over it", () => {
  const seen = claim("disposalOrder");
  assert.equal(seen.hadSideCar, true);
  assert.equal(seen.shared, true);
  assert.equal(
    seen.disposeResult, "DISPOSED",
    "CNA refuses to destroy a buffer a native part retains (INVALID_STATE), so without the " +
    "release guard this would be Error(3) and XNA's IDisposable contract would be broken",
  );
  assert.equal(seen.vertexDisposed, true);
  assert.equal(
    seen.reacquire, "ObjectDisposedException",
    "and re-borrowing after the buffer is gone names the disposed object rather than crashing",
  );
});
