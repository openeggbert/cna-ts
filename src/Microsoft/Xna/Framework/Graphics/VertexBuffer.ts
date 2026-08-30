import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
} from "../../../../internal/exceptions.js";
import type { CnaBackend } from "../../../../internal/backend.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime } from "../../../../internal/ownership.js";
import { resolveVertexCodec } from "../../../../internal/vertex-transfer.js";
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
import { VertexDeclaration } from "./VertexDeclaration.js";
import { BufferUsage, SetDataOptions } from "./VertexEnums.js";
import { vertexDeclarationFromTypeForInternalUse } from "./VertexValues.js";

type VertexBufferState = {
  readonly Backend: CnaBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly BufferUsage: BufferUsage;
  readonly VertexCount: number;
  readonly VertexDeclaration: VertexDeclaration;
};
const states = new WeakMap<VertexBuffer, VertexBufferState>();

function stateOf(value: VertexBuffer): VertexBufferState {
  assertGraphicsResourceActiveForInternalUse(value);
  const state = states.get(value);
  if (!state) throw new NativeUnavailableError("VertexBuffer construction did not complete");
  return state;
}

export class VertexBuffer extends GraphicsResource {
  public constructor(
    graphicsDevice: GraphicsDevice, vertexDeclaration: VertexDeclaration,
    vertexCount: number, usage: BufferUsage,
  );
  public constructor(
    graphicsDevice: GraphicsDevice, vertexType: XnaType<unknown>,
    vertexCount: number, usage: BufferUsage,
  );
  public constructor(
    graphicsDevice: GraphicsDevice,
    declarationOrType: VertexDeclaration | XnaType<unknown>,
    vertexCount: number,
    usage: BufferUsage,
  ) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    if (declarationOrType == null) throw new ArgumentNullException("vertexDeclaration");
    if (!Number.isInteger(vertexCount) || vertexCount <= 0) {
      throw new ArgumentOutOfRangeException("vertexCount");
    }
    if (usage !== BufferUsage.None && usage !== BufferUsage.WriteOnly) {
      throw new ArgumentOutOfRangeException("usage");
    }
    const declaration = declarationOrType instanceof VertexDeclaration
      ? declarationOrType
      : vertexDeclarationFromTypeForInternalUse(declarationOrType);
    const elements = declaration.GetVertexElements();
    const backend = graphicsDeviceBackendForInternalUse(graphicsDevice);
    const parent = graphicsDeviceParentLifetimeForInternalUse(graphicsDevice);
    const handle = backend.createVertexBuffer(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
      declaration.VertexStride,
      elements,
      vertexCount,
      usage,
      new.target !== VertexBuffer,
    );
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: parent,
      Release: (value) => backend.destroyVertexBuffer(value),
      Label: "VertexBuffer",
    });
    const snapshot = new VertexDeclaration(declaration.VertexStride, elements);
    states.set(this, {
      Backend: backend, Lifetime: lifetime, BufferUsage: usage,
      VertexCount: vertexCount, VertexDeclaration: snapshot,
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
  public get VertexCount(): number { return stateOf(this).VertexCount; }
  public get VertexDeclaration(): VertexDeclaration { return stateOf(this).VertexDeclaration; }

  public GetData<T>(data: T[]): void;
  public GetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number, vertexStride: number): void;
  public GetData<T>(...args: unknown[]): void {
    getVertexBufferDataForInternalUse(this, args);
  }
  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number, vertexStride: number): void;
  public SetData<T>(...args: unknown[]): void {
    setVertexBufferDataForInternalUse(this, args);
  }
}

type VertexTransferRequest = {
  readonly OffsetInBytes: number | null;
  readonly Data: unknown[];
  readonly StartIndex: number;
  readonly ElementCount: number;
  readonly VertexStride: number;
  readonly Options: SetDataOptions;
};

function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0x7fff_ffff) {
    throw new ArgumentOutOfRangeException(name);
  }
  return value;
}

function parseTransfer(
  buffer: VertexBuffer,
  args: readonly unknown[],
  dynamic: boolean,
): VertexTransferRequest {
  const state = stateOf(buffer);
  let offset: number | null = null;
  let data: unknown;
  let start = 0;
  let count: number;
  let stride = state.VertexDeclaration.VertexStride;
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
  } else if (args.length === 5 || (dynamic && args.length === 6)) {
    offset = integer(args[0], "offsetInBytes");
    data = args[1];
    start = integer(args[2], "startIndex");
    count = integer(args[3], "elementCount");
    stride = integer(args[4], "vertexStride");
    if (dynamic && args.length === 6) options = integer(args[5], "options") as SetDataOptions;
  } else {
    throw new ArgumentException("Unsupported VertexBuffer transfer overload");
  }
  if (data == null) throw new ArgumentNullException("data");
  if (!Array.isArray(data)) throw new ArgumentException("data must be an array");
  if (start > data.length || count > data.length - start) {
    throw new ArgumentException("data is too small for startIndex and elementCount");
  }
  if (stride <= 0) throw new ArgumentOutOfRangeException("vertexStride");
  if (options < SetDataOptions.None || options > SetDataOptions.NoOverwrite) {
    throw new ArgumentOutOfRangeException("options");
  }
  if (!dynamic && options !== SetDataOptions.None) throw new ArgumentOutOfRangeException("options");
  if (offset != null && offset % stride !== 0) {
    throw new ArgumentException("offsetInBytes must be a multiple of vertexStride");
  }
  if (offset != null && (offset > state.VertexCount * state.VertexDeclaration.VertexStride ||
      count * stride > state.VertexCount * state.VertexDeclaration.VertexStride - offset)) {
    throw new ArgumentException("the transfer window exceeds the VertexBuffer");
  }
  return { OffsetInBytes: offset, Data: data, StartIndex: start, ElementCount: count, VertexStride: stride, Options: options };
}

export function setVertexBufferDataForInternalUse(
  buffer: VertexBuffer,
  args: readonly unknown[],
  dynamic = buffer.constructor.name === "DynamicVertexBuffer",
): void {
  const state = stateOf(buffer);
  const request = parseTransfer(buffer, args, dynamic);
  const codec = resolveVertexCodec(
    request.Data, state.VertexDeclaration, request.StartIndex, request.ElementCount,
  );
  if (request.VertexStride !== codec.Stride) {
    throw new ArgumentException("vertexStride must match the selected built-in vertex layout");
  }
  const graphics = state.Backend.Graphics;
  if (!graphics) throw new NativeUnavailableError("VertexBuffer.SetData requires CNA graphics transfer routes");
  if (request.OffsetInBytes == null) {
    const bytes = codec.encode(request.Data, request.StartIndex, request.ElementCount, true);
    graphics.setVertexBufferData(
      state.Lifetime.Handle, codec.NativeType, request.Options, request.StartIndex,
      request.ElementCount, request.Data.length, bytes,
    );
    return;
  }
  const bytes = codec.encode(request.Data, request.StartIndex, request.ElementCount, false);
  graphics.setVertexBufferRawAt(
    state.Lifetime.Handle, request.OffsetInBytes, bytes, request.ElementCount, request.VertexStride,
    request.Options,
  );
}

export function getVertexBufferDataForInternalUse(
  buffer: VertexBuffer,
  args: readonly unknown[],
): void {
  const state = stateOf(buffer);
  const request = parseTransfer(buffer, args, false);
  const codec = resolveVertexCodec(
    request.Data, state.VertexDeclaration, request.StartIndex, request.ElementCount,
  );
  if (request.VertexStride !== codec.Stride) {
    throw new ArgumentException("vertexStride must match the selected built-in vertex layout");
  }
  const graphics = state.Backend.Graphics;
  if (!graphics) throw new NativeUnavailableError("VertexBuffer.GetData requires CNA graphics transfer routes");
  const bytes = graphics.getVertexBufferRawAt(
    state.Lifetime.Handle, request.OffsetInBytes ?? 0, request.ElementCount, request.VertexStride,
  );
  codec.decode(bytes, request.Data, request.StartIndex, request.ElementCount);
}

export function resolveVertexBufferHandleForInternalUse(buffer: VertexBuffer) {
  return stateOf(buffer).Lifetime.Handle;
}

export function getVertexBufferIsContentLostForInternalUse(buffer: VertexBuffer): boolean {
  const state = stateOf(buffer);
  const graphics = state.Backend.Graphics;
  if (!graphics) throw new NativeUnavailableError("DynamicVertexBuffer requires CNA graphics routes");
  return graphics.getVertexBufferIsContentLost(state.Lifetime.Handle);
}

export function setVertexBufferRawForInternalUse(buffer: VertexBuffer, bytes: Uint8Array): void {
  const state = stateOf(buffer);
  if (!(bytes instanceof Uint8Array)) throw new ArgumentException("bytes must be a Uint8Array");
  const expected = state.VertexCount * state.VertexDeclaration.VertexStride;
  if (bytes.length !== expected) throw new ArgumentException(`Vertex data must contain exactly ${expected} bytes`);
  state.Backend.setVertexBufferRaw(
    state.Lifetime.Handle, new Uint8Array(bytes), state.VertexCount,
    state.VertexDeclaration.VertexStride,
  );
}

export function getVertexBufferRawForInternalUse(buffer: VertexBuffer): Uint8Array {
  const state = stateOf(buffer);
  return state.Backend.getVertexBufferRaw(
    state.Lifetime.Handle, state.VertexCount, state.VertexDeclaration.VertexStride,
  );
}
