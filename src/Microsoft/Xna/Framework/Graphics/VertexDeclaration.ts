import { ArgumentNullException, ArgumentOutOfRangeException } from "../../../../internal/exceptions.js";
import { GraphicsResource } from "./GraphicsResource.js";
import { VertexElement } from "./VertexElement.js";
import { VertexElementFormat } from "./VertexEnums.js";

export class VertexDeclaration extends GraphicsResource {
  readonly #elements: VertexElement[];
  readonly #vertexStride: number;

  public constructor(elements: VertexElement[]);
  public constructor(vertexStride: number, elements: VertexElement[]);
  public constructor(strideOrElements: number | VertexElement[], maybeElements?: VertexElement[]) {
    super();
    const elements = Array.isArray(strideOrElements) ? strideOrElements : maybeElements;
    if (elements == null) throw new ArgumentNullException("elements");
    if (elements.length === 0) throw new ArgumentOutOfRangeException("elements");
    this.#elements = elements.map((value) => new VertexElement(
      value.Offset, value.VertexElementFormat, value.VertexElementUsage, value.UsageIndex,
    ));
    const inferred = Math.max(...this.#elements.map(
      (value) => value.Offset + vertexElementSize(value.VertexElementFormat),
    ));
    this.#vertexStride = Array.isArray(strideOrElements) ? inferred : Math.trunc(strideOrElements);
    if (this.#vertexStride <= 0 || this.#vertexStride < inferred) {
      throw new ArgumentOutOfRangeException("vertexStride");
    }
  }

  public get VertexStride(): number { return this.#vertexStride; }
  public GetVertexElements(): VertexElement[] {
    return this.#elements.map((value) => new VertexElement(
      value.Offset, value.VertexElementFormat, value.VertexElementUsage, value.UsageIndex,
    ));
  }
}

function vertexElementSize(format: VertexElementFormat): number {
  switch (format) {
    case VertexElementFormat.Single: return 4;
    case VertexElementFormat.Vector2: return 8;
    case VertexElementFormat.Vector3: return 12;
    case VertexElementFormat.Vector4: return 16;
    case VertexElementFormat.Color:
    case VertexElementFormat.Byte4:
    case VertexElementFormat.Short2:
    case VertexElementFormat.NormalizedShort2:
    case VertexElementFormat.HalfVector2: return 4;
    case VertexElementFormat.Short4:
    case VertexElementFormat.NormalizedShort4:
    case VertexElementFormat.HalfVector4: return 8;
    default: throw new ArgumentOutOfRangeException("format");
  }
}
