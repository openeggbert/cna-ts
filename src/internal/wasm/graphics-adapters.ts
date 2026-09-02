// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaGraphicsAdapterBackend`: XNA's `GraphicsAdapter`, read through a
// live device.
//
// **This family was reported as reaching no CNA routes.** It reaches fifteen. The report came from
// matching a boundary method to a bridge export of the same name, and `getGraphicsAdapterCount`
// calls `graphicsAdapterCount`; the correction lives in `tools/wasm/backend-gap.mjs`.
//
// Every route takes a graphics-device handle rather than standing alone, because an adapter list is
// a property of a device a game created. That is CNA's shape and it is the honest one for a
// browser: what a page can see of its display is what its WebGL context can see.
//
// **Nothing here invents an adapter.** XNA's `GraphicsAdapter.Description` is a driver string and
// `DeviceName` is something like `\\.\DISPLAY1`; whatever CNA's Emscripten platform answers is what
// a consumer gets, including an empty string. Manufacturing a plausible Windows display name would
// make a page's adapter-matching logic take a branch that is a lie on that host. A renderer with no
// displays reports **no adapters**, and the browser suite asserts what it actually reports.
//
// Ownership: nothing is owned. Every route reads through the caller's device handle, and the
// monitor handle is a platform value CNA copies out rather than a handle to release.

import { CnaGraphicsAdapterBackendBase } from "../backend-base.js";
import type {
  DisplayModeSnapshot, GraphicsAdapterInfoSnapshot, GraphicsFormatSelectionSnapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { outBool } from "./marshal.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct, WasmStruct, type WasmRouteTable } from "./module.js";

export class WasmGraphicsAdapterBackend extends CnaGraphicsAdapterBackendBase {
  readonly #routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#routes = routes;
  }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's graphics adapters`);
  }

  public override getGraphicsAdapterCount(device: NativeHandle): number {
    return Number(this.#routes.outU64("cna_graphics_adapter_get_count", device));
  }

  public override refreshGraphicsAdapters(device: NativeHandle): void {
    this.#routes.invoke("cna_graphics_adapters_refresh", device);
  }

  /** One adapter's `CNA_GraphicsAdapterInfo`, plus the monitor handle that is not in it. */
  public override getGraphicsAdapterInfo(
    device: NativeHandle, index: number,
  ): GraphicsAdapterInfoSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = this.#info(scope, device, index);
      const monitor = scope.allocate(8);
      // A monitor handle CNA cannot supply is zero rather than an error, so the route's refusal is
      // taken as "there is no monitor handle here" and reported as zero.
      const answered = this.#routes.call(
        "cna_graphics_adapter_get_native_monitor_handle", device, Math.trunc(index), monitor,
      );
      return {
        AdapterIndex: info.getU32("adapter_index"),
        IsDefaultAdapter: info.getU8("is_default_adapter") !== 0,
        IsWideScreen: info.getU8("is_wide_screen") !== 0,
        UseNullDevice: info.getU8("use_null_device") !== 0,
        UseReferenceDevice: info.getU8("use_reference_device") !== 0,
        VendorId: info.getU32("vendor_id"),
        DeviceId: info.getU32("device_id"),
        Revision: info.getU32("revision"),
        SubSystemId: info.getU32("subsystem_id"),
        MonitorHandle: answered === 0 ? this.#routes.view().getBigUint64(monitor, true) : 0n,
      };
    } finally {
      scope.dispose();
    }
  }

  public override getGraphicsAdapterDescription(device: NativeHandle, index: number): string {
    return this.#adapterText(device, index, false);
  }

  public override getGraphicsAdapterDeviceName(device: NativeHandle, index: number): string {
    return this.#adapterText(device, index, true);
  }

  public override getGraphicsAdapterCurrentDisplayMode(
    device: NativeHandle, index: number,
  ): DisplayModeSnapshot {
    const scope = this.#routes.scope();
    try {
      const mode = allocateStruct(this.#routes.module, scope, "CNA_DisplayMode");
      this.#routes.invoke(
        "cna_graphics_adapter_get_current_display_mode", device, Math.trunc(index), mode.pointer,
      );
      return this.#displayMode(mode);
    } finally {
      scope.dispose();
    }
  }

  /**
   * Every display mode the adapter offers, unfiltered by format.
   *
   * The count and the copy take the same filter arguments, and both are given "do not filter" --
   * XNA's `SupportedDisplayModes` with no format is the whole list, and filtering it here would
   * silently answer a different question.
   */
  public override getGraphicsAdapterDisplayModes(
    device: NativeHandle, index: number,
  ): readonly DisplayModeSnapshot[] {
    const at = Math.trunc(index);
    const count = Number(this.#routes.outU64(
      "cna_graphics_adapter_get_display_mode_count", device, at, 0, 0,
    ));
    if (count === 0) return [];
    const scope = this.#routes.scope();
    try {
      const layout = WASM_STRUCT_LAYOUTS.CNA_DisplayMode;
      const buffer = scope.allocate(layout.size * count);
      for (let entry = 0; entry < count; entry += 1) {
        const mode = new WasmStruct(
          this.#routes.module, "CNA_DisplayMode", buffer + layout.size * entry,
        );
        mode.setU32("struct_size", layout.size).setU32("struct_version", 1);
      }
      const written = scope.allocate(8);
      this.#routes.invoke(
        "cna_graphics_adapter_copy_display_modes",
        device, at, 0, 0, buffer, BigInt(count), written,
      );
      const produced = Number(this.#routes.view().getBigUint64(written, true));
      return Array.from({ length: produced }, (_, entry) => this.#displayMode(
        new WasmStruct(this.#routes.module, "CNA_DisplayMode", buffer + layout.size * entry)));
    } finally {
      scope.dispose();
    }
  }

  public override isGraphicsAdapterProfileSupported(
    device: NativeHandle, index: number, profile: number,
  ): boolean {
    return outBool(
      this.#routes, "cna_graphics_adapter_is_profile_supported",
      device, Math.trunc(index), Math.trunc(profile),
    );
  }

  public override queryGraphicsAdapterBackBufferFormat(
    device: NativeHandle, index: number, profile: number, format: number, depthFormat: number,
    multiSampleCount: number,
  ): GraphicsFormatSelectionSnapshot {
    return this.#selection(
      "cna_graphics_adapter_query_backbuffer_format",
      device, index, profile, format, depthFormat, multiSampleCount,
    );
  }

  public override queryGraphicsAdapterRenderTargetFormat(
    device: NativeHandle, index: number, profile: number, format: number, depthFormat: number,
    multiSampleCount: number,
  ): GraphicsFormatSelectionSnapshot {
    return this.#selection(
      "cna_graphics_adapter_query_render_target_format",
      device, index, profile, format, depthFormat, multiSampleCount,
    );
  }

  public override setGraphicsAdapterDevicePreferences(
    device: NativeHandle, index: number, useNullDevice: boolean, useReferenceDevice: boolean,
  ): void {
    this.#routes.invoke(
      "cna_graphics_adapter_set_device_preferences",
      device, Math.trunc(index), useNullDevice ? 1 : 0, useReferenceDevice ? 1 : 0,
    );
  }

  /** A `CNA_GraphicsAdapterInfo` for one adapter, which is where both string lengths live. */
  #info(
    scope: ReturnType<WasmRouteTable["scope"]>, device: NativeHandle, index: number,
  ): WasmStruct {
    const info = allocateStruct(this.#routes.module, scope, "CNA_GraphicsAdapterInfo");
    this.#routes.invoke("cna_graphics_adapter_get_info", device, Math.trunc(index), info.pointer);
    return info;
  }

  /**
   * The description or the device name, both of which are `CNA_GraphicsAdapterInfo` fields.
   *
   * There is no size route for either: the length is a *field of the info structure*, so the info
   * is read first and the copy asked for exactly that many bytes. Both field names are literals
   * rather than an argument, so the structure-field gate checks them. An empty string is an
   * ordinary answer and means CNA's platform has no such name, which a browser's often does not.
   */
  #adapterText(device: NativeHandle, index: number, deviceName: boolean): string {
    const copyRoute = deviceName
      ? "cna_graphics_adapter_copy_device_name"
      : "cna_graphics_adapter_copy_description";
    const scope = this.#routes.scope();
    try {
      const info = this.#info(scope, device, index);
      const byteLength = Number(deviceName
        ? info.getU64("device_name_byte_length")
        : info.getU64("description_byte_length"));
      if (byteLength === 0) return "";
      const buffer = scope.allocate(byteLength);
      const written = scope.allocate(8);
      this.#routes.invoke(
        copyRoute, device, Math.trunc(index), buffer, BigInt(byteLength), written,
      );
      const produced = Number(this.#routes.view().getBigUint64(written, true));
      return new TextDecoder().decode(
        this.#routes.module.HEAPU8.subarray(buffer, buffer + produced));
    } finally {
      scope.dispose();
    }
  }

  /** Reads one `CNA_DisplayMode` a route has written. */
  #displayMode(mode: WasmStruct): DisplayModeSnapshot {
    return {
      Width: mode.getI32("width"),
      Height: mode.getI32("height"),
      AspectRatio: mode.getF32("aspect_ratio"),
      Format: mode.getU32("format"),
    };
  }

  /** Reads a `CNA_GraphicsFormatSelection`, which both query routes answer with. */
  #selection(
    route: string, device: NativeHandle, index: number, profile: number, format: number,
    depthFormat: number, multiSampleCount: number,
  ): GraphicsFormatSelectionSnapshot {
    const scope = this.#routes.scope();
    try {
      const selection = allocateStruct(
        this.#routes.module, scope, "CNA_GraphicsFormatSelection",
      );
      this.#routes.invoke(
        route, device, Math.trunc(index), Math.trunc(profile), Math.trunc(format),
        Math.trunc(depthFormat), Math.trunc(multiSampleCount), selection.pointer,
      );
      return {
        IsExactMatch: selection.getU8("exact_match") !== 0,
        SelectedFormat: selection.getU32("format"),
        SelectedDepthFormat: selection.getU32("depth_format"),
        SelectedMultiSampleCount: selection.getI32("multi_sample_count"),
      };
    } finally {
      scope.dispose();
    }
  }
}
