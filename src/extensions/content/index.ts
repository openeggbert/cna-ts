/**
 * CNB, CNA's own compiled content format.
 *
 * `.cnb` is not `.xnb`, and this package deliberately keeps them apart. XNB is Microsoft's format
 * and `ContentManager.Load` reads it; CNB is CNA's, it carries asset types XNA never had, and its
 * containers are self-describing, checksummed and versioned in ways XNB is not. Pretending one is
 * the other would make both worse, so CNB lives here — outside `Microsoft.Xna.Framework`, on its
 * own package subpath — and produces the ordinary XNA objects a game already knows how to draw.
 *
 * ```ts
 * import { CnbDocument, CreateTexture2DFromCnb } from "cna-ts/extensions/content";
 *
 * using document = CnbDocument.Parse(bytes, "hero.cnb");
 * const hero = CreateTexture2DFromCnb(GraphicsDevice, document);
 * ```
 *
 * ## What owns what
 *
 * Three things own native memory and each is an explicit `Dispose()`: {@link CnbDocument},
 * {@link CnbTextureData} and {@link CnbSpriteFontData}. Everything else a document hands back is a
 * **copied immutable snapshot** — a chunk's bytes, its table-of-contents row, an external
 * reference's name — because a small payload is safer as a JavaScript copy than as a view into
 * memory a `Dispose()` can take away. Garbage collection is not an ownership strategy for native
 * objects; where CNA owns something, this API says `Dispose`.
 *
 * A {@link Texture2D} or {@link SpriteFont} created from a document is an ordinary owned XNA
 * resource with no remaining tie to the document: its pixels were copied into GPU storage during
 * creation, so disposing the document does not disturb it.
 */

import { getBackend } from "../../internal/backend.js";
import type { CnaContentBackend } from "../../internal/backend.js";
import { NativeUnavailableError } from "../../internal/native-error.js";
import {
  ArgumentException,
  ArgumentNullException,
  ObjectDisposedException,
} from "../../internal/exceptions.js";
import type { IDisposable } from "../../Microsoft/Xna/Framework/Contracts.js";
import { Rectangle } from "../../Microsoft/Xna/Framework/Rectangle.js";
import { Vector3 } from "../../Microsoft/Xna/Framework/Vector3.js";
import type { GraphicsDevice } from "../../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import { SurfaceFormat } from "../../Microsoft/Xna/Framework/Graphics/DeviceEnums.js";
import {
  setTexture2DLevelBytesForInternalUse,
  Texture2D,
} from "../../Microsoft/Xna/Framework/Graphics/Texture2D.js";
import type { SpriteFont } from "../../Microsoft/Xna/Framework/Graphics/SpriteFont.js";
import { createSpriteFontForInternalUse } from "../../Microsoft/Xna/Framework/Graphics/SpriteFont.js";
import type { NativeHandle } from "../../internal/ownership.js";

/**
 * The asset type a `.cnb` container declares.
 *
 * These are wire values and are proved member by member against `cnb.h` by
 * `npm run verify:cna-contract`, so an ordering that looks obvious but is wrong is a build failure
 * rather than a file read as the wrong asset. `Effect` is deliberately absent: CNA reserves the
 * identifier but defines no schema for it, because a container carrying one renderer's shader
 * bytecode would be useless on the others.
 */
export enum CnbAssetType {
  Invalid = 0x00000000,
  Texture2D = 0x00000001,
  Texture3D = 0x00000002,
  TextureCube = 0x00000003,
  SpriteFont = 0x00000004,
  Model = 0x00000005,
  AnimationClip = 0x00000006,
  Curve = 0x00000007,
  SoundEffect = 0x00000008,
  Song = 0x00000009,
  Video = 0x0000000a,
}

/**
 * A chunk's storage codec.
 *
 * The numbers are wire format and frozen: codec 2 is Zstandard in every `.cnb` ever written,
 * whether or not a given CNA build implements it. Whether this build can expand one is a separate
 * question — {@link CnbFormat.IsCompressionSupported} answers it.
 */
export enum CnbCompression {
  None = 0,
  Lz4 = 1,
  Zstd = 2,
  Deflate = 3,
}

/**
 * A texture representation's storage format.
 *
 * A separate numbering from {@link SurfaceFormat} on purpose: XNA's enumerators carry no explicit
 * values, so inserting one would renumber the rest and silently change the meaning of every `.cnb`
 * already written. {@link CnbFormat.ToSurfaceFormat} is the deliberate bridge.
 */
export enum CnbTextureFormat {
  Unknown = 0,
  Rgba8 = 1,
  Bgra8 = 2,
  Rgba8Srgb = 3,
  Bgr565 = 4,
  Bgra5551 = 5,
  Bgra4444 = 6,
  Alpha8 = 7,
  R8 = 8,
  R16 = 9,
  Rg16 = 10,
  Rgba16 = 11,
  Rg8Snorm = 12,
  Rgba8Snorm = 13,
  Rgb10A2 = 14,
  R32Float = 15,
  Rg32Float = 16,
  Rgba32Float = 17,
  R16Float = 18,
  Rg16Float = 19,
  Rgba16Float = 20,
  HdrBlendable = 21,
  Bc1 = 22,
  Bc2 = 23,
  Bc3 = 24,
  Bc3Srgb = 25,
  Bc7 = 26,
  Bc7Srgb = 27,
}

/** One table-of-contents row, copied out of the document. */
export interface CnbChunk {
  /** The four-character identifier, as text: `"CMET"`, `"TEXH"`, and so on. */
  readonly Id: string;
  /** The identifier's numeric form, which is what the container actually stores. */
  readonly RawId: number;
  /** Whether a reader that does not understand this chunk must refuse the whole file. */
  readonly IsMandatory: boolean;
  /** How the chunk is stored. */
  readonly Compression: CnbCompression;
  /** The chunk's logical size, after decompression. */
  readonly ByteLength: number;
  /** How many bytes it occupies in the file. */
  readonly StoredByteLength: number;
  /** Its absolute offset in the file. */
  readonly Offset: number;
  /** The power-of-two alignment that offset satisfies. */
  readonly Alignment: number;
  /** CRC-32C of the stored bytes, which parsing has already verified. */
  readonly Checksum: number;
}

/** One `XREF` row: an asset this file refers to by logical name but does not embed. */
export interface CnbExternalReference {
  readonly Name: string;
  readonly Flags: number;
  /** The asset type the referring schema expects, or {@link CnbAssetType.Invalid} for unconstrained. */
  readonly ExpectedAssetType: CnbAssetType;
}

/** The `CMET` chunk: what this asset is and where it came from. */
export interface CnbMetadata {
  /** False for a built-in asset type whose file simply carries no `CMET` chunk. */
  readonly IsPresent: boolean;
  readonly AssetTypeName: string;
  readonly ContentName: string;
  readonly Flags: number;
}

function content(operation: string): CnaContentBackend {
  const backend = getBackend().Content;
  if (!backend) {
    throw new NativeUnavailableError(
      `${operation} requires a CNA backend with the CNB content routes; ` +
      "load the Node-API backend with LoadNodeNativeBackend",
    );
  }
  return backend;
}

/** Container-level identities and arithmetic; none of it needs a document or a device. */
export const CnbFormat = {
  /** Whether a byte image begins with the `.cnb` magic. Says nothing about the rest of the file. */
  HasMagic(bytes: Uint8Array): boolean {
    if (bytes == null) throw new ArgumentNullException("bytes");
    return content("CnbFormat.HasMagic").cnbHasMagic(bytes);
  },
  /** The four magic bytes themselves. */
  Magic(): Uint8Array { return content("CnbFormat.Magic").cnbFormatMagic(); },
  /** CRC-32C, the checksum the container uses for its header and every chunk. */
  Crc32c(bytes: Uint8Array): number {
    if (bytes == null) throw new ArgumentNullException("bytes");
    return content("CnbFormat.Crc32c").cnbCrc32c(bytes);
  },
  /** Whether this CNA build can actually expand a codec, as opposed to naming it. */
  IsCompressionSupported(codec: CnbCompression): boolean {
    return content("CnbFormat.IsCompressionSupported").cnbIsCompressionSupported(codec);
  },
  GetCompressionName(codec: CnbCompression): string {
    return content("CnbFormat.GetCompressionName").cnbCompressionName(codec);
  },
  /**
   * The short name of a built-in asset type identity, such as `"Texture2D"`.
   *
   * Not the fully qualified CLR type name: that lives in a file's `CMET` chunk and is read from
   * {@link CnbDocument.Metadata}, because it belongs to the file rather than to the identity.
   */
  GetAssetTypeName(assetType: CnbAssetType | number): string {
    return content("CnbFormat.GetAssetTypeName").cnbAssetTypeName(assetType);
  },
  /**
   * The 31-bit identity a custom asset type name hashes to. This is the whole extension mechanism:
   * a `.cnb` names its asset type as one number, and whoever registered that number decodes it.
   */
  GetAssetTypeId(name: string): number {
    if (name == null) throw new ArgumentNullException("name");
    return content("CnbFormat.GetAssetTypeId").cnbAssetTypeIdFromName(name);
  },
  IsCustomAssetType(assetType: CnbAssetType | number): boolean {
    return content("CnbFormat.IsCustomAssetType").cnbIsCustomAssetTypeId(assetType);
  },
  /**
   * The numeric form of a four-character chunk identifier.
   *
   * Every byte must be printable ASCII. An identifier starting with an uppercase letter is reserved
   * for CNA's own schemas; a game defining its own uses a lowercase first letter.
   */
  MakeChunkId(id: string): number {
    if (id == null) throw new ArgumentNullException("id");
    const bytes = new TextEncoder().encode(id);
    if (bytes.length !== 4) throw new ArgumentException("a CNB chunk identifier is four bytes");
    const backend = content("CnbFormat.MakeChunkId");
    return backend.cnbMakeChunkId(
      bytes[0] as number, bytes[1] as number, bytes[2] as number, bytes[3] as number,
    );
  },
  /** The four-character text of a numeric chunk identifier. */
  GetChunkIdText(rawId: number): string {
    return content("CnbFormat.GetChunkIdText").cnbChunkIdString(rawId);
  },
  IsWellFormedChunkId(rawId: number): boolean {
    return content("CnbFormat.IsWellFormedChunkId").cnbIsWellFormedChunkId(rawId);
  },
  GetTextureFormatName(format: CnbTextureFormat): string {
    return content("CnbFormat.GetTextureFormatName").cnbTextureFormatName(format);
  },
  IsBlockCompressed(format: CnbTextureFormat): boolean {
    return content("CnbFormat.IsBlockCompressed").cnbIsBlockCompressedTextureFormat(format);
  },
  /** Bytes per texel, or per 4x4 block for a block-compressed format. */
  GetTextureFormatUnitBytes(format: CnbTextureFormat): number {
    return content("CnbFormat.GetTextureFormatUnitBytes").cnbTextureFormatUnitBytes(format);
  },
  /**
   * The exact size of one mip level.
   *
   * A block-compressed level rounds each dimension up to a whole four-texel block, so a 1x1 BC7
   * level is a full sixteen-byte block rather than a fraction of one. Computing `width * height *
   * unit` by hand gets that wrong; this does not.
   */
  GetTextureLevelByteSize(
    format: CnbTextureFormat, width: number, height: number, depth = 1,
  ): number {
    return content("CnbFormat.GetTextureLevelByteSize")
      .cnbTextureLevelByteSize(format, width, height, depth);
  },
  /** The XNA {@link SurfaceFormat} a CNB storage format corresponds to. */
  ToSurfaceFormat(format: CnbTextureFormat): SurfaceFormat {
    return content("CnbFormat.ToSurfaceFormat").cnbTextureFormatToSurfaceFormat(format) as SurfaceFormat;
  },
} as const;

const documentHandles = new WeakMap<CnbDocument, NativeHandle>();

function documentHandle(document: CnbDocument, operation: string): NativeHandle {
  const handle = documentHandles.get(document);
  if (handle == null) throw new ObjectDisposedException(`CnbDocument.${operation}`);
  return handle;
}

/**
 * A parsed, fully validated `.cnb` container.
 *
 * A document that exists is a container that is structurally sound: parsing checks the magic, the
 * versions, the reserved fields, both structural checksums, every chunk checksum, overflow-safe
 * offset arithmetic, alignment, table-of-contents ordering and exact non-overlapping coverage of
 * the file before any accessor hands out a byte. Whatever reads a chunk afterwards only has to
 * worry about its own contents.
 */
export class CnbDocument implements IDisposable {
  readonly #info: {
    readonly ContainerMajor: number;
    readonly ContainerMinor: number;
    readonly AssetTypeId: number;
    readonly AssetSchemaVersion: number;
    readonly ChunkCount: number;
    readonly ExternalReferenceCount: number;
    readonly Origin: string;
    readonly MetadataPresent: boolean;
    readonly MetadataFlags: number;
    readonly MetadataAssetTypeName: string;
    readonly MetadataContentName: string;
  };
  #chunks: readonly CnbChunk[] | null = null;
  #externalReferences: readonly CnbExternalReference[] | null = null;

  private constructor(handle: NativeHandle) {
    documentHandles.set(this, handle);
    this.#info = content("CnbDocument.Parse").cnbDocumentGetInfo(handle);
  }

  /**
   * Parses a complete `.cnb` byte image. The bytes are copied into the document, which then owns
   * them, so the caller's array need not outlive it.
   *
   * @param origin A name used in diagnostics, normally the file path the bytes came from.
   */
  public static Parse(bytes: Uint8Array, origin = ""): CnbDocument {
    if (bytes == null) throw new ArgumentNullException("bytes");
    if (typeof origin !== "string") throw new ArgumentException("origin must be a string");
    return new CnbDocument(content("CnbDocument.Parse").cnbDocumentParse(bytes, origin));
  }

  /** The container format version this file was written at. */
  public get ContainerVersion(): { readonly Major: number; readonly Minor: number } {
    return { Major: this.#info.ContainerMajor, Minor: this.#info.ContainerMinor };
  }
  /** The asset type identity the container declares. */
  public get AssetType(): CnbAssetType { return this.#info.AssetTypeId as CnbAssetType; }
  /** The schema version that asset type was written at. */
  public get AssetSchemaVersion(): number { return this.#info.AssetSchemaVersion; }
  /** The diagnostic name this document was parsed with. */
  public get Origin(): string { return this.#info.Origin; }

  /** The `CMET` chunk, or an absent one for a built-in type that carries none. */
  public get Metadata(): CnbMetadata {
    return Object.freeze({
      IsPresent: this.#info.MetadataPresent,
      AssetTypeName: this.#info.MetadataAssetTypeName,
      ContentName: this.#info.MetadataContentName,
      Flags: this.#info.MetadataFlags,
    });
  }

  /**
   * Every table-of-contents row, in file order, as copied snapshots.
   *
   * The container's own chunks are always written first, ahead of the schema's, so address a chunk
   * by {@link CnbChunk.Id} through {@link Find} rather than by position.
   */
  public get Chunks(): readonly CnbChunk[] {
    if (this.#chunks) return this.#chunks;
    const handle = documentHandle(this, "Chunks");
    const backend = content("CnbDocument.Chunks");
    const chunks: CnbChunk[] = [];
    for (let index = 0; index < this.#info.ChunkCount; index += 1) {
      const entry = backend.cnbDocumentGetChunk(handle, index);
      chunks.push(Object.freeze({
        Id: backend.cnbChunkIdString(entry.Type),
        RawId: entry.Type,
        // Bit zero of the flags is CNB's mandatory flag; reading it here rather than calling the
        // separate predicate keeps one table-of-contents row to one native call.
        IsMandatory: (entry.Flags & 1) !== 0,
        Compression: entry.Compression as CnbCompression,
        ByteLength: entry.ByteLength,
        StoredByteLength: entry.StoredByteLength,
        Offset: entry.Offset,
        Alignment: entry.Alignment,
        Checksum: entry.Checksum,
      }));
    }
    this.#chunks = Object.freeze(chunks);
    return this.#chunks;
  }

  /** Every asset this file names but does not embed. */
  public get ExternalReferences(): readonly CnbExternalReference[] {
    if (this.#externalReferences) return this.#externalReferences;
    const handle = documentHandle(this, "ExternalReferences");
    const backend = content("CnbDocument.ExternalReferences");
    const references: CnbExternalReference[] = [];
    for (let index = 0; index < this.#info.ExternalReferenceCount; index += 1) {
      const entry = backend.cnbDocumentGetExternalReference(handle, index);
      references.push(Object.freeze({
        Name: entry.Name,
        Flags: entry.Flags,
        ExpectedAssetType: entry.ExpectedAssetTypeId as CnbAssetType,
      }));
    }
    this.#externalReferences = Object.freeze(references);
    return this.#externalReferences;
  }

  /** The indexes of every chunk carrying an identifier, in file order. */
  public Find(id: string): readonly number[] {
    return content("CnbDocument.Find")
      .cnbDocumentFindAll(documentHandle(this, "Find"), CnbFormat.MakeChunkId(id));
  }

  /**
   * A copy of one chunk's logical bytes, decompressed if the chunk was stored compressed.
   *
   * A copy rather than a view: a chunk payload is small enough that owning it outright is cheaper
   * than a lifetime rule, and a view would dangle the moment this document is disposed.
   */
  public ReadChunk(index: number): Uint8Array {
    if (!Number.isInteger(index) || index < 0 || index >= this.#info.ChunkCount) {
      throw new ArgumentException(`no CNB chunk at index ${index}`);
    }
    return content("CnbDocument.ReadChunk")
      .cnbDocumentCopyChunkData(documentHandle(this, "ReadChunk"), index);
  }

  /**
   * Refuses the document when it carries a mandatory chunk outside @p known.
   *
   * This is CNB's forward-compatibility rule made explicit: a decoder that skipped a chunk it did
   * not understand would silently drop content the author marked as required.
   */
  public RequireMandatoryChunksUnderstood(known: readonly string[]): void {
    if (known == null) throw new ArgumentNullException("known");
    content("CnbDocument.RequireMandatoryChunksUnderstood")
      .cnbDocumentRequireMandatoryChunksUnderstood(
        documentHandle(this, "RequireMandatoryChunksUnderstood"),
        known.map((id) => CnbFormat.MakeChunkId(id)),
      );
  }

  /** Whether this document has been released. */
  public get IsDisposed(): boolean { return !documentHandles.has(this); }

  /** Releases the parsed container. Idempotent, like every `Dispose` in this package. */
  public Dispose(): void {
    const handle = documentHandles.get(this);
    if (handle == null) return;
    documentHandles.delete(this);
    content("CnbDocument.Dispose").cnbDocumentDestroy(handle);
  }
}

const textureHandles = new WeakMap<CnbTextureData, NativeHandle>();

function textureHandle(texture: CnbTextureData, operation: string): NativeHandle {
  const handle = textureHandles.get(texture);
  if (handle == null) throw new ObjectDisposedException(`CnbTextureData.${operation}`);
  return handle;
}

/**
 * A decoded texture, independent of any GPU object.
 *
 * A texture may carry the same image more than once — as `Rgba8` and again as `Bc7`, say — so a
 * runtime picks whichever format it can upload without needing a second asset. Each of those is a
 * **representation**, recorded in the author's preference order, and its levels are ordered
 * face-major then mip: `face * MipCount + mip`.
 */
export class CnbTextureData implements IDisposable {
  private constructor(handle: NativeHandle) { textureHandles.set(this, handle); }

  /** Decodes the 2D texture a document carries. */
  public static Decode(document: CnbDocument): CnbTextureData {
    if (document == null) throw new ArgumentNullException("document");
    return new CnbTextureData(content("CnbTextureData.Decode")
      .cnbDecodeTexture2D(documentHandle(document, "Decode")));
  }

  /** The common authoring case: one `Rgba8` representation with a single mip level. */
  public static FromRgba8(width: number, height: number, rgba: Uint8Array): CnbTextureData {
    if (rgba == null) throw new ArgumentNullException("rgba");
    return new CnbTextureData(content("CnbTextureData.FromRgba8")
      .cnbTextureDataCreateRgba8(width, height, rgba));
  }

  /** An empty description of a given shape, to be filled representation by representation. */
  public static Create(
    width: number, height: number, depth = 1, faceCount = 1, mipCount = 1,
  ): CnbTextureData {
    return new CnbTextureData(content("CnbTextureData.Create")
      .cnbTextureDataCreate(width, height, depth, faceCount, mipCount));
  }

  /** Level-0 dimensions plus the face, mip and representation counts. */
  public get Shape(): {
    readonly Width: number; readonly Height: number; readonly Depth: number;
    readonly FaceCount: number; readonly MipCount: number; readonly RepresentationCount: number;
  } {
    return Object.freeze({
      ...content("CnbTextureData.Shape").cnbTextureDataGetInfo(textureHandle(this, "Shape")),
    });
  }

  /** The dimensions of one mip level; each halves and never falls below one. */
  public GetLevelDimensions(level: number): {
    readonly Width: number; readonly Height: number; readonly Depth: number;
  } {
    return Object.freeze({
      ...content("CnbTextureData.GetLevelDimensions")
        .cnbTextureDataGetLevelDimensions(textureHandle(this, "GetLevelDimensions"), level),
    });
  }

  /** The storage format of one representation. */
  public GetRepresentationFormat(representation: number): CnbTextureFormat {
    return content("CnbTextureData.GetRepresentationFormat")
      .cnbTextureDataGetRepresentationFormat(
        textureHandle(this, "GetRepresentationFormat"), representation,
      ) as CnbTextureFormat;
  }

  /** How many levels one representation holds: `FaceCount * MipCount`. */
  public GetLevelCount(representation: number): number {
    return content("CnbTextureData.GetLevelCount")
      .cnbTextureDataGetLevelCount(textureHandle(this, "GetLevelCount"), representation);
  }

  /** A copy of one level's payload bytes. */
  public ReadLevel(representation: number, level: number): Uint8Array {
    return content("CnbTextureData.ReadLevel")
      .cnbTextureDataCopyLevel(textureHandle(this, "ReadLevel"), representation, level);
  }

  /** Appends a representation sized for `FaceCount * MipCount` empty levels. */
  public AddRepresentation(format: CnbTextureFormat): number {
    return content("CnbTextureData.AddRepresentation")
      .cnbTextureDataAddRepresentation(textureHandle(this, "AddRepresentation"), format);
  }

  /** Writes one level's payload bytes. */
  public SetLevel(representation: number, level: number, bytes: Uint8Array): void {
    if (bytes == null) throw new ArgumentNullException("bytes");
    content("CnbTextureData.SetLevel")
      .cnbTextureDataSetLevel(textureHandle(this, "SetLevel"), representation, level, bytes);
  }

  /**
   * The first representation whose format the caller accepts, or null.
   *
   * Absence is an ordinary answer, not a failure: a texture whose formats this consumer cannot
   * upload is a texture to fall back from, not an error. Representations are walked in the order
   * the author recorded them, so the first accepted one is the intended choice.
   */
  public SelectRepresentation(supported: (format: CnbTextureFormat) => boolean): number | null {
    if (typeof supported !== "function") throw new ArgumentException("supported must be a function");
    // Walked here rather than through CNA's callback route on purpose: the C route calls back into
    // JavaScript synchronously, and this ABI's callbacks are a lifetime contract worth spending on
    // a frame loop, not on a loop over at most eight integers.
    const count = this.Shape.RepresentationCount;
    for (let index = 0; index < count; index += 1) {
      if (supported(this.GetRepresentationFormat(index))) return index;
    }
    return null;
  }

  /** Encodes this description as a complete `.cnb` byte image. */
  public Encode(contentName = ""): Uint8Array {
    if (typeof contentName !== "string") throw new ArgumentException("contentName must be a string");
    return content("CnbTextureData.Encode")
      .cnbEncodeTexture2D(textureHandle(this, "Encode"), contentName);
  }

  public get IsDisposed(): boolean { return !textureHandles.has(this); }

  public Dispose(): void {
    const handle = textureHandles.get(this);
    if (handle == null) return;
    textureHandles.delete(this);
    content("CnbTextureData.Dispose").cnbTextureDataDestroy(handle);
  }
}

const fontHandles = new WeakMap<CnbSpriteFontData, NativeHandle>();

function fontHandle(font: CnbSpriteFontData, operation: string): NativeHandle {
  const handle = fontHandles.get(font);
  if (handle == null) throw new ObjectDisposedException(`CnbSpriteFontData.${operation}`);
  return handle;
}

/** One glyph of a compiled font, in the shape XNA's own `SpriteFont` arrays use. */
export interface CnbGlyph {
  /** The glyph's source rectangle inside the atlas. */
  readonly Bounds: Rectangle;
  /** The per-glyph cropping/offset rectangle. */
  readonly Cropping: Rectangle;
  /** The UTF-16 character this glyph draws. */
  readonly Character: string;
  /** Left bearing, glyph width and right bearing. */
  readonly Kerning: Vector3;
}

/**
 * A decoded compiled font: its whole-font metrics, its glyph table and its embedded atlas.
 *
 * The atlas is embedded rather than referenced, because an atlas belongs to exactly one font.
 * {@link CopyAtlas} therefore hands back a description of its own rather than a borrow — lending
 * the font's own would let a caller hold a texture the font's release had already destroyed.
 */
export class CnbSpriteFontData implements IDisposable {
  private constructor(handle: NativeHandle) { fontHandles.set(this, handle); }

  /** Decodes the sprite font a document carries. */
  public static Decode(document: CnbDocument): CnbSpriteFontData {
    if (document == null) throw new ArgumentNullException("document");
    return new CnbSpriteFontData(content("CnbSpriteFontData.Decode")
      .cnbDecodeSpriteFont(documentHandle(document, "Decode")));
  }

  /** An empty font description, to be given metrics, glyphs and an atlas. */
  public static Create(): CnbSpriteFontData {
    return new CnbSpriteFontData(content("CnbSpriteFontData.Create").cnbSpriteFontDataCreate());
  }

  /** Glyph count and whole-font metrics. */
  public get Metrics(): {
    readonly GlyphCount: number; readonly LineSpacing: number; readonly Spacing: number;
    readonly DefaultCharacter: string | null;
  } {
    const info = content("CnbSpriteFontData.Metrics")
      .cnbSpriteFontDataGetInfo(fontHandle(this, "Metrics"));
    return Object.freeze({
      GlyphCount: info.GlyphCount,
      LineSpacing: info.LineSpacing,
      Spacing: info.Spacing,
      // An absent fallback is null rather than U+0000: XNA's DefaultCharacter is a nullable char,
      // and a font with no fallback throws on a missing glyph instead of drawing one.
      DefaultCharacter: info.HasDefaultCharacter
        ? String.fromCharCode(info.DefaultCharacter)
        : null,
    });
  }

  /** Sets the whole-font metrics. */
  public SetMetrics(metrics: {
    readonly LineSpacing: number;
    readonly Spacing: number;
    readonly DefaultCharacter?: string | null;
  }): void {
    if (metrics == null) throw new ArgumentNullException("metrics");
    const fallback = metrics.DefaultCharacter ?? null;
    if (fallback !== null && [...fallback].length !== 1) {
      throw new ArgumentException("DefaultCharacter must be null or one UTF-16 character");
    }
    content("CnbSpriteFontData.SetMetrics").cnbSpriteFontDataSetInfo(
      fontHandle(this, "SetMetrics"),
      {
        LineSpacing: metrics.LineSpacing,
        Spacing: metrics.Spacing,
        DefaultCharacter: fallback === null ? 0 : fallback.charCodeAt(0),
        HasDefaultCharacter: fallback !== null,
      },
    );
  }

  /** One glyph, by index into the font's ascending character map. */
  public GetGlyph(index: number): CnbGlyph {
    const glyph = content("CnbSpriteFontData.GetGlyph")
      .cnbSpriteFontDataGetGlyph(fontHandle(this, "GetGlyph"), index);
    return Object.freeze({
      Bounds: new Rectangle(glyph.Bounds.X, glyph.Bounds.Y, glyph.Bounds.Width, glyph.Bounds.Height),
      Cropping: new Rectangle(
        glyph.Cropping.X, glyph.Cropping.Y, glyph.Cropping.Width, glyph.Cropping.Height,
      ),
      Character: String.fromCharCode(glyph.Character),
      Kerning: new Vector3(glyph.KerningLeft, glyph.KerningWidth, glyph.KerningRight),
    });
  }

  /**
   * Appends a glyph.
   *
   * The character map must end up strictly ascending, which CNA checks when the font is *encoded*
   * rather than here — so a table can be built in any order and sorted before it is written.
   */
  public AddGlyph(glyph: CnbGlyph): number {
    if (glyph == null) throw new ArgumentNullException("glyph");
    if ([...glyph.Character].length !== 1) {
      throw new ArgumentException("a glyph character is one UTF-16 character");
    }
    return content("CnbSpriteFontData.AddGlyph").cnbSpriteFontDataAddGlyph(
      fontHandle(this, "AddGlyph"),
      {
        Bounds: {
          X: glyph.Bounds.X, Y: glyph.Bounds.Y,
          Width: glyph.Bounds.Width, Height: glyph.Bounds.Height,
        },
        Cropping: {
          X: glyph.Cropping.X, Y: glyph.Cropping.Y,
          Width: glyph.Cropping.Width, Height: glyph.Cropping.Height,
        },
        Character: glyph.Character.charCodeAt(0),
        KerningLeft: glyph.Kerning.X,
        KerningWidth: glyph.Kerning.Y,
        KerningRight: glyph.Kerning.Z,
      },
    );
  }

  /** Copies an atlas into the font. The font keeps its own copy. */
  public SetAtlas(atlas: CnbTextureData): void {
    if (atlas == null) throw new ArgumentNullException("atlas");
    content("CnbSpriteFontData.SetAtlas")
      .cnbSpriteFontDataSetAtlas(fontHandle(this, "SetAtlas"), textureHandle(atlas, "SetAtlas"));
  }

  /** A copy of the embedded atlas, owned by the caller and disposed by the caller. */
  public CopyAtlas(): CnbTextureData {
    const handle = content("CnbSpriteFontData.CopyAtlas")
      .cnbSpriteFontDataCopyAtlas(fontHandle(this, "CopyAtlas"));
    return adoptTextureData(handle);
  }

  /** Encodes this font as a complete `.cnb` byte image. */
  public Encode(contentName = ""): Uint8Array {
    if (typeof contentName !== "string") throw new ArgumentException("contentName must be a string");
    return content("CnbSpriteFontData.Encode")
      .cnbEncodeSpriteFont(fontHandle(this, "Encode"), contentName);
  }

  public get IsDisposed(): boolean { return !fontHandles.has(this); }

  public Dispose(): void {
    const handle = fontHandles.get(this);
    if (handle == null) return;
    fontHandles.delete(this);
    content("CnbSpriteFontData.Dispose").cnbSpriteFontDataDestroy(handle);
  }
}

/** Wraps a texture-description handle CNA produced for us; used by {@link CnbSpriteFontData.CopyAtlas}. */
function adoptTextureData(handle: NativeHandle): CnbTextureData {
  const adopted = Object.create(CnbTextureData.prototype) as CnbTextureData;
  textureHandles.set(adopted, handle);
  return adopted;
}

/**
 * Uploads one representation of a decoded texture into a real {@link Texture2D}.
 *
 * The resulting texture is an ordinary owned XNA resource: its pixels are copied into GPU storage
 * here, so the description and its document may be disposed immediately afterwards.
 */
export function CreateTexture2DFromCnbTextureData(
  graphicsDevice: GraphicsDevice, texture: CnbTextureData, representation = 0,
): Texture2D {
  if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
  if (texture == null) throw new ArgumentNullException("texture");
  const shape = texture.Shape;
  if (shape.FaceCount !== 1 || shape.Depth !== 1) {
    throw new ArgumentException("CreateTexture2DFromCnbTextureData needs a 2D texture description");
  }
  const format = texture.GetRepresentationFormat(representation);
  const surfaceFormat = CnbFormat.ToSurfaceFormat(format);
  const created = new Texture2D(
    graphicsDevice, shape.Width, shape.Height, shape.MipCount > 1, surfaceFormat,
  );
  try {
    for (let mip = 0; mip < shape.MipCount; mip += 1) {
      setTexture2DLevelBytesForInternalUse(created, mip, texture.ReadLevel(representation, mip));
    }
  } catch (error) {
    created.Dispose();
    throw error;
  }
  return created;
}

/** Parses, decodes and uploads a `.cnb` 2D texture in one call. */
export function CreateTexture2DFromCnb(
  graphicsDevice: GraphicsDevice, document: CnbDocument, representation = 0,
): Texture2D {
  const decoded = CnbTextureData.Decode(document);
  try {
    return CreateTexture2DFromCnbTextureData(graphicsDevice, decoded, representation);
  } finally {
    decoded.Dispose();
  }
}

/**
 * Builds a real {@link SpriteFont} from a `.cnb` font, atlas included.
 *
 * The font's atlas becomes an owned {@link Texture2D} the returned `SpriteFont` holds, exactly as
 * the XNB reader's would, so `SpriteBatch.DrawString` works with no further ceremony.
 */
export function CreateSpriteFontFromCnb(
  graphicsDevice: GraphicsDevice, document: CnbDocument,
): SpriteFont {
  if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
  if (document == null) throw new ArgumentNullException("document");
  const decoded = CnbSpriteFontData.Decode(document);
  try {
    const metrics = decoded.Metrics;
    const glyphs: CnbGlyph[] = [];
    for (let index = 0; index < metrics.GlyphCount; index += 1) glyphs.push(decoded.GetGlyph(index));
    const atlas = decoded.CopyAtlas();
    let texture: Texture2D;
    try {
      texture = CreateTexture2DFromCnbTextureData(graphicsDevice, atlas, 0);
    } finally {
      atlas.Dispose();
    }
    try {
      return createSpriteFontForInternalUse({
        Texture: texture,
        GlyphBounds: glyphs.map((glyph) => glyph.Bounds),
        Cropping: glyphs.map((glyph) => glyph.Cropping),
        Characters: glyphs.map((glyph) => glyph.Character),
        Kerning: glyphs.map((glyph) => glyph.Kerning),
        LineSpacing: metrics.LineSpacing,
        Spacing: metrics.Spacing,
        DefaultCharacter: metrics.DefaultCharacter,
      });
    } catch (error) {
      texture.Dispose();
      throw error;
    }
  } finally {
    decoded.Dispose();
  }
}
