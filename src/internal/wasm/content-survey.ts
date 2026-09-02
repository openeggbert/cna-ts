// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaContentSurveyBackend`: what is under a content root, and which XNB
// readers it needs.
//
// This is not `ContentManager`. The strict XNA `ContentManager` owns loading, its cache and asset
// identity, and this package's browser backend already implements that path separately; a survey
// deliberately loads nothing, so an asset it names still has exactly one owner. The distinction is
// worth restating here because both sit on `cna_content_manager_*` routes: CNA's content manager
// is what *performs* the survey, and this backend never asks it to read an asset.
//
// The browser difference is the filesystem, and it is smaller than it sounds. Emscripten gives the
// module a real POSIX filesystem (MEMFS by default), so a page that writes its content into it
// gets exactly the survey a desktop game gets over its own directory -- same routes, same
// manifest, same reader names. What a browser does *not* get for free is persistence across a
// reload, and this interface never claimed any: a survey is a reading of a directory now.
//
// Ownership: the survey handle is **OWNED** and released by `destroyContentSurvey`. The graphics
// device it is created against is **RETAINED_DEPENDENCY** -- CNA's content manager holds it -- so a
// caller destroys the survey before the device.

import { CnaContentSurveyBackendBase } from "../backend-base.js";
import type { ContentSurveyEntrySnapshot, ContentSurveyReaderUsageSnapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { outBool, withStringView } from "./marshal.js";
import { allocateStruct, type WasmRouteTable } from "./module.js";

export class WasmContentSurveyBackend extends CnaContentSurveyBackendBase {
  readonly #routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#routes = routes;
  }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's content survey`);
  }

  public override createContentSurvey(
    device: NativeHandle, rootDirectory: string,
  ): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_ContentManagerCreateInfo");
      const { pointer, byteLength } = scope.allocateUtf8(rootDirectory);
      // `root_directory` is a `CNA_StringView` *inside* the create-info rather than an argument,
      // so it is written as a nested structure rather than through `withStringView`.
      const root = info.nested("root_directory", "CNA_StringView");
      root.setPointer("data", pointer);
      root.setU64("byte_length", BigInt(byteLength));
      return this.#routes.outHandle("cna_content_manager_create", device, info.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override destroyContentSurvey(survey: NativeHandle): void {
    this.#routes.invoke("cna_content_manager_destroy", survey);
  }

  public override getContentSurveyRoot(survey: NativeHandle): string {
    return this.#routes.copyString(
      "cna_content_manager_get_root_directory_size",
      "cna_content_manager_copy_root_directory",
      survey,
    );
  }

  public override setContentSurveyRoot(survey: NativeHandle, rootDirectory: string): void {
    withStringView(this.#routes, rootDirectory, (view) =>
      this.#routes.invoke("cna_content_manager_set_root_directory", survey, view));
  }

  public override refreshContentSurvey(survey: NativeHandle): void {
    this.#routes.invoke("cna_content_manager_refresh_content_manifest", survey);
  }

  public override getContentSurveyEntryCount(survey: NativeHandle): number {
    return Number(this.#routes.outU64("cna_content_manager_get_manifest_entry_count", survey));
  }

  /** One surveyed asset: its relative path, what framings exist for it, and the readers it needs. */
  public override getContentSurveyEntry(
    survey: NativeHandle, index: number,
  ): ContentSurveyEntrySnapshot {
    const at = BigInt(Math.trunc(index));
    const scope = this.#routes.scope();
    try {
      const entry = allocateStruct(this.#routes.module, scope, "CNA_ContentManifestEntryInfo");
      this.#routes.invoke("cna_content_manager_get_manifest_entry", survey, at, entry.pointer);
      const extensionCount = Number(entry.getU64("native_extension_count"));
      const readerCount = Number(entry.getU64("xnb_reader_name_count"));
      return {
        AssetName: this.#routes.copyStringProbed(
          "cna_content_manager_copy_manifest_relative_path", survey, at,
        ),
        HasXnb: entry.getU8("has_xnb") !== 0,
        HasCnj: entry.getU8("has_cnj") !== 0,
        NativeExtensions: Array.from({ length: extensionCount }, (_, at2) =>
          this.#routes.copyStringProbed(
            "cna_content_manager_copy_manifest_native_extension", survey, at, BigInt(at2),
          )),
        XnbReaderNames: Array.from({ length: readerCount }, (_, at2) =>
          this.#routes.copyStringProbed(
            "cna_content_manager_copy_manifest_xnb_reader_name", survey, at, BigInt(at2),
          )),
      };
    } finally {
      scope.dispose();
    }
  }

  public override getContentSurveyReaderUsageCount(survey: NativeHandle): number {
    return Number(this.#routes.outU64("cna_content_manager_get_xnb_reader_usage_count", survey));
  }

  public override getContentSurveyReaderUsage(
    survey: NativeHandle, index: number,
  ): ContentSurveyReaderUsageSnapshot {
    const at = BigInt(Math.trunc(index));
    const scope = this.#routes.scope();
    try {
      const usage = allocateStruct(this.#routes.module, scope, "CNA_ContentReaderUsageInfo");
      this.#routes.invoke("cna_content_manager_get_xnb_reader_usage", survey, at, usage.pointer);
      return {
        ReaderName: this.#routes.copyStringProbed(
          "cna_content_manager_copy_xnb_reader_usage_name", survey, at,
        ),
        IsRegisteredWithCna: usage.getU8("is_registered") !== 0,
        FileCount: Number(usage.getU64("file_count")),
      };
    } finally {
      scope.dispose();
    }
  }

  /** Whether CNA itself has a reader for a canonical XNB type name. Process-global, not per survey. */
  public override isContentTypeReaderRegisteredWithCna(readerName: string): boolean {
    return withStringView(this.#routes, readerName, (view) =>
      outBool(this.#routes, "cna_content_type_reader_manager_get_is_registered", view));
  }
}
