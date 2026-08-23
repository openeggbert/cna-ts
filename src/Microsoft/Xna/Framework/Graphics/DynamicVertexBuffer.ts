import { EventDispatcher } from "../../../../internal/events.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { XnaEvent, XnaType } from "../Contracts.js";
import { EventArgs } from "../EventArgs.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import type { VertexDeclaration } from "./VertexDeclaration.js";
import { BufferUsage, SetDataOptions } from "./VertexEnums.js";
import { VertexBuffer } from "./VertexBuffer.js";

export class DynamicVertexBuffer extends VertexBuffer {
  readonly #contentLost = new EventDispatcher<unknown, EventArgs>();
  public readonly ContentLost: XnaEvent<unknown, EventArgs> = this.#contentLost;

  public constructor(graphicsDevice: GraphicsDevice, vertexDeclaration: VertexDeclaration, vertexCount: number, usage: BufferUsage);
  public constructor(graphicsDevice: GraphicsDevice, vertexType: XnaType<unknown>, vertexCount: number, usage: BufferUsage);
  public constructor(
    graphicsDevice: GraphicsDevice, declarationOrType: VertexDeclaration | XnaType<unknown>,
    vertexCount: number, usage: BufferUsage,
  ) { super(graphicsDevice, declarationOrType as VertexDeclaration, vertexCount, usage); }

  public get IsContentLost(): boolean { throw new NativeUnavailableError("DynamicVertexBuffer is unavailable"); }
  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(offsetInBytes: number, data: T[], startIndex: number, elementCount: number, vertexStride: number): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number, options: SetDataOptions): void;
  public SetData<T>(
    offsetInBytes: number, data: T[], startIndex: number, elementCount: number,
    vertexStride: number, options: SetDataOptions,
  ): void;
  public SetData<T>(...args: unknown[]): void { void args; throw new NativeUnavailableError("DynamicVertexBuffer.SetData requires CNA typed transfer routes"); }
}
