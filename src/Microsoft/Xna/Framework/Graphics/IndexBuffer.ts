import { ArgumentNullException, ArgumentOutOfRangeException } from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { XnaType } from "../Contracts.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import { GraphicsResource } from "./GraphicsResource.js";
import { BufferUsage, IndexElementSize } from "./VertexEnums.js";

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
    if (Math.trunc(indexCount) <= 0) throw new ArgumentOutOfRangeException("indexCount");
    void usage;
    throw new NativeUnavailableError("IndexBuffer requires CNA index-buffer allocation routes");
  }
  public get BufferUsage(): BufferUsage { throw new NativeUnavailableError("IndexBuffer is unavailable"); }
  public get IndexCount(): number { throw new NativeUnavailableError("IndexBuffer is unavailable"); }
  public get IndexElementSize(): IndexElementSize { throw new NativeUnavailableError("IndexBuffer is unavailable"); }
  public GetData<T>(data: T[]): void;
  public GetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(...args: unknown[]): void { void args; throw new NativeUnavailableError("IndexBuffer.GetData requires CNA typed transfer routes"); }
  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(...args: unknown[]): void { void args; throw new NativeUnavailableError("IndexBuffer.SetData requires CNA typed transfer routes"); }
}
