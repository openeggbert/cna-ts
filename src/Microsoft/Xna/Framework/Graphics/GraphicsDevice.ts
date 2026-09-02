import type {
  BlendStateSnapshot,
  CnaBackend,
  CnaGraphicsBackend,
  DepthStencilStateSnapshot,
  RasterizerStateSnapshot,
  SamplerStateSnapshot,
} from "../../../../internal/backend.js";
import { EventDispatcher } from "../../../../internal/events.js";
import {
  ArgumentNullException,
  ArgumentException,
  ArgumentOutOfRangeException,
  InvalidOperationException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import { getBackend } from "../../../../internal/backend.js";
import {
  clearLiveGraphicsDeviceForInternalUse,
  graphicsDeviceStateForInternalUse as stateOf,
  graphicsDeviceStateOrNullForInternalUse,
  registerGraphicsDeviceDispatchersForInternalUse,
  registerGraphicsDeviceStateForInternalUse,
  setLiveGraphicsDeviceForInternalUse,
} from "../../../../internal/graphics-device-registry.js";
import type {
  GraphicsDeviceInternalState,
  GraphicsDeviceState,
} from "../../../../internal/graphics-device-registry.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime } from "../../../../internal/ownership.js";
import type { NativeHandle } from "../../../../internal/ownership.js";
import { resolveVertexCodec } from "../../../../internal/vertex-transfer.js";
import { Color } from "../Color.js";
import type { IDisposable, XnaEvent } from "../Contracts.js";
import { EventArgs } from "../EventArgs.js";
import { Rectangle } from "../Rectangle.js";
import { Vector4 } from "../Vector4.js";
import { BlendState } from "./BlendState.js";
import { DepthStencilState } from "./DepthStencilState.js";
import {
  ClearOptions,
  GraphicsDeviceStatus,
  GraphicsProfile,
} from "./DeviceEnums.js";
import type { DisplayMode } from "./DisplayMode.js";
import { defaultGraphicsAdapterOrNull, GraphicsAdapter } from "./GraphicsAdapter.js";
import {
  resolveIndexBufferHandleForInternalUse,
  type IndexBuffer,
} from "./IndexBuffer.js";
import type { IVertexType } from "./IVertexType.js";
import { PresentationParameters } from "./PresentationParameters.js";
import type { PrimitiveType } from "./VertexEnums.js";
import { RasterizerState } from "./RasterizerState.js";
import {
  RenderTarget2D,
  RenderTargetCube,
  resolveRenderTargetHandleForInternalUse,
} from "./RenderTargets.js";
import { RenderTargetBinding } from "./RenderTargetBinding.js";
import {
  createResourceCreatedEventArgsForInternalUse,
  createResourceDestroyedEventArgsForInternalUse,
  type ResourceCreatedEventArgs,
  type ResourceDestroyedEventArgs,
} from "./ResourceEventArgs.js";
import { SamplerState } from "./SamplerState.js";
import {
  createSamplerStateCollectionForInternalUse,
  type SamplerStateCollection,
} from "./SamplerStateCollection.js";
import {
  createTextureCollectionForInternalUse,
  type TextureCollection,
} from "./TextureCollection.js";
import { resolveTextureHandleForInternalUse, type Texture } from "./Texture.js";
import { CubeMapFace } from "./TextureEnums.js";
import {
  resolveVertexBufferHandleForInternalUse,
  type VertexBuffer,
} from "./VertexBuffer.js";
import { VertexBufferBinding } from "./VertexBufferBinding.js";
import { VertexDeclaration } from "./VertexDeclaration.js";
import { Viewport } from "./Viewport.js";
import {
  assertGraphicsResourceActiveForInternalUse,
  assertGraphicsResourceCompatibleForInternalUse,
} from "./GraphicsResource.js";
import {
  bindBlendStateForInternalUse,
} from "./BlendState.js";
import {
  bindDepthStencilStateForInternalUse,
} from "./DepthStencilState.js";
import {
  bindRasterizerStateForInternalUse,
} from "./RasterizerState.js";

/**
 * A device's state, its identity as the live device, and the accessors the rest of the graphics
 * layer reaches for all live in `internal/graphics-device-registry.ts`. Keeping them here made
 * every graphics resource module import this one as a value, which closed a module cycle that
 * crashed two published subpaths when a consumer imported them first; that module's own header
 * records the cycle and the rule that keeps it broken.
 */
export type { GraphicsDeviceInternalState } from "../../../../internal/graphics-device-registry.js";
type DeviceState = GraphicsDeviceState;

function unsupported(operation: string): never {
  throw new NativeUnavailableError(`${operation} is not in the loaded CNA-TS backend slice`);
}

function graphicsBackend(state: DeviceState, operation: string): CnaGraphicsBackend {
  const backend = state.Backend.Graphics;
  if (!backend) unsupported(operation);
  return backend;
}

function integer(value: number, name: string, minimum = 0): number {
  if (!Number.isInteger(value) || value < minimum || value > 0x7fff_ffff) {
    throw new ArgumentOutOfRangeException(name);
  }
  return value;
}

function primitiveVertexCount(primitiveType: PrimitiveType, primitiveCount: number): number {
  let result: number;
  switch (primitiveType) {
    case 0: result = primitiveCount * 3; break;
    case 1: result = primitiveCount + 2; break;
    case 2: result = primitiveCount * 2; break;
    case 3: result = primitiveCount + 1; break;
    default: throw new ArgumentOutOfRangeException("primitiveType");
  }
  if (result > 0x7fff_ffff) throw new ArgumentOutOfRangeException("primitiveCount");
  return result;
}

function userVertexDeclaration(
  vertices: readonly unknown[],
  vertexOffset: number,
  explicit: VertexDeclaration | undefined,
): VertexDeclaration {
  if (explicit !== undefined) {
    if (explicit == null) throw new ArgumentNullException("vertexDeclaration");
    if (!(explicit instanceof VertexDeclaration)) {
      throw new ArgumentException("vertexDeclaration must be a VertexDeclaration");
    }
    assertGraphicsResourceActiveForInternalUse(explicit);
    return explicit;
  }
  const candidate = vertices[vertexOffset] as { readonly VertexDeclaration?: unknown } | undefined;
  if (!(candidate?.VertexDeclaration instanceof VertexDeclaration)) {
    throw new ArgumentException(
      "vertexData must use a mapped built-in IVertexType or supply its exact VertexDeclaration",
    );
  }
  assertGraphicsResourceActiveForInternalUse(candidate.VertexDeclaration);
  return candidate.VertexDeclaration;
}

/** XNA graphics-device facade whose native handle is resolved only inside a valid CNA callback. */
export class GraphicsDevice implements IDisposable {
  readonly #deviceLost = new EventDispatcher<unknown, EventArgs>();
  readonly #deviceReset = new EventDispatcher<unknown, EventArgs>();
  readonly #deviceResetting = new EventDispatcher<unknown, EventArgs>();
  readonly #disposing = new EventDispatcher<unknown, EventArgs>();
  readonly #resourceCreated = new EventDispatcher<unknown, ResourceCreatedEventArgs>();
  readonly #resourceDestroyed = new EventDispatcher<unknown, ResourceDestroyedEventArgs>();

  public readonly DeviceLost: XnaEvent<unknown, EventArgs> = this.#deviceLost;
  public readonly DeviceReset: XnaEvent<unknown, EventArgs> = this.#deviceReset;
  public readonly DeviceResetting: XnaEvent<unknown, EventArgs> = this.#deviceResetting;
  public readonly Disposing: XnaEvent<unknown, EventArgs> = this.#disposing;
  public readonly ResourceCreated: XnaEvent<unknown, ResourceCreatedEventArgs> = this.#resourceCreated;
  public readonly ResourceDestroyed: XnaEvent<unknown, ResourceDestroyedEventArgs> = this.#resourceDestroyed;

  public constructor(
    adapter: GraphicsAdapter,
    graphicsProfile: GraphicsProfile,
    presentationParameters: PresentationParameters,
  );
  public constructor(
    adapter: GraphicsAdapter,
    graphicsProfile: GraphicsProfile,
    presentationParameters: PresentationParameters,
    internalState?: GraphicsDeviceInternalState,
  ) {
    if (internalState) {
      this.#initialise(internalState);
      return;
    }
    if (adapter == null) throw new ArgumentNullException("adapter");
    if (presentationParameters == null) throw new ArgumentNullException("presentationParameters");

    // XNA's public constructor: a device that belongs to no game. CNA's own route takes an adapter
    // *index* rather than an adapter, and indexes it the way its adapter enumeration reports -- so
    // the index is this adapter's position in that same list, not a number invented here.
    const backend = getBackend();
    if (!backend.IsAvailable || backend.createStandaloneGraphicsDevice == null ||
        backend.destroyStandaloneGraphicsDevice == null) {
      throw new NativeUnavailableError(
        `Direct GraphicsDevice construction requires a CNA standalone-device route: ${backend.Detail}`,
      );
    }
    const adapterIndex = GraphicsAdapter.Adapters.indexOf(adapter);
    if (adapterIndex < 0) {
      throw new ArgumentException("adapter is not one of GraphicsAdapter.Adapters");
    }
    const parameters = presentationParameters.Clone();
    const handle = backend.createStandaloneGraphicsDevice(adapterIndex, graphicsProfile, {
      BackBufferFormat: parameters.BackBufferFormat,
      BackBufferWidth: parameters.BackBufferWidth,
      BackBufferHeight: parameters.BackBufferHeight,
      DepthStencilFormat: parameters.DepthStencilFormat,
      MultiSampleCount: parameters.MultiSampleCount,
      PresentationInterval: parameters.PresentationInterval,
      DisplayOrientation: parameters.DisplayOrientation,
      RenderTargetUsage: parameters.RenderTargetUsage,
      IsFullScreen: parameters.IsFullScreen,
    });
    // Owned, not borrowed: this device's handle stays valid outside any callback, and releasing it
    // releases everything made on it -- which is CNA's documented rule for a caller-created device
    // and the reason its resources do not gate a game's destruction.
    const release = backend.destroyStandaloneGraphicsDevice.bind(backend);
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Release: (value) => release(value),
      Label: "caller-created GraphicsDevice",
    });
    ownedDeviceLifetimes.set(this, lifetime);
    this.#initialise({
      Backend: backend,
      ResolveHandle: () => lifetime.Handle,
      ParentLifetime: lifetime,
      Adapter: adapter,
      GraphicsProfile: graphicsProfile,
      PresentationParameters: parameters,
      DisplayMode: null,
    });
  }

  /**
   * Builds the device's state. Shared by both constructor branches so a device a manager made and
   * one a caller made differ only in where their handle comes from and who releases it.
   */
  #initialise(internalState: GraphicsDeviceInternalState): void {
    const viewport = new Viewport(internalState.PresentationParameters.Bounds);
    const samplerStates = createSamplerStateCollectionForInternalUse(
      this, 16, SamplerState.LinearWrap,
      (index, value) => this.#setSamplerState(0, index, value),
    );
    const textures = createTextureCollectionForInternalUse(
      this, 16, (index, value) => this.#setTexture(0, index, value),
    );
    const vertexSamplerStates = createSamplerStateCollectionForInternalUse(
      this, 4, SamplerState.LinearWrap,
      (index, value) => this.#setSamplerState(1, index, value),
    );
    const vertexTextures = createTextureCollectionForInternalUse(
      this, 4, (index, value) => this.#setTexture(1, index, value),
    );
    registerGraphicsDeviceStateForInternalUse(this, {
      ...internalState,
      PresentationParameters: internalState.PresentationParameters.Clone(),
      Disposed: false,
      BlendFactor: Color.White,
      BlendState: BlendState.Opaque,
      DepthStencilState: DepthStencilState.Default,
      Indices: null,
      MultiSampleMask: -1,
      RasterizerState: RasterizerState.CullCounterClockwise,
      ReferenceStencil: 0,
      ScissorRectangle: internalState.PresentationParameters.Bounds,
      Viewport: viewport,
      SamplerStates: samplerStates,
      Textures: textures,
      VertexSamplerStates: vertexSamplerStates,
      VertexTextures: vertexTextures,
      RenderTargets: [],
      VertexBuffers: [],
    });
    registerGraphicsDeviceDispatchersForInternalUse(
      this, this.#resourceCreated, this.#resourceDestroyed,
    );
  }

  public get Adapter(): GraphicsAdapter {
    // Falls back to the process-wide default, which CNA reads lazily through this device's own
    // handle: the adapter list cannot be built when the device is created, because CNA permits the
    // borrow only inside a lifecycle callback. A renderer with no displays still refuses by name.
    const adapter = stateOf(this).Adapter ?? defaultGraphicsAdapterOrNull();
    if (!adapter) throw new NativeUnavailableError("GraphicsDevice.Adapter requires CNA adapter discovery");
    return adapter;
  }
  public get BlendFactor(): Color {
    const value = stateOf(this).BlendFactor;
    return new Color(value.R, value.G, value.B, value.A);
  }
  public set BlendFactor(value: Color) {
    if (value == null) throw new ArgumentNullException("value");
    if (!(value instanceof Color)) throw new ArgumentException("value must be a Color");
    const state = stateOf(this);
    graphicsBackend(state, "GraphicsDevice.BlendFactor").setGraphicsDeviceBlendFactor(
      state.ResolveHandle(), value.PackedValue,
    );
    state.BlendFactor = new Color(value.R, value.G, value.B, value.A);
  }
  public get BlendState(): BlendState { return stateOf(this).BlendState; }
  public set BlendState(value: BlendState) {
    if (value == null) throw new ArgumentNullException("value");
    assertGraphicsResourceCompatibleForInternalUse(value, this);
    const state = stateOf(this);
    graphicsBackend(state, "GraphicsDevice.BlendState").setGraphicsDeviceBlendState(
      state.ResolveHandle(), blendStateSnapshotForInternalUse(value),
    );
    bindBlendStateForInternalUse(value, this);
    state.BlendState = value;
  }
  public get DepthStencilState(): DepthStencilState { return stateOf(this).DepthStencilState; }
  public set DepthStencilState(value: DepthStencilState) {
    if (value == null) throw new ArgumentNullException("value");
    assertGraphicsResourceCompatibleForInternalUse(value, this);
    const state = stateOf(this);
    graphicsBackend(state, "GraphicsDevice.DepthStencilState").setGraphicsDeviceDepthStencilState(
      state.ResolveHandle(), depthStencilStateSnapshotForInternalUse(value),
    );
    bindDepthStencilStateForInternalUse(value, this);
    state.DepthStencilState = value;
  }
  public get DisplayMode(): DisplayMode {
    const mode = stateOf(this).DisplayMode;
    if (!mode) throw new NativeUnavailableError("GraphicsDevice.DisplayMode requires CNA display-mode discovery");
    return mode;
  }
  public get GraphicsDeviceStatus(): GraphicsDeviceStatus {
    const state = stateOf(this);
    return graphicsBackend(state, "GraphicsDevice.GraphicsDeviceStatus").getGraphicsDeviceStatus(
      state.ResolveHandle(),
    ) as GraphicsDeviceStatus;
  }
  public get GraphicsProfile(): GraphicsProfile { return stateOf(this).GraphicsProfile; }
  public get Indices(): IndexBuffer {
    const state = stateOf(this);
    if (state.Indices?.IsDisposed) state.Indices = null;
    return state.Indices as IndexBuffer;
  }
  public set Indices(value: IndexBuffer) {
    const state = stateOf(this);
    if (value != null) {
      assertGraphicsResourceActiveForInternalUse(value);
      if (value.GraphicsDevice !== this) {
        throw new InvalidOperationException("The IndexBuffer belongs to a different GraphicsDevice");
      }
    }
    graphicsBackend(state, "GraphicsDevice.Indices").setGraphicsDeviceIndexBuffer(
      state.ResolveHandle(), value == null ? null : resolveIndexBufferHandleForInternalUse(value),
    );
    state.Indices = value ?? null;
  }
  public get IsDisposed(): boolean { return graphicsDeviceStateOrNullForInternalUse(this)?.Disposed ?? false; }
  public get MultiSampleMask(): number { return stateOf(this).MultiSampleMask; }
  public set MultiSampleMask(value: number) {
    if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
      throw new ArgumentOutOfRangeException("value");
    }
    const state = stateOf(this);
    graphicsBackend(state, "GraphicsDevice.MultiSampleMask").setGraphicsDeviceMultiSampleMask(
      state.ResolveHandle(), value,
    );
    state.MultiSampleMask = value;
  }
  public get PresentationParameters(): PresentationParameters { return stateOf(this).PresentationParameters.Clone(); }
  public get RasterizerState(): RasterizerState { return stateOf(this).RasterizerState; }
  public set RasterizerState(value: RasterizerState) {
    if (value == null) throw new ArgumentNullException("value");
    assertGraphicsResourceCompatibleForInternalUse(value, this);
    const state = stateOf(this);
    graphicsBackend(state, "GraphicsDevice.RasterizerState").setGraphicsDeviceRasterizerState(
      state.ResolveHandle(), rasterizerStateSnapshotForInternalUse(value),
    );
    bindRasterizerStateForInternalUse(value, this);
    state.RasterizerState = value;
  }
  public get ReferenceStencil(): number { return stateOf(this).ReferenceStencil; }
  public set ReferenceStencil(value: number) {
    if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
      throw new ArgumentOutOfRangeException("value");
    }
    const state = stateOf(this);
    graphicsBackend(state, "GraphicsDevice.ReferenceStencil").setGraphicsDeviceReferenceStencil(
      state.ResolveHandle(), value,
    );
    state.ReferenceStencil = value;
  }
  public get SamplerStates(): SamplerStateCollection { return stateOf(this).SamplerStates; }
  public get ScissorRectangle(): Rectangle {
    const value = stateOf(this).ScissorRectangle;
    return new Rectangle(value.X, value.Y, value.Width, value.Height);
  }
  public set ScissorRectangle(value: Rectangle) {
    if (value == null) throw new ArgumentNullException("value");
    if (!(value instanceof Rectangle) ||
        ![value.X, value.Y, value.Width, value.Height].every(Number.isInteger)) {
      throw new ArgumentException("value must be an integer Rectangle");
    }
    const state = stateOf(this);
    graphicsBackend(state, "GraphicsDevice.ScissorRectangle").setGraphicsDeviceScissorRectangle(
      state.ResolveHandle(), value.X, value.Y, value.Width, value.Height,
    );
    state.ScissorRectangle = new Rectangle(value.X, value.Y, value.Width, value.Height);
  }
  public get Textures(): TextureCollection { return stateOf(this).Textures; }
  public get VertexSamplerStates(): SamplerStateCollection { return stateOf(this).VertexSamplerStates; }
  public get VertexTextures(): TextureCollection { return stateOf(this).VertexTextures; }
  public get Viewport(): Viewport {
    const value = stateOf(this).Viewport;
    const result = new Viewport(value.Bounds);
    result.MinDepth = value.MinDepth;
    result.MaxDepth = value.MaxDepth;
    return result;
  }
  public set Viewport(value: Viewport) {
    if (value == null) throw new ArgumentNullException("value");
    if (!(value instanceof Viewport) || !Number.isFinite(value.MinDepth) || !Number.isFinite(value.MaxDepth)) {
      throw new ArgumentException("value must be a finite Viewport");
    }
    const bounds = value.Bounds;
    const state = stateOf(this);
    graphicsBackend(state, "GraphicsDevice.Viewport").setGraphicsDeviceViewport(
      state.ResolveHandle(), bounds.X, bounds.Y, bounds.Width, bounds.Height,
      value.MinDepth, value.MaxDepth,
    );
    const snapshot = new Viewport(bounds);
    snapshot.MinDepth = value.MinDepth;
    snapshot.MaxDepth = value.MaxDepth;
    state.Viewport = snapshot;
  }

  public Clear(color: Color): void;
  public Clear(options: ClearOptions, color: Color, depth: number, stencil: number): void;
  public Clear(options: ClearOptions, color: Vector4, depth: number, stencil: number): void;
  public Clear(
    optionsOrColor: ClearOptions | Color,
    color?: Color | Vector4,
    depth = 1,
    stencil = 0,
  ): void {
    const state = stateOf(this);
    let target: Color;
    if (optionsOrColor instanceof Color) {
      target = optionsOrColor;
    } else {
      if (optionsOrColor !== ClearOptions.Target) {
        void depth; void stencil;
        unsupported("GraphicsDevice.Clear depth/stencil options");
      }
      if (color == null) throw new ArgumentNullException("color");
      target = color instanceof Vector4 ? new Color(color) : color;
    }
    state.Backend.clearGraphicsDevice(state.ResolveHandle(), target.PackedValue);
  }

  public Dispose(): void {
    const state = graphicsDeviceStateOrNullForInternalUse(this);
    if (!state || state.Disposed) return;
    if (state.RenderTargets.length > 0) {
      graphicsBackend(state, "GraphicsDevice.Dispose render-target unbind")
        .setGraphicsDeviceRenderTargets(state.ResolveHandle(), []);
      state.RenderTargets = [];
    }
    this.#disposing.Dispatch(this, EventArgs.Empty);
    state.Disposed = true;
    clearLiveGraphicsDeviceForInternalUse(this);
    // A device this object created is this object's to release, and releasing it releases every
    // resource made on it. A device a GraphicsDeviceManager made is not: that one belongs to the
    // manager, and disposing it here would free a handle the manager still holds.
    const owned = ownedDeviceLifetimes.get(this);
    if (owned) {
      ownedDeviceLifetimes.delete(this);
      owned.Dispose();
    }
  }

  public DrawIndexedPrimitives(
    primitiveType: PrimitiveType, baseVertex: number, minVertexIndex: number,
    numVertices: number, startIndex: number, primitiveCount: number,
  ): void {
    const state = stateOf(this);
    integer(baseVertex, "baseVertex", -0x8000_0000);
    minVertexIndex = integer(minVertexIndex, "minVertexIndex");
    numVertices = integer(numVertices, "numVertices", 1);
    startIndex = integer(startIndex, "startIndex");
    primitiveCount = integer(primitiveCount, "primitiveCount", 1);
    const requiredIndices = primitiveVertexCount(primitiveType, primitiveCount);
    const vertices = this.#activeVertexBindings();
    const indices = state.Indices;
    if (vertices.length === 0) throw new InvalidOperationException("No VertexBuffer is bound");
    if (!indices || indices.IsDisposed) throw new InvalidOperationException("No active IndexBuffer is bound");
    if (startIndex > indices.IndexCount - requiredIndices) {
      throw new ArgumentException("the indexed primitive range exceeds the IndexBuffer");
    }
    if (minVertexIndex > vertices[0].VertexBuffer.VertexCount - numVertices ||
        baseVertex + minVertexIndex < 0) {
      throw new ArgumentException("the indexed vertex range exceeds the VertexBuffer");
    }
    graphicsBackend(state, "GraphicsDevice.DrawIndexedPrimitives").drawIndexedPrimitives(
      state.ResolveHandle(), primitiveType, baseVertex, minVertexIndex,
      numVertices, startIndex, primitiveCount,
    );
  }

  public DrawInstancedPrimitives(
    primitiveType: PrimitiveType, baseVertex: number, minVertexIndex: number, numVertices: number,
    startIndex: number, primitiveCount: number, instanceCount: number,
  ): void {
    const state = stateOf(this);
    integer(baseVertex, "baseVertex", -0x8000_0000);
    minVertexIndex = integer(minVertexIndex, "minVertexIndex");
    numVertices = integer(numVertices, "numVertices", 1);
    startIndex = integer(startIndex, "startIndex");
    primitiveCount = integer(primitiveCount, "primitiveCount", 1);
    instanceCount = integer(instanceCount, "instanceCount", 1);
    const requiredIndices = primitiveVertexCount(primitiveType, primitiveCount);
    const vertices = this.#activeVertexBindings();
    const indices = state.Indices;
    if (vertices.length === 0) throw new InvalidOperationException("No VertexBuffer is bound");
    if (!indices || indices.IsDisposed) throw new InvalidOperationException("No active IndexBuffer is bound");
    if (startIndex > indices.IndexCount - requiredIndices) {
      throw new ArgumentException("the indexed primitive range exceeds the IndexBuffer");
    }
    if (minVertexIndex > vertices[0].VertexBuffer.VertexCount - numVertices ||
        baseVertex + minVertexIndex < 0) {
      throw new ArgumentException("the indexed vertex range exceeds the VertexBuffer");
    }
    graphicsBackend(state, "GraphicsDevice.DrawInstancedPrimitives").drawInstancedPrimitives(
      state.ResolveHandle(), primitiveType, baseVertex, minVertexIndex, numVertices,
      startIndex, primitiveCount, instanceCount,
    );
  }

  public DrawPrimitives(primitiveType: PrimitiveType, startVertex: number, primitiveCount: number): void {
    const state = stateOf(this);
    startVertex = integer(startVertex, "startVertex");
    primitiveCount = integer(primitiveCount, "primitiveCount", 1);
    const required = primitiveVertexCount(primitiveType, primitiveCount);
    const bindings = this.#activeVertexBindings();
    if (bindings.length === 0) throw new InvalidOperationException("No VertexBuffer is bound");
    const first = bindings[0];
    if (first.VertexOffset + startVertex > first.VertexBuffer.VertexCount - required) {
      throw new ArgumentException("the primitive range exceeds the VertexBuffer");
    }
    graphicsBackend(state, "GraphicsDevice.DrawPrimitives").drawPrimitives(
      state.ResolveHandle(), primitiveType, startVertex, primitiveCount,
    );
  }

  public DrawUserIndexedPrimitives<T extends IVertexType>(
    primitiveType: PrimitiveType, vertexData: T[], vertexOffset: number, numVertices: number,
    indexData: number[], indexOffset: number, primitiveCount: number,
  ): void;
  public DrawUserIndexedPrimitives<T>(
    primitiveType: PrimitiveType, vertexData: T[], vertexOffset: number, numVertices: number,
    indexData: number[], indexOffset: number, primitiveCount: number, vertexDeclaration: VertexDeclaration,
  ): void;
  public DrawUserIndexedPrimitives<T>(
    primitiveType: PrimitiveType, vertexData: T[], vertexOffset: number, numVertices: number,
    indexData: number[], indexOffset: number, primitiveCount: number, vertexDeclaration?: VertexDeclaration,
  ): void {
    const state = stateOf(this);
    if (vertexData == null) throw new ArgumentNullException("vertexData");
    if (indexData == null) throw new ArgumentNullException("indexData");
    if (!Array.isArray(vertexData)) throw new ArgumentException("vertexData must be an array");
    if (!Array.isArray(indexData)) throw new ArgumentException("indexData must be an array");
    vertexOffset = integer(vertexOffset, "vertexOffset");
    numVertices = integer(numVertices, "numVertices", 1);
    indexOffset = integer(indexOffset, "indexOffset");
    primitiveCount = integer(primitiveCount, "primitiveCount", 1);
    const requiredIndices = primitiveVertexCount(primitiveType, primitiveCount);
    if (vertexOffset > vertexData.length - numVertices) {
      throw new ArgumentException("the user vertex range exceeds vertexData");
    }
    if (indexOffset > indexData.length - requiredIndices) {
      throw new ArgumentException("the user index range exceeds indexData");
    }
    const declaration = userVertexDeclaration(vertexData, vertexOffset, vertexDeclaration);
    const codec = resolveVertexCodec(vertexData, declaration, vertexOffset, numVertices);
    const vertexBytes = codec.encode(vertexData, vertexOffset, numVertices, true);
    const indexBytes = new Uint8Array(indexData.length * 4);
    const indexView = new DataView(indexBytes.buffer);
    for (let index = 0; index < indexData.length; index += 1) {
      const value = indexData[index];
      if (!Number.isInteger(value) || value < 0 || value > 0x7fff_ffff) {
        throw new ArgumentException(`indexData[${index}] is not a non-negative Int32 index`);
      }
      indexView.setUint32(index * 4, value, true);
    }
    for (let index = indexOffset; index < indexOffset + requiredIndices; index += 1) {
      if (indexData[index] >= numVertices) {
        throw new ArgumentException("an index references a vertex outside numVertices");
      }
    }
    graphicsBackend(state, "GraphicsDevice.DrawUserIndexedPrimitives")
      .drawUserIndexedPrimitives(
        state.ResolveHandle(), primitiveType, codec.UserSource, vertexBytes,
        codec.Stride, vertexData.length, vertexOffset, numVertices, primitiveCount,
        vertexDeclaration ? declaration.GetVertexElements() : null,
        indexBytes, 1, indexData.length, indexOffset,
      );
  }

  public DrawUserPrimitives<T extends IVertexType>(
    primitiveType: PrimitiveType, vertexData: T[], vertexOffset: number, primitiveCount: number,
  ): void;
  public DrawUserPrimitives<T>(
    primitiveType: PrimitiveType, vertexData: T[], vertexOffset: number, primitiveCount: number,
    vertexDeclaration: VertexDeclaration,
  ): void;
  public DrawUserPrimitives<T>(
    primitiveType: PrimitiveType, vertexData: T[], vertexOffset: number, primitiveCount: number,
    vertexDeclaration?: VertexDeclaration,
  ): void {
    const state = stateOf(this);
    if (vertexData == null) throw new ArgumentNullException("vertexData");
    if (!Array.isArray(vertexData)) throw new ArgumentException("vertexData must be an array");
    vertexOffset = integer(vertexOffset, "vertexOffset");
    primitiveCount = integer(primitiveCount, "primitiveCount", 1);
    const requiredVertices = primitiveVertexCount(primitiveType, primitiveCount);
    if (vertexOffset > vertexData.length - requiredVertices) {
      throw new ArgumentException("the user primitive range exceeds vertexData");
    }
    const declaration = userVertexDeclaration(vertexData, vertexOffset, vertexDeclaration);
    const codec = resolveVertexCodec(vertexData, declaration, vertexOffset, requiredVertices);
    const bytes = codec.encode(vertexData, vertexOffset, requiredVertices, true);
    graphicsBackend(state, "GraphicsDevice.DrawUserPrimitives").drawUserPrimitives(
      state.ResolveHandle(), primitiveType, codec.UserSource, bytes,
      codec.Stride, vertexData.length, vertexOffset, requiredVertices, primitiveCount,
      vertexDeclaration ? declaration.GetVertexElements() : null,
    );
  }

  public GetBackBufferData<T>(data: T[]): void;
  public GetBackBufferData<T>(data: T[], startIndex: number, elementCount: number): void;
  public GetBackBufferData<T>(rect: Rectangle | null, data: T[], startIndex: number, elementCount: number): void;
  public GetBackBufferData<T>(
    rectOrData: Rectangle | null | T[], dataOrStart?: T[] | number,
    startOrCount?: number, elementCount?: number,
  ): void {
    void [rectOrData, dataOrStart, startOrCount, elementCount]; stateOf(this);
    unsupported("GraphicsDevice.GetBackBufferData");
  }

  public GetRenderTargets(): RenderTargetBinding[] { return [...stateOf(this).RenderTargets]; }
  public GetVertexBuffers(): VertexBufferBinding[] { return [...this.#activeVertexBindings()]; }

  public Present(): void;
  public Present(sourceRectangle: Rectangle | null, destinationRectangle: Rectangle | null, overrideWindowHandle: bigint): void;
  public Present(
    sourceRectangle?: Rectangle | null,
    destinationRectangle?: Rectangle | null,
    overrideWindowHandle?: bigint,
  ): void {
    const state = stateOf(this);
    if (sourceRectangle !== undefined || destinationRectangle !== undefined || overrideWindowHandle !== undefined) {
      unsupported("GraphicsDevice.Present rectangle/window override");
    }
    state.Backend.presentGraphicsDevice(state.ResolveHandle());
  }

  public Reset(): void;
  public Reset(presentationParameters: PresentationParameters): void;
  public Reset(presentationParameters: PresentationParameters, graphicsAdapter: GraphicsAdapter): void;
  public Reset(presentationParameters?: PresentationParameters, graphicsAdapter?: GraphicsAdapter): void {
    void [presentationParameters, graphicsAdapter]; stateOf(this); unsupported("GraphicsDevice.Reset");
  }

  public SetRenderTarget(renderTarget: RenderTarget2D): void;
  public SetRenderTarget(renderTarget: RenderTargetCube, cubeMapFace: CubeMapFace): void;
  public SetRenderTarget(renderTarget: RenderTarget2D | RenderTargetCube, cubeMapFace?: CubeMapFace): void {
    if (renderTarget == null) {
      this.SetRenderTargets([]);
      return;
    }
    if (!(renderTarget instanceof RenderTarget2D) && !(renderTarget instanceof RenderTargetCube)) {
      throw new ArgumentException("renderTarget must be a RenderTarget2D, RenderTargetCube, or null");
    }
    if (renderTarget instanceof RenderTarget2D && cubeMapFace != null &&
        cubeMapFace !== CubeMapFace.PositiveX) {
      throw new ArgumentOutOfRangeException("cubeMapFace");
    }
    this.SetRenderTargets([
      renderTarget instanceof RenderTargetCube
        ? new RenderTargetBinding(renderTarget, cubeMapFace ?? CubeMapFace.PositiveX)
        : new RenderTargetBinding(renderTarget),
    ]);
  }
  public SetRenderTargets(renderTargets: RenderTargetBinding[]): void {
    if (renderTargets == null) throw new ArgumentNullException("renderTargets");
    if (!Array.isArray(renderTargets)) throw new ArgumentException("renderTargets must be an array");
    const state = stateOf(this);
    const seen = new Set<NativeHandle>();
    const snapshots = renderTargets.map((binding, index) => {
      if (!(binding instanceof RenderTargetBinding)) {
        throw new ArgumentException(`renderTargets[${index}] is not a RenderTargetBinding`);
      }
      const target = binding.RenderTarget;
      if (!(target instanceof RenderTarget2D) && !(target instanceof RenderTargetCube)) {
        throw new ArgumentException(`renderTargets[${index}] does not contain a render target`);
      }
      assertGraphicsResourceCompatibleForInternalUse(target, this);
      const handle = resolveRenderTargetHandleForInternalUse(target);
      if (seen.has(handle)) throw new ArgumentException("A render target cannot be bound more than once");
      seen.add(handle);
      return {
        RenderTarget: handle,
        ArraySlice: 0,
        CubeMapFace: target instanceof RenderTargetCube
          ? binding.CubeMapFace
          : CubeMapFace.PositiveX,
      };
    });
    graphicsBackend(state, "GraphicsDevice.SetRenderTargets")
      .setGraphicsDeviceRenderTargets(state.ResolveHandle(), snapshots);
    state.RenderTargets = renderTargets.map((binding) => binding.RenderTarget instanceof RenderTargetCube
      ? new RenderTargetBinding(binding.RenderTarget, binding.CubeMapFace)
      : new RenderTargetBinding(binding.RenderTarget as RenderTarget2D));
  }
  public SetVertexBuffer(vertexBuffer: VertexBuffer): void;
  public SetVertexBuffer(vertexBuffer: VertexBuffer, vertexOffset: number): void;
  public SetVertexBuffer(vertexBuffer: VertexBuffer, vertexOffset?: number): void {
    if (vertexBuffer == null) {
      this.SetVertexBuffers([]);
      return;
    }
    this.SetVertexBuffers([
      new (VertexBufferBinding as unknown as new (
        buffer: VertexBuffer, offset: number, frequency: number,
      ) => VertexBufferBinding)(vertexBuffer, vertexOffset ?? 0, 0),
    ]);
  }
  public SetVertexBuffers(vertexBuffers: VertexBufferBinding[]): void {
    if (vertexBuffers == null) throw new ArgumentNullException("vertexBuffers");
    if (!Array.isArray(vertexBuffers)) throw new ArgumentException("vertexBuffers must be an array");
    const state = stateOf(this);
    const snapshot = vertexBuffers.map((binding, index) => {
      if (binding == null) throw new ArgumentNullException(`vertexBuffers[${index}]`);
      const buffer = binding.VertexBuffer;
      assertGraphicsResourceActiveForInternalUse(buffer);
      if (buffer.GraphicsDevice !== this) {
        throw new InvalidOperationException("A VertexBuffer belongs to a different GraphicsDevice");
      }
      if (binding.VertexOffset > buffer.VertexCount) {
        throw new ArgumentException("A vertex-buffer offset exceeds its buffer capacity");
      }
      return {
        VertexBuffer: resolveVertexBufferHandleForInternalUse(buffer),
        VertexOffset: binding.VertexOffset,
        InstanceFrequency: binding.InstanceFrequency,
      };
    });
    graphicsBackend(state, "GraphicsDevice.SetVertexBuffers").setGraphicsDeviceVertexBuffers(
      state.ResolveHandle(), snapshot,
    );
    state.VertexBuffers = [...vertexBuffers];
  }

  #setSamplerState(shaderStage: number, index: number, value: SamplerState): void {
    assertGraphicsResourceActiveForInternalUse(value);
    const state = stateOf(this);
    graphicsBackend(state, "GraphicsDevice sampler state binding").setGraphicsDeviceSamplerState(
      state.ResolveHandle(), shaderStage, index, samplerStateSnapshotForInternalUse(value),
    );
  }

  #setTexture(shaderStage: number, index: number, value: Texture | null): void {
    const state = stateOf(this);
    let handle: NativeHandle | null = null;
    if (value != null) {
      assertGraphicsResourceActiveForInternalUse(value);
      if (value.GraphicsDevice !== this) {
        throw new InvalidOperationException("The Texture belongs to a different GraphicsDevice");
      }
      handle = resolveTextureHandleForInternalUse(value);
    }
    graphicsBackend(state, "GraphicsDevice texture binding").setGraphicsDeviceTexture(
      state.ResolveHandle(), shaderStage, index, handle,
    );
  }

  #activeVertexBindings(): VertexBufferBinding[] {
    const state = stateOf(this);
    if (state.VertexBuffers.some((binding) => binding.VertexBuffer.IsDisposed)) {
      state.VertexBuffers = state.VertexBuffers.filter((binding) => !binding.VertexBuffer.IsDisposed);
    }
    return state.VertexBuffers;
  }

}

/**
 * The live device, for the one object that has no way to be handed one.
 *
 * `VideoPlayer.GetTexture` returns a `Texture2D`, and every `Texture2D` belongs to a
 * `GraphicsDevice` -- but XNA's `VideoPlayer` takes no device, and CNA's video routes take none
 * either, so there is nothing to thread through. This ABI creates exactly one game-owned device, so
 * "the live one" is unambiguous rather than a guess. A frame texture asked for with no live device
 * refuses instead of inventing one.
 */
/**
 * The lifetimes of devices this class created itself, which are the only ones it may release.
 * A device a GraphicsDeviceManager made is absent from this map.
 */
const ownedDeviceLifetimes = new WeakMap<GraphicsDevice, NativeResourceLifetime>();

export function createGraphicsDeviceForInternalUse(value: GraphicsDeviceInternalState): GraphicsDevice {
  const InternalGraphicsDevice = GraphicsDevice as unknown as new (
    adapter: GraphicsAdapter | null,
    profile: GraphicsProfile,
    parameters: PresentationParameters,
    internalState: GraphicsDeviceInternalState,
  ) => GraphicsDevice;
  const device = new InternalGraphicsDevice(
    value.Adapter, value.GraphicsProfile, value.PresentationParameters, value,
  );
  setLiveGraphicsDeviceForInternalUse(device);
  return device;
}





export function blendStateSnapshotForInternalUse(value: BlendState): BlendStateSnapshot {
  assertGraphicsResourceActiveForInternalUse(value);
  return {
    AlphaBlendFunction: value.AlphaBlendFunction,
    AlphaDestinationBlend: value.AlphaDestinationBlend,
    AlphaSourceBlend: value.AlphaSourceBlend,
    ColorBlendFunction: value.ColorBlendFunction,
    ColorDestinationBlend: value.ColorDestinationBlend,
    ColorSourceBlend: value.ColorSourceBlend,
    ColorWriteChannels: value.ColorWriteChannels,
    ColorWriteChannels1: value.ColorWriteChannels1,
    ColorWriteChannels2: value.ColorWriteChannels2,
    ColorWriteChannels3: value.ColorWriteChannels3,
    BlendFactor: value.BlendFactor.PackedValue,
    MultiSampleMask: value.MultiSampleMask,
  };
}

export function depthStencilStateSnapshotForInternalUse(
  value: DepthStencilState,
): DepthStencilStateSnapshot {
  assertGraphicsResourceActiveForInternalUse(value);
  return {
    DepthBufferEnable: value.DepthBufferEnable,
    DepthBufferWriteEnable: value.DepthBufferWriteEnable,
    StencilEnable: value.StencilEnable,
    TwoSidedStencilMode: value.TwoSidedStencilMode,
    DepthBufferFunction: value.DepthBufferFunction,
    StencilFunction: value.StencilFunction,
    StencilMask: value.StencilMask,
    StencilWriteMask: value.StencilWriteMask,
    ReferenceStencil: value.ReferenceStencil,
    StencilFail: value.StencilFail,
    StencilDepthBufferFail: value.StencilDepthBufferFail,
    StencilPass: value.StencilPass,
    CounterClockwiseStencilFunction: value.CounterClockwiseStencilFunction,
    CounterClockwiseStencilFail: value.CounterClockwiseStencilFail,
    CounterClockwiseStencilDepthBufferFail: value.CounterClockwiseStencilDepthBufferFail,
    CounterClockwiseStencilPass: value.CounterClockwiseStencilPass,
  };
}

export function rasterizerStateSnapshotForInternalUse(
  value: RasterizerState,
): RasterizerStateSnapshot {
  assertGraphicsResourceActiveForInternalUse(value);
  return {
    CullMode: value.CullMode,
    FillMode: value.FillMode,
    DepthBias: value.DepthBias,
    SlopeScaleDepthBias: value.SlopeScaleDepthBias,
    MultiSampleAntiAlias: value.MultiSampleAntiAlias,
    ScissorTestEnable: value.ScissorTestEnable,
  };
}

export function samplerStateSnapshotForInternalUse(value: SamplerState): SamplerStateSnapshot {
  assertGraphicsResourceActiveForInternalUse(value);
  return {
    AddressU: value.AddressU,
    AddressV: value.AddressV,
    AddressW: value.AddressW,
    Filter: value.Filter,
    MaxAnisotropy: value.MaxAnisotropy,
    MaxMipLevel: value.MaxMipLevel,
    MipMapLevelOfDetailBias: value.MipMapLevelOfDetailBias,
  };
}



