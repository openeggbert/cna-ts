/**
 * The state a `GraphicsDevice` owns, held here rather than in `GraphicsDevice.ts`.
 *
 * ## Why this module exists
 *
 * A graphics resource needs three things from the device it was made on: its native handle, its
 * backend, and the lifetime its own handle hangs off. It also has to tell the device when it is
 * created and destroyed, because `GraphicsDevice.ResourceCreated` and `ResourceDestroyed` are XNA
 * events a game can subscribe to. Every one of those is a read or a write of *device state*, and
 * none of them needs the `GraphicsDevice` **class**.
 *
 * When those accessors lived in `GraphicsDevice.ts` they made every resource module import it as a
 * value, and that closed a module cycle:
 *
 * ```text
 *   GraphicsDevice -> RenderTargets -> Texture2D  -> GraphicsDevice
 *   GraphicsDevice -> RenderTargets -> TextureCube -> GraphicsDevice
 *   GraphicsDevice -> RenderTargetBinding -> TextureCube -> GraphicsDevice
 *   GraphicsDevice -> IndexBuffer  -> GraphicsDevice
 *   GraphicsDevice -> VertexBuffer -> GraphicsDevice
 * ```
 *
 * A cycle is only a hazard when a module *reads* one of its bindings while a module it is in a
 * cycle with is still initialising, and this one did: `class RenderTarget2D extends Texture2D` and
 * `class RenderTargetCube extends TextureCube` are extends-clauses, which run at module scope.
 * Entered at `GraphicsDevice` the graph evaluated cleanly, because the resource modules only ever
 * *call* the accessors, from inside methods. Entered at `Texture2D` or `TextureCube` it did not:
 * `RenderTargets` reached the extends-clause with the base class still in its temporal dead zone
 * and threw `ReferenceError: Cannot access 'Texture2D' before initialization`.
 *
 * That is not a hypothetical. Two published subpaths — `cna-ts/extensions/devices` and
 * `cna-ts/extensions/input` — entered the graph at `Texture2D` and crashed when they were a
 * consumer's first import.
 *
 * ## The invariant that keeps it fixed
 *
 * **This module imports no graphics class as a value.** `GraphicsDevice`, the textures and the
 * render targets are all `import type` here, so nothing above it in the graphics graph is on its
 * initialisation path and it can never be a cycle's back-edge. `tools/verify-module-cycles.mjs`
 * enforces that as a source-level rule, and cold-imports every built module to prove the graph as
 * a whole is safe from every entry point rather than only from the barrel.
 *
 * The one runtime dependency it does take is `ResourceEventArgs`, whose own imports are the two
 * exception modules and `EventArgs` — none of which import anything at all.
 *
 * ## What it does not own
 *
 * State a `GraphicsDevice` never shares stays with the class: the lifetime of a device the class
 * created itself is released by its own `Dispose` and is consulted from nowhere else. The four
 * `*SnapshotForInternalUse` functions stay there too — they serialise a `BlendState` or a
 * `SamplerState`, which is not device state, and putting them here would make this a bag rather
 * than a registry.
 */

import type { CnaBackend } from "./backend.js";
import type { EventDispatcher } from "./events.js";
import { ObjectDisposedException } from "./exceptions.js";
import { NativeUnavailableError } from "./native-error.js";
import type { NativeHandle, NativeResourceLifetime } from "./ownership.js";
import type { Color } from "../Microsoft/Xna/Framework/Color.js";
import type { Rectangle } from "../Microsoft/Xna/Framework/Rectangle.js";
import type { BlendState } from "../Microsoft/Xna/Framework/Graphics/BlendState.js";
import type { DepthStencilState } from "../Microsoft/Xna/Framework/Graphics/DepthStencilState.js";
import type { GraphicsProfile } from "../Microsoft/Xna/Framework/Graphics/DeviceEnums.js";
import type { DisplayMode } from "../Microsoft/Xna/Framework/Graphics/DisplayMode.js";
import type { GraphicsAdapter } from "../Microsoft/Xna/Framework/Graphics/GraphicsAdapter.js";
import type { GraphicsDevice } from "../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import type { IndexBuffer } from "../Microsoft/Xna/Framework/Graphics/IndexBuffer.js";
import type { PresentationParameters } from "../Microsoft/Xna/Framework/Graphics/PresentationParameters.js";
import type { RasterizerState } from "../Microsoft/Xna/Framework/Graphics/RasterizerState.js";
import type { RenderTargetBinding } from "../Microsoft/Xna/Framework/Graphics/RenderTargetBinding.js";
import type {
  RenderTarget2D,
  RenderTargetCube,
} from "../Microsoft/Xna/Framework/Graphics/RenderTargets.js";
import {
  createResourceCreatedEventArgsForInternalUse,
  createResourceDestroyedEventArgsForInternalUse,
} from "../Microsoft/Xna/Framework/Graphics/ResourceEventArgs.js";
import type {
  ResourceCreatedEventArgs,
  ResourceDestroyedEventArgs,
} from "../Microsoft/Xna/Framework/Graphics/ResourceEventArgs.js";
import type { SamplerStateCollection } from "../Microsoft/Xna/Framework/Graphics/SamplerStateCollection.js";
import type { Texture } from "../Microsoft/Xna/Framework/Graphics/Texture.js";
import type { TextureCollection } from "../Microsoft/Xna/Framework/Graphics/TextureCollection.js";
import type { VertexBufferBinding } from "../Microsoft/Xna/Framework/Graphics/VertexBufferBinding.js";
import type { Viewport } from "../Microsoft/Xna/Framework/Graphics/Viewport.js";

/** What a device needs to be told about itself once, at construction. */
export type GraphicsDeviceInternalState = {
  readonly Backend: CnaBackend;
  readonly ResolveHandle: () => NativeHandle;
  readonly ParentLifetime: NativeResourceLifetime;
  readonly Adapter: GraphicsAdapter | null;
  readonly GraphicsProfile: GraphicsProfile;
  readonly PresentationParameters: PresentationParameters;
  readonly DisplayMode: DisplayMode | null;
};

/** That, plus everything the device mutates while it is alive. */
export type GraphicsDeviceState = GraphicsDeviceInternalState & {
  Disposed: boolean;
  BlendFactor: Color;
  BlendState: BlendState;
  DepthStencilState: DepthStencilState;
  Indices: IndexBuffer | null;
  MultiSampleMask: number;
  RasterizerState: RasterizerState;
  ReferenceStencil: number;
  ScissorRectangle: Rectangle;
  Viewport: Viewport;
  readonly SamplerStates: SamplerStateCollection;
  readonly Textures: TextureCollection;
  readonly VertexSamplerStates: SamplerStateCollection;
  readonly VertexTextures: TextureCollection;
  RenderTargets: RenderTargetBinding[];
  VertexBuffers: VertexBufferBinding[];
};

/**
 * Keyed by the device object, so an entry cannot outlive the device it describes and disposal has
 * no map to clean up. The entry deliberately survives `Dispose` with `Disposed: true` rather than
 * being deleted: `GraphicsDevice.IsDisposed` is answered from it, and a deleted entry would make a
 * disposed device report that it is not.
 */
const states = new WeakMap<GraphicsDevice, GraphicsDeviceState>();

const resourceCreatedDispatchers = new WeakMap<
GraphicsDevice,
EventDispatcher<unknown, ResourceCreatedEventArgs>
>();
const resourceDestroyedDispatchers = new WeakMap<
GraphicsDevice,
EventDispatcher<unknown, ResourceDestroyedEventArgs>
>();

let liveGraphicsDevice: GraphicsDevice | null = null;

/** Internal: records a device's state. Called once, from the device's own construction. */
export function registerGraphicsDeviceStateForInternalUse(
  device: GraphicsDevice,
  state: GraphicsDeviceState,
): void {
  states.set(device, state);
}

/** Internal: a device's state, or null when it was never constructed. Does not check disposal. */
export function graphicsDeviceStateOrNullForInternalUse(
  device: GraphicsDevice,
): GraphicsDeviceState | null {
  return states.get(device) ?? null;
}

/** Internal: a live device's state, refusing an unconstructed or a disposed one by name. */
export function graphicsDeviceStateForInternalUse(device: GraphicsDevice): GraphicsDeviceState {
  const state = states.get(device);
  if (!state) throw new NativeUnavailableError("GraphicsDevice construction requires a CNA device route");
  if (state.Disposed) throw new ObjectDisposedException("GraphicsDevice");
  return state;
}

/** Internal: attaches the dispatchers behind `ResourceCreated` and `ResourceDestroyed`. */
export function registerGraphicsDeviceDispatchersForInternalUse(
  device: GraphicsDevice,
  created: EventDispatcher<unknown, ResourceCreatedEventArgs>,
  destroyed: EventDispatcher<unknown, ResourceDestroyedEventArgs>,
): void {
  resourceCreatedDispatchers.set(device, created);
  resourceDestroyedDispatchers.set(device, destroyed);
}

export function resolveGraphicsDeviceHandleForInternalUse(device: GraphicsDevice): NativeHandle {
  const state = graphicsDeviceStateForInternalUse(device);
  return state.ResolveHandle();
}

export function graphicsDeviceParentLifetimeForInternalUse(
  device: GraphicsDevice,
): NativeResourceLifetime {
  return graphicsDeviceStateForInternalUse(device).ParentLifetime;
}

export function graphicsDeviceBackendForInternalUse(device: GraphicsDevice): CnaBackend {
  return graphicsDeviceStateForInternalUse(device).Backend;
}

export function isRenderTargetBoundForInternalUse(
  device: GraphicsDevice,
  target: RenderTarget2D | RenderTargetCube,
): boolean {
  const state = states.get(device);
  return state != null && !state.Disposed &&
    state.RenderTargets.some((binding) => binding.RenderTarget === target);
}

export function recordSpriteBatchStatesForInternalUse(
  device: GraphicsDevice,
  blend: BlendState,
  depth: DepthStencilState,
  rasterizer: RasterizerState,
): void {
  const state = graphicsDeviceStateForInternalUse(device);
  state.BlendState = blend;
  state.DepthStencilState = depth;
  state.RasterizerState = rasterizer;
}

export function notifyGraphicsResourceCreatedForInternalUse(
  device: GraphicsDevice,
  resource: Texture | object,
): void {
  graphicsDeviceStateForInternalUse(device);
  resourceCreatedDispatchers.get(device)?.Dispatch(
    device,
    createResourceCreatedEventArgsForInternalUse(resource),
  );
}

export function notifyGraphicsResourceDestroyedForInternalUse(
  device: GraphicsDevice,
  name: string,
  tag: unknown,
): void {
  if (device.IsDisposed) return;
  resourceDestroyedDispatchers.get(device)?.Dispatch(
    device,
    createResourceDestroyedEventArgsForInternalUse(name, tag),
  );
}

/**
 * The live device, or null when none has been created or the last one was disposed.
 *
 * This ABI creates exactly one game-owned device, so "the live one" is unambiguous rather than a
 * guess. A frame texture asked for with no live device refuses instead of inventing one.
 */
export function liveGraphicsDeviceForInternalUse(): GraphicsDevice | null {
  if (liveGraphicsDevice == null) return null;
  const state = states.get(liveGraphicsDevice);
  return state != null && !state.Disposed ? liveGraphicsDevice : null;
}

/** Internal: records the device a construction just produced as the live one. */
export function setLiveGraphicsDeviceForInternalUse(device: GraphicsDevice): void {
  liveGraphicsDevice = device;
}

/** Internal: forgets `device` if it is the live one, and does nothing if another has replaced it. */
export function clearLiveGraphicsDeviceForInternalUse(device: GraphicsDevice): void {
  if (liveGraphicsDevice === device) liveGraphicsDevice = null;
}
