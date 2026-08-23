import { Color } from "../Color.js";
import type { XnaType } from "../Contracts.js";
import { Vector2 } from "../Vector2.js";
import { Vector3 } from "../Vector3.js";
import type { IVertexType } from "./IVertexType.js";
import { VertexDeclaration } from "./VertexDeclaration.js";
import { VertexElement } from "./VertexElement.js";
import { VertexElementFormat, VertexElementUsage } from "./VertexEnums.js";

function declaration(stride: number, ...elements: VertexElement[]): VertexDeclaration {
  return new VertexDeclaration(stride, elements);
}
function vector2(value: Vector2): Vector2 { return new Vector2(value.X, value.Y); }
function vector3(value: Vector3): Vector3 { return new Vector3(value.X, value.Y, value.Z); }
function color(value: Color): Color { return new Color(value.R, value.G, value.B, value.A); }
function vertexString(entries: readonly [string, { ToString(): string }][]): string {
  return `{${entries.map(([name, value]) => `${name}:${value.ToString()}`).join(" ")}}`;
}

export class VertexPositionColor implements IVertexType {
  public Position: Vector3;
  public Color: Color;
  public static readonly VertexDeclaration = declaration(16,
    new VertexElement(0, VertexElementFormat.Vector3, VertexElementUsage.Position, 0),
    new VertexElement(12, VertexElementFormat.Color, VertexElementUsage.Color, 0));
  public constructor(position: Vector3, color: Color) {
    this.Position = vector3(position); this.Color = new Color(color.R, color.G, color.B, color.A);
  }
  public get VertexDeclaration(): VertexDeclaration { return VertexPositionColor.VertexDeclaration; }
  public Equals(obj: unknown): boolean { return obj instanceof VertexPositionColor && this.Position.Equals(obj.Position) && this.Color.Equals(obj.Color); }
  public GetHashCode(): number { return this.Position.GetHashCode() ^ this.Color.GetHashCode(); }
  public ToString(): string { return vertexString([["Position", this.Position], ["Color", this.Color]]); }
}

export class VertexPositionTexture implements IVertexType {
  public Position: Vector3;
  public TextureCoordinate: Vector2;
  public static readonly VertexDeclaration = declaration(20,
    new VertexElement(0, VertexElementFormat.Vector3, VertexElementUsage.Position, 0),
    new VertexElement(12, VertexElementFormat.Vector2, VertexElementUsage.TextureCoordinate, 0));
  public constructor(position: Vector3, textureCoordinate: Vector2) {
    this.Position = vector3(position); this.TextureCoordinate = vector2(textureCoordinate);
  }
  public get VertexDeclaration(): VertexDeclaration { return VertexPositionTexture.VertexDeclaration; }
  public Equals(obj: unknown): boolean { return obj instanceof VertexPositionTexture && this.Position.Equals(obj.Position) && this.TextureCoordinate.Equals(obj.TextureCoordinate); }
  public GetHashCode(): number { return this.Position.GetHashCode() ^ this.TextureCoordinate.GetHashCode(); }
  public ToString(): string { return vertexString([["Position", this.Position], ["TextureCoordinate", this.TextureCoordinate]]); }
}

export class VertexPositionColorTexture implements IVertexType {
  public Position: Vector3;
  public Color: Color;
  public TextureCoordinate: Vector2;
  public static readonly VertexDeclaration = declaration(24,
    new VertexElement(0, VertexElementFormat.Vector3, VertexElementUsage.Position, 0),
    new VertexElement(12, VertexElementFormat.Color, VertexElementUsage.Color, 0),
    new VertexElement(16, VertexElementFormat.Vector2, VertexElementUsage.TextureCoordinate, 0));
  public constructor(position: Vector3, color: Color, textureCoordinate: Vector2) {
    this.Position = vector3(position); this.Color = new Color(color.R, color.G, color.B, color.A);
    this.TextureCoordinate = vector2(textureCoordinate);
  }
  public get VertexDeclaration(): VertexDeclaration { return VertexPositionColorTexture.VertexDeclaration; }
  public Equals(obj: unknown): boolean { return obj instanceof VertexPositionColorTexture && this.Position.Equals(obj.Position) && this.Color.Equals(obj.Color) && this.TextureCoordinate.Equals(obj.TextureCoordinate); }
  public GetHashCode(): number { return this.Position.GetHashCode() ^ this.Color.GetHashCode() ^ this.TextureCoordinate.GetHashCode(); }
  public ToString(): string { return vertexString([["Position", this.Position], ["Color", this.Color], ["TextureCoordinate", this.TextureCoordinate]]); }
}

export class VertexPositionNormalTexture implements IVertexType {
  public Position: Vector3;
  public Normal: Vector3;
  public TextureCoordinate: Vector2;
  public static readonly VertexDeclaration = declaration(32,
    new VertexElement(0, VertexElementFormat.Vector3, VertexElementUsage.Position, 0),
    new VertexElement(12, VertexElementFormat.Vector3, VertexElementUsage.Normal, 0),
    new VertexElement(24, VertexElementFormat.Vector2, VertexElementUsage.TextureCoordinate, 0));
  public constructor(position: Vector3, normal: Vector3, textureCoordinate: Vector2) {
    this.Position = vector3(position); this.Normal = vector3(normal);
    this.TextureCoordinate = vector2(textureCoordinate);
  }
  public get VertexDeclaration(): VertexDeclaration { return VertexPositionNormalTexture.VertexDeclaration; }
  public Equals(obj: unknown): boolean { return obj instanceof VertexPositionNormalTexture && this.Position.Equals(obj.Position) && this.Normal.Equals(obj.Normal) && this.TextureCoordinate.Equals(obj.TextureCoordinate); }
  public GetHashCode(): number { return this.Position.GetHashCode() ^ this.Normal.GetHashCode() ^ this.TextureCoordinate.GetHashCode(); }
  public ToString(): string { return vertexString([["Position", this.Position], ["Normal", this.Normal], ["TextureCoordinate", this.TextureCoordinate]]); }
}

/** Internal helper for XNA's vertex-type constructor token without exposing byte packing. */
export function vertexDeclarationFromTypeForInternalUse(type: XnaType<unknown>): VertexDeclaration {
  const candidate = type as XnaType<unknown> & { readonly VertexDeclaration?: VertexDeclaration };
  if (!(candidate.VertexDeclaration instanceof VertexDeclaration)) {
    throw new TypeError("vertexType must expose a static VertexDeclaration");
  }
  return candidate.VertexDeclaration;
}
