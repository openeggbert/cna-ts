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
  CnbCurveSnapshot,
  CnbDocumentSnapshot,
  CnbLimitsSnapshot,
  CnbExternalReferenceSnapshot,
  CnbGlyphSnapshot,
  CnbKeyframeSnapshot,
  CnbMaterialSnapshot,
  CnbModelInfoSnapshot,
  CnbModelPartSnapshot,
  CnbSoundEffectInfoSnapshot,
  CnbSpriteFontInfoSnapshot,
  CnbTextureInfoSnapshot,
  CnbVideoInfoSnapshot,
} from "../backend.js";
import { CnaResult } from "../cna-results.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import {
  allocateStruct, readUtf8, WasmCnaError, WasmStruct, type WasmRouteTable,
} from "./module.js";

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

  /* --- CNB's writers -------------------------------------------------------------------------
   *
   * The same writers the Node backend reaches. `docs/content-pipeline-boundary.md` says a `.cnb`
   * built in a build script and one built in a page are the same bytes, and that only stays true
   * if the browser can build one -- so the whole family is here rather than being Node-only.
   */

  public override cnbByteWriterCreate(initial: Uint8Array | null): NativeHandle {
    if (initial == null || initial.byteLength === 0) {
      return this.#routes.outHandle("cna_cnb_byte_writer_create");
    }
    const scope = this.#routes.scope();
    try {
      const bytes = scope.allocateBytes(initial);
      return this.#routes.outHandle(
        "cna_cnb_byte_writer_create_from_bytes", bytes, BigInt(initial.byteLength),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbByteWriterDestroy(writer: NativeHandle): void {
    this.#routes.invoke("cna_cnb_byte_writer_destroy", writer);
  }
  public override cnbByteWriterWriteU8(writer: NativeHandle, value: number): void {
    this.#routes.invoke("cna_cnb_byte_writer_write_u8", writer, value);
  }
  public override cnbByteWriterWriteU16(writer: NativeHandle, value: number): void {
    this.#routes.invoke("cna_cnb_byte_writer_write_u16", writer, value);
  }
  public override cnbByteWriterWriteU32(writer: NativeHandle, value: number): void {
    this.#routes.invoke("cna_cnb_byte_writer_write_u32", writer, value);
  }
  public override cnbByteWriterWriteU64(writer: NativeHandle, value: bigint): void {
    this.#routes.invoke("cna_cnb_byte_writer_write_u64", writer, value);
  }
  public override cnbByteWriterWriteI32(writer: NativeHandle, value: number): void {
    this.#routes.invoke("cna_cnb_byte_writer_write_i32", writer, value);
  }
  public override cnbByteWriterWriteF32(writer: NativeHandle, value: number): void {
    this.#routes.invoke("cna_cnb_byte_writer_write_f32", writer, value);
  }
  public override cnbByteWriterWriteF64(writer: NativeHandle, value: number): void {
    this.#routes.invoke("cna_cnb_byte_writer_write_f64", writer, value);
  }
  public override cnbByteWriterWriteZeros(writer: NativeHandle, byteCount: number): void {
    this.#routes.invoke("cna_cnb_byte_writer_write_zeros", writer, BigInt(byteCount));
  }
  public override cnbByteWriterGetSize(writer: NativeHandle): number {
    return this.#u64Of("cna_cnb_byte_writer_get_size", writer);
  }

  public override cnbByteWriterWriteString(writer: NativeHandle, value: string): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_cnb_byte_writer_write_string", writer, this.#stringView(scope, value),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbByteWriterWriteBytes(writer: NativeHandle, bytes: Uint8Array): void {
    const scope = this.#routes.scope();
    try {
      // The length is the view's own, never a separate argument.
      const pointer = scope.allocateBytes(bytes);
      this.#routes.invoke(
        "cna_cnb_byte_writer_write_bytes", writer, pointer, BigInt(bytes.byteLength),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbByteWriterCopyBytes(writer: NativeHandle): Uint8Array {
    return this.#countAndCopy("cna_cnb_byte_writer_copy_bytes", [writer], "bytes");
  }
  public override cnbByteWriterTake(writer: NativeHandle): Uint8Array {
    return this.#countAndCopy("cna_cnb_byte_writer_take", [writer], "bytes");
  }

  public override cnbWriterCreate(assetTypeId: number, assetSchemaVersion: number): NativeHandle {
    return this.#routes.outHandle("cna_cnb_writer_create", assetTypeId, assetSchemaVersion);
  }
  public override cnbWriterDestroy(writer: NativeHandle): void {
    this.#routes.invoke("cna_cnb_writer_destroy", writer);
  }
  public override cnbWriterClearExternalReferences(writer: NativeHandle): void {
    this.#routes.invoke("cna_cnb_writer_clear_external_references", writer);
  }
  public override cnbWriterGetSchemaChunkCount(writer: NativeHandle): number {
    return this.#u64Of("cna_cnb_writer_get_schema_chunk_count", writer);
  }
  public override cnbWriterSetCompression(
    writer: NativeHandle, codec: number, level: number,
  ): void {
    this.#routes.invoke("cna_cnb_writer_set_compression", writer, codec, level);
  }
  public override cnbWriterBuild(writer: NativeHandle): Uint8Array {
    return this.#countAndCopy("cna_cnb_writer_build", [writer], "bytes");
  }

  public override cnbWriterSetMetadata(
    writer: NativeHandle, assetTypeName: string, contentName: string,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_cnb_writer_set_metadata", writer,
        this.#stringView(scope, assetTypeName), this.#stringView(scope, contentName),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbWriterAddExternalReference(
    writer: NativeHandle, flags: number, expectedAssetTypeId: number, logicalName: string,
  ): void {
    const scope = this.#routes.scope();
    try {
      // A caller-provided versioned structure, laid out from the measured wasm32 offsets;
      // allocateStruct fills the size and version header CNA insists the caller sets.
      const reference = allocateStruct(
        this.#routes.module, scope, "CNA_CnbExternalReference",
      );
      reference.setU32("flags", flags);
      reference.setU32("expected_asset_type_id", expectedAssetTypeId);
      this.#routes.invoke(
        "cna_cnb_writer_add_external_reference", writer, reference.pointer,
        this.#stringView(scope, logicalName),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbWriterAddChunk(
    writer: NativeHandle, chunkId: number, data: Uint8Array, flags: number, alignment: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocateBytes(data);
      this.#routes.invoke(
        "cna_cnb_writer_add_chunk", writer, chunkId, pointer, BigInt(data.byteLength),
        flags, alignment,
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbWriterAppendEmbeddedTexture2D(
    writer: NativeHandle, texture: NativeHandle, label: string,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_cnb_writer_append_embedded_texture2d", writer, texture,
        this.#stringView(scope, label),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbWriterGetLimits(writer: NativeHandle): CnbLimitsSnapshot {
    const scope = this.#routes.scope();
    try {
      const limits = this.#limitsStruct(scope);
      this.#routes.invoke("cna_cnb_writer_get_limits", writer, limits.pointer);
      return {
        MaxFileSize: Number(limits.getU64("max_file_size")),
        MaxChunkSize: Number(limits.getU64("max_chunk_size")),
        MaxTotalUncompressedSize: Number(limits.getU64("max_total_uncompressed_size")),
        MaxChunkCount: limits.getU32("max_chunk_count"),
        MaxStringBytes: limits.getU32("max_string_bytes"),
        MaxArrayElementCount: limits.getU32("max_array_element_count"),
        MaxChunkAlignment: limits.getU32("max_chunk_alignment"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override cnbWriterSetLimits(writer: NativeHandle, limits: CnbLimitsSnapshot): void {
    const scope = this.#routes.scope();
    try {
      // Seeded from CNA's own defaults, so anything this ABI adds later stays CNA's; only the
      // seven fields a caller can narrow are written over them.
      const structure = this.#limitsStruct(scope);
      this.#routes.invoke("cna_cnb_read_limits_init", structure.pointer);
      structure.setU64("max_file_size", BigInt(limits.MaxFileSize));
      structure.setU64("max_chunk_size", BigInt(limits.MaxChunkSize));
      structure.setU64("max_total_uncompressed_size", BigInt(limits.MaxTotalUncompressedSize));
      structure.setU32("max_chunk_count", limits.MaxChunkCount);
      structure.setU32("max_string_bytes", limits.MaxStringBytes);
      structure.setU32("max_array_element_count", limits.MaxArrayElementCount);
      structure.setU32("max_chunk_alignment", limits.MaxChunkAlignment);
      this.#routes.invoke("cna_cnb_writer_set_limits", writer, structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  /** The read-limits structure with the version header CNA requires the caller to set. */
  #limitsStruct(scope: ReturnType<WasmRouteTable["scope"]>): WasmStruct {
    return allocateStruct(this.#routes.module, scope, "CNA_CnbReadLimits");
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



  // ---- the CNB curve and animation-clip schemas ------------------------------------------------
  // The curve's native handle never leaves this file, exactly as on Node: XNA's `Curve` is managed,
  // so the native object exists only long enough to be read out. `CNA_CurveKey` crosses **by
  // value** in `cna_curve_key_collection_add`, which Emscripten lowers to a pointer — the same
  // convention `CNA_StringView` uses and which the browser suite already settles with evidence.

  public override cnbDecodeCurve(document: NativeHandle): CnbCurveSnapshot {
    const curve = this.#routes.outHandle("cna_cnb_decode_curve", document);
    let keys: NativeHandle | null = null;
    try {
      const preLoop = this.#u32Of("cna_curve_get_pre_loop", curve);
      const postLoop = this.#u32Of("cna_curve_get_post_loop", curve);
      const isConstant = this.#boolOf("cna_curve_get_is_constant", curve);
      keys = this.#routes.outHandle("cna_curve_get_keys", curve);
      const count = this.#u64Of("cna_curve_key_collection_get_count", keys);
      const scope = this.#routes.scope();
      try {
        const entry = allocateStruct(this.#routes.module, scope, "CNA_CurveKey", false);
        const read: CnbCurveSnapshot["Keys"][number][] = [];
        for (let index = 0; index < count; index += 1) {
          this.#routes.invoke("cna_curve_key_collection_get", keys, index, entry.pointer);
          read.push(Object.freeze({
            Position: entry.getF32("position"),
            Value: entry.getF32("value"),
            TangentIn: entry.getF32("tangent_in"),
            TangentOut: entry.getF32("tangent_out"),
            Continuity: entry.getU32("continuity"),
          }));
        }
        return Object.freeze({ PreLoop: preLoop, PostLoop: postLoop, IsConstant: isConstant, Keys: read });
      } finally {
        scope.dispose();
      }
    } finally {
      // Two handles, released in reverse order and independently of whether the read succeeded:
      // the collection is its own handle and leaking it would outlive the curve it came from.
      if (keys != null) this.#routes.invoke("cna_curve_key_collection_destroy", keys);
      this.#routes.invoke("cna_curve_destroy", curve);
    }
  }

  public override cnbEncodeCurve(curve: CnbCurveSnapshot, contentName: string): Uint8Array {
    const handle = this.#routes.outHandle("cna_curve_create");
    let keys: NativeHandle | null = null;
    try {
      this.#routes.invoke("cna_curve_set_pre_loop", handle, curve.PreLoop);
      this.#routes.invoke("cna_curve_set_post_loop", handle, curve.PostLoop);
      keys = this.#routes.outHandle("cna_curve_get_keys", handle);
      const scope = this.#routes.scope();
      try {
        const entry = allocateStruct(this.#routes.module, scope, "CNA_CurveKey", false);
        for (const key of curve.Keys) {
          this.#routes.invoke(
            "cna_curve_key_init_full",
            key.Position, key.Value, key.TangentIn, key.TangentOut, key.Continuity, entry.pointer,
          );
          this.#routes.invoke("cna_curve_key_collection_add", keys, entry.pointer);
        }
      } finally {
        scope.dispose();
      }
      const scope2 = this.#routes.scope();
      try {
        const name = this.#stringView(scope2, contentName);
        return this.#countAndCopy("cna_cnb_encode_curve", [handle, name], "bytes");
      } finally {
        scope2.dispose();
      }
    } finally {
      if (keys != null) this.#routes.invoke("cna_curve_key_collection_destroy", keys);
      this.#routes.invoke("cna_curve_destroy", handle);
    }
  }

  public override cnbDecodeAnimationClip(document: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_cnb_decode_animation_clip", document);
  }

  public override cnbAnimationClipDestroy(clip: NativeHandle): void {
    this.#routes.invoke("cna_cnb_animation_clip_destroy", clip);
  }

  public override cnbAnimationClipGet(clip: NativeHandle): {
    readonly DurationSeconds: number; readonly TrackCount: number; readonly TargetSpace: number;
  } {
    const scope = this.#routes.scope();
    try {
      const duration = scope.allocate(8);
      const tracks = scope.allocate(8);
      const space = scope.allocate(4);
      this.#routes.invoke("cna_cnb_animation_clip_get", clip, duration, tracks, space);
      const view = this.#routes.view();
      return Object.freeze({
        DurationSeconds: view.getFloat64(duration, true),
        TrackCount: Number(view.getBigUint64(tracks, true)),
        TargetSpace: view.getUint32(space, true),
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbAnimationClipGetTrack(clip: NativeHandle, track: number): {
    readonly BoneIndex: number; readonly KeyframeCount: number;
  } {
    const scope = this.#routes.scope();
    try {
      const bone = scope.allocate(4);
      const count = scope.allocate(8);
      this.#routes.invoke("cna_cnb_animation_clip_get_track", clip, BigInt(track), bone, count);
      const view = this.#routes.view();
      return Object.freeze({
        BoneIndex: view.getInt32(bone, true),
        KeyframeCount: Number(view.getBigUint64(count, true)),
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbAnimationClipCopyKeyframes(
    clip: NativeHandle, track: number,
  ): readonly CnbKeyframeSnapshot[] {
    const scope = this.#routes.scope();
    try {
      const countPointer = scope.allocate(8);
      const probe = this.#routes.call(
        "cna_cnb_animation_clip_copy_keyframes", clip, BigInt(track), 0, 0n, countPointer,
      );
      if (probe !== CnaResult.Success && probe !== CnaResult.BufferTooSmall) {
        throw new WasmCnaError(
          "cna_cnb_animation_clip_copy_keyframes", probe, this.#routes.lastError(),
        );
      }
      const count = Number(this.#routes.view().getBigUint64(countPointer, true));
      if (count === 0) return Object.freeze([]);
      const stride = WASM_STRUCT_LAYOUTS.CNA_KeyframeEXT.size;
      const destination = scope.allocate(count * stride);
      this.#routes.invoke(
        "cna_cnb_animation_clip_copy_keyframes", clip, BigInt(track), destination,
        BigInt(count), countPointer,
      );
      const written = Number(this.#routes.view().getBigUint64(countPointer, true));
      const frames: CnbKeyframeSnapshot[] = [];
      for (let index = 0; index < written; index += 1) {
        const frame = new WasmStruct(
          this.#routes.module, "CNA_KeyframeEXT", destination + index * stride,
        );
        const vector = (field: string): number[] => {
          const value = frame.nested(field, "CNA_Vector3");
          return [value.getF32("x"), value.getF32("y"), value.getF32("z")];
        };
        const rotation = frame.nested("rotation", "CNA_Quaternion");
        frames.push(Object.freeze({
          TimeSeconds: frame.getF64("time_seconds"),
          Translation: Object.freeze(vector("translation")),
          Rotation: Object.freeze([
            rotation.getF32("x"), rotation.getF32("y"),
            rotation.getF32("z"), rotation.getF32("w"),
          ]),
          Scale: Object.freeze(vector("scale")),
        }));
      }
      return Object.freeze(frames);
    } finally {
      scope.dispose();
    }
  }

  public override cnbEncodeAnimationClip(
    durationSeconds: number,
    tracks: readonly { readonly BoneIndex: number; readonly Keyframes: readonly CnbKeyframeSnapshot[] }[],
    targetSpace: number,
    contentName: string,
  ): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const frameStride = WASM_STRUCT_LAYOUTS.CNA_KeyframeEXT.size;
      const trackStride = WASM_STRUCT_LAYOUTS.CNA_BoneTrackEXTDescriptor.size;
      const trackArray = scope.allocate(Math.max(tracks.length * trackStride, 1));
      for (const [index, track] of tracks.entries()) {
        const frameArray = scope.allocate(Math.max(track.Keyframes.length * frameStride, 1));
        for (const [which, keyframe] of track.Keyframes.entries()) {
          const frame = new WasmStruct(
            this.#routes.module, "CNA_KeyframeEXT", frameArray + which * frameStride,
          );
          frame.setF64("time_seconds", keyframe.TimeSeconds);
          frame.nested("translation", "CNA_Vector3")
            .setF32("x", keyframe.Translation[0])
            .setF32("y", keyframe.Translation[1])
            .setF32("z", keyframe.Translation[2]);
          frame.nested("rotation", "CNA_Quaternion")
            .setF32("x", keyframe.Rotation[0]).setF32("y", keyframe.Rotation[1])
            .setF32("z", keyframe.Rotation[2]).setF32("w", keyframe.Rotation[3]);
          frame.nested("scale", "CNA_Vector3")
            .setF32("x", keyframe.Scale[0])
            .setF32("y", keyframe.Scale[1])
            .setF32("z", keyframe.Scale[2]);
        }
        const descriptor = new WasmStruct(
          this.#routes.module, "CNA_BoneTrackEXTDescriptor", trackArray + index * trackStride,
        );
        descriptor
          .setI32("bone_index", track.BoneIndex)
          .setU32("reserved", 0)
          .setPointer("keyframes", frameArray)
          .setU64("keyframe_count", BigInt(track.Keyframes.length));
      }
      const clip = allocateStruct(
        this.#routes.module, scope, "CNA_AnimationClipEXTDescriptor", false,
      );
      clip
        .setF64("duration_seconds", durationSeconds)
        .setPointer("tracks", trackArray)
        .setU64("track_count", BigInt(tracks.length));
      const name = this.#stringView(scope, contentName);
      return this.#countAndCopy(
        "cna_cnb_encode_animation_clip", [clip.pointer, targetSpace, name], "bytes",
      );
    } finally {
      scope.dispose();
    }
  }
  // ---- the CNB media schemas -------------------------------------------------------------------
  // Songs and videos carry a stream reference rather than the media, so both schemas cross intact
  // and neither needs a byte of encoded audio or video to be exercised in a page.

  public override cnbSoundEffectDataCreate(
    info: CnbSoundEffectInfoSnapshot, samples: Uint8Array,
  ): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const description = allocateStruct(this.#routes.module, scope, "CNA_CnbSoundEffectInfo");
      description
        .setU32("format", info.Format)
        .setU32("sample_rate", info.SampleRate)
        .setU32("channels", info.Channels)
        .setU32("frame_count", info.FrameCount)
        .setU32("loop_start", info.LoopStart)
        .setU32("loop_length", info.LoopLength);
      const bytes = scope.allocateBytes(samples);
      return this.#routes.outHandle(
        "cna_cnb_sound_effect_data_create", description.pointer, bytes,
        BigInt(samples.byteLength),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbSoundEffectDataDestroy(sound: NativeHandle): void {
    this.#routes.invoke("cna_cnb_sound_effect_data_destroy", sound);
  }

  public override cnbSoundEffectDataGetInfo(sound: NativeHandle): CnbSoundEffectInfoSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_CnbSoundEffectInfo");
      this.#routes.invoke("cna_cnb_sound_effect_data_get_info", sound, info.pointer);
      return Object.freeze({
        Format: info.getU32("format"),
        SampleRate: info.getU32("sample_rate"),
        Channels: info.getU32("channels"),
        FrameCount: info.getU32("frame_count"),
        LoopStart: info.getU32("loop_start"),
        LoopLength: info.getU32("loop_length"),
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbSoundEffectDataCopySamples(sound: NativeHandle): Uint8Array {
    return this.#countAndCopy("cna_cnb_sound_effect_data_copy_samples", [sound], "bytes");
  }

  public override cnbEncodeSoundEffect(sound: NativeHandle, contentName: string): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const name = this.#stringView(scope, contentName);
      return this.#countAndCopy("cna_cnb_encode_sound_effect", [sound, name], "bytes");
    } finally {
      scope.dispose();
    }
  }

  public override cnbDecodeSoundEffect(document: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_cnb_decode_sound_effect", document);
  }

  public override cnbDecodeWavAsSoundEffect(bytes: Uint8Array, origin: string): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const image = scope.allocateBytes(bytes);
      const view = this.#stringView(scope, origin);
      return this.#routes.outHandle(
        "cna_cnb_decode_wav_as_sound_effect", image, BigInt(bytes.byteLength), view,
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbEncodeSong(
    streamReference: string, name: string, durationMilliseconds: number, contentName: string,
  ): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const stream = this.#stringView(scope, streamReference);
      const display = this.#stringView(scope, name);
      const content = this.#stringView(scope, contentName);
      return this.#countAndCopy(
        "cna_cnb_encode_song", [stream, display, durationMilliseconds, content], "bytes",
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbDecodeSongDuration(document: NativeHandle): number {
    return this.#u32Of("cna_cnb_decode_song_duration_milliseconds", document);
  }

  public override cnbDecodeSongName(document: NativeHandle): string {
    return this.#routes.copyString(
      "cna_cnb_decode_song_name_size", "cna_cnb_decode_song_name", document,
    );
  }

  public override cnbDecodeSongStreamReference(document: NativeHandle): string {
    return this.#routes.copyString(
      "cna_cnb_decode_song_stream_reference_size", "cna_cnb_decode_song_stream_reference", document,
    );
  }

  public override cnbEncodeVideo(
    streamReference: string, info: CnbVideoInfoSnapshot, contentName: string,
  ): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const stream = this.#stringView(scope, streamReference);
      const description = allocateStruct(this.#routes.module, scope, "CNA_CnbVideoInfo");
      description
        .setU32("duration_milliseconds", info.DurationMilliseconds)
        .setU32("width", info.Width)
        .setU32("height", info.Height)
        .setF32("frames_per_second", info.FramesPerSecond)
        .setU32("soundtrack_type", info.SoundtrackType);
      const content = this.#stringView(scope, contentName);
      return this.#countAndCopy(
        "cna_cnb_encode_video", [stream, description.pointer, content], "bytes",
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbDecodeVideo(document: NativeHandle): CnbVideoInfoSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_CnbVideoInfo");
      this.#routes.invoke("cna_cnb_decode_video", document, info.pointer);
      return Object.freeze({
        DurationMilliseconds: info.getU32("duration_milliseconds"),
        Width: info.getU32("width"),
        Height: info.getU32("height"),
        FramesPerSecond: info.getF32("frames_per_second"),
        SoundtrackType: info.getU32("soundtrack_type"),
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbDecodeVideoStreamReference(document: NativeHandle): string {
    return this.#routes.copyString(
      "cna_cnb_decode_video_stream_reference_size", "cna_cnb_decode_video_stream_reference",
      document,
    );
  }
  // ---- the CNB model schema --------------------------------------------------------------------
  // The same routes the Node adapter imports, over the same structures, measured for wasm32 by the
  // same Emscripten probe. Nothing above this file distinguishes them: `CnbModelData.Decode` in a
  // page and on a desktop are the same call.

  /** A `uint32_t` array copied out of module memory: mesh part lists and skeleton hierarchies. */
  #countAndCopyNumbers(
    route: string, lead: readonly (number | bigint)[], element: 4, signed: boolean,
  ): number[] {
    const scope = this.#routes.scope();
    try {
      const countPointer = scope.allocate(8);
      const probe = this.#routes.call(route, ...lead, 0, 0n, countPointer);
      if (probe !== CnaResult.Success && probe !== CnaResult.BufferTooSmall) {
        throw new WasmCnaError(route, probe, this.#routes.lastError());
      }
      const count = Number(this.#routes.view().getBigUint64(countPointer, true));
      if (count === 0) return [];
      const destination = scope.allocate(count * element);
      this.#routes.invoke(route, ...lead, destination, BigInt(count), countPointer);
      const written = Number(this.#routes.view().getBigUint64(countPointer, true));
      // The view is taken after the call rather than before it: an allocation can grow the heap
      // and detach an earlier DataView's buffer.
      const view = this.#routes.view();
      const values: number[] = [];
      for (let index = 0; index < written; index += 1) {
        const at = destination + index * element;
        values.push(signed ? view.getInt32(at, true) : view.getUint32(at, true));
      }
      return values;
    } finally {
      scope.dispose();
    }
  }

  /** A `float` array copied out of module memory: the skeleton's matrix sets. */
  #countAndCopyFloats(route: string, lead: readonly (number | bigint)[]): number[] {
    const scope = this.#routes.scope();
    try {
      const countPointer = scope.allocate(8);
      const probe = this.#routes.call(route, ...lead, 0, 0n, countPointer);
      if (probe !== CnaResult.Success && probe !== CnaResult.BufferTooSmall) {
        throw new WasmCnaError(route, probe, this.#routes.lastError());
      }
      const count = Number(this.#routes.view().getBigUint64(countPointer, true));
      if (count === 0) return [];
      const destination = scope.allocate(count * 4);
      this.#routes.invoke(route, ...lead, destination, BigInt(count), countPointer);
      const written = Number(this.#routes.view().getBigUint64(countPointer, true));
      const view = this.#routes.view();
      const values: number[] = [];
      for (let index = 0; index < written; index += 1) {
        values.push(view.getFloat32(destination + index * 4, true));
      }
      return values;
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelCreate(): NativeHandle {
    return this.#routes.outHandle("cna_cnb_model_create");
  }

  public override cnbModelDestroy(model: NativeHandle): void {
    this.#routes.invoke("cna_cnb_model_destroy", model);
  }

  public override cnbModelSetFlags(
    model: NativeHandle, appliesGltfLightingPolicy: boolean, hasBoneHierarchy: boolean,
  ): void {
    this.#routes.invoke(
      "cna_cnb_model_set_flags", model,
      appliesGltfLightingPolicy ? 1 : 0, hasBoneHierarchy ? 1 : 0,
    );
  }

  public override cnbModelGetInfo(model: NativeHandle): CnbModelInfoSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_CnbModelInfo");
      this.#routes.invoke("cna_cnb_model_get_info", model, info.pointer);
      return Object.freeze({
        BoneCount: Number(info.getU64("bone_count")),
        PartCount: Number(info.getU64("part_count")),
        MeshCount: Number(info.getU64("mesh_count")),
        AnimationCount: Number(info.getU64("animation_count")),
        LightCount: Number(info.getU64("light_count")),
        HasSkeleton: info.getU8("has_skeleton") !== 0,
        AppliesGltfLightingPolicy: info.getU8("applies_gltf_lighting_policy") !== 0,
        HasBoneHierarchy: info.getU8("has_bone_hierarchy") !== 0,
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelAddBone(
    model: NativeHandle, name: string, parent: number, transform: readonly number[],
  ): number {
    const scope = this.#routes.scope();
    try {
      const view = this.#stringView(scope, name);
      const values = scope.allocate(64);
      const memory = this.#routes.view();
      for (let index = 0; index < 16; index += 1) {
        memory.setFloat32(values + index * 4, transform[index], true);
      }
      const out = scope.allocate(8);
      this.#routes.invoke("cna_cnb_model_add_bone", model, view, parent, values, out);
      return Number(this.#routes.view().getBigUint64(out, true));
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelGetBone(
    model: NativeHandle, index: number,
  ): { readonly Parent: number; readonly Transform: readonly number[] } {
    const scope = this.#routes.scope();
    try {
      const bone = allocateStruct(this.#routes.module, scope, "CNA_CnbModelBone");
      this.#routes.invoke("cna_cnb_model_get_bone", model, BigInt(index), bone.pointer);
      return Object.freeze({
        Parent: bone.getI32("parent"),
        Transform: Object.freeze(bone.getF32Array("transform")),
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelGetBoneName(model: NativeHandle, index: number): string {
    return this.#countAndCopy(
      "cna_cnb_model_copy_bone_name", [model, BigInt(index)], "text",
    );
  }

  public override cnbModelAddPart(
    model: NativeHandle, info: CnbModelPartSnapshot, name: string, externalEffect: string,
  ): number {
    const scope = this.#routes.scope();
    try {
      const part = allocateStruct(this.#routes.module, scope, "CNA_CnbModelPartInfo");
      this.#writePartInfo(part, info);
      const nameView = this.#stringView(scope, name);
      const effectView = this.#stringView(scope, externalEffect);
      const out = scope.allocate(8);
      this.#routes.invoke(
        "cna_cnb_model_add_part", model, part.pointer, nameView, effectView, out,
      );
      return Number(this.#routes.view().getBigUint64(out, true));
    } finally {
      scope.dispose();
    }
  }

  #writePartInfo(part: WasmStruct, info: CnbModelPartSnapshot): void {
    part
      .setU32("vertex_stride", info.VertexStride)
      .setU32("vertex_count", info.VertexCount)
      .setU32("index_count", info.IndexCount)
      .setU32("index_element_size", info.IndexElementSize)
      .setU32("primitive_topology", info.PrimitiveTopology)
      .setU32("primitive_count", info.PrimitiveCount)
      .setU32("effect_kind", info.EffectKind)
      .setU8("vertex_color_enabled", info.VertexColorEnabled ? 1 : 0)
      .setU8("unlit", info.Unlit ? 1 : 0);
  }

  public override cnbModelGetPart(model: NativeHandle, index: number): CnbModelPartSnapshot {
    const scope = this.#routes.scope();
    try {
      const part = allocateStruct(this.#routes.module, scope, "CNA_CnbModelPartInfo");
      this.#routes.invoke("cna_cnb_model_get_part", model, BigInt(index), part.pointer);
      return Object.freeze({
        VertexStride: part.getU32("vertex_stride"),
        VertexCount: part.getU32("vertex_count"),
        IndexCount: part.getU32("index_count"),
        IndexElementSize: part.getU32("index_element_size"),
        PrimitiveTopology: part.getU32("primitive_topology"),
        PrimitiveCount: part.getU32("primitive_count"),
        EffectKind: part.getU32("effect_kind"),
        VertexColorEnabled: part.getU8("vertex_color_enabled") !== 0,
        Unlit: part.getU8("unlit") !== 0,
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelGetPartName(model: NativeHandle, index: number): string {
    return this.#countAndCopy("cna_cnb_model_copy_part_name", [model, BigInt(index)], "text");
  }

  public override cnbModelGetPartExternalEffect(model: NativeHandle, index: number): string {
    return this.#countAndCopy(
      "cna_cnb_model_copy_part_external_effect", [model, BigInt(index)], "text",
    );
  }

  public override cnbModelSetPartVertexBytes(
    model: NativeHandle, index: number, bytes: Uint8Array,
  ): void {
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocateBytes(bytes);
      this.#routes.invoke(
        "cna_cnb_model_set_part_vertex_bytes", model, BigInt(index), pointer,
        BigInt(bytes.byteLength),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelCopyPartVertexBytes(model: NativeHandle, index: number): Uint8Array {
    return this.#countAndCopy(
      "cna_cnb_model_copy_part_vertex_bytes", [model, BigInt(index)], "bytes",
    );
  }

  public override cnbModelSetPartIndexBytes(
    model: NativeHandle, index: number, bytes: Uint8Array,
  ): void {
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocateBytes(bytes);
      this.#routes.invoke(
        "cna_cnb_model_set_part_index_bytes", model, BigInt(index), pointer,
        BigInt(bytes.byteLength),
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelCopyPartIndexBytes(model: NativeHandle, index: number): Uint8Array {
    return this.#countAndCopy(
      "cna_cnb_model_copy_part_index_bytes", [model, BigInt(index)], "bytes",
    );
  }

  public override cnbModelGetMaterial(model: NativeHandle, part: number): CnbMaterialSnapshot {
    const scope = this.#routes.scope();
    try {
      const material = allocateStruct(this.#routes.module, scope, "CNA_CnbMaterialInfo");
      this.#routes.invoke("cna_cnb_model_get_material", model, BigInt(part), material.pointer);
      return Object.freeze({
        BaseColorFactor: Object.freeze(material.getF32Array("base_color_factor")),
        EmissiveFactor: Object.freeze(material.getF32Array("emissive_factor")),
        SpecularColorFactor: Object.freeze(material.getF32Array("specular_color_factor")),
        MetallicFactor: material.getF32("metallic_factor"),
        RoughnessFactor: material.getF32("roughness_factor"),
        Ior: material.getF32("ior"),
        SpecularFactor: material.getF32("specular_factor"),
        NormalScale: material.getF32("normal_scale"),
        OcclusionStrength: material.getF32("occlusion_strength"),
        AlphaCutoff: material.getF32("alpha_cutoff"),
        AlphaMode: material.getU32("alpha_mode"),
        DoubleSided: material.getU8("double_sided") !== 0,
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelSetMaterial(
    model: NativeHandle, part: number, value: CnbMaterialSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      const material = allocateStruct(this.#routes.module, scope, "CNA_CnbMaterialInfo");
      material
        .setF32Array("base_color_factor", value.BaseColorFactor)
        .setF32Array("emissive_factor", value.EmissiveFactor)
        .setF32Array("specular_color_factor", value.SpecularColorFactor)
        .setF32("metallic_factor", value.MetallicFactor)
        .setF32("roughness_factor", value.RoughnessFactor)
        .setF32("ior", value.Ior)
        .setF32("specular_factor", value.SpecularFactor)
        .setF32("normal_scale", value.NormalScale)
        .setF32("occlusion_strength", value.OcclusionStrength)
        .setF32("alpha_cutoff", value.AlphaCutoff)
        .setU32("alpha_mode", value.AlphaMode)
        .setU8("double_sided", value.DoubleSided ? 1 : 0);
      this.#routes.invoke("cna_cnb_model_set_material", model, BigInt(part), material.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelGetMaterialTexture(
    model: NativeHandle, part: number, slot: number,
  ): string {
    return this.#countAndCopy(
      "cna_cnb_model_copy_material_texture", [model, BigInt(part), slot], "text",
    );
  }

  public override cnbModelSetMaterialTexture(
    model: NativeHandle, part: number, slot: number, assetName: string,
  ): void {
    const scope = this.#routes.scope();
    try {
      const view = this.#stringView(scope, assetName);
      this.#routes.invoke(
        "cna_cnb_model_set_material_texture", model, BigInt(part), slot, view,
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelAddMesh(
    model: NativeHandle, name: string, parentBone: number, partIndices: readonly number[],
  ): number {
    const scope = this.#routes.scope();
    try {
      const view = this.#stringView(scope, name);
      const parts = scope.allocate(Math.max(partIndices.length * 4, 1));
      const memory = this.#routes.view();
      for (let index = 0; index < partIndices.length; index += 1) {
        memory.setUint32(parts + index * 4, partIndices[index] >>> 0, true);
      }
      const out = scope.allocate(8);
      this.#routes.invoke(
        "cna_cnb_model_add_mesh", model, view, parentBone, parts,
        BigInt(partIndices.length), out,
      );
      return Number(this.#routes.view().getBigUint64(out, true));
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelGetMesh(
    model: NativeHandle, index: number,
  ): { readonly ParentBone: number; readonly PartIndexCount: number } {
    const scope = this.#routes.scope();
    try {
      const mesh = allocateStruct(this.#routes.module, scope, "CNA_CnbMeshInfo");
      this.#routes.invoke("cna_cnb_model_get_mesh", model, BigInt(index), mesh.pointer);
      return Object.freeze({
        ParentBone: mesh.getI32("parent_bone"),
        PartIndexCount: Number(mesh.getU64("part_index_count")),
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelGetMeshName(model: NativeHandle, index: number): string {
    return this.#countAndCopy("cna_cnb_model_copy_mesh_name", [model, BigInt(index)], "text");
  }

  public override cnbModelCopyMeshPartIndices(
    model: NativeHandle, index: number,
  ): readonly number[] {
    return this.#countAndCopyNumbers(
      "cna_cnb_model_copy_mesh_part_indices", [model, BigInt(index)], 4, false,
    );
  }

  public override cnbModelSetSkeleton(
    model: NativeHandle,
    hierarchy: readonly number[],
    bindPose: readonly number[],
    inverseBindPose: readonly number[],
    rootPrefix: readonly number[],
  ): void {
    const scope = this.#routes.scope();
    try {
      const parents = scope.allocate(Math.max(hierarchy.length * 4, 1));
      const sets = [bindPose, inverseBindPose, rootPrefix].map(
        (values) => scope.allocate(Math.max(values.length * 4, 1)),
      );
      const memory = this.#routes.view();
      for (let index = 0; index < hierarchy.length; index += 1) {
        memory.setInt32(parents + index * 4, hierarchy[index] | 0, true);
      }
      for (const [set, values] of [bindPose, inverseBindPose, rootPrefix].entries()) {
        for (let index = 0; index < values.length; index += 1) {
          memory.setFloat32(sets[set] + index * 4, values[index], true);
        }
      }
      this.#routes.invoke(
        "cna_cnb_model_set_skeleton", model, parents, BigInt(hierarchy.length),
        sets[0], sets[1], sets[2],
      );
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelGetSkeleton(
    model: NativeHandle,
  ): { readonly JointCount: number; readonly HasRootPrefix: boolean } {
    const scope = this.#routes.scope();
    try {
      const skeleton = allocateStruct(this.#routes.module, scope, "CNA_CnbSkeletonInfo");
      this.#routes.invoke("cna_cnb_model_get_skeleton", model, skeleton.pointer);
      return Object.freeze({
        JointCount: Number(skeleton.getU64("joint_count")),
        HasRootPrefix: skeleton.getU8("has_root_prefix") !== 0,
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelCopySkeletonHierarchy(model: NativeHandle): readonly number[] {
    return this.#countAndCopyNumbers(
      "cna_cnb_model_copy_skeleton_hierarchy", [model], 4, true,
    );
  }

  public override cnbModelCopySkeletonMatrices(
    model: NativeHandle, set: number,
  ): readonly number[] {
    return this.#countAndCopyFloats("cna_cnb_model_copy_skeleton_matrices", [model, set]);
  }

  public override cnbModelAddLight(
    model: NativeHandle, direction: readonly number[], diffuseColor: readonly number[],
  ): number {
    const scope = this.#routes.scope();
    try {
      const light = allocateStruct(this.#routes.module, scope, "CNA_CnbModelLight", false);
      light.setF32Array("direction", direction).setF32Array("diffuse_color", diffuseColor);
      const out = scope.allocate(8);
      this.#routes.invoke("cna_cnb_model_add_light", model, light.pointer, out);
      return Number(this.#routes.view().getBigUint64(out, true));
    } finally {
      scope.dispose();
    }
  }

  public override cnbModelGetLight(
    model: NativeHandle, index: number,
  ): { readonly Direction: readonly number[]; readonly DiffuseColor: readonly number[] } {
    const scope = this.#routes.scope();
    try {
      const light = allocateStruct(this.#routes.module, scope, "CNA_CnbModelLight", false);
      this.#routes.invoke("cna_cnb_model_get_light", model, BigInt(index), light.pointer);
      return Object.freeze({
        Direction: Object.freeze(light.getF32Array("direction")),
        DiffuseColor: Object.freeze(light.getF32Array("diffuse_color")),
      });
    } finally {
      scope.dispose();
    }
  }

  public override cnbEncodeModel(model: NativeHandle, contentName: string): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const name = this.#stringView(scope, contentName);
      return this.#countAndCopy("cna_cnb_encode_model", [model, name], "bytes");
    } finally {
      scope.dispose();
    }
  }

  public override cnbDecodeModel(document: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_cnb_decode_model", document);
  }
}
