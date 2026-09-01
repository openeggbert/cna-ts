import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
} from "../../../../internal/exceptions.js";
import type { CnaBackend } from "../../../../internal/backend.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { bindContentLostForInternalUse } from "../../../../internal/content-lost.js";
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
import { BufferUsage, IndexElementSize, SetDataOptions } from "./VertexEnums.js";

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
    getIndexBufferDataForInternalUse(this, args);
  }
  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(...args: unknown[]): void {
    setIndexBufferDataForInternalUse(this, args);
  }
}

type IndexTransferRequest = {
  readonly OffsetInBytes: number | null;
  readonly Data: number[];
  readonly StartIndex: number;
  readonly ElementCount: number;
  readonly Options: SetDataOptions;
};

function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0x7fff_ffff) {
    throw new ArgumentOutOfRangeException(name);
  }
  return value;
}

function parseTransfer(
  buffer: IndexBuffer,
  args: readonly unknown[],
  dynamic: boolean,
): IndexTransferRequest {
  const state = stateOf(buffer);
  let offset: number | null = null;
  let data: unknown;
  let start = 0;
  let count: number;
  let options = SetDataOptions.None;
  if (args.length === 1) {
    [data] = args;
    count = Array.isArray(data) ? data.length : 0;
  } else if (args.length === 3) {
    [data] = args;
    start = integer(args[1], "startIndex");
    count = integer(args[2], "elementCount");
  } else if (dynamic && args.length === 4) {
    [data] = args;
    start = integer(args[1], "startIndex");
    count = integer(args[2], "elementCount");
    options = integer(args[3], "options") as SetDataOptions;
  } else if (args.length === 4 || (dynamic && args.length === 5)) {
    offset = integer(args[0], "offsetInBytes");
    data = args[1];
    start = integer(args[2], "startIndex");
    count = integer(args[3], "elementCount");
    if (dynamic && args.length === 5) options = integer(args[4], "options") as SetDataOptions;
  } else {
    throw new ArgumentException("Unsupported IndexBuffer transfer overload");
  }
  if (data == null) throw new ArgumentNullException("data");
  if (!Array.isArray(data)) throw new ArgumentException("data must be a number array");
  if (start > data.length || count > data.length - start) {
    throw new ArgumentException("data is too small for startIndex and elementCount");
  }
  const width = state.IndexElementSize === IndexElementSize.SixteenBits ? 2 : 4;
  if (offset != null && offset % width !== 0) {
    throw new ArgumentException("offsetInBytes must be aligned to the index element size");
  }
  if (offset != null && (offset > state.IndexCount * width || count * width > state.IndexCount * width - offset)) {
    throw new ArgumentException("the transfer window exceeds the IndexBuffer");
  }
  if (options < SetDataOptions.None || options > SetDataOptions.NoOverwrite) {
    throw new ArgumentOutOfRangeException("options");
  }
  if (!dynamic && options !== SetDataOptions.None) throw new ArgumentOutOfRangeException("options");
  return { OffsetInBytes: offset, Data: data as number[], StartIndex: start, ElementCount: count, Options: options };
}

function encodeIndices(
  data: readonly number[], elementSize: IndexElementSize,
  startIndex: number, elementCount: number,
): Uint8Array {
  const width = elementSize === IndexElementSize.SixteenBits ? 2 : 4;
  const output = new Uint8Array(data.length * width);
  const view = new DataView(output.buffer);
  const maximum = width === 2 ? 0xffff : 0xffff_ffff;
  for (let index = 0; index < elementCount; index += 1) {
    const source = data[startIndex + index];
    if (!Number.isInteger(source) || source < 0 || source > maximum) {
      throw new ArgumentException(`data[${startIndex + index}] is outside the index element range`);
    }
    if (width === 2) view.setUint16((startIndex + index) * width, source, true);
    else view.setUint32((startIndex + index) * width, source, true);
  }
  return output;
}

export function setIndexBufferDataForInternalUse(
  buffer: IndexBuffer,
  args: readonly unknown[],
  dynamic = false,
): void {
  const state = stateOf(buffer);
  const request = parseTransfer(buffer, args, dynamic);
  const graphics = state.Backend.Graphics;
  if (!graphics) throw new NativeUnavailableError("IndexBuffer.SetData requires CNA graphics transfer routes");
  const bytes = encodeIndices(
    request.Data, state.IndexElementSize, request.StartIndex, request.ElementCount,
  );
  graphics.setIndexBufferData(
    state.Lifetime.Handle, state.IndexElementSize, request.Options, request.OffsetInBytes,
    request.StartIndex, request.ElementCount, request.Data.length, bytes,
  );
}

export function getIndexBufferDataForInternalUse(
  buffer: IndexBuffer,
  args: readonly unknown[],
): void {
  const state = stateOf(buffer);
  const request = parseTransfer(buffer, args, false);
  const bytes = state.Backend.getIndexBufferRaw(
    state.Lifetime.Handle, state.IndexElementSize, state.IndexCount,
  );
  const width = state.IndexElementSize === IndexElementSize.SixteenBits ? 2 : 4;
  const first = (request.OffsetInBytes ?? 0) / width;
  if (first + request.ElementCount > state.IndexCount) {
    throw new ArgumentException("the readback window exceeds the IndexBuffer");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < request.ElementCount; index += 1) {
    request.Data[request.StartIndex + index] = width === 2
      ? view.getUint16((first + index) * width, true)
      : view.getUint32((first + index) * width, true);
  }
}

export function resolveIndexBufferHandleForInternalUse(buffer: IndexBuffer) {
  return stateOf(buffer).Lifetime.Handle;
}

/** Internal: the index-buffer twin of {@link trackVertexBufferReleaseForInternalUse}. */
export function trackIndexBufferReleaseForInternalUse(
  buffer: IndexBuffer,
  teardown: () => void,
): () => void {
  return stateOf(buffer).Lifetime.TrackCallback(teardown);
}

/** Internal: gives a dynamic index buffer's declared ContentLost event a real CNA producer. */
export function bindIndexBufferContentLostForInternalUse(
  buffer: IndexBuffer, raise: () => void,
): void {
  const state = stateOf(buffer);
  bindContentLostForInternalUse(
    state.Backend.Graphics, "index-buffer", state.Lifetime.Handle,
    (teardown) => { state.Lifetime.TrackCallback(teardown); }, raise,
  );
}

export function getIndexBufferIsContentLostForInternalUse(buffer: IndexBuffer): boolean {
  const state = stateOf(buffer);
  const graphics = state.Backend.Graphics;
  if (!graphics) throw new NativeUnavailableError("DynamicIndexBuffer requires CNA graphics routes");
  return graphics.getIndexBufferIsContentLost(state.Lifetime.Handle);
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
