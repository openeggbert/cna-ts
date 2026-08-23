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
import { VertexDeclaration } from "./VertexDeclaration.js";
import { BufferUsage } from "./VertexEnums.js";
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
    void args;
    stateOf(this);
    throw new NativeUnavailableError("VertexBuffer.GetData requires a mapped vertex value representation");
  }
  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number, vertexStride: number): void;
  public SetData<T>(...args: unknown[]): void {
    void args;
    stateOf(this);
    throw new NativeUnavailableError("VertexBuffer.SetData requires a mapped vertex value representation");
  }
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
