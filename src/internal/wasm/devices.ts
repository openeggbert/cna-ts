// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaDeviceBackend`: CNA's extended device layer -- the host itself,
// its locales, its clipboard and its cameras.
//
// **This family was recorded as CNA-blocked, and it was not.** 27 of its 29 routes answered
// `NOT_SUPPORTED` on both WebAssembly artifacts, which reads as "CNA cannot do this in a browser".
// The actual cause was a build option in *this repository's own artifact recipe*:
// `CNA_DEVICES` defaults `OFF`, and neither wasm build set it. The strong artifact is now built
// `CNA_DEVICES=ON` and every one of those routes reaches validation. A blocker that turns out to be
// a flag we chose was never an external blocker at all.
//
// The two artifacts therefore differ in a second way, deliberately, and both branches are
// exercised: the **default** artifact answers `NOT_SUPPORTED` and
// {@link isDeviceExtensionLayerAvailable} says `false`; the **strong** one answers `true` and the
// rest of the family works. That is the same shape the compiled-effect capability already has, and
// it is why this interface asks about availability first rather than reading a refusal as a device
// that is missing.
//
// **The camera is synthetic, and says so.** Headless Chromium has no camera, and CNA offers
// `cna_camera_create_with_test_backend_ext` for exactly that: a camera whose state and frame a test
// sets. Evidence from it is `SYNTHETIC_BACKEND_VERIFIED`. `createCamera` opens the platform's real
// default camera and succeeds even where there is none, which is CNA's documented behaviour and not
// something this file smooths over.
//
// Ownership: a camera is **OWNED** and released by `destroyCamera`. `tryAcquireCameraFrame` writes
// into a caller's texture rather than handing one back, so no frame handle exists to get wrong.

import { CnaDeviceBackendBase } from "../backend-base.js";
import type {
  CameraInventorySnapshot, HostDeviceSnapshot, PreferredLocaleSnapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { outBool, outF32, outI32, withStringView } from "./marshal.js";
import { allocateStruct, type WasmRouteTable } from "./module.js";

export class WasmDeviceBackend extends CnaDeviceBackendBase {
  readonly #routes: WasmRouteTable;
  readonly #game: () => NativeHandle;

  public constructor(routes: WasmRouteTable, game: () => NativeHandle) {
    super();
    this.#routes = routes;
    this.#game = game;
  }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's device layer`);
  }

  /** Whether this artifact was built with the device layer. Asked before anything else here. */
  public override isDeviceExtensionLayerAvailable(): boolean {
    return outBool(this.#routes, "cna_devices_ext_is_available");
  }

  /** The host: cores, memory, power and the display's scale and safe area. */
  public override getHostDeviceInfo(): HostDeviceSnapshot {
    const scope = this.#routes.scope();
    try {
      const area = allocateStruct(this.#routes.module, scope, "CNA_Rectangle", false);
      this.#routes.invoke("cna_display_info_get_safe_area_ext", this.#game(), area.pointer);
      return {
        LogicalCpuCoreCount:
          outI32(this.#routes, "cna_system_info_get_logical_cpu_core_count_ext", this.#game()),
        SystemRamMegabytes:
          outI32(this.#routes, "cna_system_info_get_system_ram_megabytes_ext", this.#game()),
        PowerState: this.#routes.outU32("cna_power_get_state_ext", this.#game()),
        BatteryPercent: outI32(this.#routes, "cna_power_get_battery_percent_ext", this.#game()),
        SecondsRemaining:
          outI32(this.#routes, "cna_power_get_seconds_remaining_ext", this.#game()),
        ContentScale: outF32(this.#routes, "cna_display_info_get_content_scale_ext", this.#game()),
        SafeArea: {
          X: area.getI32("x"),
          Y: area.getI32("y"),
          Width: area.getI32("width"),
          Height: area.getI32("height"),
        },
      };
    } finally {
      scope.dispose();
    }
  }

  public override getPreferredLocales(): readonly PreferredLocaleSnapshot[] {
    const count = Number(this.#routes.outU64("cna_locale_get_preferred_count_ext", this.#game()));
    return Array.from({ length: count }, (_, index) => ({
      Language: this.#routes.copyString(
        "cna_locale_get_language_size_at_ext", "cna_locale_copy_language_at_ext",
        this.#game(), BigInt(index),
      ),
      Country: this.#routes.copyString(
        "cna_locale_get_country_size_at_ext", "cna_locale_copy_country_at_ext",
        this.#game(), BigInt(index),
      ),
    }));
  }

  /**
   * The device layer's clipboard write, which answers whether the platform *accepted* it.
   *
   * `CnaInputDeviceInventoryBackend.setClipboardTextUngated` reaches a different route in the
   * canonical layer and cannot report acceptance; both exist because the two answers are
   * different, and collapsing them would tell a caller their text was on the clipboard.
   */
  public override setClipboardText(text: string): boolean {
    return withStringView(this.#routes, text, (view) =>
      outBool(this.#routes, "cna_devices_clipboard_set_text_ext", this.#game(), view));
  }

  /** Whether the platform has cameras at all, and which ones. */
  public override getCameras(): CameraInventorySnapshot {
    const supported = outBool(this.#routes, "cna_camera_get_is_supported_ext", this.#game());
    const count = Number(this.#routes.outU64("cna_camera_get_count_ext", this.#game()));
    const scope = this.#routes.scope();
    try {
      const devices = Array.from({ length: count }, (_, index) => {
        const info = allocateStruct(this.#routes.module, scope, "CNA_CameraDeviceInfo", false);
        this.#routes.invoke("cna_camera_device_info_init", info.pointer);
        this.#routes.invoke(
          "cna_camera_get_info_at_ext", this.#game(), BigInt(index), info.pointer,
        );
        return {
          Name: this.#routes.copyString(
            "cna_camera_get_name_size_at_ext", "cna_camera_copy_name_at_ext",
            this.#game(), BigInt(index),
          ),
          Position: info.getU32("position"),
        };
      });
      return { IsSupported: supported, Devices: devices };
    } finally {
      scope.dispose();
    }
  }

  public override createCamera(): NativeHandle {
    return this.#routes.outHandle("cna_camera_create", this.#game());
  }

  public override createTestCamera(): NativeHandle {
    return this.#routes.outHandle("cna_camera_create_with_test_backend_ext", this.#game());
  }

  public override getCameraState(camera: NativeHandle): number {
    return this.#routes.outU32("cna_camera_get_state_ext", camera);
  }

  public override getCameraFrameWidth(camera: NativeHandle): number {
    return outI32(this.#routes, "cna_camera_get_frame_width_ext", camera);
  }

  public override getCameraFrameHeight(camera: NativeHandle): number {
    return outI32(this.#routes, "cna_camera_get_frame_height_ext", camera);
  }

  public override tryAcquireCameraFrame(
    camera: NativeHandle, texture: NativeHandle,
  ): boolean {
    return outBool(this.#routes, "cna_camera_try_acquire_frame_ext", camera, texture);
  }

  public override setTestCameraState(camera: NativeHandle, state: number): void {
    this.#routes.invoke("cna_camera_set_test_state_ext", camera, Math.trunc(state));
  }

  /**
   * The test backend's frame: a width, a height and RGBA pixels.
   *
   * `null` pixels clears the frame, which is a different request from an empty array, so the
   * pointer is genuinely null rather than a zero-length allocation CNA would read as one pixel.
   */
  public override setTestCameraFrame(
    camera: NativeHandle, width: number, height: number, pixels: Uint8Array | null,
  ): void {
    const scope = this.#routes.scope();
    try {
      const stride = WASM_STRUCT_LAYOUTS.CNA_Color.size;
      const count = pixels === null ? 0 : Math.floor(pixels.byteLength / stride);
      const buffer = pixels === null || count === 0 ? 0 : scope.allocateBytes(pixels);
      this.#routes.invoke(
        "cna_camera_set_test_frame_ext",
        camera, Math.trunc(width), Math.trunc(height), buffer, BigInt(count),
      );
    } finally {
      scope.dispose();
    }
  }

  public override destroyCamera(camera: NativeHandle): void {
    this.#routes.invoke("cna_camera_destroy", camera);
  }
}
