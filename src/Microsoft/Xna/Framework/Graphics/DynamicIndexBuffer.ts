import { EventDispatcher } from "../../../../internal/events.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { XnaEvent, XnaType } from "../Contracts.js";
import { EventArgs } from "../EventArgs.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import { IndexBuffer } from "./IndexBuffer.js";
import { BufferUsage, IndexElementSize, SetDataOptions } from "./VertexEnums.js";

export class DynamicIndexBuffer extends IndexBuffer {
  readonly #contentLost = new EventDispatcher<unknown, EventArgs>();
  public readonly ContentLost: XnaEvent<unknown, EventArgs> = this.#contentLost;

  public constructor(graphicsDevice: GraphicsDevice, indexElementSize: IndexElementSize, indexCount: number, usage: BufferUsage);
  public constructor(graphicsDevice: GraphicsDevice, indexType: XnaType<unknown>, indexCount: number, usage: BufferUsage);
  public constructor(
    graphicsDevice: GraphicsDevice, sizeOrType: IndexElementSize | XnaType<unknown>,
    indexCount: number, usage: BufferUsage,
  ) { super(graphicsDevice, sizeOrType as IndexElementSize, indexCount, usage); }

  public get IsContentLost(): boolean { throw new NativeUnavailableError("DynamicIndexBuffer is unavailable"); }
  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number, options: SetDataOptions): void;
  public SetData<T>(
    offsetInBytes: number, data: T[], startIndex: number, elementCount: number, options: SetDataOptions,
  ): void;
  public SetData<T>(...args: unknown[]): void { void args; throw new NativeUnavailableError("DynamicIndexBuffer.SetData requires CNA typed transfer routes"); }
}
