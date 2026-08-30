/**
 * The WebAssembly backend's `CnaContentBackend` facade: CNB in a browser.
 *
 * `cna-ts/extensions/content` is backend-neutral by construction — nothing in it names Node, and
 * nothing in it is a Node-shaped abstraction — so a page gets the same `CnbDocument`,
 * `CnbTextureData` and `CnbSpriteFontData` a desktop consumer gets, and the same
 * `CreateTexture2DFromCnb` at the end of it. A compiled `.cnb` fetched over HTTP and handed to
 * `CnbDocument.Parse` is the browser's version of reading one off disk.
 *
 * ## Bytes, and who holds them
 *
 * The ownership contract is the boundary's, not this file's, and it survives the crossing intact:
 * the document, the decoded texture and the decoded font are the three things that own native
 * memory, and each is an explicit `Dispose`. Everything else is copied out of module memory before
 * it is returned, which matters more here than on Node — `ALLOW_MEMORY_GROWTH` can move the heap on
 * the next allocation, so a view handed upward would be a view into memory that had already moved.
 */

import { CnaContentBackendBase } from "../backend-base.js";
import type {
  CnbChunkEntrySnapshot,
  CnbDocumentSnapshot,
  CnbExternalReferenceSnapshot,
  CnbGlyphSnapshot,
  CnbSpriteFontInfoSnapshot,
  CnbTextureInfoSnapshot,
} from "../backend.js";
import { CnaResult } from "../cna-results.js";
import type { NativeHandle } from "../ownership.js";
import { allocateStruct, readUtf8, WasmCnaError, type WasmRouteTable } from "./module.js";

export class WasmContentBackend extends CnaContentBackendBase {
  readonly #routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#routes = routes;
  }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's CNB slice; ` +
      "the Node-API backend implements it",
    );
  }

  /** Builds a `CNA_StringView` in module memory and returns its address. */
  #stringView(scope: ReturnType<WasmRouteTable["scope"]>, value: string): number {
    const text = scope.allocateUtf8(value);
    const view = allocateStruct(this.#routes.module, scope, "CNA_StringView", false);
    view.setPointer("data", text.pointer).setU64("byte_length", BigInt(text.byteLength));
    return view.pointer;
  }

  /**
   * Runs a count/copy pair whose first call may legitimately answer `BUFFER_TOO_SMALL`, and copies
   * the bytes out of module memory before returning them.
   */
  #countAndCopy(
    route: string, lead: readonly (number | bigint)[], decode: "bytes",
  ): Uint8Array;
  #countAndCopy(
    route: string, lead: readonly (number | bigint)[], decode: "text",
  ): string;
  #countAndCopy(
    route: string, lead: readonly (number | bigint)[], decode: "bytes" | "text",
  ): Uint8Array | string {
    const scope = this.#routes.scope();
    try {
      const sizePointer = scope.allocate(8);
      const probe = this.#routes.call(route, ...lead, 0, 0n, sizePointer);
      if (probe !== CnaResult.Success && probe !== CnaResult.BufferTooSmall) {
        throw new WasmCnaError(route, probe, this.#routes.lastError());
      }
      const byteLength = Number(this.#routes.view().getBigUint64(sizePointer, true));
      if (byteLength === 0) return decode === "bytes" ? new Uint8Array(0) : "";
      const destination = scope.allocate(byteLength);
      this.#routes.invoke(route, ...lead, destination, BigInt(byteLength), sizePointer);
      const written = Number(this.#routes.view().getBigUint64(sizePointer, true));
      return decode === "bytes"
        ? new Uint8Array(this.#routes.module.HEAPU8.subarray(destination, destination + written))
        : readUtf8(this.#routes.module, destination, written);
    } finally {
      scope.dispose();
    }
  }

  #boolOf(route: string, ...args: readonly (number | bigint)[]): boolean {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(1);
      this.#routes.invoke(route, ...args, out);
      return this.#routes.module.HEAPU8[out] !== 0;
    } finally {
      scope.dispose();
    }
  }

  #u32Of(route: string, ...args: readonly (number | bigint)[]): number {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(4);
      this.#routes.invoke(route, ...args, out);
      return this.#routes.view().getUint32(out, true);
    } finally {
      scope.dispose();
    }
  }

  #u64Of(route: string, ...args: readonly (number | bigint)[]): number {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(8);
      this.#routes.invoke(route, ...args, out);
      return Number(this.#routes.view().getBigUint64(out, true));
    } finally {
      scope.dispose();
    }
  }

  public override cnbHasMagic(bytes: Uint8Array): boolean {
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocateBytes(bytes);
      const out = scope.allocate(1);
      this.#routes.invoke("cna_cnb_has_magic", pointer, BigInt(bytes.byteLength), out);
      return this.#routes.module.HEAPU8[out] !== 0;
    } finally {
      scope.dispose();
    }
  }

  public override cnbFormatMagic(): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const destination = scope.allocate(16);
      const written = scope.allocate(8);
      this.#routes.invoke("cna_cnb_copy_format_magic", destination, 16n, written);
      const count = Number(this.#routes.view().getBigUint64(written, true));
      return new Uint8Array(this.#routes.module.HEAPU8.subarray(destination, destination + count));
    } finally {
      scope.dispose();
    }
  }

  public override cnbCrc32c(bytes: Uint8Array): number {
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocateBytes(bytes);
      const out = scope.allocate(4);
      this.#routes.invoke("cna_cnb_crc32c", pointer, BigInt(bytes.byteLength), out);
      return this.#routes.view().getUint32(out, true);
    } finally {
      scope.dispose();
    }
  }

  public override cnbIsCompressionSupported(codec: number): boolean {
    return this.#boolOf("cna_cnb_is_compression_supported", codec);
  }

  public override cnbCompressionName(codec: number): string {
    return this.#routes.copyString(
      "cna_cnb_get_compression_name_size", "cna_cnb_copy_compression_name", codec,
    );
  }

  public override cnbAssetTypeName(assetTypeId: number): string {
    return this.#routes.copyString(
      "cna_cnb_get_asset_type_name_size", "cna_cnb_copy_asset_type_name", assetTypeId,
    );
  }

  public override cnbAssetTypeIdFromName(name: string): number {
    const scope = this.#routes.scope();
    try {
      const view = this.#stringView(scope, name);
      const out = scope.allocate(4);
      this.#routes.invoke("cna_cnb_asset_type_id_from_name", view, out);
      return this.#routes.view().getUint32(out, true);
    } finally {
      scope.dispose();
    }
  }

  public override cnbIsCustomAssetTypeId(assetTypeId: number): boolean {
    return this.#boolOf("cna_cnb_is_custom_asset_type_id", assetTypeId);
  }

  public override cnbMakeChunkId(a: number, b: number, c: number, d: number): number {
    return this.#u32Of("cna_cnb_make_chunk_id", a, b, c, d);
  }

  public override cnbChunkIdString(id: number): string {
    return this.#routes.copyString(
      "cna_cnb_get_chunk_id_string_size", "cna_cnb_copy_chunk_id_string", id,
    );
  }

  public override cnbIsWellFormedChunkId(id: number): boolean {
    return this.#boolOf("cna_cnb_is_well_formed_chunk_id", id);
  }

  public override cnbTextureFormatName(format: number): string {
    return this.#routes.copyString(
      "cna_cnb_get_texture_format_name_size", "cna_cnb_copy_texture_format_name", format,
    );
  }

  public override cnbIsBlockCompressedTextureFormat(format: number): boolean {
    return this.#boolOf("cna_cnb_is_block_compressed_texture_format", format);
  }

  public override cnbTextureFormatUnitBytes(format: number): number {
    return this.#u32Of("cna_cnb_get_texture_format_unit_bytes", format);
  }

  public override cnbTextureLevelByteSize(
    format: number, width: number, height: number, depth: number,
  ): number {
    return this.#u64Of("cna_cnb_get_texture_level_byte_size", format, width, height, depth);
  }

  public override cnbTextureFormatToSurfaceFormat(format: number): number {
    return this.#u32Of("cna_cnb_texture_format_to_surface_format", format);
  }

  public override cnbDocumentParse(bytes: Uint8Array, origin: string): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const image = scope.allocateBytes(bytes);
      const view = this.#stringView(scope, origin);
      // Null limits asks for CNA's defaults, which is what a consumer with no reason to narrow
      // them wants; a narrowed set would be a separate, deliberate API rather than a silent one.
      return this.#routes.outHandle(
        "cna_cnb_document_parse", image, BigInt(bytes.byteLength), view, 0,
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbDocumentDestroy(document: NativeHandle): void {
    this.#routes.invoke("cna_cnb_document_destroy", document);
  }

  public override cnbDocumentGetInfo(document: NativeHandle): CnbDocumentSnapshot {
    const scope = this.#routes.scope();
    try {
      const out16 = scope.allocate(2);
      this.#routes.invoke("cna_cnb_document_get_container_major", document, out16);
      const major = this.#routes.view().getUint16(out16, true);
      this.#routes.invoke("cna_cnb_document_get_container_minor", document, out16);
      const minor = this.#routes.view().getUint16(out16, true);
      const metadata = allocateStruct(this.#routes.module, scope, "CNA_CnbMetadata");
      this.#routes.invoke("cna_cnb_document_get_metadata", document, metadata.pointer);
      return {
        ContainerMajor: major,
        ContainerMinor: minor,
        AssetTypeId: this.#u32Of("cna_cnb_document_get_asset_type_id", document),
        AssetSchemaVersion: this.#u32Of("cna_cnb_document_get_asset_schema_version", document),
        ChunkCount: this.#u64Of("cna_cnb_document_get_chunk_count", document),
        ExternalReferenceCount:
          this.#u64Of("cna_cnb_document_get_external_reference_count", document),
        Origin: this.#routes.copyString(
          "cna_cnb_document_get_origin_size", "cna_cnb_document_copy_origin", document,
        ),
        MetadataPresent: metadata.getU8("present") !== 0,
        MetadataFlags: metadata.getU32("flags"),
        MetadataAssetTypeName: this.#routes.copyString(
          "cna_cnb_document_get_metadata_asset_type_name_size",
          "cna_cnb_document_copy_metadata_asset_type_name",
          document,
        ),
        MetadataContentName: this.#routes.copyString(
          "cna_cnb_document_get_metadata_content_name_size",
          "cna_cnb_document_copy_metadata_content_name",
          document,
        ),
      };
    } finally {
      scope.dispose();
    }
  }

  public override cnbDocumentGetChunk(
    document: NativeHandle, index: number,
  ): CnbChunkEntrySnapshot {
    const scope = this.#routes.scope();
    try {
      const entry = allocateStruct(this.#routes.module, scope, "CNA_CnbChunkEntry");
      this.#routes.invoke("cna_cnb_document_get_chunk", document, BigInt(index), entry.pointer);
      return {
        Offset: Number(entry.getU64("offset")),
        StoredByteLength: Number(entry.getU64("stored_size")),
        ByteLength: Number(entry.getU64("uncompressed_size")),
        Type: entry.getU32("type"),
        Flags: entry.getU32("flags"),
        Checksum: entry.getU32("checksum"),
        Compression: entry.getU32("compression"),
        Alignment: entry.getU32("alignment"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override cnbDocumentCopyChunkData(document: NativeHandle, index: number): Uint8Array {
    return this.#countAndCopy(
      "cna_cnb_document_copy_chunk_data", [document, BigInt(index)], "bytes",
    );
  }

  public override cnbDocumentFindAll(document: NativeHandle, type: number): readonly number[] {
    const scope = this.#routes.scope();
    try {
      const countPointer = scope.allocate(8);
      const probe = this.#routes.call(
        "cna_cnb_document_find_all", document, type, 0, 0n, countPointer,
      );
      if (probe !== CnaResult.Success && probe !== CnaResult.BufferTooSmall) {
        throw new WasmCnaError("cna_cnb_document_find_all", probe, this.#routes.lastError());
      }
      const count = Number(this.#routes.view().getBigUint64(countPointer, true));
      if (count === 0) return [];
      const destination = scope.allocate(count * 8);
      this.#routes.invoke(
        "cna_cnb_document_find_all", document, type, destination, BigInt(count), countPointer,
      );
      const view = this.#routes.view();
      const indexes: number[] = [];
      for (let index = 0; index < count; index += 1) {
        indexes.push(Number(view.getBigUint64(destination + index * 8, true)));
      }
      return indexes;
    } finally {
      scope.dispose();
    }
  }

  public override cnbDocumentRequireMandatoryChunksUnderstood(
    document: NativeHandle, known: readonly number[],
  ): void {
    const scope = this.#routes.scope();
    try {
      if (known.length === 0) {
        this.#routes.invoke(
          "cna_cnb_document_require_mandatory_chunks_understood", document, 0, 0n,
        );
        return;
      }
      const base = scope.allocate(known.length * 4);
      const view = this.#routes.view();
      known.forEach((id, index) => view.setUint32(base + index * 4, id >>> 0, true));
      this.#routes.invoke(
        "cna_cnb_document_require_mandatory_chunks_understood",
        document, base, BigInt(known.length),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbDocumentGetExternalReference(
    document: NativeHandle, index: number,
  ): CnbExternalReferenceSnapshot {
    const scope = this.#routes.scope();
    try {
      const reference = allocateStruct(this.#routes.module, scope, "CNA_CnbExternalReference");
      const what = this.#stringView(scope, "cna-ts external reference");
      this.#routes.invoke(
        "cna_cnb_document_get_external_reference",
        document, BigInt(index), what, reference.pointer,
      );
      return {
        Name: this.#routes.copyString(
          "cna_cnb_document_get_external_reference_name_size",
          "cna_cnb_document_copy_external_reference_name",
          document, BigInt(index),
        ),
        Flags: reference.getU32("flags"),
        ExpectedAssetTypeId: reference.getU32("expected_asset_type_id"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override cnbDecodeTexture2D(document: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_cnb_decode_texture2d", document);
  }

  public override cnbTextureDataDestroy(texture: NativeHandle): void {
    this.#routes.invoke("cna_cnb_texture_data_destroy", texture);
  }

  public override cnbTextureDataGetInfo(texture: NativeHandle): CnbTextureInfoSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_CnbTextureInfo");
      this.#routes.invoke("cna_cnb_texture_data_get_info", texture, info.pointer);
      return {
        Width: info.getU32("width"),
        Height: info.getU32("height"),
        Depth: info.getU32("depth"),
        FaceCount: info.getU32("face_count"),
        MipCount: info.getU32("mip_count"),
        RepresentationCount: info.getU32("representation_count"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override cnbTextureDataGetLevelDimensions(
    texture: NativeHandle, level: number,
  ): { readonly Width: number; readonly Height: number; readonly Depth: number } {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(12);
      this.#routes.invoke(
        "cna_cnb_texture_data_get_level_dimensions", texture, level, out, out + 4, out + 8,
      );
      const view = this.#routes.view();
      return {
        Width: view.getUint32(out, true),
        Height: view.getUint32(out + 4, true),
        Depth: view.getUint32(out + 8, true),
      };
    } finally {
      scope.dispose();
    }
  }

  public override cnbTextureDataGetRepresentationFormat(
    texture: NativeHandle, representation: number,
  ): number {
    return this.#u32Of(
      "cna_cnb_texture_data_get_representation_format", texture, BigInt(representation),
    );
  }

  public override cnbTextureDataGetLevelCount(
    texture: NativeHandle, representation: number,
  ): number {
    return this.#u64Of("cna_cnb_texture_data_get_level_count", texture, BigInt(representation));
  }

  public override cnbTextureDataCopyLevel(
    texture: NativeHandle, representation: number, level: number,
  ): Uint8Array {
    return this.#countAndCopy(
      "cna_cnb_texture_data_copy_level", [texture, BigInt(representation), BigInt(level)], "bytes",
    );
  }

  public override cnbTextureDataCreate(
    width: number, height: number, depth: number, faceCount: number, mipCount: number,
  ): NativeHandle {
    return this.#routes.outHandle(
      "cna_cnb_texture_data_create", width, height, depth, faceCount, mipCount,
    );
  }

  public override cnbTextureDataCreateRgba8(
    width: number, height: number, rgba: Uint8Array,
  ): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const bytes = scope.allocateBytes(rgba);
      return this.#routes.outHandle(
        "cna_cnb_texture_data_create_rgba8", width, height, bytes, BigInt(rgba.byteLength),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbTextureDataAddRepresentation(
    texture: NativeHandle, format: number,
  ): number {
    return this.#u64Of("cna_cnb_texture_data_add_representation", texture, format);
  }

  public override cnbTextureDataSetLevel(
    texture: NativeHandle, representation: number, level: number, bytes: Uint8Array,
  ): void {
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocateBytes(bytes);
      this.#routes.invoke(
        "cna_cnb_texture_data_set_level",
        texture, BigInt(representation), BigInt(level), pointer, BigInt(bytes.byteLength),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbEncodeTexture2D(texture: NativeHandle, contentName: string): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const name = this.#stringView(scope, contentName);
      return this.#countAndCopy("cna_cnb_encode_texture2d", [texture, name], "bytes");
    } finally {
      scope.dispose();
    }
  }

  public override cnbDecodeSpriteFont(document: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_cnb_decode_sprite_font", document);
  }

  public override cnbSpriteFontDataCreate(): NativeHandle {
    return this.#routes.outHandle("cna_cnb_sprite_font_data_create");
  }

  public override cnbSpriteFontDataDestroy(font: NativeHandle): void {
    this.#routes.invoke("cna_cnb_sprite_font_data_destroy", font);
  }

  public override cnbSpriteFontDataGetInfo(font: NativeHandle): CnbSpriteFontInfoSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_CnbSpriteFontInfo");
      this.#routes.invoke("cna_cnb_sprite_font_data_get_info", font, info.pointer);
      return {
        GlyphCount: Number(info.getU64("glyph_count")),
        LineSpacing: info.getI32("line_spacing"),
        Spacing: info.getF32("spacing"),
        DefaultCharacter: info.getU32("default_character") & 0xffff,
        HasDefaultCharacter: info.getU8("has_default_character") !== 0,
      };
    } finally {
      scope.dispose();
    }
  }

  public override cnbSpriteFontDataSetInfo(font: NativeHandle, metrics: {
    readonly LineSpacing: number;
    readonly Spacing: number;
    readonly DefaultCharacter: number;
    readonly HasDefaultCharacter: boolean;
  }): void {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_CnbSpriteFontInfo");
      info.setI32("line_spacing", metrics.LineSpacing)
        .setF32("spacing", metrics.Spacing)
        .setU32("default_character", metrics.DefaultCharacter & 0xffff)
        .setU8("has_default_character", metrics.HasDefaultCharacter ? 1 : 0);
      this.#routes.invoke("cna_cnb_sprite_font_data_set_info", font, info.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override cnbSpriteFontDataGetGlyph(font: NativeHandle, index: number): CnbGlyphSnapshot {
    const scope = this.#routes.scope();
    try {
      const glyph = allocateStruct(this.#routes.module, scope, "CNA_SpriteFontGlyph");
      this.#routes.invoke("cna_cnb_sprite_font_data_get_glyph", font, BigInt(index), glyph.pointer);
      const bounds = glyph.nested("glyph_bounds", "CNA_Rectangle");
      const cropping = glyph.nested("cropping", "CNA_Rectangle");
      const kerning = glyph.nested("kerning", "CNA_Vector3");
      return {
        Bounds: {
          X: bounds.getI32("x"), Y: bounds.getI32("y"),
          Width: bounds.getI32("width"), Height: bounds.getI32("height"),
        },
        Cropping: {
          X: cropping.getI32("x"), Y: cropping.getI32("y"),
          Width: cropping.getI32("width"), Height: cropping.getI32("height"),
        },
        Character: glyph.getU32("character") & 0xffff,
        KerningLeft: kerning.getF32("x"),
        KerningWidth: kerning.getF32("y"),
        KerningRight: kerning.getF32("z"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override cnbSpriteFontDataAddGlyph(
    font: NativeHandle, glyph: CnbGlyphSnapshot,
  ): number {
    const scope = this.#routes.scope();
    try {
      const entry = allocateStruct(this.#routes.module, scope, "CNA_SpriteFontGlyph");
      entry.nested("glyph_bounds", "CNA_Rectangle")
        .setI32("x", glyph.Bounds.X).setI32("y", glyph.Bounds.Y)
        .setI32("width", glyph.Bounds.Width).setI32("height", glyph.Bounds.Height);
      entry.nested("cropping", "CNA_Rectangle")
        .setI32("x", glyph.Cropping.X).setI32("y", glyph.Cropping.Y)
        .setI32("width", glyph.Cropping.Width).setI32("height", glyph.Cropping.Height);
      entry.nested("kerning", "CNA_Vector3")
        .setF32("x", glyph.KerningLeft).setF32("y", glyph.KerningWidth)
        .setF32("z", glyph.KerningRight);
      entry.setU32("character", glyph.Character & 0xffff);
      const out = scope.allocate(8);
      this.#routes.invoke("cna_cnb_sprite_font_data_add_glyph", font, entry.pointer, out);
      return Number(this.#routes.view().getBigUint64(out, true));
    } finally {
      scope.dispose();
    }
  }

  public override cnbSpriteFontDataSetAtlas(font: NativeHandle, atlas: NativeHandle): void {
    this.#routes.invoke("cna_cnb_sprite_font_data_set_atlas", font, atlas);
  }

  public override cnbSpriteFontDataCopyAtlas(font: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_cnb_sprite_font_data_copy_atlas", font);
  }

  public override cnbEncodeSpriteFont(font: NativeHandle, contentName: string): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const name = this.#stringView(scope, contentName);
      return this.#countAndCopy("cna_cnb_encode_sprite_font", [font, name], "bytes");
    } finally {
      scope.dispose();
    }
  }
}
