import { ArgumentNullException, ArgumentOutOfRangeException } from "../../../../internal/exceptions.js";
import type { VertexBuffer } from "./VertexBuffer.js";

export class VertexBufferBinding {
  readonly #vertexBuffer: VertexBuffer;
  readonly #vertexOffset: number;
  readonly #instanceFrequency: number;

  public constructor(vertexBuffer: VertexBuffer);
  public constructor(vertexBuffer: VertexBuffer, vertexOffset: number);
  public constructor(vertexBuffer: VertexBuffer, vertexOffset: number, instanceFrequency: number);
  public constructor(vertexBuffer: VertexBuffer, vertexOffset = 0, instanceFrequency = 0) {
    if (vertexBuffer == null) throw new ArgumentNullException("vertexBuffer");
    vertexOffset = Math.trunc(vertexOffset);
    instanceFrequency = Math.trunc(instanceFrequency);
    if (vertexOffset < 0) throw new ArgumentOutOfRangeException("vertexOffset");
    if (instanceFrequency < 0) throw new ArgumentOutOfRangeException("instanceFrequency");
    this.#vertexBuffer = vertexBuffer;
    this.#vertexOffset = vertexOffset;
    this.#instanceFrequency = instanceFrequency;
  }
  public get InstanceFrequency(): number { return this.#instanceFrequency; }
  public get VertexBuffer(): VertexBuffer { return this.#vertexBuffer; }
  public get VertexOffset(): number { return this.#vertexOffset; }
  public static op_Implicit(vertexBuffer: VertexBuffer): VertexBufferBinding {
    return new VertexBufferBinding(vertexBuffer);
  }
}
