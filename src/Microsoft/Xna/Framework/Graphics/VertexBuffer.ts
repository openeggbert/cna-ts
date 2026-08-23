import { ArgumentNullException, ArgumentOutOfRangeException } from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { XnaType } from "../Contracts.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import { GraphicsResource } from "./GraphicsResource.js";
import type { VertexDeclaration } from "./VertexDeclaration.js";
import { BufferUsage } from "./VertexEnums.js";

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
    if (Math.trunc(vertexCount) <= 0) throw new ArgumentOutOfRangeException("vertexCount");
    void usage;
    throw new NativeUnavailableError("VertexBuffer requires CNA vertex-buffer allocation routes");
  }

  public get BufferUsage(): BufferUsage { throw new NativeUnavailableError("VertexBuffer is unavailable"); }
  public get VertexCount(): number { throw new NativeUnavailableError("VertexBuffer is unavailable"); }
  public get VertexDeclaration(): VertexDeclaration { throw new NativeUnavailableError("VertexBuffer is unavailable"); }

  public GetData<T>(data: T[]): void;
  public GetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number, vertexStride: number): void;
  public GetData<T>(...args: unknown[]): void { void args; throw new NativeUnavailableError("VertexBuffer.GetData requires CNA typed transfer routes"); }
  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number, vertexStride: number): void;
  public SetData<T>(...args: unknown[]): void { void args; throw new NativeUnavailableError("VertexBuffer.SetData requires CNA typed transfer routes"); }
}
