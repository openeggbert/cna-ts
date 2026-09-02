// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaStorageBackend`: XNA's `StorageDevice` and `StorageContainer` over
// the module's own filesystem.
//
// **The browser filesystem is not the desktop filesystem, and this file does not pretend it is.**
// Emscripten gives the module a real POSIX filesystem, so every route here does exactly what it
// does on a desktop -- create a directory, list files by pattern, read a file's bytes back. What it
// does *not* give is persistence: MEMFS lives in the page's memory and a reload starts empty. That
// is a property of how the host page mounts its filesystem rather than of this binding, and the two
// are recorded separately in `docs/runtime-capabilities.md`: in-session storage behaviour is
// verified, persistence across a reload is not claimed at all.
//
// A page that wants persistence mounts IDBFS at CNA's storage root and calls `FS.syncfs`, which is
// ordinary Emscripten and needs nothing from this file. Nothing here mounts anything: choosing a
// page's storage policy is not a binding's business.
//
// **No browser filesystem object crosses this boundary.** The public types are XNA's, the handles
// are CNA's, and `FS` is not reachable from either.
//
// Ownership: a device handle is **OWNED** and released by `destroyStorageDevice`; a container is
// **OWNED** and released by `destroyStorageContainer`. A stream is opened and closed inside one
// call and never escapes, which is what lets `openStorageFile` return bytes rather than a handle a
// caller would have to remember to close.

import { CnaStorageBackendBase } from "../backend-base.js";
import type { StorageDeviceSnapshot } from "../backend.js";
import type { NativeHandle, NativeResourceLifetime } from "../ownership.js";
import { outBool, outI64, withStringView } from "./marshal.js";
import { type WasmRouteTable } from "./module.js";

/** `CNA_FILE_ACCESS_WRITE`, the one access mode whose stream has nothing to read back. */
const CNA_FILE_ACCESS_WRITE = 2;

export class WasmStorageBackend extends CnaStorageBackendBase {
  readonly #routes: WasmRouteTable;
  readonly #parent: () => NativeResourceLifetime;

  public constructor(routes: WasmRouteTable, parent: () => NativeResourceLifetime) {
    super();
    this.#routes = routes;
    this.#parent = parent;
  }

  /**
   * Storage is a child of the running game, as audio is: a page that ends its game releases its
   * containers deterministically rather than leaving CNA holding them.
   */
  public override get ParentLifetime(): NativeResourceLifetime { return this.#parent(); }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's storage family`);
  }

  /**
   * XNA's `BeginShowSelector`, which on every CNA platform completes immediately.
   *
   * Four routes rather than one because XNA has four overloads and CNA reproduces the distinction:
   * a player index and a space requirement are separate optional halves, and passing zero for an
   * absent one would be a request for player one or for no space rather than for neither.
   * The completion callback is null: CNA calls it before returning, and a callback that can only
   * fire synchronously tells a caller nothing the return value has not already told them.
   */
  public override selectStorageDevice(
    player: number | null, sizeInBytes: number | null, directoryCount: number | null,
  ): NativeHandle {
    const wantsSpace = sizeInBytes !== null || directoryCount !== null;
    const size = Math.trunc(sizeInBytes ?? 0);
    const directories = Math.trunc(directoryCount ?? 0);
    if (player !== null && wantsSpace) {
      return this.#routes.outHandle(
        "cna_storage_device_show_selector_for_player_with_space",
        Math.trunc(player), size, directories, 0, 0,
      );
    }
    if (player !== null) {
      return this.#routes.outHandle(
        "cna_storage_device_show_selector_for_player", Math.trunc(player), 0, 0,
      );
    }
    if (wantsSpace) {
      return this.#routes.outHandle(
        "cna_storage_device_show_selector_with_space", size, directories, 0, 0,
      );
    }
    return this.#routes.outHandle("cna_storage_device_show_selector", 0, 0);
  }

  public override destroyStorageDevice(device: NativeHandle): void {
    this.#routes.invoke("cna_storage_device_destroy", device);
  }

  public override getStorageDeviceInfo(device: NativeHandle): StorageDeviceSnapshot {
    return {
      IsConnected: outBool(this.#routes, "cna_storage_device_get_is_connected", device),
      FreeSpace: outI64(this.#routes, "cna_storage_device_get_free_space", device),
      TotalSpace: outI64(this.#routes, "cna_storage_device_get_total_space", device),
    };
  }

  public override deleteStorageContainer(device: NativeHandle, name: string): void {
    withStringView(this.#routes, name, (view) =>
      this.#routes.invoke("cna_storage_device_delete_container", device, view));
  }

  public override openStorageContainer(device: NativeHandle, name: string): NativeHandle {
    return withStringView(this.#routes, name, (view) =>
      this.#routes.outHandle("cna_storage_container_open", device, view, 0, 0));
  }

  public override destroyStorageContainer(container: NativeHandle): void {
    this.#routes.invoke("cna_storage_container_destroy", container);
  }

  public override getStorageContainerDisplayName(container: NativeHandle): string {
    return this.#routes.copyString(
      "cna_storage_container_get_display_name_size",
      "cna_storage_container_copy_display_name",
      container,
    );
  }

  public override createStorageDirectory(container: NativeHandle, path: string): void {
    withStringView(this.#routes, path, (view) =>
      this.#routes.invoke("cna_storage_container_create_directory", container, view));
  }

  public override storageDirectoryExists(container: NativeHandle, path: string): boolean {
    return withStringView(this.#routes, path, (view) =>
      outBool(this.#routes, "cna_storage_container_directory_exists", container, view));
  }

  public override deleteStorageDirectory(container: NativeHandle, path: string): void {
    withStringView(this.#routes, path, (view) =>
      this.#routes.invoke("cna_storage_container_delete_directory", container, view));
  }

  public override getStorageDirectoryNames(
    container: NativeHandle, pattern: string,
  ): readonly string[] {
    return this.#names(
      container, pattern,
      "cna_storage_container_get_directory_name_count",
      "cna_storage_container_copy_directory_name",
    );
  }

  /**
   * Creates an empty file, which is one route and a close.
   *
   * CNA hands back a stream; nothing is written to it and it is closed before returning, because
   * the public `StorageContainer.CreateFile` answers with an empty array rather than a writer.
   */
  public override createStorageFile(container: NativeHandle, path: string): void {
    const stream = withStringView(this.#routes, path, (view) =>
      this.#routes.outHandle("cna_storage_container_create_file", container, view));
    this.#routes.invoke("cna_storage_stream_close", stream);
  }

  public override storageFileExists(container: NativeHandle, path: string): boolean {
    return withStringView(this.#routes, path, (view) =>
      outBool(this.#routes, "cna_storage_container_file_exists", container, view));
  }

  public override deleteStorageFile(container: NativeHandle, path: string): void {
    withStringView(this.#routes, path, (view) =>
      this.#routes.invoke("cna_storage_container_delete_file", container, view));
  }

  public override getStorageFileNames(
    container: NativeHandle, pattern: string,
  ): readonly string[] {
    return this.#names(
      container, pattern,
      "cna_storage_container_get_file_name_count",
      "cna_storage_container_copy_file_name",
    );
  }

  /**
   * Opens a file with XNA's mode, access and share, reads it whole, and closes it.
   *
   * The stream never escapes: the boundary answers with bytes, so a caller cannot hold an open
   * file they forget to close. A write-only access has nothing to read back and answers empty --
   * CNA would refuse the read, and refusing an operation the caller explicitly asked for as
   * write-only would be this binding inventing a failure.
   */
  public override openStorageFile(
    container: NativeHandle, path: string, mode: number, access: number, share: number,
  ): Uint8Array {
    const stream = withStringView(this.#routes, path, (view) => this.#routes.outHandle(
      "cna_storage_container_open_file_share",
      container, view, Math.trunc(mode), Math.trunc(access), Math.trunc(share),
    ));
    try {
      const length = Number(outI64(this.#routes, "cna_storage_stream_get_length", stream));
      if (length <= 0 || Math.trunc(access) === CNA_FILE_ACCESS_WRITE) return new Uint8Array();
      const scope = this.#routes.scope();
      try {
        const buffer = scope.allocate(length);
        const read = scope.allocate(8);
        this.#routes.invoke("cna_storage_stream_read", stream, buffer, BigInt(length), read);
        const count = Number(this.#routes.view().getBigUint64(read, true));
        // Copied out of module memory: a view into `HEAPU8` is invalidated by the next allocation.
        return new Uint8Array(this.#routes.module.HEAPU8.subarray(buffer, buffer + count));
      } finally {
        scope.dispose();
      }
    } finally {
      this.#routes.call("cna_storage_stream_close", stream);
    }
  }

  /** A count/copy pair whose every call carries the same search pattern. */
  #names(
    container: NativeHandle, pattern: string, countRoute: string, copyRoute: string,
  ): readonly string[] {
    return withStringView(this.#routes, pattern, (view) => {
      const count = Number(this.#routes.outU64(countRoute, container, view));
      return Array.from({ length: count }, (_, index) =>
        this.#routes.copyStringProbed(copyRoute, container, view, BigInt(index)));
    });
  }
}
