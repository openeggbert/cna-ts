import { ArgumentException, ArgumentOutOfRangeException } from "./exceptions.js";
import { BoundingSphere } from "../Microsoft/Xna/Framework/BoundingSphere.js";
import { Matrix } from "../Microsoft/Xna/Framework/Matrix.js";
import { Rectangle } from "../Microsoft/Xna/Framework/Rectangle.js";
import { Vector3 } from "../Microsoft/Xna/Framework/Vector3.js";
import type { ContentReader } from "../Microsoft/Xna/Framework/Content/ContentReader.js";
import { ContentTypeReader } from "../Microsoft/Xna/Framework/Content/ContentTypeReader.js";
import { registerContentTypeReaderForInternalUse } from
  "../Microsoft/Xna/Framework/Content/ContentTypeReaderManager.js";
import { GraphicsDevice } from "../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import { GraphicsDeviceManager } from "../Microsoft/Xna/Framework/GraphicsDeviceManager.js";
import { SurfaceFormat } from "../Microsoft/Xna/Framework/Graphics/DeviceEnums.js";
import { BasicEffect } from "../Microsoft/Xna/Framework/Graphics/StockEffects.js";
import { IndexBuffer, setIndexBufferRawForInternalUse } from
  "../Microsoft/Xna/Framework/Graphics/IndexBuffer.js";
import { Model, createModelForInternalUse } from "../Microsoft/Xna/Framework/Graphics/Model.js";
import { SpriteFont, createSpriteFontForInternalUse } from
  "../Microsoft/Xna/Framework/Graphics/SpriteFont.js";
import { Texture2D } from "../Microsoft/Xna/Framework/Graphics/Texture2D.js";
import { VertexBuffer, setVertexBufferRawForInternalUse } from
  "../Microsoft/Xna/Framework/Graphics/VertexBuffer.js";
import { VertexDeclaration } from "../Microsoft/Xna/Framework/Graphics/VertexDeclaration.js";
import { VertexElement } from "../Microsoft/Xna/Framework/Graphics/VertexElement.js";
import {
  BufferUsage,
  IndexElementSize,
  VertexElementFormat,
  VertexElementUsage,
} from "../Microsoft/Xna/Framework/Graphics/VertexEnums.js";
import {
  decodeTextureTransfer,
  resolveTextureElementCodec,
  textureRegionByteCount,
} from "./texture-transfer.js";

class Texture2DReader extends ContentTypeReader {
  public constructor() { super(Texture2D); }
  protected Read(input: ContentReader, existingInstance: unknown): unknown {
    if (existingInstance != null) {
      throw new ArgumentException("Texture2DReader cannot populate an existing texture in this slice");
    }
    const format = input.ReadInt32();
    const width = input.ReadInt32();
    const height = input.ReadInt32();
    const mipCount = input.ReadInt32();
    if (mipCount < 1) throw new ArgumentOutOfRangeException("mipCount");
    const texture = new Texture2D(graphicsDevice(input), width, height, mipCount > 1, format);
    try {
      for (let level = 0; level < mipCount; level += 1) {
        const count = input.ReadInt32();
        const bytes = input.ReadBytes(count);
        const levelWidth = Math.max(1, width >> level);
        const levelHeight = Math.max(1, height >> level);
        const requiredBytes = textureRegionByteCount(format, levelWidth, levelHeight);
        if (bytes.length !== requiredBytes) {
          throw new ArgumentException(
            `Texture mip ${level} contains ${bytes.length} bytes; ${requiredBytes} are required`,
          );
        }
        const elementCount = format === SurfaceFormat.Dxt1 ||
            format === SurfaceFormat.Dxt3 || format === SurfaceFormat.Dxt5
          ? requiredBytes
          : format === SurfaceFormat.Color ? requiredBytes / 4
            : canonicalElementCount(format, levelWidth * levelHeight);
        const elements: unknown[] = new Array(elementCount);
        const codec = resolveTextureElementCodec(
          elements, 0, elementCount, format, requiredBytes, true,
        );
        decodeTextureTransfer(elements, codec, bytes, 0, elementCount);
        type TransferTexture = {
          SetData(
            level: number, rectangle: null, data: readonly unknown[],
            startIndex: number, elementCount: number,
          ): void;
        };
        (texture as unknown as TransferTexture).SetData(level, null, elements, 0, elements.length);
      }
      return texture;
    } catch (error) {
      texture.Dispose();
      throw error;
    }
  }
}

function canonicalElementCount(format: SurfaceFormat, texelCount: number): number {
  switch (format) {
    case SurfaceFormat.Bgr565:
    case SurfaceFormat.Bgra5551:
    case SurfaceFormat.Bgra4444:
    case SurfaceFormat.NormalizedByte2:
    case SurfaceFormat.NormalizedByte4:
    case SurfaceFormat.Rgba1010102:
    case SurfaceFormat.Rg32:
    case SurfaceFormat.Rgba64:
    case SurfaceFormat.Alpha8:
    case SurfaceFormat.Single:
    case SurfaceFormat.Vector2:
    case SurfaceFormat.Vector4:
    case SurfaceFormat.HalfSingle:
    case SurfaceFormat.HalfVector2:
    case SurfaceFormat.HalfVector4:
    case SurfaceFormat.HdrBlendable:
      return texelCount;
    default:
      throw new ArgumentException(`Unsupported XNB texture surface format ${format}`);
  }
}

class RectangleListReader extends ContentTypeReader {
  public constructor() { super(Array); }
  protected Read(input: ContentReader): unknown {
    return list(input, () => new Rectangle(
      input.ReadInt32(), input.ReadInt32(), input.ReadInt32(), input.ReadInt32(),
    ));
  }
}

class CharacterListReader extends ContentTypeReader {
  public constructor() { super(Array); }
  protected Read(input: ContentReader): unknown { return list(input, () => input.ReadChar()); }
}

class Vector3ListReader extends ContentTypeReader {
  public constructor() { super(Array); }
  protected Read(input: ContentReader): unknown { return list(input, () => input.ReadVector3()); }
}

class RectangleReader extends ContentTypeReader {
  public constructor() { super(Rectangle); }
  protected Read(input: ContentReader): unknown {
    return new Rectangle(input.ReadInt32(), input.ReadInt32(), input.ReadInt32(), input.ReadInt32());
  }
}

class CharacterReader extends ContentTypeReader {
  public constructor() { super(String); }
  protected Read(input: ContentReader): unknown { return input.ReadChar(); }
}

class Vector3Reader extends ContentTypeReader {
  public constructor() { super(Vector3); }
  protected Read(input: ContentReader): unknown { return input.ReadVector3(); }
}

class SpriteFontReader extends ContentTypeReader {
  public constructor() { super(SpriteFont); }
  protected Read(input: ContentReader, existingInstance: unknown): unknown {
    if (existingInstance != null) {
      throw new ArgumentException("SpriteFontReader cannot populate an existing SpriteFont");
    }
    const texture = input.ReadObject<Texture2D>();
    const glyphBounds = input.ReadObject<Rectangle[]>();
    const cropping = input.ReadObject<Rectangle[]>();
    const characters = input.ReadObject<string[]>();
    const lineSpacing = input.ReadInt32();
    const spacing = input.ReadSingle();
    const kerning = input.ReadObject<Vector3[]>();
    const defaultCharacter = input.ReadBoolean() ? input.ReadChar() : null;
    return createSpriteFontForInternalUse({
      Texture: texture,
      GlyphBounds: glyphBounds,
      Cropping: cropping,
      Characters: characters,
      LineSpacing: lineSpacing,
      Spacing: spacing,
      Kerning: kerning,
      DefaultCharacter: defaultCharacter,
    });
  }
}

class StringReader extends ContentTypeReader {
  public constructor() { super(String); }
  protected Read(input: ContentReader): unknown { return input.ReadString(); }
}

type ModelPartPlan = {
  readonly VertexOffset: number;
  readonly NumVertices: number;
  readonly StartIndex: number;
  readonly PrimitiveCount: number;
  VertexBuffer: VertexBuffer | null;
  IndexBuffer: IndexBuffer | null;
  Effect: BasicEffect | null;
};
type ModelMeshPlan = {
  readonly Name: string;
  readonly ParentBoneIndex: number;
  readonly BoundingSphere: BoundingSphere;
  readonly Parts: ModelPartPlan[];
};

class ModelPlan {
  readonly #device: GraphicsDevice;
  readonly #bones: ReadonlyArray<{
    readonly Name: string; readonly Transform: Matrix; ParentIndex: number;
  }>;
  readonly #meshes: readonly ModelMeshPlan[];
  readonly #root: number;
  public constructor(
    device: GraphicsDevice,
    bones: ReadonlyArray<{ readonly Name: string; readonly Transform: Matrix; ParentIndex: number }>,
    meshes: readonly ModelMeshPlan[],
    root: number,
  ) {
    this.#device = device; this.#bones = bones; this.#meshes = meshes; this.#root = root;
  }
  public FinalizeContentForInternalUse(): Model {
    return createModelForInternalUse(this.#device, {
      Bones: this.#bones,
      RootBoneIndex: this.#bones.length === 0 ? -1 : this.#root < 0 ? 0 : this.#root,
      Meshes: this.#meshes.map((mesh) => ({
        Name: mesh.Name,
        ParentBoneIndex: mesh.ParentBoneIndex < 0 ? 0 : mesh.ParentBoneIndex,
        BoundingSphere: mesh.BoundingSphere,
        Parts: mesh.Parts.map((part) => ({
          VertexBuffer: part.VertexBuffer,
          IndexBuffer: part.IndexBuffer,
          Effect: part.Effect,
          NumVertices: part.NumVertices,
          PrimitiveCount: part.PrimitiveCount,
          StartIndex: part.StartIndex,
          VertexOffset: part.VertexOffset,
        })),
      })),
    });
  }
}

class ModelReader extends ContentTypeReader {
  public constructor() { super(Model); }
  protected Read(input: ContentReader, existingInstance: unknown): unknown {
    if (existingInstance != null) throw new ArgumentException("ModelReader cannot populate an existing Model");
    const count = plausibleCount(input.ReadUInt32(), "bone");
    const bones = Array.from({ length: count }, () => ({
      Name: input.ReadObject<string>(), Transform: input.ReadMatrix(), ParentIndex: -1,
    }));
    for (let parentIndex = 0; parentIndex < bones.length; parentIndex += 1) {
      readBoneReference(input, bones.length);
      const children = plausibleCount(input.ReadUInt32(), "bone child");
      for (let child = 0; child < children; child += 1) {
        const childIndex = readBoneReference(input, bones.length);
        if (childIndex >= 0) {
          if (bones[childIndex].ParentIndex >= 0) {
            throw new ArgumentException("A model bone has more than one parent");
          }
          bones[childIndex].ParentIndex = parentIndex;
        }
      }
    }
    const meshCount = plausibleCount(input.ReadInt32(), "mesh");
    const meshes = Array.from({ length: meshCount }, () => {
      const name = input.ReadObject<string>();
      const parentBoneIndex = readBoneReference(input, bones.length);
      const sphere = new BoundingSphere(input.ReadVector3(), input.ReadSingle());
      rejectTag(input, `Mesh '${name}'`);
      const partCount = plausibleCount(input.ReadInt32(), "mesh part");
      const parts = Array.from({ length: partCount }, (_value, index): ModelPartPlan => {
        const part: ModelPartPlan = {
          VertexOffset: input.ReadInt32(), NumVertices: input.ReadInt32(),
          StartIndex: input.ReadInt32(), PrimitiveCount: input.ReadInt32(),
          VertexBuffer: null, IndexBuffer: null, Effect: null,
        };
        rejectTag(input, `Mesh '${name}' part ${index}`);
        input.ReadSharedResource<VertexBuffer>((value) => {
          if (!(value instanceof VertexBuffer)) throw new ArgumentException("Model shared resource is not a VertexBuffer");
          part.VertexBuffer = value;
        });
        input.ReadSharedResource<IndexBuffer>((value) => {
          if (!(value instanceof IndexBuffer)) throw new ArgumentException("Model shared resource is not an IndexBuffer");
          part.IndexBuffer = value;
        });
        input.ReadSharedResource<BasicEffect>((value) => {
          if (!(value instanceof BasicEffect)) throw new ArgumentException("Model shared resource is not a BasicEffect");
          part.Effect = value;
        });
        return part;
      });
      return { Name: name, ParentBoneIndex: parentBoneIndex, BoundingSphere: sphere, Parts: parts };
    });
    const root = readBoneReference(input, bones.length);
    rejectTag(input, "Model");
    if (bones.length === 0 && (meshes.length !== 0 || root >= 0)) {
      throw new ArgumentException("A model with meshes or a root requires at least one bone");
    }
    return new ModelPlan(graphicsDevice(input), bones, meshes, root);
  }
}

class VertexBufferReader extends ContentTypeReader {
  public constructor() { super(VertexBuffer); }
  protected Read(input: ContentReader, existingInstance: unknown): unknown {
    if (existingInstance != null) throw new ArgumentException("VertexBufferReader cannot populate an existing buffer");
    const stride = input.ReadInt32();
    const elementCount = plausibleCount(input.ReadInt32(), "vertex element", 1024);
    const elements = Array.from({ length: elementCount }, () => new VertexElement(
      input.ReadInt32(), input.ReadInt32() as VertexElementFormat,
      input.ReadInt32() as VertexElementUsage, input.ReadInt32(),
    ));
    const declaration = new VertexDeclaration(stride, elements);
    const vertexCount = plausibleCount(input.ReadUInt32(), "vertex");
    if (vertexCount === 0) throw new ArgumentOutOfRangeException("vertexCount");
    const byteCount = vertexCount * stride;
    if (!Number.isSafeInteger(byteCount)) throw new ArgumentOutOfRangeException("vertex byte count");
    const bytes = input.ReadBytes(byteCount);
    const buffer = new VertexBuffer(
      graphicsDevice(input), declaration, vertexCount, BufferUsage.None,
    );
    try {
      setVertexBufferRawForInternalUse(buffer, bytes);
      return buffer;
    } catch (error) {
      buffer.Dispose();
      throw error;
    }
  }
}

class IndexBufferReader extends ContentTypeReader {
  public constructor() { super(IndexBuffer); }
  protected Read(input: ContentReader, existingInstance: unknown): unknown {
    if (existingInstance != null) throw new ArgumentException("IndexBufferReader cannot populate an existing buffer");
    const size = input.ReadBoolean() ? IndexElementSize.SixteenBits : IndexElementSize.ThirtyTwoBits;
    const byteCount = input.ReadInt32();
    const width = size === IndexElementSize.SixteenBits ? 2 : 4;
    if (byteCount <= 0 || byteCount % width !== 0) throw new ArgumentOutOfRangeException("index byte count");
    const bytes = input.ReadBytes(byteCount);
    const buffer = new IndexBuffer(
      graphicsDevice(input), size, byteCount / width, BufferUsage.None,
    );
    try {
      setIndexBufferRawForInternalUse(buffer, bytes);
      return buffer;
    } catch (error) {
      buffer.Dispose();
      throw error;
    }
  }
}

class BasicEffectReader extends ContentTypeReader {
  public constructor() { super(BasicEffect); }
  protected Read(input: ContentReader, existingInstance: unknown): unknown {
    if (existingInstance != null) throw new ArgumentException("BasicEffectReader cannot populate an existing effect");
    const texture = input.ReadExternalReference(Texture2D);
    const effect = new BasicEffect(graphicsDevice(input));
    try {
      effect.Texture = texture;
      effect.DiffuseColor = input.ReadVector3();
      effect.EmissiveColor = input.ReadVector3();
      effect.SpecularColor = input.ReadVector3();
      effect.SpecularPower = input.ReadSingle();
      effect.Alpha = input.ReadSingle();
      effect.VertexColorEnabled = input.ReadBoolean();
      return effect;
    } catch (error) {
      effect.Dispose();
      throw error;
    }
  }
}

function plausibleCount(value: number, name: string, maximum = 1_000_000): number {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new ArgumentOutOfRangeException(`${name} count`);
  }
  return value;
}

function readBoneReference(input: ContentReader, boneCount: number): number {
  const raw = boneCount < 255 ? input.ReadByte() : input.ReadUInt32();
  if (raw === 0) return -1;
  if (raw > boneCount) throw new ArgumentOutOfRangeException("bone reference");
  return raw - 1;
}

function rejectTag(input: ContentReader, context: string): void {
  if (input.ReadObject<unknown>() != null) {
    throw new ArgumentException(`${context} contains a non-null XNB Tag`);
  }
}

function list<T>(input: ContentReader, read: () => T): T[] {
  const count = input.ReadInt32();
  if (count < 0 || count > 1_000_000) throw new ArgumentOutOfRangeException("count");
  return Array.from({ length: count }, read);
}

function graphicsDevice(input: ContentReader): GraphicsDevice {
  const provider = input.ContentManager.ServiceProvider;
  const direct = provider.GetService(GraphicsDevice);
  if (direct instanceof GraphicsDevice) return direct;
  const manager = provider.GetService(GraphicsDeviceManager);
  if (manager instanceof GraphicsDeviceManager) return manager.GraphicsDevice;
  throw new ArgumentException("Texture content requires a GraphicsDevice service");
}

const registrations = [
  ["Microsoft.Xna.Framework.Content.Texture2DReader", Texture2DReader, Texture2D],
  ["Microsoft.Xna.Framework.Content.SpriteFontReader", SpriteFontReader, SpriteFont],
  ["Microsoft.Xna.Framework.Content.ListReader`1[[Microsoft.Xna.Framework.Rectangle]]", RectangleListReader, Array],
  ["Microsoft.Xna.Framework.Content.ListReader`1[[System.Char]]", CharacterListReader, Array],
  ["Microsoft.Xna.Framework.Content.ListReader`1[[Microsoft.Xna.Framework.Vector3]]", Vector3ListReader, Array],
  ["Microsoft.Xna.Framework.Content.RectangleReader", RectangleReader, Rectangle],
  ["Microsoft.Xna.Framework.Content.CharReader", CharacterReader, String],
  ["Microsoft.Xna.Framework.Content.Vector3Reader", Vector3Reader, Vector3],
  ["Microsoft.Xna.Framework.Content.StringReader", StringReader, String],
  ["Microsoft.Xna.Framework.Content.ModelReader", ModelReader, Model],
  ["Microsoft.Xna.Framework.Content.VertexBufferReader", VertexBufferReader, VertexBuffer],
  ["Microsoft.Xna.Framework.Content.IndexBufferReader", IndexBufferReader, IndexBuffer],
  ["Microsoft.Xna.Framework.Content.BasicEffectReader", BasicEffectReader, BasicEffect],
] as const;

for (const [name, reader, target] of registrations) {
  registerContentTypeReaderForInternalUse(name, reader, target);
}
