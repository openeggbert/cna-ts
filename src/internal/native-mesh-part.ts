// SPDX-License-Identifier: MS-PL
//
// The native side-car for a managed ModelMeshPart.
//
// This package's `ModelMeshPart` is a managed XNB projection and stays authoritative: it keeps its
// XNA shape, its identity and its behaviour, and nothing here is visible from
// `Microsoft.Xna.Framework.*`. What this module adds is a *second, native view of the same
// geometry* for the CNA engine extensions that need one -- the instanced renderer and LOD
// selection, both of which take a `CNA_ModelMeshPartHandle`.
//
// Three measured facts shape the whole design. `docs/native-model-graph.md` has the probe output.
//
//   1. `cna_model_mesh_part_create` *retains* the vertex and index buffers it is handed and reports
//      back the same handles. No geometry is uploaded twice; the side-car is a view, not a copy.
//   2. CNA enforces that retention: destroying a buffer a part still holds is `INVALID_STATE`. So a
//      side-car that outlived its buffers would make `VertexBuffer.Dispose()` throw, which strict
//      XNA forbids. Every side-car therefore hangs a teardown on both buffers' *lifetimes* and is
//      destroyed from it, before CNA is ever asked to destroy the buffer. The lifetime is the
//      right hook rather than `GraphicsResource.Dispose`, because a buffer is also released when
//      the game lifetime cascades to its children, and that path never touches the wrapper.
//   3. `cna_lod_group_ext_select` hands back the *same* handle that was put in, unlike CNA's
//      collection getters which mint fresh ones. That is what makes the reverse map below sound.

import type { CnaNativeMeshPartBackend } from "./backend.js";
import { getBackend } from "./backend.js";
import type { NativeHandle } from "./ownership.js";
import { NativeUnavailableError } from "./native-error.js";
import type { Effect } from "../Microsoft/Xna/Framework/Graphics/Effect.js";
import { resolveEffectHandleForInternalUse } from
  "../Microsoft/Xna/Framework/Graphics/Effect.js";
import type { GraphicsDevice } from "../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import type { ModelMeshPart } from "../Microsoft/Xna/Framework/Graphics/Model.js";
import {
  resolveVertexBufferHandleForInternalUse,
  trackVertexBufferReleaseForInternalUse,
} from "../Microsoft/Xna/Framework/Graphics/VertexBuffer.js";
import {
  resolveIndexBufferHandleForInternalUse,
  trackIndexBufferReleaseForInternalUse,
} from "../Microsoft/Xna/Framework/Graphics/IndexBuffer.js";
import { trackEffectReleaseForInternalUse } from
  "../Microsoft/Xna/Framework/Graphics/Effect.js";
import { InvalidOperationException, ObjectDisposedException } from "./exceptions.js";

/** What the native side of one managed part looks like, for the diagnostic below. */
export interface NativeMeshPartDescription {
  readonly NumVertices: number;
  readonly PrimitiveCount: number;
  readonly StartIndex: number;
  readonly VertexOffset: number;
  readonly HasVertexBuffer: boolean;
  readonly HasIndexBuffer: boolean;
  readonly HasEffect: boolean;
  /**
   * Whether the native part points at the very buffers the managed part owns rather than at
   * copies. This is the anti-duplication claim, checked against the live handles rather than
   * assumed; the handles themselves never leave this module.
   */
  readonly SharesManagedBuffers: boolean;
}

interface SideCar {
  readonly Part: ModelMeshPart;
  readonly Handle: NativeHandle;
  readonly Backend: CnaNativeMeshPartBackend;
  Effect: Effect | null;
  Released: boolean;
}

/** One side-car per public part, so repeated borrows are the same native object. */
const sideCars = new WeakMap<ModelMeshPart, SideCar>();

/**
 * Handle value back to the public part, for `cna_lod_group_ext_select`. Keyed by the handle's
 * decimal text because a `bigint` is not usable as a `Map` key by value on every backend shape.
 * Cleared by the same release path that destroys the handle, so a value CNA later recycles can
 * never resolve to a part that has gone.
 */
const partsByHandle = new Map<string, ModelMeshPart>();

/** The teardowns a side-car registered, so releasing it early can unsubscribe them. */
const teardowns = new WeakMap<SideCar, (() => void)[]>();

function backendOrRefuse(): CnaNativeMeshPartBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.NativeMeshParts == null) {
    throw new NativeUnavailableError(
      `a native model-mesh-part view requires a loaded backend that has one: ${backend.Detail}`,
    );
  }
  return backend.NativeMeshParts;
}

/** Whether this backend can build native views of mesh parts at all. */
export function nativeMeshPartsAvailableForInternalUse(): boolean {
  const backend = getBackend();
  return backend.IsAvailable && backend.NativeMeshParts != null;
}

function releaseSideCar(sideCar: SideCar): void {
  if (sideCar.Released) return;
  sideCar.Released = true;
  sideCars.delete(sideCar.Part);
  partsByHandle.delete(sideCar.Handle.toString());
  sideCar.Effect = null;
  sideCar.Backend.destroyNativeMeshPart(sideCar.Handle);
  // Whichever buffer went first, the other's teardown is now pointless; unsubscribing keeps a
  // long-lived buffer from accumulating dead entries for parts that have gone.
  for (const unsubscribe of teardowns.get(sideCar) ?? []) unsubscribe();
  teardowns.delete(sideCar);
}

/**
 * Keeps the native part's effect slot equal to the managed part's `Effect`.
 *
 * CNA retains an assigned effect the same way it retains the buffers, so a disposed effect that
 * was still assigned would be refused. The guard below clears the slot first, and only when the
 * effect being disposed is the one actually assigned.
 */
function syncEffect(sideCar: SideCar): void {
  const effect = (sideCar.Part.Effect as Effect | null) ?? null;
  if (effect === sideCar.Effect) return;
  sideCar.Backend.setNativeMeshPartEffect(
    sideCar.Handle, effect == null ? null : resolveEffectHandleForInternalUse(effect),
  );
  sideCar.Effect = effect;
  if (effect != null) {
    trackEffectReleaseForInternalUse(effect, () => {
      if (sideCar.Released || sideCar.Effect !== effect) return;
      sideCar.Backend.setNativeMeshPartEffect(sideCar.Handle, null);
      sideCar.Effect = null;
    });
  }
}

/**
 * The native view of a managed part, created on first use and the same object thereafter.
 *
 * Refuses a part with no geometry rather than handing CNA a half-built one: `cna_model_mesh_part_
 * create` accepts absent buffers, but every consumer of the result requires both, so failing here
 * names the real problem instead of deferring it to a renderer.
 */
export function acquireNativeMeshPartForInternalUse(part: ModelMeshPart): NativeHandle {
  const existing = sideCars.get(part);
  if (existing != null && !existing.Released) {
    syncEffect(existing);
    return existing.Handle;
  }

  const vertexBuffer = part.VertexBuffer;
  const indexBuffer = part.IndexBuffer;
  if (vertexBuffer == null || indexBuffer == null) {
    throw new InvalidOperationException(
      "a native view of a ModelMeshPart needs both its vertex and its index buffer",
    );
  }
  if (vertexBuffer.IsDisposed || indexBuffer.IsDisposed) {
    throw new ObjectDisposedException("ModelMeshPart");
  }

  const backend = backendOrRefuse();
  const vertexHandle = resolveVertexBufferHandleForInternalUse(vertexBuffer);
  const indexHandle = resolveIndexBufferHandleForInternalUse(indexBuffer);
  const handle = backend.createNativeMeshPart(
    vertexHandle, indexHandle,
    part.NumVertices, part.PrimitiveCount, part.StartIndex, part.VertexOffset,
  );

  // Fail fast rather than trust: an upstream change that stopped preserving one of these would
  // otherwise show up much later as geometry drawn from the wrong offset.
  const mismatch = describeMismatch(backend, handle, part, vertexHandle, indexHandle);
  if (mismatch != null) {
    backend.destroyNativeMeshPart(handle);
    throw new InvalidOperationException(
      `CNA's native mesh part does not mirror the managed one: ${mismatch}`,
    );
  }

  const sideCar: SideCar = {
    Part: part, Handle: handle, Backend: backend, Effect: null, Released: false,
  };
  sideCars.set(part, sideCar);
  partsByHandle.set(handle.toString(), part);
  teardowns.set(sideCar, [
    trackVertexBufferReleaseForInternalUse(vertexBuffer, () => releaseSideCar(sideCar)),
    trackIndexBufferReleaseForInternalUse(indexBuffer, () => releaseSideCar(sideCar)),
  ]);
  syncEffect(sideCar);
  return handle;
}

function describeMismatch(
  backend: CnaNativeMeshPartBackend,
  handle: NativeHandle,
  part: ModelMeshPart,
  vertexHandle: NativeHandle,
  indexHandle: NativeHandle,
): string | null {
  const checks: readonly (readonly [string, number, number])[] = [
    ["NumVertices", part.NumVertices, backend.getNativeMeshPartNumVertices(handle)],
    ["PrimitiveCount", part.PrimitiveCount, backend.getNativeMeshPartPrimitiveCount(handle)],
    ["StartIndex", part.StartIndex, backend.getNativeMeshPartStartIndex(handle)],
    ["VertexOffset", part.VertexOffset, backend.getNativeMeshPartVertexOffset(handle)],
  ];
  for (const [name, managed, native] of checks) {
    if (managed !== native) return `${name} is ${native} natively and ${managed} here`;
  }
  if (backend.getNativeMeshPartVertexBuffer(handle) !== vertexHandle) {
    return "the native part does not share the managed vertex buffer";
  }
  if (backend.getNativeMeshPartIndexBuffer(handle) !== indexHandle) {
    return "the native part does not share the managed index buffer";
  }
  return null;
}

/**
 * The public part a native handle belongs to.
 *
 * `null` means *there is deliberately no part* — an empty group, or a level that draws nothing.
 * CNA spells both with `CNA_INVALID_HANDLE`, and translating that sentinel into `null` is the
 * bridge's job, done once at the boundary rather than again here; a zero reaching this function
 * is therefore a bridge defect, and is reported as one rather than quietly meaning "no part".
 *
 * A non-zero handle that resolves to nothing is a different thing again: a part that was borrowed
 * and has since been released because its buffers were disposed. Every projected borrower marks
 * itself unusable when that happens, so this is an invariant guard rather than a path a consumer
 * can reach — kept because answering "draws nothing" for freed geometry would be worse than
 * refusing.
 *
 * Only sound on routes documented to hand back a borrow, which is why this is internal.
 */
export function resolveMeshPartFromHandleForInternalUse(
  handle: NativeHandle | null,
): ModelMeshPart | null {
  if (handle == null) return null;
  const part = partsByHandle.get(handle.toString());
  if (part == null) {
    throw new ObjectDisposedException(
      "ModelMeshPart: the selected part's buffers have been disposed",
    );
  }
  return part;
}

/**
 * Registers a teardown that runs when a part's native view is released — which happens when
 * either of its buffers is disposed.
 *
 * The ordering is what makes this safe, and it holds by construction rather than by luck: a
 * dependent has to acquire the side-car before it can register, so its teardown is registered
 * *after* the side-car's own, and `NativeResourceLifetime` runs its callbacks in reverse
 * registration order. A dependent therefore always gives up its borrow before the part it
 * borrowed is destroyed — which matters because CNA's instanced renderer dereferences the part
 * when it draws.
 */
export function trackMeshPartDependentForInternalUse(
  part: ModelMeshPart,
  teardown: () => void,
): void {
  const sideCar = sideCars.get(part);
  if (sideCar == null || sideCar.Released) {
    throw new InvalidOperationException("the ModelMeshPart has no native view to depend on");
  }
  const vertexBuffer = part.VertexBuffer;
  const indexBuffer = part.IndexBuffer;
  if (vertexBuffer == null || indexBuffer == null) {
    throw new InvalidOperationException("the ModelMeshPart has no buffers");
  }
  // Both buffers get the teardown, because either one going takes the side-car with it; running
  // it once is what the caller means.
  let done = false;
  const once = (): void => { if (done) return; done = true; teardown(); };
  trackVertexBufferReleaseForInternalUse(vertexBuffer, once);
  trackIndexBufferReleaseForInternalUse(indexBuffer, once);
}

/** The device a part's geometry belongs to; XNA's `ModelMeshPart` does not expose one itself. */
export function meshPartGraphicsDeviceForInternalUse(part: ModelMeshPart): GraphicsDevice {
  const vertexBuffer = part.VertexBuffer;
  if (vertexBuffer == null) {
    throw new InvalidOperationException("the ModelMeshPart has no vertex buffer");
  }
  return vertexBuffer.GraphicsDevice;
}

/** What CNA holds for a part, read back from CNA rather than echoed from the managed side. */
export function describeNativeMeshPartForInternalUse(
  part: ModelMeshPart,
): NativeMeshPartDescription {
  const handle = acquireNativeMeshPartForInternalUse(part);
  const backend = backendOrRefuse();
  const vertexBuffer = part.VertexBuffer;
  const indexBuffer = part.IndexBuffer;
  const nativeVertex = backend.getNativeMeshPartVertexBuffer(handle);
  const nativeIndex = backend.getNativeMeshPartIndexBuffer(handle);
  return Object.freeze({
    NumVertices: backend.getNativeMeshPartNumVertices(handle),
    PrimitiveCount: backend.getNativeMeshPartPrimitiveCount(handle),
    StartIndex: backend.getNativeMeshPartStartIndex(handle),
    VertexOffset: backend.getNativeMeshPartVertexOffset(handle),
    HasVertexBuffer: nativeVertex != null,
    HasIndexBuffer: nativeIndex != null,
    HasEffect: backend.getNativeMeshPartEffect(handle) != null,
    SharesManagedBuffers:
      vertexBuffer != null && indexBuffer != null &&
      nativeVertex === resolveVertexBufferHandleForInternalUse(vertexBuffer) &&
      nativeIndex === resolveIndexBufferHandleForInternalUse(indexBuffer),
  });
}
