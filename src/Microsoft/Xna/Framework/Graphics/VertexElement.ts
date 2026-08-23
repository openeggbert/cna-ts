import { VertexElementFormat, VertexElementUsage } from "./VertexEnums.js";

export class VertexElement {
  #offset: number;
  #usageIndex: number;
  #vertexElementFormat: VertexElementFormat;
  #vertexElementUsage: VertexElementUsage;

  public constructor(
    offset: number,
    elementFormat: VertexElementFormat,
    elementUsage: VertexElementUsage,
    usageIndex: number,
  ) {
    this.#offset = Math.trunc(offset);
    this.#vertexElementFormat = elementFormat;
    this.#vertexElementUsage = elementUsage;
    this.#usageIndex = Math.trunc(usageIndex);
  }

  public get Offset(): number { return this.#offset; }
  public set Offset(value: number) { this.#offset = Math.trunc(value); }
  public get UsageIndex(): number { return this.#usageIndex; }
  public set UsageIndex(value: number) { this.#usageIndex = Math.trunc(value); }
  public get VertexElementFormat(): VertexElementFormat { return this.#vertexElementFormat; }
  public set VertexElementFormat(value: VertexElementFormat) { this.#vertexElementFormat = value; }
  public get VertexElementUsage(): VertexElementUsage { return this.#vertexElementUsage; }
  public set VertexElementUsage(value: VertexElementUsage) { this.#vertexElementUsage = value; }

  public Equals(obj: unknown): boolean {
    return obj instanceof VertexElement && this.Offset === obj.Offset &&
      this.VertexElementFormat === obj.VertexElementFormat &&
      this.VertexElementUsage === obj.VertexElementUsage && this.UsageIndex === obj.UsageIndex;
  }

  public GetHashCode(): number {
    return (this.Offset | 0) ^ this.VertexElementFormat ^ this.VertexElementUsage ^ (this.UsageIndex | 0);
  }

  public ToString(): string {
    return `{Offset:${this.Offset} Format:${VertexElementFormat[this.VertexElementFormat]} ` +
      `Usage:${VertexElementUsage[this.VertexElementUsage]} UsageIndex:${this.UsageIndex}}`;
  }
}
