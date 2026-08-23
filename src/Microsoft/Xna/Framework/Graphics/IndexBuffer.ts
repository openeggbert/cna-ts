import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
} from "../../../../internal/exceptions.js";
import type { CnaBackend } from "../../../../internal/backend.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime } from "../../../../internal/ownership.js";
import type { XnaType } from "../Contracts.js";
import {
  graphicsDeviceBackendForInternalUse,
  graphicsDeviceParentLifetimeForInternalUse,
  notifyGraphicsResourceCreatedForInternalUse,
  notifyGraphicsResourceDestroyedForInternalUse,
  resolveGraphicsDeviceHandleForInternalUse,
} from "./GraphicsDevice.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  attachGraphicsResourceForInternalUse,
  assertGraphicsResourceActiveForInternalUse,
  GraphicsResource,
  setGraphicsResourceLifetimeForInternalUse,
} from "./GraphicsResource.js";
import { BufferUsage, IndexElementSize } from "./VertexEnums.js";

type IndexBufferState = {
  readonly Backend: CnaBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly BufferUsage: BufferUsage;
  readonly IndexCount: number;
  readonly IndexElementSize: IndexElementSize;
};
const states = new WeakMap<IndexBuffer, IndexBufferState>();

function stateOf(value: IndexBuffer): IndexBufferState {
  assertGraphicsResourceActiveForInternalUse(value);
  const state = states.get(value);
  if (!state) throw new NativeUnavailableError("IndexBuffer construction did not complete");
  return state;
}

function elementSizeFromToken(value: XnaType<unknown>): IndexElementSize {
  if (value === Uint16Array) return IndexElementSize.SixteenBits;
  if (value === Uint32Array) return IndexElementSize.ThirtyTwoBits;
  throw new ArgumentException("indexType must be Uint16Array or Uint32Array");
}

export class IndexBuffer extends GraphicsResource {
  public constructor(
    graphicsDevice: GraphicsDevice, indexElementSize: IndexElementSize,
    indexCount: number, usage: BufferUsage,
  );
  public constructor(
    graphicsDevice: GraphicsDevice, indexType: XnaType<unknown>,
    indexCount: number, usage: BufferUsage,
  );
  public constructor(
    graphicsDevice: GraphicsDevice, sizeOrType: IndexElementSize | XnaType<unknown>,
    indexCount: number, usage: BufferUsage,
  ) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    if (sizeOrType == null) throw new ArgumentNullException("indexType");
    if (!Number.isInteger(indexCount) || indexCount <= 0) throw new ArgumentOutOfRangeException("indexCount");
    if (usage !== BufferUsage.None && usage !== BufferUsage.WriteOnly) throw new ArgumentOutOfRangeException("usage");
    const elementSize = typeof sizeOrType === "number" ? sizeOrType : elementSizeFromToken(sizeOrType);
    if (elementSize !== IndexElementSize.SixteenBits && elementSize !== IndexElementSize.ThirtyTwoBits) {
      throw new ArgumentOutOfRangeException("indexElementSize");
    }
    const backend = graphicsDeviceBackendForInternalUse(graphicsDevice);
    const parent = graphicsDeviceParentLifetimeForInternalUse(graphicsDevice);
    const handle = backend.createIndexBuffer(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
      elementSize, indexCount, usage, new.target !== IndexBuffer,
    );
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: parent,
      Release: (value) => backend.destroyIndexBuffer(value),
      Label: "IndexBuffer",
    });
    states.set(this, {
      Backend: backend, Lifetime: lifetime, BufferUsage: usage,
      IndexCount: indexCount, IndexElementSize: elementSize,
    });
    attachGraphicsResourceForInternalUse(
      this, graphicsDevice,
      (name, tag) => notifyGraphicsResourceDestroyedForInternalUse(graphicsDevice, name, tag),
    );
    setGraphicsResourceLifetimeForInternalUse(
      this, () => lifetime.Dispose(), () => lifetime.State === "active",
    );
    notifyGraphicsResourceCreatedForInternalUse(graphicsDevice, this);
  }
  public get BufferUsage(): BufferUsage { return stateOf(this).BufferUsage; }
  public get IndexCount(): number { return stateOf(this).IndexCount; }
  public get IndexElementSize(): IndexElementSize { return stateOf(this).IndexElementSize; }
  public GetData<T>(data: T[]): void;
  public GetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(...args: unknown[]): void {
    void args;
    stateOf(this);
    throw new NativeUnavailableError("IndexBuffer.GetData requires a mapped index array representation");
  }
  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(...args: unknown[]): void {
    void args;
    stateOf(this);
    throw new NativeUnavailableError("IndexBuffer.SetData requires a mapped index array representation");
  }
}

export function setIndexBufferRawForInternalUse(buffer: IndexBuffer, bytes: Uint8Array): void {
  const state = stateOf(buffer);
  if (!(bytes instanceof Uint8Array)) throw new ArgumentException("bytes must be a Uint8Array");
  const width = state.IndexElementSize === IndexElementSize.SixteenBits ? 2 : 4;
  const expected = state.IndexCount * width;
  if (bytes.length !== expected) throw new ArgumentException(`Index data must contain exactly ${expected} bytes`);
  state.Backend.setIndexBufferRaw(state.Lifetime.Handle, state.IndexElementSize, new Uint8Array(bytes));
}

export function getIndexBufferRawForInternalUse(buffer: IndexBuffer): Uint8Array {
  const state = stateOf(buffer);
  return state.Backend.getIndexBufferRaw(
    state.Lifetime.Handle, state.IndexElementSize, state.IndexCount,
  );
}
