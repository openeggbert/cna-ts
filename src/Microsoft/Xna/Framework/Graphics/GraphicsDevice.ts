import type { CnaBackend } from "../../../../internal/backend.js";
import { EventDispatcher } from "../../../../internal/events.js";
import {
  ArgumentNullException,
  InvalidOperationException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { NativeHandle, NativeResourceLifetime } from "../../../../internal/ownership.js";
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
import type { GraphicsAdapter } from "./GraphicsAdapter.js";
import type { IndexBuffer } from "./IndexBuffer.js";
import { PresentationParameters } from "./PresentationParameters.js";
import type { PrimitiveType } from "./VertexEnums.js";
import { RasterizerState } from "./RasterizerState.js";
import type { RenderTarget2D, RenderTargetCube } from "./RenderTargets.js";
import type { RenderTargetBinding } from "./RenderTargetBinding.js";
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
import type { Texture } from "./Texture.js";
import type { CubeMapFace } from "./TextureEnums.js";
import type { VertexBuffer } from "./VertexBuffer.js";
import type { VertexBufferBinding } from "./VertexBufferBinding.js";
import type { VertexDeclaration } from "./VertexDeclaration.js";
import { Viewport } from "./Viewport.js";

export type GraphicsDeviceInternalState = {
  readonly Backend: CnaBackend;
  readonly ResolveHandle: () => NativeHandle;
  readonly ParentLifetime: NativeResourceLifetime;
  readonly Adapter: GraphicsAdapter | null;
  readonly GraphicsProfile: GraphicsProfile;
  readonly PresentationParameters: PresentationParameters;
  readonly DisplayMode: DisplayMode | null;
};

type DeviceState = GraphicsDeviceInternalState & {
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

const states = new WeakMap<GraphicsDevice, DeviceState>();
const resourceCreatedDispatchers = new WeakMap<
GraphicsDevice,
EventDispatcher<unknown, ResourceCreatedEventArgs>
>();
const resourceDestroyedDispatchers = new WeakMap<
GraphicsDevice,
EventDispatcher<unknown, ResourceDestroyedEventArgs>
>();

function stateOf(device: GraphicsDevice): DeviceState {
  const state = states.get(device);
  if (!state) throw new NativeUnavailableError("GraphicsDevice construction requires a CNA device route");
  if (state.Disposed) throw new ObjectDisposedException("GraphicsDevice");
  return state;
}

function unsupported(operation: string): never {
  throw new NativeUnavailableError(`${operation} is not in the loaded CNA-TS backend slice`);
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
      const unavailable = (): never => unsupported("GraphicsDevice state binding");
      const viewport = new Viewport(internalState.PresentationParameters.Bounds);
      const samplerStates = createSamplerStateCollectionForInternalUse(
        this, 16, SamplerState.LinearWrap, unavailable,
      );
      const textures = createTextureCollectionForInternalUse(this, 16, unavailable);
      const vertexSamplerStates = createSamplerStateCollectionForInternalUse(
        this, 4, SamplerState.LinearWrap, unavailable,
      );
      const vertexTextures = createTextureCollectionForInternalUse(this, 4, unavailable);
      states.set(this, {
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
      resourceCreatedDispatchers.set(this, this.#resourceCreated);
      resourceDestroyedDispatchers.set(this, this.#resourceDestroyed);
      return;
    }
    if (adapter == null) throw new ArgumentNullException("adapter");
    if (presentationParameters == null) throw new ArgumentNullException("presentationParameters");
    void graphicsProfile;
    throw new NativeUnavailableError("Direct GraphicsDevice construction requires a CNA standalone-device route");
  }

  public get Adapter(): GraphicsAdapter {
    const adapter = stateOf(this).Adapter;
    if (!adapter) throw new NativeUnavailableError("GraphicsDevice.Adapter requires CNA adapter discovery");
    return adapter;
  }
  public get BlendFactor(): Color {
    const value = stateOf(this).BlendFactor;
    return new Color(value.R, value.G, value.B, value.A);
  }
  public set BlendFactor(value: Color) { void value; unsupported("GraphicsDevice.BlendFactor"); }
  public get BlendState(): BlendState { return stateOf(this).BlendState; }
  public set BlendState(value: BlendState) { void value; unsupported("GraphicsDevice.BlendState"); }
  public get DepthStencilState(): DepthStencilState { return stateOf(this).DepthStencilState; }
  public set DepthStencilState(value: DepthStencilState) { void value; unsupported("GraphicsDevice.DepthStencilState"); }
  public get DisplayMode(): DisplayMode {
    const mode = stateOf(this).DisplayMode;
    if (!mode) throw new NativeUnavailableError("GraphicsDevice.DisplayMode requires CNA display-mode discovery");
    return mode;
  }
  public get GraphicsDeviceStatus(): GraphicsDeviceStatus {
    stateOf(this);
    return unsupported("GraphicsDevice.GraphicsDeviceStatus");
  }
  public get GraphicsProfile(): GraphicsProfile { return stateOf(this).GraphicsProfile; }
  public get Indices(): IndexBuffer { return stateOf(this).Indices as IndexBuffer; }
  public set Indices(value: IndexBuffer) { void value; unsupported("GraphicsDevice.Indices"); }
  public get IsDisposed(): boolean { return states.get(this)?.Disposed ?? false; }
  public get MultiSampleMask(): number { return stateOf(this).MultiSampleMask; }
  public set MultiSampleMask(value: number) { void value; unsupported("GraphicsDevice.MultiSampleMask"); }
  public get PresentationParameters(): PresentationParameters { return stateOf(this).PresentationParameters.Clone(); }
  public get RasterizerState(): RasterizerState { return stateOf(this).RasterizerState; }
  public set RasterizerState(value: RasterizerState) { void value; unsupported("GraphicsDevice.RasterizerState"); }
  public get ReferenceStencil(): number { return stateOf(this).ReferenceStencil; }
  public set ReferenceStencil(value: number) { void value; unsupported("GraphicsDevice.ReferenceStencil"); }
  public get SamplerStates(): SamplerStateCollection { return stateOf(this).SamplerStates; }
  public get ScissorRectangle(): Rectangle {
    const value = stateOf(this).ScissorRectangle;
    return new Rectangle(value.X, value.Y, value.Width, value.Height);
  }
  public set ScissorRectangle(value: Rectangle) { void value; unsupported("GraphicsDevice.ScissorRectangle"); }
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
  public set Viewport(value: Viewport) { void value; unsupported("GraphicsDevice.Viewport"); }

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
    const state = states.get(this);
    if (!state || state.Disposed) return;
    this.#disposing.Dispatch(this, EventArgs.Empty);
    state.Disposed = true;
  }

  public DrawIndexedPrimitives(
    primitiveType: PrimitiveType, baseVertex: number, minVertexIndex: number,
    numVertices: number, startIndex: number, primitiveCount: number,
  ): void {
    void [primitiveType, baseVertex, minVertexIndex, numVertices, startIndex, primitiveCount];
    stateOf(this); unsupported("GraphicsDevice.DrawIndexedPrimitives");
  }

  public DrawInstancedPrimitives(
    primitiveType: PrimitiveType, baseVertex: number, minVertexIndex: number, numVertices: number,
    startIndex: number, primitiveCount: number, instanceCount: number,
  ): void {
    void [primitiveType, baseVertex, minVertexIndex, numVertices, startIndex, primitiveCount, instanceCount];
    stateOf(this); unsupported("GraphicsDevice.DrawInstancedPrimitives");
  }

  public DrawPrimitives(primitiveType: PrimitiveType, startVertex: number, primitiveCount: number): void {
    void [primitiveType, startVertex, primitiveCount]; stateOf(this);
    unsupported("GraphicsDevice.DrawPrimitives");
  }

  public DrawUserIndexedPrimitives<T>(
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
    void [primitiveType, vertexData, vertexOffset, numVertices, indexData, indexOffset, primitiveCount, vertexDeclaration];
    stateOf(this); unsupported("GraphicsDevice.DrawUserIndexedPrimitives");
  }

  public DrawUserPrimitives<T>(
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
    void [primitiveType, vertexData, vertexOffset, primitiveCount, vertexDeclaration];
    stateOf(this); unsupported("GraphicsDevice.DrawUserPrimitives");
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
  public GetVertexBuffers(): VertexBufferBinding[] { return [...stateOf(this).VertexBuffers]; }

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
    void [renderTarget, cubeMapFace]; stateOf(this); unsupported("GraphicsDevice.SetRenderTarget");
  }
  public SetRenderTargets(renderTargets: RenderTargetBinding[]): void {
    void renderTargets; stateOf(this); unsupported("GraphicsDevice.SetRenderTargets");
  }
  public SetVertexBuffer(vertexBuffer: VertexBuffer): void;
  public SetVertexBuffer(vertexBuffer: VertexBuffer, vertexOffset: number): void;
  public SetVertexBuffer(vertexBuffer: VertexBuffer, vertexOffset?: number): void {
    void [vertexBuffer, vertexOffset]; stateOf(this); unsupported("GraphicsDevice.SetVertexBuffer");
  }
  public SetVertexBuffers(vertexBuffers: VertexBufferBinding[]): void {
    void vertexBuffers; stateOf(this); unsupported("GraphicsDevice.SetVertexBuffers");
  }

}

export function createGraphicsDeviceForInternalUse(value: GraphicsDeviceInternalState): GraphicsDevice {
  const InternalGraphicsDevice = GraphicsDevice as unknown as new (
    adapter: GraphicsAdapter | null,
    profile: GraphicsProfile,
    parameters: PresentationParameters,
    internalState: GraphicsDeviceInternalState,
  ) => GraphicsDevice;
  return new InternalGraphicsDevice(
    value.Adapter, value.GraphicsProfile, value.PresentationParameters, value,
  );
}

export function resolveGraphicsDeviceHandleForInternalUse(device: GraphicsDevice): NativeHandle {
  const state = stateOf(device);
  return state.ResolveHandle();
}

export function graphicsDeviceParentLifetimeForInternalUse(
  device: GraphicsDevice,
): NativeResourceLifetime {
  return stateOf(device).ParentLifetime;
}

export function graphicsDeviceBackendForInternalUse(device: GraphicsDevice): CnaBackend {
  return stateOf(device).Backend;
}

export function notifyGraphicsResourceCreatedForInternalUse(
  device: GraphicsDevice,
  resource: Texture | object,
): void {
  stateOf(device);
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
